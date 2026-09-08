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
from utils import gltf_tools, rigging, sd_api, sd_browser  # noqa: E402

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
# TAB 2 — Animazione dei modelli 3D
# ---------------------------------------------------------------------------
with tab_rig:
    st.markdown(
        "TripoSR e TRELLIS producono **mesh statiche**: nessuno scheletro, "
        "nessuna animazione. Qui ci sono due strade, con costi molto diversi."
    )

    modelli = sorted(
        [p for p in (ANIMATIONS_DIR / "to_rig").glob("*.glb")] +
        [p for p in (_HUB_ROOT / "asset_forge").rglob("*.glb")],
        key=lambda p: p.stat().st_mtime, reverse=True,
    )
    caricato = st.file_uploader("Carica un .glb", type=["glb"], key="rig_upload")
    if caricato is not None:
        coda = ANIMATIONS_DIR / "to_rig"
        coda.mkdir(parents=True, exist_ok=True)
        destinazione = coda / caricato.name
        destinazione.write_bytes(caricato.getvalue())
        st.success(f"Salvato in `{destinazione.relative_to(_HUB_ROOT).as_posix()}`")
        st.rerun()

    if not modelli:
        st.info(
            "Nessun modello `.glb` disponibile: generane uno in 🎨 Asset Forge o "
            "👤 Generatore Personaggi, oppure caricalo qui sopra.",
            icon="🦴",
        )
    else:
        etichette = [
            f"{p.name} · {human_size(p.stat().st_size)}" for p in dict.fromkeys(modelli)
        ]
        unici = list(dict.fromkeys(modelli))
        scelta = st.selectbox("Modello", etichette, key="rig_model")
        modello_path = unici[etichette.index(scelta)]
        dati_modello = modello_path.read_bytes()

        try:
            info = gltf_tools.inspect_glb(dati_modello)
        except gltf_tools.GLTFError as exc:
            st.error(f"File non leggibile: {exc}")
            info = None

        if info is not None:
            i1, i2, i3, i4 = st.columns(4)
            i1.metric("Mesh", info.meshes)
            i2.metric("Vertici", f"{info.vertex_count:,}")
            i3.metric("Scheletro", "🦴 sì" if info.has_skeleton else "— no")
            i4.metric("Animazioni", len(info.animations) or "—")
            if info.animations:
                st.caption("Già presenti: " + ", ".join(f"`{a}`" for a in info.animations))

            metodo = st.radio(
                "Come animarlo",
                options=["Movimento dell'intero modello", "Scheletro con Blender"],
                horizontal=True,
                key="rig_method",
                help="Il primo non richiede installazioni e funziona su qualsiasi "
                     "modello. Il secondo crea ossa e pesi, ma richiede Blender.",
            )

            # --- Strada 1: animazione procedurale, sempre disponibile --------
            if metodo == "Movimento dell'intero modello":
                st.caption(
                    "Ruota, fa fluttuare o pulsare il modello **intero**. Non serve "
                    "uno scheletro: copre i casi più comuni in un VTT (un forziere "
                    "che gira, un token che levita, un'aura che pulsa). Non produce "
                    "una camminata: per quella serve il rig scheletrico."
                )
                c1, c2 = st.columns(2)
                tipo = c1.selectbox(
                    "Tipo di movimento", list(gltf_tools.PROCEDURAL_ANIMATIONS.keys()),
                    key="rig_proc_type",
                )
                durata = c2.slider("Durata del ciclo (secondi)", 1.0, 10.0, 4.0, 0.5,
                                   key="rig_proc_dur")
                sostituisci = st.checkbox(
                    "Rimuovi le animazioni già presenti", value=bool(info.animations),
                    key="rig_proc_replace",
                    help="Due animazioni sullo stesso nodo danno risultati "
                         "imprevedibili nel visualizzatore.",
                )

                if st.button("✨ Applica movimento", type="primary", key="rig_proc_go"):
                    try:
                        sorgente = (
                            gltf_tools.remove_animations(dati_modello)
                            if sostituisci else dati_modello
                        )
                        animato = gltf_tools.PROCEDURAL_ANIMATIONS[tipo](
                            sorgente, duration=durata
                        )
                    except gltf_tools.GLTFError as exc:
                        st.error(str(exc))
                    else:
                        uscita = ANIMATIONS_DIR / f"{modello_path.stem}_animato.glb"
                        uscita.write_bytes(animato)
                        st.session_state["rig_result"] = animato
                        st.session_state["rig_result_name"] = uscita.name
                        st.success(
                            f"Salvato `asset_forge/animations/{uscita.name}` "
                            f"({human_size(len(animato))})."
                        )

            # --- Strada 2: rigging scheletrico con Blender -------------------
            else:
                blender_ok = rigging.blender_available()
                if blender_ok:
                    versione = rigging.blender_version()
                    st.success(f"🟢 Blender trovato{': ' + versione if versione else ''}")
                else:
                    st.warning(
                        "🟠 **Blender non trovato.** È gratuito (blender.org): "
                        "installalo e riapri l'Hub. Se è già installato in una "
                        "cartella non standard, imposta la variabile d'ambiente "
                        "`BLENDER_PATH` sul suo `blender.exe`.",
                        icon="🦴",
                    )
                st.caption(
                    "Crea un'armatura umanoide proporzionata al modello e la lega "
                    "alla mesh con i pesi automatici di Blender. Le proporzioni "
                    "derivano dal riquadro di ingombro: su un personaggio in posa A "
                    "funziona, su una creatura di forma diversa (quadrupede, drago) "
                    "le ossa finiranno nel posto sbagliato e andranno sistemate a "
                    "mano. Fa il lavoro noioso, non sostituisce un rigger."
                )
                r1, r2 = st.columns(2)
                con_idle = r1.checkbox("Aggiungi animazione idle (respiro)", value=True,
                                       key="rig_idle")
                frames = r2.slider("Fotogrammi del ciclo", 24, 120, 60, key="rig_frames")

                if st.button("🦴 Crea scheletro", type="primary",
                             disabled=not blender_ok, key="rig_blender_go"):
                    with st.spinner("Blender al lavoro (può richiedere qualche minuto)…"):
                        esito = rigging.autorig_glb(
                            dati_modello,
                            animation="idle" if con_idle else "none",
                            frames=frames,
                        )
                    if esito.ok:
                        uscita = ANIMATIONS_DIR / f"{modello_path.stem}_riggato.glb"
                        uscita.write_bytes(esito.glb)
                        st.session_state["rig_result"] = esito.glb
                        st.session_state["rig_result_name"] = uscita.name
                        st.success(f"{esito.message} Salvato in `{uscita.name}`.")
                    else:
                        st.error(esito.message)
                        if esito.log_tail:
                            with st.expander("Log di Blender"):
                                st.code(esito.log_tail)

        # --- Risultato ---------------------------------------------------
        risultato: bytes | None = st.session_state.get("rig_result")
        if risultato:
            st.divider()
            nome_risultato = st.session_state.get("rig_result_name", "modello.glb")
            try:
                info_out = gltf_tools.inspect_glb(risultato)
            except gltf_tools.GLTFError:
                info_out = None
            col_info, col_dl = st.columns([2, 1])
            with col_info:
                st.markdown(f"**Risultato:** `{nome_risultato}`")
                if info_out:
                    st.caption(
                        f"{info_out.vertex_count:,} vertici · "
                        f"scheletro: {'sì' if info_out.has_skeleton else 'no'} · "
                        f"animazioni: {', '.join(info_out.animations) or 'nessuna'}"
                    )
            with col_dl:
                st.download_button(
                    "⬇️ Scarica .glb animato", data=risultato,
                    file_name=nome_risultato, mime="model/gltf-binary",
                    use_container_width=True,
                )
            st.caption(
                "Per vederlo in movimento: aprilo in Blender, in un visualizzatore "
                "glTF, oppure importalo nel VTT dalla pagina 🌐 Progetto VTT."
            )

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
        "- Movimento 3D: glTF procedurale (sempre)\n"
        "- Rig scheletrico: Blender headless\n"
        f"- Output: `asset_forge/animations/`"
    )
