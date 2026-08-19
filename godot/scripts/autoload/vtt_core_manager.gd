extends Node
## VttCoreManager (Autoload) — la State Machine RIGIDA del tavolo + lo stato compatto per l'LLM.
##
## Due soli stati, transizioni esplicite (pattern HeartBeast: mai flag booleani sparsi):
## - EXPLORATION: il party si muove in blocco (il capofila guida, gli altri seguono);
## - COMBAT: movimento individuale a turni (regole di CombatManager).
## La FONTE del combattimento resta CombatManager: questa macchina lo RIFLETTE ascoltando
## combat_started/combat_ended, non lo decide — una sola autorita', zero stati divergenti.
##
## In piu' tiene lo STORICO CORTO degli eventi (ring buffer, ultimi 30 annunci di sistema) e lo
## impacchetta con party/HP/posizioni in un Dizionario compatto per l'LLM locale
## (stato_per_llm) — e' il payload che il ponte NLP invia a ogni azione del giocatore.
## (La memoria LUNGA — i fatti chiave di campagna — resta a CampaignMemory: qui vive la cronaca
## recente, la' la storia.)
##
## Gestisce anche il "dado di movimento" della Modalita' Storia: un budget di celle assegnato dal
## tiro (-1 = illimitato, gioco libero) che il movimento su griglia consuma passo per passo.

signal stato_cambiato(da: int, a: int)
signal budget_movimento_cambiato(celle: int)

enum Stato { EXPLORATION, COMBAT }

const MAX_EVENTI: int = 30
const EVENTI_PER_LLM: int = 12

var _stato: int = Stato.EXPLORATION
var _budget_movimento: int = -1  # -1 = illimitato; >= 0 = celle residue del dado di movimento
var _storico: Array[Dictionary] = []


func _ready() -> void:
	CombatManager.combat_started.connect(_on_combat_started)
	CombatManager.combat_ended.connect(_on_combat_ended)
	GameState.event_published.connect(_on_event_published)
	GameState.party_location_changed.connect(_on_party_location_changed)


func stato_attuale() -> int:
	return _stato


func nome_stato() -> String:
	return "COMBAT" if _stato == Stato.COMBAT else "EXPLORATION"


## In esplorazione il party viaggia compatto: chi guida muove, gli altri gli si stringono attorno.
func is_movimento_in_blocco() -> bool:
	return _stato == Stato.EXPLORATION


# --- Dado di movimento (Modalita' Storia: "richiede_dado" con scopo "movimento") ---

func budget_movimento() -> int:
	return _budget_movimento


func imposta_budget_movimento(celle: int) -> void:
	_budget_movimento = maxi(-1, celle)
	budget_movimento_cambiato.emit(_budget_movimento)
	if celle >= 0:
		GameState.announce("👣 Movimento del party: %d celle disponibili." % celle)


## Prova a spendere `celle` passi dal budget. Con budget illimitato (-1) passa sempre; altrimenti
## rifiuta (annunciandolo) se i passi superano il residuo. Ritorna true se il movimento e' lecito.
func consuma_movimento(celle: int) -> bool:
	if _budget_movimento < 0:
		return true
	if celle > _budget_movimento:
		GameState.announce("👣 Movimento insufficiente: servono %d celle, ne restano %d." % [
			celle, _budget_movimento,
		])
		return false
	_budget_movimento -= celle
	budget_movimento_cambiato.emit(_budget_movimento)
	return true


# --- Storico eventi (cronaca recente per il payload LLM) ---

func registra_evento(tipo: String, testo: String) -> void:
	if testo.strip_edges().is_empty():
		return
	_storico.append({ "tipo": tipo, "testo": testo, "msec": Time.get_ticks_msec() })
	while _storico.size() > MAX_EVENTI:
		_storico.pop_front()


## Lo SNAPSHOT compatto per l'LLM: stato, luogo, schede essenziali del party, combattenti con
## celle (solo in COMBAT), budget di movimento e gli ultimi eventi. E' un Dizionario pronto per
## JSON.stringify — niente nodi, niente riferimenti, solo dati.
func stato_per_llm() -> Dictionary:
	var fotografia: Dictionary = {
		"stato": nome_stato(),
		"luogo": _nome_luogo(),
		"party": _party_per_llm(),
		"budget_movimento": _budget_movimento,
		"eventi_recenti": _eventi_recenti(),
	}
	if _stato == Stato.COMBAT:
		fotografia["combattenti"] = _combattenti_per_llm()
	return fotografia


func _party_per_llm() -> Array:
	var out: Array = []
	for c: CharacterData in CharacterManager.get_party():
		out.append({
			"nome": c.character_name, "livello": c.level,
			"hp": c.hp_current, "hp_max": c.hp_max, "ca": c.armor_class,
		})
	return out


func _combattenti_per_llm() -> Array:
	var out: Array = []
	for c: Dictionary in CombatManager.get_state()["combatants"]:
		var voce: Dictionary = {
			"nome": String(c["name"]), "tipo": String(c["kind"]),
			"hp": int(c["hitPoints"]), "hp_max": int(c["maxHitPoints"]),
		}
		var cella: Variant = CombatManager.get_combatant_cell(String(c["id"]))
		if cella is Vector2i:
			voce["cella"] = [(cella as Vector2i).x, (cella as Vector2i).y]
		out.append(voce)
	return out


func _eventi_recenti() -> Array:
	var out: Array = []
	var inizio: int = maxi(0, _storico.size() - EVENTI_PER_LLM)
	for i: int in range(inizio, _storico.size()):
		out.append(String(_storico[i]["testo"]))
	return out


func _nome_luogo() -> String:
	var luogo: Variant = GameState.get_party_location()
	if luogo is Dictionary:
		return String((luogo as Dictionary).get("name", ""))
	return ""


# --- Transizioni (guidate dai signal di CombatManager, unica autorita' sul combattimento) ---

func _transizione(nuovo: int) -> void:
	if nuovo == _stato:
		return
	var vecchio: int = _stato
	_stato = nuovo
	# Cambiare stato azzera il dado di movimento: in combattimento comanda l'economia azioni,
	# tornati a esplorare si e' di nuovo liberi finche' la Storia non chiede un altro tiro.
	_budget_movimento = -1
	budget_movimento_cambiato.emit(-1)
	registra_evento("stato", "Il tavolo passa in modalita' " + nome_stato() + ".")
	stato_cambiato.emit(vecchio, nuovo)


func _on_combat_started() -> void:
	_transizione(Stato.COMBAT)


func _on_combat_ended() -> void:
	_transizione(Stato.EXPLORATION)


func _on_event_published(event_name: String, payload: Variant) -> void:
	# Il canale unico degli annunci di sistema (level-up, loot, tiri, arrivi...) E' la cronaca.
	if event_name == "system:message":
		registra_evento("annuncio", String(payload))


func _on_party_location_changed(location: Dictionary) -> void:
	var nome: String = String(location.get("name", ""))
	if not nome.is_empty():
		registra_evento("viaggio", "Il party ora si trova a " + nome + ".")
