"""Configurazione condivisa dei test dell'Hub.

I test girano su directory temporanee: non toccano mai la wiki, la codebase
o il progetto VTT reali.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

HUB_ROOT = Path(__file__).resolve().parents[1]
if str(HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(HUB_ROOT))


@pytest.fixture
def fake_project(tmp_path: Path) -> Path:
    """Un finto progetto VTT con qualche file reale da proteggere/sovrascrivere."""
    (tmp_path / "js").mkdir()
    (tmp_path / "css").mkdir()
    (tmp_path / ".git").mkdir()
    (tmp_path / "js" / "modulo.js").write_text(
        "// modulo importante\n" + "console.log('riga');\n" * 100, encoding="utf-8"
    )
    (tmp_path / "index.html").write_text("<html><body>VTT</body></html>\n", encoding="utf-8")
    (tmp_path / ".git" / "config").write_text("[core]\n", encoding="utf-8")
    return tmp_path


@pytest.fixture
def wiki_dirs(tmp_path: Path) -> tuple[Path, Path]:
    """Coppia ``(wiki_dir, raw_dir)`` vuota e isolata."""
    wiki = tmp_path / "wiki"
    raw = tmp_path / "raw"
    for sub in ("sources", "concepts", "entities"):
        (wiki / sub).mkdir(parents=True)
    raw.mkdir()
    return wiki, raw
