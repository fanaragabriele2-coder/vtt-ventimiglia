"""Percorsi condivisi e utilità di base del God-Mode Local AI Hub.

Tutti i moduli del progetto importano i percorsi da qui, così l'Hub funziona
indipendentemente dalla directory di lavoro corrente (``streamlit run`` può
essere lanciato sia dalla radice del repo sia da ``god_mode_hub/``).
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Final

#: Radice del progetto Hub (la cartella ``god_mode_hub``).
HUB_ROOT: Final[Path] = Path(__file__).resolve().parent.parent

#: Fonti grezze (note, PDF, screenshot) in attesa di compilazione nella wiki.
RAW_DIR: Final[Path] = HUB_ROOT / "raw"

#: LLM Wiki (pattern Karpathy): pagine curate + indice FTS5.
WIKI_DIR: Final[Path] = HUB_ROOT / "wiki"
WIKI_SOURCES_DIR: Final[Path] = WIKI_DIR / "sources"
WIKI_CONCEPTS_DIR: Final[Path] = WIKI_DIR / "concepts"
WIKI_ENTITIES_DIR: Final[Path] = WIKI_DIR / "entities"

#: Codebase Flutter/Python futura su cui gira il RAG (file .dart / .py).
CODEBASE_DIR: Final[Path] = HUB_ROOT / "codebase"

#: Progetto VTT attuale (JS/HTML/CSS): la cartella padre di god_mode_hub,
#: cioè la radice del repo (index.html, css/, js/, tools/).
VTT_PROJECT_DIR: Final[Path] = HUB_ROOT.parent

#: Output di Asset Forge.
ASSET_FORGE_DIR: Final[Path] = HUB_ROOT / "asset_forge"
CHARACTERS_DIR: Final[Path] = ASSET_FORGE_DIR / "characters"
TOKENS_DIR: Final[Path] = ASSET_FORGE_DIR / "tokens"
ANIMATIONS_DIR: Final[Path] = ASSET_FORGE_DIR / "animations"

#: Indice persistente di ChromaDB (ricostruibile, escluso da git).
CHROMA_DIR: Final[Path] = HUB_ROOT / "chroma_index"

ALL_DIRS: Final[tuple[Path, ...]] = (
    RAW_DIR,
    WIKI_DIR,
    WIKI_SOURCES_DIR,
    WIKI_CONCEPTS_DIR,
    WIKI_ENTITIES_DIR,
    CODEBASE_DIR,
    ASSET_FORGE_DIR,
    CHARACTERS_DIR,
    TOKENS_DIR,
    ANIMATIONS_DIR,
    CHROMA_DIR,
)


def ensure_dirs() -> None:
    """Crea tutte le directory di lavoro dell'Hub se non esistono."""
    for directory in ALL_DIRS:
        directory.mkdir(parents=True, exist_ok=True)


def slugify(text: str, max_length: int = 64) -> str:
    """Converte testo libero in uno slug sicuro per nomi di file.

    Args:
        text: testo arbitrario (es. nome di un personaggio).
        max_length: lunghezza massima dello slug risultante.

    Returns:
        Slug ascii minuscolo composto da ``[a-z0-9_]``, mai vuoto.
    """
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_text).strip("_").lower()
    return slug[:max_length] or "senza_nome"


def human_size(num_bytes: int) -> str:
    """Formatta una dimensione in byte in modo leggibile (es. ``1.4 MB``)."""
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024.0 or unit == "GB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024.0
    return f"{size:.1f} GB"
