"""Test del formato GLB e delle animazioni procedurali.

Il punto delicato: un parser che rilegge il proprio output non dimostra nulla.
Per questo, dove disponibile, i file prodotti vengono riletti con **pygltflib**
— una libreria glTF indipendente — così la validità è verificata da qualcosa
che non ho scritto io.
"""

from __future__ import annotations

import json
import math
import struct

import pytest

from utils import gltf_tools as g


def _pygltflib_o_salta():
    try:
        from pygltflib import GLTF2
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"pygltflib non disponibile: {type(exc).__name__}")
    return GLTF2


def _rileggi_indipendente(glb: bytes, tmp_path):
    """Rilegge il .glb con la libreria indipendente."""
    GLTF2 = _pygltflib_o_salta()
    percorso = tmp_path / "modello.glb"
    percorso.write_bytes(glb)
    return GLTF2().load(str(percorso))


# ---------------------------------------------------------------------------
# Contenitore GLB
# ---------------------------------------------------------------------------

def test_modello_di_prova_e_valido() -> None:
    glb = g.make_test_cube()
    gltf, binario = g.parse_glb(glb)
    assert gltf["asset"]["version"] == "2.0"
    assert len(gltf["nodes"]) == 1
    assert len(binario) == 36  # 9 float da 4 byte


def test_ciclo_lettura_scrittura_conserva_i_dati() -> None:
    originale = g.make_test_cube()
    gltf, binario = g.parse_glb(originale)
    riscritto = g.build_glb(gltf, binario)
    gltf2, binario2 = g.parse_glb(riscritto)
    assert gltf2 == gltf
    assert binario2 == binario


@pytest.mark.parametrize(
    "dati,messaggio",
    [
        (b"", "troppo corto"),
        (b"NONGLTF" + b"\x00" * 20, "magic"),
        (struct.pack("<III", g.GLB_MAGIC, 1, 12), "Versione"),
    ],
)
def test_file_non_validi_danno_errore_chiaro(dati: bytes, messaggio: str) -> None:
    with pytest.raises(g.GLTFError, match=messaggio):
        g.parse_glb(dati)


def test_chunk_troncato_rilevato() -> None:
    glb = bytearray(g.make_test_cube())
    troncato = bytes(glb[: len(glb) - 20])
    with pytest.raises(g.GLTFError, match="troncato|JSON"):
        g.parse_glb(troncato)


def test_allineamento_a_4_byte() -> None:
    """La spec richiede chunk allineati: un file non allineato viene rifiutato
    dai visualizzatori seri."""
    glb = g.add_spin(g.make_test_cube())
    assert len(glb) % 4 == 0
    offset = 12
    while offset + 8 <= len(glb):
        lunghezza, _tipo = struct.unpack_from("<II", glb, offset)
        assert lunghezza % 4 == 0, f"chunk non allineato a offset {offset}"
        offset += 8 + lunghezza


def test_lunghezza_dichiarata_corrisponde() -> None:
    glb = g.add_float(g.make_test_cube())
    _magic, _ver, lunghezza = struct.unpack_from("<III", glb, 0)
    assert lunghezza == len(glb)


# ---------------------------------------------------------------------------
# Ispezione
# ---------------------------------------------------------------------------

def test_ispezione_conta_correttamente() -> None:
    info = g.inspect_glb(g.make_test_cube())
    assert info.meshes == 1
    assert info.nodes == 1
    assert info.vertex_count == 3
    assert not info.is_animated
    assert not info.has_skeleton


def test_ispezione_rileva_animazione() -> None:
    info = g.inspect_glb(g.add_spin(g.make_test_cube(), name="giravolta"))
    assert info.is_animated
    assert info.animations == ["giravolta"]


# ---------------------------------------------------------------------------
# Animazioni procedurali
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "funzione,percorso,tipo",
    [
        (g.add_spin, "rotation", "VEC4"),
        (g.add_float, "translation", "VEC3"),
        (g.add_pulse, "scale", "VEC3"),
    ],
)
def test_animazione_ha_struttura_corretta(funzione, percorso: str, tipo: str) -> None:
    gltf, _ = g.parse_glb(funzione(g.make_test_cube()))
    animazione = gltf["animations"][0]
    canale = animazione["channels"][0]
    campionatore = animazione["samplers"][canale["sampler"]]

    assert canale["target"]["path"] == percorso
    assert gltf["accessors"][campionatore["output"]]["type"] == tipo
    assert gltf["accessors"][campionatore["input"]]["type"] == "SCALAR"
    assert gltf["accessors"][campionatore["input"]]["count"] == g.KEYFRAMES


def test_rotazione_produce_quaternioni_normalizzati() -> None:
    """Un quaternione non normalizzato deforma il modello mentre ruota."""
    glb = g.add_spin(g.make_test_cube())
    gltf, binario = g.parse_glb(glb)
    campionatore = gltf["animations"][0]["samplers"][0]
    accessor = gltf["accessors"][campionatore["output"]]
    vista = gltf["bufferViews"][accessor["bufferView"]]
    dati = binario[vista["byteOffset"]: vista["byteOffset"] + vista["byteLength"]]
    valori = struct.unpack(f"<{len(dati) // 4}f", dati)

    for i in range(0, len(valori), 4):
        x, y, z, w = valori[i:i + 4]
        assert abs(math.sqrt(x * x + y * y + z * z + w * w) - 1.0) < 1e-5


def test_rotazione_compie_un_giro_completo() -> None:
    """Primo e ultimo fotogramma devono coincidere, altrimenti il ciclo scatta."""
    gltf, binario = g.parse_glb(g.add_spin(g.make_test_cube()))
    accessor = gltf["accessors"][gltf["animations"][0]["samplers"][0]["output"]]
    vista = gltf["bufferViews"][accessor["bufferView"]]
    dati = binario[vista["byteOffset"]: vista["byteOffset"] + vista["byteLength"]]
    valori = struct.unpack(f"<{len(dati) // 4}f", dati)

    primo = valori[0:4]
    ultimo = valori[-4:]
    # quaternione: q e -q sono la stessa rotazione
    coincidono = all(abs(a - b) < 1e-4 for a, b in zip(primo, ultimo)) or \
                 all(abs(a + b) < 1e-4 for a, b in zip(primo, ultimo))
    assert coincidono, f"il ciclo non si chiude: {primo} vs {ultimo}"


def test_durata_rispettata() -> None:
    gltf, binario = g.parse_glb(g.add_float(g.make_test_cube(), duration=7.5))
    accessor = gltf["accessors"][gltf["animations"][0]["samplers"][0]["input"]]
    assert accessor["max"] == [7.5]
    assert accessor["min"] == [0.0]


def test_fluttuazione_rispetta_l_ampiezza() -> None:
    gltf, binario = g.parse_glb(g.add_float(g.make_test_cube(), amplitude=0.25))
    accessor = gltf["accessors"][gltf["animations"][0]["samplers"][0]["output"]]
    vista = gltf["bufferViews"][accessor["bufferView"]]
    dati = binario[vista["byteOffset"]: vista["byteOffset"] + vista["byteLength"]]
    valori = struct.unpack(f"<{len(dati) // 4}f", dati)
    altezze = valori[1::3]
    assert abs(max(altezze) - 0.25) < 1e-5
    assert abs(min(altezze) + 0.25) < 1e-5


def test_geometria_non_toccata_dall_animazione() -> None:
    """L'animazione aggiunge dati, non deve alterare i vertici esistenti."""
    base = g.make_test_cube()
    _, binario_prima = g.parse_glb(base)
    _, binario_dopo = g.parse_glb(g.add_spin(base))
    assert binario_dopo[: len(binario_prima)] == binario_prima


def test_rimozione_animazioni() -> None:
    pulito = g.remove_animations(g.add_spin(g.make_test_cube()))
    assert not g.inspect_glb(pulito).is_animated
    assert g.inspect_glb(pulito).vertex_count == 3


def test_modello_senza_nodi_da_errore_chiaro() -> None:
    gltf, binario = g.parse_glb(g.make_test_cube())
    gltf["nodes"] = []
    gltf["scenes"] = [{"nodes": []}]
    senza_nodi = g.build_glb(gltf, binario)
    with pytest.raises(g.GLTFError, match="nodi"):
        g.add_spin(senza_nodi)


# ---------------------------------------------------------------------------
# Validazione con libreria indipendente
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("funzione", list(g.PROCEDURAL_ANIMATIONS.values()))
def test_una_libreria_indipendente_rilegge_i_file(funzione, tmp_path) -> None:
    """Prova che i .glb prodotti siano validi per software che non ho scritto io."""
    modello = _rileggi_indipendente(funzione(g.make_test_cube()), tmp_path)

    assert len(modello.nodes) == 1
    assert len(modello.meshes) == 1
    assert len(modello.animations) == 1
    animazione = modello.animations[0]
    assert len(animazione.channels) == 1
    campionatore = animazione.samplers[animazione.channels[0].sampler]
    assert modello.accessors[campionatore.input].count == g.KEYFRAMES
    assert modello.accessors[campionatore.output].count == g.KEYFRAMES


def test_libreria_indipendente_legge_il_modello_base(tmp_path) -> None:
    modello = _rileggi_indipendente(g.make_test_cube(), tmp_path)
    assert modello.asset.version == "2.0"
    assert not modello.animations
