"""🎨 Asset Forge — token VTT: prompt → Stable Diffusion 2D → TripoSR 3D (.glb)."""

from __future__ import annotations

import datetime as _dt
import sys
from pathlib import Path

import streamlit as st

_HUB_ROOT = Path(__file__).resolve().parents[1]
if str(_HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(_HUB_ROOT))

st.set_page_config(page_title="Asset Forge — God-Mode Hub", page_icon="🎨", layout="wide")

from utils import TOKENS_DIR, ensure_dirs, human_size, slugify  # noqa: E402
from utils import image_tools, prompt_library, sd_api, sd_browser, triposr_helpers  # noqa: E402

ensure_dirs()

st.title("🎨 Asset Forge — Token VTT")
st.caption(
    "Genera token top-down con Stable Diffusion locale (rilevata in autonomia "
    "su più porte) e convertili in modelli 3D `.glb` con TripoSR. Output in "
    "`asset_forge/tokens/`."
)

sd_url, sd_online = sd_api.find_webui_cached()
playwright_ready = sd_browser.is_playwright_installed()
browser_usable = sd_url is not None and playwright_ready

if sd_online:
    st.caption(f"🟢 Stable Diffusion pronto su `{sd_url}` (API di generazione attiva)")
elif sd_url is not None:
    st.warning(
        f"🟠 **WebUI trovata su `{sd_url}` ma l'API REST non è attiva** "
        "(`/sdapi/v1/txt2img` assente: manca `--api`). Non serve toccare il "
        "launcher: qui sotto puoi generare comunque scegliendo **"
        "'Automazione browser'** come metodo, che pilota la UI esistente "
        "invece di chiamare l'API.",
        icon="🎨",
    )
else:
    st.error(
        "🔴 **Stable Diffusion non raggiungibile** su nessuna porta comune "
        f"({', '.join(str(p) for p in sd_api.COMMON_PORTS)}). Avvia la tua "
        "WebUI (es. `Avvia_StableDiffusion.bat`), oppure imposta la variabile "
        "d'ambiente `SD_API_URL` se usa una porta non elencata.",
        icon="🎨",
    )

method_options = []
if sd_online:
    method_options.append("API (veloce)")
if sd_url is not None:
    method_options.append("Automazione browser (nessun --api)")
gen_method = st.radio(
    "Metodo di generazione",
    options=method_options or ["Nessuno disponibile"],
    horizontal=True,
    disabled=not method_options,
    help=(
        "API: chiama /sdapi/v1/txt2img direttamente, richiede --api. "
        "Automazione browser: scrive il prompt e clicca Generate nella tua "
        "WebUI già aperta, come faresti tu — non richiede --api, ma è più "
        "lenta e usa gli altri parametri (steps, cfg, ecc.) già impostati "
        "nella WebUI stessa, non quelli qui sotto."
    ),
) if method_options else st.error("Nessun metodo disponibile: avvia prima Stable Diffusion.")
using_browser = gen_method == "Automazione browser (nessun --api)"

if using_browser and not playwright_ready:
    st.warning(
        "🟠 Playwright non installato — richiesto per l'automazione browser "
        "(setup una tantum, nessuna modifica al launcher di SD):\n"
        "```\npython -m pip install playwright\npython -m playwright install chromium\n```",
        icon="🧩",
    )

with st.expander("🔍 Diagnostica Stable Diffusion (apri se qualcosa non torna)"):
    tab_api_diag, tab_browser_diag = st.tabs(["Endpoint API", "Selettori browser"])
    default_probe = (sd_url or sd_api.DEFAULT_BASE_URL).rsplit(":", 1)[-1]

    with tab_api_diag:
        st.caption(
            "Sonda gli endpoint dell'API sulla porta trovata e mostra cosa "
            "espone davvero la tua installazione — utile con i fork che non "
            "hanno tutti gli endpoint."
        )
        probe_port = st.text_input(
            "Porta da diagnosticare", value=default_probe, key="api_probe_port",
        )
        if st.button("▶️ Esegui diagnostica API"):
            probe_url = f"http://127.0.0.1:{probe_port.strip()}"
            with st.spinner(f"Sondaggio di {probe_url}…"):
                report = sd_api.probe_endpoints(base_url=probe_url)
            st.write(f"Indirizzo sondato: `{report['base_url']}`")
            st.table(
                [
                    {"Endpoint": r["endpoint"], "Status": r["status"] if r["status"] is not None else "—",
                     "Esito": r["note"]}
                    for r in report["results"]
                ]
            )
            txt2img_row = next((r for r in report["results"] if r["endpoint"].endswith("txt2img")), None)
            if txt2img_row and txt2img_row["status"] == 405:
                st.success("L'endpoint di generazione esiste: ricarica la pagina.")
            elif txt2img_row and txt2img_row["status"] == 404:
                st.error(
                    "L'endpoint /sdapi/v1/txt2img NON esiste: niente --api. "
                    "Usa il metodo 'Automazione browser' qui sopra."
                )

    with tab_browser_diag:
        st.caption(
            "Verifica se questa build ha gli elementi standard "
            "(#txt2img_prompt, #txt2img_generate, #txt2img_gallery) che "
            "l'automazione browser usa per pilotare la UI."
        )
        if not playwright_ready:
            st.info("Installa prima Playwright (vedi sopra) per usare questo test.")
        elif st.button("▶️ Testa selettori browser", disabled=sd_url is None):
            with st.spinner(f"Apro {sd_url} in un browser…"):
                try:
                    probe = sd_browser.probe_ui_elements(sd_url)
                except sd_browser.SDBrowserError as exc:
                    st.error(str(exc))
                else:
                    st.table([{"Elemento": k, "Trovato": "✅" if v else "❌"} for k, v in probe.items()])
                    if all(probe.values()):
                        st.success("Tutti gli elementi trovati: l'automazione dovrebbe funzionare.")
                    else:
                        st.warning(
                            "Alcuni elementi mancano: questo tema/fork usa ID diversi da "
                            "quelli standard A1111/Forge. Mandami questa tabella per adattare i selettori."
                        )

# ---------------------------------------------------------------------------
# Step 1 — Generazione 2D
# ---------------------------------------------------------------------------
st.subheader("1️⃣ Immagine 2D (top-down)")

subject = st.text_input(
    "Soggetto del token",
    value=st.session_state.pop("token_prefill", ""),
    placeholder="es. goblin sciamano con bastone di ossa, mantello verde",
)
with st.expander("⚙️ Parametri Stable Diffusion", expanded=False):
    if using_browser:
        st.caption(
            "⚠️ Con l'automazione browser questi parametri **non vengono "
            "inviati**: la generazione usa steps/size/cfg/seed già impostati "
            "nella tua WebUI. Solo ControlNet è ignorato del tutto in questa "
            "modalità (richiede l'API)."
        )
    col1, col2, col3, col4 = st.columns(4)
    steps = col1.slider("Steps", 10, 60, 28)
    size = col2.select_slider("Dimensione", options=[512, 768, 1024], value=1024)
    cfg = col3.slider("CFG scale", 1.0, 15.0, 7.0, 0.5)
    seed = col4.number_input("Seed (-1 = casuale)", value=-1, step=1)

    st.markdown("**ControlNet (vista top-down vincolata)** — opzionale")
    controlnet_on = st.toggle("Abilita ControlNet", value=False)
    controlnet_unit = None
    if controlnet_on:
        cn_col1, cn_col2 = st.columns(2)
        cn_module = cn_col1.selectbox(
            "Preprocessore", ["depth_midas", "canny", "openpose", "lineart"]
        )
        cn_weight = cn_col2.slider("Peso", 0.1, 2.0, 0.9, 0.1)
        cn_file = st.file_uploader(
            "Immagine guida (template top-down del token)", type=["png", "jpg", "jpeg"]
        )
        if cn_file is not None:
            controlnet_unit = sd_api.build_controlnet_unit(
                cn_file.getvalue(), module=cn_module, weight=cn_weight
            )
            st.image(cn_file.getvalue(), caption="Guida ControlNet", width=200)

gen_disabled = not subject.strip() or not (
    (using_browser and browser_usable) or (not using_browser and sd_online)
)
if st.button("🎨 Genera token 2D", type="primary", disabled=gen_disabled):
    prompt, negative = sd_api.build_token_prompt(subject.strip())
    spinner_msg = "Automazione browser al lavoro…" if using_browser else "Generazione con Stable Diffusion…"
    with st.spinner(spinner_msg):
        try:
            if using_browser:
                png = sd_browser.txt2img_via_browser(sd_url, prompt, negative_prompt=negative)
            else:
                png = sd_api.txt2img(
                    prompt,
                    negative_prompt=negative,
                    steps=steps,
                    width=size,
                    height=size,
                    cfg_scale=cfg,
                    seed=int(seed),
                    controlnet_unit=controlnet_unit,
                )
        except (sd_api.SDApiError, sd_browser.SDBrowserError) as exc:
            st.error(str(exc))
        else:
            stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
            name = f"{slugify(subject)}_{stamp}"
            out_path = TOKENS_DIR / f"{name}.png"
            out_path.write_bytes(png)
            st.session_state["forge_png"] = png
            st.session_state["forge_name"] = name
            st.success(f"Salvato `asset_forge/tokens/{out_path.name}` ({human_size(len(png))}).")

png_bytes: bytes | None = st.session_state.get("forge_png")
if png_bytes:
    img_col, dl_col = st.columns([2, 1])
    with img_col:
        st.image(png_bytes, caption=st.session_state.get("forge_name", "token"), width=380)
    with dl_col:
        st.download_button(
            "⬇️ Scarica PNG",
            data=png_bytes,
            file_name=f"{st.session_state.get('forge_name', 'token')}.png",
            mime="image/png",
            use_container_width=True,
        )


# ---------------------------------------------------------------------------
# Libreria prompt: riusa quello che ha funzionato
# ---------------------------------------------------------------------------
with st.expander("⭐ Libreria prompt (riusa quelli che hanno funzionato)"):
    salvati = prompt_library.load_prompts("token")
    if salvati:
        etichette = [
            f"{p.name} · usato {p.used_count}× — {p.subject[:60]}" for p in salvati
        ]
        scelto = st.selectbox("Prompt salvati", etichette, key="token_lib_sel")
        prompt_scelto = salvati[etichette.index(scelto)]
        usa_col, elimina_col = st.columns(2)
        if usa_col.button("♻️ Riusa questo prompt", key="token_lib_use",
                          use_container_width=True):
            prompt_library.mark_used(prompt_scelto.id)
            st.session_state["token_prefill"] = prompt_scelto.subject
            st.rerun()
        if elimina_col.button("🗑️ Elimina", key="token_lib_del", use_container_width=True):
            prompt_library.delete_prompt(prompt_scelto.id)
            st.rerun()
        if prompt_scelto.params:
            st.caption(f"Parametri salvati: `{prompt_scelto.params}`")
    else:
        st.caption("Nessun prompt salvato: generane uno e salvalo qui sotto.")

    st.divider()
    nome_nuovo = st.text_input(
        "Salva il soggetto attuale come…", placeholder="es. Goblin sciamano riuscito",
        key="token_lib_name",
    )
    if st.button("⭐ Salva nella libreria", key="token_lib_save",
                 disabled=not (nome_nuovo.strip() and subject.strip())):
        try:
            prompt_library.save_prompt(
                nome_nuovo, "token", subject, {"steps": steps, "size": size, "cfg": cfg}
            )
        except ValueError as exc:
            st.error(str(exc))
        else:
            st.success(f"Salvato come «{nome_nuovo}».")
            st.rerun()

# ---------------------------------------------------------------------------
# Step 1b — Post-produzione: da immagine quadrata a token VTT
# ---------------------------------------------------------------------------
if png_bytes:
    st.divider()
    st.subheader("✂️ Token per la mappa (sfondo trasparente + cerchio)")
    st.caption(
        "Stable Diffusion produce un PNG quadrato con lo sfondo pieno: sulla "
        "mappa si vedrebbe il riquadro sopra il terreno. Qui lo trasformi nel "
        "token circolare trasparente che il VTT si aspetta. Tutto in locale."
    )

    opt1, opt2, opt3 = st.columns(3)
    tok_remove_bg = opt1.toggle("Rimuovi sfondo", value=True, key="tok_bg")
    tok_circular = opt2.toggle("Ritaglio circolare", value=True, key="tok_circ")
    tok_size = opt3.select_slider(
        "Lato token (px)", options=[128, 256, 512, 1024], value=512, key="tok_size"
    )
    adv1, adv2, adv3 = st.columns(3)
    tok_border = adv1.slider("Spessore bordo", 0, 20, 6, key="tok_border")
    tok_tolerance = adv2.slider(
        "Tolleranza sfondo", 5, 90, image_tools.DEFAULT_TOLERANCE, key="tok_tol",
        help="Più alta = rimuove anche sfondi con più variazione di colore, ma "
             "rischia di intaccare il soggetto.",
    )
    tok_scale = adv3.slider(
        "Riempimento del cerchio", 0.5, 1.0, 0.86, 0.02, key="tok_scale",
        help="Quanto il soggetto occupa del diametro. Sotto 1.0 evita che testa "
             "e piedi tocchino (o superino) il bordo.",
    )
    if not image_tools.rembg_available():
        st.caption(
            "ℹ️ Rimozione sfondo con riempimento dai bordi (nessuna dipendenza "
            "extra). Per sfondi complessi: `pip install rembg` — l'Hub lo usa "
            "automaticamente se presente."
        )

    if st.button("✂️ Prepara token VTT", type="primary"):
        with st.spinner("Post-produzione…"):
            try:
                token_png = image_tools.prepare_vtt_token(
                    png_bytes, size=tok_size, remove_bg=tok_remove_bg,
                    circular=tok_circular, border_width=tok_border,
                    tolerance=tok_tolerance, content_scale=tok_scale,
                )
            except Exception as exc:  # noqa: BLE001 — mostrato all'utente
                st.error(f"Post-produzione fallita: {exc}")
            else:
                nome = st.session_state.get("forge_name", "token")
                out_token = TOKENS_DIR / f"{nome}_token.png"
                out_token.write_bytes(token_png)
                st.session_state["forge_token_png"] = token_png
                st.success(
                    f"Salvato `asset_forge/tokens/{out_token.name}` "
                    f"({human_size(len(token_png))})."
                )

    token_png_state: bytes | None = st.session_state.get("forge_token_png")
    if token_png_state:
        prima, dopo, scarica = st.columns([1, 1, 1])
        with prima:
            st.caption("Originale")
            st.image(png_bytes, width=220)
        with dopo:
            st.caption("Token VTT (lo sfondo a scacchi è trasparenza)")
            st.image(token_png_state, width=220)
        with scarica:
            st.download_button(
                "⬇️ Scarica token",
                data=token_png_state,
                file_name=f"{st.session_state.get('forge_name', 'token')}_token.png",
                mime="image/png",
                use_container_width=True,
            )
            st.caption("Portalo nel gioco dalla pagina 🌐 Progetto VTT → Import asset.")

# ---------------------------------------------------------------------------
# Step 2 — Conversione 3D
# ---------------------------------------------------------------------------
st.divider()
st.subheader("2️⃣ Conversione 3D (.glb)")

if not triposr_helpers.triposr_available():
    st.warning(
        f"TripoSR non trovato in `{triposr_helpers.TRIPOSR_DIR}` — clona il repo "
        "e imposta `TRIPOSR_DIR` (vedi README).",
        icon="🧊",
    )

mc_res = st.select_slider("Risoluzione marching cubes", options=[128, 192, 256, 320], value=256)

if st.button(
    "🧊 Converti in 3D con TripoSR",
    disabled=not (png_bytes and triposr_helpers.triposr_available()),
):
    with st.spinner("TripoSR al lavoro (può richiedere 1-2 minuti)…"):
        try:
            glb = triposr_helpers.image_to_glb(png_bytes, mc_resolution=mc_res)
        except triposr_helpers.TripoSRError as exc:
            st.error(str(exc))
        else:
            name = st.session_state.get("forge_name", "token")
            glb_path = TOKENS_DIR / f"{name}.glb"
            glb_path.write_bytes(glb)
            st.session_state["forge_glb"] = glb
            st.success(f"Salvato `asset_forge/tokens/{glb_path.name}` ({human_size(len(glb))}).")

glb_bytes: bytes | None = st.session_state.get("forge_glb")
if glb_bytes:
    st.download_button(
        "⬇️ Scarica modello .glb",
        data=glb_bytes,
        file_name=f"{st.session_state.get('forge_name', 'token')}.glb",
        mime="model/gltf-binary",
        type="primary",
    )

# ---------------------------------------------------------------------------
# Galleria
# ---------------------------------------------------------------------------
st.divider()
st.subheader("🖼️ Token generati")
existing = sorted(TOKENS_DIR.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True)[:12]
if existing:
    for row_start in range(0, len(existing), 6):
        cols = st.columns(6)
        for col, path in zip(cols, existing[row_start : row_start + 6]):
            with col:
                st.image(str(path), caption=path.stem[:24], use_container_width=True)
else:
    st.caption("Ancora nessun token: genera il primo qui sopra.")

with st.sidebar:
    st.header("🎨 Asset Forge")
    st.markdown(
        f"- SD API: {'🟢 online' if sd_online else '🔴 offline'}\n"
        f"- SD browser: {'🟢 disponibile' if browser_usable else '🔴 non disponibile'}\n"
        f"- TripoSR: {'🟢 pronto' if triposr_helpers.triposr_available() else '🔴 assente'}\n"
        f"- Output: `asset_forge/tokens/`"
    )
