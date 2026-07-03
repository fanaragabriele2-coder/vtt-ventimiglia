"""🧠 Secondo Cervello — RAG sulla codebase Flutter + LLM Wiki con FTS5."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_HUB_ROOT = Path(__file__).resolve().parents[1]
if str(_HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(_HUB_ROOT))

st.set_page_config(page_title="Secondo Cervello — God-Mode Hub", page_icon="🧠", layout="wide")

from utils import CODEBASE_DIR, RAW_DIR, ensure_dirs  # noqa: E402
from utils import chroma_rag, llm_wiki  # noqa: E402

ensure_dirs()

st.title("🧠 Secondo Cervello")
st.caption(
    "RAG locale (ChromaDB + all-MiniLM-L6-v2) sulla codebase Flutter e "
    "LLM Wiki (FTS5 + RRF, zero embeddings) sugli appunti personali."
)

tab_rag, tab_wiki = st.tabs(["🔎 RAG codebase", "📖 LLM Wiki"])

# ---------------------------------------------------------------------------
# TAB 1 — RAG sulla codebase
# ---------------------------------------------------------------------------
with tab_rag:
    chroma_ok = chroma_rag.is_available()
    indexed = chroma_rag.collection_count() if chroma_ok else 0

    info_col, action_col = st.columns([3, 1])
    with info_col:
        if not chroma_ok:
            st.warning(
                "ChromaDB non è installato: le query useranno il **fallback "
                "full-text** sui file. Per il RAG vettoriale: "
                "`pip install -r requirements.txt`.",
                icon="⚠️",
            )
        else:
            st.info(f"Chunk indicizzati: **{indexed}** · cartella `codebase/`", icon="📦")
    with action_col:
        if st.button("📥 (Re)indicizza codebase", use_container_width=True, disabled=not chroma_ok):
            with st.spinner("Indicizzazione in corso (il primo avvio scarica il modello di embedding)…"):
                try:
                    stats = chroma_rag.ingest_codebase()
                except Exception as exc:  # noqa: BLE001 — mostrato all'utente
                    st.error(f"Indicizzazione fallita: {exc}")
                else:
                    st.success(f"Indicizzati {stats.files} file → {stats.chunks} chunk.")
                    if stats.skipped:
                        st.caption("Saltati: " + ", ".join(stats.skipped[:10]))
                    st.rerun()

    query = st.text_input(
        "Domanda sulla codebase",
        placeholder="es. Dove viene gestito il movimento dei token sulla griglia?",
        key="rag_query",
    )
    top_k = st.slider("Risultati (top_k)", min_value=3, max_value=20, value=10, key="rag_topk")

    if query:
        with st.spinner("Ricerca in corso…"):
            try:
                hits = chroma_rag.query_codebase(query, top_k=top_k)
            except Exception as exc:  # noqa: BLE001
                st.error(f"Query fallita: {exc}")
                hits = []
        if not hits:
            st.info(
                "Nessun risultato. La cartella `codebase/` è vuota? Copia lì i "
                "sorgenti Flutter del VTT e reindicizza."
            )
        for hit in hits:
            badge = "🟣 vettoriale" if hit.source == "chroma" else "🔤 full-text"
            with st.expander(f"`{hit.path}` · riga {hit.start_line} · score {hit.score} · {badge}"):
                language = "dart" if hit.path.endswith(".dart") else "python"
                st.code(hit.snippet, language=language)

# ---------------------------------------------------------------------------
# TAB 2 — LLM Wiki
# ---------------------------------------------------------------------------
with tab_wiki:
    wiki_docs = llm_wiki.index_size()

    info_col2, action_col2 = st.columns([3, 1])
    with info_col2:
        st.info(f"Documenti nell'indice FTS5: **{wiki_docs}** · `wiki/` + `raw/`", icon="🗂️")
    with action_col2:
        if st.button("🧱 Ricostruisci indice FTS5", use_container_width=True):
            try:
                count = llm_wiki.rebuild_index()
            except RuntimeError as exc:
                st.error(str(exc))
            else:
                st.success(f"Indicizzati {count} documenti.")
                st.rerun()

    wiki_query = st.text_input(
        "Cerca nella wiki e nelle note",
        placeholder="es. dimensioni token large 5e",
        key="wiki_query",
    )
    if wiki_query:
        try:
            results = llm_wiki.search(wiki_query, top_k=10)
        except RuntimeError as exc:
            st.error(str(exc))
            results = []
        if not results:
            st.info("Nessun risultato: hai già costruito l'indice FTS5?")
        for hit in results:
            icon = "📖" if hit.kind == "wiki" else "📝"
            with st.expander(f"{icon} **{hit.title}** · `{hit.path}` · RRF {hit.score}"):
                st.markdown(hit.snippet)

    st.divider()
    st.subheader("🛠️ Compila fonti grezze → wiki")
    st.caption(
        "Pattern LLM Wiki: ogni fonte in `raw/` diventa una pagina curata in "
        "`wiki/sources/` (estratto + TODO di sintesi da completare via Orchestratore)."
    )
    raw_files = llm_wiki.list_raw_files()
    if not raw_files:
        st.info(f"Nessuna fonte in `{RAW_DIR.name}/`: aggiungi note .md/.txt, PDF o screenshot.")
    else:
        selected = st.multiselect(
            "Fonti da compilare",
            options=[p.name for p in raw_files],
            key="raw_select",
        )
        if st.button("⚙️ Compila selezionate", disabled=not selected):
            compiled: list[str] = []
            for path in raw_files:
                if path.name in selected:
                    try:
                        page = llm_wiki.compile_raw_source(path)
                        compiled.append(page.name)
                    except OSError as exc:
                        st.error(f"{path.name}: {exc}")
            if compiled:
                llm_wiki.rebuild_index()
                st.success("Compilate: " + ", ".join(f"`sources/{n}`" for n in compiled))

    st.divider()
    st.subheader("🧹 Linting wiki")
    if st.button("🔍 Esegui linting (link orfani + contraddizioni)"):
        with st.spinner("Analisi delle pagine…"):
            report = llm_wiki.lint_wiki()
        st.write(f"Pagine analizzate: **{report.pages_scanned}**")
        if report.orphan_links:
            st.warning(f"Link orfani: {len(report.orphan_links)}")
            for page, link in report.orphan_links[:30]:
                st.markdown(f"- `{page}` → `{link}`")
        else:
            st.success("Nessun link orfano. 🎉")
        if report.contradictions:
            st.warning(f"Possibili contraddizioni (euristica): {len(report.contradictions)}")
            for page_a, line_a, page_b, line_b in report.contradictions[:15]:
                st.markdown(f"- `{page_a}`: “{line_a}”\n  vs `{page_b}`: “{line_b}”")
        else:
            st.success("Nessuna contraddizione rilevata dall'euristica.")

with st.sidebar:
    st.header("🧠 Secondo Cervello")
    st.markdown(
        f"- Codebase: `{CODEBASE_DIR.name}/`\n"
        f"- Note grezze: `{RAW_DIR.name}/`\n"
        "- RAG: ChromaDB + MiniLM (locale)\n"
        "- Wiki: SQLite FTS5 + RRF"
    )
