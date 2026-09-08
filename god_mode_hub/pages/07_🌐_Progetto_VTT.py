"""🌐 Progetto VTT — anteprima live, controllo git, bundle e import asset.

Chiude il ciclo di lavoro dell'Hub. Prima: l'Orchestratore scriveva nel
progetto reale e Asset Forge generava immagini, ma per *vedere* il risultato,
capire cosa era cambiato e portarlo nel gioco bisognava uscire dall'Hub e
aprire un terminale. Qui invece: **anteprima** del gioco, **diff** di quello
che l'LLM ha appena scritto, **commit** quando funziona, **import** degli
asset generati.
"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_HUB_ROOT = Path(__file__).resolve().parents[1]
if str(_HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(_HUB_ROOT))

st.set_page_config(page_title="Progetto VTT — God-Mode Hub", page_icon="🌐", layout="wide")

from utils import VTT_PROJECT_DIR, ensure_dirs, human_size  # noqa: E402
from utils import git_helpers, vtt_project  # noqa: E402

ensure_dirs()

st.title("🌐 Progetto VTT")
st.caption(
    "Il gioco vero e proprio: avvialo in anteprima, controlla cosa è cambiato "
    "dopo un salvataggio della Drop Zone, committa quando funziona e porta "
    "dentro gli asset generati."
)

tab_anteprima, tab_git, tab_asset = st.tabs(
    ["▶️ Anteprima & Bundle", "🔀 Modifiche (git)", "📦 Import asset"]
)

# ---------------------------------------------------------------------------
# TAB 1 — Anteprima live e file unico
# ---------------------------------------------------------------------------
with tab_anteprima:
    node_ok = vtt_project.node_available()
    in_esecuzione = vtt_project.dev_server_running()
    url = vtt_project.dev_server_url()

    if not node_ok:
        st.warning(
            "🟠 **Node.js non trovato nel PATH.** Serve per l'anteprima e per il "
            "file unico. In alternativa apri `index.html` con un doppio click: "
            "il VTT funziona anche così, solo senza server locale.",
            icon="🌐",
        )

    col_stato, col_azioni = st.columns([2, 1])
    with col_stato:
        if in_esecuzione:
            proprietario = (
                "avviata dall'Hub" if vtt_project.dev_server_owned_by_hub()
                else "già attiva (avviata fuori dall'Hub)"
            )
            st.success(f"🟢 Anteprima attiva su [{url}]({url}) — {proprietario}")
        else:
            st.info("⚪ Anteprima non attiva.", icon="▶️")
    with col_azioni:
        if not in_esecuzione:
            if st.button("▶️ Avvia anteprima", type="primary",
                         disabled=not node_ok, use_container_width=True):
                try:
                    indirizzo = vtt_project.start_dev_server()
                except vtt_project.VTTProjectError as exc:
                    st.error(str(exc))
                else:
                    st.success(f"Avviata su {indirizzo} — apri il link qui sopra.")
                    st.rerun()
        elif vtt_project.dev_server_owned_by_hub():
            if st.button("⏹️ Ferma anteprima", use_container_width=True):
                vtt_project.stop_dev_server()
                st.rerun()
        else:
            st.caption("Fermala dal terminale in cui l'hai avviata.")

    if in_esecuzione:
        st.link_button("🌐 Apri il VTT nel browser", url, use_container_width=True)

    st.divider()
    st.subheader("📦 File unico distribuibile")
    dist_path = VTT_PROJECT_DIR / "dist" / "ultimate-vtt.html"
    if dist_path.is_file():
        stat = dist_path.stat()
        import datetime as _dt
        quando = _dt.datetime.fromtimestamp(stat.st_mtime).strftime("%d/%m/%Y %H:%M")
        st.caption(f"`dist/ultimate-vtt.html` · {human_size(stat.st_size)} · rigenerato il {quando}")
    else:
        st.caption("`dist/ultimate-vtt.html` non ancora generato.")

    st.markdown(
        "Riassembla `index.html` + `css/` + `js/` in un unico file autonomo, "
        "offline, apribile con doppio click: è quello da condividere con chi gioca."
    )
    if st.button("🔨 Rigenera file unico", disabled=not node_ok):
        with st.spinner("Assemblaggio in corso…"):
            esito = vtt_project.build_bundle()
        if esito.ok:
            st.success(f"✅ {esito.message} ({human_size(esito.size_bytes)})")
            if esito.path:
                st.download_button(
                    "⬇️ Scarica ultimate-vtt.html",
                    data=esito.path.read_bytes(),
                    file_name="ultimate-vtt.html",
                    mime="text/html",
                )
        else:
            st.error(esito.message)

# ---------------------------------------------------------------------------
# TAB 2 — Cosa è cambiato (git)
# ---------------------------------------------------------------------------
with tab_git:
    stato = git_helpers.status()

    if not stato.is_repo:
        st.warning(f"🟠 Controllo modifiche non disponibile: {stato.error}", icon="🔀")
    else:
        intestazione, aggiorna = st.columns([3, 1])
        with intestazione:
            st.markdown(f"**Branch:** `{stato.branch or '?'}` · **{len(stato.changes)}** file modificati")
        with aggiorna:
            if st.button("🔄 Aggiorna", use_container_width=True):
                st.rerun()

        if stato.error:
            st.error(stato.error)

        if not stato.has_changes:
            st.success("✅ Nessuna modifica in sospeso: il progetto è allineato all'ultimo commit.")
        else:
            st.caption(
                "Queste sono le modifiche non ancora committate — comprese quelle "
                "appena scritte dalla Drop Zone. Controllale prima di committare."
            )
            selezionati: list[str] = []
            for i, cambio in enumerate(stato.changes):
                icona = "🆕" if cambio.untracked else "✏️"
                with st.expander(f"{icona} `{cambio.path}` · {cambio.descrizione}"):
                    testo_diff = (
                        git_helpers.diff_untracked(cambio.path) if cambio.untracked
                        else git_helpers.diff(path=cambio.path)
                    )
                    st.code(testo_diff or "(nessuna differenza testuale)", language="diff")
                if st.checkbox(f"Includi `{cambio.path}` nel commit", value=True, key=f"git_sel_{i}"):
                    selezionati.append(cambio.path)

            st.divider()
            messaggio = st.text_input(
                "Messaggio di commit",
                placeholder="es. Snap alla griglia nel drag dei token",
                key="git_commit_msg",
            )
            if st.button(
                f"✅ Committa {len(selezionati)} file",
                type="primary",
                disabled=not (selezionati and messaggio.strip()),
            ):
                riuscito, esito = git_helpers.commit(messaggio, paths=selezionati)
                if riuscito:
                    st.success(f"Commit creato: {esito}")
                    st.rerun()
                else:
                    st.error(esito)

        recenti = git_helpers.last_commits(5)
        if recenti:
            st.divider()
            st.markdown("**Ultimi commit**")
            for riga in recenti:
                st.markdown(f"- `{riga}`")

# ---------------------------------------------------------------------------
# TAB 3 — Portare gli asset generati dentro il gioco
# ---------------------------------------------------------------------------
with tab_asset:
    st.markdown(
        "Gli asset generati vivono in `asset_forge/`. Qui li copi in "
        f"`{vtt_project.VTT_ASSETS_DIRNAME}/` dentro il progetto VTT, pronti da "
        "referenziare nel codice del gioco."
    )
    categoria = st.radio(
        "Categoria", options=list(vtt_project.ASSET_CATEGORIES.keys()),
        horizontal=True, key="asset_cat",
    )
    disponibili = vtt_project.list_generated_assets(categoria)

    if not disponibili:
        st.info(
            f"Nessun asset '{categoria}' generato finora: creane in 🎨 Asset Forge, "
            "👤 Generatore Personaggi o 🎬 Animazioni.",
            icon="📦",
        )
    else:
        etichette = [
            f"{p.name} · {human_size(p.stat().st_size)}" for p in disponibili[:50]
        ]
        scelta = st.selectbox("Asset da importare", etichette, key="asset_choice")
        asset = disponibili[etichette.index(scelta)]

        anteprima, azione = st.columns([1, 1])
        with anteprima:
            if asset.suffix.lower() in (".png", ".jpg", ".jpeg", ".gif"):
                st.image(str(asset), width=260)
            else:
                st.caption(f"Nessuna anteprima per `{asset.suffix}`.")
        with azione:
            sovrascrivi = st.checkbox(
                "Sovrascrivi se esiste già",
                value=False,
                help="Disattivato: viene aggiunto un suffisso numerico invece di sostituire.",
            )
            if st.button("📥 Importa nel VTT", type="primary", use_container_width=True):
                try:
                    destinazione = vtt_project.import_asset(
                        asset, categoria, overwrite=sovrascrivi
                    )
                except (vtt_project.VTTProjectError, OSError) as exc:
                    st.error(str(exc))
                else:
                    url_relativo = vtt_project.relative_asset_url(destinazione)
                    st.success(f"Copiato in `{url_relativo}`")
                    st.code(f'<img src="{url_relativo}">', language="html")
                    st.caption(
                        "Usa questo percorso nei moduli `js/` o in `index.html` "
                        "per referenziare l'asset nel gioco."
                    )

    cartella_asset = VTT_PROJECT_DIR / vtt_project.VTT_ASSETS_DIRNAME
    if cartella_asset.exists():
        importati = sorted(p for p in cartella_asset.rglob("*") if p.is_file())
        if importati:
            st.divider()
            st.markdown(f"**Già nel VTT ({len(importati)}):**")
            for p in importati[:20]:
                st.markdown(f"- `{vtt_project.relative_asset_url(p)}` · {human_size(p.stat().st_size)}")

with st.sidebar:
    st.header("🌐 Progetto VTT")
    st.markdown(
        f"- Cartella: `{VTT_PROJECT_DIR.name}/`\n"
        f"- Node.js: {'🟢 disponibile' if vtt_project.node_available() else '🔴 assente'}\n"
        f"- Anteprima: {'🟢 attiva' if vtt_project.dev_server_running() else '⚪ ferma'}\n"
        f"- Git: {'🟢 repository' if git_helpers.is_git_repo() else '🔴 non disponibile'}"
    )
