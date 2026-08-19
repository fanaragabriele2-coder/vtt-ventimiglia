class_name DiceRoller
extends PanelContainer
## Tiratore di dadi rapido (Modulo 8 "3D Dice Engine"). Di default i tiri vanno al vassoio 3D
## FISICO (DiceTray3D, trovato via gruppo "vassoio_dadi_3d"): dadi veri che rotolano sul feltro,
## risultato letto dalla faccia in alto. Il toggle "3D" permette di tornare al tiro istantaneo
## (utile quando serve solo il numero, senza la scenetta). In entrambi i casi il risultato passa
## per il canale unico di sistema (GameState.announce) e compare nel log della Chat Master.

const _FACES: Array[int] = [4, 6, 8, 10, 12, 20]

var _result_label: Label
var _btn_3d: Button
var _usa_3d: bool = true
var _vassoio_connesso: bool = false


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

	_btn_3d = Button.new()
	_btn_3d.text = "3D: ON"
	_btn_3d.tooltip_text = "Dadi fisici che rotolano sul tavolo (spegni per il tiro istantaneo)"
	_btn_3d.custom_minimum_size = Vector2(0, 40)
	_btn_3d.pressed.connect(_toggle_3d)
	row.add_child(_btn_3d)

	_result_label = Label.new()
	_result_label.text = "–"
	_result_label.custom_minimum_size = Vector2(50, 0)
	_result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result_label.add_theme_font_size_override("font_size", 20)
	_result_label.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	row.add_child(_result_label)


func _toggle_3d() -> void:
	_usa_3d = not _usa_3d
	_btn_3d.text = "3D: ON" if _usa_3d else "3D: OFF"


func _vassoio() -> DiceTray3D:
	return get_tree().get_first_node_in_group("vassoio_dadi_3d") as DiceTray3D


func _on_die_pressed(faces: int) -> void:
	var vassoio: DiceTray3D = _vassoio()
	if _usa_3d and vassoio:
		if not _vassoio_connesso:
			vassoio.tiro_completato.connect(_on_tiro_3d)
			_vassoio_connesso = true
		vassoio.tira(faces)
		return
	var result: int = randi_range(1, faces)
	_result_label.text = str(result)
	GameState.announce("🎲 Tiro D%d: %d" % [faces, result])


func _on_tiro_3d(_facce: int, totale: int, _singoli: PackedInt32Array) -> void:
	_result_label.text = str(totale)
