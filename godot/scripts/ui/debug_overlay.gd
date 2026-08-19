class_name DebugOverlay
extends PanelContainer
## Overlay di debug (F3): i numeri VERI dietro al vincolo hardware (RTX 4050 + LLM locale).
##
## Mostra live: FPS e draw call, VRAM texture/video usata dal gioco (quel che resta e' dell'LLM),
## memoria statica, conteggio nodi, stato della State Machine (VttCoreManager) col budget di
## movimento, e le statistiche del culling (MapEngineOptimized): luci che stanno DAVVERO
## disegnando sul totale, chunk del map stitcher in VRAM sul totale.
##
## F3 accende/spegne. Da spento non costa nulla: il refresh (0.5s) gira solo quando visibile.

const INTERVALLO: float = 0.5

var _testo: Label
var _accumulo: float = 0.0


func _ready() -> void:
	visible = false
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_TOP_RIGHT)
	grow_horizontal = Control.GROW_DIRECTION_BEGIN
	offset_top = 60
	offset_right = -10
	_apply_style()
	_testo = Label.new()
	_testo.add_theme_font_size_override("font_size", 13)
	_testo.add_theme_color_override("font_color", Color(0.7, 0.95, 0.7))
	add_child(_testo)
	set_process(false)


func _unhandled_key_input(event: InputEvent) -> void:
	var tasto := event as InputEventKey
	if tasto == null or not tasto.pressed or tasto.echo:
		return
	if tasto.physical_keycode == KEY_F3:
		visible = not visible
		set_process(visible)
		if visible:
			_aggiorna()


func _process(delta: float) -> void:
	_accumulo += delta
	if _accumulo < INTERVALLO:
		return
	_accumulo = 0.0
	_aggiorna()


func _aggiorna() -> void:
	var righe: PackedStringArray = [
		"FPS %d   draw call %d   nodi %d" % [
			int(Performance.get_monitor(Performance.TIME_FPS)),
			int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),
			int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		],
		"VRAM texture %s   video %s" % [
			_mb(Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED)),
			_mb(Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)),
		],
		"RAM statica %s" % _mb(Performance.get_monitor(Performance.MEMORY_STATIC)),
		"Stato: %s%s" % [VttCoreManager.nome_stato(), _testo_budget()],
	]
	righe.append_array(_righe_culling())
	_testo.text = "\n".join(righe)


func _testo_budget() -> String:
	var budget: int = VttCoreManager.budget_movimento()
	return "" if budget < 0 else "   movimento %d celle" % budget


## Le statistiche oneste del culling, se il Nexus e' in scena (gruppo "nexus_map").
func _righe_culling() -> PackedStringArray:
	var righe: PackedStringArray = []
	for mappa: Node in get_tree().get_nodes_in_group("nexus_map"):
		if not mappa.has_method("statistiche_culling"):
			continue
		var s: Dictionary = mappa.statistiche_culling()
		if s.is_empty():
			continue
		righe.append("Culling: luci %d/%d accese   chunk %d/%d in VRAM" % [
			int(s.get("luci_attive", 0)), int(s.get("luci_totali", 0)),
			int(s.get("chunk_in_vram", 0)), int(s.get("chunk_totali", 0)),
		])
	return righe


func _mb(byte_count: float) -> String:
	return "%.1f MB" % (byte_count / 1048576.0)


func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0, 0, 0, 0.72)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	add_theme_stylebox_override("panel", sb)
