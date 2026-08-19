class_name LootPopup
extends Control
## Popup di bottino (modale a schermo intero) — porting del popup del Modulo 15/41. Compare dopo
## la morte di un nemico: elenco oggetti (colorati per rarità, se dell'Armeria) + oro, con
## "Raccogli tutto" (li aggiunge davvero allo zaino) o "Lascia" (scarta). Una coda interna mostra
## un bottino alla volta anche se piu' nemici cadono in rapida successione.

var _subtitle: Label
var _items_box: VBoxContainer
var _queue: Array[Dictionary] = []
var _current: Dictionary = {}


func _ready() -> void:
	visible = false
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build_ui()
	ProgressionManager.loot_ready.connect(_on_loot_ready)


func _build_ui() -> void:
	var backdrop := ColorRect.new()
	backdrop.color = Color(0, 0, 0, 0.6)
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var card := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.08, 0.07)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.6)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(12)
	sb.content_margin_left = 20
	sb.content_margin_right = 20
	sb.content_margin_top = 16
	sb.content_margin_bottom = 16
	card.add_theme_stylebox_override("panel", sb)
	card.custom_minimum_size = Vector2(340, 0)
	center.add_child(card)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	card.add_child(col)

	var title := Label.new()
	title.text = "Bottino"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	col.add_child(title)

	_subtitle = Label.new()
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_subtitle.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	col.add_child(_subtitle)

	_items_box = VBoxContainer.new()
	col.add_child(_items_box)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 10)
	col.add_child(buttons)
	var take_btn := Button.new()
	take_btn.text = "Raccogli tutto"
	take_btn.custom_minimum_size = Vector2(0, 44)
	take_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	take_btn.pressed.connect(_on_take)
	buttons.add_child(take_btn)
	var leave_btn := Button.new()
	leave_btn.text = "Lascia"
	leave_btn.custom_minimum_size = Vector2(0, 44)
	leave_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	leave_btn.pressed.connect(_on_leave)
	buttons.add_child(leave_btn)


func _on_loot_ready(loot: Dictionary) -> void:
	_queue.append(loot)
	if not visible:
		_show_next()


func _show_next() -> void:
	if _queue.is_empty():
		visible = false
		return
	_current = _queue.pop_front()
	_subtitle.text = "Sconfitto: " + String(_current.get("enemyName", ""))
	for child: Node in _items_box.get_children():
		child.queue_free()
	for item_id: Variant in _current.get("items", []):
		var def: Dictionary = InventoryManager.item_definition(String(item_id))
		var rarita: String = ArmeriaManager.rarita_di(String(item_id))
		var col: Color = ArmeriaManager.colore_rarita(rarita) if not rarita.is_empty() else Color(0.85, 0.8, 0.7)
		var lbl := Label.new()
		lbl.text = "• " + String(def.get("name", String(item_id)))
		lbl.add_theme_color_override("font_color", col)
		_items_box.add_child(lbl)
	var gold: int = int(_current.get("gold", 0))
	if gold > 0:
		var gl := Label.new()
		gl.text = "🪙 %d monete d'oro" % gold
		gl.add_theme_color_override("font_color", Color(0.91, 0.77, 0.32))
		_items_box.add_child(gl)
	visible = true


func _on_take() -> void:
	ProgressionManager.collect_loot(_current)
	_show_next()


func _on_leave() -> void:
	_show_next()
