extends Node
## TavoloTheme (Autoload, H5) — il VESTITO del Tavolo Oscuro: font a tema e cursori coerenti.
##
## - FONT: Alegreya (SIL OFL, licenza inclusa in assets/fonts) diventa il font di TUTTA la UI
##   via tema della finestra radice — un serif libresco che sa di pagina di romanzo fantasy ma
##   resta leggibilissimo ai corpi piccoli. Cinzel (OFL, capitali romane) e' il fratello da
##   TITOLI: esposto con font_titoli() per chi vuole intestazioni lapidarie.
## - CURSORI: freccia scura bordata d'oro e guanto che indica (assets/ui, generati da PIL),
##   al posto delle frecce di sistema.
##
## TUTTO caricato come FILE GREZZI (FontFile.data / Image.load_from_file): niente dipendenza
## dal sistema d'import — funziona anche in un progetto appena estratto da uno zip, la stessa
## lezione di TokenArt/ItemArt.

const FONT_CORPO: String = "res://assets/fonts/Alegreya.ttf"
const FONT_TITOLI: String = "res://assets/fonts/Cinzel.ttf"
const CURSORE: String = "res://assets/ui/cursore.png"
const CURSORE_MANO: String = "res://assets/ui/cursore_mano.png"

var _titoli: FontFile


func _ready() -> void:
	_applica_font()
	_applica_cursori()


## Il font da TITOLI (Cinzel), per chi vuole intestazioni in capitali romane; null se assente.
func font_titoli() -> FontFile:
	return _titoli


func _carica_font(percorso: String) -> FontFile:
	if not FileAccess.file_exists(percorso):
		return null
	var font := FontFile.new()
	font.data = FileAccess.get_file_as_bytes(percorso)  # bytes grezzi: zero import
	return font


func _applica_font() -> void:
	var corpo: FontFile = _carica_font(FONT_CORPO)
	_titoli = _carica_font(FONT_TITOLI)
	if corpo == null:
		return
	var tema := Theme.new()
	tema.default_font = corpo
	tema.default_font_size = 15
	get_window().theme = tema  # cascata su TUTTI i Control della finestra radice
	# Anche il testo DISEGNATO sulla mappa (draw_string usa ThemeDB.fallback_font): nomi dei
	# token, numeri di danno, etichette dei luoghi — stessa voce tipografica ovunque.
	ThemeDB.fallback_font = corpo


func _applica_cursori() -> void:
	var freccia: Texture2D = _carica_cursore(CURSORE)
	var mano: Texture2D = _carica_cursore(CURSORE_MANO)
	if freccia != null:
		Input.set_custom_mouse_cursor(freccia, Input.CURSOR_ARROW, Vector2(2, 2))
	if mano != null:
		Input.set_custom_mouse_cursor(mano, Input.CURSOR_POINTING_HAND, Vector2(13, 3))


func _carica_cursore(percorso: String) -> Texture2D:
	if not FileAccess.file_exists(percorso):
		return null
	var img: Image = Image.load_from_file(ProjectSettings.globalize_path(percorso))
	return ImageTexture.create_from_image(img) if img != null else null
