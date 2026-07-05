extends Control
## VTTMain — scena radice. Costruisce il layout a 3 colonne del monolite (Scheda PG · Mappa+Combat ·
## Chat Master) e una toolbar in alto. Ogni pannello si aggancia da solo ai signal dei manager: qui
## si fa solo la composizione + qualche pulsante globale (evoca nemici, ecc.).
##
## E' la scena principale del progetto (project.godot -> run/main_scene = res://main.tscn).

func _ready() -> void:
	_apply_background()
	_build_layout()


func _apply_background() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.color = Color(0.04, 0.035, 0.03)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)


func _build_layout() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	add_child(margin)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	margin.add_child(col)

	col.add_child(_build_toolbar())

	# --- Le 3 colonne ---
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 10)
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(columns)

	# Sinistra: Scheda PG.
	var sheet := CharacterSheetPanel.new()
	sheet.size_flags_vertical = Control.SIZE_EXPAND_FILL
	columns.add_child(sheet)

	# Centro: placeholder mappa (TileMap arrivera' nello step mappa) + HUD combattimento in basso.
	var center := VBoxContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.add_theme_constant_override("separation", 8)
	columns.add_child(center)

	var map_placeholder := _build_map_placeholder()
	map_placeholder.size_flags_vertical = Control.SIZE_EXPAND_FILL
	center.add_child(map_placeholder)

	var combat_hud := CombatHUD.new()
	center.add_child(combat_hud)

	# Destra: Chat Master.
	var chat := MasterChatPanel.new()
	chat.size_flags_vertical = Control.SIZE_EXPAND_FILL
	columns.add_child(chat)


func _build_toolbar() -> PanelContainer:
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.07, 0.06)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", sb)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)

	var title := Label.new()
	title.text = "⚜ Tavolo Oscuro di Ventimiglia"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(title)

	# Handler con nome (i lambda multi-linea come argomento sono fragili in GDScript: meglio metodi).
	row.add_child(_toolbar_button("⚔ Evoca 2 Goblin", _spawn_goblins))
	row.add_child(_toolbar_button("💀 Evoca Orco", _spawn_orc))
	row.add_child(_toolbar_button("🏳 Fine scontro", _end_combat))
	return panel


func _spawn_goblins() -> void:
	CombatManager.add_npc("goblin")
	CombatManager.add_npc("goblin")
	CombatManager.start_combat()


func _spawn_orc() -> void:
	CombatManager.add_npc("orc")
	if not CombatManager.is_active():
		CombatManager.start_combat()


func _end_combat() -> void:
	CombatManager.end_combat()


func _toolbar_button(text: String, handler: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 44)
	b.pressed.connect(handler)
	return b


func _build_map_placeholder() -> PanelContainer:
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.055, 0.05)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.25)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	panel.add_theme_stylebox_override("panel", sb)

	var center := CenterContainer.new()
	panel.add_child(center)
	var lbl := Label.new()
	lbl.text = "Mappa tattica\n(TileMap / CanvasItem — prossimo step)"
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.add_theme_color_override("font_color", Color(0.4, 0.37, 0.32))
	center.add_child(lbl)
	return panel
