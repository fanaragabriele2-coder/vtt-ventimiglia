class_name NexusView
extends Control
## NexusView — incapsula il Nexus Map Engine (Node2D con luci/ombre) dentro il layout a Control del
## gioco (SubViewportContainer -> SubViewport -> NexusMapManager) e ci aggancia la Local UX del
## tavolo condiviso:
## - UN TOKEN PER OGNI MEMBRO del party (colori diversi), ognuno con la propria luce di vista;
## - la nebbia e' la VISIONE DI GRUPPO: unione dei campi visivi di tutti i token del party;
## - input centralizzato (LocalInputManager): click su un token = selezione (se la politica lo
##   concede — in modalita' Master si muove TUTTO, anche i nemici), click su una cella = movimento
##   lungo un percorso A* reale;
## - hotseat (LocalGameManager): "passa il mouse" ruota il PG attivo per tutto il tavolo.

const PREFISSO_PC: String = "nexus-pc-"
const COL_NPC: Color = Color(0.95, 0.45, 0.4)
const COLORI_PARTY: Array[Color] = [
	Color(0.55, 0.78, 1.0), Color(0.55, 1.0, 0.7), Color(1.0, 0.85, 0.5), Color(0.9, 0.6, 1.0),
]
const DIREZIONI_8: Array[Vector2i] = [
	Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1),
	Vector2i(1, 1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(-1, -1),
]

const TEMI: Array = [
	["cripta", "🪦 Cripta oscura"],
	["roccaforte", "⛰ Roccaforte nanica"],
	["tempio_lava", "🌋 Tempio di lava"],
	["caverna", "🕳 Caverna naturale"],
]

var _map: NexusMapManager
var _tema_option: OptionButton
var _master_btn: Button
var _party_cells: Dictionary = {}   # token_id ("nexus-pc-<id PG>") -> Vector2i


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	_build_viewport()
	_build_toolbar()
	# I nemici li piazza il sistema di combattimento esistente: qualunque add_npc (dai pulsanti Evoca,
	# dall'Encounter Balancer o dai comandi del Master IA) fa comparire il token qui, senza doppioni e
	# senza che AIBridge conosca il Nexus. Alla morte, il token sparisce.
	CombatManager.combatant_added.connect(_on_combatant_added)
	CombatManager.combatant_defeated.connect(_on_combatant_defeated)
	# Hook esplicito per il Master IA: "spawna sulla cella X" (il token nasce comunque da combatant_added).
	EventBus.nexus_spawn_requested.connect(_on_spawn_requested)
	# Politica d'input del tavolo (selezione centralizzata) + modalita' Master.
	LocalInputManager.selezione_annullata.connect(_on_selezione_annullata)
	LocalGameManager.modalita_master_cambiata.connect(_on_modalita_master_cambiata)
	# Ripristino da salvataggio (SaveManager pubblica l'evento; qui non si conosce chi salva).
	GameState.event_published.connect(_on_game_event)
	# Primo dungeon all'apparizione della vista.
	rigenera()


func _on_game_event(event_name: String, payload: Variant) -> void:
	if event_name == "nexus:restore" and payload is Dictionary:
		_ripristina(payload)


## Un salvataggio e' stato caricato: rigenera il complesso dal seme e riapplica fog/livello/party.
func _ripristina(stato: Dictionary) -> void:
	var celle: Array[Vector2i] = _map.ripristina_da_salvataggio(stato)
	var attorno: Vector2i = celle[0] if not celle.is_empty() else _map.cella_spawn()
	_spawn_party_tokens(attorno, celle)
	_map.aggiorna_visione_multipla(_celle_party())
	var tema_salvato: String = String(stato.get("tema", "cripta"))
	for i: int in range(TEMI.size()):
		if String(TEMI[i][0]) == tema_salvato:
			_tema_option.select(i)
			break


func _build_viewport() -> void:
	var container := SubViewportContainer.new()
	container.stretch = true              # il SubViewport eredita la dimensione del container
	container.set_anchors_preset(Control.PRESET_FULL_RECT)
	container.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(container)

	var viewport := SubViewport.new()
	viewport.handle_input_locally = true
	viewport.gui_disable_input = false
	viewport.transparent_bg = false
	container.add_child(viewport)

	_map = NexusMapManager.new()
	_map.cella_cliccata.connect(_on_cella_cliccata)
	viewport.add_child(_map)


func _build_toolbar() -> void:
	var panel := PanelContainer.new()
	panel.position = Vector2(8, 8)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.045, 0.9)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 8
	sb.content_margin_right = 8
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	panel.add_theme_stylebox_override("panel", sb)
	add_child(panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)

	var lbl := Label.new()
	lbl.text = "🏰 Nexus Dungeon:"
	lbl.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	row.add_child(lbl)

	_tema_option = OptionButton.new()
	for coppia: Array in TEMI:
		_tema_option.add_item(String(coppia[1]))
	row.add_child(_tema_option)

	var rigen_btn := Button.new()
	rigen_btn.text = "🎲 Rigenera"
	rigen_btn.pressed.connect(rigenera)
	row.add_child(rigen_btn)

	_master_btn = Button.new()
	_master_btn.text = "🎩 Master: TUTTO"
	_master_btn.pressed.connect(_toggle_master)
	row.add_child(_master_btn)

	var posto_btn := Button.new()
	posto_btn.text = "🎮 Passa il mouse"
	posto_btn.pressed.connect(LocalGameManager.passa_posto)
	row.add_child(posto_btn)

	var hint := Label.new()
	hint.text = "  (click su token = seleziona · click su cella = muovi · rotellina = zoom · dx = pan)"
	hint.add_theme_font_size_override("font_size", 11)
	hint.add_theme_color_override("font_color", Color(0.6, 0.55, 0.45))
	row.add_child(hint)


func _toggle_master() -> void:
	LocalGameManager.set_modalita_master(not LocalGameManager.is_modalita_master())


func _on_modalita_master_cambiata(attiva: bool) -> void:
	_master_btn.text = "🎩 Master: TUTTO" if attiva else "🎩 Master: SOLO PARTY"
	# Se la modalita' si restringe e c'era un nemico selezionato, la selezione decade.
	var sel: String = LocalInputManager.selezionato()
	if not sel.is_empty() and not LocalInputManager.puo_muovere(sel):
		LocalInputManager.deseleziona()


func _on_selezione_annullata() -> void:
	_map.evidenzia_token("")


## Genera un nuovo dungeon del tema selezionato e piazza UN token per ogni membro del party.
func rigenera() -> void:
	var tema: String = String(TEMI[_tema_option.selected][0]) if _tema_option else "cripta"
	_map.genera_dungeon(tema)
	_spawn_party_tokens(_map.cella_spawn())
	_map.aggiorna_visione_multipla(_celle_party())


## Piazza i token del party: uno per membro (colore proprio), raggruppati attorno alla cella data
## (o sulle celle predefinite, es. da un salvataggio). Ogni token porta la sua luce di vista.
func _spawn_party_tokens(attorno: Vector2i, celle_predefinite: Array[Vector2i] = []) -> void:
	_party_cells.clear()
	LocalInputManager.deseleziona()
	var membri: Array[CharacterData] = CharacterManager.get_party()
	var ids: Array[String] = []
	if membri.is_empty():
		ids.append(PREFISSO_PC + "local")
	else:
		for c: CharacterData in membri:
			ids.append(PREFISSO_PC + c.id)
	for i: int in range(ids.size()):
		var cell: Vector2i
		if i < celle_predefinite.size() and _map.cella_percorribile(celle_predefinite[i]):
			cell = celle_predefinite[i]
		elif i == 0 and _map.cella_percorribile(attorno) and _map.token_in_cella(attorno).is_empty():
			cell = attorno
		else:
			cell = _cella_libera_vicino(attorno)
		_map.spawn_token(ids[i], cell, true, COLORI_PARTY[i % COLORI_PARTY.size()])
		_party_cells[ids[i]] = cell


func _celle_party() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for id: String in _party_cells.keys():
		out.append(_party_cells[id])
	return out


func _prima_cella_party() -> Vector2i:
	for id: String in _party_cells.keys():
		return _party_cells[id]
	return _map.cella_spawn()


## Input centralizzato del tavolo: click su token = selezione (politica LocalInputManager),
## click su cella = ordine di movimento per il token selezionato, lungo un percorso A* reale.
func _on_cella_cliccata(cell: Vector2i) -> void:
	var token_qui: String = _map.token_in_cella(cell)
	if not token_qui.is_empty():
		if LocalInputManager.seleziona(token_qui):
			_map.evidenzia_token(token_qui)
		return

	var sel: String = LocalInputManager.selezionato()
	if sel.is_empty():
		return
	var da: Vector2i = _map.cella_di_token(sel)
	if da.x < 0:
		LocalInputManager.deseleziona()
		return
	var percorso: Array[Vector2i] = _map.trova_percorso(da, cell)
	if percorso.is_empty():
		return  # irraggiungibile: i muri della cripta non si attraversano
	# Dado di movimento (Modalita' Storia): se un budget e' attivo, ogni passo del capofila costa
	# celle vere — il controllo avviene PRIMA di muovere (il rifiuto viene annunciato in chat).
	if sel.begins_with(PREFISSO_PC) and not VttCoreManager.consuma_movimento(percorso.size()):
		return
	var tw: Tween = _map.muovi_token_lungo_percorso(sel, percorso)

	if sel.begins_with(PREFISSO_PC):
		_party_cells[sel] = cell
		# State machine (VttCoreManager): in EXPLORATION il party viaggia IN BLOCCO — chi guida
		# muove, gli altri lo raggiungono da soli. In COMBAT ognuno si muove nel proprio turno.
		if VttCoreManager.is_movimento_in_blocco():
			_muovi_party_in_blocco(sel, cell)
		_map.aggiorna_visione_multipla(_celle_party())  # visione di GRUPPO: unione dei campi visivi
		EventBus.nexus_party_moved.emit(cell)
		# Se la destinazione e' una scala, all'ARRIVO del token tutto il party cambia piano.
		var direzione: int = _map.direzione_scala(cell)
		if direzione != 0:
			if tw != null:
				await tw.finished
			_usa_scala(direzione)
	else:
		# Token nemico mosso dal Master: la posizione autorevole va anche al sistema di combattimento.
		CombatManager.set_combatant_cell(sel, cell)


## Movimento in blocco (EXPLORATION): ogni altro membro del party raggiunge una cella libera
## attorno alla destinazione del capofila, lungo il SUO percorso A* (niente teletrasporti: se un
## membro e' murato fuori, semplicemente resta dov'e' — se ne riparla dalla scala o a piedi).
func _muovi_party_in_blocco(capofila: String, destinazione: Vector2i) -> void:
	for id: String in _party_cells.keys():
		if id == capofila:
			continue
		var da: Vector2i = _map.cella_di_token(id)
		if da.x < 0:
			continue
		var arrivo: Vector2i = _cella_libera_vicino(destinazione)
		if arrivo == da:
			continue
		var percorso: Array[Vector2i] = _map.trova_percorso(da, arrivo)
		if percorso.is_empty():
			continue
		_map.muovi_token_lungo_percorso(id, percorso)
		_party_cells[id] = arrivo


func _usa_scala(direzione: int) -> void:
	var arrivo: Vector2i = _map.cambia_livello_via_scala(direzione)
	if arrivo.x < 0:
		return  # il piano non esiste
	_spawn_party_tokens(arrivo)  # tutto il party scende/sale insieme, raggruppato sulla scala
	_map.aggiorna_visione_multipla(_celle_party())
	var verbo: String = "scende" if direzione > 0 else "risale"
	GameState.announce("🪜 Il party %s: livello %d del complesso." % [verbo, _map.livello_corrente() + 1])


## Ogni combattente PNG registrato nel CombatManager ottiene un token sul dungeon, su una cella
## percorribile e LIBERA vicino al party.
func _on_combatant_added(combatant: Dictionary) -> void:
	if String(combatant.get("kind", "")) != "npc":
		return
	var cid: String = String(combatant["id"])
	var dove: Vector2i = _cella_libera_vicino(_prima_cella_party())
	_map.spawn_token(cid, dove, false, COL_NPC)
	CombatManager.set_combatant_cell(cid, dove)


func _on_combatant_defeated(combatant_id: String, _source_id: String) -> void:
	if LocalInputManager.selezionato() == combatant_id:
		LocalInputManager.deseleziona()
	_map.rimuovi_token(combatant_id)


## Hook per il Master IA: chiede lo spawn su una cella precisa. Il token nasce da _on_combatant_added
## (add_npc lo emette): qui si aggiunge solo, dopo, il riposizionamento sulla cella richiesta.
func _on_spawn_requested(monster_id: String, cell: Vector2i) -> void:
	var combattente: Dictionary = CombatManager.add_npc(monster_id)
	if combattente.is_empty() or not _map.in_mappa(cell) or not _map.cella_percorribile(cell):
		return
	_map.muovi_token(String(combattente["id"]), cell)
	CombatManager.set_combatant_cell(String(combattente["id"]), cell)


## Prima cella percorribile E libera (nessun token sopra) attorno al centro, a raggi crescenti.
func _cella_libera_vicino(centro: Vector2i) -> Vector2i:
	for raggio: int in range(1, 10):
		for d: Vector2i in DIREZIONI_8:
			var c: Vector2i = centro + d * raggio
			if _map.cella_percorribile(c) and _map.token_in_cella(c).is_empty():
				return c
	return centro
