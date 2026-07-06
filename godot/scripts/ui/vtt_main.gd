extends Control
## VTTMain — scena radice. Costruisce il layout a 3 colonne del monolite (Scheda PG · Mappa+Combat ·
## Chat Master) e una toolbar in alto. Ogni pannello si aggancia da solo ai signal dei manager: qui
## si fa solo la composizione + qualche pulsante globale (evoca nemici, cambio vista, ecc.).
##
## E' la scena principale del progetto (project.godot -> run/main_scene = res://main.tscn).

var _tactical_map: TacticalMap
var _overworld_map: OverworldMap
var _view_tactical_btn: Button
var _view_overworld_btn: Button
var _ai_toggle_btn: Button


func _ready() -> void:
	_apply_background()
	_build_layout()
	_show_character_creation()


## All'avvio, prima di qualunque altra cosa: crea il party (Modulo 14). Il layout di gioco e'
## gia' costruito sotto (con il PG "Eroe Locale" di default), ma la creazione lo sostituisce
## SUBITO che si preme "Inizia l'avventura" — coerente col comportamento del monolite.
func _show_character_creation() -> void:
	var screen := CharacterCreationScreen.new()
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.adventure_started.connect(func() -> void: screen.queue_free())
	add_child(screen)


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

	# Sinistra: Scheda PG + barra XP.
	var left := VBoxContainer.new()
	left.add_theme_constant_override("separation", 8)
	columns.add_child(left)
	left.add_child(XpBar.new())
	var sheet := CharacterSheetPanel.new()
	sheet.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(sheet)

	# Centro: toggle vista + (mappa tattica | overworld Ventimiglia) + HUD combattimento in basso.
	var center := VBoxContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.add_theme_constant_override("separation", 8)
	columns.add_child(center)

	center.add_child(_build_view_toggle())

	# Le due viste convivono nello stesso spazio: solo una e' visibile (un Container salta i figli
	# nascosti, quindi la visibile riempie tutto). Il toggle scambia la visibilita'.
	_tactical_map = TacticalMap.new()
	_tactical_map.size_flags_vertical = Control.SIZE_EXPAND_FILL
	center.add_child(_tactical_map)

	_overworld_map = OverworldMap.new()
	_overworld_map.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_overworld_map.visible = false
	# Quando il party viaggia sull'overworld, annuncialo nella chat (fonte unica: GameState).
	_overworld_map.party_traveled.connect(_on_party_traveled)
	center.add_child(_overworld_map)

	var combat_hud := CombatHUD.new()
	center.add_child(combat_hud)

	center.add_child(DiceRoller.new())

	# Destra: Chat Master.
	var chat := MasterChatPanel.new()
	chat.size_flags_vertical = Control.SIZE_EXPAND_FILL
	columns.add_child(chat)

	# Barra di stato in fondo a tutta la finestra (fuori dalle 3 colonne, come il session panel
	# del monolite): turno/combattimento/party/IA nemica a colpo d'occhio.
	col.add_child(StatusBar.new())

	# Overlay globale (sopra tutto): popup di bottino (Modulo 15/41).
	add_child(LootPopup.new())


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
	_ai_toggle_btn = _toolbar_button("🐺 IA Nemica: ON", _toggle_enemy_ai)
	row.add_child(_ai_toggle_btn)
	row.add_child(_toolbar_button("⛶ Schermo intero", _toggle_fullscreen))
	return panel


func _toggle_enemy_ai() -> void:
	EnemyAI.set_enabled(not EnemyAI.is_enabled())
	_ai_toggle_btn.text = "🐺 IA Nemica: ON" if EnemyAI.is_enabled() else "🐺 IA Nemica: OFF"


func _toggle_fullscreen() -> void:
	var fullscreen: bool = DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
	DisplayServer.window_set_mode(
		DisplayServer.WINDOW_MODE_WINDOWED if fullscreen else DisplayServer.WINDOW_MODE_FULLSCREEN
	)


func _spawn_goblins() -> void:
	# Encounter Balancer (Modulo 37): la quantita'/statistiche si scalano sul party REALE, non sono
	# fisse — con un party forte potrebbero comparire piu' goblin, con uno debole/ferito meno.
	EncounterBalancer.spawn_bilanciato([{ "name": "Goblin", "count": 2 }])


func _spawn_orc() -> void:
	EncounterBalancer.spawn_bilanciato([{ "name": "Orco", "count": 1 }])


func _end_combat() -> void:
	CombatManager.end_combat()


func _toolbar_button(text: String, handler: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 44)
	b.pressed.connect(handler)
	return b


# --- Toggle tra mappa tattica e overworld di Ventimiglia (come la transizione del monolite) ---

func _build_view_toggle() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	_view_tactical_btn = _toolbar_button("🗺 Mappa tattica", _show_tactical)
	_view_overworld_btn = _toolbar_button("🌍 Ventimiglia", _show_overworld)
	row.add_child(_view_tactical_btn)
	row.add_child(_view_overworld_btn)
	_update_toggle_state(true)
	return row


func _show_tactical() -> void:
	_tactical_map.visible = true
	_overworld_map.visible = false
	_update_toggle_state(true)


func _show_overworld() -> void:
	_tactical_map.visible = false
	_overworld_map.visible = true
	_update_toggle_state(false)


func _update_toggle_state(tactical_active: bool) -> void:
	_view_tactical_btn.disabled = tactical_active
	_view_overworld_btn.disabled = not tactical_active


func _on_party_traveled(poi_name: String, poi: Dictionary) -> void:
	# Annota lo spostamento nel log della chat (la posizione vera e' gia' in GameState).
	print("[Overworld] Il party e' giunto a %s (%s)" % [poi_name, String(poi.get("desc", ""))])
