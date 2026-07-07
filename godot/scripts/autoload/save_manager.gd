extends Node
## SaveManager (Autoload singleton) — salvataggio/caricamento partita.
##
## Gap che il monolite JS non aveva risolto e che Godot non aveva affatto: senza questo, chiudere il
## gioco perdeva TUTTO — party, inventario per-PG, progressione, posizione sull'overworld. Un solo
## slot su disco per semplicita' (nessun networking coinvolto: e' un salvataggio locale in
## user://saves/), in JSON leggibile per debug.
##
## NON salva lo stato di un combattimento in corso (posizioni sulla griglia, nemici attivi,
## condizioni/superfici/elevazione dipinte): sono transitori per design. Caricare una partita mentre
## si e' in combattimento interrompe lo scontro, esattamente come uscire e rientrare in molti giochi.
##
## Registrazione: Project Settings > Autoload -> "SaveManager" (per ultimo, dopo AIBridge: orchestra
## gli altri manager ma non e' letto da nessuno al loro _ready()).

signal game_saved(slot_name: String)
signal game_loaded(slot_name: String)
signal load_failed(message: String)

const SAVE_DIR: String = "user://saves"
const DEFAULT_SLOT: String = "partita"


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)


func _slot_path(slot_name: String) -> String:
	return "%s/%s.json" % [SAVE_DIR, slot_name]


func has_save(slot_name: String = DEFAULT_SLOT) -> bool:
	return FileAccess.file_exists(_slot_path(slot_name))


## Elenca gli slot di salvataggio presenti su disco (nomi senza estensione), in ordine alfabetico.
func list_slots() -> Array[String]:
	var out: Array[String] = []
	var dir: DirAccess = DirAccess.open(SAVE_DIR)
	if dir == null:
		return out
	dir.list_dir_begin()
	var file_name: String = dir.get_next()
	while file_name != "":
		if file_name.ends_with(".json"):
			out.append(file_name.get_basename())
		file_name = dir.get_next()
	dir.list_dir_end()
	out.sort()
	return out


func save_game(slot_name: String = DEFAULT_SLOT) -> bool:
	var state: Dictionary = {
		"savedAt": Time.get_datetime_string_from_system(),
		"character": CharacterManager.serialize_party(),
		"inventory": InventoryManager.get_save_state(),
		"progression": ProgressionManager.get_save_state(),
		"partyLocation": GameState.get_party_location(),
	}
	var f: FileAccess = FileAccess.open(_slot_path(slot_name), FileAccess.WRITE)
	if f == null:
		GameState.announce("⚠ Salvataggio fallito: impossibile scrivere su disco.")
		return false
	f.store_string(JSON.stringify(state))
	f.close()
	GameState.announce("💾 Partita salvata (" + slot_name + ").")
	game_saved.emit(slot_name)
	return true


func load_game(slot_name: String = DEFAULT_SLOT) -> bool:
	var path: String = _slot_path(slot_name)
	if not FileAccess.file_exists(path):
		load_failed.emit("Nessun salvataggio trovato (" + slot_name + ").")
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		load_failed.emit("Il file di salvataggio e' danneggiato o illeggibile.")
		return false
	var state: Dictionary = parsed
	if CombatManager.is_active():
		CombatManager.end_combat()
	# Ordine importante: la progressione e l'inventario vanno ripristinati PRIMA di
	# CharacterManager.hydrate_party, perche' e' quello a emettere party_changed/character_changed
	# — i pannelli UI che reagiscono a quei signal (barra XP, scheda PG) devono gia' trovare i dati
	# corretti quando si ridisegnano, non i valori di default di una sessione nuova.
	ProgressionManager.hydrate_save_state(state.get("progression", {}))
	InventoryManager.hydrate_save_state(state.get("inventory", {}))
	CharacterManager.hydrate_party(state.get("character", {}))
	var location: Variant = state.get("partyLocation")
	if location is Dictionary and location.has("name"):
		GameState.set_party_location(location)
	GameState.announce("📂 Partita caricata (" + slot_name + ").")
	game_loaded.emit(slot_name)
	return true
