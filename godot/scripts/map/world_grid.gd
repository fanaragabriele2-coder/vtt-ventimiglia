class_name WorldGrid
extends Node2D
## Griglia da battaglia sovrapposta al Mondo cucito (opzionale, dal pulsante "▦ Griglia").
##
## Tre accorgimenti la rendono GRATIS anche su un mondo enorme:
## 1. si disegnano SOLO le linee dentro l'inquadratura corrente (+una cella di margine), mai
##    l'intero mondo — a qualunque zoom sono poche decine di draw_line;
## 2. il redraw parte solo quando l'inquadratura CAMBIA davvero (pan/zoom), non a ogni frame;
## 3. sotto ~6 px di cella su schermo la griglia sparisce da sola: a quel livello di zoom le
##    linee collasserebbero in moire' illeggibile (e sarebbero migliaia).
## Lo spessore e' costante SU SCHERMO (diviso per lo zoom): linee sottili a ogni ingrandimento.

const SPESSORE_SCHERMO_PX: float = 1.5
const CELLA_MIN_SCHERMO_PX: float = 6.0
const COLORE: Color = Color(0.0, 0.0, 0.0, 0.32)

var _rect: Rect2 = Rect2()      # estensione del mondo cucito (la griglia non esce dai bordi)
var _camera: Camera2D
var _cella: float = 0.0         # lato cella in pixel-mondo; 0 = griglia spenta
var _ultima_vista: Rect2 = Rect2()


func configura(rect_mondo: Rect2, camera: Camera2D) -> void:
	_rect = rect_mondo
	_camera = camera


## 0 = spegni. Qualunque altro valore = lato della cella in pixel della mappa (64/128/256...).
func imposta_cella(px: float) -> void:
	_cella = px
	visible = px > 0.0
	set_process(px > 0.0)
	queue_redraw()


func _process(_delta: float) -> void:
	# Ridisegna solo quando pan/zoom cambiano l'inquadratura: niente churn a camera ferma.
	var vista: Rect2 = _rect_visibile()
	if not vista.is_equal_approx(_ultima_vista):
		_ultima_vista = vista
		queue_redraw()


## Rettangolo del mondo effettivamente inquadrato (viewport / zoom, centrato sulla camera).
func _rect_visibile() -> Rect2:
	if _camera == null or not is_instance_valid(_camera):
		return Rect2()
	var schermo: Vector2 = get_viewport_rect().size
	var estensione: Vector2 = Vector2(
		schermo.x / maxf(_camera.zoom.x, 0.01), schermo.y / maxf(_camera.zoom.y, 0.01)
	)
	return Rect2(_camera.global_position - estensione * 0.5, estensione)


func _draw() -> void:
	if _cella <= 0.0 or _rect.size == Vector2.ZERO or _camera == null:
		return
	if _cella * _camera.zoom.x < CELLA_MIN_SCHERMO_PX:
		return  # celle troppo piccole su schermo: moire' e migliaia di linee, meglio niente
	var vista: Rect2 = _rect_visibile().grow(_cella).intersection(_rect)
	if vista.size.x <= 0.0 or vista.size.y <= 0.0:
		return
	var spessore: float = SPESSORE_SCHERMO_PX / maxf(_camera.zoom.x, 0.01)
	# Prima linea: il multiplo di cella (ancorato all'origine del mondo) >= bordo visibile.
	var x: float = _rect.position.x + ceilf((vista.position.x - _rect.position.x) / _cella) * _cella
	while x <= vista.end.x:
		draw_line(Vector2(x, vista.position.y), Vector2(x, vista.end.y), COLORE, spessore)
		x += _cella
	var y: float = _rect.position.y + ceilf((vista.position.y - _rect.position.y) / _cella) * _cella
	while y <= vista.end.y:
		draw_line(Vector2(vista.position.x, y), Vector2(vista.end.x, y), COLORE, spessore)
		y += _cella
