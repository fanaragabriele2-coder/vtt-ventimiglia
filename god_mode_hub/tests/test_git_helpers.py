"""Test dell'integrazione git, su repository veri creati al volo in tmp.

Nessun mock: ogni test crea un repository git reale, ci lavora e verifica il
risultato con git stesso. Se git non è installato i test saltano.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from utils import git_helpers


def _git_disponibile() -> bool:
    try:
        subprocess.run(["git", "--version"], capture_output=True, check=True, timeout=10)
    except Exception:  # noqa: BLE001
        return False
    return True


pytestmark = pytest.mark.skipif(not _git_disponibile(), reason="git non disponibile")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """Repository git reale con un commit iniziale."""
    def g(*args: str) -> None:
        subprocess.run(["git", *args], cwd=tmp_path, capture_output=True, check=True)

    g("init", "-b", "main")
    g("config", "user.email", "test@example.invalid")
    g("config", "user.name", "Test")
    (tmp_path / "js").mkdir()
    (tmp_path / "js" / "modulo.js").write_text("var a = 1;\n", encoding="utf-8")
    g("add", "-A")
    g("commit", "-m", "commit iniziale")
    return tmp_path


def test_riconosce_un_repository(repo: Path) -> None:
    assert git_helpers.is_git_repo(repo) is True
    assert git_helpers.current_branch(repo) == "main"


def test_cartella_non_repository(tmp_path: Path) -> None:
    fuori = tmp_path / "non_repo"
    fuori.mkdir()
    stato = git_helpers.status(fuori)
    assert stato.is_repo is False
    assert stato.error


def test_repo_pulito_non_ha_modifiche(repo: Path) -> None:
    stato = git_helpers.status(repo)
    assert stato.is_repo and not stato.has_changes


def test_rileva_file_modificato(repo: Path) -> None:
    (repo / "js" / "modulo.js").write_text("var a = 2;\n", encoding="utf-8")
    stato = git_helpers.status(repo)
    assert [c.path for c in stato.changes] == ["js/modulo.js"]
    assert "modificato" in stato.changes[0].descrizione
    assert not stato.changes[0].untracked


def test_rileva_file_nuovo_non_tracciato(repo: Path) -> None:
    (repo / "js" / "nuovo.js").write_text("var b = 3;\n", encoding="utf-8")
    stato = git_helpers.status(repo)
    nuovo = next(c for c in stato.changes if c.path == "js/nuovo.js")
    assert nuovo.untracked
    assert "non tracciato" in nuovo.descrizione


def test_diff_mostra_le_righe_cambiate(repo: Path) -> None:
    (repo / "js" / "modulo.js").write_text("var a = 999;\n", encoding="utf-8")
    testo = git_helpers.diff(repo=repo)
    assert "-var a = 1;" in testo
    assert "+var a = 999;" in testo


def test_diff_di_un_solo_file(repo: Path) -> None:
    (repo / "js" / "modulo.js").write_text("var a = 2;\n", encoding="utf-8")
    (repo / "altro.txt").write_text("x\n", encoding="utf-8")
    subprocess.run(["git", "add", "altro.txt"], cwd=repo, capture_output=True, check=True)
    testo = git_helpers.diff(path="js/modulo.js", repo=repo)
    assert "modulo.js" in testo and "altro.txt" not in testo


def test_diff_file_nuovo_mostra_il_contenuto(repo: Path) -> None:
    """git diff ignora i non tracciati: senza questo un file appena creato
    dalla Drop Zone risulterebbe invisibile."""
    (repo / "js" / "creato.js").write_text("riga uno\nriga due\n", encoding="utf-8")
    testo = git_helpers.diff_untracked("js/creato.js", repo=repo)
    assert "+riga uno" in testo and "+riga due" in testo
    assert "file nuovo" in testo


def test_commit_di_tutte_le_modifiche(repo: Path) -> None:
    (repo / "js" / "modulo.js").write_text("var a = 5;\n", encoding="utf-8")
    ok, messaggio = git_helpers.commit("modifica di prova", repo=repo)
    assert ok, messaggio
    assert not git_helpers.status(repo).has_changes
    assert "modifica di prova" in " ".join(git_helpers.last_commits(repo=repo))


def test_commit_di_file_selezionati(repo: Path) -> None:
    (repo / "js" / "modulo.js").write_text("var a = 6;\n", encoding="utf-8")
    (repo / "js" / "escluso.js").write_text("var c = 7;\n", encoding="utf-8")

    ok, _ = git_helpers.commit("solo modulo", paths=["js/modulo.js"], repo=repo)

    assert ok
    rimasti = [c.path for c in git_helpers.status(repo).changes]
    assert rimasti == ["js/escluso.js"], "il file non selezionato deve restare fuori dal commit"


def test_commit_senza_messaggio_rifiutato(repo: Path) -> None:
    (repo / "js" / "modulo.js").write_text("var a = 8;\n", encoding="utf-8")
    ok, messaggio = git_helpers.commit("   ", repo=repo)
    assert not ok and "vuoto" in messaggio


def test_commit_senza_modifiche_spiega_il_motivo(repo: Path) -> None:
    ok, messaggio = git_helpers.commit("niente da fare", repo=repo)
    assert not ok
    assert "committare" in messaggio.lower()


def test_diff_troncato_se_enorme(repo: Path) -> None:
    (repo / "js" / "modulo.js").write_text("x\n" * 50_000, encoding="utf-8")
    testo = git_helpers.diff(repo=repo, max_chars=1000)
    assert len(testo) < 1200
    assert "troncato" in testo
