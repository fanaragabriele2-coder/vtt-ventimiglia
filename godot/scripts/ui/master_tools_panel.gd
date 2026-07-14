class_name MasterToolsPanel
extends PanelContainer
## Cassetto "🛠 Strumenti" del Master (porting del pannello omonimo del monolite) — i comandi da
## dietro lo schermo, quelli che un DM usa a mano e che l'IA non deve toccare:
## - NEBBIA: svela tutta la mappa tattica o rimetti la nebbia (riscoprendo solo attorno ai PG);
## - COMBATTENTI: la lista viva dello scontro con HP a colpo d'occhio e pulsanti rapidi
##   −5/+5 HP e 🗑 (togli il PNG dalla scena: NON e' una morte, niente XP/bottino);
## - ATMOSFERA: forza una scena audio (città/mare/dungeon/battaglia) o rimetti l'automatico.
##
## E' un overlay a comparsa (toggle dal pulsante 🛠 in toolbar): da chiuso non aggiorna nulla.
## Trova la mappa tattica via gruppo "tactical_map" (nessun accoppiamento diretto col layout).

const SCENE_AUDIO: Array[Array] = [
	["🏙 Città", "citta"], ["🌊 Mare", "mare"],
	["🕯 Dungeon", "dungeon"], ["⚔ Battaglia", "battaglia"], ["🔄 Auto", ""],
]

var _lista_combattenti: VBoxContainer


func _ready() -> void:
	visible = false
	custom_minimum_size = Vector2(300, 0)
	_apply_style()
	_build_ui()
	CombatManager.combat_started.connect(_ricostruisci_lista)
	CombatManager.combat_ended.connect(_ricostruisci_lista)
	# Qualunque cambiamento nel roster o negli HP ridisegna la lista (solo se il cassetto e' aperto).
	CombatManager.combatant_added.connect(_su_evento_combattente)
	CombatManager.combatant_removed.connect(_su_evento_combattente)
	CombatManager.combatant_damaged.connect(_su_evento_combattente)
	CombatManager.combatant_healed.connect(_su_evento_combattente)
	CombatManager.combatant_defeated.connect(_su_evento_combattente)


## Un signal di CombatManager (con firme diverse) ridisegna la lista: gli argomenti non servono,
## la lista si rilegge sempre intera da get_state — un solo handler variadico per tutti.
func _su_evento_combattente(_a: Variant = null, _b: Variant = null, _c: Variant = null) -> void:
	_ricostruisci_lista()


## Apre/chiude il cassetto. All'apertura ricostruisce la lista (mentre era chiuso non l'aggiornava).
func alterna() -> void:
	visible = not visible
	if visible:
		_ricostruisci_lista()


# --- Azioni ---

## Il Mondo cucito e' l'unica mappa: la nebbia manuale del Master agisce sulla sua WorldFog.
func _mondo() -> WorldBuilder:
	return get_tree().get_first_node_in_group("world_builder") as WorldBuilder


func _svela_nebbia() -> void:
	var mondo: WorldBuilder = _mondo()
	if mondo:
		mondo.svela_tutta_la_nebbia()
		GameState.announce("🛠 Il Master svela tutta la mappa.")


func _rinnebbia() -> void:
	var mondo: WorldBuilder = _mondo()
	if mondo:
		mondo.rinnebbia_tutto()
		GameState.announce("🛠 Il Master rimette la nebbia di guerra.")


func _forza_scena_audio(nome: String) -> void:
	AmbienceManager.imposta_scena(nome)


func _danno_rapido(combatant_id: String) -> void:
	CombatManager.apply_damage_to_combatant(combatant_id, 5, CombatManager.pc_attivo_id())


func _cura_rapida(combatant_id: String) -> void:
	CombatManager.heal_combatant(combatant_id, 5)


func _togli(combatant_id: String, nome: String) -> void:
	if CombatManager.remove_combatant(combatant_id):
		GameState.announce("🛠 %s viene tolto dalla scena dal Master." % nome)


# --- Lista viva dei combattenti ---

func _ricostruisci_lista() -> void:
	if not visible:
		return
	for figlio: Node in _lista_combattenti.get_children():
		figlio.queue_free()
	var combattenti: Array = CombatManager.get_state()["combatants"]
	if combattenti.is_empty():
		var vuoto := Label.new()
		vuoto.text = "Nessun combattente in scena."
		vuoto.add_theme_color_override("font_color", Color(0.6, 0.56, 0.5))
		_lista_combattenti.add_child(vuoto)
		return
	for c: Dictionary in combattenti:
		_lista_combattenti.add_child(_riga_combattente(c))


func _riga_combattente(c: Dictionary) -> HBoxContainer:
	var riga := HBoxContainer.new()
	riga.add_theme_constant_override("separation", 4)
	var e_pc: bool = String(c.get("kind", "")) == "pc"
	var abbattuto: bool = bool(c.get("defeated", false))

	var nome := Label.new()
	var hp: String = "%d/%d" % [int(c["hitPoints"]), int(c["maxHitPoints"])]
	nome.text = "%s %s  (%s)" % ["🛡" if e_pc else "☠", String(c["name"]), hp]
	nome.add_theme_font_size_override("font_size", 12)
	nome.add_theme_color_override(
		"font_color", Color(0.55, 0.52, 0.48) if abbattuto else Color(0.9, 0.85, 0.72))
	nome.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	riga.add_child(nome)

	riga.add_child(_mini_btn("−5", _danno_rapido.bind(String(c["id"])), Color(0.7, 0.3, 0.28)))
	riga.add_child(_mini_btn("+5", _cura_rapida.bind(String(c["id"])), Color(0.3, 0.55, 0.35)))
	if not e_pc:
		# Solo i PNG si tolgono dalla scena: i PG del party si gestiscono da scheda/creazione.
		var togli := _togli.bind(String(c["id"]), String(c["name"]))
		riga.add_child(_mini_btn("🗑", togli, Color(0.4, 0.36, 0.34)))
	return riga


func _mini_btn(testo: String, azione: Callable, tinta: Color) -> Button:
	var b := Button.new()
	b.text = testo
	b.custom_minimum_size = Vector2(34, 30)
	b.add_theme_color_override("font_color", Color(0.95, 0.93, 0.88))
	var sb := StyleBoxFlat.new()
	sb.bg_color = tinta
	sb.set_corner_radius_all(6)
	b.add_theme_stylebox_override("normal", sb)
	b.pressed.connect(azione)
	return b


# --- Costruzione UI ---

func _build_ui() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	add_child(col)

	var titolo := Label.new()
	titolo.text = "🛠 Strumenti del Master"
	titolo.add_theme_font_size_override("font_size", 15)
	titolo.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	col.add_child(titolo)

	col.add_child(_sezione("Nebbia di guerra"))
	var riga_fog := HBoxContainer.new()
	riga_fog.add_theme_constant_override("separation", 6)
	riga_fog.add_child(_btn_largo("👁 Svela mappa", _svela_nebbia))
	riga_fog.add_child(_btn_largo("🌫 Rinnebbia", _rinnebbia))
	col.add_child(riga_fog)

	col.add_child(_sezione("Atmosfera (forza scena)"))
	var griglia_audio := GridContainer.new()
	griglia_audio.columns = 3
	griglia_audio.add_theme_constant_override("h_separation", 4)
	griglia_audio.add_theme_constant_override("v_separation", 4)
	for voce: Array in SCENE_AUDIO:
		griglia_audio.add_child(_btn_largo(String(voce[0]), _forza_scena_audio.bind(String(voce[1]))))
	col.add_child(griglia_audio)

	col.add_child(_sezione("Combattenti in scena"))
	_lista_combattenti = VBoxContainer.new()
	_lista_combattenti.add_theme_constant_override("separation", 3)
	col.add_child(_lista_combattenti)


func _sezione(testo: String) -> Label:
	var l := Label.new()
	l.text = testo
	l.add_theme_font_size_override("font_size", 12)
	l.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	return l


func _btn_largo(testo: String, azione: Callable) -> Button:
	var b := Button.new()
	b.text = testo
	b.custom_minimum_size = Vector2(0, 36)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.pressed.connect(azione)
	return b


func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.07, 0.062, 0.052, 0.98)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.4)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	add_theme_stylebox_override("panel", sb)
