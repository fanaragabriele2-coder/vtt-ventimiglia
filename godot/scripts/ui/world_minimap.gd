class_name WorldMinimap
extends Control
## Minimappa del Mondo cucito (angolo in basso a destra della vista "🧩 Mondo").
##
## Mostra la miniatura dell'INTERO mondo (composta una volta sola al caricamento dal
## WorldBuilder: nessun costo per frame) con sopra il rettangolo di cio' che la camera sta
## inquadrando ora. UN CLICK sulla minimappa teletrasporta la camera in quel punto del mondo:
## la navigazione di un open-world gigante diventa un gesto solo.
## Il redraw parte solo quando l'inquadratura cambia (pan/zoom), non a ogni frame.

const COLORE_BORDO: Color = Color(0.78, 0.61, 0.24, 0.9)   # oro della UI del VTT
const COLORE_VISTA: Color = Color(1.0, 1.0, 1.0, 0.9)
const COLORE_FONDO: Color = Color(0.0, 0.0, 0.0, 0.35)

var _tex: Texture2D
var _rect_mondo: Rect2 = Rect2()
var _camera: VTTCamera
var _ultima_vista: Rect2 = Rect2()


func _ready() -> void:
	tooltip_text = "Minimappa del mondo cucito: un click sposta la camera in quel punto."


## Aggancia (o ri-aggancia, dopo un "Ricarica mappe") miniatura, estensione del mondo e camera.
## Con tex null (nessuna mappa caricata) la minimappa si nasconde da sola.
func configura(tex: Texture2D, rect_mondo: Rect2, camera: VTTCamera) -> void:
	_tex = tex
	_rect_mondo = rect_mondo
	_camera = camera
	visible = tex != null and rect_mondo.size.x > 0.0 and rect_mondo.size.y > 0.0
	if visible:
		custom_minimum_size = _tex.get_size()
		size = _tex.get_size()
	set_process(visible)
	queue_redraw()


func _process(_delta: float) -> void:
	var vista: Rect2 = _vista_camera()
	if not vista.is_equal_approx(_ultima_vista):
		_ultima_vista = vista
		queue_redraw()


## Rettangolo-mondo inquadrato dalla camera (nel SUO viewport: il SubViewport della vista).
func _vista_camera() -> Rect2:
	if _camera == null or not is_instance_valid(_camera):
		return Rect2()
	var schermo: Vector2 = _camera.get_viewport_rect().size
	var estensione: Vector2 = schermo / maxf(_camera.zoom.x, 0.01)
	return Rect2(_camera.global_position - estensione * 0.5, estensione)


func _draw() -> void:
	if _tex == null:
		return
	draw_rect(Rect2(Vector2.ZERO, size), COLORE_FONDO)
	draw_texture(_tex, Vector2.ZERO)
	draw_rect(Rect2(Vector2.ZERO, size), COLORE_BORDO, false, 1.0)
	var vista: Rect2 = _vista_camera().intersection(_rect_mondo)
	if vista.size.x <= 0.0 or vista.size.y <= 0.0:
		return
	var scala: Vector2 = size / _rect_mondo.size
	draw_rect(Rect2((vista.position - _rect_mondo.position) * scala, vista.size * scala),
		COLORE_VISTA, false, 1.5)


## Click sinistro: teletrasporta la camera nel punto del mondo corrispondente (centra_su fa
## anche il clamp ai limiti mappa, quindi cliccare un bordo non porta la camera fuori).
func _gui_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb == null or not mb.pressed or mb.button_index != MOUSE_BUTTON_LEFT:
		return
	if _camera == null or not is_instance_valid(_camera) or _rect_mondo.size.x <= 0.0:
		return
	var scala: Vector2 = _rect_mondo.size / size
	_camera.centra_su(_rect_mondo.position + mb.position * scala)
	accept_event()
