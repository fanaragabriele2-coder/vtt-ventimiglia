class_name NexusView
extends Control
## NexusView — incapsula il Nexus Map Engine (Node2D con luci/ombre) dentro il layout a Control del
## gioco. Un motore mappa illuminato ha bisogno di un mondo 2D vero (CanvasModulate/PointLight2D
## agiscono su un World2D): lo si ottiene con SubViewport. Questo nodo mette insieme
## SubViewportContainer -> SubViewport -> NexusMapManager, aggiunge una barra (scelta tema +
## rigenera) e collega i click alla logica di gioco esistente (CombatManager per gli spawn nemici).
##
## E' una VISTA alternativa alla mappa tattica: i dungeon procedurali complessi (cripte, roccaforti,
## templi di lava, caverne) vivono qui; la griglia semplice di TacticalMap resta per gli scontri
## rapidi. Il toggle in vtt_main sceglie quale mostrare.

const PC_TOKEN_ID: String = "nexus-pc"
const COL_PC: Color = Color(0.55, 0.78, 1.0)
const COL_NPC: Color = Color(0.95, 0.45, 0.4)

const TEMI: Array = [
	["cripta", "🪦 Cripta oscura"],
	["roccaforte", "⛰ Roccaforte nanica"],
	["tempio_lava", "🌋 Tempio di lava"],
	["caverna", "🕳 Caverna naturale"],
]

var _map: NexusMapManager
var _tema_option: OptionButton
var _party_cell: Vector2i = Vector2i.ZERO


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	_build_viewport()
	_build_toolbar()
	# I nemici li piazza il sistema di combattimento esistente: qualunque add_npc (dai pulsanti Evoca,
	# dall'Encounter Balancer o dai comandi del Master IA) fa comparire il token qui, senza doppioni e
	# senza che AIBridge conosca il Nexus. Alla morte, il token sparisce.
	CombatManager.combatant_added.connect(_on_combatant_added)
	CombatManager.combatant_defeated.connect(_on_combatant_defeated)
	# Hook esplicito per il Master IA: "spawna sulla cella X" (il token nasce comunque da combatant_added).
	EventBus.nexus_spawn_requested.connect(_on_spawn_requested)
	# Primo dungeon all'apparizione della vista.
	rigenera()


func _build_viewport() -> void:
	var container := SubViewportContainer.new()
	container.stretch = true              # il SubViewport eredita la dimensione del container
	container.set_anchors_preset(Control.PRESET_FULL_RECT)
	container.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(container)

	var viewport := SubViewport.new()
	viewport.handle_input_locally = true
	viewport.gui_disable_input = false
	viewport.transparent_bg = false
	container.add_child(viewport)

	_map = NexusMapManager.new()
	_map.cella_cliccata.connect(_on_cella_cliccata)
	viewport.add_child(_map)


func _build_toolbar() -> void:
	var panel := PanelContainer.new()
	panel.position = Vector2(8, 8)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.045, 0.9)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 8
	sb.content_margin_right = 8
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	panel.add_theme_stylebox_override("panel", sb)
	add_child(panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)

	var lbl := Label.new()
	lbl.text = "🏰 Nexus Dungeon:"
	lbl.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	row.add_child(lbl)

	_tema_option = OptionButton.new()
	for coppia: Array in TEMI:
		_tema_option.add_item(String(coppia[1]))
	row.add_child(_tema_option)

	var rigen_btn := Button.new()
	rigen_btn.text = "🎲 Rigenera"
	rigen_btn.pressed.connect(rigenera)
	row.add_child(rigen_btn)

	var hint := Label.new()
	hint.text = "  (click = muovi · rotellina = zoom · trascina tasto dx = pan)"
	hint.add_theme_font_size_override("font_size", 11)
	hint.add_theme_color_override("font_color", Color(0.6, 0.55, 0.45))
	row.add_child(hint)


## Genera un nuovo dungeon del tema selezionato e ci ripiazza il token del party sulla cella di spawn.
func rigenera() -> void:
	var tema: String = String(TEMI[_tema_option.selected][0]) if _tema_option else "cripta"
	_map.genera_dungeon(tema)
	_party_cell = _map.cella_spawn()
	_map.spawn_token(PC_TOKEN_ID, _party_cell, true, COL_PC)


func _on_cella_cliccata(cell: Vector2i) -> void:
	# Click-to-move sul dungeon: il PG si sposta solo su celle percorribili (no muri/lava/acqua).
	if not _map.cella_percorribile(cell):
		return
	_party_cell = cell
	_map.muovi_token(PC_TOKEN_ID, cell)
	EventBus.nexus_party_moved.emit(cell)


## Ogni combattente registrato nel CombatManager (PNG) ottiene un token sul dungeon, piazzato su una
## cella percorribile vicino al party. I PG restano rappresentati dall'unico token del party
## (nexus-pc): CombatManager oggi ha un solo combattente-PG ("pc-local"), gia' mostrato come party.
func _on_combatant_added(combatant: Dictionary) -> void:
	if String(combatant.get("kind", "")) != "npc":
		return
	var cid: String = String(combatant["id"])
	var dove: Vector2i = _cella_libera_vicino(_party_cell)
	_map.spawn_token(cid, dove, false, COL_NPC)
	CombatManager.set_combatant_cell(cid, dove)


func _on_combatant_defeated(combatant_id: String, _source_id: String) -> void:
	_map.rimuovi_token(combatant_id)


## Hook per il Master IA: chiede lo spawn su una cella precisa. Il token nasce da _on_combatant_added
## (add_npc lo emette): qui si aggiunge solo, dopo, il riposizionamento sulla cella richiesta.
func _on_spawn_requested(monster_id: String, cell: Vector2i) -> void:
	var combattente: Dictionary = CombatManager.add_npc(monster_id)
	if combattente.is_empty() or not _map.in_mappa(cell) or not _map.cella_percorribile(cell):
		return
	_map.muovi_token(String(combattente["id"]), cell)
	CombatManager.set_combatant_cell(String(combattente["id"]), cell)


func _cella_libera_vicino(centro: Vector2i) -> Vector2i:
	for raggio: int in range(2, 8):
		for d: Vector2i in [Vector2i(raggio, 0), Vector2i(-raggio, 0), Vector2i(0, raggio), Vector2i(0, -raggio)]:
			var c: Vector2i = centro + d
			if _map.cella_percorribile(c):
				return c
	return centro
