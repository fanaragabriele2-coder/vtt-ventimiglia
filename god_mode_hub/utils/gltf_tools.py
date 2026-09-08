"""Lettura, scrittura e animazione procedurale dei file ``.glb`` (glTF 2.0).

TripoSR e TRELLIS producono **mesh statiche**: nessuno scheletro, nessuna
animazione. Per farle muovere ci sono due strade diverse, che questo progetto
tiene separate perché hanno costi diversissimi:

* **animazione a livello di nodo** (qui): far ruotare, fluttuare o pulsare
  l'intero modello. Non serve uno scheletro, si scrive direttamente nel glTF
  e copre i casi più frequenti in un VTT — un forziere che ruota, un token che
  fluttua, un'aura che pulsa. Python puro, nessuna dipendenza;
* **rigging scheletrico** (``utils/rigging.py``): ossa, pesi e cicli di
  camminata. Richiede Blender installato.

Formato GLB: header di 12 byte (magic ``glTF``, versione, lunghezza totale),
poi una sequenza di chunk ``[lunghezza][tipo][dati]`` allineati a 4 byte — il
chunk JSON con la scena e quello binario con i dati dei vertici.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field
from typing import Any

GLB_MAGIC = 0x46546C67  # "glTF" little-endian
GLB_VERSION = 2
CHUNK_JSON = 0x4E4F534A  # "JSON"
CHUNK_BIN = 0x004E4942   # "BIN\0"

#: Tipi di componente glTF usati qui.
COMPONENT_FLOAT = 5126

#: Numero di fotogrammi chiave generati per un ciclo di animazione. 33 punti
#: (32 intervalli + la chiusura sul primo valore) danno una rotazione fluida
#: senza gonfiare il file.
KEYFRAMES = 33


class GLTFError(RuntimeError):
    """File .glb non valido o non gestibile."""


@dataclass
class GLBInfo:
    """Sintesi leggibile del contenuto di un ``.glb``."""

    meshes: int = 0
    nodes: int = 0
    materials: int = 0
    animations: list[str] = field(default_factory=list)
    has_skeleton: bool = False
    vertex_count: int = 0
    size_bytes: int = 0

    @property
    def is_animated(self) -> bool:
        return bool(self.animations)


# ---------------------------------------------------------------------------
# Contenitore GLB
# ---------------------------------------------------------------------------

def parse_glb(data: bytes) -> tuple[dict[str, Any], bytes]:
    """Estrae il JSON della scena e il buffer binario da un ``.glb``.

    Returns:
        ``(gltf_json, binario)``; il binario è vuoto se il file non ha chunk BIN.

    Raises:
        GLTFError: file troppo corto, magic sbagliato o versione non supportata.
    """
    if len(data) < 12:
        raise GLTFError("File troppo corto per essere un .glb.")
    magic, version, _length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC:
        raise GLTFError("Non è un file .glb (magic 'glTF' assente).")
    if version != GLB_VERSION:
        raise GLTFError(f"Versione GLB non supportata: {version} (attesa 2).")

    gltf: dict[str, Any] | None = None
    binario = b""
    offset = 12
    while offset + 8 <= len(data):
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        inizio = offset + 8
        fine = inizio + chunk_len
        if fine > len(data):
            raise GLTFError("Chunk GLB troncato: file corrotto o incompleto.")
        blocco = data[inizio:fine]
        if chunk_type == CHUNK_JSON:
            try:
                gltf = json.loads(blocco.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise GLTFError(f"Chunk JSON illeggibile: {exc}") from exc
        elif chunk_type == CHUNK_BIN:
            binario = blocco
        offset = fine + (-fine % 4)  # i chunk sono allineati a 4 byte

    if gltf is None:
        raise GLTFError("Nessun chunk JSON trovato nel .glb.")
    return gltf, binario


def build_glb(gltf: dict[str, Any], binario: bytes = b"") -> bytes:
    """Riassembla un ``.glb`` da JSON e buffer binario, con il padding richiesto."""
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * (-len(json_bytes) % 4)  # padding con spazi (da spec)
    pezzi = [struct.pack("<II", len(json_bytes), CHUNK_JSON), json_bytes]
    if binario:
        bin_padded = binario + b"\x00" * (-len(binario) % 4)  # padding con zeri
        pezzi.append(struct.pack("<II", len(bin_padded), CHUNK_BIN))
        pezzi.append(bin_padded)
    corpo = b"".join(pezzi)
    return struct.pack("<III", GLB_MAGIC, GLB_VERSION, 12 + len(corpo)) + corpo


def inspect_glb(data: bytes) -> GLBInfo:
    """Sintesi del contenuto di un ``.glb`` (per mostrarla nell'interfaccia)."""
    gltf, _ = parse_glb(data)
    accessori = gltf.get("accessors", [])
    vertici = 0
    for mesh in gltf.get("meshes", []):
        for primitiva in mesh.get("primitives", []):
            idx = primitiva.get("attributes", {}).get("POSITION")
            if idx is not None and idx < len(accessori):
                vertici += int(accessori[idx].get("count", 0))
    return GLBInfo(
        meshes=len(gltf.get("meshes", [])),
        nodes=len(gltf.get("nodes", [])),
        materials=len(gltf.get("materials", [])),
        animations=[a.get("name", f"animazione_{i}")
                    for i, a in enumerate(gltf.get("animations", []))],
        has_skeleton=bool(gltf.get("skins")),
        vertex_count=vertici,
        size_bytes=len(data),
    )


# ---------------------------------------------------------------------------
# Aggiunta di dati al buffer
# ---------------------------------------------------------------------------

def _append_accessor(
    gltf: dict[str, Any],
    binario: bytearray,
    valori: list[float],
    tipo: str,
    componenti: int,
    minimo: list[float] | None = None,
    massimo: list[float] | None = None,
) -> int:
    """Scrive dei float nel buffer e crea bufferView + accessor.

    Returns:
        Indice del nuovo accessor.
    """
    binario.extend(b"\x00" * (-len(binario) % 4))  # allineamento richiesto
    offset = len(binario)
    binario.extend(struct.pack(f"<{len(valori)}f", *valori))

    gltf.setdefault("bufferViews", []).append(
        {"buffer": 0, "byteOffset": offset, "byteLength": len(valori) * 4}
    )
    accessor: dict[str, Any] = {
        "bufferView": len(gltf["bufferViews"]) - 1,
        "componentType": COMPONENT_FLOAT,
        "count": len(valori) // componenti,
        "type": tipo,
    }
    if minimo is not None:
        accessor["min"] = minimo
    if massimo is not None:
        accessor["max"] = massimo
    gltf.setdefault("accessors", []).append(accessor)
    return len(gltf["accessors"]) - 1


def _target_node(gltf: dict[str, Any]) -> int:
    """Nodo da animare: la radice della scena, così si muove tutto il modello.

    Raises:
        GLTFError: se il file non contiene nodi.
    """
    nodi = gltf.get("nodes", [])
    if not nodi:
        raise GLTFError("Il modello non contiene nodi: niente da animare.")
    scena_idx = gltf.get("scene", 0)
    scene = gltf.get("scenes", [])
    if scene and scena_idx < len(scene):
        radici = scene[scena_idx].get("nodes", [])
        if radici:
            return int(radici[0])
    return 0


def _add_animation(
    gltf: dict[str, Any],
    binario: bytearray,
    nome: str,
    percorso: str,
    tempi: list[float],
    valori: list[float],
    componenti: int,
    tipo: str,
) -> None:
    """Aggiunge un canale di animazione sul nodo radice."""
    input_idx = _append_accessor(
        gltf, binario, tempi, "SCALAR", 1, minimo=[min(tempi)], massimo=[max(tempi)]
    )
    output_idx = _append_accessor(gltf, binario, valori, tipo, componenti)
    gltf.setdefault("animations", []).append(
        {
            "name": nome,
            "samplers": [
                {"input": input_idx, "output": output_idx, "interpolation": "LINEAR"}
            ],
            "channels": [
                {"sampler": 0, "target": {"node": _target_node(gltf), "path": percorso}}
            ],
        }
    )
    # Un buffer senza URI (dati nel chunk BIN) deve dichiarare la lunghezza reale.
    buffers = gltf.setdefault("buffers", [{}])
    buffers[0]["byteLength"] = len(binario) + (-len(binario) % 4)


# ---------------------------------------------------------------------------
# Animazioni procedurali
# ---------------------------------------------------------------------------

def add_spin(data: bytes, duration: float = 4.0, name: str = "rotazione") -> bytes:
    """Rotazione continua attorno all'asse verticale (Y).

    Utile per oggetti e bottino: un forziere o una gemma che ruota sul posto.

    Args:
        duration: secondi per un giro completo.
    """
    import math

    gltf, binario = parse_glb(data)
    buffer = bytearray(binario)
    tempi: list[float] = []
    quaternioni: list[float] = []
    for i in range(KEYFRAMES):
        frazione = i / (KEYFRAMES - 1)
        tempi.append(frazione * duration)
        angolo = frazione * 2 * math.pi
        # Quaternione (x, y, z, w) per una rotazione di `angolo` attorno a Y.
        quaternioni.extend([0.0, math.sin(angolo / 2), 0.0, math.cos(angolo / 2)])
    _add_animation(gltf, buffer, name, "rotation", tempi, quaternioni, 4, "VEC4")
    return build_glb(gltf, bytes(buffer))


def add_float(
    data: bytes,
    amplitude: float = 0.1,
    duration: float = 3.0,
    name: str = "fluttuazione",
) -> bytes:
    """Oscillazione verticale dolce: il modello sembra levitare.

    Args:
        amplitude: escursione in unità del modello (0.1 ≈ un decimo dell'altezza
            tipica di un token).
        duration: secondi per un ciclo completo su e giù.
    """
    import math

    gltf, binario = parse_glb(data)
    buffer = bytearray(binario)
    nodo = gltf["nodes"][_target_node(gltf)]
    base = list(nodo.get("translation", [0.0, 0.0, 0.0]))

    tempi: list[float] = []
    posizioni: list[float] = []
    for i in range(KEYFRAMES):
        frazione = i / (KEYFRAMES - 1)
        tempi.append(frazione * duration)
        scarto = math.sin(frazione * 2 * math.pi) * amplitude
        posizioni.extend([base[0], base[1] + scarto, base[2]])
    _add_animation(gltf, buffer, name, "translation", tempi, posizioni, 3, "VEC3")
    return build_glb(gltf, bytes(buffer))


def add_pulse(
    data: bytes,
    amount: float = 0.08,
    duration: float = 2.0,
    name: str = "pulsazione",
) -> bytes:
    """Pulsazione di scala: adatta ad aure, effetti magici, evidenziazioni.

    Args:
        amount: variazione massima di scala (0.08 = ±8%).
    """
    import math

    gltf, binario = parse_glb(data)
    buffer = bytearray(binario)
    nodo = gltf["nodes"][_target_node(gltf)]
    base = list(nodo.get("scale", [1.0, 1.0, 1.0]))

    tempi: list[float] = []
    scale: list[float] = []
    for i in range(KEYFRAMES):
        frazione = i / (KEYFRAMES - 1)
        tempi.append(frazione * duration)
        fattore = 1.0 + math.sin(frazione * 2 * math.pi) * amount
        scale.extend([base[0] * fattore, base[1] * fattore, base[2] * fattore])
    _add_animation(gltf, buffer, name, "scale", tempi, scale, 3, "VEC3")
    return build_glb(gltf, bytes(buffer))


#: Animazioni disponibili nell'interfaccia: etichetta -> funzione.
PROCEDURAL_ANIMATIONS = {
    "Rotazione (oggetti, bottino)": add_spin,
    "Fluttuazione (token, spiriti)": add_float,
    "Pulsazione (aure, effetti)": add_pulse,
}


def remove_animations(data: bytes) -> bytes:
    """Rimuove le animazioni da un ``.glb`` lasciando intatta la geometria.

    Serve per ripartire da zero dopo una prova: riapplicare un'animazione su un
    modello che ne ha già una lascerebbe due canali sullo stesso nodo, con
    risultati imprevedibili nel visualizzatore.
    """
    gltf, binario = parse_glb(data)
    gltf.pop("animations", None)
    return build_glb(gltf, binario)


# ---------------------------------------------------------------------------
# Modello di prova (usato dai test e come esempio)
# ---------------------------------------------------------------------------

def make_test_cube() -> bytes:
    """Costruisce un ``.glb`` minimo ma valido: un triangolo con un nodo radice.

    Serve ai test per non dipendere da un modello generato da TripoSR (che
    richiede GPU) e come banco di prova rapido delle animazioni.
    """
    posizioni = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
    binario = struct.pack(f"<{len(posizioni)}f", *posizioni)
    gltf = {
        "asset": {"version": "2.0", "generator": "God-Mode Hub"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "radice"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "buffers": [{"byteLength": len(binario)}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(binario)}],
        "accessors": [
            {
                "bufferView": 0, "componentType": COMPONENT_FLOAT, "count": 3,
                "type": "VEC3", "min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 0.0],
            }
        ],
    }
    return build_glb(gltf, binario)
