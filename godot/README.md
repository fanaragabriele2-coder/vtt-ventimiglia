# Ultimate VTT — Migrazione Godot 4 (Split-Rig)

Porting del monolite Vanilla JS/HTML del "Tavolo Oscuro di Ventimiglia" verso un'architettura
professionale Godot 4. Questa cartella (`godot/`) **è** la radice del progetto Godot: aprila con
Godot 4.3+ (`Import` → seleziona `godot/project.godot`).

## Architettura Split-Rig

- **Client (questo progetto):** laptop RTX 4050. Deve restare leggero e fluido — UI, rendering
  mappa (TileMap/CanvasItem), fisica dei dadi. Nessun carico pesante di IA qui.
- **Server AI (remoto):** PC con RTX 5080 in LAN, esegue Ollama. Il client ci parla via HTTP in
  streaming (`AIBridge`). L'IP è configurabile a runtime, non cablato.

## Struttura

```
godot/
├── project.godot                     # autoload già registrati (vedi sotto)
├── data/                             # cataloghi statici (regola: JSON in res://data/)
│   ├── monsters.json                 # bestiario (ex npcCatalog, Modulo 06)
│   ├── items.json                    # armi/armature/consumabili (ex itemCatalog, Modulo 05)
│   └── spells.json                   # grimorio (ex spellCatalog, Modulo 05)
└── scripts/
    ├── data/character_data.gd        # Resource: dati di un PG (ex defaultCharacterState, Mod. 03)
    ├── autoload/
    │   ├── game_state.gd             # GameState  — store globale osservabile (ex Modulo 36)
    │   ├── character_manager.gd      # CharacterManager — HP, caratteristiche, dadi vita (Mod. 03)
    │   └── inventory_manager.gd      # InventoryManager — action economy, slot, peso, spellbook (Mod. 05)
    ├── combat/combat_manager.gd      # CombatManager — turni, iniziativa, danni, spinta, reazioni (Mod. 05/24/26)
    └── network/ai_bridge.gd          # AIBridge — ponte streaming verso Ollama remoto (Mod. 10/11)
```

## Regole di traduzione applicate

| JS (monolite)                    | Godot 4 (qui)                                             |
|----------------------------------|----------------------------------------------------------|
| `UltimateVTTState.subscribe(fn)` | `signal` tipizzati (`character_changed`, `hp_changed`, …) |
| Cataloghi JS statici             | JSON in `res://data/` + `JSON.parse` / `FileAccess`      |
| Oggetto scheda PG                | `CharacterData extends Resource` (con `@export`)          |
| `fetch` streaming (ReadableStream)| `HTTPClient` a chunk (NDJSON di Ollama)                  |
| DOM/UI                           | (Step successivo) script su nodi `Control`                |

Tutto GDScript 4 a **tipizzazione statica severa** (`var hp: int`, `-> void`, `Array[Dictionary]`).

## ⚙️ COSA DEVI FARE NELL'EDITOR (collegamento nodi/autoload)

Gli autoload sono **già dichiarati** in `project.godot`, quindi all'apertura del progetto
dovrebbero comparire da soli in *Project → Project Settings → Globals (Autoload)*. Verifica che ci
siano questi 5, **in quest'ordine** (l'ordine conta: i manager in basso usano quelli sopra al
`_ready`):

1. `GameState` → `res://scripts/autoload/game_state.gd`
2. `CharacterManager` → `res://scripts/autoload/character_manager.gd`
3. `InventoryManager` → `res://scripts/autoload/inventory_manager.gd`
4. `CombatManager` → `res://scripts/combat/combat_manager.gd`
5. `AIBridge` → `res://scripts/network/ai_bridge.gd`

Se **non** compaiono (progetto importato senza leggere il `.godot`), aggiungili a mano:
Project Settings → Autoload → *Path* = lo script, *Node Name* = il nome sopra → **Add**.

### Come useranno i signal i tuoi nodi UI (Step successivo)

I manager non toccano la UI: **emettono signal**, e i tuoi nodi `Control` vi si connettono. Esempi
già pronti da usare quando creerai le scene:

```gdscript
# Barra HP (un Control):
func _ready() -> void:
    CharacterManager.hp_changed.connect(_on_hp_changed)
    var c := CharacterManager.get_active()
    _on_hp_changed(c.hp_current, c.hp_max, c.hp_temporary)

func _on_hp_changed(current: int, maximum: int, _temp: int) -> void:
    $Bar.max_value = maximum
    $Bar.value = current

# Log della chat del Master (un RichTextLabel) con streaming parola-per-parola:
func _ready() -> void:
    AIBridge.master_chunk.connect(func(t: String) -> void: $Chat.text += t)
    AIBridge.master_complete.connect(func(_narr, cmds): print("comandi: ", cmds))
    AIBridge.master_error.connect(func(msg: String) -> void: push_error(msg))

# Un LineEdit per l'IP della 5080 + invio prompt:
func _on_host_submitted(ip: String) -> void:
    AIBridge.set_ollama_host(ip)          # es. "192.168.1.50", persistito in user://
func _on_send(prompt: String) -> void:
    AIBridge.send_master_prompt(prompt)   # snapshot del party già incluso nel payload
```

Segnali principali per l'HUD di combattimento: `CombatManager.turn_changed`,
`combatant_damaged`, `combatant_defeated`, `victory`, `initiative_rolled`.

## Nota sulla verifica

Non ho potuto eseguire il parser di Godot in questo ambiente cloud (nessun binario Godot, download
bloccato dal proxy). Ho quindi validato: JSON dei cataloghi (parser reale ✓), e i `.gd` con
controlli strutturali (bilanciamento parentesi, indentazione a tab, assenza di JS-ismi, ogni `func`
con tipo di ritorno). **Al primo avvio in Godot conviene aprire ogni script una volta** per far
girare il parser dell'editor e confermare zero errori prima di costruire le scene.
