class_name CompanyStatusPanel
extends PanelContainer
## Cruscotto dello SPIRITO della Compagnia (solo Terra di Mezzo): il giorno di cammino, la barra
## del FARDELLO dell'Ombra (rossa: piu' sale, piu' dure le prove e piu' agguati) e quella della
## SPERANZA (dorata: alta aiuta prove e tiri contro la morte, bassa li penalizza). Si aggiorna da
## solo su CompanySpirit.stato_cambiato e appare/scompare col cambio campagna.

const COL_ORO: Color = Color(0.86, 0.72, 0.34)
const COL_FARDELLO: Color = Color(0.55, 0.22, 0.5)
const COL_SPERANZA: Color = Color(0.9, 0.78, 0.4)

var _giorno: Label
var _fardello_bar: ProgressBar
var _speranza_bar: ProgressBar


func _ready() -> void:
	_apply_style()
	_build_ui()
	CompanySpirit.stato_cambiato.connect(_aggiorna)
	GameState.event_published.connect(_su_evento)
	_aggiorna(CompanySpirit.speranza, CompanySpirit.fardello, CompanySpirit.giorno)
	_aggiorna_visibilita()


func _aggiorna(speranza: int, fardello: int, giorno: int) -> void:
	_giorno.text = "🧭 Giorno %d di cammino" % giorno
	_fardello_bar.value = fardello
	_fardello_bar.tooltip_text = ("Fardello dell'Ombra: %d/100 — cresce coi Nazgul, i " % fardello) \
		+ "luoghi oscuri e le giornate storte; ogni 25 punti le prove perdono 1. " \
		+ "Riposare lo alleggerisce."
	_speranza_bar.value = speranza
	_speranza_bar.tooltip_text = ("Speranza della Compagnia: %d/100 — a 70+ da' +1 a " % speranza) \
		+ "prove e tiri contro la morte, a 25- li penalizza. Vittorie e rifugi la alzano, " \
		+ "le cadute la spengono."


func _su_evento(nome_evento: String, _payload: Variant) -> void:
	if nome_evento == "campagna:cambiata":
		_aggiorna_visibilita()


func _aggiorna_visibilita() -> void:
	visible = CampaignDirector.campagna_attuale_id() == "terra_di_mezzo"


# --- Costruzione UI ---

func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.045, 0.92)
	sb.border_color = Color(COL_ORO.r, COL_ORO.g, COL_ORO.b, 0.4)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 7
	sb.content_margin_bottom = 7
	add_theme_stylebox_override("panel", sb)
	custom_minimum_size = Vector2(230, 0)


func _build_ui() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	add_child(col)
	_giorno = Label.new()
	_giorno.add_theme_color_override("font_color", COL_ORO)
	col.add_child(_giorno)
	_fardello_bar = _barra(col, "🌑 Fardello", COL_FARDELLO)
	_speranza_bar = _barra(col, "🕯 Speranza", COL_SPERANZA)


func _barra(dentro: VBoxContainer, titolo: String, colore: Color) -> ProgressBar:
	var riga := HBoxContainer.new()
	riga.add_theme_constant_override("separation", 6)
	dentro.add_child(riga)
	var nome := Label.new()
	nome.text = titolo
	nome.custom_minimum_size = Vector2(86, 0)
	nome.add_theme_color_override("font_color", Color(0.85, 0.8, 0.7))
	riga.add_child(nome)
	var barra := ProgressBar.new()
	barra.min_value = 0.0
	barra.max_value = 100.0
	barra.show_percentage = false
	barra.custom_minimum_size = Vector2(120, 14)
	barra.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var sfondo := StyleBoxFlat.new()
	sfondo.bg_color = Color(0.12, 0.11, 0.1)
	sfondo.set_corner_radius_all(6)
	barra.add_theme_stylebox_override("background", sfondo)
	var pieno := StyleBoxFlat.new()
	pieno.bg_color = colore
	pieno.set_corner_radius_all(6)
	barra.add_theme_stylebox_override("fill", pieno)
	riga.add_child(barra)
	return barra
