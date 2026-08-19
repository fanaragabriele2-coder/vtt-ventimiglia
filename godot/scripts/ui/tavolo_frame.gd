extends CanvasLayer
## TavoloFrame (Autoload, H5) — la CORNICE del Tavolo Oscuro: un doppio filo d'oro con fregi
## agli angoli che incornicia TUTTO lo schermo, come il bordo di un tomo rilegato. Sottile e
## trasparente al mouse: e' scenografia, non interfaccia. Si ridisegna al ridimensionamento.

const INSET_ESTERNO: float = 5.0
const INSET_INTERNO: float = 11.0
const ORO: Color = Color(0.83, 0.67, 0.33, 0.5)
const ORO_TENUE: Color = Color(0.83, 0.67, 0.33, 0.26)
const FREGIO: float = 34.0

var _tela: Control


func _ready() -> void:
	layer = 92  # sopra i pannelli di gioco: e' il bordo del "tomo", niente lo copre
	_tela = Control.new()
	_tela.set_anchors_preset(Control.PRESET_FULL_RECT)
	_tela.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tela.draw.connect(_disegna)
	add_child(_tela)
	get_viewport().size_changed.connect(func() -> void: _tela.queue_redraw())


func _disegna() -> void:
	var dim: Vector2 = _tela.get_viewport_rect().size
	var est := Rect2(Vector2.ONE * INSET_ESTERNO, dim - Vector2.ONE * INSET_ESTERNO * 2.0)
	var int_r := Rect2(Vector2.ONE * INSET_INTERNO, dim - Vector2.ONE * INSET_INTERNO * 2.0)
	_tela.draw_rect(est, ORO, false, 2.0)
	_tela.draw_rect(int_r, ORO_TENUE, false, 1.0)
	for angolo: Vector2 in [est.position, Vector2(est.end.x, est.position.y),
			Vector2(est.position.x, est.end.y), est.end]:
		_fregio(angolo, dim)


## Il fregio d'angolo: un quarto d'arco + un piccolo rombo, orientati verso il centro.
func _fregio(angolo: Vector2, dim: Vector2) -> void:
	var verso: Vector2 = (dim * 0.5 - angolo).sign()
	var centro_arco: Vector2 = angolo + verso * FREGIO
	var da: float = atan2(-verso.y, -verso.x) - PI * 0.25
	_tela.draw_arc(centro_arco, FREGIO, da, da + PI * 0.5, 12, ORO, 2.0, true)
	var rombo: Vector2 = angolo + verso * (FREGIO * 0.55)
	var punti := PackedVector2Array([
		rombo + Vector2(0, -7), rombo + Vector2(7, 0), rombo + Vector2(0, 7),
		rombo + Vector2(-7, 0),
	])
	_tela.draw_colored_polygon(punti, ORO)
	_tela.draw_circle(rombo, 2.2, Color(0.1, 0.08, 0.06, 0.85))
