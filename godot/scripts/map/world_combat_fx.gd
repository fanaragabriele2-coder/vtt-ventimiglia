class_name WorldCombatFX
extends Node2D
## Animazione del COMBATTIMENTO sul Mondo cucito: finora i token restavano immobili mentre lo
## scontro si risolveva coi pulsanti sotto la mappa. Questo overlay reagisce ai signal di
## CombatManager e da' vita al colpo direttamente sulla mappa dove stanno i token:
##  - MISCHIA: l'attaccante SCATTA verso il bersaglio e torna (affondo), impatto sul bersaglio;
##  - DISTANZA (arcieri/maghi, gittata > 1): parte un PROIETTILE dall'attaccante al bersaglio;
##  - IMPATTO: anello che si espande + scintille sul bersaglio;
##  - NUMERI: danno "-N" (rosso, "CRIT! -N" giallo sui critici) e cura "+N" (verde) che salgono;
##  - MANCATO: un piccolo "✗" grigio sul bersaglio.
##
## ORDINE DEI SIGNAL (importante): dentro resolve_attack, combatant_damaged (ed eventualmente
## combatant_defeated, che RIMUOVE il token) vengono emessi PRIMA di attack_resolved. Percio':
##  - la posizione del bersaglio si cattura in _su_danno (token ancora presente) e si ricorda in
##    _pos_recente, cosi' anche il COLPO DI GRAZIA mostra numero, scintilla e affondo;
##  - il numero di danno si crea in differita (call_deferred) leggendo il flag di critico che
##    _su_attacco imposta subito dopo: cosi' il "CRIT!" e' corretto senza dipendere dall'ordine.
## Le posizioni arrivano dai due layer dei token (party e nemici): l'affondo sposta il token vero
## (applica_scatto), il resto e' disegnato qui sopra, in scala-schermo (leggibile a ogni zoom).

const DURATA_PROIETTILE: float = 0.20
const DURATA_SCINTILLA: float = 0.34
const DURATA_NUMERO: float = 0.95
const SALITA_NUMERO_PX: float = 46.0
const COL_DANNO: Color = Color(0.92, 0.26, 0.22)
const COL_CRIT: Color = Color(1.0, 0.83, 0.28)
const COL_CURA: Color = Color(0.40, 0.85, 0.45)
const COL_MANCATO: Color = Color(0.78, 0.78, 0.74)
const COL_PROIETTILE: Color = Color(1.0, 0.86, 0.5)

var _camera: Camera2D
var _party: WorldTokens
var _nemici: WorldEnemyTokens
var _proiettili: Array[Dictionary] = []
var _scintille: Array[Dictionary] = []
var _numeri: Array[Dictionary] = []
var _crit_bersaglio: Dictionary = {}   # target_id -> true: il prossimo danno e' un critico
var _pos_recente: Dictionary = {}       # target_id -> Vector2: ultima posizione (colpo di grazia)


func configura(camera: Camera2D, party: WorldTokens, nemici: WorldEnemyTokens) -> void:
	_camera = camera
	_party = party
	_nemici = nemici
	CombatManager.attack_resolved.connect(_su_attacco)
	CombatManager.combatant_damaged.connect(_su_danno)
	CombatManager.combatant_healed.connect(_su_cura)
	CombatManager.combat_ended.connect(_su_fine)
	set_process(false)


## Posizione MONDO di un combattente (nemico o party), null se il token non e' sulla mappa.
func _posizione(combatant_id: String) -> Variant:
	if _nemici != null:
		var pn: Variant = _nemici.posizione_di(combatant_id)
		if pn != null:
			return pn
	if _party != null:
		return _party.posizione_di(combatant_id)
	return null


func _su_attacco(result: Dictionary) -> void:
	var attaccante: String = String(result.get("attacker", ""))
	var bersaglio: String = String(result.get("target", ""))
	# Il bersaglio potrebbe essere gia' stato rimosso (colpo di grazia): ripiega sull'ultima nota.
	var pos_ber_v: Variant = _posizione(bersaglio)
	if pos_ber_v == null:
		pos_ber_v = _pos_recente.get(bersaglio)
	if pos_ber_v == null:
		return
	var pos_ber: Vector2 = pos_ber_v
	if not bool(result.get("hit", false)):
		var testo: String = "fuori gittata" if bool(result.get("outOfRange", false)) else "✗"
		_numeri.append({ "pos": pos_ber, "t": 0.0, "testo": testo, "colore": COL_MANCATO })
		_riavvia()
		return
	if bool(result.get("critical", false)):
		_crit_bersaglio[bersaglio] = true
	var pos_att_v: Variant = _posizione(attaccante)
	if pos_att_v == null:
		_scintille.append({ "pos": pos_ber, "t": 0.0, "crit": bool(result.get("critical", false)) })
		_riavvia()
		return
	var pos_att: Vector2 = pos_att_v
	var dir: Vector2 = (pos_ber - pos_att)
	dir = dir.normalized() if dir.length() > 0.01 else Vector2.RIGHT
	if CombatManager.attack_range_of(attaccante) > 1:
		_proiettili.append({ "from": pos_att, "to": pos_ber, "t": 0.0 })
	else:
		_scatta(attaccante, dir)
		_scintille.append({ "pos": pos_ber, "t": 0.0, "crit": bool(result.get("critical", false)) })
	_riavvia()


func _su_danno(combatant_id: String, amount: int, _hp: int) -> void:
	# Cattura la posizione ADESSO (il token c'e' ancora anche se questo colpo lo abbatte); il
	# numero si crea in differita, quando _su_attacco ha gia' impostato l'eventuale critico.
	var pos: Variant = _posizione(combatant_id)
	if pos == null:
		return
	_pos_recente[combatant_id] = pos
	_crea_numero_danno.call_deferred(pos, combatant_id, amount)


func _crea_numero_danno(pos: Vector2, combatant_id: String, amount: int) -> void:
	var crit: bool = _crit_bersaglio.erase(combatant_id)
	_numeri.append({
		"pos": pos, "t": 0.0, "crit": crit,
		"testo": ("CRIT! -%d" % amount) if crit else "-%d" % amount,
		"colore": COL_CRIT if crit else COL_DANNO,
	})
	_riavvia()


func _su_cura(combatant_id: String, amount: int, _hp: int) -> void:
	var pos: Variant = _posizione(combatant_id)
	if pos == null:
		return
	_numeri.append({ "pos": pos, "t": 0.0, "testo": "+%d" % amount, "colore": COL_CURA })
	_riavvia()


func _su_fine() -> void:
	_crit_bersaglio.clear()
	_pos_recente.clear()


func _scatta(combatant_id: String, direzione: Vector2) -> void:
	if _nemici != null and _nemici.posizione_di(combatant_id) != null:
		_nemici.applica_scatto(combatant_id, direzione)
	elif _party != null:
		_party.applica_scatto(combatant_id, direzione)


func _riavvia() -> void:
	set_process(true)
	queue_redraw()


func _process(delta: float) -> void:
	for p: Dictionary in _proiettili:
		p["t"] = float(p["t"]) + delta
		if float(p["t"]) >= DURATA_PROIETTILE:
			_scintille.append({ "pos": p["to"], "t": 0.0, "crit": false })
	_proiettili = _proiettili.filter(func(p: Dictionary) -> bool:
		return float(p["t"]) < DURATA_PROIETTILE)
	for s: Dictionary in _scintille:
		s["t"] = float(s["t"]) + delta
	_scintille = _scintille.filter(func(s: Dictionary) -> bool:
		return float(s["t"]) < DURATA_SCINTILLA)
	for n: Dictionary in _numeri:
		n["t"] = float(n["t"]) + delta
	_numeri = _numeri.filter(func(n: Dictionary) -> bool:
		return float(n["t"]) < DURATA_NUMERO)
	queue_redraw()
	if _proiettili.is_empty() and _scintille.is_empty() and _numeri.is_empty():
		set_process(false)


## Fattore scala-schermo: gli effetti restano leggibili sia da vicino che col mondo intero.
func _scala() -> float:
	return maxf(1.0, 1.0 / maxf(_camera.zoom.x, 0.01))


func _draw() -> void:
	if _camera == null:
		return
	var s: float = _scala()
	var font: Font = ThemeDB.fallback_font

	for p: Dictionary in _proiettili:
		var q: float = clampf(float(p["t"]) / DURATA_PROIETTILE, 0.0, 1.0)
		var punto: Vector2 = (p["from"] as Vector2).lerp(p["to"] as Vector2, q)
		var scia: Vector2 = (p["from"] as Vector2).lerp(p["to"] as Vector2, maxf(0.0, q - 0.12))
		draw_line(scia, punto, Color(COL_PROIETTILE, 0.5), 3.0 * s)
		draw_circle(punto, 5.0 * s, COL_PROIETTILE)

	for sp: Dictionary in _scintille:
		var qs: float = clampf(float(sp["t"]) / DURATA_SCINTILLA, 0.0, 1.0)
		var col: Color = COL_CRIT if bool(sp.get("crit", false)) else COL_DANNO
		col.a = 1.0 - qs
		var raggio: float = (10.0 + 34.0 * qs) * s
		draw_arc((sp["pos"] as Vector2), raggio, 0.0, TAU, 28, col, 3.0 * s)
		for i: int in range(6):
			var ang: float = TAU * float(i) / 6.0
			var da: Vector2 = Vector2.from_angle(ang) * raggio * 0.7
			var a: Vector2 = Vector2.from_angle(ang) * raggio
			draw_line((sp["pos"] as Vector2) + da, (sp["pos"] as Vector2) + a, col, 2.0 * s)

	for n: Dictionary in _numeri:
		var qn: float = clampf(float(n["t"]) / DURATA_NUMERO, 0.0, 1.0)
		var crit: bool = bool(n.get("crit", false))
		var colore: Color = n["colore"]
		colore.a = 1.0 - qn * qn
		var dim: int = int((26.0 if crit else 20.0) * s)
		var largh: float = 240.0 * s
		var base: Vector2 = (n["pos"] as Vector2) + Vector2(0.0, -SALITA_NUMERO_PX * s * qn - 20.0 * s)
		var pos: Vector2 = base - Vector2(largh * 0.5, 0.0)
		draw_string(font, pos + Vector2(1.5 * s, 1.5 * s), String(n["testo"]),
			HORIZONTAL_ALIGNMENT_CENTER, largh, dim, Color(0, 0, 0, colore.a * 0.8))
		draw_string(font, pos, String(n["testo"]),
			HORIZONTAL_ALIGNMENT_CENTER, largh, dim, colore)
