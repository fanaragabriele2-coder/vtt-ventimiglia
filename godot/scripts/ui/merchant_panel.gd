class_name MerchantPanel
extends PanelContainer
## Bottega di un MERCANTE: saluto, borsa comune del party e listino con prezzi in oro. Un click
## su "Compra" passa da MerchantManager (controllo oro, oggetto nello zaino, annuncio in chat);
## l'oro visibile e i pulsanti si aggiornano subito. Si apre dal marker "M" sulla mappa (da
## vicino) e si chiude con la ✕.

var _titolo: Label
var _saluto: Label
var _oro: Label
var _lista: VBoxContainer
var _mercante_id: String = ""


func _ready() -> void:
	visible = false
	_apply_style()
	_build_ui()


## Apre la bottega di un mercante (Dictionary da MerchantManager).
func apri(mercante: Dictionary) -> void:
	if mercante.is_empty():
		return
	_mercante_id = String(mercante.get("id", ""))
	_titolo.text = "🛒 " + String(mercante.get("nome", "Mercante"))
	_saluto.text = String(mercante.get("saluto", ""))
	_riempi_listino(mercante)
	visible = true
	UiFx.entra(self)


func _riempi_listino(mercante: Dictionary) -> void:
	for figlio: Node in _lista.get_children():
		figlio.queue_free()
	var borsa: int = ProgressionManager.oro_totale()
	_oro.text = "💰 Borsa del party: %d oro" % borsa
	for voce: Variant in mercante.get("listino", []):
		if not (voce is Dictionary):
			continue
		var item_id: String = String((voce as Dictionary).get("item", ""))
		var prezzo: int = int((voce as Dictionary).get("prezzo", 0))
		var nome: String = String(InventoryManager.item_definition(item_id).get("name", item_id))
		var riga := HBoxContainer.new()
		riga.add_theme_constant_override("separation", 8)
		_lista.add_child(riga)
		# FIGURA dell'oggetto a listino, accanto al nome e al prezzo.
		var icona := TextureRect.new()
		icona.custom_minimum_size = Vector2(40, 40)
		icona.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icona.texture = ItemArt.per_id(item_id)
		riga.add_child(icona)
		var etichetta := Label.new()
		etichetta.text = "%s — %d oro" % [nome, prezzo]
		etichetta.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		etichetta.add_theme_color_override("font_color", Color(0.88, 0.83, 0.72))
		riga.add_child(etichetta)
		var compra := Button.new()
		compra.text = "Compra"
		compra.custom_minimum_size = Vector2(90, 34)
		compra.disabled = prezzo > borsa
		compra.pressed.connect(_su_compra.bind(item_id))
		riga.add_child(compra)


func _su_compra(item_id: String) -> void:
	if MerchantManager.compra(_mercante_id, item_id):
		# Listino ridisegnato: la borsa e' cambiata e qualche prezzo puo' non essere piu' a portata.
		_riempi_listino(MerchantManager.mercante_per_id(_mercante_id))


# --- Costruzione UI ---

func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.055, 0.05, 0.043, 0.96)
	sb.border_color = Color(0.87, 0.7, 0.28, 0.45)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	add_theme_stylebox_override("panel", sb)
	custom_minimum_size = Vector2(380, 0)


func _build_ui() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	add_child(col)
	var riga := HBoxContainer.new()
	col.add_child(riga)
	_titolo = Label.new()
	_titolo.text = "🛒 Mercante"
	_titolo.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_titolo.add_theme_color_override("font_color", Color(0.87, 0.7, 0.28))
	riga.add_child(_titolo)
	var chiudi := Button.new()
	chiudi.text = "✕"
	chiudi.custom_minimum_size = Vector2(34, 30)
	chiudi.pressed.connect(hide)
	riga.add_child(chiudi)
	_saluto = Label.new()
	_saluto.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_saluto.custom_minimum_size = Vector2(350, 0)
	_saluto.add_theme_color_override("font_color", Color(0.75, 0.7, 0.6))
	col.add_child(_saluto)
	_oro = Label.new()
	_oro.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	col.add_child(_oro)
	_lista = VBoxContainer.new()
	_lista.add_theme_constant_override("separation", 4)
	col.add_child(_lista)
