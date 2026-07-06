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
├── project.godot                     # 15 autoload (ordine di dipendenza) + scena principale
├── main.tscn                         # scena principale (root Control + vtt_main.gd)
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
    │   ├── game_state.gd             # GameState — store globale + canale di annuncio (Modulo 36)
    │   ├── character_manager.gd      # CharacterManager — roster, HP, caratteristiche (Modulo 03)
    │   ├── inventory_manager.gd      # InventoryManager — economia azioni, slot, zaino, grimorio,
    │   │                             #   inventario PER-PG salvato/ripristinato in hotseat (Mod. 05/17)
    │   ├── armeria_manager.gd        # ArmeriaManager — rarità, drop scalati sulla forza (Mod. 41)
    │   ├── character_creation.gd     # CharacterCreation — calcolo PG, installa il party (Mod. 14)
    │   └── progression_manager.gd    # ProgressionManager — XP, level-up, bottino (Modulo 15)
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
    └── ui/                           # Control auto-costruiti via codice (niente .tscn scritti a mano)
        ├── vtt_main.gd               # scena radice: layout 3 colonne + toolbar + overlay
        ├── character_creation_screen.gd # overlay d'avvio: razza/classe/caratteristiche/party (Mod. 14)
        ├── character_sheet_panel.gd  # sinistra: Scheda PG (HP, caratteristiche) ← CharacterManager
        ├── xp_bar.gd                 # sinistra: barra XP/livello/oro ← ProgressionManager
        ├── tactical_map.gd           # centro: griglia, nebbia, token, elevazione, superfici, click-to-move
        ├── overworld_map.gd          # centro: overworld di Ventimiglia (POI reali, viaggio del party)
        ├── combat_hud.gd             # centro-basso: HUD BG3 (Attacca/Spingi/Bonus/Termina turno)
        ├── loot_popup.gd             # overlay: popup di bottino ← ProgressionManager/ArmeriaManager
        └── master_chat_panel.gd      # destra: Chat Master streaming + IP server + log di sistema
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
     in `GameState` (chiave `party.location`).
4. Per il Master IA: nella colonna destra scrivi l'**IP della 5080** (es. `192.168.1.50`) → *Imposta*,
   poi scrivi un'azione e premi *Invia*. Se Ollama non è raggiungibile, la chat mostra un errore
   pulito (nessun crash) — è il comportamento atteso finché il server non è acceso.

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

1. `GameState` 2. `CharacterManager` 3. `InventoryManager` 4. `ArmeriaManager`
5. `CharacterCreation` 6. `CombatManager` 7. `ProgressionManager` 8. `ConditionsManager`
9. `FlankingSystem` 10. `ElevationManager` 11. `SurfacesManager` 12. `EnemyAI`
13. `EncounterBalancer` 14. `ActionMenuManager` 15. `AIBridge`

Se non compaiono (progetto importato senza leggere il `.godot`), aggiungili a mano: Project
Settings → Autoload → *Path* = lo script, *Node Name* = il nome sopra → **Add**.

## Cosa NON è (ancora) portato

Trasparenza sui gap noti, per chi continua il lavoro:

- **Un combattente per membro del party hotseat.** `CombatManager` oggi rappresenta in
  combattimento solo il PG **attivo** (`pc-local`); il monolite JS (dopo un fix successivo) dava un
  combattente/token separato a OGNI membro del party hotseat contemporaneamente. Gli altri membri
  esistono comunque nel roster (`CharacterManager`) e ricevono XP/kit correttamente al loro turno.
- **Dadi 3D fisici**, **audio procedurale + voce** (Task 4 del monolite), **TTS/STT**, **overworld
  con tile reali** (qui è stilizzata), **multiplayer** (relay/Supabase): non ancora portati.
- **Memoria di campagna per il Master IA** (Moduli 29/32) e **ponte chat→combattimento/mappa**
  (Modulo 34/39 lato parsing automatico della narrazione): `AIBridge` esegue già i comandi
  strutturati (`<<DATI>>`) ma non estrae ancora spawn/spostamenti dalla sola prosa libera.

## Nota sulla verifica

Non ho potuto eseguire l'editor Godot in questo ambiente cloud (nessun binario, download bloccato
dalla policy di rete). Ho invece installato **gdtoolkit** (il parser GDScript reale, la stessa
grammatica usata da Godot) e validato con esso **tutti** i 25 script — zero errori di sintassi —
oltre a verificare i 9 file JSON con un parser reale e incrociare ogni riferimento a autoload/
classi nel codice con quanto dichiarato, per scovare eventuali refusi. **Al primo avvio in Godot**,
se qualche nome d'API dell'engine (non coperto da gdtoolkit, che non conosce le classi native)
fosse leggermente diverso da quanto scritto, l'editor lo segnalerà sulla riga esatta.
