extends CanvasLayer
## EpilogueScreen (Autoload) — lo SCHERMO DI MORTE (H4): quando il party cade davvero (TPK),
## il tavolo non si limita a una riga in chat. Cala il buio, e sull'epilogo compaiono le GESTA
## della Compagnia — le ultime pagine del Diario di viaggio — perche' anche una caduta racconti
## qualcosa. Due strade: "⟲ Rialzatevi" (se il racconto ha un boss in corso usa la clemenza
## progressiva di StoryDirector.riprova; altrimenti una cura di misericordia a meta' forze) e
## "Accetta la fine" (chiude l'epilogo e lascia il tavolo com'e').
## Compare con un piccolo ritardo: prima si vedono le dissolvenze dei token e la chat.

const RITARDO_SEC: float = 1.6
const MAX_GESTA: int = 6

var _velo: ColorRect
var _pannello: PanelContainer
var _gesta: RichTextLabel
var _generazione: int = 0


func _ready() -> void:
	layer = 84  # sotto il ReactionPrompt (85): le conferme restano cliccabili sopra il velo
	_costruisci()
	CombatManager.party_wiped.connect(_su_tpk)


func _su_tpk() -> void:
	_generazione += 1
	var mia: int = _generazione
	await get_tree().create_timer(RITARDO_SEC).timeout
	# Durante l'attesa la partita puo' essere ripartita (riprova dal pannello Storia, un carica).
	if _generazione != mia or CombatManager.is_active():
		return
	_riempi_gesta()
	_velo.visible = true
	_pannello.visible = true
	_velo.modulate = Color(1, 1, 1, 0)
	_pannello.modulate = Color(1, 1, 1, 0)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(_velo, "modulate:a", 1.0, 0.9)
	tw.tween_property(_pannello, "modulate:a", 1.0, 1.2).set_delay(0.4)
	MusicDirector.imposta_tema("terrore")


func _riempi_gesta() -> void:
	_gesta.clear()
	var voci: Array = TravelJournal.voci()
	if voci.is_empty():
		_gesta.append_text("[color=#8a8070]La strada era appena cominciata. Nessuno "
			+ "scrivera' di voi... a meno che non vi rialziate.[/color]")
		return
	_gesta.append_text("[color=#c9a86a]Cosi' ricorderanno la Compagnia:[/color]\n")
	var da: int = maxi(0, voci.size() - MAX_GESTA)
	for i: int in range(da, voci.size()):
		if not (voci[i] is Dictionary):
			continue
		_gesta.append_text("[color=#8a8070]Giorno %d[/color] — [color=#d8c9a0]%s[/color]\n" % [
			int((voci[i] as Dictionary).get("giorno", 1)),
			String((voci[i] as Dictionary).get("testo", "")),
		])


func _su_rialzatevi() -> void:
	_chiudi()
	if StoryDirector.riprova_disponibile():
		StoryDirector.riprova()
		return
	# Fuori dal racconto (un agguato andato male): la misericordia del Master — meta' forze.
	for pg: CharacterData in CharacterManager.get_party():
		@warning_ignore("integer_division")
		var soglia: int = maxi(1, pg.hp_max / 2)
		if pg.hp_current < soglia:
			CharacterManager.heal_by_id(pg.id, soglia - pg.hp_current)
	GameState.announce("🕯 Non era la vostra ora: vi risvegliate doloranti, a meta' delle "
		+ "forze. La strada continua.")
	TravelJournal.scrivi("La Compagnia e' caduta... ma la strada non l'ha voluta trattenere.")


func _chiudi() -> void:
	_velo.visible = false
	_pannello.visible = false
	MusicDirector.imposta_tema("esplorazione")


# --- Costruzione UI ---

func _costruisci() -> void:
	_velo = ColorRect.new()
	_velo.color = Color(0.02, 0.015, 0.02, 0.9)
	_velo.visible = false
	_velo.set_anchors_preset(Control.PRESET_FULL_RECT)
	_velo.mouse_filter = Control.MOUSE_FILTER_STOP  # il tavolo sotto non riceve click
	add_child(_velo)
	_pannello = PanelContainer.new()
	_pannello.visible = false
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.045, 0.98)
	sb.border_color = Color(0.55, 0.2, 0.15, 0.8)
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(14)
	sb.content_margin_left = 22
	sb.content_margin_right = 22
	sb.content_margin_top = 16
	sb.content_margin_bottom = 16
	_pannello.add_theme_stylebox_override("panel", sb)
	_pannello.set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_KEEP_SIZE)
	add_child(_pannello)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	_pannello.add_child(col)
	var titolo := Label.new()
	titolo.text = "🕯 La Compagnia e' caduta"
	titolo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	titolo.add_theme_font_size_override("font_size", 28)
	titolo.add_theme_color_override("font_color", Color(0.85, 0.4, 0.3))
	col.add_child(titolo)
	var sotto := Label.new()
	sotto.text = "L'Ombra si richiude sul sentiero. Ma le storie, quelle, restano."
	sotto.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sotto.add_theme_color_override("font_color", Color(0.7, 0.65, 0.55))
	col.add_child(sotto)
	_gesta = RichTextLabel.new()
	_gesta.bbcode_enabled = true
	_gesta.fit_content = true
	_gesta.custom_minimum_size = Vector2(560, 0)
	_gesta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(_gesta)
	var riga := HBoxContainer.new()
	riga.alignment = BoxContainer.ALIGNMENT_CENTER
	riga.add_theme_constant_override("separation", 12)
	col.add_child(riga)
	var riprova := Button.new()
	riprova.text = "⟲ Rialzatevi"
	riprova.custom_minimum_size = Vector2(220, 48)
	riprova.pressed.connect(_su_rialzatevi)
	riga.add_child(riprova)
	var fine := Button.new()
	fine.text = "Accetta la fine"
	fine.custom_minimum_size = Vector2(220, 48)
	fine.pressed.connect(_chiudi)
	riga.add_child(fine)
