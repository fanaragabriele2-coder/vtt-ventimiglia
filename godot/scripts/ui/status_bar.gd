class_name StatusBar
extends PanelContainer
## Barra di stato in basso — porting leggero del "Diagnostica/Session Panel" del monolite (Modulo
## 21/02-1): non fa autodiagnosi dei moduli (qui non serve, e' Godot che segnala in editor script
## mancanti/rotti), ma mostra a colpo d'occhio lo stato di sessione che l'utente controllava di
## continuo nella UI HTML: turno, combattimento, party, IA nemica.

var _turn_label: Label
var _combat_label: Label
var _party_label: Label
var _ai_label: Label


func _ready() -> void:
	_apply_style()
	_build_ui()
	CombatManager.turn_changed.connect(_on_turn_changed)
	CombatManager.combat_started.connect(_refresh)
	CombatManager.combat_ended.connect(_refresh)
	CharacterManager.party_changed.connect(_on_party_changed)
	_refresh()


func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.035, 0.03)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.25)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	add_theme_stylebox_override("panel", sb)


func _build_ui() -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	add_child(row)

	_turn_label = _make_pill()
	_combat_label = _make_pill()
	_party_label = _make_pill()
	_ai_label = _make_pill()
	row.add_child(_turn_label)
	row.add_child(_combat_label)
	row.add_child(_party_label)
	row.add_child(_ai_label)


func _make_pill() -> Label:
	var lbl := Label.new()
	lbl.add_theme_font_size_override("font_size", 11)
	lbl.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	return lbl


func _refresh() -> void:
	var state: Dictionary = CombatManager.get_state()
	_combat_label.text = ("Combat: on (round %d)" % int(state["round"])) if CombatManager.is_active() else "Combat: off"
	_party_label.text = "Party: %d" % CharacterManager.get_party().size()
	_ai_label.text = "IA nemica: " + ("attiva" if EnemyAI.is_enabled() else "ferma")
	if not CombatManager.is_active():
		_turn_label.text = "Turno: nessuno"


func _on_turn_changed(combatant_id: String, round_number: int) -> void:
	var combatant: Dictionary = CombatManager.get_combatant(combatant_id)
	var name: String = String(combatant.get("name", combatant_id))
	_turn_label.text = "Turno: %s (round %d)" % [name, round_number]
	_refresh()


func _on_party_changed(_party: Array) -> void:
	_refresh()
