extends Node
## CharacterManager (Autoload singleton) — porting del Modulo 03 JS "State Manager PG".
##
## Possiede il ROSTER del party (hotseat: piu' PG sullo stesso client) e l'indice del PG attivo.
## Ogni mutazione (danno, cura, cambio caratteristica, cambio scheda) passa da qui ed emette un
## `signal`: e' la traduzione idiomatica di UltimateVTTState.subscribe (regola 1). Gli script UI
## (nodi Control) si connettono ai signal per ridisegnarsi, senza conoscere questo modulo.
##
## Registrazione: Project Settings > Autoload -> "CharacterManager" (DOPO GameState).

## Emesso a ogni cambiamento del PG attivo, con la ragione ("damage", "heal", "ability:str", ...).
## L'equivalente del notifySubscribers(reason) del JS: la UI si ridisegna da qui.
signal character_changed(active: CharacterData, reason: String)
## Emesso quando cambiano gli HP del PG attivo (comodo per barre HP che si aggiornano spesso).
signal hp_changed(current: int, maximum: int, temporary: int)
## Il PG attivo del party e' cambiato (hotseat switch): nuovo indice + nuova scheda.
signal active_character_changed(index: int, active: CharacterData)
## La composizione del party e' cambiata (aggiunto/rimosso un membro).
signal party_changed(party: Array[CharacterData])

# Spread di caratteristiche per i PG generati (Guerriero / Ladro / Mago), come createCharacterState.
const _ABILITY_SPREADS: Array[Dictionary] = [
	{ "str": 14, "dex": 12, "con": 13, "int": 10, "wis": 10, "cha": 8 },
	{ "str": 8,  "dex": 16, "con": 12, "int": 13, "wis": 10, "cha": 11 },
	{ "str": 10, "dex": 12, "con": 12, "int": 15, "wis": 13, "cha": 10 },
]
const _CLASS_NAMES: PackedStringArray = ["Guerriero", "Ladro", "Mago"]
const _HP_BY_VARIANT: PackedInt32Array = [16, 12, 10]
const _AC_BY_VARIANT: PackedInt32Array = [16, 14, 12]

var _party: Array[CharacterData] = []
var _active_index: int = 0
var _next_player_number: int = 2


func _ready() -> void:
	# Party iniziale: un solo eroe locale (come globalState.party del JS).
	_party.append(_make_character("local-hero", "Eroe Locale", 0))


## Il PG attualmente attivo (equivalente di `state` nel JS).
func get_active() -> CharacterData:
	if _active_index < 0 or _active_index >= _party.size():
		return null
	return _party[_active_index]


func get_party() -> Array[CharacterData]:
	return _party


func get_active_index() -> int:
	return _active_index


## Cambia il PG attivo (hotseat switch). Emette active_character_changed + character_changed.
func set_active_index(index: int) -> void:
	if index < 0 or index >= _party.size() or index == _active_index:
		return
	_active_index = index
	var active: CharacterData = get_active()
	active_character_changed.emit(_active_index, active)
	character_changed.emit(active, "activeSwitch")
	hp_changed.emit(active.hp_current, active.hp_max, active.hp_temporary)


## Aggiunge un nuovo PG al party (variante ciclica Guerriero/Ladro/Mago) e lo restituisce.
func add_player(display_name: String = "") -> CharacterData:
	var variant: int = _next_player_number - 1
	var pid: String = "player-%d" % _next_player_number
	var pname: String = display_name if not display_name.is_empty() else "Player %d" % _next_player_number
	var c: CharacterData = _make_character(pid, pname, variant)
	_party.append(c)
	_next_player_number += 1
	party_changed.emit(_party)
	return c


func _make_character(id: String, char_name: String, variant_index: int) -> CharacterData:
	var c := CharacterData.new()
	var variant: int = variant_index % 3
	c.id = id
	c.character_name = char_name
	c.class_name_label = _CLASS_NAMES[variant]
	c.hp_max = _HP_BY_VARIANT[variant]
	c.hp_current = c.hp_max
	c.armor_class = _AC_BY_VARIANT[variant]
	var spread: Dictionary = _ABILITY_SPREADS[variant]
	for key: String in spread.keys():
		c.ability_scores[key] = int(spread[key])
	return c


# --- Calcoli D&D delegati alla scheda attiva (helper puri su CharacterData) ---

func ability_modifier(ability_key: String) -> int:
	var c: CharacterData = get_active()
	return c.modifier_of(ability_key) if c else 0


func saving_throw_modifier(ability_key: String) -> int:
	var c: CharacterData = get_active()
	return c.saving_throw_modifier(ability_key) if c else 0


func skill_modifier(skill_key: String) -> int:
	var c: CharacterData = get_active()
	return c.skill_modifier(skill_key) if c else 0


func passive_skill(skill_key: String) -> int:
	var c: CharacterData = get_active()
	return c.passive_skill(skill_key) if c else 10


# --- Mutazioni di caratteristiche/competenze (con notifica) ---

func set_ability_score(ability_key: String, score: int) -> bool:
	var c: CharacterData = get_active()
	if c == null or not c.ability_scores.has(ability_key):
		return false
	c.ability_scores[ability_key] = clampi(score, 1, 30)
	character_changed.emit(c, "ability:" + ability_key)
	return true


func set_proficiency_bonus(value: int) -> void:
	var c: CharacterData = get_active()
	if c == null:
		return
	c.proficiency_bonus = clampi(value, 0, 12)
	character_changed.emit(c, "proficiencyBonus")


func set_armor_class(value: int) -> void:
	var c: CharacterData = get_active()
	if c == null:
		return
	c.armor_class = clampi(value, 1, 99)
	character_changed.emit(c, "armorClass")


# --- Punti Ferita (porting di applyDamage/heal/setCurrentHp/setMaxHp/setTemporaryHp) ---

## Applica danno assorbendo prima dai PF temporanei, poi dai correnti (mai sotto 0).
## Ritorna il dettaglio dell'applicazione, come il JS.
func apply_damage(amount: int) -> Dictionary:
	var c: CharacterData = get_active()
	if c == null:
		return {}
	var damage: int = clampi(amount, 0, 999)
	var absorbed: int = mini(c.hp_temporary, damage)
	c.hp_temporary -= absorbed
	var to_current: int = damage - absorbed
	c.hp_current = maxi(0, c.hp_current - to_current)
	character_changed.emit(c, "damage")
	hp_changed.emit(c.hp_current, c.hp_max, c.hp_temporary)
	return {
		"requestedDamage": damage,
		"absorbedByTemporaryHp": absorbed,
		"appliedToCurrentHp": to_current,
		"currentHp": c.hp_current,
		"temporaryHp": c.hp_temporary,
	}


func heal(amount: int) -> Dictionary:
	var c: CharacterData = get_active()
	if c == null:
		return {}
	var healing: int = clampi(amount, 0, 999)
	c.hp_current = mini(c.hp_max, c.hp_current + healing)
	character_changed.emit(c, "heal")
	hp_changed.emit(c.hp_current, c.hp_max, c.hp_temporary)
	return { "requestedHealing": healing, "currentHp": c.hp_current, "maxHp": c.hp_max }


func set_current_hp(value: int) -> void:
	var c: CharacterData = get_active()
	if c == null:
		return
	c.hp_current = clampi(value, 0, maxi(1, c.hp_max))
	character_changed.emit(c, "hpCurrent")
	hp_changed.emit(c.hp_current, c.hp_max, c.hp_temporary)


func set_max_hp(value: int) -> void:
	var c: CharacterData = get_active()
	if c == null:
		return
	c.hp_max = clampi(value, 1, 999)
	c.hp_current = mini(c.hp_current, c.hp_max)
	character_changed.emit(c, "hpMax")
	hp_changed.emit(c.hp_current, c.hp_max, c.hp_temporary)


func set_temporary_hp(value: int) -> void:
	var c: CharacterData = get_active()
	if c == null:
		return
	c.hp_temporary = clampi(value, 0, 999)
	character_changed.emit(c, "hpTemporary")
	hp_changed.emit(c.hp_current, c.hp_max, c.hp_temporary)


## Spende un Dado Vita: tira il dado, aggiunge il mod. Costituzione (minimo 1), cura, decrementa.
## Porting fedele di spendHitDie().
func spend_hit_die() -> Dictionary:
	var c: CharacterData = get_active()
	if c == null:
		return { "spent": false }
	var con_mod: int = c.modifier_of("con")
	if c.hit_dice_remaining <= 0:
		return {
			"spent": false, "reason": "Nessun Dado Vita rimasto.",
			"roll": 0, "constitutionModifier": con_mod, "healing": 0,
		}
	var sides: int = _hit_dice_sides(c.hit_dice_formula)
	var roll: int = randi_range(1, sides)
	var healing: int = maxi(1, roll + con_mod)
	c.hit_dice_remaining -= 1
	c.hp_current = mini(c.hp_max, c.hp_current + healing)
	character_changed.emit(c, "spendHitDie")
	hp_changed.emit(c.hp_current, c.hp_max, c.hp_temporary)
	return {
		"spent": true, "reason": "Dado Vita speso.", "roll": roll,
		"constitutionModifier": con_mod, "healing": healing,
		"currentHp": c.hp_current, "remaining": c.hit_dice_remaining,
	}


func _hit_dice_sides(formula: String) -> int:
	var regex := RegEx.new()
	regex.compile("^(\\d+)d(4|6|8|10|12)$")
	var m: RegExMatch = regex.search(formula.strip_edges().to_lower())
	return int(m.get_string(2)) if m else 8


# --- Contesto party per l'AI Bridge (snapshot HP/CA/caratteristiche di TUTTO il party) ---

## Snapshot di tutte le schede: e' esattamente il payload che AIBridge inietta nel prompt del
## Master remoto (buildPartySheetContext del JS). Non chiedere presentazioni: l'AI ha i dati REALI.
func party_snapshot() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for c: CharacterData in _party:
		out.append(c.to_dict())
	return out


## Testo leggibile del party per il system prompt (nome, classe, HP, CA, caratteristiche chiave).
func party_context_text() -> String:
	var lines: PackedStringArray = []
	for c: CharacterData in _party:
		lines.append("- %s (%s liv.%d): HP %d/%d, CA %d, FOR %d DES %d COS %d" % [
			c.character_name, c.class_name_label, c.level,
			c.hp_current, c.hp_max, c.armor_class,
			int(c.ability_scores.get("str", 10)),
			int(c.ability_scores.get("dex", 10)),
			int(c.ability_scores.get("con", 10)),
		])
	return "\n".join(lines)


# --- Serializzazione dell'intero party (salvataggio/rete) ---

func serialize_party() -> Dictionary:
	return { "party": party_snapshot(), "activeIndex": _active_index }


func hydrate_party(data: Dictionary) -> void:
	var raw: Array = data.get("party", [])
	if raw.is_empty():
		return
	_party.clear()
	for entry: Variant in raw:
		if entry is Dictionary:
			_party.append(CharacterData.from_dict(entry))
	_active_index = clampi(int(data.get("activeIndex", 0)), 0, maxi(0, _party.size() - 1))
	party_changed.emit(_party)
	var active: CharacterData = get_active()
	if active:
		character_changed.emit(active, "hydrate")
		hp_changed.emit(active.hp_current, active.hp_max, active.hp_temporary)
