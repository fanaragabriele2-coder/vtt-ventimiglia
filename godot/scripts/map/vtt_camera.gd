class_name VTTCamera
extends Camera2D
## Camera del VTT — pan col trascinamento, zoom verso il cursore, limiti mappa.
##
## Movimento con SMORZAMENTO ESPONENZIALE indipendente dal framerate (1 - exp(-k*dt)): la camera
## insegue un bersaglio (_target_pos/_target_zoom) invece di scattare — fluida a qualunque fps,
## e costa una lerp per frame (client leggero). Lo zoom con la rotellina mantiene FERMO il punto
## del mondo sotto il cursore (zoom-to-cursor). I limiti impediscono di uscire dalla mappa.

const ZOOM_MIN: float = 0.4
const ZOOM_MAX: float = 3.0
const ZOOM_STEP: float = 1.12     # fattore per scatto di rotellina
const SMOOTHNESS: float = 12.0    # velocita' d'inseguimento del bersaglio (piu' alto = piu' reattivo)

var _target_pos: Vector2 = Vector2.ZERO
var _target_zoom: float = 1.2
var _dragging: bool = false
var _limiti: Rect2 = Rect2()      # bounds del mondo (in pixel); Rect2() = nessun limite


func _ready() -> void:
	_target_pos = position
	_target_zoom = zoom.x
	make_current()


func _process(delta: float) -> void:
	# Smorzamento esponenziale: stessa "morbidezza" a 30 come a 240 fps.
	var t: float = 1.0 - exp(-SMOOTHNESS * delta)
	position = position.lerp(_target_pos, t)
	var z: float = lerpf(zoom.x, _target_zoom, t)
	zoom = Vector2(z, z)


func _unhandled_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb != null:
		if mb.button_index == MOUSE_BUTTON_MIDDLE or mb.button_index == MOUSE_BUTTON_RIGHT:
			_dragging = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_zoom_verso_cursore(ZOOM_STEP)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_zoom_verso_cursore(1.0 / ZOOM_STEP)
		return
	var mm := event as InputEventMouseMotion
	if mm != null and _dragging:
		# Diviso per lo zoom: a zoom alto un pixel di mouse = meno mondo (pan 1:1 percepito).
		_target_pos -= mm.relative / zoom.x
		_clamp_target()


## Zoom mantenendo fermo il punto del mondo sotto il cursore: il bersaglio della camera si sposta
## lungo la retta cursore->centro in proporzione al rapporto vecchio/nuovo zoom.
func _zoom_verso_cursore(fattore: float) -> void:
	var nuovo_zoom: float = clampf(_target_zoom * fattore, ZOOM_MIN, ZOOM_MAX)
	if is_equal_approx(nuovo_zoom, _target_zoom):
		return
	var mouse_world: Vector2 = get_global_mouse_position()
	_target_pos = mouse_world + (_target_pos - mouse_world) * (_target_zoom / nuovo_zoom)
	_target_zoom = nuovo_zoom
	_clamp_target()


## Confina la camera dentro il rettangolo del mondo (in pixel). Chiamalo dopo ogni generazione.
func imposta_limiti(rect: Rect2) -> void:
	_limiti = rect
	_clamp_target()


## Salta subito su un punto (niente inseguimento): usato dopo la generazione per centrare lo spawn.
func centra_su(world_pos: Vector2) -> void:
	_target_pos = world_pos
	_clamp_target()
	position = _target_pos


func _clamp_target() -> void:
	if _limiti.size == Vector2.ZERO:
		return
	# Mezzo schermo in coordinate mondo: la camera non deve mostrare oltre il bordo mappa.
	var half: Vector2 = get_viewport_rect().size * 0.5 / _target_zoom
	_target_pos.x = _clamp_asse(_target_pos.x, _limiti.position.x + half.x, _limiti.end.x - half.x, _limiti.get_center().x)
	_target_pos.y = _clamp_asse(_target_pos.y, _limiti.position.y + half.y, _limiti.end.y - half.y, _limiti.get_center().y)


## Se la mappa e' piu' piccola dello schermo su un asse (minimo > massimo), si centra e basta.
static func _clamp_asse(v: float, v_min: float, v_max: float, centro: float) -> float:
	if v_min > v_max:
		return centro
	return clampf(v, v_min, v_max)
