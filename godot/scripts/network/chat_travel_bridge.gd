extends Node
## ChatTravelBridge (Autoload) — lato MAPPA del Modulo 39 JS (narrazione -> spostamento).
##
## Gemello di ChatCombatBridge, ma per l'overworld: se il Master IA NARRA uno spostamento ("vi
## incamminate verso il porto") senza emettere il comando strutturato, il party si muove DAVVERO
## sull'overworld di Ventimiglia. La posizione vive in un'unica fonte di verita' (GameState,
## chiave "party.location"): OverworldMap, HUD, memoria di campagna e il prossimo prompt del Master
## la leggono tutti da li' — questo modulo la aggiorna, non tiene stato proprio.
##
## Fonte unica anche del "come si risolve un nome di luogo": sia la prosa (questo bridge) sia il
## comando strutturato moveTo del Master (AIBridge._dispatch_command) passano per viaggia_a_nome(),
## cosi' non esistono due tabelle di POI che possono divergere.

const POIS_PATH: String = "res://data/ventimiglia_pois.json"
const COMANDI_VIAGGIO: Array[String] = ["moveTo", "travelTo", "moveParty"]

## Verbi/locuzioni che segnalano uno SPOSTAMENTO in corso (non la semplice menzione di un luogo:
## "il porto e' in fiamme" non deve teletrasportare il party al porto).
const PAROLE_VIAGGIO: String = (
	"(?i)(vi dirigete|vi incamminate|vi avviate|vi recate|vi spostate|vi muovete|vi portate|"
	+ "vi inoltrate|vi addentrate|raggiungete|giungete|arrivate|approdate|entrate|proseguite|"
	+ "puntate|fate rotta|vi ritrovate|vi trovate ora|marciate|camminate verso|salite verso|"
	+ "scendete verso|tornate)"
)

# Frasi-innesco per ogni POI (in aggiunta al nome completo, aggiunto in _ready). Normalizzate come
# il testo in ingresso: minuscolo, senza accenti, punteggiatura/apostrofi -> spazio. La ricerca usa
# il match PIU' LUNGO, cosi' "ponte sul roya" vince su "ponte".
const ALIAS: Dictionary = {
	"Città Alta": ["citta alta", "citta vecchia", "centro storico", "borgo alto"],
	"Cattedrale Assunta": ["cattedrale dell assunta", "duomo", "assunta"],
	"Cattedrale S.Michele": ["san michele", "chiesa di san michele", "concattedrale"],
	"Porta Canarda": ["porta canarda", "canarda"],
	"Porta Nino Lamboglia": ["porta nino lamboglia", "porta nino", "lamboglia"],
	"Teatro Romano": ["teatro romano", "anfiteatro", "teatro"],
	"Piazza Repubblica": ["piazza della repubblica", "piazza repubblica"],
	"Piazza C. Battisti": ["piazza cesare battisti", "piazza battisti"],
	"Mercato Settimanale": ["mercato settimanale", "mercato", "bancarelle"],
	"Ospedale": ["ospedale", "nosocomio", "infermeria"],
	"Biblioteca": ["biblioteca", "archivio"],
	"Municipio": ["municipio", "comune", "palazzo comunale"],
	"Stazione FS": ["stazione ferroviaria", "stazione dei treni", "stazione"],
	"Porto Turistico": ["porto turistico", "porticciolo", "porto", "marina", "banchina", "moli"],
	"Confine Italia-FR": ["confine italia", "confine francese", "frontiera", "dogana", "confine"],
	"Ponte sul Roya": ["ponte sul roya", "ponte del roya"],
	"Lungomare": ["lungomare", "passeggiata a mare", "vialone a mare"],
	"Balzi Rossi": ["balzi rossi", "grotte dei balzi rossi", "caverne dei balzi"],
	"Giardini Hanbury": ["giardini hanbury", "giardini botanici", "hanbury"],
	"Capo Mortola": ["capo mortola", "mortola", "promontorio"],
	"Foce del Roya": ["foce del roya", "foce", "estuario"],
	"Forte dell'Annunziata": ["forte dell annunziata", "annunziata", "fortezza", "forte"],
	"Torre dell'Orologio": ["torre dell orologio", "torre civica", "campanile"],
}

var _pois: Array[Dictionary] = []
# nome_POI -> Array[String] di frasi-innesco normalizzate (le piu' lunghe pesano di piu').
var _triggers: Dictionary = {}
var _re_viaggio: RegEx


func _ready() -> void:
	_re_viaggio = RegEx.new()
	_re_viaggio.compile(PAROLE_VIAGGIO)
	_carica_pois()
	AIBridge.master_complete.connect(_on_master_complete)


func _carica_pois() -> void:
	if not FileAccess.file_exists(POIS_PATH):
		push_warning("ChatTravelBridge: POI non trovati: " + POIS_PATH)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(POIS_PATH))
	if not (parsed is Dictionary and (parsed as Dictionary).has("pois")):
		return
	for entry: Variant in (parsed as Dictionary)["pois"]:
		if not (entry is Dictionary):
			continue
		var poi: Dictionary = entry
		_pois.append(poi)
		var nome: String = String(poi["name"])
		var frasi: Array[String] = [_normalizza(nome)]
		for alias: Variant in ALIAS.get(nome, []):
			var norm: String = _normalizza(String(alias))
			if not norm.is_empty() and not frasi.has(norm):
				frasi.append(norm)
		_triggers[nome] = frasi


func _on_master_complete(narration: String, commands: Array) -> void:
	# Guardia 0: questo bridge conosce SOLO i POI reali di Ventimiglia — fuori da quella
	# campagna una parola generica della narrazione ("il ponte", "la torre", "la porta"...)
	# potrebbe combaciare per caso con un alias e teletrasportare il party su un POI reale
	# mentre si gioca un'altra ambientazione (era parte del bug "Master che sembra sempre
	# raccontare Ventimiglia").
	if CampaignDirector.campagna_attuale_id() != "ventimiglia":
		return
	# Guardia 1: il Master ha gia' spostato il party via comando strutturato (moveTo & co.):
	# quello passa da AIBridge._dispatch_command -> viaggia_a_nome, non serve leggere la prosa.
	for c: Variant in commands:
		if c is Dictionary and COMANDI_VIAGGIO.has(String((c as Dictionary).get("command", ""))):
			return
	# Guardia 2: durante un combattimento non si viaggia sull'overworld (si e' sulla griglia).
	if CombatManager.is_active():
		return
	var destinazione: String = rileva_destinazione_da_testo(narration)
	if destinazione.is_empty():
		return
	viaggia_a_nome(destinazione)


## Analizza la narrazione: se annuncia uno spostamento verso un POI noto ne ritorna il nome
## canonico, stringa vuota altrimenti. Pura (nessun effetto collaterale). Il POI scelto e' quello
## la cui frase-innesco piu' LUNGA compare nel testo (disambigua "ponte" da "ponte sul roya").
func rileva_destinazione_da_testo(testo: String) -> String:
	if testo.strip_edges().is_empty() or _re_viaggio.search(testo) == null:
		return ""
	var norm: String = _normalizza(testo)
	var migliore_nome: String = ""
	var migliore_lunghezza: int = 0
	for nome: String in _triggers:
		for frase: String in (_triggers[nome] as Array):
			if frase.length() <= migliore_lunghezza:
				continue
			if _contiene_parola(norm, frase):
				migliore_lunghezza = frase.length()
				migliore_nome = nome
	return migliore_nome


## Sposta il party su un POI per nome (prosa o comando strutturato). Ritorna true se il party si e'
## effettivamente mosso (destinazione nota e diversa da quella attuale). Aggiorna la sola fonte di
## verita' (GameState): OverworldMap si riallinea da sola ascoltando party_location_changed.
func viaggia_a_nome(poi_name: String) -> bool:
	var poi: Dictionary = _risolvi_poi(poi_name)
	if poi.is_empty():
		return false
	var attuale: Variant = GameState.get_party_location()
	var nome_attuale: String = ""
	if attuale is Dictionary:
		nome_attuale = String((attuale as Dictionary).get("name", ""))
	if nome_attuale == String(poi["name"]):
		return false
	GameState.set_party_location({
		"name": String(poi["name"]), "lat": float(poi["lat"]), "lng": float(poi["lng"]),
	})
	GameState.publish("party:moved", poi)
	GameState.announce("➜ Il party si sposta verso %s. %s" % [
		String(poi["name"]), String(poi.get("desc", "")),
	])
	return true


## Risolve un nome (canonico, alias o forma libera dalla prosa) nel POI del catalogo. Vuoto se
## nessuna corrispondenza. Prima il match esatto/normalizzato sul nome, poi le frasi-innesco.
func _risolvi_poi(poi_name: String) -> Dictionary:
	var richiesto: String = _normalizza(poi_name)
	if richiesto.is_empty():
		return {}
	for poi: Dictionary in _pois:
		if _normalizza(String(poi["name"])) == richiesto:
			return poi
	# Nessun match esatto: prova le frasi-innesco (il nome richiesto CONTIENE la frase o viceversa).
	var migliore: Dictionary = {}
	var migliore_lunghezza: int = 0
	for poi: Dictionary in _pois:
		for frase: String in (_triggers.get(String(poi["name"]), []) as Array):
			if frase.length() <= migliore_lunghezza:
				continue
			if _contiene_parola(richiesto, frase) or _contiene_parola(frase, richiesto):
				migliore_lunghezza = frase.length()
				migliore = poi
	return migliore


## Match a confine di parola: la frase deve comparire delimitata da spazi (o dai bordi), cosi'
## "forte" non scatta dentro "conforte" e "porto" non scatta dentro "importuno". Lavora su testo
## gia' normalizzato (spazi singoli come unico separatore).
func _contiene_parola(testo: String, frase: String) -> bool:
	if frase.is_empty():
		return false
	var imbottito: String = " " + testo + " "
	return imbottito.contains(" " + frase + " ")


## Normalizza per il confronto: minuscolo, accenti italiani ridotti, apostrofi/punteggiatura ->
## spazio, spazi multipli compattati. "Forte dell'Annunziata" -> "forte dell annunziata".
func _normalizza(testo: String) -> String:
	var s: String = testo.to_lower()
	var accenti: Dictionary = {
		"à": "a", "á": "a", "è": "e", "é": "e", "ì": "i", "í": "i",
		"ò": "o", "ó": "o", "ù": "u", "ú": "u",
	}
	for k: String in accenti:
		s = s.replace(k, accenti[k])
	var pulito: String = ""
	for i: int in range(s.length()):
		var ch: String = s[i]
		pulito += ch if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") else " "
	# Compatta gli spazi multipli.
	while pulito.contains("  "):
		pulito = pulito.replace("  ", " ")
	return pulito.strip_edges()
