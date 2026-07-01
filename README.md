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
│   ├── 23-bg3-combat-hud.js            ← HUD combattimento stile BG3 (iniziativa, % colpire, danno, azioni)
│   ├── 24-bg3-reactions.js             ← attacchi di opportunità / reazioni (stile BG3)
│   ├── 25-bg3-flanking.js              ← fiancheggiamento: vantaggio se il bersaglio è preso tra due fuochi
│   ├── 26-bg3-shove.js                 ← azione Spingi: prova contrapposta, spinge il bersaglio di una cella
│   ├── 27-bg3-surfaces.js              ← superfici fuoco/veleno: danno periodico ad area, GM-autorevoli
│   ├── 28-bg3-elevation.js             ← terreno sopraelevato: vantaggio/svantaggio dalla quota
│   ├── 29-combat-memory.js             ← memoria di combattimento per il Master IA
│   ├── 30-bg3-conditions.js            ← condizioni di stato: prono/stordito/avvelenato
│   ├── 31-combat-view-autoswitch.js    ← torna alla griglia tattica a inizio combattimento
│   └── 32-campaign-memory.js           ← diario di campagna a lungo termine per il Master IA
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
- **Anteprima del danno previsto** (media della formula, es. `~10 danni (2d6+3)`).
- **Economia delle azioni** del turno (azione / bonus / reazione) e **barra del movimento** residuo.
- Selettore **Normale / Vantaggio / Svantaggio** e pulsanti **Attacca** / **Termina turno**.

**Attacchi di opportunità / reazioni — `js/24-bg3-reactions.js` (`UltimateVTTReactions`).** Quando un
combattente esce dalla portata in mischia (cella adiacente) di un nemico con la **reazione** ancora
disponibile, quel nemico effettua un attacco di opportunità (tiro per colpire + danni). La reazione
del PG passa per l'action economy del modulo 05; quella dei PNG è gestita internamente e si rinnova a
ogni round. La logica decisionale è una funzione pura testabile (`attacchiOpportunita(...)`).

**Fiancheggiamento (flanking) — `js/25-bg3-flanking.js` (`UltimateVTTFlanking`).** Se un alleato
dell'attaccante occupa la cella opposta al bersaglio (lato o angolo opposto, entrambi adiacenti al
bersaglio), l'attacco ha **vantaggio** — regola 5e opzionale, sempre attiva in BG3. Un badge
**🗡 Fiancheggiato** compare nella HUD e la % di colpire riflette il vantaggio (si annulla se il
giocatore ha scelto manualmente svantaggio, come da regola 5e). Modulo di sola logica: la HUD (23)
lo consulta se presente, ma funziona anche senza.

**Spingi (shove) — `js/26-bg3-shove.js` (`UltimateVTTShove`).** Prova contrapposta 5e: Atletica
dell'attaccante contro la migliore tra Atletica/Acrobazia del bersaglio (il bersaglio sceglie). Se
l'attaccante vince, il bersaglio è spinto di una cella nella direzione opposta a lui (bloccato dal
terreno impraticabile come qualsiasi altro movimento). Ambito volutamente limitato alla sola
variante "spinta" della regola (non "atterra a terra": il gioco non ha ancora un sistema di
condizioni/stati). I PNG non hanno punteggi di caratteristica nel catalogo: si usano euristiche
ragionevoli (Atletica ≈ `attackBonus`, Acrobazia ≈ `initiativeBonus`); il PG usa le sue statistiche
reali. Il pulsante **Spingi** si inserisce da solo nella barra azioni della HUD (23) se presente,
ma la funzione `spingi()` funziona anche senza.

La matematica di colpire/danno e la logica di reazioni/fiancheggiamento/spinta sono esposte come
funzioni pure testabili (`UltimateVTTBG3HUD.probColpire/dannoMedio`,
`UltimateVTTReactions.attacchiOpportunita`, `UltimateVTTFlanking.staFiancheggiando`,
`UltimateVTTShove.esitoSpinta/celleSpinta`) e coperte da `tools/test/core-bg3-hud.js`,
`tools/test/core-bg3-reactions.js`, `tools/test/core-bg3-flanking.js` e `tools/test/core-bg3-shove.js`.

**Multiplayer: solo il Master risolve le reazioni e la spinta.** Attacchi di opportunità (24) e
Spingi (26) applicano danno/movimento con chiamate dirette alle primitive locali (non passano dal
livello cinematico di rete del modulo 20). Se ogni client connesso li risolvesse in autonomia,
ciascuno tirerebbe dadi propri (`Math.random` non è sincronizzato) con esiti diversi su schermi
diversi. Entrambi i moduli controllano `isMasterOrSolo()` (stesso pattern del modulo 19): in
multiplayer solo il Master risolve; il danno si sincronizza da solo (il modulo 22 lo instrada in
rete solo quando il Master lo applica), la spinta emette esplicitamente un `TokenMovedEvent` dopo
il movimento. In single-player (nessun Sync connesso) risolve sempre il client locale.

**Superfici (fuoco, veleno) — `js/27-bg3-surfaces.js` (`UltimateVTTSurfaces`).** Aree del campo di
battaglia che infliggono danno periodico (una volta per round) a chi vi si trova, e scadono dopo un
numero fisso di round. Progettato **GM-autorevole fin da subito** (a differenza di 24/26, corretti
in un secondo momento): solo il Master crea le superfici (`SurfaceCreatedEvent`, propagato agli
altri client) e applica il tick del danno; la scadenza è invece calcolabile da ogni client in modo
sicuro perché dipende solo dal **round della FSM** (l'unico sincronizzato su tutti i ruoli — quello
locale di `UltimateVTTCombat` non lo è per i client giocatore), non serve un evento di rete per
rimuoverle. Overlay disegnato sul canvas (stesso pattern del raggio di movimento nel modulo 20).
Comando IA drivabile via bridge (modulo 11): `{ command: "createSurface", type: "fuoco"|"veleno",
cellX, cellY, radius, rounds }` — il Master IA può narrativamente incendiare una stanza. Ambito
volutamente limitato al solo danno periodico: niente condizioni persistenti (il gioco non ha ancora
uno stato "in fiamme"/"avvelenato") né propagazione dinamica delle superfici.

**Terreno sopraelevato (elevation) — `js/28-bg3-elevation.js` (`UltimateVTTElevation`).** Estende la
mappa con una **quota per cella** (intero, 0 = normale). Attaccare da una quota più alta di quella
del bersaglio dà **vantaggio**; attaccare da più in basso dà **svantaggio** — la lettura "terreno
sopraelevato" più riconoscibile di BG3, qui semplificata a un confronto diretto di quota (nessuna
linea di vista: fuori ambito). GM-autorevole fin da subito, come le superfici: solo il Master dipinge
un'area (`ElevationSetEvent`, propagato); la lettura è sicura su ogni client perché non muta nulla.

Poiché sia il fiancheggiamento (25) sia il terreno possono essere attivi insieme, la HUD (23) li
**compone** secondo la regola 5e generalizzata a più fonti: se c'è almeno una fonte di vantaggio e
almeno una di svantaggio, si annullano (torna "normale"), altrimenti vince quella presente — con due
badge indipendenti (**🗡 Fiancheggiato** e **⛰ Terreno sopraelevato** / **⬇ Svantaggio di quota**)
mostrati anche quando l'effetto netto è "normale", così il giocatore capisce perché si annullano.
Comando IA: `{ command: "setElevation", cellX, cellY, radius, level }`.

**Condizioni di stato (prono, stordito, avvelenato) — `js/30-bg3-conditions.js`
(`UltimateVTTConditions`).** I moduli 26 (Spingi) e 27 (Superfici) segnalavano esplicitamente questa
lacuna nei loro stessi commenti ("il gioco non ha ancora un sistema di condizioni/stati"): questo
modulo la colma con un sottoinsieme volutamente ristretto delle condizioni 5e più riconoscibili in
combattimento — **🩹 Prono** (chi lo subisce viene colpito con vantaggio; i suoi attacchi hanno
svantaggio, semplificato senza la distinzione mischia/gittata della regola completa), **💫 Stordito**
(chi lo subisce viene colpito con vantaggio) e **☠️ Avvelenato** (svantaggio sui propri attacchi).
Ogni condizione ha una durata in round sul **round sincronizzato della FSM** (stesso pattern delle
superfici) e scade automaticamente, in modo calcolabile da ogni client senza bisogno di un evento di
rete per la rimozione. GM-autorevole fin da subito: solo il Master applica/rimuove una condizione
(`ConditionSetEvent`/`ConditionClearedEvent`, propagati agli altri client). La HUD (23) la compone
con fiancheggiamento ed elevazione secondo la stessa regola di sovrapposizione 5e, con un terzo badge
dedicato e icone sulla barra iniziativa per un colpo d'occhio su chi ha quali condizioni attive.
Comandi IA: `{ command: "applyCondition", targetId, condition, rounds }` /
`{ command: "clearCondition", targetId, condition }`.

## Memoria di combattimento per il Master IA

Il Master IA (Groq/Ollama, `js/12`) **non riceveva mai** gli eventi di combattimento: attacchi,
danni, sconfitte, loot, XP, reazioni, spinte, superfici ed elevazione venivano narrati solo nella
chat **visibile** al giocatore, senza mai entrare nella cronologia (`groqChatHistory`) inviata
all'IA — che quindi non "sapeva" cosa fosse successo in battaglia e non poteva riprendere la
narrazione in modo coerente a scontro finito (poteva persino ignorare che ci fosse stato un
combattimento).

`js/29-combat-memory.js` (`UltimateVTTCombatMemory`) osserva per polling tutto ciò che accade
durante un combattimento — via due percorsi complementari, per non perdere nulla indipendentemente
dal pulsante/percorso UI usato:
- **`combatState.lastEvent`**: cattura ogni attacco/danno/cura, sia dal tracker classico a due fasi
  sia dalla HUD stile BG3, entrambi scrivono lì.
- **Wrapping di `appendChatMessage`**: bufferizza la narrazione già prodotta da XP/loot (15), spawn
  (16), reazioni (24), spinte (26), superfici (27) ed elevazione (28) mentre il combattimento è attivo.
- **Rete di sicurezza sulle sconfitte**: confronta lo stato dei combattenti tick per tick, cosicché
  una sconfitta viene rilevata indipendentemente da come sia stata causata (anche da un comando IA o
  dal pannello GM, che non passano per gli altri due canali).

Alla fine del combattimento, costruisce un **riepilogo conciso** (esito, round, sconfitti, HP finale
del party, guadagni di XP/oro) e lo inietta nella **memoria reale** dell'IA tramite due nuove funzioni
esposte da `js/12`:
- `UltimateVTTCoreGameplay.notifyMasterMemory(testo)` — entra nella cronologia inviata a Groq.
- `UltimateVTTCoreGameplay.setUltimoRiepilogoCombattimento(testo)` — resta disponibile anche oltre la
  finestra scorrevole della cronologia (16 messaggi) ed è incluso nel **prompt di sistema** sia di
  Groq sia di **Ollama** (altrimenti del tutto stateless, senza cronologia tra una chiamata e l'altra).

Il riepilogo viene anche postato in chat come messaggio di sistema, così il giocatore vede lo stesso
debrief. Testato sia in isolamento sia in **integrazione con il vero `js/12`** (non solo mock).

**Persistenza oltre la scheda del browser**: `UltimateVTTCoreGameplay` espone anche
`getState()`/`hydrate()`, che il modulo di backup (`js/11`) salva e ripristina insieme al resto
della partita (`coreGameplayState` nello snapshot esportabile). Senza questo, ricaricare la pagina o
importare un backup avrebbe azzerato la cronologia Groq e il riepilogo dell'ultimo combattimento
appena costruiti — vanificando la "ripartenza coerente" anche fra una sessione e l'altra. Gli
snapshot più vecchi (senza `coreGameplayState`) restano importabili senza errori.

## Sessioni lunghe su un solo laptop: griglia tattica, memoria a lungo termine, modello locale

Pensato per l'uso reale del tavolo: **un solo laptop** (Master + tutti i giocatori in hotseat sullo
stesso browser, nessuna rete), sessioni che durano **ore**, sulla **mappa reale di Ventimiglia**.

**`js/31-combat-view-autoswitch.js` (`UltimateVTTCombatViewSwitch`).** Il gioco ha tre superfici
visive indipendenti, commutate SOLO a mano da un pulsante: la mappa reale di Ventimiglia
(Leaflet/OSM, `window.VentimigliaMap`), l'esplorazione fullscreen "Campagna"
(`window.VTTCampagna`) e la griglia tattica di combattimento (`UltimateVTTCanvas`, dietro `#vttCanvas`).
`UltimateVTTCombat.startCombat()` non ne tocca nessuna — quindi se il Master sta guardando la mappa
di Ventimiglia quando parte un combattimento (es. innescato automaticamente da uno spawn nemico,
`js/16`), la griglia coi token e **tutti gli overlay BG3** (elevazione, superfici, condizioni,
fiancheggiamento) restava invisibile dietro un div nascosto. Questo modulo osserva per polling la
transizione "combattimento assente → attivo" e forza il ritorno alla griglia chiamando
`deactivate()` sulle altre due superfici, se presenti. Non fa nulla alla fine del combattimento: il
Master resta libero di tornare all'esplorazione quando vuole.

**`js/32-campaign-memory.js` (`UltimateVTTCampaignMemory`).** Il modulo 29 risolve la memoria di UN
combattimento, ma la cronologia inviata a Groq resta una finestra scorrevole di 16 messaggi: dopo
ore di gioco (molti combattimenti, molti spostamenti) gli eventi più vecchi ne escono e il Master
può "dimenticarli". Questo modulo accumula gli eventi chiave dell'**intera sessione** in un diario
persistente e capato (max 50 voci), catturati per wrapping non invasivo su tre canali:
- **Combattimenti conclusi**: intercetta `setUltimoRiepilogoCombattimento` (chiamata dal modulo 29)
  e ne condensa solo la riga dell'esito, per non duplicare l'intero digest granulare nel diario.
- **Level-up**: filtra i soli messaggi di sistema con prefisso `⭐ LIVELLO` (modulo 15).
- **Spostamenti**: intercetta `VentimigliaMap.goTo`/`VTTCampagna.goToPlace`, così il Master ricorda
  dove si trova/è stato il party anche dopo ore, non solo nell'ultimo scambio.

Il diario viene iniettato nel prompt di sistema di **entrambi** Groq e Ollama (oltre al riepilogo
dell'ultimo combattimento, che resta anche come riferimento rapido separato) e persiste tramite lo
stesso `getState()`/`hydrate()` di `UltimateVTTCoreGameplay` — sopravvive quindi a ricarica pagina e
backup/ripristino esattamente come la cronologia Groq.

**Modello Ollama locale dimensionato per una GPU da laptop.** Il modello locale predefinito era
`mistral-nemo:12b`, che in quantizzazione Q4 richiede più di 6GB di VRAM solo per i pesi — non sta
comodamente su una GPU mobile come una RTX 4050 (6GB), costringendo Ollama a scaricare parte del
modello su CPU (molto più lento) mentre la stessa GPU deve anche renderizzare canvas, dadi 3D e
tutto il resto. Cambiato in `llama3.1:8b` (~5GB in Q4), che lascia margine per il resto del rendering.

**XP attribuita al vero autore del colpo, non a chi è attivo in hotseat (`js/15`).** Il tracker di
combattimento (`js/06`) ha un solo slot per PG con id fisso `"pc-local"`: solo il *nome* viene
risincronizzato a chi è attivo in hotseat, non l'id. `onEnemyDefeated` assegnava sempre l'XP a
`activeId()` — il personaggio *attualmente mostrato* quando il polling (ogni 600ms) si accorge
dell'uccisione. In hotseat, se il Master cambia personaggio attivo (es. per controllare l'inventario
di un altro giocatore) prima che il polling registri l'uccisione appena fatta da un altro PG, l'XP
finiva al personaggio sbagliato. Corretto risalendo a chi ha *davvero* sferrato il colpo tramite
`combatState.lastRoll.title` (impostato da ogni risoluzione di attacco nel formato "Attaccante vs
Bersaglio", path-agnostico come per il modulo 29) e risolvendo quel nome nel roster hotseat
(`window.partyData`) — l'unico posto dove nome e id-di-progressione reale coesistono, dato che l'id
del combattente stesso è sempre quello fantasma `"pc-local"`. Le ricompense dirette del Master
(`completeQuest`, tag `[XP:n]` in chat) continuano ad andare a chi è attivo ora, comportamento
corretto per una ricompensa indirizzata a chi si sta parlando in quel momento.

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
