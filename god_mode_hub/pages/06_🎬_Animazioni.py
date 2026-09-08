"""🎬 Animazioni — pipeline sprite sheet 2D, rigging 3D e export per il VTT."""

from __future__ import annotations

import datetime as _dt
import io
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import streamlit as st

_HUB_ROOT = Path(__file__).resolve().parents[1]
if str(_HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(_HUB_ROOT))

st.set_page_config(page_title="Animazioni — God-Mode Hub", page_icon="🎬", layout="wide")

from utils import ANIMATIONS_DIR, ensure_dirs, human_size, slugify  # noqa: E402
from utils import sd_api, sd_browser  # noqa: E402

ensure_dirs()

st.title("🎬 Animazioni per il VTT")
st.caption(
    "Sprite sheet 2D generati frame-per-frame con Stable Diffusion, "
    "assemblaggio GIF/MP4 e area di parcheggio per il rigging 3D. "
    "Output in `asset_forge/animations/`."
)

tab_sprite, tab_rig, tab_export = st.tabs(
    ["🎞️ Sprite Sheet 2D", "🦴 Rigging 3D", "📦 Export VTT"]
)

# ---------------------------------------------------------------------------
# TAB 1 — Sprite sheet 2D
# ---------------------------------------------------------------------------
with tab_sprite:
    sd_url, sd_online = sd_api.find_webui_cached()
    browser_usable = sd_url is not None and sd_browser.is_playwright_installed()
    if sd_online:
        st.caption(f"🟢 Stable Diffusion pronto su `{sd_url}` (API attiva)")
    elif sd_url is not None:
        st.warning(
            f"🟠 WebUI su `{sd_url}` senza `--api`. Puoi generare comunque con "
            "**Automazione browser**, ma qui costa molto: ogni frame è un ciclo "
            "completo di interazione con la pagina (secondi in più per frame).",
            icon="🎞️",
        )
    else:
        st.error("🔴 Stable Diffusion non raggiungibile.", icon="🎞️")

    metodi = (["API (veloce)"] if sd_online else []) + (
        ["Automazione browser (nessun --api)"] if sd_url is not None else []
    )
    metodo = st.radio(
        "Metodo di generazione", options=metodi or ["Nessuno disponibile"],
        horizontal=True, disabled=not metodi, key="anim_method",
        help="Con l'automazione browser i parametri qui sotto (dimensione, steps) "
             "non vengono inviati: valgono quelli impostati nella tua WebUI.",
    ) if metodi else None
    anim_browser = metodo == "Automazione browser (nessun --api)"
    if anim_browser and not sd_browser.is_playwright_installed():
        st.info(
            "Serve Playwright: `python -m pip install playwright` poi "
            "`python -m playwright install chromium`.", icon="🧩",
        )
    subject = st.text_input(
        "Soggetto dell'animazione",
        placeholder="es. fiamma magica viola che pulsa, vista dall'alto",
    )
    col1, col2, col3 = st.columns(3)
    frames_n = col1.slider("Numero frame", 4, 16, 8)
    frame_size = col2.select_slider("Lato frame (px)", options=[256, 512, 768], value=512)
    duration_ms = col3.slider("Durata frame GIF (ms)", 50, 400, 120, 10)
    coerenza = st.toggle(
        "Frame coerenti (ogni frame parte dal precedente)",
        value=sd_online,
        disabled=not sd_online,
        help="Usa img2img: il frame N nasce dal frame N-1, quindi i fotogrammi "
             "appartengono alla stessa animazione. Richiede --api "
             "(l'automazione browser pilota solo txt2img).",
    )
    if coerenza:
        forza = st.slider(
            "Quanto cambia tra un frame e l'altro", 0.15, 0.75, 0.40, 0.05,
            help="Basso = animazione fluida ma quasi statica. Alto = più "
                 "movimento ma i frame si somigliano meno.",
        )
        st.caption(
            "🎞️ Modalità coerente: adatta ad animazioni vere (fiamma che "
            "ondeggia, aura che pulsa)."
        )
    else:
        forza = 0.4
        st.caption(
            "⚠️ Modalità indipendente: ogni frame ha un seed diverso, quindi i "
            "fotogrammi **non** sono in continuità tra loro. Va bene per "
            "variazioni casuali, non per un'animazione fluida. Per le "
            "camminate serve il rigging 3D (tab successiva)."
        )

    anim_pronto = (anim_browser and browser_usable) or (not anim_browser and sd_online)
    if st.button("🎞️ Genera sprite sheet", type="primary",
                 disabled=not (subject.strip() and anim_pronto)):
        from PIL import Image

        frames: list["Image.Image"] = []
        progress = st.progress(0.0, text="Generazione frame…")
        base_prompt = (
            f"{subject}, animation frame, consistent style, centered, "
            "plain dark background, game asset, high detail"
        )
        error: str | None = None
        frame_precedente: bytes | None = None
        for i in range(frames_n):
            try:
                if coerenza and frame_precedente is not None and not anim_browser:
                    # Frame N derivato dal frame N-1: continuità visiva.
                    png = sd_api.img2img(
                        base_prompt,
                        init_image=frame_precedente,
                        denoising_strength=forza,
                        steps=22,
                        width=frame_size,
                        height=frame_size,
                    )
                elif anim_browser:
                    # La UI non espone il seed per-frame: la variazione tra i
                    # frame viene dal seed casuale gia' impostato nella WebUI.
                    png = sd_browser.txt2img_via_browser(sd_url, base_prompt)
                else:
                    png = sd_api.txt2img(
                        base_prompt,
                        steps=22,
                        width=frame_size,
                        height=frame_size,
                        seed=1000 + i,  # seed deterministici -> rigenerabile
                    )
            except (sd_api.SDApiError, sd_browser.SDBrowserError) as exc:
                error = str(exc)
                break
            frame_precedente = png
            frame_img = Image.open(io.BytesIO(png)).convert("RGBA")
            if frame_img.size != (frame_size, frame_size):
                # Con l'automazione browser la dimensione la decide la WebUI:
                # normalizziamo, altrimenti lo sprite sheet a griglia fissa
                # taglierebbe o disallineerebbe i frame.
                frame_img = frame_img.resize((frame_size, frame_size), Image.LANCZOS)
            frames.append(frame_img)
            progress.progress((i + 1) / frames_n, text=f"Frame {i + 1}/{frames_n}")
        progress.empty()

        if error:
            st.error(error)
        elif frames:
            columns = min(len(frames), 4)
            rows = -(-len(frames) // columns)  # ceil
            sheet = Image.new("RGBA", (columns * frame_size, rows * frame_size), (0, 0, 0, 0))
            for i, frame in enumerate(frames):
                sheet.paste(frame, ((i % columns) * frame_size, (i // columns) * frame_size))

            stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
            base_name = f"{slugify(subject)}_{stamp}"
            sheet_path = ANIMATIONS_DIR / f"{base_name}_sheet.png"
            sheet.save(sheet_path)

            gif_buffer = io.BytesIO()
            rgb_frames = [f.convert("P", palette=Image.ADAPTIVE) for f in frames]
            rgb_frames[0].save(
                gif_buffer, format="GIF", save_all=True,
                append_images=rgb_frames[1:], duration=duration_ms, loop=0, disposal=2,
            )
            gif_path = ANIMATIONS_DIR / f"{base_name}.gif"
            gif_path.write_bytes(gif_buffer.getvalue())

            st.session_state["anim_gif"] = gif_buffer.getvalue()
            st.session_state["anim_name"] = base_name
            st.success(
                f"Salvati `{sheet_path.name}` e `{gif_path.name}` in `asset_forge/animations/`."
            )

    anim_gif: bytes | None = st.session_state.get("anim_gif")
    if anim_gif:
        prev_col, dl_col = st.columns([1, 1])
        with prev_col:
            st.image(anim_gif, caption=st.session_state.get("anim_name", "animazione"), width=320)
        with dl_col:
            st.download_button(
                "⬇️ Scarica GIF",
                data=anim_gif,
                file_name=f"{st.session_state.get('anim_name', 'anim')}.gif",
                mime="image/gif",
                use_container_width=True,
            )

# ---------------------------------------------------------------------------
# TAB 2 — Rigging 3D (placeholder logico, pipeline documentata)
# ---------------------------------------------------------------------------
with tab_rig:
    st.markdown(
        """
### Pipeline rigging 3D (roadmap — tutto locale)

Il rigging automatico dei `.glb` generati da TripoSR è **la prossima
estensione** dell'Hub. Pipeline prevista, 100% locale:

1. **Import** del `.glb` da `asset_forge/characters/` o `tokens/`;
2. **Auto-rigging** con [UniRig](https://github.com/VAST-AI-Research/UniRig)
   (VAST AI, gira su GPU locale) oppure Blender + Rigify via `bpy` headless;
3. **Retarget** di animazioni base (idle, walk, attack) da libreria BVH locale;
4. **Export** `.glb` animato pronto per il renderer 3D del VTT Flutter.

Nel frattempo puoi **parcheggiare qui i modelli da riggare**: verranno
raccolti in `asset_forge/animations/to_rig/`.
"""
    )
    uploaded = st.file_uploader("Carica un .glb da riggare (coda locale)", type=["glb"])
    if uploaded is not None:
        to_rig = ANIMATIONS_DIR / "to_rig"
        to_rig.mkdir(parents=True, exist_ok=True)
        dest = to_rig / uploaded.name
        dest.write_bytes(uploaded.getvalue())
        st.success(f"In coda per il rigging: `{dest.relative_to(_HUB_ROOT).as_posix()}`")

    queue = sorted((ANIMATIONS_DIR / "to_rig").glob("*.glb")) if (ANIMATIONS_DIR / "to_rig").exists() else []
    if queue:
        st.markdown("**Coda rigging:**")
        for item in queue:
            st.markdown(f"- `{item.name}` · {human_size(item.stat().st_size)}")

# ---------------------------------------------------------------------------
# TAB 3 — Export per il VTT
# ---------------------------------------------------------------------------
with tab_export:
    st.markdown(
        "Converte le animazioni generate nei formati che il VTT Flutter "
        "consuma: **GIF** (già pronte), **MP4** (via ffmpeg locale, se "
        "installato) e in futuro **.glb animati**."
    )
    ffmpeg = shutil.which("ffmpeg")
    st.markdown(f"- ffmpeg: {'🟢 `' + ffmpeg + '`' if ffmpeg else '🔴 non trovato (export MP4 disabilitato)'}")

    gifs = sorted(ANIMATIONS_DIR.glob("*.gif"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not gifs:
        st.caption("Nessuna GIF ancora: genera uno sprite sheet nella prima tab.")
    else:
        chosen = st.selectbox("Animazione da esportare", [g.name for g in gifs])
        chosen_path = ANIMATIONS_DIR / chosen
        col_gif, col_mp4 = st.columns(2)
        with col_gif:
            st.download_button(
                "⬇️ Scarica GIF",
                data=chosen_path.read_bytes(),
                file_name=chosen,
                mime="image/gif",
                use_container_width=True,
            )
        with col_mp4:
            if st.button("🎥 Converti in MP4", disabled=not ffmpeg, use_container_width=True):
                mp4_path = chosen_path.with_suffix(".mp4")
                with tempfile.TemporaryDirectory() as tmp:
                    tmp_mp4 = Path(tmp) / "out.mp4"
                    cmd = [
                        ffmpeg, "-y", "-i", str(chosen_path),
                        "-movflags", "faststart", "-pix_fmt", "yuv420p",
                        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                        str(tmp_mp4),
                    ]
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                    if result.returncode == 0 and tmp_mp4.exists():
                        mp4_path.write_bytes(tmp_mp4.read_bytes())
                        st.success(f"Creato `{mp4_path.name}`.")
                    else:
                        tail = "\n".join((result.stderr or "").splitlines()[-5:])
                        st.error(f"ffmpeg fallito:\n```\n{tail}\n```")
        mp4_existing = chosen_path.with_suffix(".mp4")
        if mp4_existing.exists():
            st.video(str(mp4_existing))
            st.download_button(
                "⬇️ Scarica MP4",
                data=mp4_existing.read_bytes(),
                file_name=mp4_existing.name,
                mime="video/mp4",
            )

with st.sidebar:
    st.header("🎬 Animazioni")
    st.markdown(
        "- Sprite sheet: SD frame-per-frame (API o browser)\n"
        "- GIF: Pillow (locale)\n"
        "- MP4: ffmpeg (se installato)\n"
        "- Rigging 3D: roadmap UniRig/Blender\n"
        f"- Output: `asset_forge/animations/`"
    )
