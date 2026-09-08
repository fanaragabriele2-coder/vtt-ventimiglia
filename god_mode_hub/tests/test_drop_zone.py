"""Test del parser della Drop Zone: estrazione blocchi e destinazioni sicure."""

from __future__ import annotations

from pathlib import Path

import pytest

from utils import drop_zone_parser as dz


# ---------------------------------------------------------------------------
# Estrazione dei blocchi
# ---------------------------------------------------------------------------

def test_estrae_lingua_e_percorso_dal_commento() -> None:
    blocchi = dz.extract_blocks("```javascript\n// js/10-modulo.js\ncodice();\n```")
    assert len(blocchi) == 1
    assert blocchi[0].language == "javascript"
    assert blocchi[0].suggested_path == "js/10-modulo.js"
    assert blocchi[0].kind == "code"


@pytest.mark.parametrize(
    "fence,atteso",
    [
        ("```dart path=lib/x.dart\ncode\n```", "lib/x.dart"),
        ('```dart title="lib/y.dart"\ncode\n```', "lib/y.dart"),
        ("```dart:lib/z.dart\ncode\n```", "lib/z.dart"),
        ("```python\n# utils/tool.py\ncode\n```", "utils/tool.py"),
        ("```css\n/* css/stile.css */\ncode\n```", "css/stile.css"),
        ("```markdown\n<!-- wiki/concepts/nota.md -->\ntesto\n```", "wiki/concepts/nota.md"),
    ],
)
def test_varianti_di_dichiarazione_percorso(fence: str, atteso: str) -> None:
    blocchi = dz.extract_blocks(fence)
    assert blocchi[0].suggested_path == atteso


def test_percorso_dedotto_dal_testo_sopra_la_fence() -> None:
    testo = "Ecco il file `js/15-nuovo.js`:\n\n```javascript\ncodice();\n```"
    assert dz.extract_blocks(testo)[0].suggested_path == "js/15-nuovo.js"


def test_blocchi_multipli_in_una_risposta() -> None:
    testo = (
        "```javascript\n// js/a.js\nA\n```\n\n"
        "```css\n/* css/b.css */\nB\n```\n\n"
        "```markdown\n<!-- wiki/concepts/c.md -->\nC\n```\n"
    )
    blocchi = dz.extract_blocks(testo)
    assert [b.suggested_path for b in blocchi] == ["js/a.js", "css/b.css", "wiki/concepts/c.md"]
    assert [b.kind for b in blocchi] == ["code", "code", "wiki"]


def test_testo_senza_blocchi_non_esplode() -> None:
    assert dz.extract_blocks("Solo testo, nessun blocco recintato.") == []


def test_blocco_senza_lingua_classificato_other() -> None:
    blocchi = dz.extract_blocks("```\ntesto libero\n```")
    assert blocchi[0].kind == "other"
    assert dz.resolve_destination(blocchi[0], 0) is None


# ---------------------------------------------------------------------------
# Destinazioni: contenimento dei percorsi
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "percorso",
    ["../../../etc/passwd.js", "/etc/assoluto.js", "js/../../../fuori.js",
     "C:/Windows/system.js", "....//....//evasione.js"],
)
def test_nessun_percorso_esce_dal_progetto(percorso: str, tmp_path: Path) -> None:
    """Regressione: nessuna forma di traversal deve scrivere fuori dal repo."""
    blocchi = dz.extract_blocks(f"```javascript\n// {percorso}\ncode\n```")
    dest = dz.resolve_destination(
        blocchi[0], 0, codebase_dir=tmp_path / "codebase",
        wiki_dir=tmp_path / "wiki", vtt_project_dir=tmp_path,
    )
    if dest is not None:
        assert tmp_path.resolve() in dest.resolve().parents


def test_estensioni_web_vanno_nel_progetto_vtt(tmp_path: Path) -> None:
    blocchi = dz.extract_blocks("```javascript\n// js/x.js\ncode\n```")
    dest = dz.resolve_destination(
        blocchi[0], 0, codebase_dir=tmp_path / "codebase",
        wiki_dir=tmp_path / "wiki", vtt_project_dir=tmp_path,
    )
    assert dest == tmp_path / "js" / "x.js"


def test_dart_e_python_vanno_in_codebase(tmp_path: Path) -> None:
    blocchi = dz.extract_blocks("```dart\n// lib/widget.dart\ncode\n```")
    dest = dz.resolve_destination(
        blocchi[0], 0, codebase_dir=tmp_path / "codebase",
        wiki_dir=tmp_path / "wiki", vtt_project_dir=tmp_path,
    )
    assert dest == tmp_path / "codebase" / "lib" / "widget.dart"


def test_markdown_va_in_wiki(tmp_path: Path) -> None:
    blocchi = dz.extract_blocks("```markdown\n<!-- wiki/concepts/nota.md -->\n# Nota\n```")
    dest = dz.resolve_destination(
        blocchi[0], 0, codebase_dir=tmp_path / "codebase",
        wiki_dir=tmp_path / "wiki", vtt_project_dir=tmp_path,
    )
    assert dest == tmp_path / "wiki" / "concepts" / "nota.md"


# ---------------------------------------------------------------------------
# Salvataggio con rete di sicurezza
# ---------------------------------------------------------------------------

def test_salvataggio_fa_backup_del_file_esistente(tmp_path: Path) -> None:
    (tmp_path / "js").mkdir()
    esistente = tmp_path / "js" / "modulo.js"
    esistente.write_text("// originale\n" + "riga();\n" * 200, encoding="utf-8")
    originale = esistente.read_text(encoding="utf-8")

    blocchi = dz.extract_blocks("```javascript\n// js/modulo.js\n// sostituto\n```")
    salvati = dz.save_blocks(
        blocchi, codebase_dir=tmp_path / "codebase", wiki_dir=tmp_path / "wiki",
        vtt_project_dir=tmp_path, backup_root=tmp_path / ".hub_backups",
    )

    assert len(salvati) == 1
    assert salvati[0].action == "sovrascritto"
    assert salvati[0].backup_path is not None
    assert salvati[0].backup_path.read_text(encoding="utf-8") == originale


def test_salvataggio_rifiuta_aree_protette(tmp_path: Path) -> None:
    (tmp_path / ".git").mkdir()
    blocchi = dz.extract_blocks("```javascript\n// .git/config.js\nevil()\n```")
    for b in blocchi:
        b.suggested_path = ".git/config.js"
    salvati = dz.save_blocks(
        blocchi, codebase_dir=tmp_path / "codebase", wiki_dir=tmp_path / "wiki",
        vtt_project_dir=tmp_path, backup_root=tmp_path / ".hub_backups",
    )
    assert salvati == []
    assert not (tmp_path / ".git" / "config.js").exists()


def test_anteprima_diff_prima_del_salvataggio(tmp_path: Path) -> None:
    (tmp_path / "js").mkdir()
    esistente = tmp_path / "js" / "m.js"
    esistente.write_text("a\nb\nc\n", encoding="utf-8")
    blocchi = dz.extract_blocks("```javascript\n// js/m.js\na\nB_MODIFICATO\nc\n```")

    anteprime = dz.preview_blocks(
        blocchi, codebase_dir=tmp_path / "codebase", wiki_dir=tmp_path / "wiki",
        vtt_project_dir=tmp_path,
    )

    assert len(anteprime) == 1
    destinazione, diff = anteprime[0]
    assert destinazione == esistente
    assert diff.exists and diff.added_lines >= 1 and diff.removed_lines >= 1
    assert esistente.read_text(encoding="utf-8") == "a\nb\nc\n"  # nulla scritto
