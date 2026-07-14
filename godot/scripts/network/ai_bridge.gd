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
## Modalita' Storia (NLP): risposta JSON strutturata { narrazione, opzioni, richiede_dado, dado,
## scopo_dado } gia' validata. Canale SEPARATO da master_complete: la voce e i bridge prosa->gioco
## non devono reagire a un blob JSON.
signal json_complete(risposta: Dictionary)

const CONFIG_PATH: String = "user://ai_bridge.cfg"
const DEFAULT_HOST: String = "127.0.0.1"
const DEFAULT_PORT: int = 11434
const DEFAULT_MODEL: String = "llama3.1"
const SEPARATORE_DATI_MASTER: String = "<<DATI>>"

# --- Groq cloud (porting di js/12: Master alternativo via https://api.groq.com) ---
# La API key NON e' MAI scritta nel codice sorgente (sarebbe un segreto in chiaro nel repository):
# l'utente la incolla una volta nella Chat Master, e da li' in poi vive SOLO in user://ai_bridge.cfg
# (un file locale sulla macchina di chi gioca, fuori dal progetto Godot e dal controllo versione).
const GROQ_URL: String = "https://api.groq.com/openai/v1/chat/completions"
const GROQ_MODEL: String = "llama-3.3-70b-versatile"
const GROQ_MODEL_FALLBACK: String = "llama-3.1-8b-instant"  # riserva se il primario e' ritirato (404)

var _host: String = DEFAULT_HOST
var _port: int = DEFAULT_PORT
var _model: String = DEFAULT_MODEL
var _provider: String = "ollama"   # "ollama" (Split-Rig LAN) oppure "groq" (cloud)
var _groq_api_key: String = ""
var _busy: bool = false
# Storico conversazione (ruoli user/assistant) per dare continuita' al Master.
var _history: Array[Dictionary] = []
# Modalita' Storia (NLP): quando attiva, il prompt usa lo schema JSON e la risposta va SOLO su
# json_complete. Ha uno storico proprio: la Storia e la Chat Master sono conversazioni distinte.
var _json_mode: bool = false
var _history_json: Array[Dictionary] = []


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


## Sceglie il provider del Master: "ollama" (server remoto in LAN) o "groq" (cloud, serve una key).
func set_provider(provider: String) -> void:
	_provider = provider if provider == "groq" else "ollama"
	_save_config()


func get_provider() -> String:
	return _provider


func set_groq_api_key(key: String) -> void:
	_groq_api_key = key.strip_edges()
	_save_config()


func has_groq_key() -> bool:
	return not _groq_api_key.is_empty()


func get_endpoint_label() -> String:
	if _provider == "groq":
		var key_state: String = "pronta" if has_groq_key() else "manca la API key"
		return "Groq cloud (modello: %s) — %s" % [GROQ_MODEL, key_state]
	return "http://%s:%d  (modello: %s)" % [_host, _port, _model]


func _load_config() -> void:
	if not FileAccess.file_exists(CONFIG_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CONFIG_PATH))
	if parsed is Dictionary:
		_host = String(parsed.get("host", _host))
		_port = int(parsed.get("port", _port))
		_model = String(parsed.get("model", _model))
		_provider = String(parsed.get("provider", _provider))
		_groq_api_key = String(parsed.get("groqApiKey", _groq_api_key))


func _save_config() -> void:
	var f: FileAccess = FileAccess.open(CONFIG_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({
			"host": _host, "port": _port, "model": _model,
			"provider": _provider, "groqApiKey": _groq_api_key,
		}))
		f.close()


# --- Costruzione del prompt (system + contesto party + istruzioni <<DATI>>) ---

func _build_system_prompt() -> String:
	var esempio: Dictionary = _bestiario_esempio()
	var id_esempio: String = String(esempio.get("id", "goblin"))
	var nome_esempio: String = String(esempio.get("name", "dei nemici")).to_lower()
	return "\n".join([
		"Sei il Dungeon Master di una partita di D&D 5e ambientata in %s."
			% CampaignDirector.ambientazione_attuale(),
		"Narra in italiano, in seconda persona plurale, in modo evocativo ma conciso.",
		"",
		"SCHEDE DEI PERSONAGGI DEL PARTY (gia note, tienine conto — HP, CA e caratteristiche"
			+ " REALI, NON chiedere presentazioni):",
		CharacterManager.party_context_text(),
		"",
		"DIARIO DI CAMPAGNA (eventi chiave accaduti finora — la tua memoria a lungo termine):",
		CampaignMemory.contesto_testo(),
		"",
		"POSIZIONI ATTUALI (aggiornate dal gioco, non inventarne altre):",
		_posizioni_context_text(),
		"",
		"LORE DEI NEMICI IN SCENA (narra e falli agire secondo il loro carattere):",
		_lore_nemici_context_text(),
		"",
		"Se e SOLO se serve segnalare un dato di gioco (tiro, comparsa nemici, danno...), aggiungi",
		"SUBITO DOPO la narrazione, su una riga a parte, ESATTAMENTE questo separatore: "
			+ SEPARATORE_DATI_MASTER,
		"e dopo di esso un array JSON di comandi, es:",
		SEPARATORE_DATI_MASTER,
		'[{"command":"addNpc","id":"%s","count":2},{"command":"startCombat"}]' % id_esempio,
		'Per spostare il party in un luogo della mappa: {"command":"moveTo","to":"<nome del luogo>"}.',
		"(Se descrivi lo spostamento a parole, il gioco lo riconosce e muove il party da solo.)",
		"",
		"REGOLE DEL COMBATTIMENTO (IMPORTANTISSIME, rispettale sempre):",
		"- Tu NON gestisci il combattimento: lo gestiscono il sistema a turni e i GIOCATORI.",
		"- Quando scoppia uno scontro: descrivi in UNA o DUE frasi la comparsa dei nemici e",
		"  FERMATI. Poi emetti i comandi per farli comparire e avviare il combattimento a turni.",
		"- NON descrivere gli attacchi dei personaggi, NON tirare dadi, NON dire chi colpisce o",
		"  quanti danni fa, NON far vincere o perdere nessuno: a questo pensano i giocatori con i",
		"  loro pulsanti (Attacca/Bonus/Termina turno) e i dadi del gioco. Aspetta e basta.",
		"- Usa SOLO nemici di questo bestiario (id fra parentesi): " + _bestiario_context_text()
			+ ". Per un nemico generico scegli l'id piu' simile. Esempio di inizio scontro corretto:",
		('"Dalle tenebre sbucano %s ringhianti!" ' % nome_esempio) + SEPARATORE_DATI_MASTER
			+ ' [{"command":"addNpc","id":"%s","count":3},{"command":"startCombat"}]' % id_esempio,
	])


## Elenco "Nome (id), Nome (id), ..." dei mostri della campagna ATTIVA (CampaignDirector.
## bestiario_attuale() filtra il tag "set" di data/monsters.json): il Master IA non deve MAI
## poter proporre mostri di un'altra ambientazione (era il bug "Terra di Mezzo narrata come
## Ventimiglia" — il vecchio elenco era fisso agli 8 mostri originali).
func _bestiario_context_text() -> String:
	var set_attivo: String = CampaignDirector.bestiario_attuale()
	var voci: PackedStringArray = []
	for m: Dictionary in CombatManager.get_monster_catalog():
		if String(m.get("set", "ventimiglia")) == set_attivo:
			voci.append("%s (%s)" % [String(m["name"]), String(m["id"])])
	return ", ".join(voci) if not voci.is_empty() else "Goblin (goblin)"


## La STORIA dei nemici vivi in scena, una riga per TIPO (via catalogId -> lore del bestiario):
## il Master narra un Nazgul da Nazgul e un goblin da goblin. Vuota fuori dagli scontri, cosi'
## il prompt non si gonfia (i limiti di token di Groq ringraziano).
func _lore_nemici_context_text() -> String:
	var visti: Dictionary = {}
	var righe: PackedStringArray = []
	for c: Dictionary in CombatManager.get_state()["combatants"]:
		if String(c.get("kind", "")) != "npc" or bool(c.get("defeated", false)):
			continue
		var catalog_id: String = String(c.get("catalogId", ""))
		if catalog_id.is_empty() or visti.has(catalog_id):
			continue
		visti[catalog_id] = true
		for m: Dictionary in CombatManager.get_monster_catalog():
			if String(m["id"]) == catalog_id and not String(m.get("lore", "")).is_empty():
				righe.append("- %s: %s" % [String(m["name"]), String(m["lore"])])
				break
	return "\n".join(righe) if not righe.is_empty() else "- (nessun nemico in scena)"


## Un mostro rappresentativo (il piu' debole) del bestiario attivo, per gli esempi del prompt.
func _bestiario_esempio() -> Dictionary:
	var set_attivo: String = CampaignDirector.bestiario_attuale()
	var migliore: Dictionary = {}
	for m: Dictionary in CombatManager.get_monster_catalog():
		if String(m.get("set", "ventimiglia")) != set_attivo:
			continue
		if migliore.is_empty() or int(m.get("hitPoints", 999)) < int(migliore.get("hitPoints", 999)):
			migliore = m
	return migliore


## Snapshot delle posizioni per il Master: luogo del party sull'overworld + celle e HP dei
## combattenti sulla griglia (il payload "game_state aggiornato" della direttiva AI Bridge).
func _posizioni_context_text() -> String:
	var righe: PackedStringArray = []
	var luogo: Variant = GameState.get_party_location()
	if luogo is Dictionary and (luogo as Dictionary).has("name"):
		righe.append("- Party: " + String((luogo as Dictionary)["name"]))
	var stato: Dictionary = CombatManager.get_state()
	for c: Dictionary in stato["combatants"]:
		var cella: Variant = CombatManager.get_combatant_cell(String(c["id"]))
		if cella is Vector2i:
			righe.append("- %s: cella (%d, %d), HP %d/%d" % [
				String(c["name"]), (cella as Vector2i).x, (cella as Vector2i).y,
				int(c["hitPoints"]), int(c["maxHitPoints"]),
			])
	return "\n".join(righe) if not righe.is_empty() else "- nessuna posizione tracciata al momento"


## System prompt della Modalita' Storia (Chat-Driven UI): il modello risponde SOLO con l'oggetto
## JSON dello schema — Godot lo parsa e genera la UI (testo, pulsanti-opzione, pulsante dado).
## Lo STATO DEL GIOCO nel prompt e' lo snapshot compatto di VttCoreManager (party, luogo,
## combattenti, cronaca recente): il modello non deve inventare nulla che il motore gia' sa.
func _build_system_prompt_json() -> String:
	return "\n".join([
		("Sei il Dungeon Master di un GDR ambientato in %s (D&D 5e semplificato)."
			% CampaignDirector.ambientazione_attuale()),
		"Il giocatore scrive in linguaggio naturale. Rispondi SOLO con un oggetto JSON valido,",
		"senza alcun testo prima o dopo e senza blocchi di codice, ESATTAMENTE in questo schema:",
		'{"narrazione":"...","opzioni":["...","..."],"richiede_dado":false,"dado":"","scopo_dado":""}',
		"REGOLE:",
		"- narrazione: 2-6 frasi in italiano, seconda persona plurale, evocative ma concise.",
		"- opzioni: da 2 a 4 azioni brevi e concrete che il party puo' fare ORA.",
		'- richiede_dado true SOLO se serve un tiro: allora dado e\' nel formato "1d6" o "1d20",',
		'  e scopo_dado vale "movimento" (il tiro dice di quante celle si muove il party)',
		'  oppure "prova" (abilita\', attacco, fortuna).',
		"- Non inventare posizioni, HP o membri del party: usa lo STATO DEL GIOCO qui sotto.",
		"",
		"STATO DEL GIOCO (JSON aggiornato dal motore, fonte di verita'):",
		JSON.stringify(VttCoreManager.stato_per_llm()),
	])


func _build_messages(user_text: String) -> Array:
	var sistema: String = _build_system_prompt_json() if _json_mode else _build_system_prompt()
	var messages: Array = [{ "role": "system", "content": sistema }]
	messages.append_array(_history_json if _json_mode else _history)
	messages.append({ "role": "user", "content": user_text })
	return messages


# --- Invio in streaming al Master remoto (porting di fetchOllamaMasterReplyStreaming) ---

## Invia il prompt del giocatore al Master (Ollama o Groq, a seconda del provider scelto) e
## trasmette la risposta. Emette master_chunk mano a mano (o in un unico blocco per Groq, che non
## fa streaming — porting fedele: js/12 usa "stream": false anche li'), poi master_complete.
func send_master_prompt(user_text: String) -> void:
	if _busy:
		master_error.emit("Il Master sta gia' rispondendo, attendi.")
		return
	if user_text.strip_edges().is_empty():
		return
	_busy = true
	_json_mode = false
	if _provider == "groq":
		_send_groq_prompt(user_text)
	else:
		_send_ollama_prompt(user_text)


## Modalita' Storia: stesso trasporto (Ollama LAN o Groq), ma prompt a schema JSON, storico
## separato e risposta consegnata SOLO via json_complete (gia' parsata e validata).
func send_json_prompt(user_text: String) -> void:
	if _busy:
		master_error.emit("Il Master sta gia' rispondendo, attendi.")
		return
	if user_text.strip_edges().is_empty():
		return
	_busy = true
	_json_mode = true
	if _provider == "groq":
		_send_groq_prompt(user_text)
	else:
		_send_ollama_prompt(user_text)


func _send_ollama_prompt(user_text: String) -> void:
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
	if code == 404:
		# Ollama risponde 404 su /api/chat quasi sempre perche' il MODELLO non e' installato.
		_fail("HTTP 404 da Ollama: il modello '%s' non risulta installato sul server. Sul PC del Master esegui:  ollama pull %s  — oppure passa al Master Groq (cloud)." % [_model, _model])
		return
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
				# In modalita' Storia non si streama nulla: il JSON si mostra solo completo.
				if not _json_mode:
					master_chunk.emit(_visible_during_streaming(full_reply, piece))
		await get_tree().process_frame

	http.close()
	_finish(user_text, full_reply)


## Invia il prompt al Master via Groq cloud (porting di fetchGroqMasterReply, js/12): niente
## streaming ("stream": false, come nel monolite), un'unica risposta con .choices[0].message.content.
##
## FIX 404: trasporto con il nodo HTTPRequest (TLS/redirect/corpo gestiti dall'engine) al posto
## dell'HTTPClient scritto a mano; in caso di errore HTTP si MOSTRA il messaggio vero restituito
## da Groq (il corpo spiega sempre il motivo: key, modello, quota); se il 404 viene da un modello
## ritirato, si ritenta UNA volta col modello di riserva.
func _send_groq_prompt(user_text: String, modello_forzato: String = "") -> void:
	if not has_groq_key():
		_fail("Inserisci la tua Groq API key (gratuita su console.groq.com) per usare il Master Groq.")
		return
	var modello: String = modello_forzato if not modello_forzato.is_empty() else GROQ_MODEL

	var req := HTTPRequest.new()
	add_child(req)
	var body: String = JSON.stringify({
		"model": modello, "stream": false, "temperature": 0.85, "max_tokens": 700,
		"messages": _build_messages(user_text),
	})
	var headers := PackedStringArray([
		"Content-Type: application/json", "Authorization: Bearer " + _groq_api_key,
	])
	var err: int = req.request(GROQ_URL, headers, HTTPClient.METHOD_POST, body)
	if err != OK:
		req.queue_free()
		_fail("Invio della richiesta a Groq fallito (errore %d)." % err)
		return

	var esito: Array = await req.request_completed
	req.queue_free()
	var risultato: int = esito[0]
	if risultato != HTTPRequest.RESULT_SUCCESS:
		_fail("Groq non raggiungibile (errore di rete %d): controlla la connessione internet." % risultato)
		return
	_gestisci_risposta_groq(user_text, modello_forzato, int(esito[1]), (esito[3] as PackedByteArray))


## Seconda meta' della chiamata Groq: interpreta codice HTTP + corpo. Separata per leggibilita'
## (le guardie d'errore sono tante: key, modello ritirato, quota, corpo vuoto).
func _gestisci_risposta_groq(user_text: String, modello_forzato: String, codice: int, grezzo: PackedByteArray) -> void:
	var testo: String = grezzo.get_string_from_utf8()
	if codice == 404 and modello_forzato.is_empty():
		# 404 da Groq = quasi sempre modello ritirato/rinominato: riprova col modello di riserva.
		if not _json_mode:
			master_chunk.emit("(modello non disponibile, passo a %s…) " % GROQ_MODEL_FALLBACK)
		_send_groq_prompt(user_text, GROQ_MODEL_FALLBACK)
		return
	if codice == 401:
		_fail("API key Groq non valida (401). Reinseriscila nel pannello Master.")
		return
	if codice < 200 or codice >= 300:
		_fail("Groq HTTP %d: %s" % [codice, _errore_api_leggibile(testo)])
		return
	var content: String = _extract_groq_content(JSON.parse_string(testo))
	if content.is_empty():
		_fail("Groq ha risposto senza contenuto: " + _errore_api_leggibile(testo))
		return
	if not _json_mode:
		var split: Dictionary = _separate_narration_and_data(content)
		master_chunk.emit(String(split["narration"]))
	_finish(user_text, content)


## Estrae il messaggio leggibile dal corpo JSON di un errore API ({"error":{"message":...}}).
func _errore_api_leggibile(testo: String) -> String:
	var parsed: Variant = JSON.parse_string(testo)
	if parsed is Dictionary and (parsed as Dictionary).has("error"):
		var e: Variant = (parsed as Dictionary)["error"]
		if e is Dictionary and (e as Dictionary).has("message"):
			return String((e as Dictionary)["message"])
		return str(e)
	return testo.substr(0, 200)


func _extract_groq_content(parsed: Variant) -> String:
	if not (parsed is Dictionary):
		return ""
	var choices: Array = (parsed as Dictionary).get("choices", [])
	if choices.is_empty() or not (choices[0] is Dictionary):
		return ""
	var msg: Variant = (choices[0] as Dictionary).get("message", {})
	if not (msg is Dictionary):
		return ""
	return String((msg as Dictionary).get("content", ""))


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
	if _json_mode:
		_json_mode = false
		# Nello storico va la risposta GREZZA: rivedere il proprio JSON aiuta il modello a
		# restare nello schema ai turni successivi.
		_history_json.append({ "role": "user", "content": user_text })
		_history_json.append({ "role": "assistant", "content": full_reply.strip_edges() })
		while _history_json.size() > 20:
			_history_json.pop_front()
		json_complete.emit(_parse_risposta_json(full_reply))
		return
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
	_json_mode = false
	master_error.emit(message)


## Estrae e valida l'oggetto JSON della Modalita' Storia. Tollerante coi vizi tipici dei modelli
## (blocco ```json, testo attorno): si isola dalla prima "{" all'ultima "}". Se il parsing fallisce
## del tutto, la risposta INTERA diventa narrazione: mai perdere il testo del Master.
func _parse_risposta_json(content: String) -> Dictionary:
	var pulito: String = content.strip_edges()
	var inizio: int = pulito.find("{")
	var fine: int = pulito.rfind("}")
	if inizio >= 0 and fine > inizio:
		pulito = pulito.substr(inizio, fine - inizio + 1)
	var parsed: Variant = JSON.parse_string(pulito)
	if not (parsed is Dictionary):
		return {
			"narrazione": content.strip_edges(), "opzioni": [],
			"richiede_dado": false, "dado": "", "scopo_dado": "",
		}
	var d: Dictionary = parsed
	var opzioni: Array = []
	var grezze: Variant = d.get("opzioni", [])
	if grezze is Array:
		for o: Variant in (grezze as Array):
			var testo: String = String(o).strip_edges()
			if not testo.is_empty() and opzioni.size() < 4:
				opzioni.append(testo)
	return {
		"narrazione": String(d.get("narrazione", "")).strip_edges(),
		"opzioni": opzioni,
		"richiede_dado": bool(d.get("richiede_dado", false)),
		"dado": String(d.get("dado", "")).strip_edges().to_lower(),
		"scopo_dado": String(d.get("scopo_dado", "")).strip_edges().to_lower(),
	}


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
			CombatManager.resolve_attack(String(command.get("attacker", CombatManager.pc_attivo_id())), String(command.get("target", "")), String(command.get("mode", "normal")))
		"damage":
			CombatManager.apply_damage_to_combatant(String(command.get("targetId", CombatManager.pc_attivo_id())), int(command.get("amount", 0)))
		"heal":
			CombatManager.heal_combatant(String(command.get("targetId", CombatManager.pc_attivo_id())), int(command.get("amount", 0)))
		"setHp":
			CharacterManager.set_current_hp(int(command.get("value", 0)))
		"setAc":
			CharacterManager.set_armor_class(int(command.get("value", 10)))
		"setAbility":
			CharacterManager.set_ability_score(String(command.get("ability", "str")), int(command.get("value", 10)))
		"moveTo", "travelTo", "moveParty":
			# Spostamento del party sull'overworld: stessa risoluzione POI della prosa (fonte unica).
			ChatTravelBridge.viaggia_a_nome(String(command.get("to", command.get("name", ""))))
		_:
			# moveToken, addToken, revealFog, createSurface, setElevation, applyCondition, ...
			# li gestira' il layer mappa/condizioni quando lo costruiremo.
			command_received.emit(command)


func is_busy() -> bool:
	return _busy


## Azzera lo storico della conversazione (nuova scena/sessione).
func clear_history() -> void:
	_history.clear()
	_history_json.clear()
