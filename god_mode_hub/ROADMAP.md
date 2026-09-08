# 🗺️ Roadmap e stato reale del progetto

Analisi verificata **eseguendo il codice**, non leggendolo soltanto: ogni
riga della colonna "come l'ho verificato" corrisponde a un test o a una
misura riproducibile con `TEST.bat`.

Ultimo aggiornamento: settembre 2026.

---

## 1. Cosa funziona davvero

| Componente | Stato | Come l'ho verificato |
|---|---|---|
| Apertura delle 7 pagine dell'Hub | ✅ | `AppTest` esegue ogni pagina: nessuna eccezione anche con SD spento e indici vuoti |
| RAG codebase (Chroma + fallback full-text) | ✅ | Query reale senza indice: il fallback trova il file giusto e ordina per rilevanza |
| LLM Wiki (FTS5 + RRF) | ✅ | Indicizzazione, ricerca, compilazione fonti, log: tutti testati |
| Linting wiki (link orfani, contraddizioni) | ✅ | Rileva `[[pagina_inesistente]]` e le negazioni contraddittorie; 60 pagine / 1800 bullet in **0,06 s** |
| Drop Zone: estrazione blocchi | ✅ | 6 formati di dichiarazione percorso (fence, commento, contesto) tutti testati |
| Drop Zone: contenimento percorsi | ✅ | 5 forme di path traversal testate: **nessuna** scrive fuori dal repo |
| Rilevamento Stable Diffusion a 3 stati | ✅ | 405 vs 404 su `/sdapi/v1/txt2img` distingue "pronta" da "senza --api"; falsi positivi (porta occupata da altro servizio) esclusi |
| Generazione via API REST | ✅ | Decodifica PNG e messaggi d'errore testati con risposte HTTP simulate |
| Generazione via automazione browser (senza `--api`) | ✅ | Playwright reale contro pagina che replica il DOM di A1111/Forge, in entrambe le modalità di galleria |
| Prompt engineering (token top-down, personaggi A-pose) | ✅ | Contenuto dei prompt verificato |
| VTT: integrità dei moduli | ✅ | Tutti i file `js/` sono referenziati in `index.html`, nessun riferimento rotto, nessuna chiave API hardcoded |

## 2. Cosa non funziona o ha limiti noti

| Problema | Gravità | Stato |
|---|---|---|
| **Drop Zone sovrascriveva i file VTT senza backup né diff** — un modulo funzionante da 3 KB veniva rimpiazzato da uno stub LLM da 51 byte, senza modo di tornare indietro | 🔴 critico | **risolto** (§3) |
| **Nessun test nel repo**: ogni verifica andava persa, tu non potevi controllare nulla | 🔴 critico | **risolto** (§3) |
| Scritture possibili in `.git/`, `node_modules/`, `dist/` | 🟠 alto | **risolto** (§3) |
| SD ri-sondata a ogni interazione dell'interfaccia | 🟡 medio | **risolto** (§3) |
| Animazioni: nessun supporto all'automazione browser | 🟡 medio | **risolto** (§3) |
| PDF in `raw/`: diventavano pagine wiki vuote | 🟡 medio | **risolto** (§3), ma non verificabile nel mio ambiente (vedi nota) |
| Sprite sheet non coerenti (ogni frame un seed diverso) | 🟡 medio | **risolto**: modalità "frame coerenti" via img2img |
| Token generati quadrati con sfondo pieno: inutilizzabili sulla mappa senza editing manuale | 🟠 alto | **risolto**: post-produzione sfondo trasparente + cerchio |
| Nessun modo di vedere il gioco, il diff o committare senza uscire dall'Hub | 🟠 alto | **risolto**: pagina 🌐 Progetto VTT |
| **Rigging 3D**: la tab esiste ma è solo documentazione + coda di file. Nessun rigging avviene | 🟡 medio | aperto per scelta (Fase 3) |
| **TripoSR/TRELLIS non verificabili da qui**: richiedono GPU e repo locali | 🟡 medio | aperto — solo tu puoi provarli |
| `dist/ultimate-vtt.html` citato nel README ma inesistente | 🟢 basso | **risolto**: generato, e rigenerabile dall'Hub |
| VTT: 22 usi di `innerHTML` — se un nome PG o un messaggio di chat ci finisce dentro, è iniezione HTML | 🟢 basso (app locale monoutente) | aperto (Fase 2) |
| VTT: `js/12-patch-touch-events-per-mobile.js` è 3580 righe, un quarto dell'intera codebase | 🟢 basso | aperto (Fase 3) |
| Selettori dell'automazione browser mai provati sulla **tua** installazione | 🟡 medio | da verificare con "Testa selettori browser" |

> **Nota sull'estrazione PDF**: il codice c'è ed è testato nel ramo di
> fallback, ma nel mio ambiente `pypdf` non è importabile (dipendenza nativa
> rotta). Il test **salta** invece di dare un falso verde: il primo collaudo
> vero avviene sul tuo PC.

## 3. Fatto in questa sessione

1. **Rete di sicurezza sulle scritture** (`utils/safe_write.py`)
   - backup automatico in `.hub_backups/<data_ora>/` prima di ogni sovrascrittura,
     con **ripristino a un click** dall'Orchestratore;
   - **diff riga per riga** mostrato *prima* di salvare;
   - **allarme troncatura**: riconosce i marcatori di codice omesso
     (`// ... resto invariato`, `/* unchanged */`, `[truncated]`…) e i crolli
     di dimensione, i due modi in cui un LLM ti distrugge un file;
   - **aree protette**: `.git/`, `node_modules/`, `dist/`, `.venv/` rifiutate.
2. **Suite di test permanente**: 98 test, `TEST.bat` per lanciarla con un doppio
   click. Copre sicurezza scritture, parser, wiki, RAG, entrambi i backend SD e
   le pagine Streamlit con interazione reale.
3. **Automazione browser anche nelle Animazioni**, con normalizzazione della
   dimensione dei frame (la WebUI decide la sua, lo sprite sheet richiede una
   griglia fissa).
4. **Cache del rilevamento SD** (15 s): niente più sondaggi HTTP a ogni slider.
5. **Estrazione testo dai PDF** per le fonti wiki.

## 3bis. Fase 1 e 2 completate

**Fase 1 — il ciclo di lavoro è chiuso.** Nuova pagina **🌐 Progetto VTT**:
- **anteprima live**: avvia/ferma `node dev-server.js` dall'Hub e apre il gioco;
- **modifiche (git)**: `git status` + diff riga per riga di quello che la Drop
  Zone ha appena scritto — inclusi i **file nuovi**, che `git diff` normalmente
  ignora — e commit selettivo dei soli file scelti;
- **import asset**: copia i PNG/GLB generati in `assets/` del VTT e ti dà il
  percorso da usare nel codice; non sovrascrive (aggiunge un suffisso).
- `dist/ultimate-vtt.html` generato (625 KB) e rigenerabile con un pulsante.

**Fase 2 — qualità della generazione:**
- **Token VTT veri**: nuova post-produzione in Asset Forge — sfondo reso
  trasparente (rembg se installato, altrimenti riempimento dai bordi incluso),
  ritaglio sul soggetto, maschera circolare con bordo. Due bug trovati
  *guardando l'anteprima*, non dai test: il cerchio tagliava il soggetto e il
  ritaglio quadrato decapitava i personaggi verticali. Entrambi ora hanno un
  test di regressione.
- **Sprite sheet coerenti**: nuova modalità img2img, ogni frame nasce dal
  precedente. La modalità indipendente resta, ma ora dichiara esplicitamente
  che i frame non sono in continuità.
- **Libreria prompt**: salva i prompt riusciti con i loro parametri, li riusa
  con un click e conta quante volte li hai usati.

## 4. Prossimi passi, in ordine di valore

### Fase 3 — Cosa resta
- **Rigging 3D reale** (UniRig o Blender headless): la tab è ancora un
  segnaposto documentato. È l'unico pezzo grosso rimasto.
- **Igiene `innerHTML` nel VTT**: 22 occorrenze; dove entra testo scritto
  dall'utente (nomi PG, chat) andrebbe `textContent`. Rischio basso su
  un'app locale monoutente, ma è debito tecnico reale.
- **Spezzare `js/12-patch-touch-events-per-mobile.js`** (3580 righe, un quarto
  della codebase del gioco).
- **Anteprima del token direttamente sulla mappa** del VTT, per vedere se le
  proporzioni funzionano prima di importarlo.
- **Collaudo sulla tua macchina** di ciò che qui non è verificabile: selettori
  browser sulla tua Forge, TripoSR/TRELLIS, estrazione PDF.

---

## Come verificare tu stesso

```
TEST.bat                     doppio click: esegue tutti i test
python -m pytest -q          equivalente da terminale
python -m pytest tests/test_safe_write.py -v    solo la rete di sicurezza
```

`s` accanto a un test significa **saltato**, non fallito: manca un componente
opzionale (Playwright, pypdf) e il test lo dice invece di fingere che vada.
