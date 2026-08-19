class_name CampaignStoryPanel
extends PanelContainer
## Pannello del RACCONTO ramificato (modalita' Storia): disegna cio' che StoryDirector presenta —
## la narrazione nel log, le OPZIONI come pulsanti (le PROVE aprono un tiro di 1d20 col vassoio 3D
## e ne mandano l'esito al director), e una riga di testo LIBERO in cui il giocatore puo' scrivere
## quello che vuole (viene agganciato all'opzione piu' simile). I boss fight compaiono sulla mappa:
## il pannello mostra la scena e invita a combattere coi pulsanti; vinto lo scontro, il racconto
## prosegue da solo (StoryDirector emette il nodo successivo).

var _log: RichTextLabel
var _riga_opzioni: VBoxContainer
var _input: LineEdit
var _invia_btn: Button
var _titolo: Label
var _gia_avviato: bool = false
var _indice_prova: int = -1
var _vassoio_connesso: bool = false


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size = Vector2(340, 0)
	_apply_style()
	_build_ui()
	StoryDirector.nodo_presentato.connect(_on_nodo)
	StoryDirector.racconto_finito.connect(_on_finito)
	visibility_changed.connect(_su_visibilita)


## Il racconto parte (o riprende) la PRIMA volta che il pannello viene mostrato: cosi' aprire la
## Storia non fa comparire nulla finche' non la si guarda davvero.
func _su_visibilita() -> void:
	if not _gia_avviato and is_visible_in_tree():
		_gia_avviato = true
		_titolo.text = "📖 " + StoryDirector.titolo()
		StoryDirector.avvia()


func _on_nodo(dati: Dictionary) -> void:
	var testo: String = String(dati.get("testo", ""))
	if not testo.is_empty():
		_append("\n[color=#e8d9b0]" + testo + "[/color]")
		MasterVoice.parla(testo)
	_svuota_opzioni()
	if bool(dati.get("combattimento", false)):
		_append("\n[color=#c98a3b]⚔ Lo scontro e' sulla mappa: combatti coi pulsanti. "
			+ "Vincendo, il racconto prosegue.[/color]")
		return
	_costruisci_opzioni(dati.get("opzioni", []))
	if bool(dati.get("fine", false)):
		_aggiungi_bottone("⟲ Rigioca il racconto", _ricomincia)


func _on_finito() -> void:
	_append("\n[color=#9ad06a]— Fine del racconto —[/color]")


## Un pulsante per ogni opzione: "vai" avanza subito, "prova" apre un tiro di 1d20.
func _costruisci_opzioni(opzioni: Array) -> void:
	for i: int in range(opzioni.size()):
		var o: Dictionary = opzioni[i]
		var tipo: String = String(o.get("tipo", "vai"))
		if tipo == "prova":
			var mod: int = int(o.get("mod", 0))
			var segno: String = "+%d" % mod if mod >= 0 else str(mod)
			var etichetta: String = "🎲 %s — %s CD %d (1d20%s)" % [
				String(o.get("testo", "")), String(o.get("etichetta", "Prova")),
				int(o.get("cd", 12)), segno,
			]
			_aggiungi_bottone(etichetta, _on_prova.bind(i))
		elif tipo == "riprova":
			_aggiungi_bottone(String(o.get("testo", "")), _on_riprova)
		else:
			_aggiungi_bottone("▸ " + String(o.get("testo", "")), _on_scelta.bind(i))


func _on_scelta(indice: int) -> void:
	_svuota_opzioni()
	StoryDirector.scegli(indice)


func _on_riprova() -> void:
	_svuota_opzioni()
	StoryDirector.riprova()


## Prova: apre il vassoio 3D per un 1d20; l'esito torna a StoryDirector.risolvi_prova.
func _on_prova(indice: int) -> void:
	_svuota_opzioni()
	_indice_prova = indice
	var vassoio: DiceTray3D = get_tree().get_first_node_in_group("vassoio_dadi_3d") as DiceTray3D
	if vassoio == null:
		_dopo_tiro(randi_range(1, 20))  # scena spoglia: tiro istantaneo, stesso flusso
		return
	if not _vassoio_connesso:
		vassoio.tiro_completato.connect(_on_tiro_completato)
		_vassoio_connesso = true
	vassoio.tira(20, 1)


func _on_tiro_completato(facce: int, totale: int, _singoli: PackedInt32Array) -> void:
	if _indice_prova < 0 or facce != 20:
		return  # solo il 1d20 che aspettiamo noi (i tiri liberi del tiratore rapido non c'entrano)
	_dopo_tiro(totale)


func _dopo_tiro(totale_d20: int) -> void:
	var indice: int = _indice_prova
	_indice_prova = -1
	StoryDirector.risolvi_prova(indice, totale_d20)


func _ricomincia() -> void:
	_svuota_opzioni()
	StoryDirector.ricomincia()


# --- Testo libero ---

func _on_invio(testo: String) -> void:
	_input.clear()
	var pulito: String = testo.strip_edges()
	if pulito.is_empty():
		return
	_append("\n[color=#9fd0ff][b]Tu:[/b][/color] " + pulito)
	var messaggio: String = StoryDirector.azione_libera(pulito)
	if not messaggio.is_empty():
		_append("\n[color=#c9a86a]" + messaggio + "[/color]")


func _on_bottone_invia() -> void:
	_on_invio(_input.text)


# --- Costruzione UI ---

func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.055, 0.05, 0.043)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.35)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	add_theme_stylebox_override("panel", sb)


func _build_ui() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	add_child(col)

	_titolo = Label.new()
	_titolo.text = "📖 Racconto"
	_titolo.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	col.add_child(_titolo)

	_log = RichTextLabel.new()
	_log.bbcode_enabled = true
	_log.scroll_following = true
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.append_text("[color=#8a8070]Apri la Storia per cominciare il racconto…[/color]")
	col.add_child(_log)

	_riga_opzioni = VBoxContainer.new()
	_riga_opzioni.add_theme_constant_override("separation", 4)
	col.add_child(_riga_opzioni)

	var riga := HBoxContainer.new()
	riga.add_theme_constant_override("separation", 6)
	col.add_child(riga)
	_input = LineEdit.new()
	_input.placeholder_text = "…oppure scrivi cosa fate (verra' agganciato alla scelta piu' vicina)"
	_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_input.custom_minimum_size = Vector2(0, 40)
	_input.text_submitted.connect(_on_invio)
	riga.add_child(_input)
	_invia_btn = Button.new()
	_invia_btn.text = "Invia"
	_invia_btn.custom_minimum_size = Vector2(0, 40)
	_invia_btn.pressed.connect(_on_bottone_invia)
	riga.add_child(_invia_btn)


func _aggiungi_bottone(testo: String, handler: Callable) -> void:
	var b := Button.new()
	b.text = testo
	b.custom_minimum_size = Vector2(0, 40)
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.pressed.connect(handler)
	_riga_opzioni.add_child(b)


func _svuota_opzioni() -> void:
	for figlio: Node in _riga_opzioni.get_children():
		figlio.queue_free()


func _append(bbcode: String) -> void:
	_log.append_text(bbcode)
