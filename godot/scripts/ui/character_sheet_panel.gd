class_name CharacterSheetPanel
extends PanelContainer
## Pannello Scheda PG (colonna sinistra) — porting della scheda del Modulo 03.
##
## Si costruisce da solo in _ready() e si connette ai signal di CharacterManager: quando gli HP o
## le caratteristiche del PG attivo cambiano, il pannello si ridisegna senza che nessuno lo chiami
## esplicitamente (regola di traduzione 1: subscribe -> Signals). Nessuna copia divergente di stato.

const _ABILITY_ORDER: Array[Array] = [
	["str", "FOR"], ["dex", "DES"], ["con", "COS"],
	["int", "INT"], ["wis", "SAG"], ["cha", "CAR"],
]

var _name_label: Label
var _class_label: Label
var _hp_bar: ProgressBar
var _hp_text: Label
var _ac_label: Label
var _ability_values: Dictionary = {}   # key -> Label del punteggio
var _ability_mods: Dictionary = {}     # key -> Label del modificatore
var _party_option: OptionButton


func _ready() -> void:
	custom_minimum_size = Vector2(320, 0)
	_apply_dark_style()
	_build_ui()
	# Connessioni ai signal del manager (il cuore del pattern reattivo).
	CharacterManager.character_changed.connect(_on_character_changed)
	CharacterManager.hp_changed.connect(_on_hp_changed)
	CharacterManager.active_character_changed.connect(_on_active_changed)
	CharacterManager.party_changed.connect(_on_party_changed)
	_refresh_all()
	_rebuild_party_options()


func _apply_dark_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.055, 0.05, 0.043)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.35)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 14
	sb.content_margin_right = 14
	sb.content_margin_top = 12
	sb.content_margin_bottom = 12
	add_theme_stylebox_override("panel", sb)


func _build_ui() -> void:
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	add_child(root)

	var title := Label.new()
	title.text = "Scheda PG"
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	root.add_child(title)

	# Selettore del PG attivo (hotseat).
	_party_option = OptionButton.new()
	_party_option.item_selected.connect(_on_party_selected)
	root.add_child(_party_option)

	_name_label = Label.new()
	_name_label.add_theme_font_size_override("font_size", 16)
	root.add_child(_name_label)

	_class_label = Label.new()
	_class_label.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	root.add_child(_class_label)

	# --- Barra HP ---
	var hp_row := HBoxContainer.new()
	hp_row.add_theme_constant_override("separation", 8)
	root.add_child(hp_row)
	var hp_lbl := Label.new()
	hp_lbl.text = "HP"
	hp_row.add_child(hp_lbl)
	_hp_bar = ProgressBar.new()
	_hp_bar.show_percentage = false
	_hp_bar.custom_minimum_size = Vector2(0, 18)
	_hp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hp_row.add_child(_hp_bar)
	_hp_text = Label.new()
	hp_row.add_child(_hp_text)

	# --- Classe Armatura ---
	_ac_label = Label.new()
	root.add_child(_ac_label)

	# --- Griglia delle 6 caratteristiche ---
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	root.add_child(grid)
	for pair: Array in _ABILITY_ORDER:
		grid.add_child(_make_ability_card(String(pair[0]), String(pair[1])))

	# --- Pulsanti demo (danno/cura/nuovo PG) per provare la reattività ---
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 6)
	root.add_child(buttons)
	buttons.add_child(_make_button("−5 HP", _on_damage_pressed))
	buttons.add_child(_make_button("+5 HP", _on_heal_pressed))
	buttons.add_child(_make_button("+ PG", _on_add_player_pressed))


func _make_ability_card(key: String, short_label: String) -> Control:
	var card := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.08, 0.07)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 6
	sb.content_margin_right = 6
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	card.add_theme_stylebox_override("panel", sb)
	card.custom_minimum_size = Vector2(88, 0)

	var vb := VBoxContainer.new()
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	card.add_child(vb)

	var lbl := Label.new()
	lbl.text = short_label
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.add_theme_font_size_override("font_size", 11)
	lbl.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	vb.add_child(lbl)

	var value := Label.new()
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	value.add_theme_font_size_override("font_size", 20)
	vb.add_child(value)
	_ability_values[key] = value

	var mod := Label.new()
	mod.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mod.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	vb.add_child(mod)
	_ability_mods[key] = mod

	return card


func _make_button(text: String, handler: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 44)  # hit-box touch minima (coerente col legacy Task 5)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.pressed.connect(handler)
	return b


# --- Aggiornamento reattivo (chiamato dai signal) ---

func _refresh_all() -> void:
	var c: CharacterData = CharacterManager.get_active()
	if c == null:
		return
	_name_label.text = c.character_name
	_class_label.text = "%s · Livello %d" % [c.class_name_label, c.level]
	_ac_label.text = "Classe Armatura: %d" % c.armor_class
	_on_hp_changed(c.hp_current, c.hp_max, c.hp_temporary)
	for key: String in _ability_values.keys():
		var score: int = int(c.ability_scores.get(key, 10))
		_ability_values[key].text = str(score)
		var m: int = CharacterData.ability_modifier(score)
		_ability_mods[key].text = ("+%d" % m) if m >= 0 else str(m)


func _on_character_changed(_active: CharacterData, _reason: String) -> void:
	_refresh_all()


func _on_hp_changed(current: int, maximum: int, temporary: int) -> void:
	_hp_bar.max_value = maxi(1, maximum)
	_hp_bar.value = current
	var extra: String = (" (+%d tmp)" % temporary) if temporary > 0 else ""
	_hp_text.text = "%d / %d%s" % [current, maximum, extra]
	# Colore della barra: verde/ambra/rosso in base alla frazione (feedback immediato).
	var frac: float = float(current) / float(maxi(1, maximum))
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color(0.36, 0.62, 0.27) if frac > 0.5 else (Color(0.78, 0.61, 0.24) if frac > 0.25 else Color(0.79, 0.21, 0.17))
	fill.set_corner_radius_all(4)
	_hp_bar.add_theme_stylebox_override("fill", fill)


func _on_active_changed(_index: int, _active: CharacterData) -> void:
	_refresh_all()
	if _party_option.selected != _index:
		_party_option.selected = _index


func _on_party_changed(_party: Array) -> void:
	_rebuild_party_options()


func _rebuild_party_options() -> void:
	_party_option.clear()
	for c: CharacterData in CharacterManager.get_party():
		_party_option.add_item(c.character_name)
	_party_option.selected = CharacterManager.get_active_index()


# --- Handler dei controlli ---

func _on_party_selected(index: int) -> void:
	CharacterManager.set_active_index(index)


func _on_damage_pressed() -> void:
	# Instrada dal CombatManager cosi' anche la logica vittoria/TPK resta coerente col pc-local.
	CombatManager.apply_damage_to_combatant(CombatManager.PC_LOCAL_ID, 5)


func _on_heal_pressed() -> void:
	CombatManager.heal_combatant(CombatManager.PC_LOCAL_ID, 5)


func _on_add_player_pressed() -> void:
	CharacterManager.add_player()
