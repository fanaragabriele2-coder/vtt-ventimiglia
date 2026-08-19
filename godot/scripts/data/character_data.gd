class_name CharacterData
extends Resource
## Dati di un singolo personaggio del party — porting del defaultCharacterState del Modulo 03 (JS).
##
## E' una Resource (regola di traduzione 2): puoi crearne istanze come .tres nell'Inspector di
## Godot, oppure via codice (CharacterManager le costruisce dal roster). Contiene SOLO dati +
## helper puri di calcolo (modificatori D&D): la logica di mutazione con notifica sta in
## CharacterManager, che possiede il roster ed emette i signal.

# Le 6 caratteristiche D&D, nell'ordine canonico della scheda.
const ABILITY_KEYS: PackedStringArray = ["str", "dex", "con", "int", "wis", "cha"]

# Le 18 abilita' con la caratteristica a cui sono legate (per skill_modifier / passive).
const SKILL_ABILITY: Dictionary = {
	"acrobatics": "dex", "animalHandling": "wis", "arcana": "int", "athletics": "str",
	"deception": "cha", "history": "int", "insight": "wis", "intimidation": "cha",
	"investigation": "int", "medicine": "wis", "nature": "int", "perception": "wis",
	"performance": "cha", "persuasion": "cha", "religion": "int", "sleightOfHand": "dex",
	"stealth": "dex", "survival": "wis",
}

@export var id: String = "local-hero"
@export var character_name: String = "Eroe Locale"
@export var class_name_label: String = "Avventuriero"
@export var ancestry: String = "Umano"
@export var level: int = 1
@export var proficiency_bonus: int = 2

## Punteggi delle 6 caratteristiche (str/dex/con/int/wis/cha) -> int.
@export var ability_scores: Dictionary = {
	"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10,
}
## Competenza nei tiri salvezza per caratteristica -> bool.
@export var saving_throw_proficient: Dictionary = {
	"str": false, "dex": false, "con": false, "int": false, "wis": false, "cha": false,
}
## Abilita': ogni chiave -> { "proficient": bool, "expertise": bool, "bonus": int }.
@export var skills: Dictionary = {}

@export var hp_current: int = 10
@export var hp_max: int = 10
@export var hp_temporary: int = 0
@export var armor_class: int = 10
@export var speed_meters: int = 9

@export var hit_dice_formula: String = "1d8"
@export var hit_dice_total: int = 1
@export var hit_dice_remaining: int = 1

## Note libere del giocatore (scheda "Note") — non tocca alcuna regola, solo testo persistito.
@export var notes: String = ""


func _init() -> void:
	if skills.is_empty():
		for skill_key: String in SKILL_ABILITY.keys():
			skills[skill_key] = { "proficient": false, "expertise": false, "bonus": 0 }


## Modificatore di caratteristica D&D: floor((punteggio - 10) / 2).
static func ability_modifier(score: int) -> int:
	return int(floor((score - 10) / 2.0))


func modifier_of(ability_key: String) -> int:
	return CharacterData.ability_modifier(int(ability_scores.get(ability_key, 10)))


## Modificatore di tiro salvezza: mod caratteristica + (competenza se proficient).
func saving_throw_modifier(ability_key: String) -> int:
	var mod: int = modifier_of(ability_key)
	if bool(saving_throw_proficient.get(ability_key, false)):
		mod += proficiency_bonus
	return mod


## Modificatore di prova di abilita': mod caratteristica + competenza*(1|2) + bonus manuale.
func skill_modifier(skill_key: String) -> int:
	if not SKILL_ABILITY.has(skill_key):
		return 0
	var skill: Dictionary = skills.get(skill_key, {})
	var ability_key: String = SKILL_ABILITY[skill_key]
	var mult: int = 2 if bool(skill.get("expertise", false)) else (1 if bool(skill.get("proficient", false)) else 0)
	return modifier_of(ability_key) + proficiency_bonus * mult + int(skill.get("bonus", 0))


## Valore di abilita' passiva: 10 + modificatore della prova.
func passive_skill(skill_key: String) -> int:
	return 10 + skill_modifier(skill_key)


## Snapshot serializzabile (per rete/salvataggio/contesto AI). Speculare a serialize() del JS.
func to_dict() -> Dictionary:
	return {
		"id": id,
		"name": character_name,
		"className": class_name_label,
		"ancestry": ancestry,
		"level": level,
		"proficiencyBonus": proficiency_bonus,
		"abilities": ability_scores.duplicate(true),
		"savingThrows": saving_throw_proficient.duplicate(true),
		"skills": skills.duplicate(true),
		"hp": { "current": hp_current, "max": hp_max, "temporary": hp_temporary },
		"armorClass": armor_class,
		"speedMeters": speed_meters,
		"hitDice": {
			"formula": hit_dice_formula, "total": hit_dice_total, "remaining": hit_dice_remaining,
		},
		"notes": notes,
	}


## Costruisce un CharacterData da un dizionario (deserializzazione). Tollerante ai campi mancanti.
static func from_dict(data: Dictionary) -> CharacterData:
	var c := CharacterData.new()
	c.id = String(data.get("id", c.id))
	c.character_name = String(data.get("name", c.character_name))
	c.class_name_label = String(data.get("className", c.class_name_label))
	c.ancestry = String(data.get("ancestry", c.ancestry))
	c.level = int(data.get("level", c.level))
	c.proficiency_bonus = int(data.get("proficiencyBonus", c.proficiency_bonus))
	if data.has("abilities"):
		c.ability_scores = (data["abilities"] as Dictionary).duplicate(true)
	if data.has("savingThrows"):
		c.saving_throw_proficient = (data["savingThrows"] as Dictionary).duplicate(true)
	if data.has("skills"):
		c.skills = (data["skills"] as Dictionary).duplicate(true)
	var hp: Dictionary = data.get("hp", {})
	c.hp_max = int(hp.get("max", c.hp_max))
	c.hp_current = int(hp.get("current", c.hp_max))
	c.hp_temporary = int(hp.get("temporary", 0))
	c.armor_class = int(data.get("armorClass", c.armor_class))
	c.speed_meters = int(data.get("speedMeters", c.speed_meters))
	var hd: Dictionary = data.get("hitDice", {})
	c.hit_dice_formula = String(hd.get("formula", c.hit_dice_formula))
	c.hit_dice_total = int(hd.get("total", c.hit_dice_total))
	c.hit_dice_remaining = int(hd.get("remaining", c.hit_dice_total))
	c.notes = String(data.get("notes", ""))
	return c
