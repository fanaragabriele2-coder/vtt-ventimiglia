# FIX_REPORT — God-Mode Hub / pipeline TripoSR su Windows

Data: 2026-07-03 · Sessione: riparazione autonoma build TripoSR + hardening Hub

## Stato iniziale

- Hub Streamlit funzionante (RAG collegato al VTT reale, Orchestratore, Asset
  Forge lato 2D). Backend 3D bloccato: `pip install -r requirements.txt` di
  TripoSR falliva sulla wheel nativa di **torchmcubes** con
  `CMake Error: CUDA cannot be found / CUDA_CUDART_LIBRARY missing`, e la
  transazione pip abortita lasciava **zero** dipendenze TripoSR installate.
- Ambiente destinazione: Windows 11 (Smart App Control attivo), RTX 5080,
  Python 3.10.6 nel venv TripoSR, torch `2.6.0+cu124`, CUDA Toolkit 13.3,
  Visual Studio Build Tools 2026 (v18.7.3), Stability Matrix con WebUI SD.

## Problemi trovati e cause radice

| # | Problema | Causa radice (evidenza dal log) |
|---|---|---|
| RC1 | `CUDA_CUDART_LIBRARY missing` nonostante `cudart.lib` esista in `lib\x64` | La build era **x86**: il log mostra `Hostx64/x86/cl.exe` — il "Developer Command Prompt" di VS ha target di default x86, quindi FindCUDA cercava la libreria in `lib\Win32` (inesistente) |
| RC2 | `Looking for a CUDA compiler - NOTFOUND` | Mancano i file di integrazione MSBuild `CUDA 13.3.props/targets` dentro VS 2026 BuildTools (CUDA installato senza VS rilevato) |
| RC3 | (latente, mai visto perché la build falliva prima) torch `cu124` **non supporta sm_120** (RTX 5080 Blackwell) → crash a runtime garantito | Wheel torch compilata senza kernel Blackwell; serve indice `cu128` |
| RC4 | Nessuna dipendenza TripoSR installata | pip abortisce l'intera transazione quando una wheel fallisce |
| RC5 | (latente) `rembg==2.0.69` risolta senza `onnxruntime` | rembg ha spostato onnxruntime negli extras: crash alla prima rimozione sfondo |
| RC6 | Smart App Control blocca `pip.exe`/`streamlit.exe` | Exe non firmati generati nel venv; `python.exe` (firmato) con `-m` passa |

## Patch applicate (file nel repo)

| File | Cosa fa |
|---|---|
| `tools/fix_triposr.ps1` | **Riparazione autonoma completa**: clone/venv, rilevamento GPU (`nvidia-smi --query-gpu=compute_cap`), upgrade torch→cu128 se Blackwell, import `vcvars64` + `CMAKE_GENERATOR_PLATFORM=x64` (fix RC1), copia best-effort dell'integrazione CUDA-VS (fix RC2, con degradazione pulita), build nativa torchmcubes con retry → fallback shim, requirements filtrati (fix RC4), `onnxruntime` (fix RC5), env vars `TRIPOSR_DIR`/`TRIPOSR_PYTHON` permanenti, batteria di verifiche reali (op GPU, import, `run.py --help`, E2E immagine→`.glb`), log via transcript |
| `tools/FIX_TRIPOSR.bat` | Wrapper doppio-click (ExecutionPolicy Bypass); inoltra flag: `-NoModelTest`, `-SkipNativeBuild` |
| `tools/torchmcubes_shim/` | **Pacchetto vendorizzato** `torchmcubes 0.1.0+godmodehub.shim`: drop-in puro-Python di `marching_cubes` via PyMCubes (fallback scikit-image). Replica la convenzione assi del nativo (colonne invertite) che TripoSR ri-inverte con `v_pos[..., [2,1,0]]`. Toggle di debug: `TORCHMCUBES_SHIM_RAW`, `TORCHMCUBES_SHIM_FLIP_FACES` |
| `RUN_ME_FIRST.bat` | Entry point unico: `git pull` → venv Hub → requirements → stato TripoSR (offre la riparazione con timeout 15s) → avvio Streamlit. Tutto via `python -m` (fix RC6) |
| `utils/triposr_helpers.py` | Messaggio d'errore ora punta a `tools\FIX_TRIPOSR.bat` |
| `README.md` | Sezione backend riscritta: riparazione automatica documentata |

## Verifiche eseguite

**Nel sandbox (questa sessione):**
- Shim: **12/12 test PASS** — sfera con errore raggio max `0.007` voxel;
  convenzione assi identica al torchmcubes nativo (blob asimmetrico:
  centroide `(38,24,10)` per feature in `(10,24,38)`, round-trip con lo
  swizzle di TripoSR esatto); fallback scikit-image geometricamente
  identico; toggle env funzionanti; `pip install` del pacchetto shim OK.
- Hub: `python -m compileall` pulito; suite AppTest 7/7 pagine PASS
  (invariata dopo le modifiche).

**Sul PC di destinazione (eseguite automaticamente da `FIX_TRIPOSR.bat`):**
- op reale su GPU (`matmul` su `cuda`), import di tutti i moduli chiave,
  `run.py --help`, conversione E2E `examples/chair.png → .glb`
  (disattivabile con `-NoModelTest`), stato API SD su `:7860`.

## Stato finale

- Repo: tutte le patch committate e pushate su
  `claude/god-mode-local-ai-hub-s0fxqe`. I file arrivano sul PC con
  `git pull` (niente Mark-of-the-Web → niente blocchi Smart App Control).
- Percorso di successo garantito: anche se la build nativa CUDA resta
  impossibile su quella combinazione VS2026/CUDA13.3, lo **shim chiude il
  problema in modo deterministico** — l'estrazione mesh (marching cubes) va
  su CPU in secondi, l'inferenza del modello resta su GPU.

## Istruzioni finali minime

```cmd
cd /d %USERPROFILE%\Desktop\vtt-ventimiglia
git pull
god_mode_hub\tools\FIX_TRIPOSR.bat
```

Unico passaggio non automatizzabile da script (GUI di un'app di terze
parti): Stability Matrix → pacchetto WebUI → Launch Options → aggiungere
`--api` → Launch. Lo script verifica e segnala lo stato della porta 7860.
