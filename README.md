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
│   ├── 17-per-pg-inventory.js
│   ├── 18-sync-manager.js              ← Fase 1: WebSocket, ruoli GM/Player, rollback
│   ├── 19-combat-state-machine.js      ← Fase 3: FSM combattimento + action economy
│   ├── 20-token-kinematics-network.js  ← Fase 2: throttle 10Hz, coordinate, raggio movimento
│   ├── 21-session-panel.js             ← UI: pannello di sessione multiplayer
│   ├── 22-network-game-events.js       ← routing di rete: HP/danni, nebbia, spawn nemici
│   └── 23-bg3-combat-hud.js            ← HUD combattimento stile BG3 (iniziativa, % colpire, azioni)
├── server/
│   └── relay.js    ← relay WebSocket autorevole (Node, zero dipendenze)
├── tools/test/     ← suite di test (zero dipendenze) + runner; CI in .github/workflows
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

## Combattimento stile Baldur's Gate 3

`js/23-bg3-combat-hud.js` + `css/06-bg3-combat-hud.css` aggiungono una HUD di combattimento in
stile **BG3** che mette in scena la meccanica 5e già presente (modulo 06 combat, modulo 19 FSM,
modulo 05 action economy), **senza modificarli**. Compare solo a combattimento attivo:

- **Barra dell'ordine d'iniziativa** in alto (turno corrente evidenziato, HP per combattente; click
  su un nemico = lo seleziona come bersaglio).
- **Anteprima della probabilità di colpire** il bersaglio (la "70%" di BG3), calcolata in 5e
  (`d20 + bonus ≥ CA`, 20/1 naturale) con **vantaggio/svantaggio** (`1-(1-p)²` / `p²`).
- **Economia delle azioni** del turno (azione / bonus / reazione) e **barra del movimento** residuo.
- Selettore **Normale / Vantaggio / Svantaggio** e pulsanti **Attacca** / **Termina turno**.

La matematica di colpire è esposta come funzioni pure testabili
(`UltimateVTTBG3HUD.probColpire(...)`) e coperta da `tools/test/core-bg3-hud.js`.

## Salvataggio e backup

Oltre al salvataggio in 3 slot su `localStorage` (pulsanti **Save**/**Load**), la toolbar
include **⬇ Backup** / **⬆ Ripristina** (`js/11-10-ai-bridge-json-parser.js`): scaricano/caricano
un file `.json` indipendente dal browser, utile per portare la partita su un altro dispositivo o
come copia di sicurezza — `localStorage` vive solo nel browser di chi lo usa (tipicamente il
Master), quindi è l'unico modo per non perdere la partita se quel browser/profilo va perso.

## Creazione personaggio

Menu iniziale (`js/14-start-menu-...`): 8 razze e 6 classi con bonus di razza,
HP/CA/velocità ed equipaggiamento iniziale calcolati per classe. Nuova Partita /
Carica Salvataggio / Continua. Riapribile col pulsante **☰ MENU**.

## Sincronizzazione real-time (multiplayer)

Architettura a 3 fasi, tutta in HTML/JS, agganciata ai moduli esistenti. Resta
**single-player a costo zero** finché non ci si connette a un relay.

- **Fase 1 — `UltimateVTTSync` (`js/18`):** dispatcher WebSocket con eventi tipizzati
  (`TokenMovedEvent`, `TurnEndedEvent`, `CombatStartedEvent`), ruoli **GM** e **Player**,
  stato locale predittivo con **rollback**, riconnessione automatica (backoff esponenziale)
  e coda offline. In GM-only e possesso-token l'autorità è applicata sia sul client sia sul relay.
- **Fase 2 — `UltimateVTTKinematics` (`js/20`):** traduzione coordinate schermo↔mondo↔cella,
  **throttle di rete a ~10Hz** durante il drag (UI a 60fps), limite di movimento in combattimento
  e overlay del raggio raggiungibile.
- **Fase 3 — `UltimateVTTCombatFSM` (`js/19`):** macchina a stati `OutOfCombat` →
  `RollingInitiative` → `CombatActive(turnId)` → `CombatPaused(GM)`, con budget di movimento
  (velocità − movimento speso) collegato all'action economy del PG.

- **Pannello di sessione — `UltimateVTTSessionPanel` (`js/21` + `css/05`):** pannello flottante
  (bottone **🌐 SESSIONE** in basso a sinistra) per gestire la sessione senza console: URL del relay,
  nome/identità, ruolo (Master / Giocatore), selezione dei **token posseduti**, Connetti/Disconnetti
  con stato live, stato del **turno** corrente e **lista partecipanti** (alimentata dal `RosterEvent`
  che il relay trasmette a ogni ingresso/uscita).

**Turni autorevoli + ingresso a partita in corso:**
- **Turni dettati dal Master.** Sul client giocatore l'ordine d'iniziativa e il turno corrente
  non vengono ricalcolati in locale: arrivano dal Master via `CombatStartedEvent` / `TurnEndedEvent`
  e la FSM li applica così come sono (`UltimateVTTCombatFSM.applicaSnapshot` per lo stato completo).
  Il gating del movimento (`puoMuovereOra`, `eIlTurnoDi`) usa quindi sempre il turno autorevole.
- **Hydration mid-game.** Chi si connette a partita iniziata invia un `StateSyncRequest`; il Master
  risponde con uno `StateSyncEvent` (snapshot di stato PG, posizioni token, combattimento **e** stato
  FSM con turno/round/budget). Il nuovo arrivato idrata stato e mappa e allinea i turni al Master,
  senza interrompere il gioco degli altri.
- **Movimento interpolato.** I movimenti dei token in arrivo dalla rete (anteprime a ~10Hz e finale)
  vengono applicati in modo **animato**: la molla del modulo token li fa scivolare fluidi invece di
  «teletrasportarsi» da cella a cella.
- **Sistemi di gioco sincronizzati — `UltimateVTTNetEvents` (`js/22`).** Instrada in rete, in modo
  **GM-autorevole**, anche HP/danni (`applyDamageToCombatant`/`healCombatant` → `CombatantHpEvent`),
  nebbia di guerra (`revealCircle`/`hideCircle`/`fillFog` → `FogRevealedEvent`) e comparsa nemici
  (`VTTSpawn.spawn` → `EnemySpawnedEvent`). Avvolge le funzioni esistenti senza modificarle; i client
  rieseguono l'azione (deterministica grazie all'hydration) e il guard remoto evita le eco a catena.
- **Mappatura esplicita token ↔ combattente.** Oltre all'euristica (`token-pc↔pc-local`,
  `token-npc-N↔npc-N`), il Master può assegnare esplicitamente ogni token al suo combattente dal
  pannello di sessione (utile con token personalizzati o party numerosi). La mappa è **GM-autorevole**
  (`TokenMappingEvent`), entra nello snapshot di hydration e i giocatori la ricevono in sola lettura;
  il gating del movimento (`puoMuovereOra`, `eIlTurnoDi`) la usa al posto dell'euristica.

### Avvio del relay e connessione

```
node server/relay.js          # ws://localhost:4600  (PORT=xxxx per cambiare porta)
```

Il modo più semplice di connettersi è il **pannello 🌐 SESSIONE** (in basso a sinistra). In
alternativa, dalla console del browser:

```js
// Master (host autorevole)
UltimateVTTSync.connetti("ws://localhost:4600", { ruolo: "gm", idGiocatore: "master" });

// Giocatore: possiede solo i propri token
UltimateVTTSync.connetti("ws://localhost:4600", {
  ruolo: "player", idGiocatore: "anna", tokenPosseduti: ["token-pc"]
});
```

### Hardening del relay (produzione)

Tutto opzionale e attivabile da variabili d'ambiente; in loro assenza il relay resta in WS chiaro
e senza autenticazione (comodo in sviluppo):

```
# WSS/TLS (relay cifrato)
TLS_CERT=/path/cert.pem TLS_KEY=/path/key.pem node server/relay.js

# Token di sessione (richiesto a tutti) + token Master (richiesto per il ruolo gm)
AUTH_TOKEN=segreto GM_TOKEN=segreto-master node server/relay.js
```

- **`AUTH_TOKEN`**: chi non lo presenta nell'`hello` viene rifiutato (`AuthEvent` fatale) e disconnesso;
  il client interrompe i tentativi di riconnessione.
- **`GM_TOKEN`**: chi chiede il ruolo `gm` senza il token giusto viene **declassato a giocatore**
  (`AuthEvent` non fatale), evitando che chiunque si dichiari Master.
- Inoltre il relay applica **validazione dei payload** (dimensione frame/messaggio), **rate limiting**
  per client (token bucket) e chiusura dei client palesemente abusivi.
- **Resilienza**: `process.on("uncaughtException"/"unhandledRejection")` evita che un errore
  imprevisto in un singolo handler abbatta l'intero processo (e con esso la sessione di tutti i
  client connessi); un conflitto di porta (`EADDRINUSE`) produce un messaggio chiaro invece di uno
  stack trace grezzo.

Nel pannello i campi **Token sessione** e **Token Master** corrispondono ad `AUTH_TOKEN` e `GM_TOKEN`.

I nuovi global esposti sono `UltimateVTTSync`, `UltimateVTTCombatFSM`, `UltimateVTTKinematics`,
`UltimateVTTSessionPanel`.
