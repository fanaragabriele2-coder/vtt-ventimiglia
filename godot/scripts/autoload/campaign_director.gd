extends Node
## CampaignDirector (Autoload) — il REGISTA delle campagne giocabili.
##
## Legge un file campagna (capitoli con luogo, lore, incontro, ricompensa) e conduce il party
## lungo l'arco: ogni capitolo si INNESCA quando il party ARRIVA nel luogo giusto del Mondo
## cucito — trascinando i token vicino all'etichetta, o lasciando che il Master IA li muova
## narrando (evento "world:luogo" pubblicato dal WorldBuilder; funzionano anche gli arrivi ai
## POI dell'overworld).
##
## MULTI-CAMPAGNA: CAMPAGNE elenca le campagne disponibili (id, titolo, file dati, Set di mappe
## associato). imposta_campagna(id) cambia campagna a runtime: ricarica i capitoli, azzera
## l'indice (ogni campagna ha il proprio salvataggio user://campagna_<id>.json) e pubblica
## "campagna:cambiata" cosi' la UI del Mondo cucito puo' cambiare Set in automatico.
##
## All'innesco: lore in chat (e nella memoria di campagna), poi
## - se il capitolo ha un incontro -> lo spawna BILANCIATO sul party reale (EncounterBalancer)
##   e aspetta CombatManager.victory; alla vittoria: ricompensa e capitolo successivo;
##   in caso di TPK il capitolo resta li': si torna sul luogo e si riprova;
## - senza incontro -> ricompensa e avanzamento immediati.
## Le ricompense passano dalla STESSA pipeline del loot (ProgressionManager.collect_loot:
## oggetti items/armeria + oro, annuncio incluso).

## Campagne selezionabili: id (per il salvataggio), titolo/descrizione per la UI (schermata di
## scelta pre-personaggio compresa), file dati, cartella del Set di mappe da attivare quando
## questa campagna diventa quella attiva ("" = Mondo cucito). "ambientazione" e "bestiario" sono
## per il Master IA (AIBridge/ChatCombatBridge): la prima entra nel system prompt al posto del
## vecchio "ambientata a Ventimiglia" fisso, il secondo e' il tag "set" di data/monsters.json che
## filtra quali mostri il Master puo' proporre/riconoscere per QUESTA campagna.
const CAMPAGNE: Array[Dictionary] = [
	# La Terra di Mezzo e' PRIMA: e' la campagna di default all'avvio — il Mondo cucito parte
	# gia' come mappa interattiva del Signore degli Anelli (la scelta resta comunque all'utente
	# nella schermata iniziale).
	{
		"id": "terra_di_mezzo", "titolo": "🧙 L'Ultima Alleanza si Spezza",
		"descrizione": "La Guerra dell'Anello: da Brea al Guado di Bruinen, da Moria ai Campi "
			+ "del Pelennor, fino ai Cancelli Neri. Nazgul, Balrog, Shelob e il Re Stregone.",
		"ambientazione": "la Terra di Mezzo de Il Signore degli Anelli, durante la Guerra "
			+ "dell'Anello: da Brea al Guado di Bruinen, da Moria ai Campi del Pelennor, fino"
			+ " ai Cancelli Neri di Mordor.",
		"bestiario": "terra_di_mezzo",
		"path": "res://data/campagna_terra_di_mezzo.json",
		"cartella": "res://assets/maps_terra_di_mezzo",
	},
	{
		"id": "ventimiglia", "titolo": "🏰 L'Ombra sul Confine",
		"descrizione": "Ventimiglia e il suo confine: sparizioni notturne, un culto sepolto "
			+ "nella Palude Grigia. Ambientazione originale, il Master conosce ogni luogo a memoria.",
		"ambientazione": "Ventimiglia (Liguria) e il suo confine: una D&D 5e ambientata li',"
			+ " con un culto antico sepolto nella Palude Grigia.",
		"bestiario": "ventimiglia",
		"path": "res://data/campagna_ventimiglia.json", "cartella": "",
	},
]

var _campagna_id: String = ""
var _dati: Dictionary = {}
var _capitoli: Array = []
var _indice: int = 0
var _in_scontro: bool = false


func _ready() -> void:
	GameState.event_published.connect(_su_evento)
	GameState.party_location_changed.connect(_su_poi)
	CombatManager.victory.connect(_su_vittoria)
	CombatManager.party_wiped.connect(_su_sconfitta)
	imposta_campagna(String(CAMPAGNE[0]["id"]), false)


## Elenco delle campagne disponibili, per popolare un selettore in UI.
func campagne_disponibili() -> Array[Dictionary]:
	return CAMPAGNE


## Id della campagna attualmente attiva ("" se nessuna caricata).
func campagna_attuale_id() -> String:
	return _campagna_id


## La voce di CAMPAGNE della campagna attiva ({} se _campagna_id non corrisponde a nessuna —
## non dovrebbe succedere dopo _ready, ma i chiamanti restano difensivi).
func campagna_attuale() -> Dictionary:
	for c: Dictionary in CAMPAGNE:
		if String(c["id"]) == _campagna_id:
			return c
	return {}


## Ambientazione in prosa della campagna attiva, per il system prompt del Master IA
## (AIBridge): sostituisce il vecchio "ambientata a Ventimiglia" fisso.
func ambientazione_attuale() -> String:
	return String(campagna_attuale().get("ambientazione", "un mondo fantasy D&D 5e"))


## Tag "set" di data/monsters.json per la campagna attiva: filtra quali mostri il Master IA
## puo' proporre/riconoscere (AIBridge/ChatCombatBridge).
func bestiario_attuale() -> String:
	return String(campagna_attuale().get("bestiario", "ventimiglia"))


## Cambia la campagna attiva: ricarica i capitoli dal suo file dati, azzera lo scontro in corso
## e carica il progresso SEPARATO di quella campagna. Pubblica "campagna:cambiata" (payload:
## { id, titolo, cartella }) cosi' la vista del Mondo cucito puo' allineare il Set di mappe.
## `annuncia`=false all'avvio (la chat non esiste ancora: l'annuncio arriva deferred da _ready).
func imposta_campagna(id: String, annuncia: bool = true) -> bool:
	var voce: Dictionary = {}
	for c: Dictionary in CAMPAGNE:
		if String(c["id"]) == id:
			voce = c
			break
	if voce.is_empty():
		push_warning("CampaignDirector: campagna sconosciuta: " + id)
		return false
	var percorso: String = String(voce["path"])
	if not FileAccess.file_exists(percorso):
		push_warning("CampaignDirector: campagna non trovata: " + percorso)
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(percorso))
	if parsed is not Dictionary:
		push_warning("CampaignDirector: campagna illeggibile: " + percorso)
		return false
	_campagna_id = id
	_dati = parsed
	_capitoli = _dati.get("capitoli", [])
	_indice = 0
	_in_scontro = false
	_carica_progresso()
	# Il diario di campagna (contesto del Master IA) e' SEPARATO per campagna: passare da
	# Ventimiglia alla Terra di Mezzo non deve far raccontare al Master eventi dell'altro mondo.
	CampaignMemory.imposta_campagna(id)
	GameState.publish("campagna:cambiata", {
		"id": id, "titolo": String(voce["titolo"]), "cartella": String(voce.get("cartella", "")),
	})
	if annuncia:
		_annuncia_stato()
	else:
		# L'annuncio d'apertura arriva DOPO che la UI e' in piedi (deferred: la chat deve esistere).
		_annuncia_stato.call_deferred()
	return true


## Stato leggibile (per pannelli Master/debug): capitolo corrente e a che punto siamo.
func stato() -> Dictionary:
	return {
		"campagna": _campagna_id,
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


## Salvataggio SEPARATO per campagna: passare da un arco all'altro non tocca il progresso
## dell'altro (si puo' giocare Ventimiglia e Terra di Mezzo in parallelo, ognuna al suo punto).
func _percorso_salvataggio() -> String:
	return "user://campagna_%s.json" % (_campagna_id if not _campagna_id.is_empty() else "default")


func _salva_progresso() -> void:
	var file: FileAccess = FileAccess.open(_percorso_salvataggio(), FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify({ "indice": _indice }))


func _carica_progresso() -> void:
	var percorso: String = _percorso_salvataggio()
	if not FileAccess.file_exists(percorso):
		return
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(percorso))
	if dati is Dictionary:
		_indice = clampi(int((dati as Dictionary).get("indice", 0)), 0, _capitoli.size())
