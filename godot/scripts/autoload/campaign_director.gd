extends Node
## CampaignDirector (Autoload) — il REGISTA della campagna demo "L'Ombra sul Confine".
##
## Legge data/campagna_ventimiglia.json (capitoli con luogo, lore, incontro, ricompensa) e
## conduce il party lungo l'arco: ogni capitolo si INNESCA quando il party ARRIVA nel luogo
## giusto del Mondo cucito — trascinando i token vicino all'etichetta, o lasciando che il
## Master IA li muova narrando (evento "world:luogo" pubblicato dal WorldBuilder; funzionano
## anche gli arrivi ai POI dell'overworld, per campagne future su Ventimiglia).
##
## All'innesco: lore in chat (e nella memoria di campagna), poi
## - se il capitolo ha un incontro -> lo spawna BILANCIATO sul party reale (EncounterBalancer)
##   e aspetta CombatManager.victory; alla vittoria: ricompensa e capitolo successivo;
##   in caso di TPK il capitolo resta li': si torna sul luogo e si riprova;
## - senza incontro -> ricompensa e avanzamento immediati.
## Le ricompense passano dalla STESSA pipeline del loot (ProgressionManager.collect_loot:
## oggetti items/armeria + oro, annuncio incluso). Il progresso vive in user://campagna.json.

const CAMPAGNA_PATH: String = "res://data/campagna_ventimiglia.json"
const SALVATAGGIO: String = "user://campagna.json"

var _dati: Dictionary = {}
var _capitoli: Array = []
var _indice: int = 0
var _in_scontro: bool = false


func _ready() -> void:
	if not FileAccess.file_exists(CAMPAGNA_PATH):
		push_warning("CampaignDirector: campagna non trovata: " + CAMPAGNA_PATH)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CAMPAGNA_PATH))
	if parsed is not Dictionary:
		push_warning("CampaignDirector: campagna illeggibile")
		return
	_dati = parsed
	_capitoli = _dati.get("capitoli", [])
	_carica_progresso()
	GameState.event_published.connect(_su_evento)
	GameState.party_location_changed.connect(_su_poi)
	CombatManager.victory.connect(_su_vittoria)
	CombatManager.party_wiped.connect(_su_sconfitta)
	# L'annuncio d'apertura arriva DOPO che la UI e' in piedi (deferred: la chat deve esistere).
	_annuncia_stato.call_deferred()


## Stato leggibile (per pannelli Master/debug): capitolo corrente e a che punto siamo.
func stato() -> Dictionary:
	return {
		"titolo": String(_dati.get("titolo", "")),
		"capitolo": _indice,
		"totale": _capitoli.size(),
		"finita": finita(),
		"in_scontro": _in_scontro,
		"obiettivo": obiettivo_corrente(),
	}


func finita() -> bool:
	return _indice >= _capitoli.size()


func obiettivo_corrente() -> String:
	if finita():
		return ""
	return String((_capitoli[_indice] as Dictionary).get("obiettivo", ""))


## Riparte dal prologo (per rigiocarla): azzera progresso e stato scontro.
func reset_campagna() -> void:
	_indice = 0
	_in_scontro = false
	_salva_progresso()
	_annuncia_stato()


func _su_evento(event_name: String, payload: Variant) -> void:
	if event_name == "world:luogo" and payload is Dictionary:
		_prova_arrivo(String((payload as Dictionary).get("name", "")))


func _su_poi(location: Dictionary) -> void:
	_prova_arrivo(String(location.get("name", "")))


## Il party e' arrivato in un luogo: e' quello del capitolo corrente? (confronto normalizzato,
## esatto o contenimento — "guado" innesca "Il Guado").
func _prova_arrivo(nome_luogo: String) -> void:
	if finita() or _in_scontro or nome_luogo.strip_edges().is_empty():
		return
	var capitolo: Dictionary = _capitoli[_indice]
	var atteso: String = String(capitolo.get("luogo", "")).to_lower().strip_edges()
	var arrivato: String = nome_luogo.to_lower().strip_edges()
	if atteso.is_empty():
		return
	if arrivato != atteso and not arrivato.contains(atteso) and not atteso.contains(arrivato):
		return
	_innesca(capitolo)


func _innesca(capitolo: Dictionary) -> void:
	var titolo: String = String(capitolo.get("titolo", ""))
	GameState.announce("🏰 %s\n%s" % [titolo, String(capitolo.get("arrivo", ""))])
	CampaignMemory.registra("Campagna: " + titolo)
	var incontro: Array = capitolo.get("incontro", [])
	if incontro.is_empty():
		_completa(capitolo)
		return
	_in_scontro = true
	EncounterBalancer.spawn_bilanciato(incontro, String(capitolo.get("intensita", "equo")))


func _su_vittoria() -> void:
	if not _in_scontro or finita():
		return
	_in_scontro = false
	_completa(_capitoli[_indice])


func _su_sconfitta() -> void:
	if not _in_scontro:
		return
	_in_scontro = false
	GameState.announce("🏰 Il confine non perdona... ma la storia non e' finita: rimettetevi "
		+ "in forze e tornate sul luogo per riprovarci.")


func _completa(capitolo: Dictionary) -> void:
	var ricompensa: Dictionary = capitolo.get("ricompensa", {})
	if not ricompensa.is_empty():
		ProgressionManager.collect_loot({
			"items": ricompensa.get("items", []),
			"gold": int(ricompensa.get("gold", 0)),
			"enemyName": String(capitolo.get("titolo", "Ricompensa")),
		})
	CampaignMemory.registra("Campagna: completato " + String(capitolo.get("titolo", "")))
	_indice += 1
	_salva_progresso()
	_annuncia_stato()


## Dice al tavolo dove siamo: prossimo obiettivo, o epilogo se la campagna e' conclusa.
func _annuncia_stato() -> void:
	if _capitoli.is_empty():
		return
	if finita():
		GameState.announce("🏰 %s — EPILOGO\n%s" % [
			String(_dati.get("titolo", "")), String(_dati.get("epilogo", "")),
		])
		return
	if _indice == 0:
		GameState.announce("🏰 CAMPAGNA: %s\n%s" % [
			String(_dati.get("titolo", "")), String(_dati.get("introduzione", "")),
		])
	else:
		GameState.announce("🏰 Nuovo obiettivo: " + obiettivo_corrente())


func _salva_progresso() -> void:
	var file: FileAccess = FileAccess.open(SALVATAGGIO, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify({ "indice": _indice }))


func _carica_progresso() -> void:
	if not FileAccess.file_exists(SALVATAGGIO):
		return
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(SALVATAGGIO))
	if dati is Dictionary:
		_indice = clampi(int((dati as Dictionary).get("indice", 0)), 0, _capitoli.size())
