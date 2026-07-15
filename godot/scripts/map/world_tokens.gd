class_name WorldTokens
extends Node2D
## Token del PARTY sul Mondo cucito: un gettone colorato per ogni PG del roster, trascinabile
## col tasto sinistro, con snap alla griglia (quando e' accesa) e POSIZIONI PERSISTENTI in
## user:// — sopravvivono a ricariche, riavvii e aggiornamenti del gioco.
##
## Design:
## - dimensione IBRIDA: raggio fisso in pixel-mondo (52, sta bene in una cella da 128) ma mai
##   sotto ~14 px su schermo — alla vista "mondo intero" i token restano visibili;
## - il roster arriva da CharacterManager (party_changed: i token seguono il gruppo);
## - chi trascina un token fa avanzare anche la nebbia (signal token_spostato -> WorldFog);
## - blocco_input: quando il righello e' attivo i token ignorano il mouse (zero ambiguita').

signal token_spostato(id: String, posizione: Vector2)

const SALVATAGGIO: String = "user://world_tokens.json"
const RAGGIO_MONDO: float = 52.0
const RAGGIO_SCHERMO_MIN: float = 14.0
const ZOOM_NOME: float = 0.30    # sotto questo zoom i nomi spariscono (sarebbero coriandoli)
const DURATA_SCATTO: float = 0.28
const PC_PREFISSO: String = "pc-"
# Scala di combattimento del Mondo cucito: 1 cella = 128 px = 1,5 m (stessa del righello e dei
# nemici evocati). E' FISSA e indipendente dalla griglia visiva (che puo' essere 64/128/256).
const PX_PER_CELLA: float = 128.0
const PALETTE: Array[Color] = [
	Color(0.85, 0.68, 0.25), Color(0.30, 0.65, 0.62), Color(0.75, 0.30, 0.28),
	Color(0.55, 0.42, 0.75), Color(0.80, 0.50, 0.22), Color(0.42, 0.62, 0.32),
]

## true mentre il righello e' attivo: i click sono suoi, i token non si trascinano.
var blocco_input: bool = false
## Lato cella della griglia per lo snap (0 = griglia spenta, nessuno snap).
var cella: float = 0.0

var _rect: Rect2
var _camera: Camera2D
var _gettoni: Array[Dictionary] = []   # { "id", "nome", "colore": Color, "pos": Vector2 }
var _trascinato: int = -1
var _trascina_da: Vector2 = Vector2.ZERO   # partenza del drag (anteprima movimento in battaglia)
var _ultimo_zoom: float = 0.0
var _tween_viaggio: Tween
var _scatti: Dictionary = {}   # id personaggio -> { "t": float, "dir": Vector2 } (affondo)


func configura(rect_mondo: Rect2, camera: Camera2D) -> void:
	_rect = rect_mondo
	_camera = camera
	_ricostruisci_roster()
	CharacterManager.party_changed.connect(func(_p: Array[CharacterData]) -> void:
		_ricostruisci_roster())
	# Il Mondo cucito e' L'UNICA mappa: le posizioni di combattimento (gittata, fiancheggiamento,
	# IA, Palla di Fuoco) vengono da QUI. All'inizio di ogni scontro si pubblicano le celle di
	# tutto il party; poi ogni trascinamento/viaggio le tiene aggiornate.
	CombatManager.combat_started.connect(_pubblica_tutte_le_celle)
	set_process(true)


## Cella di combattimento di una posizione del mondo (scala fissa: 128 px = 1,5 m).
func _cella_di(pos: Vector2) -> Vector2i:
	var locale: Vector2 = pos - _rect.position
	return Vector2i(
		maxi(0, floori(locale.x / PX_PER_CELLA)), maxi(0, floori(locale.y / PX_PER_CELLA)))


func _pubblica_cella(id_personaggio: String, pos: Vector2) -> void:
	CombatManager.set_combatant_cell(PC_PREFISSO + id_personaggio, _cella_di(pos))


func _pubblica_tutte_le_celle() -> void:
	for g: Dictionary in _gettoni:
		_pubblica_cella(String(g["id"]), g["pos"] as Vector2)


## Posizioni correnti (per la rivelazione iniziale della nebbia).
func posizioni() -> Array[Vector2]:
	var out: Array[Vector2] = []
	for g: Dictionary in _gettoni:
		out.append(g["pos"])
	return out


## Centro del gruppo (media delle posizioni): l'ancora da cui i nemici evocati calcolano la
## loro distanza reale (WorldEnemyTokens). Col party vuoto, il centro della mappa.
func centro_gruppo() -> Vector2:
	if _gettoni.is_empty():
		return _rect.get_center()
	var somma: Vector2 = Vector2.ZERO
	for g: Dictionary in _gettoni:
		somma += g["pos"] as Vector2
	return somma / float(_gettoni.size())


## Posizione MONDO del token di un membro del party (id combattente "pc-<id>"), null se assente.
func posizione_di(combatant_id: String) -> Variant:
	var cid: String = combatant_id.trim_prefix(PC_PREFISSO)
	for g: Dictionary in _gettoni:
		if String(g["id"]) == cid:
			return g["pos"] as Vector2
	return null


## Affondo d'attacco: il token del PG scatta verso `direzione` e torna (lo anima WorldCombatFX).
func applica_scatto(combatant_id: String, direzione: Vector2) -> void:
	var cid: String = combatant_id.trim_prefix(PC_PREFISSO)
	for g: Dictionary in _gettoni:
		if String(g["id"]) == cid:
			_scatti[cid] = { "t": 0.0, "dir": direzione }
			queue_redraw()
			return


## Spostamento corrente dell'affondo per un token (fuori e ritorno), Vector2.ZERO se non scatta.
func _offset_scatto(id: String, r: float) -> Vector2:
	if not _scatti.has(id):
		return Vector2.ZERO
	var p: float = clampf(float(_scatti[id]["t"]) / DURATA_SCATTO, 0.0, 1.0)
	return (_scatti[id]["dir"] as Vector2) * sin(p * PI) * r * 0.9


## VIAGGIO NARRATO: tutto il party PLANA verso il punto (2.2s, disposto in cerchio all'arrivo).
## Un nuovo viaggio interrompe il precedente. All'arrivo: salvataggio + token_spostato per
## ogni PG (cosi' la nebbia si dirada a destinazione).
func muovi_tutti_verso(punto: Vector2) -> void:
	if _gettoni.is_empty():
		return
	if _tween_viaggio != null and _tween_viaggio.is_valid():
		_tween_viaggio.kill()
	_tween_viaggio = create_tween().set_parallel(true)
	for i: int in range(_gettoni.size()):
		var angolo: float = TAU * float(i) / float(_gettoni.size())
		var arrivo: Vector2 = _dentro_mappa(punto + Vector2.from_angle(angolo) * 90.0)
		_tween_viaggio.tween_method(_muovi_gettone.bind(i), _gettoni[i]["pos"] as Vector2,
			arrivo, 2.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_tween_viaggio.chain().tween_callback(_fine_viaggio)


func _muovi_gettone(pos: Vector2, indice: int) -> void:
	if indice < _gettoni.size():
		_gettoni[indice]["pos"] = pos
		queue_redraw()


func _fine_viaggio() -> void:
	for g: Dictionary in _gettoni:
		token_spostato.emit(String(g["id"]), g["pos"] as Vector2)
		_pubblica_cella(String(g["id"]), g["pos"] as Vector2)
	_salva()


## REGIA DEL MASTER: muove UN SOLO membro del party verso un punto (gli altri restano dove
## sono). Plana in ~1.1s; all'arrivo nebbia, cella di combattimento e salvataggio come per un
## trascinamento a mano. Usato da TokenDirector (comando moveToken / spostamenti narrati).
func muovi_verso(id_personaggio: String, punto: Vector2) -> void:
	for i: int in range(_gettoni.size()):
		if String(_gettoni[i]["id"]) != id_personaggio:
			continue
		var arrivo: Vector2 = _dentro_mappa(punto)
		var tw: Tween = create_tween()
		tw.tween_method(_muovi_gettone.bind(i), _gettoni[i]["pos"] as Vector2, arrivo, 1.1) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tw.tween_callback(_fine_mossa_singola.bind(id_personaggio))
		return


func _fine_mossa_singola(id_personaggio: String) -> void:
	for g: Dictionary in _gettoni:
		if String(g["id"]) == id_personaggio:
			token_spostato.emit(id_personaggio, g["pos"] as Vector2)
			_pubblica_cella(id_personaggio, g["pos"] as Vector2)
			_salva()
			return


func _process(delta: float) -> void:
	# I token scalano con lo zoom (clamp su schermo): al cambio zoom serve un redraw.
	if _camera != null and not is_equal_approx(_camera.zoom.x, _ultimo_zoom):
		_ultimo_zoom = _camera.zoom.x
		queue_redraw()
	if not _scatti.is_empty():
		for id: String in _scatti.keys():
			_scatti[id]["t"] = float(_scatti[id]["t"]) + delta
		for id: String in _scatti.keys().filter(func(k: String) -> bool:
				return float(_scatti[k]["t"]) >= DURATA_SCATTO):
			_scatti.erase(id)
		queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if blocco_input or _gettoni.is_empty():
		return
	var mb := event as InputEventMouseButton
	if mb != null and mb.button_index == MOUSE_BUTTON_LEFT:
		if mb.pressed:
			_trascinato = _colpito(get_global_mouse_position())
			if _trascinato >= 0:
				_trascina_da = _gettoni[_trascinato]["pos"] as Vector2
				get_viewport().set_input_as_handled()
		elif _trascinato >= 0:
			_rilascia(get_global_mouse_position())
			get_viewport().set_input_as_handled()
		return
	var mm := event as InputEventMouseMotion
	if mm != null and _trascinato >= 0:
		_gettoni[_trascinato]["pos"] = _dentro_mappa(get_global_mouse_position())
		queue_redraw()
		get_viewport().set_input_as_handled()


func _draw() -> void:
	if _camera == null:
		return
	var font: Font = ThemeDB.fallback_font
	var r: float = _raggio()
	for i: int in range(_gettoni.size()):
		var g: Dictionary = _gettoni[i]
		var pos: Vector2 = (g["pos"] as Vector2) + _offset_scatto(String(g["id"]), r)
		var colore: Color = g["colore"]
		# ARTE del token se esiste (ritratto col nome del PG, o arte della sua classe);
		# altrimenti il gettone disegnato con l'iniziale.
		var tex: Texture2D = TokenArt.per_nome(String(g["nome"]))
		if tex == null:
			tex = TokenArt.per_nome(String(g["classe"]))
		if tex != null:
			var lato: float = r * 2.4
			draw_texture_rect(tex, Rect2(pos - Vector2(lato, lato) * 0.5,
				Vector2(lato, lato)), false)
		else:
			draw_circle(pos, r * 1.14, Color(0.08, 0.06, 0.05, 0.9))   # bordo scuro
			draw_circle(pos, r, colore)
			draw_circle(pos, r * 0.78, colore.lightened(0.18))         # cuore piu' chiaro
			var iniziale: String = String(g["nome"]).left(1).to_upper()
			var dim: int = int(r * 1.1)
			draw_string(font, pos + Vector2(-r, r * 0.42), iniziale,
				HORIZONTAL_ALIGNMENT_CENTER, r * 2.0, dim, Color(0.1, 0.08, 0.05))
		if _camera.zoom.x >= ZOOM_NOME:
			var dim_nome: int = int(maxf(18.0, r * 0.5))
			var y_nome: float = r * 1.5 + dim_nome
			draw_string(font, pos + Vector2(-r * 4 + 2, y_nome + 2), String(g["nome"]),
				HORIZONTAL_ALIGNMENT_CENTER, r * 8.0, dim_nome, Color(0, 0, 0, 0.75))
			draw_string(font, pos + Vector2(-r * 4, y_nome), String(g["nome"]),
				HORIZONTAL_ALIGNMENT_CENTER, r * 8.0, dim_nome, Color(0.95, 0.92, 0.85))
	if _trascinato >= 0 and CombatManager.is_active():
		_disegna_anteprima_movimento(font)


## ANTEPRIMA DEL MOVIMENTO (in battaglia): mentre trascini un token vedi il percorso e i METRI
## (1 cella = 1,5 m). Se il token e' del PG ATTIVO il colore avvisa quando superi il passo che
## gli resta (velocita' 9 m del turno meno i metri gia' spesi); per gli altri resta neutro.
func _disegna_anteprima_movimento(font: Font) -> void:
	var pos: Vector2 = _gettoni[_trascinato]["pos"]
	var metri: float = _trascina_da.distance_to(pos) / PX_PER_CELLA * 1.5
	if metri < 0.2:
		return
	var colore: Color = Color(0.9, 0.78, 0.4, 0.95)
	var avviso: String = ""
	var attivo: CharacterData = CharacterManager.get_active()
	if attivo != null and String(_gettoni[_trascinato]["id"]) == attivo.id:
		var usati: float = float(
			InventoryManager.get_action_economy().get("movementMetersUsed", 0.0))
		if metri > 9.0 - usati + 0.01:
			colore = Color(0.88, 0.3, 0.25, 0.95)
			avviso = " — oltre il passo!"
	_tratteggio(_trascina_da, pos, colore, 4.0)
	var dim: int = int(maxf(20.0, 15.0 / maxf(_camera.zoom.x, 0.01)))
	var testo: String = "%.1f m%s" % [metri, avviso]
	var meta: Vector2 = (_trascina_da + pos) * 0.5
	draw_string(font, meta + Vector2(-150 + 2, -12 + 2), testo,
		HORIZONTAL_ALIGNMENT_CENTER, 300.0, dim, Color(0, 0, 0, 0.8))
	draw_string(font, meta + Vector2(-150, -12), testo,
		HORIZONTAL_ALIGNMENT_CENTER, 300.0, dim, colore)


func _tratteggio(da: Vector2, a: Vector2, colore: Color, spessore: float) -> void:
	var lunghezza: float = da.distance_to(a)
	if lunghezza <= 1.0:
		return
	var dir: Vector2 = (a - da) / lunghezza
	var passo: float = 26.0
	var t: float = 0.0
	while t < lunghezza:
		var t2: float = minf(t + passo * 0.55, lunghezza)
		draw_line(da + dir * t, da + dir * t2, colore, spessore, true)
		t += passo


## Raggio effettivo: fisso nel mondo ma mai invisibile su schermo.
func _raggio() -> float:
	return maxf(RAGGIO_MONDO, RAGGIO_SCHERMO_MIN / maxf(_camera.zoom.x, 0.01))


## Indice del token sotto il punto (dall'ultimo disegnato, che sta sopra), -1 se nessuno.
func _colpito(punto: Vector2) -> int:
	var r: float = _raggio()
	for i: int in range(_gettoni.size() - 1, -1, -1):
		if (_gettoni[i]["pos"] as Vector2).distance_to(punto) <= r * 1.14:
			return i
	return -1


func _rilascia(punto: Vector2) -> void:
	var pos: Vector2 = _dentro_mappa(punto)
	if cella > 0.0:
		# Snap al CENTRO della cella che contiene il punto di rilascio.
		var locale: Vector2 = pos - _rect.position
		pos = _rect.position + Vector2(
			(floorf(locale.x / cella) + 0.5) * cella,
			(floorf(locale.y / cella) + 0.5) * cella
		)
	_gettoni[_trascinato]["pos"] = pos
	token_spostato.emit(String(_gettoni[_trascinato]["id"]), pos)
	_pubblica_cella(String(_gettoni[_trascinato]["id"]), pos)
	_trascinato = -1
	_salva()
	queue_redraw()


func _dentro_mappa(p: Vector2) -> Vector2:
	if _rect.size == Vector2.ZERO:
		return p
	return p.clamp(_rect.position, _rect.end)


# --- Roster e persistenza ---

## (Ri)costruisce i gettoni dal party: le posizioni salvate si ritrovano per id, i PG nuovi
## si dispongono in cerchio attorno al centro del mondo.
func _ricostruisci_roster() -> void:
	var salvate: Dictionary = _carica()
	_gettoni.clear()
	var party: Array[CharacterData] = CharacterManager.get_party()
	for i: int in range(party.size()):
		var pg: CharacterData = party[i]
		var pos: Vector2
		if salvate.has(pg.id):
			var xy: Array = salvate[pg.id]
			pos = _dentro_mappa(Vector2(float(xy[0]), float(xy[1])))
		else:
			var angolo: float = TAU * float(i) / maxf(1.0, float(party.size()))
			pos = _rect.get_center() + Vector2.from_angle(angolo) * 150.0
		_gettoni.append({
			"id": pg.id, "nome": pg.character_name, "classe": pg.class_name_label,
			"colore": PALETTE[i % PALETTE.size()], "pos": pos,
		})
	queue_redraw()


func _salva() -> void:
	var dati: Dictionary = {}
	for g: Dictionary in _gettoni:
		var pos: Vector2 = g["pos"]
		dati[String(g["id"])] = [pos.x, pos.y]
	var file: FileAccess = FileAccess.open(SALVATAGGIO, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(dati))


func _carica() -> Dictionary:
	if not FileAccess.file_exists(SALVATAGGIO):
		return {}
	var testo: String = FileAccess.get_file_as_string(SALVATAGGIO)
	var dati: Variant = JSON.parse_string(testo)
	return dati if dati is Dictionary else {}
