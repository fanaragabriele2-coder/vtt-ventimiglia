# Ultimate VTT — Migrazione Godot 4 (Split-Rig)

Porting del monolite Vanilla JS/HTML del "Tavolo Oscuro di Ventimiglia" verso un'architettura
professionale Godot 4. Questa cartella (`godot/`) **è** la radice del progetto Godot: aprila con
Godot 4.3+ (`Import` → seleziona `godot/project.godot`).

## Architettura Split-Rig

- **Client (questo progetto):** laptop RTX 4050. Deve restare leggero e fluido — UI, rendering
  mappa (`_draw()` su `Control`), fisica dei dadi. Nessun carico pesante di IA qui.
- **Server AI (remoto):** PC con RTX 5080 in LAN, esegue Ollama. Il client ci parla via HTTP in
  streaming (`AIBridge`). L'IP è configurabile a runtime, non cablato.

## Struttura

```
godot/
├── project.godot                     # 22 autoload (ordine di dipendenza) + scena principale
├── main.tscn                         # scena principale (root Control + vtt_main.gd)
├── scenes/nexus_demo.tscn            # scena standalone del Nexus Map Engine (prova i dungeon da soli)
├── data/                             # cataloghi statici (regola: JSON in res://data/)
│   ├── monsters.json                 # bestiario (ex npcCatalog, Modulo 06)
│   ├── items.json                    # armi/armature/consumabili base (ex itemCatalog, Modulo 05)
│   ├── spells.json                   # grimorio (ex spellCatalog, Modulo 05)
│   ├── races.json                    # 8 razze + bonus caratteristiche (ex RACES, Modulo 14)
│   ├── classes.json                  # 6 classi + kit di partenza (ex CLASSES, Modulo 14)
│   ├── armeria.json                  # armi/armature/amuleti con rarità (ex CATALOGO, Modulo 41)
│   ├── loot_tables.json              # XP per nemico, curva livelli, tabelle bottino (Modulo 15)
│   ├── bonus_capabilities.json       # capacità di classe/razza per l'Azione Bonus (Modulo 38)
│   └── ventimiglia_pois.json         # 23 POI di Ventimiglia con lat/lng reali (ex Modulo 12/39)
└── scripts/
    ├── data/character_data.gd        # Resource: dati di un PG (ex defaultCharacterState, Mod. 03)
    ├── autoload/
    │   ├── event_bus.gd             # EventBus — signal tipizzati del Nexus Map Engine (disaccoppiamento)
    │   ├── game_state.gd             # GameState — store globale + canale di annuncio (Modulo 36)
    │   ├── character_manager.gd      # CharacterManager — roster, HP, caratteristiche (Modulo 03)
    │   ├── inventory_manager.gd      # InventoryManager — economia azioni, slot, zaino, grimorio,
    │   │                             #   inventario PER-PG salvato/ripristinato in hotseat (Mod. 05/17)
    │   ├── armeria_manager.gd        # ArmeriaManager — rarità, drop scalati sulla forza (Mod. 41)
    │   ├── character_creation.gd     # CharacterCreation — calcolo PG, installa il party (Mod. 14)
    │   ├── progression_manager.gd    # ProgressionManager — XP, level-up, bottino (Modulo 15)
    │   └── save_manager.gd           # SaveManager — salva/carica partita su user://saves/ (nuovo,
    │                                 #   non presente nel monolite ne' nella prima migrazione)
    ├── combat/
    │   ├── combat_manager.gd         # CombatManager — turni, iniziativa, danni, spinta, posizioni (Mod. 05/24/26)
    │   ├── conditions_manager.gd     # ConditionsManager — prono/stordito/avvelenato (Modulo 30)
    │   ├── flanking_system.gd        # FlankingSystem — fiancheggiamento stile BG3 (Modulo 25)
    │   ├── elevation_manager.gd      # ElevationManager — terreno sopraelevato (Modulo 28)
    │   ├── surfaces_manager.gd       # SurfacesManager — superfici fuoco/veleno (Modulo 27)
    │   ├── enemy_ai.gd               # EnemyAI — turno automatico dei PNG (Modulo 33)
    │   ├── encounter_balancer.gd     # EncounterBalancer — scontri scalati sul party (Modulo 37)
    │   └── action_menu_manager.gd    # ActionMenuManager — Azione Bonus dinamica (Modulo 38)
    ├── network/ai_bridge.gd          # AIBridge — ponte streaming verso Ollama remoto (Mod. 10/11)
    ├── map/                          # Nexus Map Engine (dungeon procedurali illuminati)
    │   ├── dungeon_generator.gd      # generatore BSP (strutture) + Cellular Automata (caverne), a temi
    │   └── map_manager.gd            # NexusMapManager — 4 TileMapLayer + Y-sort + PointLight2D + fog LOS
    └── ui/                           # Control auto-costruiti via codice (niente .tscn scritti a mano)
        ├── vtt_main.gd               # scena radice: layout 3 colonne + toolbar + overlay
        ├── character_creation_screen.gd # overlay d'avvio: razza/classe/caratteristiche/party (Mod. 14)
        ├── character_sheet_panel.gd  # sinistra: Scheda PG (HP, caratteristiche) ← CharacterManager
        ├── xp_bar.gd                 # sinistra: barra XP/livello/oro ← ProgressionManager
        ├── tactical_map.gd           # centro: griglia, nebbia, token, elevazione, superfici, click-to-move,
        │                             #   sfondo mappa da immagine locale, righello di misurazione
        ├── overworld_map.gd          # centro: overworld (POI reali, viaggio del party, modalità a
        │                             #   piedi con WASD + rilevamento zone)
        ├── combat_hud.gd             # centro-basso: HUD BG3 (Attacca/Spingi/Bonus/Termina turno)
        ├── dice_roller.gd            # centro-basso: tiratore rapido D4-D20 → GameState.announce
        ├── status_bar.gd             # in fondo: turno/round, combattimento, party, IA nemica
        ├── loot_popup.gd             # overlay: popup di bottino ← ProgressionManager/ArmeriaManager
        ├── nexus_view.gd             # centro: incapsula il Nexus Map Engine in un SubViewport + toolbar
        └── master_chat_panel.gd      # destra: Chat Master (Ollama LAN o Groq cloud), log di sistema
```

## ▶️ Come avviare

1. Apri il progetto in Godot 4.3+ (`Import` → `godot/project.godot`).
2. Premi **Play** (F5). Parte subito la **creazione del personaggio** (Modulo 14):
   - scegli **razza** e **classe** (griglie a scheda), regola le **caratteristiche** (3–18, bonus di
     razza applicati live), guarda PF/CA/velocità/Dado Vita aggiornarsi in tempo reale;
   - **➕ Aggiungi al party** per un gruppo hotseat fino a 4 personaggi, poi **🎲 INIZIA L'AVVENTURA**
     (o premi direttamente Inizia con un solo personaggio nel form).
3. Il layout di gioco a 3 colonne appare. Prova subito, anche **senza** server AI:
   - **⚔ Evoca 2 Goblin** / **💀 Evoca Orco**: passa dall'**Encounter Balancer** (Modulo 37), che
     scala quantità e statistiche dei nemici sul party REALE (livello, HP correnti) — niente più un
     PG solitario circondato da 10 goblin;
   - i nemici compaiono sulla **mappa tattica**, l'HUD in basso si accende; al LORO turno **agiscono
     da soli** (IA nemica, Modulo 33): si avvicinano e attaccano;
   - click su un token per selezionarlo, click su una cella vuota per spostarlo (click-to-move); un
     PG spostato rivela la nebbia di guerra;
   - **⚔ Attacca** / **👐 Spingi** / **⚡ Bonus** (menu dinamico da classe/razza/inventario del PG
     attivo) / **⏭ Termina turno** — i tiri per colpire tengono conto di **fiancheggiamento**,
     **terreno sopraelevato** e **condizioni di stato** (prono/stordito/avvelenato), tutte composte
     secondo la regola di sovrapposizione 5e;
   - un nemico ucciso **sparisce dalla mappa** e fa comparire il **popup di bottino** (oggetti reali
     + oro, coi colori di rarità dell'Armeria); il PG guadagna **XP** (barra XP a sinistra) e può
     **salire di livello**;
   - sopra la mappa, il toggle **🗺 Mappa tattica / 🌍 Ventimiglia**: passa all'**overworld** con i 23
     POI reali (coordinate lat/lng vere); click su un POI = il party ci viaggia, la posizione finisce
     in `GameState` (chiave `party.location`);
   - sull'overworld, **🚶 Modalità a piedi**: il party si muove liberamente con **WASD/frecce** invece
     del solo click; avvicinarsi a un POI fa scattare da solo l'arrivo (narrazione automatica in
     chat), come lo zone-detection del monolite;
   - **🖼 Sfondo mappa** in toolbar: carica un'immagine locale (una mappa salvata da Pinterest, un
     proprio disegno...) al posto della scacchiera generica sulla mappa tattica;
   - sulla mappa tattica, tasto **destro tenuto premuto e trascina** = righello di misurazione
     (celle + metri, live, stile Foundry); camminando sull'overworld puo' scattare un'**imboscata
     casuale** (più probabile nelle zone selvatiche/militari), che passa subito alla mappa tattica;
   - **💾 Salva** / **📂 Carica** in toolbar: la partita (party, inventario per-PG, XP/livello,
     posizione) si salva su disco (`user://saves/`) e si ricarica in qualunque momento fuori
     combattimento; alla schermata iniziale compare anche **📂 Carica partita salvata**, se esiste
     un salvataggio, per saltare del tutto la creazione del personaggio.
4. Per il Master IA, nella colonna destra scegli il provider:
   - **🖧 Ollama (LAN)**: scrivi l'**IP della 5080** (es. `192.168.1.50`) → *Imposta*;
   - **☁ Groq (cloud)**: incolla la tua **API key Groq** (gratuita su console.groq.com) → *Imposta* —
     la key resta SOLO sul tuo computer (`user://ai_bridge.cfg`), mai nel progetto o nel repository.

   Poi scrivi un'azione e premi *Invia*. Se il Master non è raggiungibile, la chat mostra un errore
   pulito (nessun crash) — è il comportamento atteso finché non è configurato/acceso.

## Regole di traduzione applicate

| JS (monolite)                     | Godot 4 (qui)                                              |
|------------------------------------|-------------------------------------------------------------|
| `UltimateVTTState.subscribe(fn)`   | `signal` tipizzati (`character_changed`, `hp_changed`, …)    |
| `annuncia()` ripetuto in ogni modulo | `GameState.announce(text)`, un canale unico → chat log     |
| Cataloghi JS statici               | JSON in `res://data/` + `JSON.parse` / `FileAccess`          |
| Oggetto scheda PG                  | `CharacterData extends Resource` (con `@export`)             |
| `fetch` streaming (ReadableStream) | `HTTPClient` a chunk (NDJSON di Ollama)                      |
| DOM/UI                             | `Control` auto-costruiti via codice, agganciati ai signal    |
| polling a intervalli (setInterval) | signal event-driven (`turn_changed`, ecc.) dove possibile    |

Tutto GDScript 4 a **tipizzazione statica severa** (`var hp: int`, `-> void`, `Array[Dictionary]`).

## ⚙️ Autoload (Project Settings → Globals)

Già dichiarati in `project.godot`, **in ordine di dipendenza** (non riordinare a caso — i manager
più in basso usano quelli sopra al loro `_ready()`):

1. `EventBus` 2. `GameState` 3. `CharacterManager` 4. `InventoryManager` 5. `ArmeriaManager`
6. `CharacterCreation` 7. `CombatManager` 8. `ProgressionManager` 9. `ConditionsManager`
10. `FlankingSystem` 11. `ElevationManager` 12. `SurfacesManager` 13. `EnemyAI`
14. `EncounterBalancer` 15. `ActionMenuManager` 16. `CampaignMemory` 17. `LocalGameManager`
18. `LocalInputManager` 19. `AIBridge` 20. `ChatCombatBridge` 21. `DiceServer` 22. `SaveManager`

Se non compaiono (progetto importato senza leggere il `.godot`), aggiungili a mano: Project
Settings → Autoload → *Path* = lo script, *Node Name* = il nome sopra → **Add**.

## 🏰 Nexus Map Engine (dungeon procedurali illuminati)

Terza vista della colonna centrale (toggle **🏰 Dungeon Nexus**), oltre a Mappa tattica e Overworld.
Un motore mappa vero e proprio in stile "AAA 2.5D", pensato per dungeon complessi (cripte, roccaforti
naniche, templi con fiumi di lava, caverne):

- **4 `TileMapLayer`** (Ground · Walls · Props · Overhead) con **Y-sort**: pilastri e archi si
  disegnano *sopra* i token che ci passano davanti/sotto → profondità 2.5D.
- **Illuminazione dinamica**: `CanvasModulate` scurisce l'ambiente, ogni torcia e la lava sono
  `PointLight2D`; i muri hanno `LightOccluder2D`, quindi la luce **non attraversa la pietra** →
  **nebbia di guerra per linea di vista** (raycasting fatto dal renderer 2D, non a mano). La vista
  del party segue il suo token.
- **Generazione procedurale** (`dungeon_generator.gd`): **BSP tree** per le strutture costruite
  (stanze collegate da corridoi, connettività garantita) e **Cellular Automata** per le caverne
  naturali (con flood-fill che tiene solo la regione raggiungibile). I temi aggiungono fiumi di
  lava/acqua con ponti e archi.
- **Autosufficienza**: `TileSet`, texture delle luci e token sono **generati a runtime** da `Image`
  (nessun asset da scaricare). Vedi `assets/tilesets/README.md` per sostituirli con arte vera.
- **Integrazione, non duplicazione**: il dungeon dialoga con i sistemi esistenti via `EventBus` +
  `CombatManager` — qualunque nemico evocato (pulsanti, Encounter Balancer, comandi del Master IA)
  compare come token sul dungeon e sparisce quando muore. Nessuna regola D&D è ri-scritta qui.
- Prova anche in **isolamento** aprendo `scenes/nexus_demo.tscn` e premendo Play: click = muovi,
  rotellina = zoom, trascina col tasto destro = pan, **🎲 Rigenera** cambia dungeon/tema.

## Cosa NON è (ancora) portato

Trasparenza sui gap noti, per chi continua il lavoro:

- **Un combattente per membro del party hotseat.** `CombatManager` oggi rappresenta in
  combattimento solo il PG **attivo** (`pc-local`); il monolite JS (dopo un fix successivo) dava un
  combattente/token separato a OGNI membro del party hotseat contemporaneamente. Gli altri membri
  esistono comunque nel roster (`CharacterManager`) e ricevono XP/kit correttamente al loro turno.
- **Dadi 3D fisici** (qui c'è solo un tiratore rapido D4-D20 non fisico), **audio procedurale + voce**
  (Task 4 del monolite), **TTS/STT**, **overworld con tile reali** (qui è stilizzata — la modalità a
  piedi cammina sulla proiezione stilizzata, non su Leaflet/OSM), **multiplayer** (relay/Supabase):
  non ancora portati.
- **Cassetto "🛠 Strumenti" del Master** (fog manuale, controlli token/audio) e il **Sistema
  dropdown** del monolite (autodiagnosi moduli, "modalità console"): non portati — in
  Godot un eventuale problema di script lo segnala l'editor stesso, non serve un pannello dedicato.
- **Incontri casuali durante la camminata**: la modalità a piedi rileva le zone e narra gli arrivi,
  ma non fa comparire nemici da sola mentre cammini (`VTTCampagna.spawnEnemyNearPg` del monolite
  era comunque pilotato dal Master IA, non casuale in autonomia).
- ~~Ponte chat→combattimento~~ ORA C'È (`ChatCombatBridge`, Modulo 34): se la narrazione del
  Master annuncia uno scontro senza emettere comandi `<<DATI>>`, i nemici compaiono da soli
  (bestiario riconosciuto nella prosa, conteggi inclusi: "tre goblin", "goblin 1...goblin 4").
  Resta NON portato solo il lato mappa del Modulo 39 (spostamento POI dalla prosa; il comando
  strutturato `moveTo` invece funziona). La **memoria di campagna** (Moduli 29/32) c'è:
  `CampaignMemory` registra gli eventi chiave e li inietta nel prompt del Master.

## Nota sulla verifica

Non ho potuto eseguire l'editor Godot in questo ambiente cloud (nessun binario, download bloccato
dalla policy di rete). Ho invece installato **gdtoolkit** (il parser GDScript reale, la stessa
grammatica usata da Godot) e validato con esso **tutti** i 32 script — zero errori di sintassi —
oltre a verificare i 9 file JSON con un parser reale e incrociare ogni riferimento a autoload/
classi nel codice con quanto dichiarato, per scovare eventuali refusi. **Al primo avvio in Godot**,
se qualche nome d'API dell'engine (non coperto da gdtoolkit, che non conosce le classi native)
fosse leggermente diverso da quanto scritto, l'editor lo segnalerà sulla riga esatta.
