class_name WorldWeather
extends Node2D
## METEO DI REGIONE sul Mondo cucito (Fase G4): pioggia sulla Landa, cenere e braci nei domini
## di Mordor, nebbia su paludi e labirinti di roccia. Vive SOPRA i token (la pioggia cade anche
## sugli eroi) e sotto gli effetti di combattimento.
##
## Le particelle sono disegnate a mano (_draw) dentro il rettangolo della CAMERA: poche decine
## di primitive che si riavvolgono ai bordi della vista — costo costante a qualunque zoom, zero
## nodi particle. Il modo cambia con la regione: JourneyEvents pubblica "regione:cambiata"
## (campo "meteo" del JSON delle regioni) quando la marcia entra in una zona nuova; fuori dalla
## Terra di Mezzo il cielo resta sereno.

const N_PIOGGIA: int = 110
const N_CENERE: int = 70
const N_NEBBIA: int = 12
const COL_PIOGGIA: Color = Color(0.62, 0.72, 0.85, 0.42)
const COL_CENERE: Color = Color(0.16, 0.15, 0.16, 0.55)
const COL_BRACE: Color = Color(0.95, 0.45, 0.15, 0.7)
const COL_NEBBIA: Color = Color(0.78, 0.8, 0.78, 0.05)

var _rect: Rect2
var _camera: Camera2D
var _modo: String = "sereno"
var _particelle: Array[Dictionary] = []   # { "pos", "vel": Vector2, "dim": float, "brace": bool }
var _rng := RandomNumberGenerator.new()


func configura(rect_mondo: Rect2, camera: Camera2D) -> void:
	_rect = rect_mondo
	_camera = camera
	_rng.randomize()
	GameState.event_published.connect(_su_evento)
	set_process(true)


## Cambia il tempo ("pioggia", "cenere", "nebbia", "sereno"): le particelle ripartono da zero.
func imposta_modo(modo: String) -> void:
	if modo == _modo:
		return
	_modo = modo
	_particelle.clear()
	queue_redraw()


func _su_evento(nome_evento: String, payload: Variant) -> void:
	if nome_evento == "regione:cambiata" and payload is Dictionary:
		imposta_modo(String((payload as Dictionary).get("meteo", "sereno")))


func _process(delta: float) -> void:
	if _modo == "sereno" or _camera == null:
		return
	var vista: Rect2 = _vista_camera()
	_assicura_particelle(vista)
	var vento: float = sin(Time.get_ticks_msec() / 2600.0) * 30.0
	for p: Dictionary in _particelle:
		var pos: Vector2 = p["pos"]
		pos += ((p["vel"] as Vector2) + Vector2(vento, 0)) * delta
		# Riavvolgimento nella vista: chi esce da un lato rientra dall'altro.
		if pos.y > vista.end.y:
			pos.y = vista.position.y
			pos.x = vista.position.x + _rng.randf() * vista.size.x
		if pos.x > vista.end.x:
			pos.x = vista.position.x
		elif pos.x < vista.position.x:
			pos.x = vista.end.x
		p["pos"] = pos
	queue_redraw()


func _draw() -> void:
	if _modo == "sereno":
		return
	var scala: float = 1.0 / maxf(_camera.zoom.x, 0.05)
	for p: Dictionary in _particelle:
		var pos: Vector2 = p["pos"]
		var dim: float = float(p["dim"]) * scala
		match _modo:
			"pioggia":
				var coda: Vector2 = (p["vel"] as Vector2).normalized() * dim * 9.0
				draw_line(pos, pos + coda, COL_PIOGGIA, maxf(1.5, dim * 0.5), true)
			"cenere":
				draw_circle(pos, dim, COL_BRACE if bool(p.get("brace", false)) else COL_CENERE)
			"nebbia":
				# Tre cerchi concentrici a bassa alpha: un banco morbido senza shader.
				draw_circle(pos, dim * 3.0, COL_NEBBIA)
				draw_circle(pos, dim * 2.0, COL_NEBBIA)
				draw_circle(pos, dim, COL_NEBBIA)


## Il rettangolo del mondo inquadrato dalla camera (con un margine perche' nulla "sbuchi").
func _vista_camera() -> Rect2:
	var mezzo: Vector2 = get_viewport_rect().size / maxf(_camera.zoom.x, 0.05) * 0.6
	return Rect2(_camera.position - mezzo, mezzo * 2.0)


## Popola (o ripopola dopo un cambio modo/zoom) le particelle dentro la vista corrente.
func _assicura_particelle(vista: Rect2) -> void:
	var quante: int = N_PIOGGIA if _modo == "pioggia" else \
		(N_CENERE if _modo == "cenere" else N_NEBBIA)
	while _particelle.size() < quante:
		_particelle.append(_nuova_particella(vista))
	while _particelle.size() > quante:
		_particelle.pop_back()


func _nuova_particella(vista: Rect2) -> Dictionary:
	var pos := Vector2(vista.position.x + _rng.randf() * vista.size.x,
		vista.position.y + _rng.randf() * vista.size.y)
	match _modo:
		"pioggia":
			return { "pos": pos, "vel": Vector2(140, 640 + _rng.randf() * 260),
				"dim": 1.6 + _rng.randf() * 1.4 }
		"cenere":
			return { "pos": pos, "vel": Vector2(30 - _rng.randf() * 60, 55 + _rng.randf() * 65),
				"dim": 2.0 + _rng.randf() * 2.6, "brace": _rng.randf() < 0.14 }
	return { "pos": pos, "vel": Vector2(14 + _rng.randf() * 12, 4 - _rng.randf() * 8),
		"dim": 60.0 + _rng.randf() * 90.0 }
