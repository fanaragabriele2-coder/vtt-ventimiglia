extends Node
## SurfacesManager (Autoload singleton) — porting del Modulo 27 JS "Superfici" (fuoco/veleno,
## stile BG3). Aree del campo che infliggono danno a chiunque vi si trovi a inizio round, e
## scadono dopo un numero fisso di round.
##
## Il tick di danno e' agganciato a CombatManager.turn_changed: scatta una volta sola quando il
## NUMERO DI ROUND cambia (non a ogni singolo turno), lo stesso "inizio round" del monolite ma
## event-driven invece che a polling (li' serviva per il multiplayer, qui non c'e' ancora rete).
##
## Registrazione: Project Settings > Autoload -> "SurfacesManager" (dopo CombatManager).

signal surface_created(surface: Dictionary)
signal surface_expired(surface_id: String)

const DURATA_DEFAULT: Dictionary = { "fuoco": 3, "veleno": 2 }
const FORMULA_DANNO: Dictionary = { "fuoco": "1d4", "veleno": "1d4" }

var _superfici: Array[Dictionary] = []
var _prossimo_id: int = 1
var _danno_dato_per_round: Dictionary = {}   # "supId:round" -> true
var _ultimo_round_processato: int = -1


func _ready() -> void:
	CombatManager.turn_changed.connect(_on_turn_changed)


func _on_turn_changed(_combatant_id: String, round_number: int) -> void:
	pulisci_scadute()
	if round_number != _ultimo_round_processato:
		_ultimo_round_processato = round_number
		_applica_tick_danno()


static func chebyshev(a: Vector2i, b: Vector2i) -> int:
	return maxi(absi(a.x - b.x), absi(a.y - b.y))


func e_dentro(superficie: Dictionary, cella: Vector2i) -> bool:
	var centro: Vector2i = Vector2i(int(superficie["cellX"]), int(superficie["cellY"]))
	return chebyshev(centro, cella) <= int(superficie["raggio"])


func e_scaduta(superficie: Dictionary, round_attuale: int) -> bool:
	return (round_attuale - int(superficie["creataAlRound"])) >= int(superficie["durataRound"])


func formula_danno(tipo: String) -> String:
	return String(FORMULA_DANNO.get(tipo, "1d4"))


func durata_default(tipo: String) -> int:
	return int(DURATA_DEFAULT.get(tipo, 2))


func crea_superficie(tipo: String, cell_x: int, cell_y: int, raggio: int, durata_round: int = -1) -> Dictionary:
	var tipo_norm: String = "veleno" if tipo == "veleno" else "fuoco"
	var dur: int = durata_round if durata_round > 0 else durata_default(tipo_norm)
	var s: Dictionary = {
		"id": "sup-%d" % _prossimo_id, "tipo": tipo_norm,
		"cellX": cell_x, "cellY": cell_y, "raggio": maxi(0, raggio),
		"durataRound": dur, "creataAlRound": int(CombatManager.get_state()["round"]),
	}
	_prossimo_id += 1
	_superfici.append(s)
	var emoji: String = "🔥" if tipo_norm == "fuoco" else "☠️"
	GameState.announce("%s Superficie di %s creata in (%d,%d), raggio %d, %d round." % [
		emoji, tipo_norm, cell_x, cell_y, int(s["raggio"]), dur,
	])
	surface_created.emit(s)
	return s


## Elenco delle superfici ancora attive (per il disegno overlay sulla mappa).
func elenco_attivo() -> Array[Dictionary]:
	var round_attuale: int = int(CombatManager.get_state()["round"])
	var out: Array[Dictionary] = []
	for s: Dictionary in _superfici:
		if not e_scaduta(s, round_attuale):
			out.append(s)
	return out


func pulisci_scadute() -> void:
	var round_attuale: int = int(CombatManager.get_state()["round"])
	var vive: Array[Dictionary] = []
	for s: Dictionary in _superfici:
		if e_scaduta(s, round_attuale):
			surface_expired.emit(String(s["id"]))
		else:
			vive.append(s)
	_superfici = vive


func _combattenti_in(superficie: Dictionary) -> Array[String]:
	var out: Array[String] = []
	var stato: Dictionary = CombatManager.get_state()
	for c: Dictionary in stato["combatants"]:
		if bool(c["defeated"]):
			continue
		var cid: String = String(c["id"])
		var cella: Variant = CombatManager.get_combatant_cell(cid)
		if cella != null and e_dentro(superficie, cella):
			out.append(cid)
	return out


func _applica_tick_danno() -> void:
	if not CombatManager.is_active() or _superfici.is_empty():
		return
	var round_attuale: int = int(CombatManager.get_state()["round"])
	for s: Dictionary in _superfici:
		if e_scaduta(s, round_attuale):
			continue
		var chiave: String = "%s:%d" % [String(s["id"]), round_attuale]
		if _danno_dato_per_round.has(chiave):
			continue
		var colpiti: Array[String] = _combattenti_in(s)
		if colpiti.is_empty():
			continue
		_danno_dato_per_round[chiave] = true
		for cid: String in colpiti:
			var dmg: Dictionary = CombatManager.roll_damage_formula(formula_danno(String(s["tipo"])), false)
			CombatManager.apply_damage_to_combatant(cid, int(dmg["total"]))
			var c: Dictionary = CombatManager.get_combatant(cid)
			var emoji: String = "🔥 " if s["tipo"] == "fuoco" else "☠️ "
			GameState.announce("%s%s subisce %d danni da %s." % [emoji, String(c.get("name", cid)), int(dmg["total"]), String(s["tipo"])])


func reset() -> void:
	_superfici.clear()
	_danno_dato_per_round.clear()
	_prossimo_id = 1
	_ultimo_round_processato = -1
