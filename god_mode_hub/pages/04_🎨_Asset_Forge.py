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
from utils import sd_api, triposr_helpers  # noqa: E402

ensure_dirs()

st.title("🎨 Asset Forge — Token VTT")
st.caption(
    "Genera token top-down con Stable Diffusion locale (rilevata in autonomia "
    "su più porte) e convertili in modelli 3D `.glb` con TripoSR. Output in "
    "`asset_forge/tokens/`."
)

sd_url, sd_online = sd_api.find_webui()
if sd_online:
    st.caption(f"🟢 Stable Diffusion pronto su `{sd_url}` (API di generazione attiva)")
elif sd_url is not None:
    st.warning(
        f"🟠 **WebUI trovata su `{sd_url}` ma l'API di generazione NON è attiva.** "
        "L'endpoint `/sdapi/v1/txt2img` non esiste: manca il flag `--api`. "
        "La WebUI grafica funziona lo stesso, ma l'Hub genera via API e serve "
        "quel flag. **Aggiungi `--api` agli argomenti del tuo "
        "`Avvia_StableDiffusion.bat`** (di solito nella riga "
        "`set COMMANDLINE_ARGS=...`) e riavvia Stable Diffusion. Apri la "
        "diagnostica qui sotto per la conferma.",
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

with st.expander("🔍 Diagnostica Stable Diffusion (apri se l'indicatore è rosso)"):
    st.caption(
        "Sonda gli endpoint dell'API sulla porta trovata (o su 7860 di default) "
        "e mostra cosa espone davvero la tua installazione — utile con i fork "
        "che non hanno tutti gli endpoint."
    )
    default_probe = (sd_url or sd_api.DEFAULT_BASE_URL).rsplit(":", 1)[-1]
    probe_port = st.text_input(
        "Porta da diagnosticare", value=default_probe,
        help="Cambiala se la tua WebUI gira su una porta diversa da quella mostrata.",
    )
    if st.button("▶️ Esegui diagnostica"):
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
        any_ok = any("✅" in r["note"] for r in report["results"])
        if txt2img_row and txt2img_row["status"] == 405:
            st.success(
                "L'endpoint di generazione esiste: se l'indicatore era rosso, "
                "chiudi e riapri l'Hub (Ctrl+C + RUN_ME_FIRST.bat) per rileggerlo."
            )
        elif txt2img_row and txt2img_row["status"] == 404:
            st.error(
                "L'endpoint /sdapi/v1/txt2img NON esiste su questa build: non "
                "può generare via API. Serve una WebUI A1111/Forge standard "
                "avviata con --api."
            )
        elif not any_ok:
            st.warning(
                "Nessun endpoint sdapi ha risposto: la WebUI non è avviata su "
                "questa porta, oppure `--api` non è attivo. Verifica il tuo "
                "`Avvia_StableDiffusion.bat` e la porta reale."
            )

# ---------------------------------------------------------------------------
# Step 1 — Generazione 2D
# ---------------------------------------------------------------------------
st.subheader("1️⃣ Immagine 2D (top-down)")

subject = st.text_input(
    "Soggetto del token",
    placeholder="es. goblin sciamano con bastone di ossa, mantello verde",
)
with st.expander("⚙️ Parametri Stable Diffusion", expanded=False):
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

if st.button("🎨 Genera token 2D", type="primary", disabled=not (subject.strip() and sd_online)):
    prompt, negative = sd_api.build_token_prompt(subject.strip())
    with st.spinner("Generazione con Stable Diffusion…"):
        try:
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
        except sd_api.SDApiError as exc:
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
        f"- TripoSR: {'🟢 pronto' if triposr_helpers.triposr_available() else '🔴 assente'}\n"
        f"- Output: `asset_forge/tokens/`"
    )
