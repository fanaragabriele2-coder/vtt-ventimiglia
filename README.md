# Ultimate VTT 5e — Tavolo Oscuro di Ventimiglia

Virtual Tabletop per D&D 5e ambientato a Ventimiglia, con Master IA (voce + chat),
mappa reale, combattimento a turni, schede personaggio, inventario e creazione PG.

## Avvio rapido

- **Sviluppo / uso normale:** apri `index.html` (doppio click) oppure avvia il server di anteprima:
  ```
  node dev-server.js      →  http://localhost:4599
  ```
- **File unico da condividere:** `dist/ultimate-vtt.html` (autonomo, offline, doppio click).

## Struttura del progetto

```
vttg2506/
├── index.html      ← entry point (referenzia css/ e js/) — LA FONTE DI VERITÀ
├── css/            ← fogli di stile, un file per blocco (caricati in ordine)
│   ├── 01-...css
│   └── ...
├── js/             ← moduli JavaScript, un file per modulo (caricati in ordine)
│   ├── 01-adattatore-party-...js
│   ├── 02-...autodiagnosi...js
│   ├── ...
│   └── 14-start-menu-creazione-personaggio.js
├── dist/           ← build a file singolo (generata)
│   └── ultimate-vtt.html
├── legacy/         ← monolite originale archiviato (non più usato)
├── tools/
│   ├── build-split.js  ← migrazione UNA TANTUM monolite → moduli (già fatta)
│   └── bundle.js       ← moduli → file singolo distribuibile
├── dev-server.js   ← server statico di anteprima locale
└── README.md
```

L'ordine di caricamento conta: i file in `js/` sono numerati e vengono inclusi
nello stesso ordine in cui appaiono in `index.html`. Ogni modulo è una IIFE che
comunica con gli altri tramite `window.UltimateVTT*` (es. `UltimateVTTState`,
`UltimateVTTInventory`, `UltimateVTTCombat`, `UltimateVTTAIBridge`,
`UltimateVTTCoreGameplay`, `VTTCampagna`, `VentimigliaMap`, `VTTStartMenu`).

## Workflow

1. Modifica i file in `css/` e `js/` (oppure aggiungine di nuovi e referenziali in `index.html`).
2. Verifica con `node dev-server.js` → http://localhost:4599.
3. Quando vuoi un file unico da condividere: `node tools/bundle.js` → `dist/ultimate-vtt.html`.

## Master IA

Il Master può essere: **Groq** (chiave API gratuita su console.groq.com), **Ollama**
locale, o il modello **classico** offline. La voce usa Web Speech (TTS + microfono, it-IT).

## Creazione personaggio

Menu iniziale (`js/14-start-menu-...`): 8 razze e 6 classi con bonus di razza,
HP/CA/velocità ed equipaggiamento iniziale calcolati per classe. Nuova Partita /
Carica Salvataggio / Continua. Riapribile col pulsante **☰ MENU**.
