class_name SaveSlotsPanel
extends PanelContainer
## Le PARTITE SALVATE (H4): tre slot piu' il salvataggio rapido, ognuno con la sua targhetta —
## quando, quale campagna, quali eroi. Salva / Carica / Elimina per slot; l'eliminazione chiede
## conferma col prompt delle reazioni (stessa UI, zero doppioni). Si apre dal pulsante
## "💾 Partite" della toolbar e si chiude con la ✕.

const SLOT_IDS: Array[String] = ["partita", "slot1", "slot2", "slot3"]
const NOMI_SLOT: Dictionary = {
	"partita": "Salvataggio rapido", "slot1": "Slot 1", "slot2": "Slot 2", "slot3": "Slot 3",
}

var _righe: VBoxContainer


func _ready() -> void:
	visible = false
	_apply_style()
	_build_ui()
	SaveManager.game_saved.connect(func(_s: String) -> void: _riempi())
	SaveManager.game_loaded.connect(func(_s: String) -> void: _riempi())


func apri() -> void:
	visible = true
	_riempi()
	UiFx.entra(self)


func _riempi() -> void:
	if not visible:
		return
	for figlio: Node in _righe.get_children():
		figlio.queue_free()
	for slot: String in SLOT_IDS:
		_righe.add_child(_riga_slot(slot))


func _riga_slot(slot: String) -> PanelContainer:
	var box := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.11, 0.1, 0.085)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	box.add_theme_stylebox_override("panel", sb)
	var riga := HBoxContainer.new()
	riga.add_theme_constant_override("separation", 10)
	box.add_child(riga)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	riga.add_child(col)
	var titolo := Label.new()
	titolo.text = String(NOMI_SLOT.get(slot, slot))
	titolo.add_theme_color_override("font_color", Color(0.87, 0.7, 0.28))
	col.add_child(titolo)
	var info := Label.new()
	var meta: Dictionary = SaveManager.slot_info(slot)
	if bool(meta.get("esiste", false)):
		info.text = "%s — %s\n%s" % [String(meta.get("salvatoIl", "?")),
			String(meta.get("campagna", "?")), String(meta.get("party", "?"))]
	else:
		info.text = "— vuoto —"
	info.add_theme_color_override("font_color", Color(0.72, 0.68, 0.58))
	info.add_theme_font_size_override("font_size", 13)
	col.add_child(info)
	var salva := Button.new()
	salva.text = "💾"
	salva.tooltip_text = "Salva la partita in questo slot (sovrascrive)."
	salva.custom_minimum_size = Vector2(44, 40)
	salva.pressed.connect(func() -> void: SaveManager.save_game(slot))
	riga.add_child(salva)
	var carica := Button.new()
	carica.text = "📂"
	carica.tooltip_text = "Carica la partita da questo slot."
	carica.custom_minimum_size = Vector2(44, 40)
	carica.disabled = not bool(meta.get("esiste", false))
	carica.pressed.connect(func() -> void:
		if SaveManager.load_game(slot):
			hide())
	riga.add_child(carica)
	var elimina := Button.new()
	elimina.text = "🗑"
	elimina.tooltip_text = "Elimina questo salvataggio (chiede conferma)."
	elimina.custom_minimum_size = Vector2(44, 40)
	elimina.disabled = not bool(meta.get("esiste", false))
	elimina.pressed.connect(_su_elimina.bind(slot))
	riga.add_child(elimina)
	return box


func _su_elimina(slot: String) -> void:
	var si: bool = await ReactionPrompt.chiedi(
		"🗑 Eliminare '%s'?" % String(NOMI_SLOT.get(slot, slot)),
		"Il salvataggio verra' cancellato dal disco. Non si puo' annullare.",
		"Elimina", "Tienilo")
	if si and SaveManager.delete_slot(slot):
		GameState.announce("🗑 Salvataggio '%s' eliminato." % String(NOMI_SLOT.get(slot, slot)))
	_riempi()


# --- Costruzione UI ---

func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.055, 0.05, 0.043, 0.97)
	sb.border_color = Color(0.87, 0.7, 0.28, 0.45)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	add_theme_stylebox_override("panel", sb)
	custom_minimum_size = Vector2(430, 0)


func _build_ui() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	add_child(col)
	var testata := HBoxContainer.new()
	col.add_child(testata)
	var titolo := Label.new()
	titolo.text = "💾 Partite salvate"
	titolo.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titolo.add_theme_color_override("font_color", Color(0.87, 0.7, 0.28))
	testata.add_child(titolo)
	var chiudi := Button.new()
	chiudi.text = "✕"
	chiudi.custom_minimum_size = Vector2(34, 30)
	chiudi.pressed.connect(hide)
	testata.add_child(chiudi)
	var nota := Label.new()
	nota.text = "Party, inventario, progressione, posizione e memoria di campagna. " \
		+ "Gli scontri in corso non si salvano (si interrompono al caricamento)."
	nota.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	nota.custom_minimum_size = Vector2(400, 0)
	nota.add_theme_font_size_override("font_size", 12)
	nota.add_theme_color_override("font_color", Color(0.6, 0.56, 0.48))
	col.add_child(nota)
	_righe = VBoxContainer.new()
	_righe.add_theme_constant_override("separation", 6)
	col.add_child(_righe)
