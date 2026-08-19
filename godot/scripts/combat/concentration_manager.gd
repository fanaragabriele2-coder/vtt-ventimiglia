extends Node
## ConcentrationManager (Autoload) — CONCENTRAZIONE (D&D 5e): chi mantiene un incantesimo di
## concentrazione (nel gioco: la Benedizione del chierico) e SUBISCE DANNO deve superare un tiro
## salvezza su Costituzione — CD = max(10, meta' del danno) — o l'incantesimo si SPEZZA. Un
## incantatore si concentra su una cosa sola per volta.
##
## La Benedizione da' +1d4 al tiro per colpire dei bersagli (lo applica resolve_attack leggendo
## benedetto()); quando la concentrazione salta, il bonus svanisce. Stato solo di combattimento
## (reset a fine scontro).
##
## Registrazione: Project Settings > Autoload -> "ConcentrationManager" (dopo CombatManager).

signal concentrazione_iniziata(caster_id: String, incantesimo: String)
signal concentrazione_persa(caster_id: String, incantesimo: String)

var _conc: Dictionary = {}   # caster_id -> { "incantesimo": String, "bersagli": Array }


## Inizia una concentrazione (interrompe l'eventuale precedente dello stesso incantatore).
func inizia(caster_id: String, incantesimo: String, bersagli: Array) -> void:
	if _conc.has(caster_id):
		interrompi(caster_id)
	_conc[caster_id] = { "incantesimo": incantesimo, "bersagli": bersagli }
	concentrazione_iniziata.emit(caster_id, incantesimo)


func interrompi(caster_id: String) -> void:
	if not _conc.has(caster_id):
		return
	var inc: String = String(_conc[caster_id]["incantesimo"])
	_conc.erase(caster_id)
	concentrazione_persa.emit(caster_id, inc)


func e_concentrato(id: String) -> bool:
	return _conc.has(id)


func incantesimo_di(id: String) -> String:
	return String(_conc.get(id, {}).get("incantesimo", ""))


## Il combattente e' sotto una Benedizione attiva (bersaglio della concentrazione di qualcuno)?
func benedetto(id: String) -> bool:
	for caster: String in _conc.keys():
		var d: Dictionary = _conc[caster]
		if String(d["incantesimo"]) == "Benedizione" and (d["bersagli"] as Array).has(id):
			return true
	return false


## Un combattente CONCENTRATO ha subito danno: TS su Costituzione, CD = max(10, meta' del danno).
## Fallito -> la concentrazione si spezza (lo chiama CombatManager quando applica il danno).
func su_danno(id: String, danno: int) -> void:
	if not _conc.has(id) or danno <= 0:
		return
	@warning_ignore("integer_division")
	var cd: int = maxi(10, danno / 2)
	var ts: Dictionary = CombatManager.saving_throw(id, "con", cd)
	var nome: String = String(CombatManager.get_combatant(id).get("name", "L'incantatore"))
	if bool(ts["success"]):
		GameState.announce("✨ %s regge la concentrazione (Cost %d vs CD %d)." % [
			nome, int(ts["total"]), cd])
	else:
		GameState.announce("💢 %s perde la concentrazione su %s! (Cost %d vs CD %d)" % [
			nome, incantesimo_di(id), int(ts["total"]), cd])
		interrompi(id)


func reset() -> void:
	_conc.clear()
