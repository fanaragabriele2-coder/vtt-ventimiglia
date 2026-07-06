class_name CharacterSheetPanel
extends PanelContainer
## Pannello Scheda PG (colonna sinistra) — porting della scheda del Modulo 03, ora con le SCHEDE
## Core/Abilità/Inventario/Spellbook/Combat/Note del monolite (prima era un'unica vista piatta).
##
## Ogni scheda si ricostruisce leggendo lo stato "live" dai manager (CharacterManager,
## InventoryManager, ConditionsManager, CombatManager) quando il signal pertinente cambia: nessuna
## copia divergente, stesso pattern reattivo del resto del progetto.

const _ABILITY_ORDER: Array[Array] = [
	["str", "FOR"], ["dex", "DES"], ["con", "COS"],
	["int", "INT"], ["wis", "SAG"], ["cha", "CAR"],
]

const _SKILL_LABELS_IT: Dictionary = {
	"acrobatics": "Acrobazia", "animalHandling": "Addestrare Animali", "arcana": "Arcano",
	"athletics": "Atletica", "deception": "Inganno", "history": "Storia", "insight": "Intuizione",
	"intimidation": "Intimidire", "investigation": "Indagare", "medicine": "Medicina",
	"nature": "Natura", "perception": "Percezione", "performance": "Intrattenere",
	"persuasion": "Persuasione", "religion": "Religione", "sleightOfHand": "Rapidita' di Mano",
	"stealth": "Furtivita'", "survival": "Sopravvivenza",
}

var _name_label: Label
var _class_label: Label
var _hp_bar: ProgressBar
var _hp_text: Label
var _ac_label: Label
var _speed_label: Label
var _ability_values: Dictionary = {}   # key -> Label del punteggio
var _ability_mods: Dictionary = {}     # key -> Label del modificatore
var _party_option: OptionButton

var _skills_box: VBoxContainer
var _inventory_box: VBoxContainer
var _weight_label: Label
var _slots_box: HBoxContainer
var _spellbook_box: VBoxContainer
var _combat_box: VBoxContainer
var _notes_edit: TextEdit


func _ready() -> void:
	custom_minimum_size = Vector2(320, 0)
	_apply_dark_style()
	_build_ui()
	CharacterManager.character_changed.connect(_on_character_changed)
	CharacterManager.hp_changed.connect(_on_hp_changed)
	CharacterManager.active_character_changed.connect(_on_active_changed)
	CharacterManager.party_changed.connect(_on_party_changed)
	InventoryManager.inventory_changed.connect(_on_inventory_changed)
	InventoryManager.equipment_changed.connect(_on_equipment_changed)
	InventoryManager.spell_slots_changed.connect(_on_spell_slots_changed)
	InventoryManager.action_economy_changed.connect(_on_action_economy_changed)
	ConditionsManager.condition_applied.connect(_on_conditions_changed)
	ConditionsManager.condition_removed.connect(_on_conditions_changed)
	CombatManager.turn_changed.connect(_on_turn_changed)
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

	# Selettore del PG attivo (hotseat) — resta sopra le schede, non e' una scheda esso stesso.
	_party_option = OptionButton.new()
	_party_option.item_selected.connect(_on_party_selected)
	root.add_child(_party_option)

	var tabs := TabContainer.new()
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(tabs)

	tabs.add_child(_build_core_tab())
	tabs.add_child(_build_abilities_tab())
	tabs.add_child(_build_inventory_tab())
	tabs.add_child(_build_spellbook_tab())
	tabs.add_child(_build_combat_tab())
	tabs.add_child(_build_notes_tab())
	tabs.set_tab_title(0, "Core")
	tabs.set_tab_title(1, "Abilità")
	tabs.set_tab_title(2, "Inventario")
	tabs.set_tab_title(3, "Spellbook")
	tabs.set_tab_title(4, "Combat")
	tabs.set_tab_title(5, "Note")


# --- Scheda "Core": identita', HP, CA, velocita', le 6 caratteristiche ---

func _build_core_tab() -> Control:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(col)

	_name_label = Label.new()
	_name_label.add_theme_font_size_override("font_size", 16)
	col.add_child(_name_label)

	_class_label = Label.new()
	_class_label.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	col.add_child(_class_label)

	var hp_row := HBoxContainer.new()
	hp_row.add_theme_constant_override("separation", 8)
	col.add_child(hp_row)
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

	_ac_label = Label.new()
	col.add_child(_ac_label)

	_speed_label = Label.new()
	col.add_child(_speed_label)

	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	col.add_child(grid)
	for pair: Array in _ABILITY_ORDER:
		grid.add_child(_make_ability_card(String(pair[0]), String(pair[1])))

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 6)
	col.add_child(buttons)
	buttons.add_child(_make_button("−5 HP", _on_damage_pressed))
	buttons.add_child(_make_button("+5 HP", _on_heal_pressed))
	buttons.add_child(_make_button("+ PG", _on_add_player_pressed))

	return scroll


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


# --- Scheda "Abilità": le 18 prove + percezione passiva (sola lettura: le competenze si scelgono
# in creazione personaggio, Modulo 14) ---

func _build_abilities_tab() -> Control:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_skills_box = VBoxContainer.new()
	_skills_box.add_theme_constant_override("separation", 4)
	_skills_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_skills_box)
	return scroll


func _rebuild_skills() -> void:
	for child: Node in _skills_box.get_children():
		child.queue_free()
	var c: CharacterData = CharacterManager.get_active()
	if c == null:
		return
	var passive_lbl := Label.new()
	passive_lbl.text = "Percezione passiva: %d" % c.passive_skill("perception")
	passive_lbl.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	_skills_box.add_child(passive_lbl)
	for skill_key: String in CharacterData.SKILL_ABILITY.keys():
		_skills_box.add_child(_make_skill_row(c, skill_key))


func _make_skill_row(c: CharacterData, skill_key: String) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var name_lbl := Label.new()
	name_lbl.text = String(_SKILL_LABELS_IT.get(skill_key, skill_key))
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(name_lbl)

	var skill_data: Dictionary = c.skills.get(skill_key, {})
	var tag := Label.new()
	tag.custom_minimum_size = Vector2(14, 0)
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.add_theme_color_override("font_color", Color(0.91, 0.77, 0.32))
	if bool(skill_data.get("expertise", false)):
		tag.text = "E"
	elif bool(skill_data.get("proficient", false)):
		tag.text = "•"
	row.add_child(tag)

	var mod: int = c.skill_modifier(skill_key)
	var mod_lbl := Label.new()
	mod_lbl.text = ("+%d" % mod) if mod >= 0 else str(mod)
	mod_lbl.custom_minimum_size = Vector2(30, 0)
	mod_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(mod_lbl)

	return row


# --- Scheda "Inventario": zaino + peso + equip/rimuovi/scarta (Modulo 05/17) ---

func _build_inventory_tab() -> Control:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(col)
	_weight_label = Label.new()
	_weight_label.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	col.add_child(_weight_label)
	_inventory_box = VBoxContainer.new()
	_inventory_box.add_theme_constant_override("separation", 4)
	col.add_child(_inventory_box)
	return scroll


func _rebuild_inventory() -> void:
	_weight_label.text = "Peso trasportato: %.1f kg" % InventoryManager.total_weight_kg()
	for child: Node in _inventory_box.get_children():
		child.queue_free()
	for entry: Dictionary in InventoryManager.get_inventory():
		_inventory_box.add_child(_make_inventory_row(entry))


func _make_inventory_row(entry: Dictionary) -> Control:
	var catalog_id: String = String(entry.get("catalogId", ""))
	var def: Dictionary = InventoryManager.item_definition(catalog_id)
	var row := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.08, 0.07)
	sb.set_corner_radius_all(6)
	sb.content_margin_left = 8
	sb.content_margin_right = 8
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	row.add_theme_stylebox_override("panel", sb)

	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 6)
	row.add_child(hb)

	var rarita: String = ArmeriaManager.rarita_di(catalog_id)
	var name_col: Color = ArmeriaManager.colore_rarita(rarita) if not rarita.is_empty() else Color(0.9, 0.87, 0.8)
	var qty: int = int(entry.get("quantity", 1))
	var qty_txt: String = (" x%d" % qty) if qty > 1 else ""
	var equipped_slot: Variant = entry.get("equippedSlot")
	var slot_txt: String = " [equip: %s]" % String(equipped_slot) if equipped_slot != null else ""
	var name_lbl := Label.new()
	name_lbl.text = "%s%s%s" % [String(def.get("name", catalog_id)), qty_txt, slot_txt]
	name_lbl.add_theme_color_override("font_color", name_col)
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_lbl.clip_text = true
	hb.add_child(name_lbl)

	var inventory_id: String = String(entry.get("inventoryId", ""))
	if equipped_slot != null:
		var unequip_btn := Button.new()
		unequip_btn.text = "Rimuovi"
		unequip_btn.pressed.connect(InventoryManager.unequip.bind(String(equipped_slot)))
		hb.add_child(unequip_btn)
	else:
		var compatible: Array = Array(def.get("compatibleSlots", []))
		if not compatible.is_empty():
			var equip_btn := Button.new()
			equip_btn.text = "Equipaggia"
			equip_btn.pressed.connect(_on_equip_pressed.bind(inventory_id, compatible))
			hb.add_child(equip_btn)

	var drop_btn := Button.new()
	drop_btn.text = "Scarta"
	drop_btn.pressed.connect(InventoryManager.drop_item.bind(inventory_id))
	hb.add_child(drop_btn)

	return row


## Prova gli slot compatibili in ordine finche' uno accetta (equip() valida gia' il tipo).
func _on_equip_pressed(inventory_id: String, compatible_slots: Array) -> void:
	for slot: Variant in compatible_slots:
		if InventoryManager.equip(inventory_id, String(slot)):
			return


# --- Scheda "Spellbook": grimorio + slot incantesimo (Modulo 05) ---

func _build_spellbook_tab() -> Control:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(col)
	_slots_box = HBoxContainer.new()
	_slots_box.add_theme_constant_override("separation", 8)
	col.add_child(_slots_box)
	_spellbook_box = VBoxContainer.new()
	_spellbook_box.add_theme_constant_override("separation", 4)
	col.add_child(_spellbook_box)
	return scroll


func _rebuild_spellbook() -> void:
	for child: Node in _slots_box.get_children():
		child.queue_free()
	var slots: Dictionary = InventoryManager.get_spell_slots()
	var levels: Array = slots.keys()
	levels.sort()
	for level: Variant in levels:
		var slot: Dictionary = slots[level]
		if int(slot.get("max", 0)) <= 0:
			continue
		var lbl := Label.new()
		lbl.text = "Liv.%d %d/%d" % [int(level), int(slot.get("remaining", 0)), int(slot.get("max", 0))]
		lbl.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
		_slots_box.add_child(lbl)

	for child: Node in _spellbook_box.get_children():
		child.queue_free()
	for entry: Dictionary in InventoryManager.get_spellbook():
		_spellbook_box.add_child(_make_spell_row(entry))


func _make_spell_row(entry: Dictionary) -> Control:
	var spell_id: String = String(entry.get("spellId", ""))
	var def: Dictionary = InventoryManager.spell_definition(spell_id)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)

	var check := CheckBox.new()
	check.button_pressed = bool(entry.get("prepared", false))
	check.disabled = int(def.get("level", 0)) == 0  # i trucchetti sono sempre preparati
	check.toggled.connect(_on_spell_toggled.bind(spell_id))
	row.add_child(check)

	var name_lbl := Label.new()
	name_lbl.text = "%s (liv.%d)" % [String(def.get("name", spell_id)), int(def.get("level", 0))]
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(name_lbl)

	return row


func _on_spell_toggled(_pressed: bool, spell_id: String) -> void:
	InventoryManager.toggle_prepared_spell(spell_id)


# --- Scheda "Combat": economia azioni + condizioni attive del PG (Modulo 05/30) ---

func _build_combat_tab() -> Control:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_combat_box = VBoxContainer.new()
	_combat_box.add_theme_constant_override("separation", 8)
	_combat_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_combat_box)
	return scroll


func _rebuild_combat_tab() -> void:
	for child: Node in _combat_box.get_children():
		child.queue_free()

	var state_lbl := Label.new()
	var state: Dictionary = CombatManager.get_state()
	state_lbl.text = "Combattimento: in corso (round %d)" % int(state["round"]) if CombatManager.is_active() else "Combattimento: fermo"
	state_lbl.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	_combat_box.add_child(state_lbl)

	var economy: Dictionary = InventoryManager.get_action_economy()
	var econ_lbl := Label.new()
	econ_lbl.text = "Azione: %s · Bonus: %s · Reazione: %s · Movimento: %.1fm" % [
		"pronta" if bool(economy["action"]) else "usata",
		"pronta" if bool(economy["bonusAction"]) else "usata",
		"pronta" if bool(economy["reaction"]) else "usata",
		float(economy["movementMetersUsed"]),
	]
	_combat_box.add_child(econ_lbl)

	var cond_title := Label.new()
	cond_title.text = "Condizioni attive:"
	cond_title.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	_combat_box.add_child(cond_title)

	var conditions: Array[Dictionary] = ConditionsManager.condizioni_di(CombatManager.PC_LOCAL_ID)
	if conditions.is_empty():
		var none_lbl := Label.new()
		none_lbl.text = "— nessuna —"
		_combat_box.add_child(none_lbl)
	else:
		for cond: Dictionary in conditions:
			var chiave: String = String(cond.get("chiave", ""))
			var lbl := Label.new()
			lbl.text = "%s %s (scade al round %d)" % [
				String(ConditionsManager.ICONE.get(chiave, "")),
				String(ConditionsManager.ETICHETTE.get(chiave, chiave)),
				int(cond.get("scadeAlRound", 0)),
			]
			_combat_box.add_child(lbl)


# --- Scheda "Note": testo libero persistito sul PG attivo ---

func _build_notes_tab() -> Control:
	var col := VBoxContainer.new()
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_notes_edit = TextEdit.new()
	_notes_edit.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_notes_edit.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_notes_edit.placeholder_text = "Note libere sul personaggio, la campagna, gli indizi raccolti..."
	_notes_edit.text_changed.connect(_on_notes_changed)
	col.add_child(_notes_edit)
	return col


func _on_notes_changed() -> void:
	var c: CharacterData = CharacterManager.get_active()
	if c:
		c.notes = _notes_edit.text


# --- Aggiornamento reattivo (chiamato dai signal) ---

func _refresh_all() -> void:
	var c: CharacterData = CharacterManager.get_active()
	if c == null:
		return
	_name_label.text = c.character_name
	_class_label.text = "%s · Livello %d" % [c.class_name_label, c.level]
	_ac_label.text = "Classe Armatura: %d" % c.armor_class
	_speed_label.text = "Velocita': %d m" % c.speed_meters
	_on_hp_changed(c.hp_current, c.hp_max, c.hp_temporary)
	for key: String in _ability_values.keys():
		var score: int = int(c.ability_scores.get(key, 10))
		_ability_values[key].text = str(score)
		var m: int = CharacterData.ability_modifier(score)
		_ability_mods[key].text = ("+%d" % m) if m >= 0 else str(m)
	if _notes_edit.text != c.notes:
		_notes_edit.text = c.notes
	_rebuild_skills()
	_rebuild_inventory()
	_rebuild_spellbook()
	_rebuild_combat_tab()


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


func _on_inventory_changed(_inventory: Array) -> void:
	_rebuild_inventory()


func _on_equipment_changed(_slot_key: String, _inventory_id: Variant) -> void:
	_rebuild_inventory()
	_ac_label.text = "Classe Armatura: %d" % CharacterManager.get_active().armor_class


func _on_spell_slots_changed(_slots: Dictionary) -> void:
	_rebuild_spellbook()


func _on_action_economy_changed(_economy: Dictionary) -> void:
	_rebuild_combat_tab()


func _on_conditions_changed(_combatant_id: String, _key: String, _duration_rounds: int = 0) -> void:
	_rebuild_combat_tab()


func _on_turn_changed(_combatant_id: String, _round_number: int) -> void:
	_rebuild_combat_tab()


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
