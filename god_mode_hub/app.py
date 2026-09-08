"""God-Mode Local AI Hub — entry point Streamlit.

Avvio:  ``streamlit run app.py``  (dalla cartella ``god_mode_hub/``).
Le pagine in ``pages/`` vengono scoperte automaticamente da Streamlit.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import streamlit as st

_HUB_ROOT = Path(__file__).resolve().parent
if str(_HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(_HUB_ROOT))

st.set_page_config(
    page_title="God-Mode Local AI Hub",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded",
)

from utils import ensure_dirs  # noqa: E402
from utils import sd_api  # noqa: E402

ensure_dirs()


@st.cache_data(ttl=30)
def _component_status() -> dict[str, Any]:
    """Verifica lo stato dei componenti locali (cache 30s per non pesare)."""
    from utils import chroma_rag, llm_wiki, triposr_helpers

    sd_url, sd_can_generate = sd_api.find_webui_cached()
    return {
        "chromadb": chroma_rag.is_available(),
        "sd_api": sd_can_generate,
        "sd_found_no_api": sd_url is not None and not sd_can_generate,
        "sd_port": sd_url.rsplit(":", 1)[-1] if sd_url else None,
        "triposr": triposr_helpers.triposr_available(),
        "trellis": triposr_helpers.trellis_available(),
        "wiki_index": llm_wiki.index_size() > 0,
    }


st.title("🚀 God-Mode Local AI Hub")
st.caption(
    "Hub 100% locale per il VTT Flutter: Secondo Cervello (RAG + LLM Wiki), "
    "Orchestratore copy-paste per Claude/Gemini web, Asset Forge 2D→3D, "
    "personaggi e animazioni. Nessuna API cloud a pagamento."
)

status = _component_status()
ICONS = {True: "🟢", False: "🔴"}

col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("ChromaDB", ICONS[status["chromadb"]] + " installato" if status["chromadb"] else "🔴 assente")
if status["sd_api"]:
    _sd_label = f"🟢 :{status['sd_port']}"
elif status["sd_found_no_api"]:
    _sd_label = "🟠 no --api"
else:
    _sd_label = "🔴 offline"
col2.metric("Stable Diffusion", _sd_label)
col3.metric("TripoSR", ICONS[status["triposr"]] + (" pronto" if status["triposr"] else " non trovato"))
col4.metric("TRELLIS.2", ICONS[status["trellis"]] + (" configurato" if status["trellis"] else " opzionale"))
col5.metric("Indice Wiki", ICONS[status["wiki_index"]] + (" attivo" if status["wiki_index"] else " da costruire"))

if status["sd_found_no_api"]:
    st.warning(
        f"🟠 **Stable Diffusion è avviato (porta {status['sd_port']}) ma senza "
        "`--api`.** La WebUI grafica funziona, ma l'Hub genera via API e "
        "l'endpoint `/sdapi/v1/txt2img` non è montato. Aggiungi `--api` agli "
        "argomenti del tuo launcher (es. la riga `set COMMANDLINE_ARGS=...` in "
        "`Avvia_StableDiffusion.bat`) e riavvia Stable Diffusion.",
        icon="🎨",
    )
elif not status["sd_api"]:
    st.info(
        "💡 **Stable Diffusion non trovato** — l'Hub ha provato automaticamente "
        "le porte comuni (7860-7866, 8000, 8080) senza successo. Avvia la tua "
        "WebUI per abilitare Asset Forge e Generatore Personaggi. L'Hub resta "
        "comunque utilizzabile per RAG, Wiki e Orchestratore.",
        icon="🎨",
    )

st.divider()
st.subheader("Moduli")

left, right = st.columns(2)
with left:
    st.page_link("pages/01_🏠_Home.py", label="Home — dashboard e stato progetto", icon="🏠")
    st.page_link("pages/02_🧠_Secondo_Cervello.py", label="Secondo Cervello — RAG codebase + LLM Wiki", icon="🧠")
    st.page_link("pages/03_⚙️_Orchestratore.py", label="Orchestratore — Mega-Prompt + Drop Zone", icon="⚙️")
with right:
    st.page_link("pages/04_🎨_Asset_Forge.py", label="Asset Forge — token VTT 2D → 3D (.glb)", icon="🎨")
    st.page_link("pages/05_👤_Generatore_Personaggi.py", label="Generatore Personaggi — 2D → 3D", icon="👤")
    st.page_link("pages/06_🎬_Animazioni.py", label="Animazioni — sprite sheet, GIF/MP4, rigging", icon="🎬")

st.divider()
st.markdown(
    """
**Flusso di lavoro tipico**

1. 🧠 Indicizza la codebase Flutter (`codebase/`) e le note (`raw/` → `wiki/`).
2. ⚙️ Genera un **mega-prompt** con contesto RAG/Wiki, incollalo in Claude/Gemini **web**.
3. ⚙️ Incolla la risposta nella **Drop Zone**: i file `.dart`/`.py` finiscono in
   `codebase/`, le pagine `.md` in `wiki/`, automaticamente.
4. 🎨 Genera token e personaggi 2D con Stable Diffusion locale e convertili in
   `.glb` con TripoSR per il VTT.
"""
)

with st.sidebar:
    st.header("🚀 God-Mode Hub")
    st.caption("100% locale · RTX 5080 · zero API cloud")
    if st.button("🔄 Ricontrolla componenti", use_container_width=True):
        _component_status.clear()
        sd_api.clear_status_cache()  # forza una nuova scansione delle porte
        st.rerun()
