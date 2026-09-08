"""⚙️ Orchestratore — Mega-Prompt con contesto RAG/Wiki + Drop Zone.

Ponte manuale verso gli abbonamenti Pro (Claude/Gemini/Perplexity via chat
web, MAI via API): genera un mega-prompt ricco di contesto locale, incolla la
risposta nella Drop Zone e i file vengono salvati automaticamente. I blocchi
``.js``/``.css``/``.html`` finiscono **direttamente nel progetto VTT reale**
(radice del repo), i blocchi ``.dart``/``.py`` in ``codebase/`` (futuro
riscritto Flutter), le pagine ```markdown in ``wiki/``.
"""

from __future__ import annotations

import datetime as _dt
import sys
from pathlib import Path

import streamlit as st

_HUB_ROOT = Path(__file__).resolve().parents[1]
if str(_HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(_HUB_ROOT))

st.set_page_config(page_title="Orchestratore — God-Mode Hub", page_icon="⚙️", layout="wide")

from utils import VTT_PROJECT_DIR, ensure_dirs  # noqa: E402
from utils import chroma_rag, drop_zone_parser, llm_wiki, safe_write  # noqa: E402

ensure_dirs()

OUTPUT_CONTRACT = """\
## Contratto di output (OBBLIGATORIO)

1. Rispondi SOLO con blocchi di codice recintati (```), senza testo fuori dai blocchi
   se non brevissime note.
2. Ogni blocco di CODICE deve avere come PRIMA riga un commento con il percorso
   file completo relativo alla radice del progetto, ad esempio:
   - JavaScript: `// js/15-nuovo-modulo.js`
   - CSS:        `/* css/10-nuovo-stile.css */`
   - HTML:       `<!-- index.html -->`
   - Dart (futuro riscritto Flutter): `// lib/widgets/token_layer.dart`
   - Python: `# utils/export_assets.py`
3. Le pagine WIKI vanno in blocchi ```markdown con prima riga
   `<!-- wiki/concepts/nome_pagina.md -->` (cartelle valide: sources/, concepts/, entities/).
4. File completi, mai diff o frammenti con "...".
5. Niente citazioni o riferimenti tra parentesi quadre (es. [1], [2]) DENTRO i
   blocchi di codice o wiki. Se il tuo strumento le aggiunge in automatico
   (tipico di Perplexity in modalità Ricerca), rimuovile dal codice prima di
   rispondere: dentro un file .js/.py/.md rompono la sintassi o sporcano il
   testo. Vanno bene solo nel testo libero fuori dai blocchi, se proprio servono.
"""


def _build_mega_prompt(
    task: str,
    role: str,
    rag_chunks: int,
    wiki_chunks: int,
    include_rag: bool,
    include_wiki: bool,
) -> str:
    """Assembla il mega-prompt: ruolo + task + contesto locale + contratto."""
    sections: list[str] = [
        f"# MEGA-PROMPT — God-Mode Local AI Hub ({_dt.date.today().isoformat()})",
        f"\n## Ruolo\n{role}",
        f"\n## Task\n{task}",
    ]
    if include_rag:
        hits = chroma_rag.query_codebase(task, top_k=rag_chunks)
        if hits:
            parts = ["\n## Contesto dalla codebase (RAG locale)"]
            for hit in hits:
                parts.append(
                    f"\n### `{hit.path}` (dalla riga {hit.start_line})\n"
                    f"```\n{hit.snippet}\n```"
                )
            sections.append("\n".join(parts))
        else:
            sections.append(
                "\n## Contesto dalla codebase\n(nessun risultato RAG: codebase vuota o indice assente)"
            )
    if include_wiki:
        try:
            wiki_hits = llm_wiki.search(task, top_k=wiki_chunks)
        except RuntimeError:
            wiki_hits = []
        if wiki_hits:
            parts = ["\n## Contesto dalla wiki personale"]
            for hit in wiki_hits:
                parts.append(f"\n### {hit.title} (`{hit.path}`)\n{hit.snippet}")
            sections.append("\n".join(parts))
    sections.append("\n" + OUTPUT_CONTRACT)
    return "\n".join(sections)


st.title("⚙️ Orchestratore")
st.caption(
    "Mega-prompt → chat web di Claude, Gemini o Perplexity (abbonamento Pro, "
    "niente API) → risposta nella Drop Zone → `.js/.css/.html` salvati nel "
    "progetto VTT reale, `.dart/.py` in `codebase/`, pagine wiki in `wiki/`."
)

PERPLEXITY_TIP = (
    "💡 **Su Perplexity**: se hai la modalità **Ricerca/Search web** attiva, "
    "il modello tende a inserire citazioni `[1]`, `[2]` anche dentro il codice. "
    "Il contratto di output qui sotto lo vieta esplicitamente, ma è più "
    "affidabile disattivare la Ricerca (o usare **Focus → Scrittura**) e "
    "scegliere il modello che preferisci nel selettore in alto a sinistra "
    "della chat (es. GPT, Claude, Sonar) prima di incollare il mega-prompt."
)
target = st.radio(
    "Destinazione del mega-prompt",
    options=["Claude", "Gemini", "Perplexity", "Altro"],
    horizontal=True,
    help="Solo per mostrarti il suggerimento giusto qui sotto: il mega-prompt è identico per tutti.",
)
if target == "Perplexity":
    st.info(PERPLEXITY_TIP, icon="🔎")

tab_prompt, tab_drop = st.tabs(["📝 Mega-Prompt", "📥 Drop Zone"])

# ---------------------------------------------------------------------------
# TAB 1 — Generazione mega-prompt
# ---------------------------------------------------------------------------
with tab_prompt:
    role = st.text_input(
        "Ruolo per l'LLM",
        value=(
            "Sei un Senior JavaScript/HTML/CSS engineer che lavora sul Virtual "
            "Tabletop \"Ultimate VTT 5e — Tavolo Oscuro di Ventimiglia\" "
            "(vanilla JS modulare, window.UltimateVTT*). Scrivi codice "
            "production-ready, commentato in italiano, coerente con lo stile "
            "esistente in js/ e css/."
        ),
    )
    task = st.text_area(
        "Task da svolgere",
        height=160,
        placeholder=(
            "es. Aggiungi lo snap alla griglia quando si trascina un token "
            "sulla mappa in js/…-combattimento.js…"
        ),
    )
    col_a, col_b, col_c, col_d = st.columns(4)
    include_rag = col_a.toggle("Contesto RAG codebase", value=True)
    include_wiki = col_b.toggle("Contesto Wiki", value=True)
    rag_chunks = col_c.slider("Chunk RAG", 1, 10, 5)
    wiki_chunks = col_d.slider("Pagine wiki", 1, 10, 3)

    if st.button("🧩 Genera Mega-Prompt", type="primary", disabled=not task.strip()):
        with st.spinner("Raccolta contesto locale…"):
            try:
                st.session_state["mega_prompt"] = _build_mega_prompt(
                    task.strip(), role.strip(), rag_chunks, wiki_chunks,
                    include_rag, include_wiki,
                )
            except Exception as exc:  # noqa: BLE001
                st.error(f"Generazione fallita: {exc}")

    mega = st.session_state.get("mega_prompt", "")
    if mega:
        st.success(f"Mega-prompt pronto: {len(mega):,} caratteri.")
        st.download_button(
            "⬇️ Scarica mega_prompt.md",
            data=mega.encode("utf-8"),
            file_name="mega_prompt.md",
            mime="text/markdown",
            use_container_width=True,
        )
        st.caption("Oppure copia dal riquadro (icona 📋 in alto a destra) e incolla nella chat web.")
        st.code(mega, language="markdown")

# ---------------------------------------------------------------------------
# TAB 2 — Drop Zone
# ---------------------------------------------------------------------------
with tab_drop:
    st.markdown(
        "Incolla qui la **risposta completa** di Claude, Gemini o Perplexity. "
        "Il parser estrae i code block (`.js`, `.css`, `.html`, `.dart`, `.py`, …) "
        "e le pagine wiki (```markdown) e li salva nei posti giusti — i blocchi "
        "`.js/.css/.html` **direttamente nel progetto VTT reale** "
        f"(`{VTT_PROJECT_DIR.name}/`), revisionabili con `git diff` prima di committare."
    )
    dropped = st.text_area("Risposta LLM", height=380, key="drop_text",
                           placeholder="Incolla qui il Markdown della risposta…")

    if st.button("🔍 Analizza risposta", disabled=not dropped.strip()):
        blocks = drop_zone_parser.extract_blocks(dropped)
        st.session_state["parsed_blocks"] = blocks
        if not blocks:
            st.warning("Nessun blocco recintato trovato nel testo incollato.")

    blocks = st.session_state.get("parsed_blocks", [])
    if blocks:
        st.subheader(f"Blocchi trovati: {len(blocks)}")
        selected_indices: list[int] = []
        for i, block in enumerate(blocks):
            kind_icon = {"code": "💻", "wiki": "📖", "other": "❔"}[block.kind]
            header = (
                f"{kind_icon} Blocco {i + 1} · {block.language or 'lingua ?'} · "
                f"{block.line_count} righe · {block.kind}"
            )
            with st.expander(header, expanded=block.kind != "other"):
                new_path = st.text_input(
                    "Percorso di destinazione (relativo)",
                    value=block.suggested_path,
                    key=f"path_{i}",
                    help=(
                        "Vuoto = nome autogenerato. .js/.css/.html → radice del progetto VTT "
                        "reale; .dart/.py → codebase/; .md → wiki/. Prefissi codebase/ e wiki/ "
                        "gestiti automaticamente."
                    ),
                )
                block.suggested_path = new_path.strip()
                # Il percorso può cambiare la classificazione (es. aggiungo .md).
                block.kind = drop_zone_parser._classify(block.language, block.suggested_path)  # noqa: SLF001

                # --- Anteprima dell'impatto sul disco (nessuna scrittura) ---
                destinazione = drop_zone_parser.resolve_destination(block, i)
                sicuro = True
                if destinazione is not None:
                    if safe_write.is_protected(destinazione):
                        st.error(
                            f"🚫 `{destinazione}` è in un'area protetta "
                            "(.git/, node_modules/, dist/, .venv/): non verrà salvato.",
                            icon="🛡️",
                        )
                        sicuro = False
                    else:
                        diff = safe_write.diff_against_existing(destinazione, block.content)
                        if not diff.exists:
                            st.success(f"🆕 Crea un file nuovo · {diff.new_bytes} B", icon="✅")
                        elif diff.is_identical:
                            st.caption("➖ Identico al file esistente: nessuna modifica.")
                        else:
                            st.warning(
                                f"♻️ **Sovrascrive un file esistente**: "
                                f"{diff.old_bytes} B → {diff.new_bytes} B "
                                f"(+{diff.added_lines} / −{diff.removed_lines} righe). "
                                "Verrà fatto un backup automatico.",
                                icon="📝",
                            )
                        if diff.looks_truncated:
                            motivi = []
                            if diff.ellipsis_markers:
                                motivi.append(
                                    "contiene marcatori di codice omesso: "
                                    + ", ".join(f"`{m}`" for m in diff.ellipsis_markers[:3])
                                )
                            if diff.exists and diff.shrink_ratio < safe_write.SHRINK_RATIO_THRESHOLD:
                                motivi.append(
                                    f"il file si riduce al {diff.shrink_ratio:.0%} "
                                    "della dimensione originale"
                                )
                            st.error(
                                "⚠️ **Risposta probabilmente TRONCATA** — "
                                + "; ".join(motivi)
                                + ". Salvando perderesti codice funzionante: chiedi all'LLM "
                                "il file completo prima di procedere.",
                                icon="✂️",
                            )
                        if diff.unified_diff:
                            with st.expander("🔍 Vedi diff riga per riga"):
                                st.code(diff.unified_diff[:20000], language="diff")

                default_incluso = block.kind != "other" and sicuro
                include = st.checkbox("Salva questo blocco", value=default_incluso, key=f"inc_{i}")
                if include and block.kind != "other" and sicuro:
                    selected_indices.append(i)
                preview = block.content if block.line_count <= 60 else (
                    "\n".join(block.content.splitlines()[:60]) + "\n… (troncato)"
                )
                st.code(preview, language=block.language or None)

        reindex_after = st.checkbox("Reindicizza RAG + Wiki dopo il salvataggio", value=True)
        if st.button("💾 Salva su disco", type="primary", disabled=not selected_indices):
            to_save = [blocks[i] for i in selected_indices]
            try:
                saved = drop_zone_parser.save_blocks(to_save)
            except OSError as exc:
                st.error(f"Salvataggio fallito: {exc}")
                saved = []
            if saved:
                st.success(f"Salvati {len(saved)} file:")
                for item in saved:
                    rel = item.path.relative_to(VTT_PROJECT_DIR).as_posix()
                    backup_nota = " · 💾 backup salvato" if item.backup_path else ""
                    st.markdown(f"- `{rel}` ({item.action}, {item.bytes_written} B){backup_nota}")
                wiki_saved = [s for s in saved if s.kind == "wiki"]
                if wiki_saved:
                    llm_wiki.append_log(
                        f"Drop Zone: salvate {len(wiki_saved)} pagine wiki"
                    )
                safe_write.prune_backups()  # tiene le 20 sessioni più recenti
                if reindex_after:
                    with st.spinner("Reindicizzazione…"):
                        try:
                            llm_wiki.rebuild_index()
                            if chroma_rag.is_available() and any(s.kind == "code" for s in saved):
                                chroma_rag.ingest_all()
                        except Exception as exc:  # noqa: BLE001
                            st.warning(f"Reindicizzazione parziale: {exc}")
                st.session_state.pop("parsed_blocks", None)

    # -----------------------------------------------------------------------
    # Ripristino: annullare un salvataggio andato male
    # -----------------------------------------------------------------------
    st.divider()
    with st.expander("↩️ Ripristina da backup (annulla un salvataggio)"):
        st.caption(
            "Ogni sovrascrittura crea una copia del file precedente in "
            "`.hub_backups/<data_ora>/`. Se una risposta dell'LLM ha rovinato "
            "un file, qui torni indietro senza git."
        )
        sessioni = safe_write.list_backup_sessions()
        if not sessioni:
            st.caption("Nessun backup ancora: comparirà dopo la prima sovrascrittura.")
        else:
            etichette = [f"{stamp} — {n} file" for stamp, n in sessioni]
            scelta = st.selectbox("Sessione di backup", etichette, key="backup_choice")
            stamp_scelto = sessioni[etichette.index(scelta)][0]
            if st.button("↩️ Ripristina questa sessione", key="do_restore"):
                try:
                    ripristinati = safe_write.restore_backup_session(stamp_scelto)
                except (FileNotFoundError, OSError) as exc:
                    st.error(f"Ripristino fallito: {exc}")
                else:
                    st.success(f"Ripristinati {len(ripristinati)} file:")
                    for path in ripristinati:
                        st.markdown(f"- `{path.relative_to(VTT_PROJECT_DIR).as_posix()}`")

with st.sidebar:
    st.header("⚙️ Orchestratore")
    st.markdown(
        "1. Genera il mega-prompt\n"
        "2. Incollalo in Claude, Gemini o Perplexity **web**\n"
        "3. Incolla la risposta nella Drop Zone\n"
        "4. Controlla i percorsi e salva"
    )
    st.caption("Zero API cloud: solo copy-paste con i tuoi abbonamenti Pro.")
