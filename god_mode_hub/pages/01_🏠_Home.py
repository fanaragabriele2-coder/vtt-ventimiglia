"""🏠 Home — dashboard dello stato del progetto (contenuti, asset, attività)."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_HUB_ROOT = Path(__file__).resolve().parents[1]
if str(_HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(_HUB_ROOT))

st.set_page_config(page_title="Home — God-Mode Hub", page_icon="🏠", layout="wide")

from utils import (  # noqa: E402
    ANIMATIONS_DIR,
    CHARACTERS_DIR,
    CODEBASE_DIR,
    RAW_DIR,
    TOKENS_DIR,
    WIKI_DIR,
    ensure_dirs,
    human_size,
)

ensure_dirs()


def _count(directory: Path, patterns: tuple[str, ...]) -> int:
    """Conta i file che corrispondono ai pattern glob sotto ``directory``."""
    if not directory.exists():
        return 0
    return sum(len(list(directory.rglob(p))) for p in patterns)


def _safe_page_link(page: str, label: str, icon: str) -> None:
    """``st.page_link`` con fallback testuale se il registro pagine è assente
    (accade nei test o eseguendo la singola pagina fuori dall'app)."""
    try:
        st.page_link(page, label=label, icon=icon)
    except Exception:  # noqa: BLE001 — solo degradazione grafica
        st.markdown(f"{icon} {label}")


st.title("🏠 Home — Stato del progetto")

c1, c2, c3 = st.columns(3)
c1.metric("📝 Note grezze (raw/)", _count(RAW_DIR, ("*.md", "*.txt", "*.pdf", "*.png", "*.jpg")))
c2.metric("📖 Pagine wiki", _count(WIKI_DIR, ("*.md",)))
c3.metric("💻 File codebase (.dart/.py)", _count(CODEBASE_DIR, ("*.dart", "*.py")))

c4, c5, c6 = st.columns(3)
c4.metric("🎨 Token generati", _count(TOKENS_DIR, ("*.png", "*.glb")))
c5.metric("👤 Personaggi", _count(CHARACTERS_DIR, ("*.png", "*.glb")))
c6.metric("🎬 Animazioni", _count(ANIMATIONS_DIR, ("*.gif", "*.mp4", "*.png")))

st.divider()

left, right = st.columns([3, 2])

with left:
    st.subheader("📜 Attività recente (wiki/log.md)")
    log_path = WIKI_DIR / "log.md"
    if log_path.exists():
        lines = [
            line for line in log_path.read_text(encoding="utf-8").splitlines()
            if line.strip().startswith("-")
        ]
        if lines:
            st.markdown("\n".join(lines[-10:]))
        else:
            st.caption("Nessuna attività registrata: compila una fonte o usa la Drop Zone.")
    else:
        st.caption("Il log verrà creato alla prima attività.")

with right:
    st.subheader("💻 Ultimi file in codebase/")
    files = sorted(
        (p for pat in ("*.dart", "*.py") for p in CODEBASE_DIR.rglob(pat)),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )[:8]
    if files:
        for path in files:
            rel = path.relative_to(CODEBASE_DIR).as_posix()
            st.markdown(f"- `{rel}` · {human_size(path.stat().st_size)}")
    else:
        st.caption(
            "Vuota: copia qui la codebase Flutter del VTT oppure salva codice "
            "dalla Drop Zone dell'Orchestratore."
        )

st.divider()
st.subheader("⚡ Azioni rapide")
a1, a2, a3 = st.columns(3)
with a1:
    _safe_page_link("pages/02_🧠_Secondo_Cervello.py", "Indicizza / interroga", "🧠")
with a2:
    _safe_page_link("pages/03_⚙️_Orchestratore.py", "Nuovo mega-prompt", "⚙️")
with a3:
    _safe_page_link("pages/04_🎨_Asset_Forge.py", "Nuovo token VTT", "🎨")

with st.sidebar:
    st.header("🏠 Home")
    st.caption("Dashboard del God-Mode Local AI Hub.")
