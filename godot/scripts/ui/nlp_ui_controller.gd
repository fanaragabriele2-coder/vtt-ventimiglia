class_name NlpUiController
extends PanelContainer
## Modalita' Storia (Chat-Driven UI / NLP Bridge): il giocatore scrive in linguaggio naturale,
## l'LLM riceve l'azione + lo stato del gioco (VttCoreManager.stato_per_llm) e risponde SOLO con
## lo schema JSON { narrazione, opzioni, richiede_dado, dado, scopo_dado }. Questo pannello fa il
## parsing (via AIBridge.json_complete, gia' validato) e GENERA la UI: il testo va nel log (e alla
## voce del Master), le opzioni diventano pulsanti cliccabili, "richiede_dado" diventa il pulsante
## "🎲 Lancia 1d6" che apre il VASSOIO 3D vero (DiceTray3D) — e se lo scopo del tiro e'
## "movimento", il risultato diventa il budget di celle del party (VttCoreManager), che la griglia
## Nexus consuma passo per passo.
##
## Il risultato di ogni tiro torna automaticamente all'LLM come turno successivo ("Ho tirato...")
## — il ciclo azione -> narrazione -> scelta/dado -> azione si chiude da solo.

const MAX_OPZIONI: int = 4

var _log: RichTextLabel
var _riga_opzioni: VBoxContainer
var _input: LineEdit
var _invia_btn: Button
var _dado_atteso: String = ""
var _facce_attese: int = 0
var _vassoio_connesso: bool = false


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size = Vector2(340, 0)
	_apply_style()
	_build_ui()
	AIBridge.json_complete.connect(_on_risposta)
	AIBridge.master_error.connect(_on_errore)


# --- Flusso: azione -> LLM -> JSON -> UI dinamica ---

func _invia_testo(testo: String) -> void:
	var pulito: String = testo.strip_edges()
	if pulito.is_empty() or AIBridge.is_busy():
		return
	_append("\n[color=#9fd0ff][b]Tu:[/b][/color] " + pulito)
	_svuota_opzioni()
	_imposta_attesa(true)
	AIBridge.send_json_prompt(pulito)


func _on_risposta(risposta: Dictionary) -> void:
	_imposta_attesa(false)
	var narrazione: String = String(risposta.get("narrazione", ""))
	if not narrazione.is_empty():
		_append("\n[color=#e8d9b0]" + narrazione + "[/color]")
		MasterVoice.parla(narrazione)
	_costruisci_opzioni(risposta)


func _on_errore(messaggio: String) -> void:
	_imposta_attesa(false)
	_append("\n[color=#c9362b]⚠ " + messaggio + "[/color]")


## I pulsanti nascono dal JSON: un pulsante per opzione (cliccarlo = inviarla come prossima
## azione) + il pulsante del dado quando il Master lo chiede.
func _costruisci_opzioni(risposta: Dictionary) -> void:
	_svuota_opzioni()
	for opzione: Variant in (risposta.get("opzioni", []) as Array).slice(0, MAX_OPZIONI):
		var b := Button.new()
		b.text = "▸ " + String(opzione)
		b.custom_minimum_size = Vector2(0, 40)
		b.pressed.connect(_invia_testo.bind(String(opzione)))
		_riga_opzioni.add_child(b)
	if bool(risposta.get("richiede_dado", false)):
		_aggiungi_bottone_dado(String(risposta.get("dado", "")), String(risposta.get("scopo_dado", "")))


func _aggiungi_bottone_dado(dado: String, scopo: String) -> void:
	var spec: Dictionary = _parse_dado(dado)
	if spec.is_empty():
		return
	var b := Button.new()
	var etichetta_scopo: String = " (movimento)" if scopo == "movimento" else ""
	b.text = "🎲 Lancia " + dado + etichetta_scopo
	b.custom_minimum_size = Vector2(0, 44)
	b.pressed.connect(_on_lancia_dado.bind(dado, scopo))
	_riga_opzioni.add_child(b)


## "2d6" -> { quanti: 2, facce: 6 }. Vuoto se il formato non e' un dado da tavolo sensato.
func _parse_dado(dado: String) -> Dictionary:
	var re := RegEx.new()
	re.compile("^(\\d{1,2})d(\\d{1,3})$")
	var m: RegExMatch = re.search(dado.strip_edges().to_lower())
	if m == null:
		return {}
	var quanti: int = clampi(int(m.get_string(1)), 1, 8)
	var facce: int = int(m.get_string(2))
	if not facce in [4, 6, 8, 10, 12, 20]:
		return {}
	return { "quanti": quanti, "facce": facce }


func _on_lancia_dado(dado: String, scopo: String) -> void:
	var spec: Dictionary = _parse_dado(dado)
	if spec.is_empty():
		return
	_svuota_opzioni()
	var vassoio: DiceTray3D = get_tree().get_first_node_in_group("vassoio_dadi_3d") as DiceTray3D
	if vassoio == null:
		# Senza vassoio 3D (scena spoglia): tiro istantaneo, stesso flusso.
		var totale: int = 0
		for i: int in range(int(spec["quanti"])):
			totale += randi_range(1, int(spec["facce"]))
		_dopo_tiro(dado, scopo, totale)
		return
	if not _vassoio_connesso:
		vassoio.tiro_completato.connect(_on_tiro_completato)
		_vassoio_connesso = true
	_dado_atteso = dado + "|" + scopo
	_facce_attese = int(spec["facce"])
	vassoio.tira(int(spec["facce"]), int(spec["quanti"]))


func _on_tiro_completato(facce: int, totale: int, _singoli: PackedInt32Array) -> void:
	# Solo il tiro che ASPETTIAMO noi: i tiri liberi dal tiratore rapido non c'entrano.
	if _dado_atteso.is_empty() or facce != _facce_attese:
		return
	var parti: PackedStringArray = _dado_atteso.split("|")
	_dado_atteso = ""
	_dopo_tiro(parti[0], parti[1] if parti.size() > 1 else "", totale)


## Chiude il cerchio: il risultato aggiorna il motore (budget di movimento se lo scopo era quello)
## e torna all'LLM come prossimo turno, cosi' la Storia prosegue dal numero VERO.
func _dopo_tiro(dado: String, scopo: String, totale: int) -> void:
	if scopo == "movimento" and VttCoreManager.is_movimento_in_blocco():
		VttCoreManager.imposta_budget_movimento(totale)
	_invia_testo("Ho tirato %s: risultato %d." % [dado, totale])


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

	var titolo := Label.new()
	titolo.text = "📖 Modalita' Storia — scrivi cosa fate"
	titolo.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	col.add_child(titolo)

	_log = RichTextLabel.new()
	_log.bbcode_enabled = true
	_log.scroll_following = true
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.append_text("[color=#8a8070]Il Master ascolta. Racconta la vostra prossima mossa…[/color]")
	col.add_child(_log)

	_riga_opzioni = VBoxContainer.new()
	_riga_opzioni.add_theme_constant_override("separation", 4)
	col.add_child(_riga_opzioni)

	var riga := HBoxContainer.new()
	riga.add_theme_constant_override("separation", 6)
	col.add_child(riga)
	_input = LineEdit.new()
	_input.placeholder_text = "Es. entriamo nella cripta con cautela…"
	_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_input.custom_minimum_size = Vector2(0, 40)
	_input.text_submitted.connect(_on_invio)
	riga.add_child(_input)
	_invia_btn = Button.new()
	_invia_btn.text = "Invia"
	_invia_btn.custom_minimum_size = Vector2(0, 40)
	_invia_btn.pressed.connect(_on_bottone_invia)
	riga.add_child(_invia_btn)


func _on_invio(testo: String) -> void:
	_input.clear()
	_invia_testo(testo)


func _on_bottone_invia() -> void:
	_on_invio(_input.text)


func _imposta_attesa(in_attesa: bool) -> void:
	_invia_btn.disabled = in_attesa
	_invia_btn.text = "…" if in_attesa else "Invia"


func _svuota_opzioni() -> void:
	for figlio: Node in _riga_opzioni.get_children():
		figlio.queue_free()


func _append(bbcode: String) -> void:
	_log.append_text(bbcode)
