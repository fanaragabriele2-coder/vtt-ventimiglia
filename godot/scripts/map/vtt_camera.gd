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
# Limite minimo di zoom EFFETTIVO: parte da ZOOM_MIN ma adatta_a() lo abbassa quando inquadra un
# mondo piu' grande dello schermo — altrimenti il primo colpo di rotellina dopo l'inquadratura
# scatterebbe di colpo da ~0.05 a 0.4 (13x in un frame) invece di zoomare dolcemente.
var _zoom_min: float = ZOOM_MIN


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
	var nuovo_zoom: float = clampf(_target_zoom * fattore, _zoom_min, ZOOM_MAX)
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


## Inquadra l'INTERO rettangolo del mondo (usato dal "Mondo cucito": all'apertura si vede tutta la
## mega-mappa, poi si zooma coi comandi). Puo' scendere SOTTO ZOOM_MIN: un open-world cucito e'
## molto piu' grande dello schermo, quindi qui il limite minimo di zoom non deve valere.
func adatta_a(rect: Rect2) -> void:
	if rect.size.x <= 0.0 or rect.size.y <= 0.0:
		return
	var vp: Vector2 = get_viewport_rect().size
	if vp.x <= 0.0 or vp.y <= 0.0:
		vp = Vector2(1152, 648)  # fallback se il viewport non ha ancora una dimensione
	var fit: float = minf(vp.x / rect.size.x, vp.y / rect.size.y) * 0.95
	_target_zoom = clampf(fit, 0.03, ZOOM_MAX)  # floor bassissimo: la mega-mappa ci sta tutta
	# Il fit diventa il nuovo pavimento di zoom: dalla vista "mondo intero" la rotellina riparte
	# esattamente da li' (niente scatto verso ZOOM_MIN) e non si puo' arretrare oltre il mondo.
	_zoom_min = minf(ZOOM_MIN, _target_zoom)
	zoom = Vector2(_target_zoom, _target_zoom)
	centra_su(rect.get_center())


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
