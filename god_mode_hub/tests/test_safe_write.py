"""Test della rete di sicurezza sulle scritture (backup, diff, aree protette).

Sono i test più importanti dell'Hub: coprono l'unico punto in cui codice
generato da un LLM sovrascrive file reali del progetto VTT.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from utils import safe_write


# ---------------------------------------------------------------------------
# Aree protette
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "rel",
    [".git/hooks/pre-commit", "node_modules/pacchetto/index.js", "dist/bundle.html",
     ".venv/pyvenv.cfg", "__pycache__/x.pyc", ".streamlit/secrets.toml"],
)
def test_aree_protette_rifiutate(fake_project: Path, rel: str) -> None:
    target = fake_project / rel
    assert safe_write.is_protected(target, fake_project)
    with pytest.raises(safe_write.ProtectedPathError):
        safe_write.safe_write(target, "contenuto", project_root=fake_project)


def test_file_fuori_dal_progetto_protetto(fake_project: Path, tmp_path: Path) -> None:
    esterno = tmp_path.parent / "fuori.js"
    assert safe_write.is_protected(esterno, fake_project)


def test_percorsi_normali_non_protetti(fake_project: Path) -> None:
    assert not safe_write.is_protected(fake_project / "js" / "nuovo.js", fake_project)
    assert not safe_write.is_protected(fake_project / "index.html", fake_project)


# ---------------------------------------------------------------------------
# Backup e ripristino
# ---------------------------------------------------------------------------

def test_backup_creato_prima_di_sovrascrivere(fake_project: Path, tmp_path: Path) -> None:
    target = fake_project / "js" / "modulo.js"
    originale = target.read_text(encoding="utf-8")
    backup_root = tmp_path / "backups"

    esito = safe_write.safe_write(
        target, "// versione nuova\n", project_root=fake_project, backup_root=backup_root
    )

    assert esito.action == "sovrascritto"
    assert esito.backup_path is not None and esito.backup_path.exists()
    assert esito.backup_path.read_text(encoding="utf-8") == originale
    assert target.read_text(encoding="utf-8") == "// versione nuova\n"


def test_ripristino_riporta_il_contenuto_originale(fake_project: Path, tmp_path: Path) -> None:
    target = fake_project / "js" / "modulo.js"
    originale = target.read_text(encoding="utf-8")
    backup_root = tmp_path / "backups"

    safe_write.safe_write(target, "// stub LLM\n", project_root=fake_project,
                          backup_root=backup_root, stamp="20260101_120000")
    assert target.read_text(encoding="utf-8") == "// stub LLM\n"

    ripristinati = safe_write.restore_backup_session(
        "20260101_120000", project_root=fake_project, backup_root=backup_root
    )

    assert target in ripristinati
    assert target.read_text(encoding="utf-8") == originale


def test_nessun_backup_per_file_nuovo(fake_project: Path, tmp_path: Path) -> None:
    esito = safe_write.safe_write(
        fake_project / "js" / "mai_visto.js", "// nuovo\n",
        project_root=fake_project, backup_root=tmp_path / "backups",
    )
    assert esito.action == "creato"
    assert esito.backup_path is None


def test_contenuto_identico_non_riscrive(fake_project: Path, tmp_path: Path) -> None:
    target = fake_project / "index.html"
    esito = safe_write.safe_write(
        target, target.read_text(encoding="utf-8"),
        project_root=fake_project, backup_root=tmp_path / "backups",
    )
    assert esito.action == "invariato"
    assert esito.backup_path is None


def test_prune_tiene_solo_le_sessioni_recenti(tmp_path: Path) -> None:
    backup_root = tmp_path / "backups"
    for i in range(5):
        d = backup_root / f"2026010{i}_120000"
        d.mkdir(parents=True)
        (d / "f.js").write_text("x", encoding="utf-8")

    rimosse = safe_write.prune_backups(keep=2, backup_root=backup_root)

    assert rimosse == 3
    assert len(safe_write.list_backup_sessions(backup_root)) == 2


# ---------------------------------------------------------------------------
# Diff e rilevamento troncature LLM
# ---------------------------------------------------------------------------

def test_diff_su_file_nuovo(fake_project: Path) -> None:
    d = safe_write.diff_against_existing(fake_project / "js" / "nuovo.js", "riga1\nriga2\n")
    assert not d.exists
    assert d.added_lines == 2
    assert d.removed_lines == 0
    assert not d.looks_truncated


def test_diff_conta_righe_cambiate(fake_project: Path) -> None:
    target = fake_project / "index.html"
    d = safe_write.diff_against_existing(target, "<html><body>VTT modificato</body></html>\n")
    assert d.exists
    assert d.added_lines == 1 and d.removed_lines == 1
    assert "VTT modificato" in d.unified_diff


def test_contenuto_identico_rilevato(fake_project: Path) -> None:
    target = fake_project / "index.html"
    d = safe_write.diff_against_existing(target, target.read_text(encoding="utf-8"))
    assert d.is_identical


def test_crollo_di_dimensione_segnalato_come_troncatura(fake_project: Path) -> None:
    """Il caso reale: 3 KB di modulo funzionante sostituiti da uno stub."""
    target = fake_project / "js" / "modulo.js"
    d = safe_write.diff_against_existing(target, "// versione LLM incompleta\n")
    assert d.looks_truncated
    assert d.shrink_ratio < 0.1


@pytest.mark.parametrize(
    "marcatore",
    [
        "// ... resto del codice invariato ...",
        "# ...",
        "/* rest of the code unchanged */",
        "// [truncated]",
        "<!-- codice omesso -->",
        "// il resto del file rimane come prima",
    ],
)
def test_marcatori_di_elisione_riconosciuti(marcatore: str) -> None:
    contenuto = f"function inizio() {{}}\n{marcatore}\nfunction fine() {{}}\n"
    assert safe_write.find_ellipsis_markers(contenuto), f"non rilevato: {marcatore}"


def test_codice_legittimo_non_scambiato_per_troncatura() -> None:
    """Falsi positivi: spread operator, commenti normali, stringhe con punti."""
    codice = (
        "const copia = {...originale};\n"
        "// Questa funzione gestisce il movimento dei token sulla griglia\n"
        'const messaggio = "Caricamento in corso...";\n'
        "for (const x of lista) { /* itera */ }\n"
    )
    assert safe_write.find_ellipsis_markers(codice) == []


def test_file_piccolo_non_genera_falso_allarme(fake_project: Path) -> None:
    """Un file di 30 byte che ne diventa 12 non è una troncatura sospetta."""
    piccolo = fake_project / "js" / "piccolo.js"
    piccolo.write_text("var a = 1;\n", encoding="utf-8")
    d = safe_write.diff_against_existing(piccolo, "var a=2;\n")
    assert not d.looks_truncated
