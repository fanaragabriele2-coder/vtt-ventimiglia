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
    from utils import chroma_rag, llm_wiki, rigging, sd_browser, triposr_helpers, vtt_project

    sd_url, sd_can_generate = sd_api.find_webui_cached()
    return {
        "chromadb": chroma_rag.is_available(),
        "sd_api": sd_can_generate,
        "sd_found_no_api": sd_url is not None and not sd_can_generate,
        "sd_port": sd_url.rsplit(":", 1)[-1] if sd_url else None,
        "sd_browser": sd_url is not None and sd_browser.is_playwright_installed(),
        "triposr": triposr_helpers.triposr_available(),
        "trellis": triposr_helpers.trellis_available(),
        "wiki_index": llm_wiki.index_size() > 0,
        "node": vtt_project.node_available(),
        "blender": rigging.blender_available(),
    }


st.title("🚀 God-Mode Local AI Hub")
st.caption(
    "Hub 100% locale per il VTT (JavaScript/HTML/CSS): Secondo Cervello "
    "(RAG + LLM Wiki), "
    "Orchestratore copy-paste per Claude/Gemini web, Asset Forge 2D→3D, "
    "personaggi e animazioni. Nessuna API cloud a pagamento."
)

status = _component_status()
ICONS = {True: "🟢", False: "🔴"}

# NB: le colonne tagliano i valori oltre ~10 caratteri con "…". Valori brevi,
# spiegazione per esteso nel tooltip (?), che non viene mai troncato.
col1, col2, col3, col4, col5 = st.columns(5)
col1.metric(
    "ChromaDB", "🟢 pronto" if status["chromadb"] else "🔴 assente",
    help="RAG vettoriale sulla codebase. Senza, le ricerche usano il fallback "
         "full-text: più grezzo ma sempre funzionante.",
)
if status["sd_api"]:
    _sd_label, _sd_help = f"🟢 :{status['sd_port']}", "API di generazione attiva: tutto disponibile."
elif status["sd_found_no_api"]:
    _sd_label = "🟠 no api"
    _sd_help = ("WebUI trovata ma senza --api. Genera lo stesso con "
                "'Automazione browser' in Asset Forge.")
else:
    _sd_label = "🔴 offline"
    _sd_help = ("Nessuna WebUI sulle porte comuni (7860-7866, 8000, 8080). "
                "Avviala, o imposta SD_API_URL se usa un'altra porta.")
col2.metric("Stable Diffusion", _sd_label, help=_sd_help)
col3.metric(
    "TripoSR", "🟢 pronto" if status["triposr"] else "🔴 assente",
    help="Conversione immagine → modello 3D .glb. Installalo con "
         "tools/FIX_TRIPOSR.bat.",
)
col4.metric(
    "TRELLIS.2", "🟢 pronto" if status["trellis"] else "⚪ assente",
    help="Image-to-3D di qualità superiore, opzionale: serve un servizio "
         "locale puntato da TRELLIS_URL. Senza, si usa TripoSR.",
)
col5.metric(
    "Indice Wiki", "🟢 attivo" if status["wiki_index"] else "🔴 vuoto",
    help="Ricerca FTS5 su wiki/ e raw/. Costruiscilo dal Secondo Cervello → "
         "tab LLM Wiki.",
)

# Seconda riga: strumenti opzionali. Nessuno di questi blocca l'Hub — servono
# a capire a colpo d'occhio quali funzioni sono disponibili adesso.
opt1, opt2, opt3, opt4, opt5 = st.columns(5)
opt1.metric(
    "Automaz. browser", "🟢 pronta" if status["sd_browser"] else "⚪ assente",
    help="Genera con Stable Diffusion SENZA --api, pilotando la WebUI già "
         "aperta. Richiede Playwright installato e una WebUI in esecuzione.",
)
opt2.metric(
    "Node.js", "🟢 pronto" if status["node"] else "⚪ assente",
    help="Serve per l'anteprima del VTT e per rigenerare il file unico "
         "dist/ultimate-vtt.html dalla pagina Progetto VTT.",
)
opt3.metric(
    "Blender", "🟢 pronto" if status["blender"] else "⚪ assente",
    help="Rigging scheletrico dei modelli 3D (ossa + pesi + idle). Senza, "
         "resta comunque l'animazione procedurale, che funziona sempre.",
)
opt4.metric(
    "Movimento 3D", "🟢 sempre",
    help="Rotazione, fluttuazione e pulsazione dei .glb scritte direttamente "
         "nel glTF: Python puro, nessuna installazione richiesta.",
)
opt5.metric(
    "Rete sicurezza", "🟢 attiva",
    help="Backup automatico, diff e allarme troncatura su ogni scrittura "
         "della Drop Zone nei file reali del progetto.",
)

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
    st.page_link("pages/07_🌐_Progetto_VTT.py", label="Progetto VTT — anteprima, git, import asset", icon="🌐")

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
5. 🌐 Apri **Progetto VTT**: avvia l'anteprima del gioco, controlla il `git diff`
   di quello che la Drop Zone ha appena scritto, committa se funziona e importa
   gli asset generati.
"""
)

with st.sidebar:
    st.header("🚀 God-Mode Hub")
    st.caption("100% locale · RTX 5080 · zero API cloud")
    if st.button("🔄 Ricontrolla componenti", use_container_width=True):
        _component_status.clear()
        sd_api.clear_status_cache()  # forza una nuova scansione delle porte
        st.rerun()
