extends Node
## InventoryManager (Autoload singleton) — porting del Modulo 05 JS "Action Economy, Inventario,
## Equipaggiamento, Peso, Spellbook".
##
## Gestisce: l'economia delle azioni del turno (azione/bonus/reazione/movimento), gli slot
## d'equipaggiamento, lo zaino con i pesi, e il grimorio (spellbook + slot incantesimo). I cataloghi
## statici (armi/armature/incantesimi) sono caricati da res://data/*.json (regola di traduzione 2).
##
## Registrazione: Project Settings > Autoload -> "InventoryManager" (dopo CharacterManager).

## L'economia delle azioni e' cambiata (spesa una risorsa o reset a inizio turno).
signal action_economy_changed(economy: Dictionary)
## Lo zaino e' cambiato (aggiunto/rimosso/quantita').
signal inventory_changed(inventory: Array)
## L'equipaggiamento su uno slot e' cambiato (comodo per ricalcolare la CA).
signal equipment_changed(slot_key: String, inventory_id)
## Gli slot incantesimo sono cambiati (lancio o riposo).
signal spell_slots_changed(slots: Dictionary)

const ITEMS_PATH: String = "res://data/items.json"
const SPELLS_PATH: String = "res://data/spells.json"

# Chiavi degli slot d'equipaggiamento (con cosa accettano), come equipmentSlotDefinitions del JS.
const SLOT_ACCEPTS: Dictionary = {
	"mainHand": ["weapon", "focus"],
	"offHand": ["weapon", "shield", "focus"],
	"armor": ["armor"],
	"head": ["head"], "neck": ["neck"], "cloak": ["cloak"], "hands": ["hands"],
	"ringLeft": ["ring"], "ringRight": ["ring"], "feet": ["feet"],
}

var _item_catalog: Dictionary = {}   # id -> definizione oggetto
var _spell_catalog: Dictionary = {}  # id -> definizione incantesimo

var _action_economy: Dictionary = {
	"action": true, "bonusAction": true, "reaction": true, "movementMetersUsed": 0.0,
}
var _equipment_slots: Dictionary = {
	"mainHand": "inv-longsword", "offHand": "inv-shield", "armor": "inv-leather",
	"head": null, "neck": null, "cloak": null, "hands": null,
	"ringLeft": null, "ringRight": null, "feet": null,
}
var _inventory: Array[Dictionary] = [
	{ "inventoryId": "inv-longsword", "catalogId": "longsword", "quantity": 1, "equippedSlot": "mainHand" },
	{ "inventoryId": "inv-shield", "catalogId": "shield", "quantity": 1, "equippedSlot": "offHand" },
	{ "inventoryId": "inv-leather", "catalogId": "leatherArmor", "quantity": 1, "equippedSlot": "armor" },
	{ "inventoryId": "inv-potion", "catalogId": "healingPotion", "quantity": 2, "equippedSlot": null },
	{ "inventoryId": "inv-rations", "catalogId": "rations", "quantity": 5, "equippedSlot": null },
	{ "inventoryId": "inv-rope", "catalogId": "rope", "quantity": 1, "equippedSlot": null },
	{ "inventoryId": "inv-torch", "catalogId": "torch", "quantity": 4, "equippedSlot": null },
]
var _spell_slots: Dictionary = {
	1: { "max": 2, "remaining": 2 }, 2: { "max": 0, "remaining": 0 },
	3: { "max": 0, "remaining": 0 }, 4: { "max": 0, "remaining": 0 },
	5: { "max": 0, "remaining": 0 },
}
var _spellbook: Array[Dictionary] = [
	{ "spellId": "fireBolt", "prepared": true },
	{ "spellId": "mageHand", "prepared": true },
	{ "spellId": "magicMissile", "prepared": true },
	{ "spellId": "shieldSpell", "prepared": true },
	{ "spellId": "mistyStep", "prepared": false },
]
var _next_inventory_number: int = 8

# --- Inventario per-PG (porting del Modulo 17): un solo inventario "vivo" alla volta, salvato e
# ripristinato al cambio di scheda attiva, cosi' ogni personaggio mantiene il proprio zaino.
var _snapshots: Dictionary = {}       # character_id -> stato completo salvato
var _pending_kits: Dictionary = {}    # character_id -> { equip, spells, slots } non ancora applicato
var _current_owner_id: String = ""
var _initial_snapshot: Dictionary = {}


func _ready() -> void:
	_item_catalog = _load_catalog_indexed(ITEMS_PATH, "items")
	_spell_catalog = _load_catalog_indexed(SPELLS_PATH, "spells")
	_initial_snapshot = get_full_state()
	var active: CharacterData = CharacterManager.get_active()
	_current_owner_id = active.id if active else ""
	CharacterManager.active_character_changed.connect(_on_active_character_changed)


func _load_catalog_indexed(path: String, key: String) -> Dictionary:
	var out: Dictionary = {}
	if not FileAccess.file_exists(path):
		push_warning("InventoryManager: catalogo non trovato: " + path)
		return out
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed is Dictionary and parsed.has(key):
		for entry: Variant in parsed[key]:
			if entry is Dictionary and entry.has("id"):
				out[entry["id"]] = entry
	return out


# --- Economia delle azioni (porting di spendActionResource / resetTurn) ---

func get_action_economy() -> Dictionary:
	return _action_economy.duplicate(true)


## Prova a spendere una risorsa d'azione. "movement" e' sempre concesso (accumula i metri usati);
## le altre (action/bonusAction/reaction) si spendono una volta a turno. Ritorna false se esaurita.
func spend_action_resource(key: String, movement_meters: float = 3.0) -> bool:
	if key == "movement":
		_action_economy["movementMetersUsed"] = float(_action_economy["movementMetersUsed"]) + movement_meters
		action_economy_changed.emit(get_action_economy())
		return true
	if not _action_economy.has(key):
		return false
	if not bool(_action_economy[key]):
		return false
	_action_economy[key] = false
	action_economy_changed.emit(get_action_economy())
	return true


func can_afford(key: String) -> bool:
	return bool(_action_economy.get(key, false))


## Reset a inizio turno: azione/bonus/reazione tornano disponibili, movimento azzerato.
func reset_turn() -> void:
	_action_economy = { "action": true, "bonusAction": true, "reaction": true, "movementMetersUsed": 0.0 }
	action_economy_changed.emit(get_action_economy())


# --- Equipaggiamento e peso ---

func get_equipment() -> Dictionary:
	return _equipment_slots.duplicate(true)


func item_definition(catalog_id: String) -> Dictionary:
	return _item_catalog.get(catalog_id, {})


func _inventory_entry(inventory_id: String) -> Dictionary:
	for e: Dictionary in _inventory:
		if e["inventoryId"] == inventory_id:
			return e
	return {}


## Equipaggia un oggetto dello zaino in uno slot, se lo slot accetta quel tipo. Ritorna il successo.
func equip(inventory_id: String, slot_key: String) -> bool:
	if not _equipment_slots.has(slot_key):
		return false
	var entry: Dictionary = _inventory_entry(inventory_id)
	if entry.is_empty():
		return false
	var def: Dictionary = item_definition(String(entry["catalogId"]))
	var accepts: Array = SLOT_ACCEPTS.get(slot_key, [])
	if not accepts.has(String(def.get("type", ""))):
		return false
	# Libera chi occupava lo slot e chi occupava il vecchio slot dell'oggetto.
	var previous: Variant = _equipment_slots[slot_key]
	if previous != null:
		var prev_entry: Dictionary = _inventory_entry(String(previous))
		if not prev_entry.is_empty():
			prev_entry["equippedSlot"] = null
	entry["equippedSlot"] = slot_key
	_equipment_slots[slot_key] = inventory_id
	equipment_changed.emit(slot_key, inventory_id)
	_recompute_armor_class()
	return true


func unequip(slot_key: String) -> void:
	if not _equipment_slots.has(slot_key) or _equipment_slots[slot_key] == null:
		return
	var entry: Dictionary = _inventory_entry(String(_equipment_slots[slot_key]))
	if not entry.is_empty():
		entry["equippedSlot"] = null
	_equipment_slots[slot_key] = null
	equipment_changed.emit(slot_key, null)
	_recompute_armor_class()


## Peso totale trasportato (kg), quantita' incluse — porting di computeTotalWeight.
func total_weight_kg() -> float:
	var total: float = 0.0
	for e: Dictionary in _inventory:
		var def: Dictionary = item_definition(String(e["catalogId"]))
		total += float(def.get("weightKg", 0.0)) * int(e["quantity"])
	return total


## Ricalcola la CA del PG attivo da armatura + scudo equipaggiati + mod. Destrezza (con cap).
func _recompute_armor_class() -> void:
	var base: int = 10
	var dex_cap: Variant = null
	var shield_bonus: int = 0
	var armor_id: Variant = _equipment_slots.get("armor")
	if armor_id != null:
		var armor_def: Dictionary = item_definition(String(_inventory_entry(String(armor_id)).get("catalogId", "")))
		if armor_def.has("armorBase"):
			base = int(armor_def["armorBase"])
			dex_cap = armor_def.get("dexCap")
	var off_id: Variant = _equipment_slots.get("offHand")
	if off_id != null:
		var off_def: Dictionary = item_definition(String(_inventory_entry(String(off_id)).get("catalogId", "")))
		shield_bonus = int(off_def.get("acBonus", 0))
	var dex_mod: int = CharacterManager.ability_modifier("dex")
	if dex_cap != null:
		dex_mod = mini(dex_mod, int(dex_cap))
	CharacterManager.set_armor_class(base + dex_mod + shield_bonus)


# --- Zaino: aggiungi/rimuovi ---

func add_item(catalog_id: String, quantity: int = 1) -> Dictionary:
	var def: Dictionary = item_definition(catalog_id)
	if def.is_empty():
		return {}
	# Se impilabile e gia' presente, incrementa la quantita'.
	if bool(def.get("stackable", false)):
		for e: Dictionary in _inventory:
			if e["catalogId"] == catalog_id and e["equippedSlot"] == null:
				e["quantity"] = int(e["quantity"]) + quantity
				inventory_changed.emit(_inventory.duplicate(true))
				return e
	var entry: Dictionary = {
		"inventoryId": "inv-%d" % _next_inventory_number,
		"catalogId": catalog_id, "quantity": quantity, "equippedSlot": null,
	}
	_next_inventory_number += 1
	_inventory.append(entry)
	inventory_changed.emit(_inventory.duplicate(true))
	return entry


func get_inventory() -> Array[Dictionary]:
	return _inventory.duplicate(true)


## Toglie UNA unita' di un oggetto dallo zaino (porting fedele di dropInventoryItem): se la
## quantita' e' >1 e non e' equipaggiato, scala di 1; altrimenti (ultima unita' o equipaggiato)
## rimuove del tutto la voce e libera lo slot. Ritorna false se l'oggetto non esiste.
func drop_item(inventory_id: String) -> bool:
	var idx: int = -1
	for i: int in range(_inventory.size()):
		if _inventory[i]["inventoryId"] == inventory_id:
			idx = i
			break
	if idx == -1:
		return false
	var entry: Dictionary = _inventory[idx]
	if int(entry["quantity"]) > 1 and entry["equippedSlot"] == null:
		entry["quantity"] = int(entry["quantity"]) - 1
	else:
		var slot: Variant = entry["equippedSlot"]
		if slot != null:
			_equipment_slots[slot] = null
			equipment_changed.emit(String(slot), null)
		_inventory.remove_at(idx)
	inventory_changed.emit(_inventory.duplicate(true))
	_recompute_armor_class()
	return true


## Svuota completamente zaino e slot (porting di clearInventory, usato prima di applicare un kit).
func clear_inventory() -> void:
	_inventory.clear()
	for key: String in _equipment_slots.keys():
		_equipment_slots[key] = null
	inventory_changed.emit(_inventory.duplicate(true))
	_recompute_armor_class()


## Sostituisce lo zaino col kit di partenza di una classe (creazione personaggio, Modulo 14):
## svuota tutto e aggiunge+equipaggia ogni voce. kit_items: Array di { c: catalogId, q: quantita', slot? }.
func apply_kit(kit_items: Array) -> void:
	clear_inventory()
	for it: Variant in kit_items:
		if not (it is Dictionary):
			continue
		var entry: Dictionary = add_item(String(it.get("c", "")), int(it.get("q", 1)))
		var slot_key: String = String(it.get("slot", ""))
		if not slot_key.is_empty() and not entry.is_empty():
			equip(String(entry["inventoryId"]), slot_key)


## Registra nuovi oggetti nel catalogo a runtime (porting di registerCatalogItems): usato
## dall'Armeria per aggiungere armi/armature rare senza toccare items.json. Non sovrascrive
## voci gia' esistenti con lo stesso id.
func register_catalog_items(items: Array) -> int:
	var added: int = 0
	for item: Variant in items:
		if item is Dictionary and item.has("id") and not _item_catalog.has(item["id"]):
			_item_catalog[item["id"]] = item
			added += 1
	return added


# --- Grimorio e slot incantesimo ---

func spell_definition(spell_id: String) -> Dictionary:
	return _spell_catalog.get(spell_id, {})


func get_spellbook() -> Array[Dictionary]:
	return _spellbook.duplicate(true)


func set_spell_prepared(spell_id: String, prepared: bool) -> void:
	for s: Dictionary in _spellbook:
		if s["spellId"] == spell_id:
			s["prepared"] = prepared
			return


## Aggiunge un incantesimo al grimorio (trucchetti sempre preparati). Porting di addSpell.
func add_spell(spell_id: String) -> bool:
	var def: Dictionary = spell_definition(spell_id)
	if def.is_empty():
		return false
	for s: Dictionary in _spellbook:
		if s["spellId"] == spell_id:
			return false  # gia' conosciuto
	_spellbook.append({ "spellId": spell_id, "prepared": int(def.get("level", 0)) == 0 })
	return true


## Alterna preparato/non preparato (i trucchetti restano sempre preparati). Porting di togglePreparedSpell.
func toggle_prepared_spell(spell_id: String) -> bool:
	var def: Dictionary = spell_definition(spell_id)
	if def.is_empty():
		return false
	for s: Dictionary in _spellbook:
		if s["spellId"] == spell_id:
			s["prepared"] = true if int(def.get("level", 0)) == 0 else not bool(s["prepared"])
			return true
	return false


## Imposta max o remaining di uno slot di livello. Porting di setSpellSlot.
func set_spell_slot(level: int, field: String, value: int) -> bool:
	if not _spell_slots.has(level):
		return false
	var slot: Dictionary = _spell_slots[level]
	if field == "max":
		slot["max"] = clampi(value, 0, 9)
		slot["remaining"] = mini(int(slot["remaining"]), int(slot["max"]))
	else:
		slot["remaining"] = clampi(value, 0, int(slot["max"]))
	spell_slots_changed.emit(_spell_slots.duplicate(true))
	return true


## Installa il grimorio di partenza di una classe incantatrice (creazione personaggio).
func apply_spellbook(spells: Array, slots: Dictionary) -> void:
	_spellbook.clear()
	for spell_id: Variant in spells:
		add_spell(String(spell_id))
	for level_key: Variant in slots.keys():
		var level: int = int(level_key)
		var max_slots: int = int(slots[level_key])
		_spell_slots[level] = { "max": max_slots, "remaining": max_slots }
	spell_slots_changed.emit(_spell_slots.duplicate(true))


## Lancia un incantesimo consumando uno slot del suo livello (i trucchetti, livello 0, sono gratis).
## Ritorna false se non ci sono slot disponibili.
func cast_spell(spell_id: String) -> bool:
	var def: Dictionary = spell_definition(spell_id)
	if def.is_empty():
		return false
	var level: int = int(def.get("level", 0))
	if level == 0:
		return true  # trucchetto: nessuno slot consumato
	if not _spell_slots.has(level):
		return false
	var slot: Dictionary = _spell_slots[level]
	if int(slot["remaining"]) <= 0:
		return false
	slot["remaining"] = int(slot["remaining"]) - 1
	spell_slots_changed.emit(_spell_slots.duplicate(true))
	return true


func get_spell_slots() -> Dictionary:
	return _spell_slots.duplicate(true)


# --- Inventario per-PG (porting del Modulo 17): al cambio di scheda attiva, salva l'inventario del
# PG uscente e ripristina quello del PG entrante (o lo materializza dal kit "in attesa", o ricade
# sull'inventario iniziale se il PG non ha ne' l'uno ne' l'altro — es. aggiunto con "+ PG" veloce). ---

## Snapshot completo dello stato (equipaggiamento, zaino, economia azioni, grimorio, slot).
func get_full_state() -> Dictionary:
	return {
		"actionEconomy": _action_economy.duplicate(true),
		"equipmentSlots": _equipment_slots.duplicate(true),
		"inventory": _inventory.duplicate(true),
		"spellSlots": _spell_slots.duplicate(true),
		"spellbook": _spellbook.duplicate(true),
		"nextInventoryNumber": _next_inventory_number,
	}


## Ripristina uno snapshot completo (l'opposto di get_full_state), notificando tutti i signal.
func hydrate_full_state(state: Dictionary) -> void:
	_action_economy = (state.get("actionEconomy", _action_economy) as Dictionary).duplicate(true)
	_equipment_slots = (state.get("equipmentSlots", _equipment_slots) as Dictionary).duplicate(true)
	_inventory.clear()
	for e: Variant in state.get("inventory", []):
		if e is Dictionary:
			_inventory.append((e as Dictionary).duplicate(true))
	_spell_slots = (state.get("spellSlots", _spell_slots) as Dictionary).duplicate(true)
	_spellbook.clear()
	for s: Variant in state.get("spellbook", []):
		if s is Dictionary:
			_spellbook.append((s as Dictionary).duplicate(true))
	_next_inventory_number = int(state.get("nextInventoryNumber", _next_inventory_number))
	action_economy_changed.emit(get_action_economy())
	inventory_changed.emit(_inventory.duplicate(true))
	spell_slots_changed.emit(_spell_slots.duplicate(true))
	_recompute_armor_class()


func _on_active_character_changed(_index: int, active: CharacterData) -> void:
	if active == null:
		return
	if not _current_owner_id.is_empty():
		_snapshots[_current_owner_id] = get_full_state()
	_restore_for(active.id)
	_current_owner_id = active.id


func _restore_for(character_id: String) -> void:
	if _snapshots.has(character_id):
		hydrate_full_state(_snapshots[character_id])
		return
	if _pending_kits.has(character_id):
		var kit: Dictionary = _pending_kits[character_id]
		apply_kit(Array(kit.get("equip", [])))
		if not Array(kit.get("spells", [])).is_empty():
			apply_spellbook(Array(kit.get("spells", [])), kit.get("slots", {}))
		_pending_kits.erase(character_id)
		return
	hydrate_full_state(_initial_snapshot)


## Dice a chi appartiene ORA l'inventario vivo, senza salvare/ripristinare nulla (usato subito dopo
## aver applicato manualmente il kit del primo PG in un nuovo party: da questo momento in poi, il
## normale swap automatico sa a chi accreditare l'inventario in uscita).
func set_current_owner(character_id: String) -> void:
	_current_owner_id = character_id


## Mette in attesa il kit di un PG che non e' ancora mai stato attivo: si materializza (add_item +
## equip) alla PRIMA volta che diventa il PG attivo, esattamente come js/17 con VTTCharacters.byId.
func stage_kit_for_character(character_id: String, equip_list: Array, spells: Array, slots: Dictionary) -> void:
	_pending_kits[character_id] = { "equip": equip_list, "spells": spells, "slots": slots }


## Azzera ogni snapshot/kit in attesa (nuova partita: niente inventari del party precedente).
func reset_snapshots() -> void:
	_snapshots.clear()
	_pending_kits.clear()
	_current_owner_id = ""
