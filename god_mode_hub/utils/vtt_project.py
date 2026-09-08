"""Controllo del progetto VTT dall'Hub: anteprima live, bundle, import asset.

Finora l'Hub *scriveva* nel progetto VTT (Drop Zone) e *generava* asset in
``asset_forge/``, ma per vedere il risultato bisognava uscire, aprire un
terminale, lanciare il server di anteprima e copiare i file a mano. Questo
modulo chiude il cerchio:

* **anteprima** — avvia/ferma ``node dev-server.js`` come processo figlio e
  dice se risponde davvero (non si limita a "l'ho lanciato");
* **bundle** — esegue ``node tools/bundle.js`` per rigenerare il file unico
  ``dist/ultimate-vtt.html``;
* **import asset** — copia i PNG/GLB prodotti da Asset Forge dentro
  ``assets/`` del VTT, pronti da referenziare nel gioco.
"""

from __future__ import annotations

import shutil
import socket
import subprocess
from dataclasses import dataclass
from pathlib import Path

from utils import ANIMATIONS_DIR, CHARACTERS_DIR, TOKENS_DIR, VTT_PROJECT_DIR

#: Porta usata da ``dev-server.js`` (fissata nello script del progetto).
DEV_SERVER_PORT = 4599
#: Cartella in cui finiscono gli asset importati nel VTT.
VTT_ASSETS_DIRNAME = "assets"

#: Processo del server di anteprima, se avviato da questa sessione dell'Hub.
#: Vive a livello di modulo perché il processo Python di Streamlit sopravvive
#: ai rerun dello script, mentre ``st.session_state`` non conserva oggetti
#: Popen in modo affidabile.
_dev_server: subprocess.Popen | None = None


class VTTProjectError(RuntimeError):
    """Errore in un'operazione sul progetto VTT."""


@dataclass(frozen=True)
class BundleResult:
    """Esito della generazione del file unico distribuibile."""

    ok: bool
    message: str
    path: Path | None = None
    size_bytes: int = 0


def node_available() -> bool:
    """True se ``node`` è invocabile (serve per anteprima e bundle)."""
    return shutil.which("node") is not None


def port_in_use(port: int = DEV_SERVER_PORT, host: str = "127.0.0.1") -> bool:
    """True se qualcosa è in ascolto su questa porta.

    Più affidabile di controllare il processo figlio: intercetta anche un
    server avviato a mano fuori dall'Hub.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        return sock.connect_ex((host, port)) == 0


def dev_server_url(port: int = DEV_SERVER_PORT) -> str:
    """Indirizzo dell'anteprima locale."""
    return f"http://localhost:{port}"


def dev_server_running(port: int = DEV_SERVER_PORT) -> bool:
    """True se l'anteprima risponde davvero sulla porta attesa."""
    return port_in_use(port)


def start_dev_server(
    project_dir: Path = VTT_PROJECT_DIR,
    port: int = DEV_SERVER_PORT,
) -> str:
    """Avvia ``node dev-server.js`` in background.

    Returns:
        L'URL dell'anteprima.

    Raises:
        VTTProjectError: se node manca, lo script non esiste o la porta è già
            occupata da un altro processo.
    """
    global _dev_server
    if dev_server_running(port):
        return dev_server_url(port)
    if not node_available():
        raise VTTProjectError(
            "Node.js non trovato nel PATH: serve per l'anteprima del VTT "
            "(installa Node, oppure apri index.html con doppio click)."
        )
    script = project_dir / "dev-server.js"
    if not script.is_file():
        raise VTTProjectError(f"Script di anteprima non trovato: {script}")
    try:
        _dev_server = subprocess.Popen(  # noqa: S603 — comando fisso, nessun input utente
            ["node", str(script)],
            cwd=str(project_dir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        raise VTTProjectError(f"Avvio del server di anteprima fallito: {exc}") from exc
    return dev_server_url(port)


def stop_dev_server() -> bool:
    """Ferma il server di anteprima avviato dall'Hub.

    Returns:
        True se un processo è stato effettivamente terminato.
    """
    global _dev_server
    if _dev_server is None or _dev_server.poll() is not None:
        _dev_server = None
        return False
    _dev_server.terminate()
    try:
        _dev_server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _dev_server.kill()
    _dev_server = None
    return True


def dev_server_owned_by_hub() -> bool:
    """True se il server in esecuzione è stato avviato da questa sessione."""
    return _dev_server is not None and _dev_server.poll() is None


def build_bundle(project_dir: Path = VTT_PROJECT_DIR, timeout: float = 120.0) -> BundleResult:
    """Rigenera ``dist/ultimate-vtt.html`` con ``node tools/bundle.js``.

    Il file unico è quello che il README indica per condividere il gioco:
    autonomo, offline, apribile con doppio click.
    """
    if not node_available():
        return BundleResult(False, "Node.js non trovato nel PATH: impossibile creare il bundle.")
    script = project_dir / "tools" / "bundle.js"
    if not script.is_file():
        return BundleResult(False, f"Script non trovato: {script}")
    try:
        completed = subprocess.run(  # noqa: S603 — comando fisso
            ["node", str(script)], cwd=str(project_dir),
            capture_output=True, text=True, timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired:
        return BundleResult(False, f"Il bundle non è terminato entro {timeout:.0f}s.")
    except OSError as exc:
        return BundleResult(False, f"Esecuzione fallita: {exc}")
    if completed.returncode != 0:
        coda = "\n".join((completed.stderr or completed.stdout or "").splitlines()[-5:])
        return BundleResult(False, f"bundle.js è uscito con codice {completed.returncode}:\n{coda}")
    out_path = project_dir / "dist" / "ultimate-vtt.html"
    if not out_path.is_file():
        return BundleResult(False, "bundle.js è andato a buon fine ma dist/ultimate-vtt.html non esiste.")
    return BundleResult(
        True, (completed.stdout or "Bundle creato.").strip().splitlines()[-1],
        path=out_path, size_bytes=out_path.stat().st_size,
    )


# ---------------------------------------------------------------------------
# Import degli asset generati dentro il progetto VTT
# ---------------------------------------------------------------------------

#: Sottocartelle di destinazione per categoria di asset.
ASSET_CATEGORIES: dict[str, tuple[Path, str]] = {
    "token": (TOKENS_DIR, "tokens"),
    "personaggio": (CHARACTERS_DIR, "characters"),
    "animazione": (ANIMATIONS_DIR, "animations"),
}


def list_generated_assets(
    category: str,
    patterns: tuple[str, ...] = ("*.png", "*.glb", "*.gif", "*.mp4"),
) -> list[Path]:
    """Elenca gli asset generati di una categoria, dal più recente.

    Raises:
        KeyError: categoria sconosciuta.
    """
    source_dir, _ = ASSET_CATEGORIES[category]
    if not source_dir.exists():
        return []
    trovati = [p for pattern in patterns for p in source_dir.rglob(pattern) if p.is_file()]
    return sorted(trovati, key=lambda p: p.stat().st_mtime, reverse=True)


def import_asset(
    asset_path: Path,
    category: str,
    project_dir: Path = VTT_PROJECT_DIR,
    overwrite: bool = False,
) -> Path:
    """Copia un asset generato dentro ``assets/<categoria>/`` del VTT.

    Args:
        asset_path: file prodotto da Asset Forge / Animazioni.
        category: chiave di :data:`ASSET_CATEGORIES`.
        overwrite: se False e la destinazione esiste, aggiunge un suffisso
            numerico invece di sovrascrivere (gli asset del gioco non passano
            dalla rete di sicurezza della Drop Zone).

    Returns:
        Percorso del file copiato dentro il progetto VTT.

    Raises:
        VTTProjectError: file sorgente assente.
        KeyError: categoria sconosciuta.
    """
    if not asset_path.is_file():
        raise VTTProjectError(f"Asset non trovato: {asset_path}")
    _, subdir = ASSET_CATEGORIES[category]
    dest_dir = project_dir / VTT_ASSETS_DIRNAME / subdir
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / asset_path.name
    if dest.exists() and not overwrite:
        gambo, suffisso = dest.stem, dest.suffix
        contatore = 2
        while dest.exists():
            dest = dest_dir / f"{gambo}_{contatore}{suffisso}"
            contatore += 1
    shutil.copy2(asset_path, dest)
    return dest


def relative_asset_url(dest: Path, project_dir: Path = VTT_PROJECT_DIR) -> str:
    """Percorso relativo da usare in ``index.html`` o nei moduli JS."""
    try:
        return dest.resolve().relative_to(project_dir.resolve()).as_posix()
    except ValueError:
        return dest.name
