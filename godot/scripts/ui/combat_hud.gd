class_name CombatHUD
extends PanelContainer
## HUD di combattimento (in basso al centro, stile BG3) — porting della tray azioni del Modulo 05.
##
## Si connette a CombatManager: la barra dell'iniziativa si ricostruisce quando l'iniziativa viene
## tirata, la card di turno si evidenzia a ogni turn_changed, gli HP calano in tempo reale, e i
## pulsanti (Attacca / Spingi / Termina turno) invocano il manager. Vittoria/TPK spengono l'HUD.

var _initiative_strip: HBoxContainer
var _target_option: OptionButton
var _round_label: Label
var _last_event: Label
var _attack_button: Button
var _shove_button: Button
var _bonus_button: Button
var _bonus_popup: PopupPanel
var _cards: Dictionary = {}   # combatant_id -> PanelContainer (per l'evidenziazione di turno)
var _current_id: String = ""


func _ready() -> void:
	_apply_dark_style()
	_build_ui()
	CombatManager.combat_started.connect(_on_combat_started)
	CombatManager.combat_ended.connect(_on_combat_ended)
	CombatManager.initiative_rolled.connect(_on_initiative_rolled)
	CombatManager.turn_changed.connect(_on_turn_changed)
	CombatManager.combatant_damaged.connect(_on_combatant_damaged)
	CombatManager.combatant_defeated.connect(_on_combatant_defeated)
	CombatManager.combatant_added.connect(_on_combatant_added)
	CombatManager.attack_resolved.connect(_on_attack_resolved)
	CombatManager.shove_resolved.connect(_on_shove_resolved)
	CombatManager.victory.connect(func() -> void: _announce("🏆 VITTORIA! Tutti i nemici sconfitti."))
	CombatManager.party_wiped.connect(func() -> void: _announce("💀 Il party e' caduto."))
	visible = false  # nascosto finche' non inizia un combattimento


func _apply_dark_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.078, 0.063, 0.96)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.5)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(12)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	add_theme_stylebox_override("panel", sb)


func _build_ui() -> void:
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	add_child(root)

	# --- Barra dell'iniziativa (una card per combattente) ---
	_initiative_strip = HBoxContainer.new()
	_initiative_strip.add_theme_constant_override("separation", 6)
	root.add_child(_initiative_strip)

	# --- Riga info: round + ultimo evento ---
	var info := HBoxContainer.new()
	info.add_theme_constant_override("separation", 12)
	root.add_child(info)
	_round_label = Label.new()
	_round_label.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	info.add_child(_round_label)
	_last_event = Label.new()
	_last_event.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_child(_last_event)

	# --- Riga azioni: bersaglio + pulsanti ---
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	root.add_child(actions)

	var target_lbl := Label.new()
	target_lbl.text = "Bersaglio:"
	actions.add_child(target_lbl)
	_target_option = OptionButton.new()
	_target_option.custom_minimum_size = Vector2(160, 44)
	actions.add_child(_target_option)

	_attack_button = _make_action("⚔ Attacca", Color(0.47, 0.16, 0.11), _on_attack_pressed)
	actions.add_child(_attack_button)
	_shove_button = _make_action("👐 Spingi", Color(0.11, 0.24, 0.31), _on_shove_pressed)
	actions.add_child(_shove_button)
	_bonus_button = _make_action("⚡ Bonus", Color(0.42, 0.32, 0.08), _on_bonus_pressed)
	actions.add_child(_bonus_button)
	actions.add_child(_make_action("⏭ Termina turno", Color(0.16, 0.31, 0.16), _on_end_turn_pressed))

	_build_bonus_popup()


func _make_action(text: String, tint: Color, handler: Callable) -> Button:
	var b := Button.new()
	b.text = text
	# Hit-box touch minima 44x44 (coerente col Task 5 anti-clutter del monolite).
	b.custom_minimum_size = Vector2(44, 44)
	var sb := StyleBoxFlat.new()
	sb.bg_color = tint
	sb.set_corner_radius_all(9)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	b.add_theme_stylebox_override("normal", sb)
	b.pressed.connect(handler)
	return b


# --- Ricostruzione della barra iniziativa ---

func _rebuild_strip() -> void:
	for child in _initiative_strip.get_children():
		child.queue_free()
	_cards.clear()
	var state: Dictionary = CombatManager.get_state()
	for c: Dictionary in state["combatants"]:
		var card := _make_init_card(c)
		_initiative_strip.add_child(card)
		_cards[String(c["id"])] = card
	_rebuild_targets()


func _make_init_card(c: Dictionary) -> PanelContainer:
	var card := PanelContainer.new()
	var is_pc: bool = c["kind"] == "pc"
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.13, 0.16, 0.2) if is_pc else Color(0.2, 0.11, 0.1)
	sb.set_corner_radius_all(8)
	sb.set_border_width_all(2)
	sb.border_color = Color(0, 0, 0, 0)
	sb.content_margin_left = 8
	sb.content_margin_right = 8
	sb.content_margin_top = 5
	sb.content_margin_bottom = 5
	card.add_theme_stylebox_override("panel", sb)
	card.custom_minimum_size = Vector2(96, 0)

	var vb := VBoxContainer.new()
	card.add_child(vb)
	var name_lbl := Label.new()
	name_lbl.text = String(c["name"])
	name_lbl.add_theme_font_size_override("font_size", 12)
	name_lbl.add_theme_color_override("font_color", Color(0.62, 0.82, 1) if is_pc else Color(1, 0.72, 0.66))
	vb.add_child(name_lbl)
	var hp_lbl := Label.new()
	hp_lbl.name = "HP"
	hp_lbl.text = "%d / %d" % [int(c["hitPoints"]), int(c["maxHitPoints"])]
	hp_lbl.add_theme_font_size_override("font_size", 11)
	vb.add_child(hp_lbl)
	return card


func _rebuild_targets() -> void:
	_target_option.clear()
	var state: Dictionary = CombatManager.get_state()
	for c: Dictionary in state["combatants"]:
		if c["kind"] == "npc" and not c["defeated"]:
			_target_option.add_item(String(c["name"]))
			_target_option.set_item_metadata(_target_option.item_count - 1, String(c["id"]))


func _selected_target_id() -> String:
	if _target_option.item_count == 0 or _target_option.selected < 0:
		return ""
	return String(_target_option.get_item_metadata(_target_option.selected))


# --- Reazioni ai signal ---

func _on_combat_started() -> void:
	visible = true
	_rebuild_strip()
	_round_label.text = "Round 1"


func _on_combat_ended() -> void:
	visible = false


func _on_initiative_rolled(_order: Array) -> void:
	_rebuild_strip()


func _on_turn_changed(combatant_id: String, round_number: int) -> void:
	_current_id = combatant_id
	_round_label.text = "Round %d" % round_number
	# Evidenzia la card di turno (bordo dorato) e spegne le altre.
	for id: String in _cards.keys():
		var card: PanelContainer = _cards[id]
		var sb: StyleBoxFlat = card.get_theme_stylebox("panel")
		sb.border_color = Color(0.94, 0.83, 0.53) if id == combatant_id else Color(0, 0, 0, 0)
	var c: Dictionary = CombatManager.get_combatant(combatant_id)
	if not c.is_empty():
		_last_event.text = "Turno di %s" % c["name"]


func _on_combatant_damaged(combatant_id: String, amount: int, current_hp: int) -> void:
	_update_card_hp(combatant_id, current_hp)
	var c: Dictionary = CombatManager.get_combatant(combatant_id)
	if not c.is_empty():
		_last_event.text = "%s subisce %d danni" % [c["name"], amount]


func _on_combatant_defeated(combatant_id: String) -> void:
	if _cards.has(combatant_id):
		var card: PanelContainer = _cards[combatant_id]
		card.modulate = Color(0.5, 0.5, 0.5, 0.6)
	_rebuild_targets()


func _on_combatant_added(_combatant: Dictionary) -> void:
	if visible:
		_rebuild_strip()


func _update_card_hp(combatant_id: String, current_hp: int) -> void:
	if not _cards.has(combatant_id):
		return
	var card: PanelContainer = _cards[combatant_id]
	var hp_lbl: Label = card.find_child("HP", true, false)
	var c: Dictionary = CombatManager.get_combatant(combatant_id)
	if hp_lbl and not c.is_empty():
		hp_lbl.text = "%d / %d" % [current_hp, int(c["maxHitPoints"])]


func _on_attack_resolved(result: Dictionary) -> void:
	if not bool(result.get("hit", false)):
		_last_event.text = "Attacco mancato (%d vs CA %d)" % [int(result.get("attackTotal", 0)), int(result.get("targetAc", 0))]
	else:
		var crit: String = " CRITICO!" if bool(result.get("critical", false)) else ""
		_last_event.text = "Colpito per %d danni%s" % [int(result.get("damage", 0)), crit]


func _on_shove_resolved(result: Dictionary) -> void:
	_last_event.text = "Spinta %s" % ("riuscita" if bool(result.get("success", false)) else "fallita")


func _announce(text: String) -> void:
	_last_event.text = text


# --- Handler dei pulsanti azione ---

func _on_attack_pressed() -> void:
	var target: String = _selected_target_id()
	if target.is_empty():
		_last_event.text = "Nessun bersaglio selezionato."
		return
	CombatManager.resolve_attack(_actor_id(), target, "normal")


func _on_shove_pressed() -> void:
	var target: String = _selected_target_id()
	if target.is_empty():
		return
	CombatManager.shove(_actor_id(), target)


func _on_end_turn_pressed() -> void:
	CombatManager.next_turn()


# L'attore corrente se e' un PG, altrimenti il PG locale (i pulsanti sono per il giocatore).
func _actor_id() -> String:
	var c: Dictionary = CombatManager.get_combatant(_current_id)
	if not c.is_empty() and c["kind"] == "pc":
		return _current_id
	return CombatManager.PC_LOCAL_ID


# --- Menu Azione Bonus dinamico (porting del Modulo 38): opzioni generate da classe/razza/
# inventario del PG attivo, in una griglia a comparsa sopra il pulsante "⚡ Bonus". ---

func _build_bonus_popup() -> void:
	_bonus_popup = PopupPanel.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.07, 0.06)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.6)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	_bonus_popup.add_theme_stylebox_override("panel", sb)
	add_child(_bonus_popup)


func _on_bonus_pressed() -> void:
	for child: Node in _bonus_popup.get_children():
		child.queue_free()
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	_bonus_popup.add_child(col)

	var opzioni: Array[Dictionary] = ActionMenuManager.get_current_options()
	if opzioni.is_empty():
		var lbl := Label.new()
		lbl.text = "Nessuna azione bonus disponibile."
		col.add_child(lbl)
	else:
		for o: Dictionary in opzioni:
			var btn := Button.new()
			var fonte: String = "Classe" if o["fonte"] == "classe" else ("Razza" if o["fonte"] == "razza" else "Zaino")
			btn.text = "%s  [%s]" % [String(o["etichetta"]), fonte]
			btn.custom_minimum_size = Vector2(220, 40)
			btn.tooltip_text = String(o.get("descrizione", ""))
			btn.pressed.connect(_on_bonus_option_chosen.bind(o))
			col.add_child(btn)

	_bonus_popup.position = Vector2i(_bonus_button.get_screen_position()) + Vector2i(0, -220)
	_bonus_popup.popup()


func _on_bonus_option_chosen(opzione: Dictionary) -> void:
	ActionMenuManager.esegui(opzione, _selected_target_id())
	_bonus_popup.hide()
