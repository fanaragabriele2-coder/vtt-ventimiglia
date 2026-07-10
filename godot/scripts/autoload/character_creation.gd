extends Node
## CharacterCreation (Autoload singleton) — porting del Modulo 14 JS "Start Menu + Creazione
## Personaggio".
##
## Tiene i cataloghi di razze/classi (data/races.json, data/classes.json) e la logica PURA di
## calcolo (caratteristiche finali, HP, CA) usata dalla schermata di creazione. Costruire un PG
## richiede due passi separati, come nel monolite:
##   1. build_character(...) -> Dictionary "grezzo" (razza/classe/nome/punteggi/kit), non ancora
##      installato nel gioco;
##   2. start_new_game(builds) -> installa l'intero party in CharacterManager e applica il kit di
##      equipaggiamento del PRIMO personaggio in InventoryManager (stesso comportamento del JS:
##      l'inventario e' condiviso e swappato per-PG al cambio di scheda, gestito da InventoryManager).
##
## Registrazione: Project Settings > Autoload -> "CharacterCreation" (dopo InventoryManager).

const RACES_PATH: String = "res://data/races.json"
const CLASSES_PATH: String = "res://data/classes.json"
const ABILITY_KEYS: PackedStringArray = ["str", "dex", "con", "int", "wis", "cha"]

var races: Array[Dictionary] = []
var classes: Array[Dictionary] = []


func _ready() -> void:
	races = _load_catalog(RACES_PATH, "races")
	classes = _load_catalog(CLASSES_PATH, "classes")


func _load_catalog(path: String, key: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not FileAccess.file_exists(path):
		push_warning("CharacterCreation: catalogo non trovato: " + path)
		return out
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed is Dictionary and parsed.has(key):
		for entry: Variant in parsed[key]:
			if entry is Dictionary:
				out.append(entry)
	return out


func get_race(race_id: String) -> Dictionary:
	for r: Dictionary in races:
		if r["id"] == race_id:
			return r
	return races[0] if not races.is_empty() else {}


func get_class_def(class_id: String) -> Dictionary:
	for c: Dictionary in classes:
		if c["id"] == class_id:
			return c
	return classes[0] if not classes.is_empty() else {}


## Non statica: la si chiama sempre o "nuda" dentro i metodi di questo autoload, o via il singleton
## CharacterCreation.ability_modifier(...) — mai come statica pura, quindi restare metodo d'istanza
## evita l'avviso "funzione statica chiamata da un'istanza".
func ability_modifier(score: int) -> int:
	return int(floor((score - 10) / 2.0))


## Caratteristiche finali = punteggi base scelti dal giocatore + bonus razziali, clampati 1..20.
func final_abilities(base_scores: Dictionary, race_id: String) -> Dictionary:
	var race: Dictionary = get_race(race_id)
	var bonus: Dictionary = race.get("bonus", {})
	var out: Dictionary = {}
	for key: String in ABILITY_KEYS:
		var b: int = int(base_scores.get(key, 10)) + int(bonus.get(key, 0))
		out[key] = clampi(b, 1, 20)
	return out


## CA di partenza dal kit d'equipaggiamento (armatura + scudo) e dal mod. Destrezza (con eventuale
## tetto dell'armatura). Porting di computeAC.
func compute_ac(final_abils: Dictionary, equip: Array) -> int:
	var dex_mod: int = ability_modifier(int(final_abils.get("dex", 10)))
	var ac: int = 10 + dex_mod
	var shield: int = 0
	for it: Variant in equip:
		if not (it is Dictionary):
			continue
		var item: Dictionary = InventoryManager.item_definition(String(it.get("c", "")))
		if item.is_empty():
			continue
		if String(it.get("slot", "")) == "armor" and item.has("armorBase"):
			var dex_cap: Variant = item.get("dexCap")
			var dc: int = dex_mod if dex_cap == null else mini(dex_mod, int(dex_cap))
			ac = int(item["armorBase"]) + dc
		if String(item.get("type", "")) == "shield" and item.has("acBonus"):
			shield += int(item["acBonus"])
	return ac + shield


## HP di partenza: dado vita della classe (valore massimo, non tirato) + mod. Costituzione, min. 1.
func compute_hp(final_abils: Dictionary, cls: Dictionary) -> int:
	return maxi(1, int(cls.get("hitDie", 8)) + ability_modifier(int(final_abils.get("con", 10))))


## Costruisce il "progetto" di un personaggio (non ancora installato nel gioco). base_scores e' il
## punteggio BASE (3-18) scelto dal giocatore per ciascuna caratteristica, prima dei bonus di razza.
func build_character(character_name: String, race_id: String, class_id: String, base_scores: Dictionary) -> Dictionary:
	var race: Dictionary = get_race(race_id)
	var cls: Dictionary = get_class_def(class_id)
	var fa: Dictionary = final_abilities(base_scores, race_id)
	var skills: PackedStringArray = PackedStringArray(cls.get("skills", []))
	if race.has("skill"):
		skills.append(String(race["skill"]))
	return {
		"id": "pc-" + str(Time.get_ticks_usec()),
		"name": character_name,
		"raceId": race_id, "raceName": String(race.get("name", "")),
		"classId": class_id, "className": String(cls.get("name", "")),
		"finalAbilities": fa,
		"saves": cls.get("saves", []),
		"skills": skills,
		"maxHp": compute_hp(fa, cls),
		"ac": compute_ac(fa, cls.get("equip", [])),
		"speed": float(race.get("speed", 9.0)),
		"hitDie": int(cls.get("hitDie", 8)),
		"equip": cls.get("equip", []),
		"spellcaster": bool(cls.get("spellcaster", false)),
		"spells": cls.get("spells", []),
		"slots": cls.get("slots", {}),
	}


## Converte un "progetto" (da build_character) in un CharacterData pronto per il roster.
func build_to_character_data(build: Dictionary) -> CharacterData:
	var c := CharacterData.new()
	c.id = String(build["id"])
	c.character_name = String(build["name"])
	c.class_name_label = String(build["className"])
	c.ancestry = String(build["raceName"])
	c.level = 1
	c.proficiency_bonus = 2
	var fa: Dictionary = build["finalAbilities"]
	for key: String in ABILITY_KEYS:
		c.ability_scores[key] = int(fa.get(key, 10))
	var saves: Array = build.get("saves", [])
	for key: String in ABILITY_KEYS:
		c.saving_throw_proficient[key] = saves.has(key)
	var skills: Array = Array(build.get("skills", []))
	for skill_key: String in c.skills.keys():
		c.skills[skill_key]["proficient"] = skills.has(skill_key)
	c.hp_max = int(build["maxHp"])
	c.hp_current = c.hp_max
	c.armor_class = int(build["ac"])
	c.speed_meters = float(build["speed"])
	c.hit_dice_formula = "1d%d" % int(build["hitDie"])
	c.hit_dice_total = 1
	c.hit_dice_remaining = 1
	return c


## Installa l'intero party costruito nel gioco: sostituisce il roster in CharacterManager, applica
## SUBITO il kit del PRIMO personaggio in InventoryManager, e mette in "attesa" quello degli altri
## (si materializza al loro turno hotseat, stesso comportamento lazy del monolite: js/17 costruisce
## il kit dal record "build" solo la prima volta che un PG senza inventario salvato diventa attivo).
func start_new_game(builds: Array[Dictionary]) -> Array[CharacterData]:
	var party: Array[CharacterData] = []
	for build: Dictionary in builds:
		party.append(build_to_character_data(build))
	InventoryManager.reset_snapshots()
	CharacterManager.set_party(party)
	if party.is_empty():
		return party
	InventoryManager.apply_kit(Array(builds[0].get("equip", [])))
	if bool(builds[0].get("spellcaster", false)):
		InventoryManager.apply_spellbook(Array(builds[0].get("spells", [])), builds[0].get("slots", {}))
	InventoryManager.set_current_owner(party[0].id)
	for i: int in range(1, builds.size()):
		InventoryManager.stage_kit_for_character(
			party[i].id, Array(builds[i].get("equip", [])),
			Array(builds[i].get("spells", [])), builds[i].get("slots", {}))
	return party


## Nome suggerito casuale (porting di suggestName).
func suggest_name() -> String:
	var names: PackedStringArray = [
		"Aldric", "Brunilde", "Cael", "Dahlia", "Eldon", "Fiora", "Garrik", "Isolde",
		"Joran", "Lyra", "Magnus", "Nyx", "Orin", "Selene", "Thane", "Vesper",
	]
	return names[randi() % names.size()]
