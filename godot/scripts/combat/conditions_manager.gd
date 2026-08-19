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

const DURATA_DEFAULT: Dictionary = {
	"prono": 1, "stordito": 1, "avvelenato": 3, "spaventato": 2, "afferrato": 2, "furia": 3,
}
const ICONE: Dictionary = {
	"prono": "🩹", "stordito": "💫", "avvelenato": "☠️", "spaventato": "😱",
	"afferrato": "🕸", "furia": "💢",
}
const ETICHETTE: Dictionary = {
	"prono": "Prono", "stordito": "Stordito", "avvelenato": "Avvelenato",
	"spaventato": "Spaventato", "afferrato": "Afferrato", "furia": "Furia",
}
const NARRAZIONE_APPLICATA: Dictionary = {
	"prono": "cade prono", "stordito": "e' stordito", "avvelenato": "e' avvelenato",
	"spaventato": "e' SPAVENTATO: il terrore gli lega il braccio",
	"afferrato": "e' AFFERRATO: non puo' muoversi", "furia": "entra in FURIA",
}
const NARRAZIONE_RIMOSSA: Dictionary = {
	"prono": "si rialza", "stordito": "non e' piu' stordito",
	"avvelenato": "non e' piu' avvelenato", "spaventato": "ritrova il coraggio",
	"afferrato": "si libera", "furia": "si placa",
}
## Colore del BADGE disegnato sul token (WorldTokens/WorldEnemyTokens) per ogni condizione.
const COLORI: Dictionary = {
	"prono": Color(0.85, 0.55, 0.25), "stordito": Color(0.95, 0.85, 0.3),
	"avvelenato": Color(0.4, 0.8, 0.35), "spaventato": Color(0.7, 0.45, 0.9),
	"afferrato": Color(0.75, 0.75, 0.78), "furia": Color(0.9, 0.25, 0.2),
}
## Nemici che AVVELENANO col morso (TS COS CD 11) o SPAVENTANO al colpo (TS SAG CD 12).
const VELENOSI: Array[String] = ["ragno", "shelob", "vedova"]
const TERRIFICANTI: Array[String] = ["nazgul", "spettro", "stregone", "ombra"]

var _condizioni: Dictionary = {}   # combattente_id -> { chiave -> {"duration":int, "appliedAt":int} }


func _ready() -> void:
	CombatManager.turn_changed.connect(_on_turn_changed)
	# I mostri che AVVELENANO o TERRORIZZANO infliggono la condizione quando il colpo va a segno.
	CombatManager.attack_resolved.connect(_su_attacco_risolto)


func _on_turn_changed(_combatant_id: String, _round_number: int) -> void:
	pulisci_scadute()


## Un colpo a segno di un mostro speciale su un PG: tiro salvezza o condizione.
## Il ragno avvelena (COS CD 11), le ombre grandi spaventano (SAG CD 12).
func _su_attacco_risolto(result: Dictionary) -> void:
	if not bool(result.get("hit", false)):
		return
	var bersaglio: String = String(result.get("target", ""))
	if not bersaglio.begins_with("pc-"):
		return
	var attaccante: String = String(result.get("attacker", ""))
	var nome: String = _nome(attaccante).to_lower()
	for parola: String in VELENOSI:
		if nome.contains(parola) and not ha_condizione(bersaglio, "avvelenato"):
			_infliggi_con_ts(bersaglio, "avvelenato", "con", 11)
			return
	for parola: String in TERRIFICANTI:
		if nome.contains(parola) and not ha_condizione(bersaglio, "spaventato"):
			_infliggi_con_ts(bersaglio, "spaventato", "wis", 12)
			return


func _infliggi_con_ts(bersaglio: String, chiave: String, abilita: String, dc: int) -> void:
	var ts: Dictionary = CombatManager.saving_throw(bersaglio, abilita, dc)
	if bool(ts["success"]):
		GameState.announce("💪 %s resiste (%d vs CD %d): niente %s." % [
			_nome(bersaglio), int(ts["total"]), dc, ETICHETTE.get(chiave, chiave)])
	else:
		applica_condizione(bersaglio, chiave)


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
## Anche AFFERRATO si colpisce con vantaggio (e' fermo); SPAVENTATO attacca con svantaggio.
static func effetto_su_attacco(chiavi_attaccante: Array, chiavi_bersaglio: Array) -> Dictionary:
	var vantaggio: bool = chiavi_bersaglio.has("prono") or chiavi_bersaglio.has("stordito") \
		or chiavi_bersaglio.has("afferrato")
	var svantaggio: bool = chiavi_attaccante.has("prono") or chiavi_attaccante.has("avvelenato") \
		or chiavi_attaccante.has("spaventato")
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
