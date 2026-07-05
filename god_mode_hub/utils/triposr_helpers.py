"""Wrapper locali per la conversione Image-to-3D: TripoSR e TRELLIS.2.

TripoSR viene invocato come subprocess sul suo ``run.py`` (repo clonato a
parte, con il proprio venv), così i pesi e le dipendenze CUDA non inquinano
l'ambiente dell'Hub. Configurazione via variabili d'ambiente:

* ``TRIPOSR_DIR``    — cartella del repo TripoSR (default: ``~/TripoSR``)
* ``TRIPOSR_PYTHON`` — interprete Python del venv di TripoSR
  (default: lo stesso interprete dell'Hub)
* ``TRELLIS_URL``    — endpoint HTTP locale opzionale di TRELLIS.2
  (es. ``http://127.0.0.1:8765``)
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

TRIPOSR_DIR = Path(os.environ.get("TRIPOSR_DIR", str(Path.home() / "TripoSR")))
TRIPOSR_PYTHON = os.environ.get("TRIPOSR_PYTHON", sys.executable)
TRELLIS_URL = os.environ.get("TRELLIS_URL", "")


class TripoSRError(RuntimeError):
    """Errore nell'esecuzione della pipeline Image-to-3D."""


def triposr_available() -> bool:
    """True se il repo TripoSR è presente (``run.py`` trovato)."""
    return (TRIPOSR_DIR / "run.py").is_file()


def trellis_available() -> bool:
    """True se è configurato un endpoint TRELLIS locale (``TRELLIS_URL``)."""
    return bool(TRELLIS_URL)


def backend_status() -> dict[str, bool]:
    """Stato dei backend 3D, per le pagine di diagnostica."""
    return {"triposr": triposr_available(), "trellis": trellis_available()}


def image_to_glb(
    png_bytes: bytes,
    mc_resolution: int = 256,
    remove_background: bool = True,
    timeout: float = 900.0,
) -> bytes:
    """Converte un'immagine PNG in un modello 3D ``.glb`` con TripoSR.

    Scrive l'immagine in una directory temporanea, lancia ``run.py`` nel repo
    TripoSR e legge il ``.glb`` prodotto; i file temporanei vengono sempre
    ripuliti (context manager).

    Args:
        png_bytes: immagine sorgente (idealmente soggetto centrato, sfondo
            uniforme — vedi i prompt di ``sd_api``).
        mc_resolution: risoluzione del marching cubes (256 ≈ buon compromesso
            qualità/tempo su 16 GB di VRAM).
        remove_background: lascia a TripoSR la rimozione dello sfondo.
        timeout: secondi massimi per il subprocess.

    Raises:
        TripoSRError: repo mancante, subprocess fallito o nessun .glb prodotto.
    """
    if not triposr_available():
        raise TripoSRError(
            f"TripoSR non trovato in {TRIPOSR_DIR}. Esegui la riparazione "
            "automatica: doppio click su god_mode_hub/tools/FIX_TRIPOSR.bat "
            "(clona il repo, sistema toolchain/torch/torchmcubes e imposta "
            "TRIPOSR_DIR/TRIPOSR_PYTHON da solo)."
        )

    with tempfile.TemporaryDirectory(prefix="triposr_") as tmp:
        tmp_path = Path(tmp)
        image_path = tmp_path / "input.png"
        output_dir = tmp_path / "out"
        output_dir.mkdir()
        image_path.write_bytes(png_bytes)

        cmd = [
            TRIPOSR_PYTHON,
            "run.py",
            str(image_path),
            "--output-dir",
            str(output_dir),
            "--model-save-format",
            "glb",
            "--mc-resolution",
            str(mc_resolution),
        ]
        if not remove_background:
            cmd.append("--no-remove-bg")

        try:
            completed = subprocess.run(
                cmd,
                cwd=str(TRIPOSR_DIR),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise TripoSRError(
                f"TripoSR non ha terminato entro {timeout:.0f}s."
            ) from exc
        except OSError as exc:
            raise TripoSRError(f"Impossibile lanciare TripoSR: {exc}") from exc

        if completed.returncode != 0:
            tail = "\n".join((completed.stderr or "").splitlines()[-15:])
            raise TripoSRError(
                f"TripoSR è uscito con codice {completed.returncode}:\n{tail}"
            )

        glb_files = sorted(output_dir.rglob("*.glb"))
        if not glb_files:
            obj_files = sorted(output_dir.rglob("*.obj"))
            hint = (
                " Trovato solo .obj: aggiorna TripoSR a una versione con "
                "--model-save-format glb." if obj_files else ""
            )
            raise TripoSRError("Nessun file .glb prodotto da TripoSR." + hint)
        return glb_files[0].read_bytes()


def trellis_image_to_glb(png_bytes: bytes, timeout: float = 1800.0) -> bytes:
    """Converte un'immagine in ``.glb`` tramite un servizio TRELLIS.2 locale.

    Richiede un piccolo server HTTP locale davanti a TRELLIS.2 che accetti una
    POST multipart con campo ``image`` e risponda con i byte del ``.glb``
    (vedi README, sezione "Backend 3D"). L'URL va in ``TRELLIS_URL``.

    Raises:
        TripoSRError: endpoint non configurato o chiamata fallita.
    """
    if not trellis_available():
        raise TripoSRError(
            "TRELLIS non configurato: imposta la variabile d'ambiente "
            "TRELLIS_URL verso il tuo servizio locale (nessuna API cloud)."
        )
    import requests

    try:
        response = requests.post(
            f"{TRELLIS_URL.rstrip('/')}/image-to-3d",
            files={"image": ("input.png", png_bytes, "image/png")},
            timeout=timeout,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise TripoSRError(f"Chiamata a TRELLIS fallita: {exc}") from exc
    if not response.content:
        raise TripoSRError("TRELLIS ha risposto senza contenuto .glb.")
    return response.content
