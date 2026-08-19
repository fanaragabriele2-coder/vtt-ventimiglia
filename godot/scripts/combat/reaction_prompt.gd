extends CanvasLayer
## ReactionPrompt (Autoload) — il PROMPT BREVE delle reazioni (stile BG3): quando il gioco offre
## una scelta di reazione ("il goblin ti attacca: lanci SCUDO?"), qui compare un pannellino con
## due pulsanti e un conto alla rovescia. Chi chiama fa `await ReactionPrompt.chiedi(...)` e
## riceve true/false; senza risposta entro il tempo, vale NO (il gioco non resta mai appeso).
## Un solo prompt alla volta: se ne arriva un secondo mentre il primo e' aperto, risponde NO.

signal risposta_scelta(si: bool)

const SECONDI_DEFAULT: float = 6.0

var _pannello: PanelContainer
var _titolo: Label
var _dettaglio: Label
var _si_btn: Button
var _no_btn: Button
var _barra: ProgressBar
var _aperto: bool = false
var _generazione: int = 0


func _ready() -> void:
	layer = 85  # sopra l'HUD di combattimento, sotto i dialoghi di sistema
	_costruisci()


## Mostra il prompt e ATTENDE la scelta (o il timeout -> false). Bloccante solo per chi fa await.
func chiedi(titolo: String, dettaglio: String, testo_si: String = "Si'",
		testo_no: String = "No", secondi: float = SECONDI_DEFAULT) -> bool:
	if _aperto:
		return false  # un prompt alla volta: il secondo non interrompe il primo
	_aperto = true
	_generazione += 1
	var mia: int = _generazione
	_titolo.text = titolo
	_dettaglio.text = dettaglio
	_si_btn.text = testo_si
	_no_btn.text = testo_no
	_barra.max_value = secondi
	_barra.value = secondi
	_pannello.visible = true
	UiFx.entra(_pannello)
	_conta_alla_rovescia(mia, secondi)
	var si: bool = await risposta_scelta
	_pannello.visible = false
	_aperto = false
	return si


## Conto alla rovescia: aggiorna la barra e alla fine (se il prompt e' ancora IL MIO) forza il NO.
func _conta_alla_rovescia(mia_generazione: int, secondi: float) -> void:
	var passo: float = 0.1
	var resta: float = secondi
	while resta > 0.0:
		await get_tree().create_timer(passo).timeout
		if _generazione != mia_generazione or not _aperto:
			return  # ha gia' risposto (o e' un altro prompt): questo timer muore in silenzio
		resta -= passo
		_barra.value = resta
	if _generazione == mia_generazione and _aperto:
		risposta_scelta.emit(false)


func _su_scelta(si: bool) -> void:
	if _aperto:
		risposta_scelta.emit(si)


# --- Costruzione UI ---

func _costruisci() -> void:
	_pannello = PanelContainer.new()
	_pannello.visible = false
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.07, 0.06, 0.05, 0.97)
	sb.border_color = Color(0.95, 0.8, 0.35, 0.8)
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(12)
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	sb.content_margin_top = 12
	sb.content_margin_bottom = 12
	sb.shadow_color = Color(0.9, 0.75, 0.3, 0.25)
	sb.shadow_size = 16
	_pannello.add_theme_stylebox_override("panel", sb)
	_pannello.set_anchors_and_offsets_preset(
		Control.PRESET_CENTER_TOP, Control.PRESET_MODE_KEEP_SIZE, 90)
	add_child(_pannello)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	_pannello.add_child(col)
	_titolo = Label.new()
	_titolo.add_theme_color_override("font_color", Color(0.95, 0.8, 0.35))
	_titolo.add_theme_font_size_override("font_size", 18)
	col.add_child(_titolo)
	_dettaglio = Label.new()
	_dettaglio.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dettaglio.custom_minimum_size = Vector2(360, 0)
	_dettaglio.add_theme_color_override("font_color", Color(0.85, 0.8, 0.7))
	col.add_child(_dettaglio)
	_barra = ProgressBar.new()
	_barra.show_percentage = false
	_barra.custom_minimum_size = Vector2(0, 6)
	col.add_child(_barra)
	var riga := HBoxContainer.new()
	riga.add_theme_constant_override("separation", 8)
	col.add_child(riga)
	_si_btn = Button.new()
	_si_btn.custom_minimum_size = Vector2(170, 44)
	_si_btn.pressed.connect(_su_scelta.bind(true))
	riga.add_child(_si_btn)
	_no_btn = Button.new()
	_no_btn.custom_minimum_size = Vector2(170, 44)
	_no_btn.pressed.connect(_su_scelta.bind(false))
	riga.add_child(_no_btn)
