# 🚀 God-Mode Local AI Hub

Hub Streamlit **100% locale** che unifica il "secondo cervello", l'orchestrazione
manuale degli LLM via chat web e la fabbrica di asset 2D→3D per lo sviluppo del
**Virtual Tabletop (VTT) Flutter** — *Ultimate VTT 5e, Tavolo Oscuro di Ventimiglia*.

> Nessuna API cloud a pagamento: niente OpenAI, Anthropic o Google API.
> Gli abbonamenti Pro a Claude/Gemini/Perplexity si usano **solo via chat web**
> (copy-paste orchestrato dall'Hub). Tutta l'inferenza pesante gira sulla tua
> **RTX 5080 (16 GB VRAM)**.

## ⚡ Setup rapido

```bash
cd god_mode_hub
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt
streamlit run app.py
```

L'app si apre su `http://localhost:8501` con layout wide e tema scuro.

### Avvio rapido successivo (Windows)

Dopo il primo setup, per riaprire l'Hub basta un doppio click su
**`run_hub.bat`** (nella cartella `god_mode_hub/`): attiva il venv e avvia
`streamlit run app.py`, che apre automaticamente il browser predefinito.
Puoi trascinare un collegamento a questo file sul Desktop per un accesso
ancora più rapido.

### Backend esterni (opzionali ma consigliati)

| Backend | A cosa serve | Setup |
|---|---|---|
| **Stable Diffusion** | generazione 2D (token, personaggi, frame) | Stability Matrix → WebUI A1111/Forge con flag `--api` → porta `7860` (override: env `SD_API_URL`) |
| **TripoSR** | Image-to-3D `.glb` (veloce) | `git clone https://github.com/VAST-AI-Research/TripoSR` + suo venv; env `TRIPOSR_DIR` e `TRIPOSR_PYTHON` |
| **TRELLIS.2** | Image-to-3D di qualità superiore | servizio HTTP locale che accetta `POST /image-to-3d` (multipart `image`) e risponde col `.glb`; env `TRELLIS_URL` |
| **ffmpeg** | export MP4 delle animazioni | `winget install ffmpeg` |

L'Hub **degrada con grazia**: ogni pagina controlla i backend e mostra cosa
manca senza mai rompersi (RAG → fallback full-text, SD offline → avviso, ecc.).

## 🗺️ Moduli

| Pagina | Funzione |
|---|---|
| 🏠 **Home** | dashboard: contatori contenuti/asset, attività recente, azioni rapide |
| 🧠 **Secondo Cervello** | **Tab RAG**: query semantiche su `codebase/` (ChromaDB + all-MiniLM-L6-v2, ~20K righe `.dart`); **Tab Wiki**: ricerca FTS5+RRF su `wiki/`+`raw/`, compilazione fonti `raw/ → wiki/sources/`, linting (link orfani, contraddizioni euristiche) |
| ⚙️ **Orchestratore** | genera **mega-prompt** (task + contesto RAG/Wiki + contratto di output), download `.md`; **Drop Zone**: incolli la risposta di Claude/Gemini, il parser estrae code block e pagine wiki e li salva in `codebase/` e `wiki/` con percorsi dedotti ed editabili |
| 🎨 **Asset Forge** | prompt → token top-down (SD, ControlNet opzionale) → `.glb` con TripoSR → download; galleria dei token |
| 👤 **Generatore Personaggi** | nome+descrizione → concept full-body (posa A, sfondo bianco: ottimale per Image-to-3D) → `.glb` con TripoSR o TRELLIS.2; roster |
| 🎬 **Animazioni** | sprite sheet 2D frame-per-frame (seed deterministici), GIF (Pillow) e MP4 (ffmpeg); coda locale per il rigging 3D (roadmap UniRig/Blender) |

## 📁 Struttura

```
god_mode_hub/
├── app.py                     ← entry point (stato componenti + navigazione)
├── pages/                     ← le 6 pagine Streamlit
├── raw/                       ← fonti grezze: note, PDF, screenshot
├── wiki/                      ← LLM Wiki (pattern Karpathy)
│   ├── index.md  log.md       ← indice curato + diario automatico
│   ├── sources/ concepts/ entities/
│   └── wiki_fts.db            ← indice FTS5 (generato, escluso da git)
├── codebase/                  ← codebase Flutter del VTT (.dart/.py) per il RAG
├── asset_forge/               ← output: characters/ tokens/ animations/
├── chroma_index/              ← indice ChromaDB persistente (generato)
├── utils/
│   ├── chroma_rag.py          ← ingest+query ChromaDB, fallback full-text
│   ├── llm_wiki.py            ← FTS5 + RRF, compilazione raw→wiki, linting
│   ├── drop_zone_parser.py    ← mdextractor+regex, percorsi dedotti, salvataggio
│   ├── sd_api.py              ← client txt2img :7860, ControlNet, prompt engineering
│   └── triposr_helpers.py     ← subprocess TripoSR / HTTP TRELLIS, temp+cleanup
└── .streamlit/config.toml     ← tema dark, CORS off, XSRF on
```

## 🔄 Flusso di lavoro tipo

1. Copia i sorgenti Flutter del VTT in `codebase/` e indicizza (🧠 tab RAG).
2. Butta appunti/PDF/screenshot in `raw/` e compilali nella wiki (🧠 tab Wiki).
3. In ⚙️ Orchestratore scrivi il task: l'Hub allega i chunk RAG e le pagine
   wiki pertinenti e impone il **contratto di output** (ogni blocco con
   percorso file in prima riga).
4. Incolla il mega-prompt in Claude/Gemini web, poi la risposta nella Drop
   Zone: `.dart`/`.py` → `codebase/`, `.md` → `wiki/`, con reindicizzazione
   automatica.
5. Genera token (🎨) e personaggi (👤) 2D→3D e le animazioni (🎬) per il VTT.

## 🖥️ Vincoli hardware e architetturali

- **Windows locale, RTX 5080 16 GB VRAM** — SD (~8-10 GB in SDXL) e TripoSR
  (~6 GB) convivono; TRELLIS.2 preferisce girare da solo.
- **Zero cloud**: embeddings (MiniLM, ~90 MB) e indici (Chroma, FTS5) su disco;
  l'unico traffico di rete è verso `localhost`.
- **Python 3.12+**, codice tipato e documentato; Streamlit ≥ 1.40 multipage.
- La wiki usa **FTS5, non embeddings**: retrieval istantaneo senza VRAM.

## 🔮 Estensioni future

- **Integrazione diretta col VTT Flutter**: watcher che sincronizza
  `asset_forge/` con la cartella `assets/` del progetto Flutter e hot-reload.
- **Rigging automatico** (UniRig / Blender headless) + retarget BVH → `.glb`
  animati per il renderer 3D del VTT.
- **LLM locale** (es. Qwen-Coder via llama.cpp) come compilatore wiki
  automatico al posto del TODO manuale.
- **ControlNet preset library**: template top-down per taglie D&D (M/L/H).
- **Export batch** di token per campagne intere da CSV di mostri.

## 🧪 Verifica installazione

```bash
python -m compileall app.py utils pages   # nessun errore di sintassi
streamlit run app.py                      # nessun errore di import
```
