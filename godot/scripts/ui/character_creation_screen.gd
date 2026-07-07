class_name CharacterCreationScreen
extends PanelContainer
## Schermata di creazione personaggio (overlay a schermo intero) — porting del Modulo 14 JS
## "Start Menu + Creazione Personaggio". Griglia razza/classe, caratteristiche regolabili (array
## standard della classe scelta come base, modificabile 3-18) con bonus di razza applicati live,
## statistiche derivate (HP/CA/velocita'/dado vita), party fino a 4 membri. "INIZIA L'AVVENTURA"
## installa tutto in CharacterManager/InventoryManager (via CharacterCreation.start_new_game).

signal adventure_started()

const ABILITY_KEYS: PackedStringArray = ["str", "dex", "con", "int", "wis", "cha"]

var _race_id: String = "umano"
var _class_id: String = "guerriero"
var _base_scores: Dictionary = { "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10 }
var _party_builds: Array[Dictionary] = []

var _name_input: LineEdit
var _race_grid: GridContainer
var _class_grid: GridContainer
var _ability_grid: GridContainer
var _ability_spinboxes: Dictionary = {}    # key -> SpinBox
var _ability_final_labels: Dictionary = {} # key -> Label
var _stats_label: Label
var _party_list: VBoxContainer
var _message_label: Label


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_apply_style()
	_set_class_defaults(_class_id)
	_build_ui()
	_refresh_all()


func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.035, 0.03, 0.985)
	add_theme_stylebox_override("panel", sb)


func _set_class_defaults(class_id: String) -> void:
	var cls: Dictionary = CharacterCreation.get_class_def(class_id)
	var arr: Dictionary = cls.get("arr", {})
	for key: String in ABILITY_KEYS:
		_base_scores[key] = int(arr.get(key, 10))


func _build_ui() -> void:
	var scroll := ScrollContainer.new()
	scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(scroll)

	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 14)
	root.custom_minimum_size = Vector2(880, 0)
	center.add_child(root)

	var title := Label.new()
	title.text = "⚜ Crea il tuo Eroe"
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	root.add_child(title)

	var sub := Label.new()
	sub.text = "Scegli razza e classe: equipaggiamento e bonus si applicano da soli."
	sub.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	root.add_child(sub)

	if SaveManager.has_save():
		var load_btn := Button.new()
		load_btn.text = "📂 Carica partita salvata"
		load_btn.custom_minimum_size = Vector2(0, 40)
		load_btn.pressed.connect(_on_load_saved_game)
		root.add_child(load_btn)

	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 8)
	root.add_child(name_row)
	var name_lbl := Label.new()
	name_lbl.text = "Nome del personaggio:"
	name_row.add_child(name_lbl)
	_name_input = LineEdit.new()
	_name_input.text = CharacterCreation.suggest_name()
	_name_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_row.add_child(_name_input)

	var picker_row := HBoxContainer.new()
	picker_row.add_theme_constant_override("separation", 16)
	root.add_child(picker_row)

	var race_col := VBoxContainer.new()
	race_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	picker_row.add_child(race_col)
	race_col.add_child(_section_label("Razza"))
	_race_grid = GridContainer.new()
	_race_grid.columns = 2
	_race_grid.add_theme_constant_override("h_separation", 6)
	_race_grid.add_theme_constant_override("v_separation", 6)
	race_col.add_child(_race_grid)

	var class_col := VBoxContainer.new()
	class_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	picker_row.add_child(class_col)
	class_col.add_child(_section_label("Classe"))
	_class_grid = GridContainer.new()
	_class_grid.columns = 2
	_class_grid.add_theme_constant_override("h_separation", 6)
	_class_grid.add_theme_constant_override("v_separation", 6)
	class_col.add_child(_class_grid)

	_populate_race_grid()
	_populate_class_grid()

	root.add_child(_section_label("Caratteristiche (3–18) + bonus di razza"))
	_ability_grid = GridContainer.new()
	_ability_grid.columns = 6
	_ability_grid.add_theme_constant_override("h_separation", 10)
	root.add_child(_ability_grid)
	_build_ability_cards()

	_stats_label = Label.new()
	_stats_label.add_theme_font_size_override("font_size", 15)
	_stats_label.add_theme_color_override("font_color", Color(0.85, 0.8, 0.7))
	root.add_child(_stats_label)

	root.add_child(_section_label("Party (fino a 4 personaggi)"))
	_party_list = VBoxContainer.new()
	root.add_child(_party_list)

	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 8)
	root.add_child(foot)
	var add_btn := Button.new()
	add_btn.text = "➕ Aggiungi al party"
	add_btn.custom_minimum_size = Vector2(0, 44)
	add_btn.pressed.connect(_on_add_to_party)
	foot.add_child(add_btn)
	var start_btn := Button.new()
	start_btn.text = "🎲 INIZIA L'AVVENTURA"
	start_btn.custom_minimum_size = Vector2(0, 44)
	start_btn.pressed.connect(_on_start_adventure)
	foot.add_child(start_btn)

	_message_label = Label.new()
	_message_label.add_theme_color_override("font_color", Color(0.79, 0.21, 0.17))
	root.add_child(_message_label)


func _section_label(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	l.add_theme_font_size_override("font_size", 13)
	return l


func _populate_race_grid() -> void:
	for child: Node in _race_grid.get_children():
		child.queue_free()
	for r: Dictionary in CharacterCreation.races:
		var rid: String = String(r["id"])
		var btn := Button.new()
		btn.text = "%s\n%s" % [String(r["name"]), String(r.get("desc", ""))]
		btn.toggle_mode = true
		btn.button_pressed = (rid == _race_id)
		btn.custom_minimum_size = Vector2(0, 52)
		btn.pressed.connect(_on_race_selected.bind(rid))
		_race_grid.add_child(btn)


func _populate_class_grid() -> void:
	for child: Node in _class_grid.get_children():
		child.queue_free()
	for c: Dictionary in CharacterCreation.classes:
		var cid: String = String(c["id"])
		var btn := Button.new()
		btn.text = "%s\n%s" % [String(c["name"]), String(c.get("desc", ""))]
		btn.toggle_mode = true
		btn.button_pressed = (cid == _class_id)
		btn.custom_minimum_size = Vector2(0, 52)
		btn.pressed.connect(_on_class_selected.bind(cid))
		_class_grid.add_child(btn)


func _on_race_selected(race_id: String) -> void:
	_race_id = race_id
	_populate_race_grid()
	_refresh_all()


func _on_class_selected(class_id: String) -> void:
	_class_id = class_id
	_set_class_defaults(class_id)
	_populate_class_grid()
	_refresh_ability_inputs()
	_refresh_all()


func _build_ability_cards() -> void:
	for key: String in ABILITY_KEYS:
		var col := VBoxContainer.new()
		var lbl := Label.new()
		lbl.text = key.to_upper()
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
		col.add_child(lbl)
		var spin := SpinBox.new()
		spin.min_value = 3
		spin.max_value = 18
		spin.value = int(_base_scores[key])
		spin.custom_minimum_size = Vector2(76, 0)
		spin.value_changed.connect(_on_ability_changed.bind(key))
		_ability_spinboxes[key] = spin
		col.add_child(spin)
		var fin := Label.new()
		fin.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		fin.add_theme_font_size_override("font_size", 11)
		_ability_final_labels[key] = fin
		col.add_child(fin)
		_ability_grid.add_child(col)


func _refresh_ability_inputs() -> void:
	for key: String in _ability_spinboxes.keys():
		(_ability_spinboxes[key] as SpinBox).value = int(_base_scores[key])


func _on_ability_changed(value: float, key: String) -> void:
	_base_scores[key] = clampi(int(value), 3, 18)
	_refresh_all()


func _refresh_all() -> void:
	var fa: Dictionary = CharacterCreation.final_abilities(_base_scores, _race_id)
	var race: Dictionary = CharacterCreation.get_race(_race_id)
	var bonus: Dictionary = race.get("bonus", {})
	for key: String in ABILITY_KEYS:
		var f: int = int(fa.get(key, 10))
		var m: int = CharacterCreation.ability_modifier(f)
		var b: int = int(bonus.get(key, 0))
		var suffix: String = (" razza+%d" % b) if b > 0 else ""
		var mod_txt: String = ("+%d" % m) if m >= 0 else str(m)
		(_ability_final_labels[key] as Label).text = "→ %d (%s)%s" % [f, mod_txt, suffix]

	var cls: Dictionary = CharacterCreation.get_class_def(_class_id)
	var hp: int = CharacterCreation.compute_hp(fa, cls)
	var ac: int = CharacterCreation.compute_ac(fa, cls.get("equip", []))
	var spd: float = float(race.get("speed", 9.0))
	_stats_label.text = "PF %d   ·   CA %d   ·   Velocità %s m   ·   Dado Vita 1d%d   ·   Competenza +2" % [
		hp, ac, str(spd), int(cls.get("hitDie", 8)),
	]
	_refresh_party_list()


func _refresh_party_list() -> void:
	for child: Node in _party_list.get_children():
		child.queue_free()
	for i: int in range(_party_builds.size()):
		var b: Dictionary = _party_builds[i]
		var row := HBoxContainer.new()
		var lbl := Label.new()
		lbl.text = "%s · %s %s" % [String(b["name"]), String(b["raceName"]), String(b["className"])]
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(lbl)
		var remove_btn := Button.new()
		remove_btn.text = "✕"
		remove_btn.pressed.connect(_on_remove_from_party.bind(i))
		row.add_child(remove_btn)
		_party_list.add_child(row)


func _build_from_form() -> Dictionary:
	var char_name: String = _name_input.text.strip_edges()
	if char_name.is_empty():
		char_name = CharacterCreation.suggest_name()
	return CharacterCreation.build_character(char_name, _race_id, _class_id, _base_scores)


func _on_add_to_party() -> void:
	if _party_builds.size() >= 4:
		_message_label.text = "Il party è già al completo (max 4)."
		return
	_party_builds.append(_build_from_form())
	_message_label.text = ""
	_name_input.text = CharacterCreation.suggest_name()
	_refresh_party_list()


func _on_remove_from_party(index: int) -> void:
	_party_builds.remove_at(index)
	_refresh_party_list()


## Salta del tutto la creazione: ripristina il party/inventario/progressione salvati e riparte da li'.
func _on_load_saved_game() -> void:
	if SaveManager.load_game():
		adventure_started.emit()
	else:
		_message_label.text = "Impossibile caricare il salvataggio."


func _on_start_adventure() -> void:
	var list: Array[Dictionary] = _party_builds.duplicate()
	if list.is_empty():
		list.append(_build_from_form())
	CharacterCreation.start_new_game(list)
	var descrizioni: PackedStringArray = []
	for b: Dictionary in list:
		descrizioni.append("%s (%s %s)" % [String(b["name"]), String(b["raceName"]), String(b["className"])])
	GameState.announce("🎭 Party pronto: " + ", ".join(descrizioni) + ". Che l'avventura abbia inizio!")
	adventure_started.emit()
