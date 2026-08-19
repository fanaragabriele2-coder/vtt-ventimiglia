extends Node
## CampaignMemory (Autoload) — porting-lite dei Moduli 29/32 JS: il DIARIO DI CAMPAGNA del
## Master IA.
##
## Lo storico breve della conversazione (AIBridge._history) scorre via in fretta: qui si registrano
## SOLO gli eventi chiave della campagna — vittorie e sconfitte, level-up, viaggi, discese nei
## dungeon — e AIBridge li inietta nel system prompt a ogni chiamata. Cosi' il Master "ricorda"
## che cosa e' successo anche a distanza di ore di gioco, senza trascinarsi dietro tutta la chat.
##
## SEPARATO PER CAMPAGNA: un diario per id (CampaignDirector.imposta_campagna chiama
## imposta_campagna qui) — passare da Ventimiglia alla Terra di Mezzo non deve far raccontare
## al Master eventi dell'altro mondo. Alimentato dai signal dei manager (nessun polling, nessuna
## dipendenza inversa); persistito nel salvataggio da SaveManager (tutti i diari insieme).

const MASSIMO_EVENTI: int = 40
const CAMPAGNA_DEFAULT: String = "ventimiglia"

var _campagna_attiva: String = CAMPAGNA_DEFAULT
var _diari: Dictionary = {}   # campagna_id -> Array[String]


func _ready() -> void:
	CombatManager.victory.connect(_on_victory)
	CombatManager.party_wiped.connect(_on_party_wiped)
	ProgressionManager.leveled_up.connect(_on_leveled_up)
	GameState.party_location_changed.connect(_on_party_moved)
	EventBus.dungeon_generated.connect(_on_dungeon_generated)


## Cambia il diario attivo (chiamato da CampaignDirector.imposta_campagna): da qui in poi
## registra()/contesto_testo() leggono/scrivono SOLO nel diario di questa campagna.
func imposta_campagna(id: String) -> void:
	_campagna_attiva = id if not id.is_empty() else CAMPAGNA_DEFAULT
	if not _diari.has(_campagna_attiva):
		_diari[_campagna_attiva] = [] as Array[String]


func _eventi_attivi() -> Array:
	if not _diari.has(_campagna_attiva):
		_diari[_campagna_attiva] = [] as Array[String]
	return _diari[_campagna_attiva]


## Aggiunge un evento al diario della campagna ATTIVA (anche a mano: missioni, colpi di scena
## decisi dal Master umano).
func registra(evento: String) -> void:
	var testo: String = evento.strip_edges()
	if testo.is_empty():
		return
	var eventi: Array = _eventi_attivi()
	eventi.append(testo)
	if eventi.size() > MASSIMO_EVENTI:
		_diari[_campagna_attiva] = eventi.slice(eventi.size() - MASSIMO_EVENTI)


## Il diario della campagna ATTIVA in forma di testo per il system prompt del Master IA.
func contesto_testo() -> String:
	var eventi: Array = _eventi_attivi()
	if eventi.is_empty():
		return "- (la campagna e' appena iniziata: nessun evento registrato)"
	var righe: PackedStringArray = []
	for e: Variant in eventi:
		righe.append("- " + String(e))
	return "\n".join(righe)


## Tutti i diari (una chiave per campagna), per il salvataggio.
func get_save_state() -> Dictionary:
	var out: Dictionary = {}
	for id: String in _diari.keys():
		out[id] = (_diari[id] as Array).duplicate()
	return out


## Retrocompatibile: un vecchio salvataggio con un Array piatto (diario unico pre-multi-campagna)
## diventa il diario di CAMPAGNA_DEFAULT; un salvataggio nuovo (Dictionary id -> eventi) si
## ripristina cosi' com'e'.
func hydrate_save_state(stato: Variant) -> void:
	_diari.clear()
	if stato is Dictionary:
		for id: String in (stato as Dictionary).keys():
			var lista: Array[String] = []
			for e: Variant in (stato as Dictionary)[id]:
				if e is String:
					lista.append(e)
			_diari[id] = lista
	elif stato is Array:
		var lista: Array[String] = []
		for e: Variant in stato:
			if e is String:
				lista.append(e)
		_diari[CAMPAGNA_DEFAULT] = lista


func reset() -> void:
	_diari[_campagna_attiva] = [] as Array[String]


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
