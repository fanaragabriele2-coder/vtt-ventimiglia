class_name XpBar
extends PanelContainer
## Barra XP (colonna sinistra, sotto la scheda PG) — porting della barra del Modulo 15. Mostra
## livello/nome/oro/progresso XP del PG ATTIVO; si aggiorna sui signal di ProgressionManager e
## CharacterManager (nessuno stato duplicato: legge sempre get_prog()/xp_band() al volo).

var _level_label: Label
var _name_label: Label
var _gold_label: Label
var _bar: ProgressBar
var _xp_label: Label


func _ready() -> void:
	_apply_style()
	_build_ui()
	ProgressionManager.xp_gained.connect(_on_xp_gained)
	ProgressionManager.leveled_up.connect(_on_leveled_up)
	CharacterManager.active_character_changed.connect(_on_active_changed)
	CharacterManager.party_changed.connect(_on_party_changed)
	_refresh()


func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.07, 0.06, 0.05)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	add_theme_stylebox_override("panel", sb)


func _build_ui() -> void:
	var col := VBoxContainer.new()
	add_child(col)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	col.add_child(top)
	_level_label = Label.new()
	_level_label.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	top.add_child(_level_label)
	_name_label = Label.new()
	_name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(_name_label)
	_gold_label = Label.new()
	_gold_label.add_theme_color_override("font_color", Color(0.91, 0.77, 0.32))
	top.add_child(_gold_label)
	_bar = ProgressBar.new()
	_bar.show_percentage = false
	_bar.custom_minimum_size = Vector2(0, 10)
	col.add_child(_bar)
	_xp_label = Label.new()
	_xp_label.add_theme_font_size_override("font_size", 11)
	_xp_label.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	col.add_child(_xp_label)


func _on_xp_gained(_character_id: String, _amount: int, _reason: String) -> void:
	_refresh()


func _on_leveled_up(_character_id: String, _from_level: int, _to_level: int, _hp_gain: int) -> void:
	_refresh()


func _on_active_changed(_index: int, _active: CharacterData) -> void:
	_refresh()


func _on_party_changed(_party: Array) -> void:
	_refresh()


func _refresh() -> void:
	var active: CharacterData = CharacterManager.get_active()
	if active == null:
		return
	var prog: Dictionary = ProgressionManager.get_prog(active.id)
	var band: Dictionary = ProgressionManager.xp_band(active.id)
	_level_label.text = "Liv %d" % int(prog["level"])
	_name_label.text = active.character_name
	_gold_label.text = "🪙 %d" % int(prog.get("gold", 0))
	_bar.max_value = maxi(1, int(band["need"]))
	_bar.value = int(band["cur"])
	_xp_label.text = "MAX" if int(prog["level"]) >= 20 else "%d / %d XP" % [int(band["cur"]), int(band["need"])]
