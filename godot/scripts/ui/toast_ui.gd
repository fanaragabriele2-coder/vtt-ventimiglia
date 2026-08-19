extends CanvasLayer
## ToastUi (Autoload) — i CARTELLINI DI RACCOLTA: quando ottieni un oggetto (bottino di un nemico,
## acquisto dal mercante, ricompensa di una missione) compare in basso al centro un cartellino con
## la sua FIGURA (ItemArt) e il suo NOME — "Hai ottenuto: …" — bordato del colore della sua
## rarita'. Sale, resta un istante, poi svanisce. Piu' oggetti insieme? Si impilano (i nuovi sopra
## i vecchi), cosi' un bottino intero non e' un lampo solo.
##
## Ascolta l'evento globale "oggetto:raccolto" (GameState.publish): chi da' un oggetto non deve
## sapere che il cartellino esiste — pubblica e basta. Payload: { "id": <catalogo>, "nome"?, "n"? }.
## Livello alto (sopra la mappa e i pannelli), ma non ruba il mouse: e' pura scenografia.

const DURATA: float = 2.6          # vita di un cartellino (salita + sosta + dissolvenza)
const MAX_VISIBILI: int = 4        # oltre, i piu' vecchi vengono spazzati via subito
const COL_RARITA: Dictionary = {
	"comune": Color(0.72, 0.72, 0.75), "rara": Color(0.36, 0.62, 0.92),
	"epica": Color(0.68, 0.42, 0.9), "leggendaria": Color(0.95, 0.78, 0.32),
}

var _colonna: VBoxContainer


func _ready() -> void:
	layer = 80  # sopra la mappa e i pannelli di gioco, sotto i dialoghi modali di sistema
	_colonna = VBoxContainer.new()
	_colonna.alignment = BoxContainer.ALIGNMENT_END
	_colonna.add_theme_constant_override("separation", 8)
	_colonna.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_colonna.offset_bottom = -110  # sopra la barra dei comandi in fondo alla vista
	_colonna.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_colonna.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_colonna)
	GameState.event_published.connect(_su_evento)


func _su_evento(nome_evento: String, dati: Variant) -> void:
	if nome_evento == "oggetto:raccolto" and dati is Dictionary:
		mostra(dati as Dictionary)


## Mostra un cartellino per un oggetto raccolto. `dati`: { "id": catalogo, "nome"?, "n"? }.
func mostra(dati: Dictionary) -> void:
	var item_id: String = String(dati.get("id", ""))
	if item_id.is_empty():
		return
	var quanti: int = maxi(1, int(dati.get("n", 1)))
	var def: Dictionary = InventoryManager.item_definition(item_id)
	var nome: String = String(dati.get("nome", def.get("name", item_id)))
	var rarita: String = String(def.get("rarity", "comune"))
	var bordo: Color = COL_RARITA.get(rarita, COL_RARITA["comune"])
	_potatura()
	_colonna.add_child(_costruisci(item_id, nome, quanti, bordo))


## Se ci sono troppi cartellini in scena (raffica di bottino) i piu' vecchi (in cima) escono subito.
func _potatura() -> void:
	while _colonna.get_child_count() >= MAX_VISIBILI:
		_colonna.get_child(0).queue_free()
		_colonna.remove_child(_colonna.get_child(0))


func _costruisci(item_id: String, nome: String, quanti: int, bordo: Color) -> Control:
	var carta := PanelContainer.new()
	carta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	carta.modulate = Color(1, 1, 1, 0)  # entra in dissolvenza
	carta.add_theme_stylebox_override("panel", _stile(bordo))
	var riga := HBoxContainer.new()
	riga.add_theme_constant_override("separation", 10)
	riga.mouse_filter = Control.MOUSE_FILTER_IGNORE
	carta.add_child(riga)
	var icona := TextureRect.new()
	icona.custom_minimum_size = Vector2(44, 44)
	icona.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icona.texture = ItemArt.per_id(item_id)
	riga.add_child(icona)
	var testo := Label.new()
	var suffisso: String = (" ×%d" % quanti) if quanti > 1 else ""
	testo.text = "Hai ottenuto: %s%s" % [nome, suffisso]
	testo.add_theme_color_override("font_color", Color(0.95, 0.92, 0.84))
	testo.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	testo.add_theme_constant_override("outline_size", 4)
	testo.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	riga.add_child(testo)
	_anima(carta)
	return carta


## Il cartellino ENTRA (sale e appare), RESTA, poi SVANISCE e si libera da solo.
func _anima(carta: Control) -> void:
	var tw: Tween = carta.create_tween()
	carta.position.y = 18.0
	tw.set_parallel(true)
	tw.tween_property(carta, "modulate:a", 1.0, 0.22)
	tw.tween_property(carta, "position:y", 0.0, 0.28).set_trans(Tween.TRANS_BACK) \
		.set_ease(Tween.EASE_OUT)
	tw.chain().tween_interval(DURATA - 0.7)
	tw.chain().tween_property(carta, "modulate:a", 0.0, 0.48)
	tw.chain().tween_callback(carta.queue_free)


func _stile(bordo: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.055, 0.048, 0.94)
	sb.border_color = Color(bordo, 0.9)
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(9)
	sb.content_margin_left = 12
	sb.content_margin_right = 14
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	# Un alone del colore di rarita': gli oggetti rari "brillano" di piu'.
	sb.shadow_color = Color(bordo, 0.5)
	sb.shadow_size = 10
	return sb
