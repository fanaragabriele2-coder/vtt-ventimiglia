extends Node
## CombatManager (Autoload singleton) — porting dei Moduli 05 (Combat Tracker), 24 (Reazioni) e
## 26 (Spingi) del monolite JS.
##
## Possiede l'elenco dei combattenti (PG + PNG), l'ordine di iniziativa e il turno corrente.
## Regole D&D 5e fedeli al legacy: tiro d20 con vantaggio/svantaggio, formule di danno con
## raddoppio dei SOLI dadi sui critici, prova contrapposta per la Spinta, attacco di opportunita'.
##
## Il danno al PG attivo ("pc-local") viene instradato su CharacterManager (unica verita' sugli HP
## della scheda); i PNG hanno HP locali qui. Alla morte dell'ultimo nemico lo scontro finisce da
## solo (VITTORIA), a party interamente a terra si interrompe (TPK) — come nel monolite.
##
## Registrazione: Project Settings > Autoload -> "CombatManager" (dopo CharacterManager).

signal combat_started()
signal combat_ended()
signal turn_changed(combatant_id: String, round_number: int)
signal combatant_added(combatant: Dictionary)
signal combatant_damaged(combatant_id: String, amount: int, current_hp: int)
signal combatant_defeated(combatant_id: String)
signal combatant_healed(combatant_id: String, amount: int, current_hp: int)
signal initiative_rolled(order: Array)
signal attack_resolved(result: Dictionary)
signal shove_resolved(result: Dictionary)
signal victory()
signal party_wiped()

const MONSTERS_PATH: String = "res://data/monsters.json"
const PC_LOCAL_ID: String = "pc-local"

var _monster_catalog: Array[Dictionary] = []
var _combatants: Array[Dictionary] = []
var _active: bool = false
var _round: int = 0
var _current_turn_index: int = -1
var _next_npc_number: int = 1
var _last_event: String = ""


func _ready() -> void:
	_monster_catalog = _load_catalog(MONSTERS_PATH, "monsters")
	# Il tracker parte SOLO con il PG locale (nessun PNG di default): i nemici li evoca il Master.
	_combatants.append(_make_pc_local())


func _make_pc_local() -> Dictionary:
	# Specchia la scheda attiva; gli HP restano autorevoli in CharacterManager, qui e' un riflesso.
	var c: CharacterData = CharacterManager.get_active()
	return {
		"id": PC_LOCAL_ID, "kind": "pc",
		"name": c.character_name if c else "Eroe Locale",
		"armorClass": c.armor_class if c else 10,
		"hitPoints": c.hp_current if c else 10,
		"maxHitPoints": c.hp_max if c else 10,
		"temporaryHitPoints": c.hp_temporary if c else 0,
		"initiative": 0,
		"initiativeBonus": c.modifier_of("dex") if c else 0,
		"attackBonus": 4, "damageFormula": "1d8+2", "defeated": false,
	}


func _load_catalog(path: String, key: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not FileAccess.file_exists(path):
		push_warning("CombatManager: catalogo non trovato: " + path)
		return out
	var text: String = FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary and parsed.has(key):
		for entry: Variant in parsed[key]:
			if entry is Dictionary:
				out.append(entry)
	return out


# --- Stato / lettura ---

func get_state() -> Dictionary:
	return {
		"active": _active, "round": _round,
		"currentTurnIndex": _current_turn_index,
		"combatants": _combatants.duplicate(true),
		"lastEvent": _last_event,
	}


func get_combatant(combatant_id: String) -> Dictionary:
	for c: Dictionary in _combatants:
		if c["id"] == combatant_id:
			return c
	return {}


func is_active() -> bool:
	return _active


# --- Spawn nemici (porting di addNpc del Modulo 05) ---

## Aggiunge un PNG dal bestiario. `overrides` puo' scalare hitPoints/armorClass/attackBonus
## (usato dall'Encounter Balancer). Ritorna il combattente creato (o {} se il catalogo non ha l'id).
func add_npc(catalog_id: String, overrides: Dictionary = {}) -> Dictionary:
	var template: Dictionary = {}
	for m: Dictionary in _monster_catalog:
		if m["id"] == catalog_id:
			template = m
			break
	if template.is_empty():
		return {}
	# Numera i nemici dello stesso tipo (Goblin 1, Goblin 2, ...).
	var same_type: int = 1
	for c: Dictionary in _combatants:
		if c["kind"] == "npc" and String(c["name"]).begins_with(String(template["name"])):
			same_type += 1
	var hp: int = int(overrides.get("hitPoints", template["hitPoints"]))
	var combatant: Dictionary = {
		"id": "npc-%d" % _next_npc_number,
		"kind": "npc",
		"name": "%s %d" % [template["name"], same_type],
		"armorClass": int(overrides.get("armorClass", template["armorClass"])),
		"hitPoints": hp,
		"maxHitPoints": int(overrides.get("maxHitPoints", hp)),
		"temporaryHitPoints": 0,
		"initiative": 0,
		"initiativeBonus": int(template["initiativeBonus"]),
		"attackBonus": int(overrides.get("attackBonus", template["attackBonus"])),
		"damageFormula": String(template["damageFormula"]),
		"defeated": false,
	}
	_next_npc_number += 1
	_combatants.append(combatant)
	_last_event = "PNG aggiunto: " + combatant["name"]
	combatant_added.emit(combatant)
	return combatant


# --- Ciclo del combattimento (porting di startCombat/endCombat/nextTurn) ---

func start_combat() -> void:
	_sync_pc_local_from_character()
	# Non si combatte con tutto il party a terra.
	var any_conscious: bool = false
	for c: Dictionary in _combatants:
		if c["kind"] == "pc" and not c["defeated"] and int(c["hitPoints"]) > 0:
			any_conscious = true
			break
	if not any_conscious:
		_last_event = "Tutti i PG sono incoscienti. Rianimali prima."
		return
	_active = true
	_round = 1
	roll_all_initiative()
	_current_turn_index = _find_next_living_index(-1)
	_last_event = "Combattimento iniziato."
	GameState.set_combat_active(true)
	combat_started.emit()
	if _current_turn_index >= 0:
		turn_changed.emit(_combatants[_current_turn_index]["id"], _round)


func end_combat() -> void:
	_active = false
	_round = 0
	_current_turn_index = -1
	_last_event = "Combattimento terminato."
	GameState.set_combat_active(false)
	combat_ended.emit()


func next_turn() -> void:
	if not _active:
		_last_event = "Il combattimento non e' attivo."
		return
	var next_index: int = _find_next_living_index(_current_turn_index)
	if next_index == -1:
		_last_event = "Nessun combattente vivo."
		return
	# Giro completo -> nuovo round.
	if next_index <= _current_turn_index:
		_round += 1
	_current_turn_index = next_index
	turn_changed.emit(_combatants[_current_turn_index]["id"], _round)


func _find_next_living_index(from_index: int) -> int:
	var n: int = _combatants.size()
	if n == 0:
		return -1
	for offset: int in range(1, n + 1):
		var index: int = (from_index + offset + n) % n
		var c: Dictionary = _combatants[index]
		if not c["defeated"] and int(c["hitPoints"]) > 0:
			return index
	return -1


func roll_all_initiative() -> void:
	for c: Dictionary in _combatants:
		c["initiative"] = roll_d20_with_mode("normal")["chosen"] + int(c["initiativeBonus"])
	_combatants.sort_custom(_compare_by_initiative)
	var order: Array = []
	for c: Dictionary in _combatants:
		order.append({ "id": c["id"], "name": c["name"], "initiative": c["initiative"] })
	initiative_rolled.emit(order)


# Ordina per iniziativa decrescente (il piu' alto agisce per primo).
func _compare_by_initiative(a: Dictionary, b: Dictionary) -> bool:
	return int(a["initiative"]) > int(b["initiative"])


func _sync_pc_local_from_character() -> void:
	var c: CharacterData = CharacterManager.get_active()
	if c == null:
		return
	var pc: Dictionary = get_combatant(PC_LOCAL_ID)
	if pc.is_empty():
		return
	pc["name"] = c.character_name
	pc["armorClass"] = c.armor_class
	pc["hitPoints"] = c.hp_current
	pc["maxHitPoints"] = c.hp_max
	pc["temporaryHitPoints"] = c.hp_temporary
	pc["initiativeBonus"] = c.modifier_of("dex")
	pc["defeated"] = c.hp_current <= 0


# --- Dadi e formule di danno (porting fedele di rollD20WithMode / rollDamageFormula) ---

## Tiro d20. mode: "normal" | "advantage" | "disadvantage".
func roll_d20_with_mode(mode: String) -> Dictionary:
	var rolls: Array[int] = []
	rolls.append(randi_range(1, 20))
	if mode == "advantage" or mode == "disadvantage":
		rolls.append(randi_range(1, 20))
	var chosen: int = rolls[0]
	if mode == "advantage":
		chosen = maxi(rolls[0], rolls[1])
	elif mode == "disadvantage":
		chosen = mini(rolls[0], rolls[1])
	return {
		"rolls": rolls, "chosen": chosen,
		"naturalOne": chosen == 1, "naturalTwenty": chosen == 20,
	}


## Interpreta "2d6+3" -> [{dice,count,sides,sign}, {flat,value}]. Ricade su 1d4 se non valida.
func parse_damage_formula(formula: String) -> Array[Dictionary]:
	var terms: Array[Dictionary] = []
	var regex := RegEx.new()
	regex.compile("([+-]?)(\\d*)d(\\d+)|([+-]?\\d+)")
	var found: bool = false
	for m: RegExMatch in regex.search_all(formula.strip_edges().to_lower()):
		if m.get_string(3) != "":
			var sign: int = -1 if m.get_string(1) == "-" else 1
			var count: int = int(m.get_string(2)) if m.get_string(2) != "" else 1
			terms.append({ "type": "dice", "sign": sign, "count": count, "sides": int(m.get_string(3)) })
			found = true
		elif m.get_string(4) != "":
			terms.append({ "type": "flat", "value": int(m.get_string(4)) })
			found = true
	if not found:
		terms.append({ "type": "dice", "sign": 1, "count": 1, "sides": 4 })
	return terms


## Tira una formula di danno. Sul critico SOLO i dadi raddoppiano (il bonus fisso no). Mai < 0.
func roll_damage_formula(formula: String, critical: bool = false) -> Dictionary:
	var total: int = 0
	for term: Dictionary in parse_damage_formula(formula):
		if term["type"] == "dice":
			var count: int = int(term["count"]) * (2 if critical else 1)
			for i: int in range(count):
				total += int(term["sign"]) * randi_range(1, int(term["sides"]))
		else:
			total += int(term["value"])
	return { "formula": formula, "critical": critical, "total": maxi(0, total) }


# --- Applicazione di danno/cura (porting di applyDamageToCombatant / healCombatant) ---

func apply_damage_to_combatant(combatant_id: String, amount: int) -> bool:
	var combatant: Dictionary = get_combatant(combatant_id)
	if combatant.is_empty():
		return false
	var damage: int = clampi(amount, 0, 9999)
	var was_defeated: bool = bool(combatant["defeated"])

	if combatant_id == PC_LOCAL_ID:
		# Il PG attivo: gli HP autorevoli stanno in CharacterManager.
		CharacterManager.apply_damage(damage)
		_sync_pc_local_from_character()
	else:
		combatant["hitPoints"] = maxi(0, int(combatant["hitPoints"]) - damage)
		combatant["defeated"] = int(combatant["hitPoints"]) <= 0

	combatant_damaged.emit(combatant_id, damage, int(combatant["hitPoints"]))
	if combatant["kind"] == "npc" and combatant["defeated"] and not was_defeated:
		combatant_defeated.emit(combatant_id)

	_check_end_conditions(combatant)
	return true


func heal_combatant(combatant_id: String, amount: int) -> bool:
	var combatant: Dictionary = get_combatant(combatant_id)
	if combatant.is_empty():
		return false
	var healing: int = clampi(amount, 0, 9999)
	if combatant_id == PC_LOCAL_ID:
		CharacterManager.heal(healing)
		_sync_pc_local_from_character()
	else:
		combatant["hitPoints"] = mini(int(combatant["maxHitPoints"]), int(combatant["hitPoints"]) + healing)
		combatant["defeated"] = int(combatant["hitPoints"]) <= 0
	combatant_healed.emit(combatant_id, healing, int(combatant["hitPoints"]))
	return true


func _check_end_conditions(last_hit: Dictionary) -> void:
	if not _active:
		return
	# TPK: tutti i PG a terra.
	var pcs: Array = _combatants.filter(func(c: Dictionary) -> bool: return c["kind"] == "pc")
	var pcs_alive: Array = pcs.filter(func(c: Dictionary) -> bool: return not c["defeated"] and int(c["hitPoints"]) > 0)
	if pcs.size() > 0 and pcs_alive.is_empty():
		_last_event = "TPK: tutto il party e' a terra."
		party_wiped.emit()
		end_combat()
		return
	# VITTORIA: quando cade l'ultimo nemico (controllo solo sul danno a un PNG).
	if last_hit["kind"] == "npc":
		var npcs: Array = _combatants.filter(func(c: Dictionary) -> bool: return c["kind"] == "npc")
		var npcs_alive: Array = npcs.filter(func(c: Dictionary) -> bool: return not c["defeated"] and int(c["hitPoints"]) > 0)
		if npcs.size() > 0 and npcs_alive.is_empty():
			_last_event = "VITTORIA: tutti i nemici sconfitti."
			victory.emit()
			end_combat()


# --- Attacco completo (d20 vs CA, danno a segno; crit su 20 naturale) ---

func resolve_attack(attacker_id: String, target_id: String, mode: String = "normal") -> Dictionary:
	var attacker: Dictionary = get_combatant(attacker_id)
	var target: Dictionary = get_combatant(target_id)
	if attacker.is_empty() or target.is_empty():
		return { "ok": false }
	var d20: Dictionary = roll_d20_with_mode(mode)
	var attack_total: int = int(d20["chosen"]) + int(attacker["attackBonus"])
	var critical: bool = bool(d20["naturalTwenty"])
	# 1 naturale sbaglia sempre; 20 naturale colpisce sempre (e critica); altrimenti d20+bonus vs CA.
	var hit: bool = not bool(d20["naturalOne"]) and (critical or attack_total >= int(target["armorClass"]))
	var result: Dictionary = {
		"ok": true, "attacker": attacker_id, "target": target_id,
		"roll": d20["chosen"], "attackTotal": attack_total,
		"targetAc": int(target["armorClass"]), "critical": critical, "hit": hit, "damage": 0,
	}
	if hit:
		var dmg: Dictionary = roll_damage_formula(String(attacker["damageFormula"]), critical)
		result["damage"] = int(dmg["total"])
		apply_damage_to_combatant(target_id, int(dmg["total"]))
	attack_resolved.emit(result)
	return result


# --- Spinta (porting del Modulo 26): prova contrapposta Atletica vs Atletica/Acrobazia ---

## L'attaccante spinge il bersaglio: Atletica (FOR) contro la migliore tra Atletica e Acrobazia
## (DES) del bersaglio. In caso di successo il bersaglio va spostato di 1 cella (il movimento sulla
## griglia lo gestira' il modulo mappa via il signal shove_resolved).
func shove(attacker_id: String, target_id: String) -> Dictionary:
	var attacker: Dictionary = get_combatant(attacker_id)
	var target: Dictionary = get_combatant(target_id)
	if attacker.is_empty() or target.is_empty():
		return { "ok": false }
	var atk_bonus: int = _athletics_bonus(attacker_id)
	var def_bonus: int = maxi(_athletics_bonus(target_id), _acrobatics_bonus(target_id))
	var atk_roll: int = roll_d20_with_mode("normal")["chosen"] + atk_bonus
	var def_roll: int = roll_d20_with_mode("normal")["chosen"] + def_bonus
	var success: bool = atk_roll >= def_roll  # in parita' vince chi spinge (regola del monolite)
	var result: Dictionary = {
		"ok": true, "attacker": attacker_id, "target": target_id,
		"attackRoll": atk_roll, "defenseRoll": def_roll, "success": success,
	}
	_last_event = "%s spinge %s: %s" % [attacker["name"], target["name"], "riuscita" if success else "fallita"]
	shove_resolved.emit(result)
	return result


func _athletics_bonus(combatant_id: String) -> int:
	if combatant_id == PC_LOCAL_ID:
		return CharacterManager.skill_modifier("athletics")
	# PNG: approssimazione dal bonus d'attacco (proxy della forza fisica), come nel legacy.
	var c: Dictionary = get_combatant(combatant_id)
	return int(c.get("attackBonus", 2)) - 2 if not c.is_empty() else 0


func _acrobatics_bonus(combatant_id: String) -> int:
	if combatant_id == PC_LOCAL_ID:
		return CharacterManager.skill_modifier("acrobatics")
	var c: Dictionary = get_combatant(combatant_id)
	return int(c.get("initiativeBonus", 0)) if not c.is_empty() else 0


# --- Reazione / Attacco di opportunita' (porting del Modulo 24) ---

## Un combattente sferra un attacco di opportunita' su un bersaglio che si allontana. Consuma la
## reazione (la spesa la valida InventoryManager per il PG). Ritorna il risultato dell'attacco.
func opportunity_attack(reactor_id: String, target_id: String) -> Dictionary:
	if reactor_id == PC_LOCAL_ID and not InventoryManager.spend_action_resource("reaction"):
		return { "ok": false, "reason": "Reazione gia' spesa." }
	return resolve_attack(reactor_id, target_id, "normal")
