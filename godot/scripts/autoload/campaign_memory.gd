extends Node
## CampaignMemory (Autoload) — porting-lite dei Moduli 29/32 JS: il DIARIO DI CAMPAGNA del Master IA.
##
## Lo storico breve della conversazione (AIBridge._history) scorre via in fretta: qui si registrano
## SOLO gli eventi chiave della campagna — vittorie e sconfitte, level-up, viaggi, discese nei
## dungeon — e AIBridge li inietta nel system prompt a ogni chiamata. Cosi' il Master "ricorda"
## che cosa e' successo anche a distanza di ore di gioco, senza trascinarsi dietro tutta la chat.
##
## Alimentato dai signal dei manager (nessun polling, nessuna dipendenza inversa); persistito nel
## salvataggio da SaveManager.

const MASSIMO_EVENTI: int = 40

var _eventi: Array[String] = []


func _ready() -> void:
	CombatManager.victory.connect(_on_victory)
	CombatManager.party_wiped.connect(_on_party_wiped)
	ProgressionManager.leveled_up.connect(_on_leveled_up)
	GameState.party_location_changed.connect(_on_party_moved)
	EventBus.dungeon_generated.connect(_on_dungeon_generated)


## Aggiunge un evento al diario (anche a mano: missioni, colpi di scena decisi dal Master umano).
func registra(evento: String) -> void:
	var testo: String = evento.strip_edges()
	if testo.is_empty():
		return
	_eventi.append(testo)
	if _eventi.size() > MASSIMO_EVENTI:
		_eventi = _eventi.slice(_eventi.size() - MASSIMO_EVENTI)


## Il diario in forma di testo per il system prompt del Master IA.
func contesto_testo() -> String:
	if _eventi.is_empty():
		return "- (la campagna e' appena iniziata: nessun evento registrato)"
	var righe: PackedStringArray = []
	for e: String in _eventi:
		righe.append("- " + e)
	return "\n".join(righe)


func get_save_state() -> Array:
	return _eventi.duplicate()


func hydrate_save_state(eventi: Array) -> void:
	_eventi.clear()
	for e: Variant in eventi:
		if e is String:
			_eventi.append(e)


func reset() -> void:
	_eventi.clear()


# --- Ascoltatori degli eventi chiave ---

func _on_victory() -> void:
	registra("Il party ha vinto uno scontro.")


func _on_party_wiped() -> void:
	registra("Il party e' stato sconfitto in combattimento (TPK).")


func _on_leveled_up(character_id: String, _from_level: int, to_level: int, _hp_gain: int) -> void:
	var c: CharacterData = CharacterManager.get_character_by_id(character_id)
	if c:
		registra("%s e' salito al livello %d." % [c.character_name, to_level])


func _on_party_moved(location: Dictionary) -> void:
	var nome: String = String(location.get("name", ""))
	if not nome.is_empty():
		registra("Il party ha raggiunto " + nome + ".")


func _on_dungeon_generated(tema: String, _dati: Dictionary) -> void:
	registra("Il party e' entrato in un dungeon (%s)." % tema)
