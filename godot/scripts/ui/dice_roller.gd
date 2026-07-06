class_name DiceRoller
extends PanelContainer
## Tiratore di dadi rapido — porting FUNZIONALE (non grafico) del Modulo 8 "3D Dice Engine": niente
## fisica 3D qui (gap noto, vedi README), ma la stessa funzione base — tira 1dN e annuncia il
## risultato nel canale unico di sistema (GameState.announce), cosi' compare nel log della Chat
## Master esattamente come un tiro del monolite.

const _FACES: Array[int] = [4, 6, 8, 10, 12, 20]

var _result_label: Label


func _ready() -> void:
	_apply_style()
	_build_ui()


func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.055, 0.05, 0.043)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.35)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	add_theme_stylebox_override("panel", sb)


func _build_ui() -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	add_child(row)

	var title := Label.new()
	title.text = "🎲 Dadi:"
	title.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	row.add_child(title)

	for faces: int in _FACES:
		var b := Button.new()
		b.text = "D%d" % faces
		b.custom_minimum_size = Vector2(0, 40)
		b.pressed.connect(_on_die_pressed.bind(faces))
		row.add_child(b)

	_result_label = Label.new()
	_result_label.text = "–"
	_result_label.custom_minimum_size = Vector2(50, 0)
	_result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result_label.add_theme_font_size_override("font_size", 20)
	_result_label.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	row.add_child(_result_label)


func _on_die_pressed(faces: int) -> void:
	var result: int = randi_range(1, faces)
	_result_label.text = str(result)
	GameState.announce("🎲 Tiro D%d: %d" % [faces, result])
