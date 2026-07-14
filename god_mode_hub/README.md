# 🚀 God-Mode Local AI Hub

Hub Streamlit **100% locale** che unifica il "secondo cervello", l'orchestrazione
manuale degli LLM via chat web e la fabbrica di asset 2D→3D per lo sviluppo del
**Virtual Tabletop (VTT)** *Ultimate VTT 5e, Tavolo Oscuro di Ventimiglia*
(attualmente JavaScript/HTML/CSS; `codebase/` resta pronta per un futuro
riscritto Flutter/Dart).

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

### Backend esterni

| Backend | A cosa serve | Stato |
|---|---|---|
| **Stable Diffusion** | generazione 2D (token, personaggi, frame) | vedi sotto |
| **TripoSR** | Image-to-3D `.glb` (veloce) | vedi sotto |
| **TRELLIS.2** | Image-to-3D di qualità superiore | opzionale, non richiesto |
| **ffmpeg** | export MP4 delle animazioni | opzionale — `winget install ffmpeg` |

#### 1. Attivare l'API di Stable Diffusion (Stability Matrix)

1. Apri **Stability Matrix** → seleziona il tuo pacchetto WebUI (A1111 o Forge).
2. Nella scheda del pacchetto, apri le **Launch Options** (icona ingranaggio).
3. Nel campo **Extra Launch Arguments** aggiungi:
   ```
   --api
   ```
4. Avvia la WebUI (`Launch`). Alla console dovresti vedere una riga tipo
   `Running on local URL: http://127.0.0.1:7860`.
5. Torna nell'Hub (pagina 🎨 Asset Forge o home): l'indicatore diventa
   **🟢 Stable Diffusion :7860**. Se resta rosso, verifica che la WebUI sia
   davvero partita (controlla la finestra dei log di Stability Matrix) e che
   nessun firewall blocchi `localhost:7860`.
6. Se usi una porta diversa da 7860, imposta la variabile d'ambiente
   `SD_API_URL` (es. `http://127.0.0.1:7861`) prima di lanciare `run_hub.bat`.

*(Opzionale, per il vincolo top-down nei token) installa l'estensione
`sd-webui-controlnet` da Stability Matrix → Extensions, se non è già presente.*

#### 2. Installare/riparare TripoSR (Image-to-3D) — automatico

**Doppio click su `tools\FIX_TRIPOSR.bat`** (o lancialo dal terminale). Lo
script fa tutto da solo, con retry e fallback:

1. clona TripoSR sul Desktop (se manca) e crea il suo venv;
2. rileva la GPU e — se è una RTX 50xx (Blackwell, `sm_120`) — **aggiorna
   PyTorch a una build cu128**, l'unica che la supporta (le cu12.4 crashano
   a runtime);
3. importa `vcvars64` e **forza la toolchain MSVC a x64** (il Developer
   Command Prompt di VS ha come default x86: è la causa del classico
   `CUDA_CUDART_LIBRARY missing` — la libreria viene cercata in `lib/Win32`);
4. tenta la build nativa di `torchmcubes`; se fallisce installa lo **shim
   puro-Python** (`tools/torchmcubes_shim/`), drop-in equivalente basato su
   PyMCubes/scikit-image: zero compilazione, stessa geometria (verificata:
   errore < 0.01 voxel, convenzione assi identica al nativo);
5. installa i requirements TripoSR (filtrando la riga torchmcubes) e
   `onnxruntime` (richiesto da `rembg` a runtime ma non più dichiarato);
6. imposta `TRIPOSR_DIR` e `TRIPOSR_PYTHON` (permanenti, utente);
7. verifica tutto per davvero: op su GPU, import, `run.py --help` e — se non
   passi `-NoModelTest` — una conversione completa immagine→`.glb`.

Log completo in `tools\fix_triposr.log`. Dopo lo script, riapri l'Hub
(`RUN_ME_FIRST.bat` o `run_hub.bat`): l'indicatore TripoSR diventa 🟢.

> Tutti gli script usano `python -m ...` e mai `pip.exe`/`streamlit.exe`:
> Smart App Control di Windows 11 blocca gli exe non firmati generati nei
> venv, ma non i moduli eseguiti dentro `python.exe` (firmato).

L'Hub **degrada con grazia**: ogni pagina controlla i backend e mostra cosa
manca senza mai rompersi (RAG → fallback full-text, SD offline → avviso, ecc.).

## 🗺️ Moduli

| Pagina | Funzione |
|---|---|
| 🏠 **Home** | dashboard: contatori contenuti/asset, attività recente, azioni rapide |
| 🧠 **Secondo Cervello** | **Tab RAG**: query semantiche (ChromaDB + all-MiniLM-L6-v2) sul **progetto VTT reale** (`index.html`, `css/`, `js/`, `tools/` — questo stesso repo) e su `codebase/` (futuro Flutter); fallback full-text automatico se ChromaDB non è installato; **Tab Wiki**: ricerca FTS5+RRF su `wiki/`+`raw/`, compilazione fonti `raw/ → wiki/sources/`, linting (link orfani, contraddizioni euristiche) |
| ⚙️ **Orchestratore** | genera **mega-prompt** (task + contesto RAG/Wiki + contratto di output), download `.md`; **Drop Zone**: incolli la risposta di Claude, Gemini o Perplexity, il parser estrae code block e pagine wiki — i blocchi `.js`/`.css`/`.html` finiscono **direttamente nel progetto VTT reale**, i `.dart`/`.py` in `codebase/` (Flutter futuro), i `.md` in `wiki/`, con percorsi dedotti ed editabili prima del salvataggio |
| 🎨 **Asset Forge** | prompt → token top-down (SD, ControlNet opzionale) → `.glb` con TripoSR → download; galleria dei token |
| 👤 **Generatore Personaggi** | nome+descrizione → concept full-body (posa A, sfondo bianco: ottimale per Image-to-3D) → `.glb` con TripoSR o TRELLIS.2; roster |
| 🎬 **Animazioni** | sprite sheet 2D frame-per-frame (seed deterministici), GIF (Pillow) e MP4 (ffmpeg); coda locale per il rigging 3D (roadmap UniRig/Blender) |

## 📁 Struttura

```
vtt-ventimiglia/                ← radice del repo = progetto VTT reale
├── index.html  css/  js/  tools/   ← sorgenti VTT (indicizzati dal RAG,
│                                      target della Drop Zone per .js/.css/.html)
└── god_mode_hub/
    ├── app.py                     ← entry point (stato componenti + navigazione)
    ├── pages/                     ← le 6 pagine Streamlit
    ├── raw/                       ← fonti grezze: note, PDF, screenshot
    ├── wiki/                      ← LLM Wiki (pattern Karpathy)
    │   ├── index.md  log.md       ← indice curato + diario automatico
    │   ├── sources/ concepts/ entities/
    │   └── wiki_fts.db            ← indice FTS5 (generato, escluso da git)
    ├── codebase/                  ← futuro riscritto Flutter (.dart/.py), per ora vuota
    ├── asset_forge/               ← output: characters/ tokens/ animations/
    ├── chroma_index/              ← indice ChromaDB persistente (generato)
    ├── utils/
    │   ├── chroma_rag.py          ← ingest+query ChromaDB (VTT reale + codebase/), fallback full-text
    │   ├── llm_wiki.py            ← FTS5 + RRF, compilazione raw→wiki, linting
    │   ├── drop_zone_parser.py    ← mdextractor+regex, routing .js/.css/.html→VTT reale, .dart/.py→codebase/
    │   ├── sd_api.py              ← client txt2img :7860, ControlNet, prompt engineering
    │   └── triposr_helpers.py     ← subprocess TripoSR / HTTP TRELLIS, temp+cleanup
    └── .streamlit/config.toml     ← tema dark, CORS off, XSRF on
```

## 🔄 Flusso di lavoro tipo

1. In 🧠 Secondo Cervello premi **"📥 (Re)indicizza tutto"**: indicizza il
   progetto VTT reale (`index.html`, `css/`, `js/`) e — quando esisterà —
   `codebase/` per il futuro Flutter.
2. Butta appunti/PDF/screenshot in `raw/` e compilali nella wiki (🧠 tab Wiki).
3. In ⚙️ Orchestratore scrivi il task: l'Hub allega gli snippet reali del VTT
   (via RAG) e le pagine wiki pertinenti, e impone il **contratto di output**
   (ogni blocco con percorso file in prima riga).
4. Incolla il mega-prompt in Claude, Gemini o Perplexity web, poi la risposta nella Drop
   Zone: `.js`/`.css`/`.html` finiscono **direttamente nel progetto VTT
   reale** (revisiona con `git diff` prima di committare!), `.dart`/`.py` in
   `codebase/`, `.md` in `wiki/` — con reindicizzazione automatica.
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
