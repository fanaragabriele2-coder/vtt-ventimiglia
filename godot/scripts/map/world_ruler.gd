class_name WorldRuler
extends Node2D
## Righello del Mondo cucito: con "📏 Righello" attivo, click-e-trascina col sinistro misura
## la distanza in CELLE e in METRI (convenzione D&D 5e: 1 cella = 1,5 m / 5 piedi).
## La misura resta visibile dopo il rilascio (si legge con calma), sparisce alla prossima
## misura o spegnendo il righello. Linea, estremi e testo scalano con lo zoom: leggibili
## sia sul villaggio che sul mondo intero.

## Lato cella per il conteggio (segue la griglia della vista; 128 quando la griglia e' spenta).
var cella: float = 128.0

var _attivo: bool = false
var _camera: Camera2D
var _inizio: Vector2
var _fine: Vector2
var _valida: bool = false      # c'e' una misura da mostrare
var _misurando: bool = false
var _ultimo_zoom: float = 0.0


func configura(camera: Camera2D) -> void:
	_camera = camera
	set_process(true)


func imposta_attivo(valore: bool) -> void:
	_attivo = valore
	if not valore:
		_valida = false
		_misurando = false
		queue_redraw()


func attivo() -> bool:
	return _attivo


func _process(_delta: float) -> void:
	# Testo e spessori sono in scala-schermo: al cambio di zoom la misura va ridisegnata.
	if _valida and _camera != null and not is_equal_approx(_camera.zoom.x, _ultimo_zoom):
		_ultimo_zoom = _camera.zoom.x
		queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if not _attivo:
		return
	var mb := event as InputEventMouseButton
	if mb != null and mb.button_index == MOUSE_BUTTON_LEFT:
		if mb.pressed:
			_inizio = get_global_mouse_position()
			_fine = _inizio
			_misurando = true
			_valida = true
		else:
			_misurando = false
		queue_redraw()
		get_viewport().set_input_as_handled()
		return
	var mm := event as InputEventMouseMotion
	if mm != null and _misurando:
		_fine = get_global_mouse_position()
		queue_redraw()
		get_viewport().set_input_as_handled()


func _draw() -> void:
	if not _valida or _camera == null:
		return
	var zoom: float = maxf(_camera.zoom.x, 0.01)
	var oro := Color(0.9, 0.75, 0.35)
	draw_line(_inizio, _fine, Color(0, 0, 0, 0.6), 5.0 / zoom)
	draw_line(_inizio, _fine, oro, 2.5 / zoom)
	draw_circle(_inizio, 6.0 / zoom, oro)
	draw_circle(_fine, 6.0 / zoom, oro)

	var distanza: float = _inizio.distance_to(_fine)
	var celle: float = distanza / maxf(cella, 1.0)
	var testo: String = "%.1f celle  ·  %.1f m" % [celle, celle * 1.5]
	var dim: int = int(22.0 / zoom)
	var centro: Vector2 = (_inizio + _fine) * 0.5 + Vector2(0.0, -14.0 / zoom)
	var font: Font = ThemeDB.fallback_font
	var mezza: float = 260.0 / zoom
	draw_string(font, centro + Vector2(-mezza + 2.0 / zoom, 2.0 / zoom), testo,
		HORIZONTAL_ALIGNMENT_CENTER, mezza * 2.0, dim, Color(0, 0, 0, 0.8))
	draw_string(font, centro + Vector2(-mezza, 0), testo,
		HORIZONTAL_ALIGNMENT_CENTER, mezza * 2.0, dim, Color(0.98, 0.94, 0.85))
