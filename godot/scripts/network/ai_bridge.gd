extends Node
## AIBridge (Autoload singleton) — porting del Modulo 10/11 + Master Chat del monolite JS.
##
## E' il PONTE della "Split-Rig": questo client (laptop RTX 4050) resta leggero e delega la logica
## del Dungeon Master a un PC remoto (RTX 5080) che fa girare Ollama, raggiungibile via HTTP in LAN.
## L'INDIRIZZO del server e' configurabile a runtime (set_ollama_host) e persistito in user://, cosi'
## cambiare l'IP non richiede ricompilare nulla.
##
## STREAMING: Godot 4 non ha fetch/ReadableStream, ma HTTPClient permette lo streaming vero leggendo
## il corpo della risposta a chunk. Ollama /api/chat con "stream": true restituisce NDJSON (un
## oggetto JSON per riga, ognuno con .message.content): li leggo mano a mano ed emetto master_chunk
## parola-per-parola, esattamente come fetchOllamaMasterReplyStreaming del JS (Task 1).
##
## Il payload contiene lo SNAPSHOT del party (HP, CA, caratteristiche REALI) preso da
## CharacterManager: il Master non chiede presentazioni, conosce gia' le schede.
##
## Registrazione: Project Settings > Autoload -> "AIBridge" (per ultimo).

## Un pezzo di narrazione del Master e' arrivato (streaming parola-per-parola).
signal master_chunk(text: String)
## La risposta e' completa: narrazione integrale + eventuali comandi di gioco estratti dopo <<DATI>>.
signal master_complete(narration: String, commands: Array)
## Errore di rete/parsing (server spento, IP errato, timeout).
signal master_error(message: String)
## Un singolo comando di gioco riconosciuto dall'AI e' pronto per essere applicato dai sistemi.
signal command_received(command: Dictionary)
## Comando "speak": testo da leggere ad alta voce (lo raccogliera' il futuro modulo TTS).
signal speak_requested(text: String)

const CONFIG_PATH: String = "user://ai_bridge.cfg"
const DEFAULT_HOST: String = "127.0.0.1"
const DEFAULT_PORT: int = 11434
const DEFAULT_MODEL: String = "llama3.1"
const SEPARATORE_DATI_MASTER: String = "<<DATI>>"

var _host: String = DEFAULT_HOST
var _port: int = DEFAULT_PORT
var _model: String = DEFAULT_MODEL
var _busy: bool = false
# Storico conversazione (ruoli user/assistant) per dare continuita' al Master.
var _history: Array[Dictionary] = []


func _ready() -> void:
	_load_config()


# --- Configurazione dell'endpoint remoto (Split-Rig: l'IP della 5080 e' impostabile) ---

func set_ollama_host(host: String, port: int = DEFAULT_PORT) -> void:
	_host = host.strip_edges()
	_port = port
	_save_config()


func set_model(model_name: String) -> void:
	_model = model_name.strip_edges()
	_save_config()


func get_endpoint_label() -> String:
	return "http://%s:%d  (modello: %s)" % [_host, _port, _model]


func _load_config() -> void:
	if not FileAccess.file_exists(CONFIG_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CONFIG_PATH))
	if parsed is Dictionary:
		_host = String(parsed.get("host", _host))
		_port = int(parsed.get("port", _port))
		_model = String(parsed.get("model", _model))


func _save_config() -> void:
	var f: FileAccess = FileAccess.open(CONFIG_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({ "host": _host, "port": _port, "model": _model }))
		f.close()


# --- Costruzione del prompt (system + contesto party + istruzioni <<DATI>>) ---

func _build_system_prompt() -> String:
	return "\n".join([
		"Sei il Dungeon Master di una partita di D&D 5e ambientata a Ventimiglia.",
		"Narra in italiano, in seconda persona plurale, in modo evocativo ma conciso.",
		"",
		"SCHEDE DEI PERSONAGGI DEL PARTY (gia note, tienine conto — HP, CA e caratteristiche REALI, NON chiedere presentazioni):",
		CharacterManager.party_context_text(),
		"",
		"Se e SOLO se serve segnalare un dato di gioco (tiro, comparsa nemici, danno...), aggiungi",
		"SUBITO DOPO la narrazione, su una riga a parte, ESATTAMENTE questo separatore: " + SEPARATORE_DATI_MASTER,
		"e dopo di esso un array JSON di comandi, es:",
		SEPARATORE_DATI_MASTER,
		'[{"command":"addNpc","id":"goblin","count":2},{"command":"startCombat"}]',
	])


func _build_messages(user_text: String) -> Array:
	var messages: Array = [{ "role": "system", "content": _build_system_prompt() }]
	messages.append_array(_history)
	messages.append({ "role": "user", "content": user_text })
	return messages


# --- Invio in streaming al Master remoto (porting di fetchOllamaMasterReplyStreaming) ---

## Invia il prompt del giocatore al Master remoto e trasmette la risposta in streaming.
## Emette master_chunk mano a mano, poi master_complete con narrazione + comandi estratti.
func send_master_prompt(user_text: String) -> void:
	if _busy:
		master_error.emit("Il Master sta gia' rispondendo, attendi.")
		return
	if user_text.strip_edges().is_empty():
		return
	_busy = true

	var http := HTTPClient.new()
	var err: int = http.connect_to_host(_host, _port)
	if err != OK:
		_fail("Connessione al server AI fallita (%s:%d)." % [_host, _port])
		return

	# Attende risoluzione DNS + handshake TCP.
	while http.get_status() == HTTPClient.STATUS_CONNECTING or http.get_status() == HTTPClient.STATUS_RESOLVING:
		http.poll()
		await get_tree().process_frame
	if http.get_status() != HTTPClient.STATUS_CONNECTED:
		_fail("Server AI non raggiungibile (%s:%d). Controlla che Ollama sia in ascolto." % [_host, _port])
		return

	var body: String = JSON.stringify({
		"model": _model,
		"messages": _build_messages(user_text),
		"stream": true,
	})
	var headers: PackedStringArray = ["Content-Type: application/json"]
	err = http.request(HTTPClient.METHOD_POST, "/api/chat", headers, body)
	if err != OK:
		_fail("Invio della richiesta al Master fallito.")
		return

	# Attende che la richiesta parta e che il server inizi a rispondere.
	while http.get_status() == HTTPClient.STATUS_REQUESTING:
		http.poll()
		await get_tree().process_frame

	if not http.has_response():
		_fail("Il Master non ha risposto (nessuna risposta dal server).")
		return
	var code: int = http.get_response_code()
	if code < 200 or code >= 300:
		_fail("Il Master ha risposto con errore HTTP %d." % code)
		return

	# --- Lettura in streaming del corpo NDJSON (una riga JSON per token/gruppo di token) ---
	var buffer: String = ""
	var full_reply: String = ""
	while http.get_status() == HTTPClient.STATUS_BODY:
		http.poll()
		var chunk: PackedByteArray = http.read_response_body_chunk()
		if chunk.is_empty():
			await get_tree().process_frame
			continue
		buffer += chunk.get_string_from_utf8()
		# Estrae le righe complete (NDJSON): ogni riga e' un oggetto JSON con .message.content.
		while buffer.contains("\n"):
			var newline: int = buffer.find("\n")
			var line: String = buffer.substr(0, newline).strip_edges()
			buffer = buffer.substr(newline + 1)
			if line.is_empty():
				continue
			var piece: String = _extract_content_from_line(line)
			if not piece.is_empty():
				full_reply += piece
				# Trasmette live SOLO la parte narrativa (prima del separatore <<DATI>>).
				master_chunk.emit(_visible_during_streaming(full_reply, piece))
		await get_tree().process_frame

	http.close()
	_finish(user_text, full_reply)


func _extract_content_from_line(line: String) -> String:
	var obj: Variant = JSON.parse_string(line)
	if obj is Dictionary and obj.has("message"):
		var msg: Variant = obj["message"]
		if msg is Dictionary:
			return String(msg.get("content", ""))
	return ""


## Durante lo streaming mostra solo cio' che precede il separatore <<DATI>>: la narrazione scorre,
## il blocco JSON dei comandi resta silenzioso finche' non e' completo (porting di
## testoVisibileDuranteStreaming).
func _visible_during_streaming(full_reply: String, latest_piece: String) -> String:
	if full_reply.contains(SEPARATORE_DATI_MASTER):
		return ""  # da qui in poi sono dati, non narrazione: niente da mostrare live
	return latest_piece


func _finish(user_text: String, full_reply: String) -> void:
	_busy = false
	var split: Dictionary = _separate_narration_and_data(full_reply)
	# Aggiorna lo storico (solo la narrazione, non i comandi grezzi).
	_history.append({ "role": "user", "content": user_text })
	_history.append({ "role": "assistant", "content": split["narration"] })
	# Instrada i comandi ai sistemi.
	for command: Dictionary in split["commands"]:
		_dispatch_command(command)
	master_complete.emit(split["narration"], split["commands"])


func _fail(message: String) -> void:
	_busy = false
	master_error.emit(message)


## Divide "narrazione <<DATI>> [json]" -> { narration, commands }. Porting di separaNarrazioneEDati.
func _separate_narration_and_data(reply: String) -> Dictionary:
	var idx: int = reply.find(SEPARATORE_DATI_MASTER)
	if idx == -1:
		return { "narration": reply.strip_edges(), "commands": [] }
	var narration: String = reply.substr(0, idx).strip_edges()
	var data_part: String = reply.substr(idx + SEPARATORE_DATI_MASTER.length()).strip_edges()
	var commands: Array = []
	var parsed: Variant = JSON.parse_string(data_part)
	if parsed is Array:
		for c: Variant in parsed:
			if c is Dictionary:
				commands.append(c)
	elif parsed is Dictionary:
		commands.append(parsed)
	return { "narration": narration, "commands": commands }


# --- Esecuzione dei comandi di gioco (porting del executor del Modulo 11) ---

## Applica un comando riconosciuto ai manager. Quelli che richiedono la mappa (moveToken, revealFog,
## surfaces...) non sono eseguiti qui: vengono ri-emessi via command_received per il layer mappa.
func _dispatch_command(command: Dictionary) -> void:
	var command_name: String = String(command.get("command", ""))
	match command_name:
		"speak":
			speak_requested.emit(String(command.get("text", "")))
		"addNpc":
			var count: int = maxi(1, int(command.get("count", 1)))
			for i: int in range(count):
				CombatManager.add_npc(String(command.get("id", "goblin")))
		"startCombat":
			CombatManager.start_combat()
		"endCombat":
			CombatManager.end_combat()
		"nextTurn":
			CombatManager.next_turn()
		"rollInitiative":
			CombatManager.roll_all_initiative()
		"attack":
			CombatManager.resolve_attack(String(command.get("attacker", "pc-local")), String(command.get("target", "")), String(command.get("mode", "normal")))
		"damage":
			CombatManager.apply_damage_to_combatant(String(command.get("targetId", "pc-local")), int(command.get("amount", 0)))
		"heal":
			CombatManager.heal_combatant(String(command.get("targetId", "pc-local")), int(command.get("amount", 0)))
		"setHp":
			CharacterManager.set_current_hp(int(command.get("value", 0)))
		"setAc":
			CharacterManager.set_armor_class(int(command.get("value", 10)))
		"setAbility":
			CharacterManager.set_ability_score(String(command.get("ability", "str")), int(command.get("value", 10)))
		_:
			# moveToken, addToken, revealFog, createSurface, setElevation, applyCondition, ...
			# li gestira' il layer mappa/condizioni quando lo costruiremo.
			command_received.emit(command)


func is_busy() -> bool:
	return _busy


## Azzera lo storico della conversazione (nuova scena/sessione).
func clear_history() -> void:
	_history.clear()
