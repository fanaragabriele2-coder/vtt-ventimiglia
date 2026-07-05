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


func _ready() -> void:
	_item_catalog = _load_catalog_indexed(ITEMS_PATH, "items")
	_spell_catalog = _load_catalog_indexed(SPELLS_PATH, "spells")


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
