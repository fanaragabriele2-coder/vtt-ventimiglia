class_name CampaignSelectScreen
extends PanelContainer
## Schermata di scelta CAMPAGNA (overlay a schermo intero) — la prima cosa che si vede
## all'avvio, PRIMA della creazione del personaggio: una card per ogni arco narrativo di
## CampaignDirector.campagne_disponibili() (oggi: 🏰 L'Ombra sul Confine su Ventimiglia, o
## 🧙 L'Ultima Alleanza si Spezza sulla Terra di Mezzo). La scelta chiama
## CampaignDirector.imposta_campagna(id) — che alliena da solo anche il Set di mappe giusto —
## poi emette campagna_scelta() perche' VTTMain prosegua con la creazione del party.

signal campagna_scelta()


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_apply_style()
	_build_ui()


func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.035, 0.03, 0.985)
	add_theme_stylebox_override("panel", sb)


func _build_ui() -> void:
	var scroll := ScrollContainer.new()
	scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(scroll)

	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 18)
	root.custom_minimum_size = Vector2(760, 0)
	center.add_child(root)

	var title := Label.new()
	title.text = "⚜ Tavolo Oscuro di Ventimiglia"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 28)
	title.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	root.add_child(title)

	var sub := Label.new()
	sub.text = "Scegli la campagna: l'arco narrativo, il bestiario e le mappe si adattano da soli."
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	root.add_child(sub)

	for voce: Dictionary in CampaignDirector.campagne_disponibili():
		root.add_child(_build_card(voce))


func _build_card(voce: Dictionary) -> PanelContainer:
	var card := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.08, 0.07)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 18
	sb.content_margin_right = 18
	sb.content_margin_top = 14
	sb.content_margin_bottom = 14
	sb.set_border_width_all(1)
	sb.border_color = Color(0.3, 0.26, 0.18)
	card.add_theme_stylebox_override("panel", sb)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	card.add_child(col)

	var titolo := Label.new()
	titolo.text = String(voce.get("titolo", ""))
	titolo.add_theme_font_size_override("font_size", 20)
	titolo.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	col.add_child(titolo)

	var descrizione := Label.new()
	descrizione.text = String(voce.get("descrizione", ""))
	descrizione.autowrap_mode = TextServer.AUTOWRAP_WORD
	descrizione.add_theme_color_override("font_color", Color(0.82, 0.78, 0.7))
	col.add_child(descrizione)

	var avvia := Button.new()
	avvia.text = "🎲 Inizia questa campagna"
	avvia.custom_minimum_size = Vector2(0, 44)
	avvia.pressed.connect(_on_campagna_premuta.bind(String(voce.get("id", ""))))
	col.add_child(avvia)

	return card


func _on_campagna_premuta(id: String) -> void:
	CampaignDirector.imposta_campagna(id)
	campagna_scelta.emit()
