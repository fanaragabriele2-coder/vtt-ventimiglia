"""Test del controllo del progetto VTT: anteprima, bundle, import asset."""

from __future__ import annotations

import shutil
import time
from pathlib import Path

import pytest

from utils import vtt_project


# ---------------------------------------------------------------------------
# Import degli asset generati
# ---------------------------------------------------------------------------

def test_import_asset_copia_nel_progetto(tmp_path: Path) -> None:
    sorgente = tmp_path / "token_generato.png"
    sorgente.write_bytes(b"\x89PNG\r\n\x1a\ndati")
    progetto = tmp_path / "vtt"

    dest = vtt_project.import_asset(sorgente, "token", project_dir=progetto)

    assert dest == progetto / "assets" / "tokens" / "token_generato.png"
    assert dest.read_bytes() == b"\x89PNG\r\n\x1a\ndati"


def test_import_non_sovrascrive_di_default(tmp_path: Path) -> None:
    """Gli asset del gioco non passano dalla rete di sicurezza della Drop Zone:
    meglio un suffisso numerico che una perdita silenziosa."""
    sorgente = tmp_path / "goblin.png"
    sorgente.write_bytes(b"versione_1")
    progetto = tmp_path / "vtt"
    primo = vtt_project.import_asset(sorgente, "token", project_dir=progetto)

    sorgente.write_bytes(b"versione_2")
    secondo = vtt_project.import_asset(sorgente, "token", project_dir=progetto)

    assert secondo != primo
    assert secondo.name == "goblin_2.png"
    assert primo.read_bytes() == b"versione_1", "la prima versione non va persa"


def test_import_sovrascrive_se_richiesto(tmp_path: Path) -> None:
    sorgente = tmp_path / "goblin.png"
    sorgente.write_bytes(b"v1")
    progetto = tmp_path / "vtt"
    vtt_project.import_asset(sorgente, "token", project_dir=progetto)
    sorgente.write_bytes(b"v2")

    dest = vtt_project.import_asset(sorgente, "token", project_dir=progetto, overwrite=True)

    assert dest.read_bytes() == b"v2"
    assert len(list((progetto / "assets" / "tokens").iterdir())) == 1


def test_import_asset_inesistente_solleva(tmp_path: Path) -> None:
    with pytest.raises(vtt_project.VTTProjectError, match="non trovato"):
        vtt_project.import_asset(tmp_path / "fantasma.png", "token", project_dir=tmp_path)


def test_categoria_sconosciuta_solleva(tmp_path: Path) -> None:
    f = tmp_path / "x.png"
    f.write_bytes(b"x")
    with pytest.raises(KeyError):
        vtt_project.import_asset(f, "categoria_inventata", project_dir=tmp_path)


def test_url_relativo_per_il_gioco(tmp_path: Path) -> None:
    dest = tmp_path / "assets" / "tokens" / "goblin.png"
    dest.parent.mkdir(parents=True)
    dest.write_bytes(b"x")
    assert vtt_project.relative_asset_url(dest, tmp_path) == "assets/tokens/goblin.png"


# ---------------------------------------------------------------------------
# Bundle (file unico distribuibile)
# ---------------------------------------------------------------------------

pytestmark_node = pytest.mark.skipif(
    not vtt_project.node_available(), reason="Node.js non disponibile"
)


@pytestmark_node
def test_bundle_genera_il_file_unico(tmp_path: Path) -> None:
    """Esegue davvero bundle.js su una copia del progetto reale."""
    reale = Path(__file__).resolve().parents[2]
    if not (reale / "tools" / "bundle.js").is_file():
        pytest.skip("progetto VTT non disponibile")
    progetto = tmp_path / "vtt"
    progetto.mkdir()
    for nome in ("index.html", "css", "js", "tools"):
        origine = reale / nome
        if origine.is_dir():
            shutil.copytree(origine, progetto / nome)
        elif origine.is_file():
            shutil.copy2(origine, progetto / nome)

    esito = vtt_project.build_bundle(project_dir=progetto)

    assert esito.ok, esito.message
    assert esito.path is not None and esito.path.is_file()
    assert esito.size_bytes > 100_000, "il bundle deve contenere css e js inline"
    testo = esito.path.read_text(encoding="utf-8", errors="replace")
    assert 'src="js/' not in testo, "i js locali devono essere inline, non referenziati"
    assert 'href="css/' not in testo, "i css locali devono essere inline"


def test_bundle_senza_script_fallisce_con_messaggio(tmp_path: Path) -> None:
    esito = vtt_project.build_bundle(project_dir=tmp_path)
    assert not esito.ok
    assert "non trovato" in esito.message.lower() or "node" in esito.message.lower()


# ---------------------------------------------------------------------------
# Server di anteprima
# ---------------------------------------------------------------------------

def test_porta_libera_riconosciuta() -> None:
    assert vtt_project.port_in_use(59998) is False


def test_url_anteprima() -> None:
    assert vtt_project.dev_server_url(4599) == "http://localhost:4599"


def test_avvio_senza_script_solleva(tmp_path: Path) -> None:
    with pytest.raises(vtt_project.VTTProjectError):
        vtt_project.start_dev_server(project_dir=tmp_path, port=59997)


@pytestmark_node
def test_anteprima_si_avvia_e_serve_il_gioco(tmp_path: Path) -> None:
    """Avvia il vero `dev-server.js` e verifica che serva l'index del progetto.

    `dev-server.js` usa una porta fissa: se qualcosa la occupa già (un server
    avviato a mano, un'altra sessione dell'Hub) il test salta invece di
    interrogare per sbaglio quel server e dare un fallimento fuorviante.
    """
    reale = Path(__file__).resolve().parents[2]
    if not (reale / "dev-server.js").is_file():
        pytest.skip("progetto VTT non disponibile")

    porta = vtt_project.DEV_SERVER_PORT
    if vtt_project.port_in_use(porta):
        pytest.skip(f"porta {porta} già occupata da un altro server")

    progetto = tmp_path / "vtt"
    progetto.mkdir()
    shutil.copy2(reale / "dev-server.js", progetto / "dev-server.js")
    (progetto / "index.html").write_text(
        "<html><body>VTT di prova</body></html>", encoding="utf-8"
    )

    try:
        url = vtt_project.start_dev_server(project_dir=progetto, port=porta)
        assert url.endswith(str(porta))

        import urllib.request

        contenuto = ""
        for _ in range(40):
            try:
                with urllib.request.urlopen(url, timeout=1) as risposta:
                    contenuto = risposta.read().decode("utf-8", "replace")
                    break
            except Exception:  # noqa: BLE001 — il server sta ancora salendo
                time.sleep(0.25)
        assert "VTT di prova" in contenuto, "il server deve servire l'index.html del progetto"
    finally:
        vtt_project.stop_dev_server()


@pytestmark_node
def test_stop_senza_avvio_non_esplode() -> None:
    assert vtt_project.stop_dev_server() is False
