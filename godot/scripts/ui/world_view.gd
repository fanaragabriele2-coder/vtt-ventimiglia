class_name WorldView
extends Control
## Vista "🌍 Mondo" — incapsula il WorldBuilder (open-world cucito dalle battlemap dell'utente)
## in un SubViewport con la camera VTT (pan col destro, zoom sulla rotellina), come NexusView.
## In alto una mini-toolbar per il ciclo del giorno (CanvasModulate globale del mondo).

const ORE_BOTTONI: Array[Array] = [
	["☀ Giorno", "giorno"], ["🌇 Tramonto", "tramonto"],
	["🌙 Notte", "notte"], ["🕯 Dungeon", "dungeon"],
]

var _builder: WorldBuilder


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	_build_viewport()
	_build_toolbar()


func _build_viewport() -> void:
	var container := SubViewportContainer.new()
	container.stretch = true
	container.set_anchors_preset(Control.PRESET_FULL_RECT)
	container.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(container)

	var viewport := SubViewport.new()
	viewport.handle_input_locally = true
	viewport.gui_disable_input = false
	viewport.transparent_bg = false
	container.add_child(viewport)

	_builder = WorldBuilder.new()
	viewport.add_child(_builder)


func _build_toolbar() -> void:
	var panel := PanelContainer.new()
	panel.position = Vector2(8, 8)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.045, 0.9)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 8
	sb.content_margin_right = 8
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", sb)
	add_child(panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	panel.add_child(row)
	var titolo := Label.new()
	titolo.text = "🌍 Mondo:"
	titolo.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	row.add_child(titolo)
	for voce: Array in ORE_BOTTONI:
		var b := Button.new()
		b.text = String(voce[0])
		b.custom_minimum_size = Vector2(0, 34)
		b.pressed.connect(_builder.imposta_ora.bind(String(voce[1])))
		row.add_child(b)
