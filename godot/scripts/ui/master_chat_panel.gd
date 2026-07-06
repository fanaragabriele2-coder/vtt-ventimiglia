class_name MasterChatPanel
extends PanelContainer
## Pannello Chat Master (colonna destra) — porting della Master Chat + config Ollama del monolite.
##
## Si connette ad AIBridge: mostra la narrazione del Master in STREAMING parola-per-parola
## (master_chunk), gestisce gli errori di rete e permette di impostare l'IP del server remoto
## (la RTX 5080 della Split-Rig). L'invio del prompt include gia' lo snapshot del party lato AIBridge.

var _log: RichTextLabel
var _input: LineEdit
var _host_input: LineEdit
var _status: Label
var _send_button: Button
var _streaming_active: bool = false


func _ready() -> void:
	custom_minimum_size = Vector2(360, 0)
	_apply_dark_style()
	_build_ui()
	AIBridge.master_chunk.connect(_on_master_chunk)
	AIBridge.master_complete.connect(_on_master_complete)
	AIBridge.master_error.connect(_on_master_error)
	AIBridge.speak_requested.connect(_on_speak_requested)
	# Canale unico di annuncio (GameState.announce): level-up, bottino, condizioni, superfici,
	# elevazione, IA nemici... ogni sistema di gioco scrive qui senza conoscere questo pannello.
	GameState.event_published.connect(_on_game_event)
	_status.text = "Master remoto: " + AIBridge.get_endpoint_label()


func _apply_dark_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.055, 0.05, 0.043)
	sb.border_color = Color(0.78, 0.61, 0.24, 0.35)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 14
	sb.content_margin_right = 14
	sb.content_margin_top = 12
	sb.content_margin_bottom = 12
	add_theme_stylebox_override("panel", sb)


func _build_ui() -> void:
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	add_child(root)

	var title := Label.new()
	title.text = "Chat Master"
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	root.add_child(title)

	# --- Configurazione dell'IP del server remoto (Split-Rig) ---
	var host_row := HBoxContainer.new()
	host_row.add_theme_constant_override("separation", 6)
	root.add_child(host_row)
	var host_lbl := Label.new()
	host_lbl.text = "IP 5080:"
	host_row.add_child(host_lbl)
	_host_input = LineEdit.new()
	_host_input.placeholder_text = "es. 192.168.1.50"
	_host_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_host_input.text_submitted.connect(_on_host_submitted)
	host_row.add_child(_host_input)
	var host_btn := Button.new()
	host_btn.text = "Imposta"
	host_btn.pressed.connect(func() -> void: _on_host_submitted(_host_input.text))
	host_row.add_child(host_btn)

	_status = Label.new()
	_status.add_theme_font_size_override("font_size", 11)
	_status.add_theme_color_override("font_color", Color(0.72, 0.63, 0.42))
	root.add_child(_status)

	# --- Log della conversazione (scorre, streaming) ---
	_log = RichTextLabel.new()
	_log.bbcode_enabled = true
	_log.scroll_following = true
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.custom_minimum_size = Vector2(0, 240)
	var log_sb := StyleBoxFlat.new()
	log_sb.bg_color = Color(0.03, 0.028, 0.024)
	log_sb.set_corner_radius_all(8)
	log_sb.content_margin_left = 10
	log_sb.content_margin_right = 10
	log_sb.content_margin_top = 8
	log_sb.content_margin_bottom = 8
	_log.add_theme_stylebox_override("normal", log_sb)
	root.add_child(_log)
	_append_system("Benvenuti a Ventimiglia. Impostate l'IP del Master e scrivete la vostra azione.")

	# --- Riga di invio ---
	var send_row := HBoxContainer.new()
	send_row.add_theme_constant_override("separation", 6)
	root.add_child(send_row)
	_input = LineEdit.new()
	_input.placeholder_text = "Scrivi al Master o descrivi la tua azione…"
	_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_input.text_submitted.connect(_on_input_submitted)
	send_row.add_child(_input)
	_send_button = Button.new()
	_send_button.text = "Invia"
	_send_button.custom_minimum_size = Vector2(0, 44)
	_send_button.pressed.connect(func() -> void: _on_input_submitted(_input.text))
	send_row.add_child(_send_button)


# --- Invio del prompt al Master remoto ---

func _on_input_submitted(text: String) -> void:
	var prompt: String = text.strip_edges()
	if prompt.is_empty() or AIBridge.is_busy():
		return
	_append_player(prompt)
	_input.clear()
	# Prepara la riga del Master che verra' riempita in streaming.
	_log.append_text("\n[color=#c89b3c][b]Master:[/b][/color] ")
	_streaming_active = true
	_send_button.disabled = true
	AIBridge.send_master_prompt(prompt)


func _on_host_submitted(ip: String) -> void:
	var host: String = ip.strip_edges()
	if host.is_empty():
		return
	AIBridge.set_ollama_host(host)
	_status.text = "Master remoto: " + AIBridge.get_endpoint_label()
	_append_system("Server AI impostato su " + AIBridge.get_endpoint_label())


# --- Reazioni ai signal di AIBridge ---

func _on_master_chunk(piece: String) -> void:
	_log.append_text(piece)


func _on_master_complete(_narration: String, commands: Array) -> void:
	_streaming_active = false
	_send_button.disabled = false
	if not commands.is_empty():
		_append_system("(%d comando/i di gioco applicati dal Master)" % commands.size())


func _on_master_error(message: String) -> void:
	_streaming_active = false
	_send_button.disabled = false
	_log.append_text("\n[color=#c9362b]⚠ " + message + "[/color]")


func _on_game_event(event_name: String, payload: Variant) -> void:
	if event_name == "system:message":
		_append_system(String(payload))


func _on_speak_requested(text: String) -> void:
	# Il modulo TTS non c'e' ancora: per ora si annota solo che il Master voleva parlare.
	_append_system("🔊 (voce Master) " + text)


# --- Helper di formattazione ---

func _append_player(text: String) -> void:
	_log.append_text("\n[color=#9fd0ff][b]Tu:[/b][/color] " + text)


func _append_system(text: String) -> void:
	_log.append_text("\n[color=#8a8378][i]" + text + "[/i][/color]")
