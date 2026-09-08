"""👤 Generatore Personaggi — nome + descrizione → 2D (SD) → 3D (.glb)."""

from __future__ import annotations

import datetime as _dt
import sys
from pathlib import Path

import streamlit as st

_HUB_ROOT = Path(__file__).resolve().parents[1]
if str(_HUB_ROOT) not in sys.path:
    sys.path.insert(0, str(_HUB_ROOT))

st.set_page_config(page_title="Generatore Personaggi — God-Mode Hub", page_icon="👤", layout="wide")

from utils import CHARACTERS_DIR, ensure_dirs, human_size, slugify  # noqa: E402
from utils import prompt_library, sd_api, sd_browser, triposr_helpers  # noqa: E402

ensure_dirs()

st.title("👤 Generatore Personaggi")
st.caption(
    "Da nome e descrizione a personaggio completo: concept 2D con Stable "
    "Diffusion locale, modello 3D `.glb` con TripoSR o TRELLIS.2. "
    "Output in `asset_forge/characters/<slug>/`."
)

sd_url, sd_online = sd_api.find_webui_cached()
backends = triposr_helpers.backend_status()
playwright_ready = sd_browser.is_playwright_installed()
browser_usable = sd_url is not None and playwright_ready

if sd_online:
    st.caption(f"🟢 Stable Diffusion pronto su `{sd_url}` (API di generazione attiva)")
elif sd_url is not None:
    st.warning(
        f"🟠 WebUI trovata su `{sd_url}` ma manca il flag `--api` "
        "(`/sdapi/v1/txt2img` assente). Non serve toccare il launcher: scegli "
        "**'Automazione browser'** qui sotto per generare comunque.",
        icon="👤",
    )
else:
    st.error(
        "🔴 Stable Diffusion non raggiungibile: avvia la WebUI per generare.",
        icon="👤",
    )

method_options = []
if sd_online:
    method_options.append("API (veloce)")
if sd_url is not None:
    method_options.append("Automazione browser (nessun --api)")
gen_method = st.radio(
    "Metodo di generazione", options=method_options or ["Nessuno disponibile"],
    horizontal=True, disabled=not method_options,
    help="Automazione browser: usa gli altri parametri già impostati nella WebUI, non steps/cfg/seed qui sotto.",
) if method_options else None
using_browser = gen_method == "Automazione browser (nessun --api)"
if using_browser and not playwright_ready:
    st.info(
        "Serve Playwright: `python -m pip install playwright` poi "
        "`python -m playwright install chromium` (una tantum, nel venv dell'Hub).",
        icon="🧩",
    )

# ---------------------------------------------------------------------------
# Input personaggio
# ---------------------------------------------------------------------------
col_name, col_engine = st.columns([2, 1])
name = col_name.text_input("Nome del personaggio", placeholder="es. Ser Aldrico di Ventimiglia")
engine = col_engine.radio(
    "Motore 3D",
    options=["TripoSR", "TRELLIS.2"],
    horizontal=True,
    help="TripoSR: veloce (~1 min). TRELLIS.2: qualità superiore, richiede il servizio locale.",
)
description = st.text_area(
    "Descrizione",
    value=st.session_state.pop("pg_prefill", ""),
    height=120,
    placeholder=(
        "es. cavaliere errante mezz'elfo, armatura a piastre incisa con motivi "
        "liguri, mantello blu notte, spada lunga…"
    ),
)

with st.expander("⚙️ Parametri generazione 2D"):
    if using_browser:
        st.caption(
            "⚠️ Con l'automazione browser questi parametri **non vengono "
            "inviati** (né la dimensione ritratto 768×1152): la generazione "
            "usa ciò che è già impostato nella tua WebUI."
        )
    p_col1, p_col2, p_col3 = st.columns(3)
    steps = p_col1.slider("Steps", 10, 60, 30)
    cfg = p_col2.slider("CFG scale", 1.0, 15.0, 7.0, 0.5)
    seed = p_col3.number_input("Seed (-1 = casuale)", value=-1, step=1)
    st.caption(
        "Il prompt forza posa A neutra, vista frontale e sfondo bianco: è ciò "
        "che dà i risultati migliori nella ricostruzione 3D."
    )


# ---------------------------------------------------------------------------
# Libreria prompt: riusa quello che ha funzionato
# ---------------------------------------------------------------------------
with st.expander("⭐ Libreria prompt (riusa quelli che hanno funzionato)"):
    salvati = prompt_library.load_prompts("personaggio")
    if salvati:
        etichette = [
            f"{p.name} · usato {p.used_count}× — {p.subject[:60]}" for p in salvati
        ]
        scelto = st.selectbox("Prompt salvati", etichette, key="pg_lib_sel")
        prompt_scelto = salvati[etichette.index(scelto)]
        usa_col, elimina_col = st.columns(2)
        if usa_col.button("♻️ Riusa questo prompt", key="pg_lib_use",
                          use_container_width=True):
            prompt_library.mark_used(prompt_scelto.id)
            st.session_state["pg_prefill"] = prompt_scelto.subject
            st.rerun()
        if elimina_col.button("🗑️ Elimina", key="pg_lib_del", use_container_width=True):
            prompt_library.delete_prompt(prompt_scelto.id)
            st.rerun()
        if prompt_scelto.params:
            st.caption(f"Parametri salvati: `{prompt_scelto.params}`")
    else:
        st.caption("Nessun prompt salvato: generane uno e salvalo qui sotto.")

    st.divider()
    nome_nuovo = st.text_input(
        "Salva il soggetto attuale come…", placeholder="es. Goblin sciamano riuscito",
        key="pg_lib_name",
    )
    if st.button("⭐ Salva nella libreria", key="pg_lib_save",
                 disabled=not (nome_nuovo.strip() and description.strip())):
        try:
            prompt_library.save_prompt(
                nome_nuovo, "personaggio", description, {"steps": steps, "cfg": cfg}
            )
        except ValueError as exc:
            st.error(str(exc))
        else:
            st.success(f"Salvato come «{nome_nuovo}».")
            st.rerun()

# ---------------------------------------------------------------------------
# Step 1 — 2D
# ---------------------------------------------------------------------------
can_generate = (using_browser and browser_usable) or (not using_browser and sd_online)
ready = bool(name.strip() and description.strip() and can_generate)
if st.button("🎨 Genera concept 2D", type="primary", disabled=not ready):
    prompt, negative = sd_api.build_character_prompt(name.strip(), description.strip())
    spinner_msg = "Automazione browser al lavoro…" if using_browser else "Generazione concept con Stable Diffusion…"
    with st.spinner(spinner_msg):
        try:
            if using_browser:
                png = sd_browser.txt2img_via_browser(sd_url, prompt, negative_prompt=negative)
            else:
                png = sd_api.txt2img(
                    prompt,
                    negative_prompt=negative,
                    steps=steps,
                    width=768,
                    height=1152,  # ritratto full-body
                    cfg_scale=cfg,
                    seed=int(seed),
                )
        except (sd_api.SDApiError, sd_browser.SDBrowserError) as exc:
            st.error(str(exc))
        else:
            slug = slugify(name)
            char_dir = CHARACTERS_DIR / slug
            char_dir.mkdir(parents=True, exist_ok=True)
            stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
            png_path = char_dir / f"{slug}_{stamp}.png"
            png_path.write_bytes(png)
            st.session_state["char_png"] = png
            st.session_state["char_slug"] = slug
            st.success(f"Salvato `{png_path.relative_to(_HUB_ROOT).as_posix()}`.")

char_png: bytes | None = st.session_state.get("char_png")
char_slug: str = st.session_state.get("char_slug", "personaggio")
if char_png:
    img_col, side_col = st.columns([1, 1])
    with img_col:
        st.image(char_png, caption=char_slug, width=320)
    with side_col:
        st.download_button(
            "⬇️ Scarica concept PNG",
            data=char_png,
            file_name=f"{char_slug}.png",
            mime="image/png",
            use_container_width=True,
        )

        # -------------------------------------------------------------------
        # Step 2 — 3D
        # -------------------------------------------------------------------
        st.markdown("**Conversione 3D**")
        engine_ok = backends["triposr"] if engine == "TripoSR" else backends["trellis"]
        if not engine_ok:
            st.warning(
                f"{engine} non configurato (vedi README, sezione Backend 3D).",
                icon="🧊",
            )
        if st.button(f"🧊 Genera modello 3D con {engine}", disabled=not engine_ok):
            with st.spinner(f"{engine} al lavoro…"):
                try:
                    if engine == "TripoSR":
                        glb = triposr_helpers.image_to_glb(char_png)
                    else:
                        glb = triposr_helpers.trellis_image_to_glb(char_png)
                except triposr_helpers.TripoSRError as exc:
                    st.error(str(exc))
                else:
                    char_dir = CHARACTERS_DIR / char_slug
                    char_dir.mkdir(parents=True, exist_ok=True)
                    glb_path = char_dir / f"{char_slug}.glb"
                    glb_path.write_bytes(glb)
                    st.session_state["char_glb"] = glb
                    st.success(
                        f"Salvato `{glb_path.relative_to(_HUB_ROOT).as_posix()}` "
                        f"({human_size(len(glb))})."
                    )
        char_glb: bytes | None = st.session_state.get("char_glb")
        if char_glb:
            st.download_button(
                "⬇️ Scarica modello .glb",
                data=char_glb,
                file_name=f"{char_slug}.glb",
                mime="model/gltf-binary",
                type="primary",
                use_container_width=True,
            )

# ---------------------------------------------------------------------------
# Roster
# ---------------------------------------------------------------------------
st.divider()
st.subheader("🗂️ Roster personaggi")
rosters = sorted(p for p in CHARACTERS_DIR.iterdir() if p.is_dir()) if CHARACTERS_DIR.exists() else []
if rosters:
    for row_start in range(0, len(rosters), 4):
        cols = st.columns(4)
        for col, char_dir in zip(cols, rosters[row_start : row_start + 4]):
            with col:
                pngs = sorted(char_dir.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
                if pngs:
                    st.image(str(pngs[0]), use_container_width=True)
                has_glb = any(char_dir.glob("*.glb"))
                st.markdown(f"**{char_dir.name}** {'· 🧊 3D' if has_glb else ''}")
else:
    st.caption("Nessun personaggio ancora: crea il primo qui sopra.")

with st.sidebar:
    st.header("👤 Generatore Personaggi")
    st.markdown(
        f"- SD API: {'🟢 online' if sd_online else '🔴 offline'}\n"
        f"- SD browser: {'🟢 disponibile' if browser_usable else '🔴 non disponibile'}\n"
        f"- TripoSR: {'🟢' if backends['triposr'] else '🔴'}\n"
        f"- TRELLIS.2: {'🟢' if backends['trellis'] else '⚪ opzionale'}\n"
        f"- Output: `asset_forge/characters/`"
    )
