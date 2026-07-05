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
│   ├── 32-campaign-memory.js           ← diario di campagna a lungo termine per il Master IA
│   ├── 33-enemy-ai.js                  ← IA dei nemici: al loro turno si avvicinano e attaccano
│   ├── 34-chat-combat-bridge.js        ← ponte chat Master → combat system (spawn dalla narrazione)
│   ├── 35-layout-cinematografico.js    ← layout definitivo a 3 colonne: cassetto strumenti, topbar misurata
│   ├── 36-global-game-state.js         ← Global Game State: store osservabile unico (get/set/subscribe/publish)
│   ├── 37-encounter-balancer.js        ← Encounter Balancer: scontri scalati su party/livelli/HP (anti-swarm, anti-TPK)
│   ├── 38-action-menu.js               ← menu Azione Bonus dinamico (classe/razza/inventario)
│   ├── 39-chat-map-sync.js             ← ponte chat Master → mappa Ventimiglia (POI dalla narrazione)
│   ├── 40-arena-tattica.js             ← arena strategica: ostacoli, altura, luogo, movimento col click
│   ├── 41-armeria-rarita.js            ← armeria: rarità (comune→leggendaria), armature, amuleti, drop scalati
│   └── 42-net-outbox.js                ← net outbox "Supabase-ready": delta di stato coalizzati (debounce+throttle)
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

## Layout definitivo a tre colonne (revisione strutturale)

L'interfaccia è organizzata in **tre colonne pulite**, senza pannelli sovrapposti alla scena
(`css/07-layout-cinematografico.css` + `js/35-layout-cinematografico.js`):

- **Sinistra — i PG:** scheda del personaggio attivo, party hotseat, statistiche, tab
  (Core/Abilità/Inventario/Spellbook/Combat/Note).
- **Centro — la scena:** mappa tattica protagonista (terreno, griglia, token di PG e nemici)
  con gli elementi di combattimento BG3 sopra di essa (barra iniziativa in alto, tray azioni in
  basso, HUD dadi al centro) SOLO a combattimento attivo. Vignettatura leggera, niente etichette
  tecniche.
- **Destra — Chat Master:** la chat del Master IA riempie la colonna (log che scorre, input in
  basso); il pulsante CHAT in topbar porta lì. La diagnostica e i riepiloghi tecnici dei moduli
  stanno in un cassetto richiudibile in fondo, chiuso di default.

Interventi strutturali della revisione (con i bug che risolvono):

- **La topbar non spinge più la chat fuori dallo schermo.** La topbar (flex `nowrap`, piena di
  pulsanti) imponeva la sua larghezza minima all'intera griglia `#app`: su schermi normali la
  colonna destra finiva LETTERALMENTE fuori dalla finestra (il "layout rotto"/"la chat non
  c'è"). Ora `#app` è bloccato alla larghezza della finestra, la topbar va a capo se serve, e i
  comandi di servizio (CHECK, Modalità Console, Full) stanno nel dropdown **🖥 Sistema**. La
  barra iniziativa BG3 si aggancia all'altezza REALE della topbar (variabile
  `--topbar-real-height` misurata dal modulo 35 con ResizeObserver).
- **Rimosso il secondo renderer di mappa** che viveva in js/12 (stanza con muri fissi, token
  del party a pixel, nebbia line-of-sight al 95% di nero) e che sovrascriveva OGNI frame il
  renderer ufficiale sullo stesso canvas: in gioco la mappa appariva nera, senza terreno e senza
  nemici. Il rendering della scena è SOLO del modulo 07 (terreno/griglia/nebbia) + 08 (token).
- **Strumenti del Master in un cassetto.** Il pannellone tecnico fisso sopra la mappa (controlli
  mappa/nebbia, token, dadi fisici, audio, AI bridge, salvataggi) è diventato un cassetto
  laterale chiuso di default: si apre con **🛠 STRUMENTI** in topbar, si chiude con la ✕.
  Nessun controllo rimosso: stessi id, stessa logica.
- **Nebbia non invasiva e mappa luminosa:** la mappa parte tutta visibile (la nebbia è uno
  strumento che il Master attiva quando serve), le celle nascoste non sono più nero pieno, e le
  etichette di coordinate stampate sul terreno sono sparite.
- **Una sola striscia d'iniziativa:** con la barra BG3 presente, la vecchia `#initiativeStrip`
  resta spenta (prima comparivano entrambe, sovrapposte).
- **Niente nemici fantasma all'avvio:** i tre PNG di esempio della mappa (Goblin/Bandito/
  Scheletro) partono nascosti; i nemici compaiono solo quando il Master li evoca.
- **Un solo flusso d'attacco lato giocatore:** tutti i pulsanti del player (HUD BG3 "Attacca",
  scheda "Attacca"/"Critico") usano il flusso a due fasi ANIMATO (`resolveAttackAnimato`);
  la risoluzione immediata `resolveAttack` resta solo per usi tecnici (comando IA `attack`,
  test); `resolveAttackBetween`/`resolveAttackAnimatoTra` restano all'IA dei nemici.

### Morte, risveglio e riavvio del combattimento (fix)

- **`nextTurn()` non riavvia più il combattimento**: a scontro spento avanzare il turno non fa
  nulla (prima richiamava `startCombat()` e riavviava lo scontro in uno stato rotto dopo un TPK).
- **`startCombat()` rifiuta di partire se tutto il party è incosciente**: lo scontro riparte
  solo quando almeno un PG è stato rianimato davvero.
- **Dopo il TPK il party si risveglia** (HP pieni, messaggio narrativo in chat): niente più stato
  "zombie" in cui il Master narra la rianimazione ma il PG resta meccanicamente a 0 HP. Il
  riepilogo per il Master IA (modulo 29) fotografa comunque l'ultimo stato attivo, quindi l'esito
  "sconfitta del party" resta corretto nella sua memoria.

## Sistemi RPG avanzati (bilanciamento, azioni dinamiche, chat→mappa)

Tre sistemi core costruiti su un unico stato condiviso, così chat, combattimento, inventario e
mappe reagiscono agli stessi eventi senza copie divergenti.

**Global Game State — `js/36-global-game-state.js` (`UltimateVTTGameState`).** Lo store osservabile
unico (l'equivalente vanilla di Provider/Riverpod/BLoC): `get(chiave)`, `set(chiave, valore)` (che
notifica solo se il valore cambia), `subscribe(evento, cb)` e `publish(evento, payload)`. Chiavi a
namespace (`party.location`, `encounter.last`, …). È la "singola fonte di verità" a cui gli altri
sistemi si iscrivono, invece di tenere variabili indipendenti e in conflitto.

**Encounter Balancer — `js/37-encounter-balancer.js` (`UltimateVTTEncounterBalancer`).** Basta col
PG solitario circondato da 10 goblin. Prima di far comparire i nemici, calcola un **budget di
minaccia** dal party reale — numero di membri, livello (dalla progressione, modulo 15) e **HP
correnti** — e ridimensiona lo scontro:
- la **quantità** dei nemici viene ridotta (mai oltre ~3 per PG vivo; almeno 1) finché la minaccia
  totale rientra nel budget;
- le **statistiche** vengono scalate (`statScale`): nemici indeboliti quando il party è debole o
  ferito (anti-TPK), rinforzati quando il party è forte e i nemici sarebbero banali;
- un membro a 0 HP non conta nel budget, e dopo uno scontro duro (HP bassi) gli avversari
  successivi sono più leggeri.

Tutta la matematica è in funzioni pure (`potenzaPg`, `potenzaPartito`, `budgetSfida`, `bilancia`);
i pesi di minaccia derivano dal Challenge Rating 5e del bestiario (data-driven, niente numeri
sparsi). Lo spawn (modulo 16) consulta il balancer e passa gli override scalati ad `addNpc`
(esteso, retrocompatibile). Il risultato è pubblicato sul Global Game State (`encounter.last`).

**Menu Azione Bonus dinamico — `js/38-action-menu.js` (`UltimateVTTActionMenu`).** Il PG ha 1
Azione e 1 Azione Bonus per turno, ma le **opzioni** di Azione Bonus sono istanziate dinamicamente
valutando **classe, razza e inventario**: il Guerriero ha "Recupero Energie", il Ladro "Azione
Scaltra", una pozione nello zaino diventa "Bevi Pozione" (consumata dopo l'uso), un'arma secondaria
equipaggiata abilita un attacco bonus. Le capacità stanno in cataloghi dati (`CAPACITA_CLASSE`,
`CAPACITA_RAZZA`) — aggiungere un archetipo è aggiungere una voce, non codice (VINCOLO NEGATIVO 2).
Un pulsante **⚡ Bonus** nella barra azioni BG3 apre la griglia delle opzioni correnti; scegliendone
una si spende la risorsa e si applica l'effetto reale (cura, consumo oggetto, attacco).

**Ponte chat Master → mappa Ventimiglia — `js/39-chat-map-sync.js` (`UltimateVTTMapSync`).** Un
listener avvolge la chat (come i moduli 29/34); quando il **Master narra un arrivo** nominando un
POI codificato ("Arrivate alla Passeggiata", "Giungete al Forte dell'Annunziata"), un parser
riconosce il luogo (alias semantici → nome canonico → parole chiave, con gating sui verbi d'arrivo
così una menzione di sfuggita non teletrasporta) e **sposta l'icona del party** sulla mappa
overworld (Campagna + mappa reale Ventimiglia). La posizione vive solo nel Global Game State
(`party.location`): se il party è già lì (magari mosso dal percorso JSON `moveTo` del Master IA),
il movimento non viene rifatto (idempotenza). GM-autorevole e in pausa durante il combattimento.

## Il Master narra ma il combattimento non parte (fix strutturale)

Bug reale osservato in partita: il Master (Groq) narrava un intero scontro in prosa ("Il
combattimento inizia!... scheletri...") ma il combat system restava spento ("Combat: off"),
nessun nemico sulla mappa. Causa: in `js/12` le VERE risposte del Master (Groq/Ollama/modello
locale) chiamavano la funzione privata di rendering della chat **direttamente**, invece di
passare da `window.UltimateVTTCoreGameplay.appendChatMessage` — l'API pubblica che i moduli 29
(memoria combattimento), 32 (diario di campagna), 34 (ponte chat→combattimento) e 39 (ponte
chat→mappa Ventimiglia) avvolgono per osservare la narrazione. Quei ponti quindi non vedevano
**mai** le vere risposte del Master, solo le chiamate esterne di altri moduli (annunci di
sistema) — la suite di test di ciascun modulo passava comunque, perché chiamava l'API pubblica
direttamente, senza esercitare il percorso interno reale.

**Fix**: ogni emissione di chat generata internamente da `js/12` (system/player/master) passa
ora da un unico punto, `publicaChatMessage(...)`, che instrada sempre attraverso l'API pubblica.
Verificato con un test che carica il **vero** `js/12` e il **vero** modulo 34, stuba solo
`fetch` per simulare Groq, e conferma che una narrazione in prosa senza il campo JSON "spawn"
attiva davvero lo spawn e il combattimento (non solo in isolamento).

## Combattimento strategico e bottino (stile BG3)

**Vittoria automatica (fix, `js/06`).** Quando l'ULTIMO nemico cade, lo scontro finisce da solo con
l'annuncio "🏆 VITTORIA!" e la chat del Master si riattiva — prima restava tutto appeso finché non
si premeva "End" a mano. Il controllo scatta solo sul danno a un PNG (l'evento dell'uccisione).

**Arena tattica — `js/40-arena-tattica.js` (`UltimateVTTArena`).** A inizio combattimento la
griglia diventa un campo di battaglia strategico:
- **ostacoli/coperture** generati attorno alla zona dello scontro (celle "wall", mai a ridosso dei
  token), da usare per la manovra;
- una **zona sopraelevata** (highground, modulo 28): chi ci sale ha **vantaggio** sui bersagli in
  basso — meccanica già attiva nel motore;
- l'**insegna del luogo** (dall'ultimo POI narrato dal Master, modulo 39) sotto la barra iniziativa,
  con palette del terreno a tema (Teatro Romano→pietra, Giardini Hanbury→verde, Porto→scuro…);
- i nemici compaiono a **distanza tattica reale** (4-7 celle, `js/16`), non più addosso al party;
- il pulsante **👣 Sposta** nella barra azioni: clicchi, poi scegli la cella di destinazione sulla
  griglia — il PG si muove entro il **budget di movimento del turno** (FSM, modulo 19), rispettando
  gli ostacoli, con costi in metri (Chebyshev × 1,5 m). Come il click-to-move di BG3.

**Armeria — `js/41-armeria-rarita.js` (`UltimateVTTArmeria`).** Equipaggiamento in stile BG3:
- **rarità** comune / **rara** (blu, +1) / **epica** (viola, +2) / **leggendaria** (arancio, +3),
  con colore e bonus in tabella;
- **armi con abilità** (il bonus vale sia a colpire sia nei danni: il motore combat legge il "+N"
  dell'arma equipaggiata), **armature** (CA base) e **amuleti** (slot collo, +CA), più consumabili
  potenti (Pozione Maggiore, Elisir);
- **drop scalati sulla forza del nemico** (`js/15`): più il nemico è forte (XP/CR), più è probabile
  che lasci oggetti rari — i boss possono lasciarne due; nel popup del bottino i nomi brillano del
  colore della rarità;
- ogni classe parte con **arma primaria E secondaria** equipaggiate (Guerriero spada+scudo, Barbaro
  spada+pugnale, Ladro spada corta+pugnale, Ranger arco+spada corta, Mago bastone+focus, Chierico
  bastone+scudo);
- gli oggetti raccolti finiscono nello **zaino del PG** (inventario per-personaggio, modulo 17), si
  **equipaggiano** dagli slot della scheda e si **usano** sia fuori dal combattimento (inventario)
  sia in combattimento come **Azione Bonus** (menu ⚡, modulo 38). Tutto passa dal catalogo del
  modulo 05 (`registerCatalogItems`): aggiungere un oggetto leggendario è aggiungere una riga.

## Master IA

Il Master può essere: **Groq** (chiave API gratuita su console.groq.com), **Ollama**
locale, o il modello **classico** offline. La voce usa Web Speech (TTS + microfono, it-IT).

### Ollama su un PC remoto in LAN ("Split-Rig"), risposta in streaming, contesto del party

Il client (questo file, aperto sul laptop di gioco) resta leggero — deve tenere i suoi FPS su
canvas/nebbia/dadi 3D. Il Master IA via **Ollama** può girare su un **PC separato sulla stessa
rete locale** con una GPU molto più potente (es. una desktop con 16GB di VRAM): il client fa
solo `fetch` verso quell'IP, tutto il calcolo pesante resta sull'altra macchina.

- **Indirizzo configurabile** (`js/12`, `readOllamaHost`/`writeOllamaHost`, persistito in
  localStorage): pulsante **🖧 IP** nel menu ⚙ Master, di fianco al toggle OLLAMA. Di default
  punta a `127.0.0.1:11434` (Ollama in locale, comportamento invariato per chi non ha un secondo
  PC); basta cambiarlo in `192.168.x.x:11434` per puntare al PC con la GPU — effetto immediato,
  nessun reload.
- **Streaming reale, parola per parola**: la richiesta a Ollama ora usa `stream:true`; la
  risposta si legge in modo incrementale (`ReadableStream` + `TextDecoder`, righe NDJSON) e il
  testo compare nella bolla di chat man mano che arriva, invece di restare fermi su "…" fino
  alla fine. Per farlo senza mai mostrare sintassi JSON grezza a mezzo, il prompt di sistema
  chiede al modello un **formato a due parti**: prima la narrazione pura, poi — solo se serve
  segnalare un tiro/spostamento/comparsa di nemici — un separatore esplicito (`<<DATI>>`) seguito
  dal JSON strutturato. Tutto ciò che precede il separatore è garantito prosa sicura da mostrare
  live; ciò che segue si accumula in silenzio e si interpreta solo a risposta conclusa
  (`separaNarrazioneEDati`/`testoVisibileDuranteStreaming`, funzioni pure e testate). Se il
  modello risponde ancora nel vecchio formato a blob JSON unico, il parsing ricade su quello
  (compatibilità). Se il browser non supporta la lettura incrementale, si ricade su una lettura
  in un colpo solo — stessa logica di parsing, senza gli aggiornamenti progressivi.
- **Contesto del party in tempo reale**: il prompt di sistema di Ollama ora include
  `buildPartySheetContext()` (HP, CA, caratteristiche, equipaggiamento reali di tutti i PG) —
  prima lo aveva solo Groq, e il Master via Ollama narrava "alla cieca". È testo di sistema,
  mai mostrato in chat.

## Combattimento stile Baldur's Gate 3

`js/23-bg3-combat-hud.js` + `css/06-bg3-combat-hud.css` aggiungono una HUD di combattimento in
stile **BG3** che mette in scena la meccanica 5e già presente (modulo 06 combat, modulo 19 FSM,
modulo 05 action economy), **senza modificarli**. Compare solo a combattimento attivo:

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

**IA dei nemici — `js/33-enemy-ai.js` (`UltimateVTTEnemyAI`).** Prima, al turno di un PNG **non
succedeva nulla**: il nemico restava immobile e il giocatore doveva premere "Termina turno" al suo
posto. Ora i nemici agiscono da soli: al proprio turno scelgono il PG vivo più vicino, si avvicinano
sulla griglia (fino a ~6 celle, metrica Chebyshev, fermandosi su una cella adiacente) e, se a portata
di mischia, lo attaccano davvero — tiro per colpire + danni reali — poi concludono il turno.
GM-autorevole (solo il Master, o il gioco in solitaria/hotseat dove `Sync` è assente, pilota i PNG,
così in multiplayer non è ogni client a tirare dadi propri). Un'azione per tick con una pausa
leggibile tra un nemico e l'altro; se il PG è a terra non manda i turni a vuoto (decide il Master).
Coperto da unit test e da un check E2E in browser reale.

**L'attacco dei nemici mostra i dadi (`js/06` + `js/33`).** Prima l'attacco di un PNG si risolveva
in silenzio (`resolveAttackBetween`): il giocatore vedeva solo l'esito nel log, senza capire quanto
danno stesse subendo né come fosse stato calcolato. Ora l'IA usa la stessa HUD animata a due fasi del
giocatore (`resolveAttackAnimatoTra`, in `js/06`): tiro per colpire con dado che gira, poi — se
colpisce — tiro per i danni, entrambi con lo stesso pannello `#attackPhaseHud` usato per gli attacchi
del PG. Il turno del PNG **non avanza finché l'animazione non è davvero conclusa**: l'avanzamento
(`nextTurn`) è agganciato a un callback esplicito (`onComplete`), non a un timer indovinato scollegato
dallo stato reale dell'HUD — così non può succedere che l'IA riparta su un turno "ancora in volo" se
un tick arriva mentre i dadi stanno ancora animando. Verificato sia nei test isolati (mock di
`resolveAttackAnimatoTra` che trattiene `onComplete` per simulare l'animazione in corso) sia in
browser reale (E2E: l'HUD compare durante il turno del PNG, il turno avanza solo a fine animazione, e
l'HUD si richiude da sola).

Tre correzioni collegate al combattimento, tutte richieste dall'uso reale:
- **Nessun nemico predefinito (`js/06`):** il tracker partiva con 3 PNG fissi (Goblin/Bandito/
  Scheletro) *sempre* presenti — comparivano nell'iniziativa e nella HUD anche quando il Master, in
  chat, stava facendo tutt'altro (andare al municipio, aprire una porta) senza aver evocato nemici,
  dando l'impressione di un combattimento partito dal nulla. Ora il tracker parte **solo con il PG**:
  i nemici esistono unicamente quando il Master li fa comparire (`VTTSpawn.spawn` → `addNpc`), che è
  anche ciò che avvia il combattimento.
- **L'attacco mostra i dadi (`js/06`+`js/23`):** il pulsante "Attacca" della HUD BG3 usava la
  risoluzione *immediata* (`resolveAttack`, che calcola tutto in silenzio) — da qui il "clicco Attacca
  e mi dice nemico sconfitto senza farmi lanciare i dadi". Ora usa il flusso a **due fasi con
  animazione** (tiro per colpire → tiro per i danni), esposto come `resolveAttackAnimato`.
- **Token dei nemici collegati ai combattenti (`js/16`):** i token generati (`token-extra-N`) non
  erano mappati ai combattenti (`npc-N`) — l'euristica della FSM copre solo `token-npc-N`. Senza
  questo collegamento l'IA dei nemici (e le azioni BG3 mirate: spinta, superfici, elevazione) non
  trovavano la posizione del nemico sulla griglia. Ora lo spawn registra la mappatura esplicita.

**Ponte chat Master → combat system — `js/34-chat-combat-bridge.js`
(`UltimateVTTChatCombatBridge`).** Caso reale osservato in partita: il Master IA narrava un intero
combattimento in prosa ("Il combattimento è iniziato! Goblin 1: 5/5 HP * Goblin 2..." con attacchi
risolti a parole e HP inventati) **senza** emettere il campo JSON `spawn` — così il vero combat
system restava spento ("Combat: off") mentre la chat raccontava una battaglia che il gioco non
stava giocando. Il problema è attaccato da due lati:
- **Lato IA (`js/12`):** il prompt di sistema di Groq e Ollama ora impone di emettere **sempre**
  `spawn` quando compaiono nemici e di **non risolvere mai** gli attacchi né tenere il conto degli
  HP in prosa — tiri, danni, iniziativa e turni sono del motore di gioco (che a fine scontro gli
  riporta l'esito, via modulo 29).
- **Lato motore (`js/34`):** rete di sicurezza — osserva ogni risposta del Master (wrapping di
  `appendChatMessage`, stesso pattern dei moduli 29/32) e, se a combattimento spento il testo
  annuncia uno scontro con creature note del bestiario ("tre goblin vi attaccano!", elenchi
  "Goblin 1… Goblin 4", numeri in cifra o parola), fa comparire **davvero** quei nemici via
  `VTTSpawn.spawn` — che avvia combattimento, HUD BG3, iniziativa e IA dei nemici. L'elaborazione è
  ritardata di ~350ms: se il campo JSON `spawn` c'era, al momento del controllo il combattimento è
  già attivo e il ponte non duplica nulla. GM-autorevole (`isMasterOrSolo`), nessun falso positivo
  su menzioni pacifiche (serve una parola di scontro oltre al nome della creatura); una singola
  menzione "goblin 8" è il **nome** di un nemico, non un conteggio (serve un vero elenco con almeno
  due indici distinti).

**Regole di stato del combattimento (action economy, distanze, multi-party, KO/TPK).** Cinque
regole rigorose implementate nel motore (`js/06`) e riflesse nella HUD (`js/23`):
- **Azioni limitate (Regola 1):** l'attacco di un PG spende la sua **Azione** (una per turno) — il
  tentativo, non solo il colpo andato a segno; la Spinta spende l'**Azione Bonus** (`js/26`); gli
  incantesimi spendevano già Azione/Bonus + slot (`js/05`). A risorsa esaurita il pulsante Attacca
  si **disabilita** finché non si termina il turno (che ripristina il pool). Niente più attacchi
  infiniti.
- **Distanze sulla griglia (Regola 4):** prima di ogni attacco il motore calcola la distanza
  Chebyshev fra i token di attaccante e bersaglio (`distanzaCelle`): mischia = 1 cella, arco = 12
  celle (`portataArma`). Fuori portata l'attacco si **interrompe senza consumare l'Azione**. Se le
  posizioni non sono note (teatro della mente) non si blocca nulla.
- **Tutto il party in campo (Regola 2):** `startCombat` itera l'intero roster hotseat
  (`window.partyData`): il membro attivo resta `pc-local`, gli altri entrano come combattenti
  `pc-party-<id>` con statistiche derivate dalle loro schede, tirano l'iniziativa e ciclano nei
  turni. I danni ai membri non attivi **persistono nel roster** (restano sul personaggio giusto
  anche cambiando scheda in hotseat).
- **IA nemica a script chiuso (Regola 3, `js/33`):** distanza dal PG più vicino → movimento →
  d20 vs CA → danni → **fine turno automatica**, un'azione per turno garantita da una chiave di
  deduplicazione (round:indice:id) — nessun loop infinito possibile, sampler con cleanup esplicito.
- **Incoscienza, rialzo e TPK (Regola 5):** un PG a 0 HP cade **incosciente** (non "sconfitto");
  un alleato adiacente può spendere l'Azione Bonus (o l'Azione) col pulsante **Rialza** della HUD
  per rimetterlo in piedi a 1 HP (`reviveCombatant`). Se **tutti** i PG sono a terra scatta
  `resetCombat()`: lo scontro si chiude subito e il Master ne riceve il riepilogo (esito
  "sconfitta del party").

**In combattimento comanda SOLO l'interfaccia di combattimento.** Tre regole che tengono chat e
motore ognuno al proprio posto durante uno scontro:
- **La chat del Master è in pausa (`js/12`):** a combattimento attivo `handlePlayerPrompt` blocca
  l'invio con un messaggio-guida ("gestisci lo scontro dall'interfaccia: bersaglio, Attacca,
  Termina turno") e si riattiva da sola a scontro finito — quando il Master riceve il riepilogo
  (modulo 29) e riprende la narrazione da lì. Senza questa pausa il Master risolveva gli attacchi
  in prosa in parallelo al motore (HP inventati, dadi chiesti in chat) e ogni sua risposta
  rischiava di rievocare nemici.
- **Lo spawn è ignorato a combattimento già attivo (`js/16`):** il Master IA, istruito a emettere
  `spawn` quando compaiono nemici, tendeva a ripeterlo in ogni risposta sullo scontro in corso —
  ogni messaggio aggiungeva un'altra ondata di goblin duplicati. I nemici si evocano solo
  all'inizio dello scontro.
- **Annuncio raggruppato:** "⚔️ Nemici comparsi: 3× Goblin, 1× Orco!" invece del nome ripetuto per
  ogni copia.

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

**Inventario per-PG: niente più zaini scambiati in hotseat (`js/17`).** Al cambio di personaggio
attivo, `restoreFor(id)` ripristina l'inventario salvato del PG entrante o, se ha un "build" da
creazione personaggio, applica il kit di classe — ma per un PG aggiunto al volo in hotseat
("+ Aggiungi giocatore", `js/12`), che non passa da nessuno dei due percorsi, la funzione non faceva
letteralmente nulla: lo zaino del PG **uscente** restava visibile e modificabile sotto l'identità del
PG **entrante**. Corretto catturando all'avvio un kit di partenza di riferimento (lo stato iniziale
di `UltimateVTTInventory`, prima di qualunque hydrate) e usandolo come fallback per chi non ha né
inventario salvato né build — invece di ereditare in silenzio lo zaino di qualcun altro, un PG mai
visto prima riparte da un kit pulito. Prima suite di test per questo modulo (nessuna esisteva).

**Creazione personaggio: niente più un PG fantasma nel party (`js/14`).** Cliccando "INIZIA
L'AVVENTURA", il codice costruiva **sempre** un personaggio da qualunque razza/classe/nome fosse
rimasta nel form in quel momento e lo aggiungeva alla lista — *anche* se l'utente aveva già creato
il party voluto esplicitamente con "AGGIUNGI AL PARTY". Risultato: creare 2 personaggi e cliccare
"inizia" ne aggiungeva un terzo mai richiesto, con la razza/classe/nome lasciati nel form (spesso i
valori di default o un nome suggerito a caso). Corretto: il form conta come personaggio "al volo"
solo se il party è ancora vuoto (nessun "AGGIUNGI AL PARTY" cliccato) — il classico avvio rapido con
un solo eroe resta invariato, ma un party già composto esplicitamente parte con **esattamente** i
personaggi scelti. Prima suite di test per questo modulo (nessuna esisteva).

**Modalità Campagna: tutti i pulsanti erano senza alcuna azione collegata (`js/12`).** La schermata
di esplorazione fullscreen (`#campOverlay`: Sprint, Esamina, Combatti, invio messaggio, "← VTT")
è definita nell'HTML **dopo** lo script che dovrebbe collegare quei pulsanti ai loro comportamenti.
`wireActionButtons()` veniva chiamata una sola volta, in modo sincrono, subito dopo aver trovato il
pulsante che *apre* la modalità (che invece esiste prima nello script e quindi già disponibile) —
in quel momento gli altri pulsanti non esistevano ancora nel DOM, e a differenza del pulsante di
apertura (che ha un suo meccanismo di retry) questi venivano cercati una volta sola: risultato,
**tutti** restavano permanentemente senza alcuna azione collegata, ogni volta, al 100%. Diagnosticato
con un browser reale (non un mock: l'ordine di parsing dell'HTML è essenziale per riprodurre il bug)
e corretto con lo stesso meccanismo di retry già usato per il pulsante di apertura. Nuovo check nel
pannello E2E (`panel-e2e.js`) che apre la modalità Campagna e verifica che "← VTT" chiuda davvero la
schermata — verificato che fallisce (timeout) contro il codice pre-fix.

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

## Canvas con cache offscreen e transizione Leaflet (Task 3 — performance)

**Rendering a cache (`js/07`).** Prima ogni frame ridisegnava TUTTA la griglia cella per cella
(~1600 operazioni canvas anche solo trascinando un token). Ora i layer statici vivono in due
canvas offscreen — **terreno+griglia** e **nebbia** — ridisegnati SOLO quando cambiano davvero
(rigenerazione, ostacoli dell'arena via `setTerrainAt`, pennello della nebbia, palette, toggle
griglia, resize). Il frame "caldo" si riduce a **2 blit `drawImage`** (accelerati dalla GPU) + i
token dinamici + l'hover. Le invalidazioni sono mirate: un ostacolo ridisegna solo il terreno, il
pennello solo la nebbia; rivelare celle già visibili non invalida nulla (no-op riconosciuto).
`getRenderStats()` espone frame totali vs ridisegni pieni: in un client sano `frames` corre e
`terrainRedraws`/`fogRedraws` restano quasi fermi — è anche ciò che i test verificano (context 2d
"registrante" che conta le operazioni, + check E2E in browser reale).

**Transizione canvas ↔ mappa reale (Task 3b, `js/12` + `css/07`).** La commutazione passa da una
classe (`.stage.ventimiglia-attiva`) invece che da stili inline: la vignetta cinematografica si
spegne (scuriva anche Leaflet), la stage-overlay lascia passare i click alla mappa (pan/zoom) **ma
il cassetto 🛠 Strumenti resta cliccabile** — prima veniva spento in blocco con
`pointerEvents="none"` ed era visibile ma morto al click sopra la mappa reale. La mappa entra con
un fade su `opacity` (proprietà composita GPU, nessun reflow); al ritorno al canvas tattico un
repaint esplicito rimette in scena la griglia (che con le cache è un semplice blit).

## Audio/voce non bloccante (Task 4 — coda voce, ducking, riverbero leggero)

**Il limite di piattaforma, detto chiaramente.** La Web Speech API (`speechSynthesis`) sintetizza
la voce con un motore del sistema operativo/browser: il suo audio **non può** essere instradato nel
grafo della Web Audio API (niente `MediaStreamAudioSourceNode` da un'utterance) in modo standard e
cross-browser. Applicare "un leggero riverbero" *alla voce stessa* non è quindi realizzabile senza
librerie TTS esterne — estranee allo stack vanilla richiesto. La soluzione onesta adottata: il
riverbero va sul **paesaggio sonoro procedurale** che circonda la voce, e l'ambience si abbassa
("ducking") mentre il Master parla — l'effetto è realmente udibile, non uno sfondo statico.

**Coda della voce (`js/10`), non più `cancel()` distruttivo.** Prima, ogni nuova battuta troncava
di netto quella in corso: con lo streaming frase-per-frase del Task 1, due `speak` ravvicinati si
scavalcavano a vicenda. Ora `speakMaster()` **accoda** (tetto di 6 battute: oltre, si scartano le
più vecchie non ancora lette, così la voce resta "al presente"); `processaCodaVoce()` legge una
battuta alla volta e incatena la successiva su `onend`/`onerror`, senza mai bloccare il thread
principale (la Web Speech API è già asincrona di natura). `getVoiceQueueLength()`/`isSpeaking()`
espongono lo stato per test e diagnostica; `stopVoice()` (richiamato anche dal mute in `js/13`)
svuota la coda, cancella la lettura in corso e ripristina l'ambience.

**Ducking dell'ambience.** All'avvio di una battuta (`onstart`), il gain dell'ambience scende al
28% con una rampa morbida (`setTargetAtTime`, stessa tecnica dei fade esistenti); a fine battuta
risale al livello di riposo. La voce resta comprensibile sopra il drone invece di doverci competere.

**Bus di riverbero leggero (`assicuraRiverbero()`), creato una volta sola.** Un `ConvolverNode`
vero richiede generare e tenere in memoria un buffer d'impulso — più pesante, e la GPU/CPU forte in
architettura Split-Rig sta sul PC remoto con Ollama, non sul laptop. Si usa invece un comb-filter
smorzato: un `DelayNode` (45ms) in retroazione attraverso un `BiquadFilterNode` passa-basso (le
frequenze alte si perdono a ogni giro, come un'eco che rimbalza tra pareti di pietra) più un mix
*wet* al 20%. Il bus si crea alla prima richiesta e si riusa per sempre (mai un secondo `DelayNode`).
Va solo sui suoni **atmosferici** (`playImpact`, `playSpellPulse`, `playDoom`): i suoni
**percussivi** ravvicinati (dadi, click UI) restano volutamente a secco, altrimenti il riverbero li
impasterebbe invece di renderli più immersivi.

**STT (`js/13`):** `recognition.start()` può lanciare un'eccezione **sincrona** (es.
`InvalidStateError` da un doppio click prima che il browser finisca di fermare l'istanza
precedente) — ora è protetta da try/catch, così un doppio click non rompe più l'intero handler.

## UI/UX anti-clutter (Task 5 — transizioni GPU, hit-box touch, tastiera virtuale)

**Barre di riempimento su `transform: scaleX` (niente reflow).** Un'analisi dei CSS ha mostrato
che cassetti/modali/popup già commutano via `display` o animano `transform`+`opacity` (nessun
reflow); le uniche transizioni "colpevoli" erano le barre di riempimento (HP iniziativa BG3,
movimento, HP hub/campagna, XP), che animavano `width` — un ricalcolo del layout **a ogni frame
della transizione**, proprio nei momenti caldi del combattimento (HP che cambiano, barra movimento
aggiornata a ogni cella durante un trascinamento). Ora sono larghe il 100% e si scalano con
`transform: scaleX(frazione)` + `transform-origin: left` — proprietà composita: anima sulla GPU
senza toccare il layout, in linea con la filosofia del client leggero (Split-Rig).

**Hit-box minime 44×44px (standard touch).** I pulsanti dell'interfaccia di combattimento erano
sotto la soglia: `.bg3-btn` (Attacca/Spingi/Sposta/Bonus/Termina turno) ~30px, righe di
combattimento e modalità di tiro 30–32px, X dei modali 34px. Ora tutti hanno `min-height`/
`min-width` ≥44px; i chip Normale/Vantaggio/Svantaggio restano piccoli a schermo ma un `::after`
invisibile ne estende l'area di tocco a ~44px (l'alone fa parte del box del bottone: i tocchi
"vicini" contano). Le liste ally-mode (54px su schermi piccoli) ora includono anche `.bg3-btn`,
`.combat-row-button` e `.roll-mode-button`, che prima ne erano esclusi.

**Tastiera virtuale che non rompe la flexbox.** Quando la tastiera si apre su un layout alto
`100vh`, l'app resta a tutto schermo *dietro* la tastiera e l'input col focus finisce nascosto —
`window.innerHeight` spesso **non cambia**, è proprio questo il problema. Il segnale affidabile è
`visualViewport`: `js/12` ne ascolta il `resize`, scrive l'altezza visibile nella variabile CSS
`--vvh` e accende `body.keyboard-aperta` (soglia 140px: la barra URL che si ritrae non è una
tastiera). Il CSS accorcia `#app` e gli overlay a schermo intero (`#campOverlay`, `#mobileHub`) a
`var(--vvh)`: la flexbox si ricalcola da sola e il campo col focus resta in vista. La logica è
esposta come `UltimateVTTViewport` (pura: dipende solo dalle due altezze) per test e diagnostica;
il test E2E misura l'altezza reale calcolata di `#app` con altezze finte.

## Net outbox "Supabase-ready" (Task 2 — stato pronto per il multiplayer documentale)

`js/42-net-outbox.js` (`UltimateVTTNetOutbox`) prepara lo stato al sync con un backend
(Supabase/WebSocket) **senza floodare la rete**. Osserva le fonti esistenti — la scheda PG
(`UltimateVTTState.subscribe`), il Global Game State (modulo 36) e le posizioni dei token — e
**coalizza** le raffiche di cambi: *debounce* di 250ms (uno slider HP trascinato produce UN
payload con i valori finali, non 20 intermedi) con **tetto massimo di attesa** di 1s (un
trascinamento continuo emette comunque ~1 payload/s, mai zero fino al rilascio). Ogni emissione è
un **delta JSON pulito e versionato** (`{v:1, tipo:"vtt/delta-stato", ts, sezioni, delta}`) con le
sole sezioni cambiate (pg / tokens / combat / location); se lo stato torna identico alla base,
**zero traffico**. I payload finiscono in un outbox limitato (50) con `drain()` per il recupero
offline; `setTransport(fn)` registra il futuro canale Supabase (un transport che lancia non blocca
mai il gioco); ogni delta è pubblicato anche sul bus condiviso (`net:delta`). Coalescer e diff
sono funzioni pure con timer/clock iniettabili, testate con timer finti (nessuna attesa reale).
Non duplica il layer live: il modulo 20 continua a streammare i token a ~10Hz per la sessione in
corso; l'outbox è il canale di persistenza/sync documentale.

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
