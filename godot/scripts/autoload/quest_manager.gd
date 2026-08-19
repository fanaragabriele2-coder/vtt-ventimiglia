extends Node
## QuestManager (Autoload) — le MISSIONI degli NPC del mondo.
##
## Carica le quest della campagna attiva (data/quest_<campagna>.json): ogni NPC vive in un LUOGO
## della mappa (marker "!" accanto al nome, layer WorldNpcs) e offre una missione con ricompensa
## vera (oggetti + oro via ProgressionManager.collect_loot, piu' XP).
##
## Stati di una quest: disponibile -> attiva -> completata -> riscossa.
## - tipo "caccia": abbatti N nemici di un catalogId — il conteggio corre DA SOLO ascoltando
##   CombatManager.combatant_defeated (contano solo i nemici giusti, a quest attiva);
## - tipo "visita": raggiungi un luogo — scatta sull'evento world:luogo.
## Completata la missione si TORNA dall'NPC a riscuotere (QuestPanel, da vicino). Il progresso
## e' persistente per campagna (user://): le missioni sopravvivono alle sessioni.

signal quest_cambiata

const SALVATAGGIO: String = "user://quest_stato.json"

var _quests: Array[Dictionary] = []   # definizioni (dal JSON della campagna)
var _stati: Dictionary = {}           # quest_id -> { "stato": String, "progresso": int }


func _ready() -> void:
	_carica()
	CombatManager.combatant_defeated.connect(_su_nemico_abbattuto)
	GameState.event_published.connect(_su_evento)


## Le quest di un LUOGO (per il pannello dell'NPC), con stato e progresso gia' dentro.
func quest_a(luogo: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for q: Dictionary in _quests:
		if String(q.get("luogo", "")) == luogo:
			out.append(_con_stato(q))
	return out


## Tutte le quest note non ancora riscosse (per il registro missioni e per i marker).
func quest_correnti() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for q: Dictionary in _quests:
		out.append(_con_stato(q))
	return out


## C'e' qualcosa da fare in questo luogo? (marker "!" su WorldNpcs: disponibile o da riscuotere)
func luogo_ha_richiami(luogo: String) -> bool:
	for q: Dictionary in quest_a(luogo):
		var stato: String = String(q.get("stato", ""))
		if stato == "disponibile" or stato == "completata":
			return true
	return false


## Il giocatore accetta una missione dall'NPC.
func accetta(quest_id: String) -> void:
	var q: Dictionary = _definizione(quest_id)
	if q.is_empty() or String(_stato_di(quest_id).get("stato", "")) != "disponibile":
		return
	_stati[quest_id] = { "stato": "attiva", "progresso": 0 }
	GameState.announce("📜 Missione accettata: %s — %s" % [
		String(q.get("titolo", quest_id)), _obiettivo_testo(q),
	])
	TravelJournal.scrivi("Missione accettata da %s: %s." % [
		String(q.get("npc", "un viandante")), String(q.get("titolo", quest_id)),
	])
	quest_cambiata.emit()
	_salva()


## Riscuote la ricompensa di una quest completata (dall'NPC, da vicino): oggetti+oro+XP.
func riscuoti(quest_id: String) -> void:
	var q: Dictionary = _definizione(quest_id)
	if q.is_empty() or String(_stato_di(quest_id).get("stato", "")) != "completata":
		return
	_stati[quest_id]["stato"] = "riscossa"
	var premio: Dictionary = q.get("ricompensa", {})
	ProgressionManager.collect_loot({
		"items": premio.get("items", []), "gold": int(premio.get("gold", 0)),
		"enemyName": String(q.get("npc", "la missione")),
	})
	ProgressionManager.complete_quest(String(q.get("titolo", quest_id)), int(premio.get("xp", 100)))
	TravelJournal.scrivi("Missione compiuta e riscossa: %s." % String(q.get("titolo", quest_id)))
	quest_cambiata.emit()
	_salva()


# --- Avanzamento automatico ---

## Un nemico e' caduto: avanza tutte le quest di CACCIA attive su quel catalogId.
func _su_nemico_abbattuto(combatant_id: String, _source_id: String) -> void:
	var caduto: Dictionary = CombatManager.get_combatant(combatant_id)
	var catalogo: String = String(caduto.get("catalogId", ""))
	if catalogo.is_empty():
		return
	for q: Dictionary in _quests:
		if String(q.get("tipo", "")) != "caccia":
			continue
		var qid: String = String(q.get("id", ""))
		var stato: Dictionary = _stato_di(qid)
		if String(stato.get("stato", "")) != "attiva":
			continue
		if String(q.get("bersaglio", "")) != catalogo:
			continue
		var fatti: int = int(stato.get("progresso", 0)) + 1
		var servono: int = int(q.get("quanti", 1))
		_stati[qid]["progresso"] = fatti
		if fatti >= servono:
			_completa(q)
		else:
			GameState.announce("📜 %s: %d/%d abbattuti." % [
				String(q.get("titolo", qid)), fatti, servono,
			])
		quest_cambiata.emit()
		_salva()


func _su_evento(nome_evento: String, payload: Variant) -> void:
	if nome_evento == "campagna:cambiata":
		_carica()
		quest_cambiata.emit()
		return
	if nome_evento != "world:luogo" or not (payload is Dictionary):
		return
	var luogo: String = String((payload as Dictionary).get("name", ""))
	for q: Dictionary in _quests:
		if String(q.get("tipo", "")) != "visita":
			continue
		var qid: String = String(q.get("id", ""))
		if String(_stato_di(qid).get("stato", "")) != "attiva":
			continue
		if String(q.get("bersaglio", "")) == luogo:
			_completa(q)
			quest_cambiata.emit()
			_salva()


func _completa(q: Dictionary) -> void:
	var qid: String = String(q.get("id", ""))
	_stati[qid]["stato"] = "completata"
	GameState.announce("📜 MISSIONE COMPLETATA: %s! Torna da %s (%s) a riscuotere la ricompensa." % [
		String(q.get("titolo", qid)), String(q.get("npc", "l'NPC")), String(q.get("luogo", "")),
	])


# --- Dati, stato e persistenza ---

func _definizione(quest_id: String) -> Dictionary:
	for q: Dictionary in _quests:
		if String(q.get("id", "")) == quest_id:
			return q
	return {}


func _stato_di(quest_id: String) -> Dictionary:
	if not _stati.has(quest_id):
		_stati[quest_id] = { "stato": "disponibile", "progresso": 0 }
	return _stati[quest_id]


## Definizione + stato in un unico Dictionary comodo per la UI.
func _con_stato(q: Dictionary) -> Dictionary:
	var esteso: Dictionary = q.duplicate(true)
	var stato: Dictionary = _stato_di(String(q.get("id", "")))
	esteso["stato"] = String(stato.get("stato", "disponibile"))
	esteso["progresso"] = int(stato.get("progresso", 0))
	return esteso


func _obiettivo_testo(q: Dictionary) -> String:
	if String(q.get("tipo", "")) == "caccia":
		return "abbatti %d × %s" % [int(q.get("quanti", 1)), String(q.get("bersaglio", ""))]
	return "raggiungi %s" % String(q.get("bersaglio", ""))


func _salva() -> void:
	var tutto: Dictionary = _leggi_file()
	tutto[CampaignDirector.campagna_attuale_id()] = _stati
	var file: FileAccess = FileAccess.open(SALVATAGGIO, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(tutto))


func _carica() -> void:
	_quests.clear()
	var percorso: String = "res://data/quest_%s.json" % CampaignDirector.campagna_attuale_id()
	if FileAccess.file_exists(percorso):
		var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(percorso))
		if dati is Dictionary:
			for q: Variant in (dati as Dictionary).get("quests", []):
				if q is Dictionary:
					_quests.append(q)
	var salvati: Variant = _leggi_file().get(CampaignDirector.campagna_attuale_id(), {})
	_stati = salvati if salvati is Dictionary else {}


func _leggi_file() -> Dictionary:
	if not FileAccess.file_exists(SALVATAGGIO):
		return {}
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(SALVATAGGIO))
	return dati if dati is Dictionary else {}
