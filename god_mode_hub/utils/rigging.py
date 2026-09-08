"""Rigging scheletrico dei ``.glb`` tramite Blender in modalità headless.

Due livelli di animazione, con costi molto diversi:

* :mod:`utils.gltf_tools` — rotazione, fluttuazione, pulsazione dell'intero
  modello. Python puro, nessuna installazione, funziona sempre;
* **questo modulo** — ossa, pesi automatici e animazione idle. Richiede
  **Blender installato** (gratuito), che viene invocato in background su
  ``tools/blender_autorig.py``.

Blender può essere fornito in due modi, provati in quest'ordine:

1. **applicazione Blender** — cercata in ``BLENDER_PATH``, nel PATH e nelle
   cartelle d'installazione tipiche di Windows (dove Blender non si registra
   nel PATH, quindi ``shutil.which`` da solo non basta);
2. **modulo ``bpy``** installato con ``pip install bpy`` — stesso motore, senza
   installare l'applicazione. Lo script viene eseguito con l'interprete Python
   corrente invece che con l'eseguibile di Blender.

In entrambi i casi gira lo stesso ``tools/blender_autorig.py``, sempre in un
processo separato: ``bpy`` tiene stato globale e un crash non deve portarsi
dietro l'interfaccia dell'Hub.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from utils import HUB_ROOT

#: Script eseguito dentro Blender.
AUTORIG_SCRIPT = HUB_ROOT / "tools" / "blender_autorig.py"

#: Percorsi tipici di Blender su Windows (Blender non si aggiunge al PATH).
_WINDOWS_HINTS: tuple[str, ...] = (
    r"C:\Program Files\Blender Foundation",
    r"C:\Program Files (x86)\Blender Foundation",
)

DEFAULT_TIMEOUT = 600.0  # il rigging su mesh dense può richiedere minuti


class RiggingError(RuntimeError):
    """Errore nella pipeline di rigging."""


@dataclass(frozen=True)
class RiggingResult:
    """Esito di un'operazione di rigging."""

    ok: bool
    message: str
    glb: bytes = b""
    log_tail: str = ""


def find_blender() -> str | None:
    """Percorso dell'eseguibile Blender, o ``None`` se non installato.

    Ordine: variabile ``BLENDER_PATH``, poi PATH di sistema, poi le cartelle
    d'installazione tipiche di Windows (dove Blender **non** si registra nel
    PATH, quindi ``shutil.which`` da solo non basta).
    """
    esplicito = os.environ.get("BLENDER_PATH", "").strip()
    if esplicito:
        return esplicito if Path(esplicito).is_file() else None

    nel_path = shutil.which("blender")
    if nel_path:
        return nel_path

    for radice in _WINDOWS_HINTS:
        base = Path(radice)
        if not base.is_dir():
            continue
        # Cartelle tipo "Blender 4.2": prendiamo la versione più recente.
        for cartella in sorted(base.iterdir(), reverse=True):
            candidato = cartella / "blender.exe"
            if candidato.is_file():
                return str(candidato)
    return None


def bpy_available() -> bool:
    """True se il modulo ``bpy`` è importabile (``pip install bpy``).

    Il controllo avviene in un sottoprocesso: importare ``bpy`` nel processo
    dell'Hub inizializzerebbe l'intero motore di Blender in memoria a ogni
    rerun di Streamlit.
    """
    try:
        completato = subprocess.run(  # noqa: S603 — interprete corrente
            [sys.executable, "-c", "import bpy"],
            capture_output=True, timeout=120, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return completato.returncode == 0


def blender_backend() -> tuple[str, str]:
    """Come verrà eseguito il rigging.

    Returns:
        ``(tipo, dettaglio)`` dove tipo è ``"app"`` (eseguibile Blender),
        ``"bpy"`` (modulo pip) o ``""`` se nessuno dei due è disponibile.
    """
    eseguibile = find_blender()
    if eseguibile:
        return "app", eseguibile
    if bpy_available():
        return "bpy", sys.executable
    return "", ""


def blender_available() -> bool:
    """True se il rigging scheletrico è possibile, in un modo o nell'altro."""
    return blender_backend()[0] != ""


def blender_version(timeout: float = 120.0) -> str:
    """Versione di Blender in uso (stringa vuota se non determinabile)."""
    tipo, eseguibile = blender_backend()
    if tipo == "bpy":
        try:
            completato = subprocess.run(  # noqa: S603 — interprete corrente
                [eseguibile, "-c", "import bpy; print('Blender ' + bpy.app.version_string + ' (modulo bpy)')"],
                capture_output=True, text=True, timeout=timeout, check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return ""
        return (completato.stdout or "").strip()
    if not tipo:
        return ""
    try:
        completato = subprocess.run(  # noqa: S603 — percorso risolto da find_blender
            [eseguibile, "--version"], capture_output=True, text=True,
            timeout=timeout, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    prima_riga = (completato.stdout or "").strip().splitlines()
    return prima_riga[0].strip() if prima_riga else ""


def autorig_glb(
    glb_bytes: bytes,
    animation: str = "idle",
    frames: int = 60,
    timeout: float = DEFAULT_TIMEOUT,
) -> RiggingResult:
    """Crea scheletro e pesi per un modello, e ne restituisce il ``.glb`` riggato.

    Args:
        glb_bytes: modello statico (es. output di TripoSR).
        animation: ``"idle"`` per l'animazione di respiro, ``"none"`` per il
            solo scheletro (da animare poi a mano in Blender).
        frames: durata in fotogrammi del ciclo idle.

    Returns:
        :class:`RiggingResult`; con ``ok=False`` e un messaggio spiegabile
        all'utente se Blender manca o l'operazione fallisce — non solleva per
        i casi prevedibili, così l'interfaccia può mostrarli con calma.
    """
    tipo, eseguibile = blender_backend()
    if not tipo:
        return RiggingResult(
            False,
            "Blender non disponibile. Due modi per abilitarlo:\n"
            "• installa l'applicazione (gratuita, blender.org) — se è già "
            "installata in una cartella non standard, imposta la variabile "
            "d'ambiente BLENDER_PATH sul suo blender.exe;\n"
            "• oppure, senza installare nulla: `pip install bpy` nel venv "
            "dell'Hub (stesso motore, come modulo Python).",
        )
    if not AUTORIG_SCRIPT.is_file():
        return RiggingResult(False, f"Script di rigging non trovato: {AUTORIG_SCRIPT}")
    if not glb_bytes:
        return RiggingResult(False, "Nessun modello da riggare.")

    with tempfile.TemporaryDirectory(prefix="autorig_") as tmp:
        cartella = Path(tmp)
        ingresso = cartella / "input.glb"
        uscita = cartella / "output.glb"
        ingresso.write_bytes(glb_bytes)

        # L'applicazione Blender vuole "--background --python script --",
        # il modulo bpy si limita a eseguire lo script con l'interprete.
        if tipo == "app":
            comando = [eseguibile, "--background", "--python", str(AUTORIG_SCRIPT), "--"]
        else:
            comando = [eseguibile, str(AUTORIG_SCRIPT), "--"]
        comando += [
            "--input", str(ingresso), "--output", str(uscita),
            "--animation", animation, "--frames", str(frames),
        ]
        try:
            completato = subprocess.run(  # noqa: S603 — argomenti costruiti qui
                comando, capture_output=True, text=True, timeout=timeout, check=False,
            )
        except subprocess.TimeoutExpired:
            return RiggingResult(False, f"Blender non ha terminato entro {timeout:.0f}s.")
        except OSError as exc:
            return RiggingResult(False, f"Impossibile eseguire Blender: {exc}")

        uscita_completa = (completato.stdout or "") + (completato.stderr or "")
        coda = "\n".join(uscita_completa.splitlines()[-20:])

        if completato.returncode != 0:
            return RiggingResult(
                False, f"Blender è uscito con codice {completato.returncode}.", log_tail=coda
            )
        if not uscita.is_file():
            return RiggingResult(
                False,
                "Blender ha terminato senza errori ma non ha prodotto il file: "
                "il modello potrebbe non contenere mesh utilizzabili.",
                log_tail=coda,
            )
        dati = uscita.read_bytes()
        if not dati:
            return RiggingResult(False, "Il file prodotto da Blender è vuoto.", log_tail=coda)
        return RiggingResult(
            True,
            f"Rig creato ({len(dati):,} byte)" + (" con animazione idle." if animation == "idle" else "."),
            glb=dati,
            log_tail=coda,
        )
