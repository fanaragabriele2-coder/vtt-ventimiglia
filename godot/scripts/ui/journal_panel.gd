class_name JournalPanel
extends PanelContainer
## Pannello 📓 DIARIO DI VIAGGIO: le gesta della Compagnia scritte da TravelJournal, giorno per
## giorno (partenze, agguati respinti, boss abbattuti, arrivi, cadute, il riepilogo finale).
## Si apre/chiude dal pulsante 📓 Diario della toolbar del Mondo; si aggiorna da solo quando il
## diario scrive una voce nuova.

var _log: RichTextLabel


func _ready() -> void:
	visible = false
	_apply_style()
	_build_ui()
	TravelJournal.diario_aggiornato.connect(_riempi)
	visibility_changed.connect(func() -> void:
		if visible:
			_riempi()
			UiFx.entra(self))


func _riempi() -> void:
	if not visible:
		return
	_log.clear()
	var voci: Array = TravelJournal.voci()
	if voci.is_empty():
		_log.append_text("[color=#8a8070]Il diario e' ancora bianco: mettetevi in cammino "
			+ "e le pagine si scriveranno da sole…[/color]")
		return
	for v: Variant in voci:
		if not (v is Dictionary):
			continue
		_log.append_text("[color=#c9a86a]Giorno %d[/color] — [color=#e8d9b0]%s[/color]\n" % [
			int((v as Dictionary).get("giorno", 1)), String((v as Dictionary).get("testo", "")),
		])


# --- Costruzione UI ---

func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.055, 0.05, 0.043, 0.96)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.4)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	add_theme_stylebox_override("panel", sb)
	custom_minimum_size = Vector2(360, 420)


func _build_ui() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	add_child(col)
	var riga := HBoxContainer.new()
	col.add_child(riga)
	var titolo := Label.new()
	titolo.text = "📓 Diario di viaggio"
	titolo.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titolo.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	riga.add_child(titolo)
	var chiudi := Button.new()
	chiudi.text = "✕"
	chiudi.custom_minimum_size = Vector2(34, 30)
	chiudi.pressed.connect(hide)
	riga.add_child(chiudi)
	_log = RichTextLabel.new()
	_log.bbcode_enabled = true
	_log.scroll_following = true
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(_log)
