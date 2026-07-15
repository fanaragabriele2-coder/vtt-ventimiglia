extends Node
## StoryDirector (Autoload) — il regista del RACCONTO ramificato "Il Fardello dell'Ombra"
## (data/storia_terra_di_mezzo.json). E' una avventura-libro giocabile dal pannello Storia:
##
## - ogni NODO ha una narrazione e delle OPZIONI; il giocatore clicca un'opzione OPPURE scrive
##   liberamente (il testo viene agganciato all'opzione piu' simile);
## - alcune opzioni sono PROVE: il pannello tira 1d20, StoryDirector ci somma il MIGLIOR
##   modificatore del party per quella caratteristica e confronta con la CD — successo e
##   fallimento portano a nodi diversi (astuzia e abilita' cambiano la storia);
## - alcuni nodi sono BOSS FIGHT contro i nemici del Signore degli Anelli: lo scontro compare
##   sulla mappa (spawn bilanciato sul party), e alla VITTORIA si prosegue a 'dopo_vittoria';
##   a party sconfitto il racconto offre di riprovare lo stesso scontro.
##
## Il progresso (nodo corrente + ricompense gia' prese) vive in user://storia_terra_di_mezzo.json.
## Il pannello (CampaignStoryPanel) ascolta 'nodo_presentato' e disegna la UI; StoryDirector non
## conosce la UI. Autonomo dagli altri sistemi: le sue vittorie non toccano CampaignDirector
## (che reagisce solo agli scontri che avvia lui).

signal nodo_presentato(dati: Dictionary)
signal racconto_finito()

const STORIA_PATH: String = "res://data/storia_terra_di_mezzo.json"
const SALVATAGGIO: String = "user://storia_terra_di_mezzo.json"
const NOMI_ABILITA: Dictionary = {
	"str": "Forza", "dex": "Destrezza", "con": "Costituzione",
	"int": "Intelligenza", "wis": "Saggezza", "cha": "Carisma",
}

var _dati: Dictionary = {}
var _nodi: Dictionary = {}
var _nodo_corrente: String = ""
var _premiati: Dictionary = {}
var _attesa_vittoria: bool = false
var _avviato: bool = false


func _ready() -> void:
	if not FileAccess.file_exists(STORIA_PATH):
		push_warning("StoryDirector: racconto non trovato: " + STORIA_PATH)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(STORIA_PATH))
	if parsed is not Dictionary:
		push_warning("StoryDirector: racconto illeggibile")
		return
	_dati = parsed
	_nodi = _dati.get("nodi", {})
	CombatManager.victory.connect(_su_vittoria)
	CombatManager.party_wiped.connect(_su_sconfitta)
	_carica()


## Titolo del racconto (per l'intestazione del pannello).
func titolo() -> String:
	return String(_dati.get("titolo", "Racconto"))


## Avvia/riprende il racconto: presenta il nodo corrente. Chiamato dal pannello all'apertura.
## Se il nodo corrente e' un boss non ancora in corso, lo fa ricomparire (resume dopo chiusura).
func avvia() -> void:
	if _nodi.is_empty():
		return
	_avviato = true
	if _nodo_corrente.is_empty() or not _nodi.has(_nodo_corrente):
		_nodo_corrente = String(_dati.get("nodo_iniziale", ""))
	_processa_ingresso()


## Ricomincia da capo (azzera nodo e ricompense prese).
func ricomincia() -> void:
	_premiati.clear()
	_attesa_vittoria = false
	if CombatManager.is_active():
		CombatManager.end_combat()
	_nodo_corrente = String(_dati.get("nodo_iniziale", ""))
	_salva()
	_processa_ingresso()


## Il MIGLIOR modificatore del party per una caratteristica (chi e' piu' portato tenta la prova),
## piu' la sua competenza: e' cio' che si somma al d20 della prova.
func modificatore_di(abilita: String) -> int:
	var party: Array[CharacterData] = CharacterManager.get_party()
	if party.is_empty():
		return 0
	var migliore: int = -99
	for c: CharacterData in party:
		migliore = maxi(migliore, c.modifier_of(abilita) + c.proficiency_bonus)
	return migliore


## Il giocatore ha scelto l'opzione `indice` del nodo corrente (opzione semplice o "riprova").
func scegli(indice: int) -> void:
	var opzioni: Array = _opzioni_grezze()
	if indice < 0 or indice >= opzioni.size():
		return
	var opzione: Dictionary = opzioni[indice]
	if opzione.has("vai_a"):
		_vai_a(String(opzione["vai_a"]))


## Risolve una PROVA: il pannello ha tirato 1d20 (`totale_d20`), qui si somma il modificatore e
## si confronta con la CD; poi si va al nodo di successo o di fallimento, narrando l'esito.
func risolvi_prova(indice: int, totale_d20: int) -> void:
	var opzioni: Array = _opzioni_grezze()
	if indice < 0 or indice >= opzioni.size() or not (opzioni[indice] as Dictionary).has("prova"):
		return
	var prova: Dictionary = (opzioni[indice] as Dictionary)["prova"]
	var abilita: String = String(prova.get("abilita", "dex"))
	var mod: int = modificatore_di(abilita)
	var cd: int = int(prova.get("cd", 12))
	# Lo SPIRITO della Compagnia (Speranza alta/bassa, Fardello dell'Ombra) e i Doni del Cammino
	# pesano sulle prove: la stessa strada e' piu' facile per chi spera e porta i segni dell'Ovest.
	var spirito: int = CompanySpirit.mod_prove() + RelicsManager.bonus_prove()
	var totale: int = totale_d20 + mod + spirito
	var ok: bool = totale >= cd
	var etichetta: String = String(prova.get("etichetta", NOMI_ABILITA.get(abilita, "Prova")))
	var dettaglio: String = "%d + %d" % [totale_d20, mod]
	if spirito != 0:
		dettaglio += " %+d (spirito)" % spirito
	GameState.announce("🎲 %s: %s = %d contro CD %d — %s!" % [
		etichetta, dettaglio, totale, cd, "RIUSCITA" if ok else "FALLITA",
	])
	_vai_a(String(prova.get("successo" if ok else "fallimento", _nodo_corrente)))


## Il giocatore ha SCRITTO liberamente: si aggancia il testo all'opzione piu' simile del nodo.
## Ritorna un messaggio da mostrare (vuoto se ha proseguito con una scelta).
func azione_libera(testo: String) -> String:
	if _attesa_vittoria:
		return "Lo scontro infuria sulla mappa: risolvilo coi pulsanti di combattimento."
	var opzioni: Array = _opzioni_grezze()
	if opzioni.is_empty():
		return ""
	var indice: int = _opzione_piu_simile(testo, opzioni)
	if indice < 0:
		return "Il destino non offre quella via. Scegli tra le possibilita' o descrivine una simile."
	var opzione: Dictionary = opzioni[indice]
	if opzione.has("prova"):
		var et: String = String(opzione["prova"].get("etichetta", "prova"))
		return "La tua idea richiede una prova di %s: usa il pulsante corrispondente." % et
	_vai_a(String(opzione["vai_a"]))
	return ""


# --- Interno ---

func _opzioni_grezze() -> Array:
	if not _nodi.has(_nodo_corrente):
		return []
	return (_nodi[_nodo_corrente] as Dictionary).get("opzioni", [])


## Entra in un nodo: aggiorna e salva il corrente, poi lo processa (ricompense/combattimento/UI).
func _vai_a(nodo_id: String) -> void:
	if not _nodi.has(nodo_id):
		return
	_nodo_corrente = nodo_id
	_salva()
	_processa_ingresso()


## Applica cio' che il nodo comporta ALL'INGRESSO e prepara la UI:
## - ricompensa dei nodi narrativi (una volta sola); - avvio del boss fight; - fine del racconto.
func _processa_ingresso() -> void:
	var n: Dictionary = _nodi[_nodo_corrente]
	if n.has("combattimento"):
		_attesa_vittoria = true
		if not CombatManager.is_active():
			EncounterBalancer.spawn_bilanciato(
				n["combattimento"], String(n.get("intensita", "difficile")))
		_presenta({ "testo": String(n.get("testo", "")), "opzioni": [], "combattimento": true })
		return
	if n.has("ricompensa"):
		_premia(_nodo_corrente, n["ricompensa"])
	_presenta_nodo_narrativo(n)
	if bool(n.get("fine", false)):
		racconto_finito.emit()


## Costruisce il pacchetto-UI di un nodo narrativo: testo + opzioni tipizzate (vai/prova).
func _presenta_nodo_narrativo(n: Dictionary) -> void:
	var opzioni_ui: Array = []
	for o: Variant in n.get("opzioni", []):
		var od: Dictionary = o
		if od.has("prova"):
			var p: Dictionary = od["prova"]
			var abilita: String = String(p.get("abilita", "dex"))
			var mod: int = modificatore_di(abilita)
			opzioni_ui.append({
				"testo": String(od.get("testo", "")), "tipo": "prova",
				"etichetta": String(p.get("etichetta", NOMI_ABILITA.get(abilita, "Prova"))),
				"cd": int(p.get("cd", 12)), "abilita": NOMI_ABILITA.get(abilita, abilita),
				"mod": mod,
			})
		else:
			opzioni_ui.append({ "testo": String(od.get("testo", "")), "tipo": "vai" })
	_presenta({
		"testo": String(n.get("testo", "")), "opzioni": opzioni_ui,
		"combattimento": false, "fine": bool(n.get("fine", false)),
	})


func _presenta(dati: Dictionary) -> void:
	nodo_presentato.emit(dati)


func _premia(nodo_id: String, ricompensa: Dictionary) -> void:
	if _premiati.has(nodo_id) or ricompensa.is_empty():
		return
	_premiati[nodo_id] = true
	_salva()
	ProgressionManager.collect_loot({
		"items": ricompensa.get("items", []),
		"gold": int(ricompensa.get("gold", 0)),
		"enemyName": titolo(),
	})


func _su_vittoria() -> void:
	if not _attesa_vittoria:
		return
	_attesa_vittoria = false
	var n: Dictionary = _nodi[_nodo_corrente]
	if n.has("ricompensa"):
		_premia(_nodo_corrente, n["ricompensa"])
	_vai_a(String(n.get("dopo_vittoria", _nodo_corrente)))


func _su_sconfitta() -> void:
	if not _attesa_vittoria:
		return
	_attesa_vittoria = false
	var n: Dictionary = _nodi[_nodo_corrente]
	GameState.announce("💀 Il fardello sembra perduto... ma la storia vi concede un'altra prova.")
	# Presenta lo stesso boss con un'unica scelta: riprovare (il pulsante chiama riprova()).
	_presenta({
		"testo": String(n.get("testo", "")),
		"opzioni": [{ "testo": "⟲ Riprova lo scontro", "tipo": "riprova" }],
		"combattimento": false,
	})


## Riprende il boss fight del nodo corrente dopo una sconfitta (respawn dello scontro).
func riprova() -> void:
	if _nodi.has(_nodo_corrente) and (_nodi[_nodo_corrente] as Dictionary).has("combattimento"):
		_processa_ingresso()


func _salva() -> void:
	var file: FileAccess = FileAccess.open(SALVATAGGIO, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify({
			"nodo": _nodo_corrente, "premiati": _premiati.keys(),
		}))


func _carica() -> void:
	if not FileAccess.file_exists(SALVATAGGIO):
		return
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(SALVATAGGIO))
	if dati is Dictionary:
		_nodo_corrente = String((dati as Dictionary).get("nodo", ""))
		for id: Variant in (dati as Dictionary).get("premiati", []):
			_premiati[String(id)] = true


## Aggancio del testo libero: l'opzione con piu' PAROLE SIGNIFICATIVE in comune col testo
## (incluse le parole dell'etichetta di prova); -1 se nessuna raggiunge la soglia minima.
func _opzione_piu_simile(testo: String, opzioni: Array) -> int:
	var parole_in: Dictionary = _parole(testo)
	if parole_in.is_empty():
		return -1
	var migliore: int = -1
	var miglior_punti: int = 0
	for i: int in range(opzioni.size()):
		var od: Dictionary = opzioni[i]
		var testo_opz: String = String(od.get("testo", ""))
		if od.has("prova"):
			testo_opz += " " + String((od["prova"] as Dictionary).get("etichetta", ""))
		var punti: int = 0
		for p: String in _parole(testo_opz):
			if parole_in.has(p):
				punti += 1
		if punti > miglior_punti:
			miglior_punti = punti
			migliore = i
	return migliore if miglior_punti >= 1 else -1


## Parole significative (>=4 lettere) minuscole senza punteggiatura, come insieme.
func _parole(testo: String) -> Dictionary:
	var out: Dictionary = {}
	var pulito: String = ""
	for i: int in range(testo.length()):
		var ch: String = testo[i].to_lower()
		pulito += ch if (ch >= "a" and ch <= "z") else " "
	for p: String in pulito.split(" ", false):
		if p.length() >= 4:
			out[p] = true
	return out
