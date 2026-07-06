extends Node
## ConditionsManager (Autoload singleton) — porting del Modulo 30 JS "Condizioni di Stato" (stile
## BG3): un sottoinsieme delle condizioni 5e piu' riconoscibili in combattimento.
##   PRONO:      chi lo subisce viene colpito con vantaggio; i SUOI attacchi hanno svantaggio.
##   STORDITO:   chi lo subisce viene colpito con vantaggio.
##   AVVELENATO: chi lo subisce ha svantaggio sui propri attacchi.
## Ogni condizione ha una durata in round (sul round di CombatManager) e scade da sola.
##
## Registrazione: Project Settings > Autoload -> "ConditionsManager" (dopo CombatManager).

signal condition_applied(combatant_id: String, key: String, duration_rounds: int)
signal condition_removed(combatant_id: String, key: String)

const DURATA_DEFAULT: Dictionary = { "prono": 1, "stordito": 1, "avvelenato": 3 }
const ICONE: Dictionary = { "prono": "🩹", "stordito": "💫", "avvelenato": "☠️" }
const ETICHETTE: Dictionary = { "prono": "Prono", "stordito": "Stordito", "avvelenato": "Avvelenato" }
const NARRAZIONE_APPLICATA: Dictionary = { "prono": "cade prono", "stordito": "e' stordito", "avvelenato": "e' avvelenato" }
const NARRAZIONE_RIMOSSA: Dictionary = { "prono": "si rialza", "stordito": "non e' piu' stordito", "avvelenato": "non e' piu' avvelenato" }

var _condizioni: Dictionary = {}   # combattente_id -> { chiave -> {"duration":int, "appliedAt":int} }


func _ready() -> void:
	CombatManager.turn_changed.connect(_on_turn_changed)


func _on_turn_changed(_combatant_id: String, _round_number: int) -> void:
	pulisci_scadute()


func _round_corrente() -> int:
	return int(CombatManager.get_state()["round"])


func _nome(combattente_id: String) -> String:
	var c: Dictionary = CombatManager.get_combatant(combattente_id)
	return String(c.get("name", combattente_id)) if not c.is_empty() else combattente_id


static func e_scaduta(applied_at: int, duration: int, round_attuale: int) -> bool:
	return (round_attuale - applied_at) >= duration


func durata_default(chiave: String) -> int:
	return int(DURATA_DEFAULT.get(chiave, 1))


## Effetto sul tiro per colpire, date le condizioni attive di attaccante e bersaglio.
static func effetto_su_attacco(chiavi_attaccante: Array, chiavi_bersaglio: Array) -> Dictionary:
	var vantaggio: bool = chiavi_bersaglio.has("prono") or chiavi_bersaglio.has("stordito")
	var svantaggio: bool = chiavi_attaccante.has("prono") or chiavi_attaccante.has("avvelenato")
	return { "vantaggio": vantaggio, "svantaggio": svantaggio }


func chiavi_attive(combattente_id: String) -> Array[String]:
	var out: Array[String] = []
	if not _condizioni.has(combattente_id):
		return out
	var round_attuale: int = _round_corrente()
	var mappa: Dictionary = _condizioni[combattente_id]
	for chiave: String in mappa.keys():
		var c: Dictionary = mappa[chiave]
		if not e_scaduta(int(c["appliedAt"]), int(c["duration"]), round_attuale):
			out.append(chiave)
	return out


func ha_condizione(combattente_id: String, chiave: String) -> bool:
	return chiavi_attive(combattente_id).has(chiave)


func condizioni_di(combattente_id: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not _condizioni.has(combattente_id):
		return out
	var mappa: Dictionary = _condizioni[combattente_id]
	for chiave: String in chiavi_attive(combattente_id):
		out.append({ "chiave": chiave, "scadeAlRound": int(mappa[chiave]["appliedAt"]) + int(mappa[chiave]["duration"]) })
	return out


func valuta_condizioni(attaccante_id: String, bersaglio_id: String) -> Dictionary:
	var chiavi_att: Array[String] = chiavi_attive(attaccante_id)
	var chiavi_ber: Array[String] = chiavi_attive(bersaglio_id)
	var effetto: Dictionary = effetto_su_attacco(chiavi_att, chiavi_ber)
	effetto["condizioniAttaccante"] = chiavi_att
	effetto["condizioniBersaglio"] = chiavi_ber
	return effetto


func applica_condizione(combattente_id: String, chiave: String, duration_rounds: int = -1) -> Dictionary:
	if not ETICHETTE.has(chiave):
		return { "ok": false, "message": "Condizione sconosciuta: " + chiave }
	var dur: int = duration_rounds if duration_rounds > 0 else durata_default(chiave)
	if not _condizioni.has(combattente_id):
		_condizioni[combattente_id] = {}
	_condizioni[combattente_id][chiave] = { "duration": dur, "appliedAt": _round_corrente() }
	GameState.announce("%s %s %s (%d round)." % [
		ICONE.get(chiave, ""), _nome(combattente_id), NARRAZIONE_APPLICATA.get(chiave, "subisce " + chiave), dur,
	])
	condition_applied.emit(combattente_id, chiave, dur)
	return { "ok": true, "combattenteId": combattente_id, "chiave": chiave, "durataRound": dur }


func rimuovi_condizione(combattente_id: String, chiave: String) -> Dictionary:
	var presente: bool = _condizioni.has(combattente_id) and _condizioni[combattente_id].has(chiave)
	if presente:
		_condizioni[combattente_id].erase(chiave)
		GameState.announce("✨ %s %s." % [_nome(combattente_id), NARRAZIONE_RIMOSSA.get(chiave, "non ha piu' la condizione " + chiave)])
		condition_removed.emit(combattente_id, chiave)
	return { "ok": true, "combattenteId": combattente_id, "chiave": chiave, "rimossa": presente }


## Ripulisce le condizioni scadute: chiamato a ogni cambio turno (agganciato in _ready).
func pulisci_scadute() -> void:
	var round_attuale: int = _round_corrente()
	for combattente_id: String in _condizioni.keys():
		var mappa: Dictionary = _condizioni[combattente_id]
		for chiave: String in mappa.keys():
			var c: Dictionary = mappa[chiave]
			if e_scaduta(int(c["appliedAt"]), int(c["duration"]), round_attuale):
				mappa.erase(chiave)
				GameState.announce("%s %s %s (scaduta)." % [
					ICONE.get(chiave, ""), _nome(combattente_id), NARRAZIONE_RIMOSSA.get(chiave, "non ha piu' la condizione " + chiave),
				])
				condition_removed.emit(combattente_id, chiave)


func reset() -> void:
	_condizioni.clear()
