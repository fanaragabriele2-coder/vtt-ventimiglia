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


## La targhetta della partita per il pannello degli slot: campagna e party a colpo d'occhio.
func _riassunto_partita() -> Dictionary:
	var eroi: PackedStringArray = []
	for pg: CharacterData in CharacterManager.get_party():
		eroi.append("%s L%d" % [pg.character_name, pg.level])
	return {
		"campagna": CampaignDirector.campagna_attuale_id(),
		"party": " · ".join(eroi) if not eroi.is_empty() else "nessun eroe",
	}


## I metadati di uno slot per la schermata di caricamento, senza toccare il gioco:
## { "esiste": bool, "salvatoIl": String, "campagna": String, "party": String }.
func slot_info(slot_name: String) -> Dictionary:
	var path: String = _slot_path(slot_name)
	if not FileAccess.file_exists(path):
		return { "esiste": false }
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		return { "esiste": false }
	var r: Dictionary = (parsed as Dictionary).get("riassunto", {})
	return {
		"esiste": true,
		"salvatoIl": String((parsed as Dictionary).get("savedAt", "?")),
		"campagna": String(r.get("campagna", "?")),
		"party": String(r.get("party", "?")),
	}


## Cancella uno slot dal disco (il pannello chiede conferma prima).
func delete_slot(slot_name: String) -> bool:
	var path: String = _slot_path(slot_name)
	if not FileAccess.file_exists(path):
		return false
	return DirAccess.remove_absolute(path) == OK


func save_game(slot_name: String = DEFAULT_SLOT) -> bool:
	# Il dungeon Nexus si salva "seme+delta": il MapManager pubblica il suo stato minimo in
	# GameState (chiave "nexus.save") a ogni movimento — qui lo si raccoglie senza conoscerlo.
	var nexus_stato: Variant = GameState.get_value("nexus.save")
	var state: Dictionary = {
		"savedAt": Time.get_datetime_string_from_system(),
		"riassunto": _riassunto_partita(),
		"character": CharacterManager.serialize_party(),
		"inventory": InventoryManager.get_save_state(),
		"progression": ProgressionManager.get_save_state(),
		"partyLocation": GameState.get_party_location(),
		"nexus": nexus_stato if nexus_stato is Dictionary else {},
		"campaignMemory": CampaignMemory.get_save_state(),
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
	CampaignMemory.hydrate_save_state(state.get("campaignMemory", []))
	CharacterManager.hydrate_party(state.get("character", {}))
	var location: Variant = state.get("partyLocation")
	if location is Dictionary and location.has("name"):
		GameState.set_party_location(location)
	# Ripristino del dungeon Nexus (se il salvataggio ne ha uno): l'evento lo raccoglie la vista,
	# che rigenera dal seme e riapplica i delta (fog, livello, posizione del party).
	var nexus_stato: Variant = state.get("nexus")
	if nexus_stato is Dictionary and not (nexus_stato as Dictionary).is_empty():
		GameState.set_value("nexus.save", nexus_stato)
		GameState.publish("nexus:restore", nexus_stato)
	GameState.announce("📂 Partita caricata (" + slot_name + ").")
	game_loaded.emit(slot_name)
	return true
