class_name TacticalMap
extends Control
## Mappa tattica (colonna centrale) — porting del canvas della griglia (Modulo 07), dei token
## (Modulo 08), della nebbia di guerra e del movimento col click (arena BG3, Modulo 40).
##
## Disegno custom via _draw() (CanvasItem): sul client leggero della Split-Rig e' il modo piu' fluido
## di rendere griglia + nebbia + token senza scene pesanti. I token leggono lo stato da CombatManager
## e reagiscono ai suoi signal: i nemici compaiono quando il Master li evoca e SPARISCONO quando
## vengono uccisi (stesso comportamento del fix "i nemici uccisi devono sparire dalla mappa").
##
## Interazione: click su un token = lo seleziona; click su una cella vuota = ci sposta il token
## selezionato (click-to-move). Muovere un PG rivela la nebbia attorno a lui.

signal token_moved(token_id: String, cell: Vector2i)   # per il futuro sync di rete

const GRID_COLS: int = 26
const GRID_ROWS: int = 18
const FOG_REVEAL_RADIUS: int = 4       # celle rivelate attorno a ogni PG (Chebyshev)
const PARTY_ANCHOR: Vector2i = Vector2i(6, 9)
const ENEMY_ANCHOR: Vector2i = Vector2i(19, 9)
const METERS_PER_CELL: float = 1.5     # scala del gioco (coerente con PORTATA_MOVIMENTO in EnemyAI)

# Colori (palette scura del monolite).
const COL_GRID: Color = Color(0.78, 0.61, 0.24, 0.12)
const COL_CELL_A: Color = Color(0.075, 0.07, 0.06)
const COL_CELL_B: Color = Color(0.09, 0.082, 0.07)
const COL_FOG: Color = Color(0.02, 0.018, 0.015, 0.92)
const COL_PC: Color = Color(0.36, 0.55, 0.7)
const COL_PC_RING: Color = Color(0.75, 0.89, 0.94)
const COL_NPC: Color = Color(0.56, 0.11, 0.09)
const COL_NPC_RING: Color = Color(0.94, 0.54, 0.5)
const COL_TURN_RING: Color = Color(0.94, 0.83, 0.53)
const COL_SELECT: Color = Color(0.36, 0.72, 0.78)

# --- Game feel: flash sul colpo, scossa del token, numeri di danno fluttuanti ---
const FLASH_DURATA: float = 0.32       # secondi di lampo rosso + scossa sul token colpito
const FLASH_SCOSSA_PX: float = 5.0     # ampiezza massima della vibrazione (scala con la cella)
const FLOATER_DURATA: float = 1.15     # vita di un numero fluttuante
const FLOATER_SALITA_PX: float = 46.0  # di quanto sale mentre svanisce
const COL_DANNO: Color = Color(0.96, 0.42, 0.36)
const COL_CURA: Color = Color(0.5, 0.86, 0.5)
const COL_CRIT: Color = Color(1.0, 0.82, 0.3)

# Token: id -> { name, cell:Vector2i, kind, combatant_id }.
var _tokens: Dictionary = {}
var _revealed: Dictionary = {}         # "x,y" -> true
var _selected_id: String = ""
var _current_combatant_id: String = ""

# Sfondo personalizzato (facoltativo): una qualunque immagine locale (es. una mappa salvata da
# Pinterest/Google Immagini/un proprio disegno) al posto della scacchiera generica. Non scarichiamo
# NULLA da internet qui dentro (niente scraping di Pinterest: e' vietato dai loro termini d'uso e
# comunque fragile) — l'utente sceglie un file gia' salvato sul proprio computer.
var _background_texture: Texture2D = null

# Righello di misurazione (stile Foundry): tasto destro premuto + trascina, la distanza (celle e
# metri, Chebyshev come il resto del combattimento) si vede live; il rilascio lo cancella.
var _ruler_active: bool = false
var _ruler_start: Vector2 = Vector2.ZERO
var _ruler_end: Vector2 = Vector2.ZERO

var _cell_size: float = 32.0
var _origin: Vector2 = Vector2.ZERO

# Effetti effimeri del game feel (avanzano in _process, disegnati sopra i token).
var _flashes: Dictionary = {}     # combatant_id -> tempo di flash residuo (secondi)
var _floaters: Array[Dictionary] = []  # { "cell":Vector2i, "off":Vector2, "testo", "colore", "vita", "vita_max", "crit":bool }
var _crit_in_arrivo: Dictionary = {}   # target_id -> true: il prossimo numero di danno e' un critico


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_to_group("tactical_map")  # il cassetto Strumenti del Master trova la mappa da qui
	_apply_dark_style_border()
	CombatManager.combat_started.connect(_on_combat_started)
	CombatManager.combatant_added.connect(_on_combatant_added)
	CombatManager.combatant_defeated.connect(_on_combatant_defeated)
	CombatManager.combatant_removed.connect(_on_combatant_defeated)  # stessa pulizia del token
	CombatManager.turn_changed.connect(_on_turn_changed)
	CombatManager.combat_ended.connect(_on_combat_ended)
	# L'IA nemica (o qualunque altro sistema) puo' spostare un combattente SENZA passare dal click
	# sulla mappa: questo signal tiene il token a schermo allineato alla posizione autorevole.
	CombatManager.combatant_position_changed.connect(_on_combatant_position_changed)
	# Game feel: il colpo si VEDE — lampo+scossa sul bersaglio e numero di danno che sale.
	CombatManager.combatant_damaged.connect(_on_combatant_damaged_feel)
	CombatManager.combatant_healed.connect(_on_combatant_healed_feel)
	CombatManager.attack_resolved.connect(_on_attack_resolved_feel)
	resized.connect(queue_redraw)


func _apply_dark_style_border() -> void:
	# Un bordo dorato tenue attorno alla mappa (coerente con gli altri pannelli).
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color(0.05, 0.045, 0.04)
	panel.border_color = Color(0.78, 0.61, 0.24, 0.25)
	panel.set_border_width_all(1)
	panel.set_corner_radius_all(10)
	# Lo applichiamo tramite un nodo Panel di sfondo (il Control disegna sopra).
	var bg := Panel.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.add_theme_stylebox_override("panel", panel)
	add_child(bg)
	move_child(bg, 0)


# --- Geometria: cella <-> pixel ---

func _recompute_geometry() -> void:
	_cell_size = minf(size.x / float(GRID_COLS), size.y / float(GRID_ROWS))
	var grid_w: float = _cell_size * GRID_COLS
	var grid_h: float = _cell_size * GRID_ROWS
	_origin = Vector2((size.x - grid_w) * 0.5, (size.y - grid_h) * 0.5)


func _cell_to_pixel_center(cell: Vector2i) -> Vector2:
	return _origin + Vector2((cell.x + 0.5) * _cell_size, (cell.y + 0.5) * _cell_size)


func _pixel_to_cell(pos: Vector2) -> Vector2i:
	return Vector2i(int((pos.x - _origin.x) / _cell_size), int((pos.y - _origin.y) / _cell_size))


func _in_bounds(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.x < GRID_COLS and cell.y >= 0 and cell.y < GRID_ROWS


# --- Disegno ---

func _draw() -> void:
	_recompute_geometry()
	# 1) Sfondo: l'immagine caricata dall'utente se presente, altrimenti la scacchiera generica.
	if _background_texture != null:
		var grid_rect := Rect2(_origin, Vector2(_cell_size * GRID_COLS, _cell_size * GRID_ROWS))
		draw_texture_rect(_background_texture, grid_rect, false)
	else:
		for y: int in range(GRID_ROWS):
			for x: int in range(GRID_COLS):
				var rect := Rect2(_origin + Vector2(x * _cell_size, y * _cell_size), Vector2(_cell_size, _cell_size))
				draw_rect(rect, COL_CELL_A if (x + y) % 2 == 0 else COL_CELL_B, true)
	for x: int in range(GRID_COLS + 1):
		var px: float = _origin.x + x * _cell_size
		draw_line(Vector2(px, _origin.y), Vector2(px, _origin.y + GRID_ROWS * _cell_size), COL_GRID, 1.0)
	for y: int in range(GRID_ROWS + 1):
		var py: float = _origin.y + y * _cell_size
		draw_line(Vector2(_origin.x, py), Vector2(_origin.x + GRID_COLS * _cell_size, py), COL_GRID, 1.0)

	# 2) Elevazione (Modulo 28): riquadro + numero di quota sulle celle dipinte dal Master/IA.
	_draw_elevation()

	# 3) Superfici (Modulo 27): cerchi tratteggiati fuoco/veleno.
	_draw_surfaces()

	# 4) Token (sotto la nebbia: i nemici in celle non rivelate resteranno nascosti dall'overlay).
	for id: String in _tokens.keys():
		_draw_token(_tokens[id])

	# 5) Nebbia di guerra: overlay scuro sulle celle non ancora rivelate.
	for y: int in range(GRID_ROWS):
		for x: int in range(GRID_COLS):
			if not _revealed.has("%d,%d" % [x, y]):
				var rect := Rect2(_origin + Vector2(x * _cell_size, y * _cell_size), Vector2(_cell_size, _cell_size))
				draw_rect(rect, COL_FOG, true)

	# 6) Numeri di danno/cura fluttuanti: sopra token e nebbia (il feedback si legge sempre).
	_draw_floaters()

	# 7) Righello di misurazione: sempre sopra a tutto il resto, come un HUD.
	if _ruler_active:
		_draw_ruler()


## Tasto destro tenuto premuto + trascina: mostra distanza in celle/metri (Chebyshev, come il resto
## del combattimento — porting "in stile Foundry" del righello di misurazione, non presente nel
## monolite ne' finora in Godot).
func _draw_ruler() -> void:
	draw_line(_ruler_start, _ruler_end, Color(0.94, 0.83, 0.53, 0.9), 2.0)
	draw_circle(_ruler_start, 4.0, Color(0.94, 0.83, 0.53))
	draw_circle(_ruler_end, 4.0, Color(0.94, 0.83, 0.53))
	var start_cell: Vector2i = _pixel_to_cell(_ruler_start)
	var end_cell: Vector2i = _pixel_to_cell(_ruler_end)
	var cells: int = maxi(absi(end_cell.x - start_cell.x), absi(end_cell.y - start_cell.y))
	var meters: float = cells * METERS_PER_CELL
	var label: String = "%d celle · %.1f m" % [cells, meters]
	var font: Font = ThemeDB.fallback_font
	var fsize: int = 14
	var text_w: float = font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize).x
	var mid: Vector2 = (_ruler_start + _ruler_end) * 0.5
	draw_rect(Rect2(mid + Vector2(-text_w * 0.5 - 6, -fsize - 6), Vector2(text_w + 12, fsize + 10)), Color(0, 0, 0, 0.65), true)
	draw_string(font, mid + Vector2(-text_w * 0.5, -8), label, HORIZONTAL_ALIGNMENT_LEFT, text_w + 4, fsize, Color(0.94, 0.83, 0.53))


func _draw_elevation() -> void:
	var quote: Dictionary = ElevationManager.celle_dipinte()
	for chiave: String in quote.keys():
		var livello: int = int(quote[chiave])
		if livello == 0:
			continue
		var parti: PackedStringArray = chiave.split(",")
		var cell := Vector2i(int(parti[0]), int(parti[1]))
		if not _in_bounds(cell):
			continue
		var center: Vector2 = _cell_to_pixel_center(cell)
		var lato: float = _cell_size * 0.86
		var col: Color = Color(0.94, 0.83, 0.53, 0.75) if livello > 0 else Color(0.62, 0.77, 0.88, 0.75)
		draw_rect(Rect2(center - Vector2(lato, lato) * 0.5, Vector2(lato, lato)), col, false, 2.0)
		var font: Font = ThemeDB.fallback_font
		var fsize: int = maxi(10, int(_cell_size * 0.34))
		var testo: String = ("+%d" % livello) if livello > 0 else str(livello)
		draw_string(font, center - Vector2(fsize * 0.3, -fsize * 0.3), testo, HORIZONTAL_ALIGNMENT_CENTER, lato, fsize, col)


func _draw_surfaces() -> void:
	for s: Dictionary in SurfacesManager.elenco_attivo():
		var centro: Vector2 = _cell_to_pixel_center(Vector2i(int(s["cellX"]), int(s["cellY"])))
		var raggio_px: float = (float(s["raggio"]) + 0.5) * _cell_size
		var col: Color = Color(0.88, 0.38, 0.23, 0.22) if s["tipo"] == "fuoco" else Color(0.48, 0.77, 0.35, 0.22)
		var bordo: Color = Color(0.88, 0.38, 0.23, 0.75) if s["tipo"] == "fuoco" else Color(0.48, 0.77, 0.35, 0.75)
		draw_circle(centro, raggio_px, col)
		draw_arc(centro, raggio_px, 0, TAU, 40, bordo, 2.0)


func _draw_token(token: Dictionary) -> void:
	var cell: Vector2i = token["cell"]
	var is_pc: bool = token["kind"] == "pc"
	# Game feel: se il combattente e' stato appena colpito, il token vibra (scossa) e lampeggia
	# di rosso (tinta) per una frazione di secondo — il colpo si SENTE.
	var feel: Dictionary = _flash_di(String(token.get("combatant_id", "")))
	var center: Vector2 = _cell_to_pixel_center(cell) + (feel["scossa"] as Vector2)
	var tinta: Color = feel["tinta"]
	var radius: float = _cell_size * 0.36
	# Corpo: ARTE del token se esiste (user://tokens prima, poi assets/tokens — vedi TokenArt),
	# altrimenti il cerchio colorato di sempre. Un PG senza ritratto col proprio nome ripiega
	# sull'arte della sua CLASSE (guerriero, mago...).
	var tex: Texture2D = TokenArt.per_nome(String(token["name"]))
	if tex == null and is_pc:
		tex = TokenArt.per_nome(_classe_di(String(token["name"])))
	var raggio_corpo: float = radius
	if tex != null:
		raggio_corpo = radius * 1.18  # il PNG porta con se' anello e ombra propri
		draw_texture_rect(tex, Rect2(center - Vector2(raggio_corpo, raggio_corpo),
			Vector2(raggio_corpo, raggio_corpo) * 2.0), false, tinta)
	else:
		draw_circle(center, radius, (COL_PC if is_pc else COL_NPC) * tinta)
		draw_arc(center, radius, 0, TAU, 32, COL_PC_RING if is_pc else COL_NPC_RING, 2.0)
	# Anelli di selezione/turno DOPO il corpo: visibili anche sopra l'arte.
	if token["id"] == _selected_id:
		draw_arc(center, raggio_corpo + 4.0, 0, TAU, 32, COL_SELECT, 3.0)
	if not _current_combatant_id.is_empty() and token.get("combatant_id", "") == _current_combatant_id:
		draw_arc(center, raggio_corpo + 7.0, 0, TAU, 32, COL_TURN_RING, 2.5)
	# Nome sotto il token.
	var font: Font = ThemeDB.fallback_font
	var fsize: int = maxi(10, int(_cell_size * 0.32))
	draw_string(font, Vector2(center.x - _cell_size * 0.5, center.y + raggio_corpo + fsize),
		String(token["name"]), HORIZONTAL_ALIGNMENT_CENTER, _cell_size, fsize, Color(0.85, 0.8, 0.7))


## Classe del PG col nome dato (per l'arte di fallback dei token senza ritratto dedicato).
func _classe_di(nome_pg: String) -> String:
	for pg: CharacterData in CharacterManager.get_party():
		if pg.character_name == nome_pg:
			return pg.class_name_label
	return ""


# --- Sfondo mappa personalizzato (immagine locale scelta dall'utente) ---

## Carica un'immagine locale (PNG/JPG/WEBP) come sfondo della griglia tattica, al posto della
## scacchiera. Ritorna false se il file non esiste o non e' un'immagine valida.
func load_background_image(path: String) -> bool:
	var image := Image.new()
	var err: int = image.load(path)
	if err != OK:
		return false
	_background_texture = ImageTexture.create_from_image(image)
	queue_redraw()
	return true


func clear_background_image() -> void:
	_background_texture = null
	queue_redraw()


# --- Input: seleziona / muovi (click-to-move BG3) + righello (tasto destro trascinato) ---

func _gui_input(event: InputEvent) -> void:
	var mm := event as InputEventMouseMotion
	if mm != null:
		if _ruler_active:
			_ruler_end = mm.position
			queue_redraw()
		return

	var mb := event as InputEventMouseButton
	if mb == null:
		return

	if mb.button_index == MOUSE_BUTTON_RIGHT:
		if mb.pressed:
			_ruler_active = true
			_ruler_start = mb.position
			_ruler_end = mb.position
		else:
			_ruler_active = false
		queue_redraw()
		return

	if not mb.pressed or mb.button_index != MOUSE_BUTTON_LEFT:
		return
	_recompute_geometry()
	var cell: Vector2i = _pixel_to_cell(mb.position)
	if not _in_bounds(cell):
		return
	var token_here: String = _token_id_at(cell)
	if token_here != "":
		_selected_id = token_here                 # click su token: selezione
		queue_redraw()
		return
	if _selected_id != "" and _tokens.has(_selected_id):   # click su cella vuota: sposta il selezionato
		var t: Dictionary = _tokens[_selected_id]
		t["cell"] = cell
		# Posizione autorevole per il gioco (fiancheggiamento/elevazione/IA nemici la leggono da qui).
		CombatManager.set_combatant_cell(String(t["combatant_id"]), cell)
		if t["kind"] == "pc":
			_reveal_around(cell, FOG_REVEAL_RADIUS)
		token_moved.emit(_selected_id, cell)
		queue_redraw()


func _token_id_at(cell: Vector2i) -> String:
	for id: String in _tokens.keys():
		if _tokens[id]["cell"] == cell:
			return id
	return ""


# --- Nebbia di guerra ---

## Strumento del Master: svela TUTTA la mappa (rivela ogni cella). Utile per mostrare l'ambiente
## quando la scena e' finita o per un colpo d'occhio da dietro lo schermo.
func svela_tutta_la_nebbia() -> void:
	for y: int in range(GRID_ROWS):
		for x: int in range(GRID_COLS):
			_revealed["%d,%d" % [x, y]] = true
	queue_redraw()


## Strumento del Master: rimette la nebbia ovunque, poi riscopre solo attorno ai PG (com'era a
## inizio scena). Non toglie la vista al party, la "resetta".
func rinnebbia_tutto() -> void:
	_revealed.clear()
	for id: String in _tokens.keys():
		if _tokens[id]["kind"] == "pc":
			_reveal_around(_tokens[id]["cell"], FOG_REVEAL_RADIUS)
	queue_redraw()


func _reveal_around(cell: Vector2i, radius: int) -> void:
	for dy: int in range(-radius, radius + 1):
		for dx: int in range(-radius, radius + 1):
			var c := Vector2i(cell.x + dx, cell.y + dy)
			if _in_bounds(c):
				_revealed["%d,%d" % [c.x, c.y]] = true


# --- Sincronizzazione dei token dallo stato di combattimento ---

func _on_combat_started() -> void:
	_rebuild_tokens()
	queue_redraw()


func _on_combat_ended() -> void:
	# La scena resta visibile ma senza evidenziazione di turno.
	_current_combatant_id = ""
	queue_redraw()


func _on_combatant_added(_combatant: Dictionary) -> void:
	_rebuild_tokens()
	queue_redraw()


## Un nemico ucciso sparisce dalla griglia (rimuove il suo token) — come il fix del monolite.
func _on_combatant_defeated(combatant_id: String) -> void:
	for id: String in _tokens.keys():
		if _tokens[id].get("combatant_id", "") == combatant_id and _tokens[id]["kind"] == "npc":
			_tokens.erase(id)
			CombatManager.clear_combatant_cell(combatant_id)
			break
	if _selected_id != "" and not _tokens.has(_selected_id):
		_selected_id = ""
	queue_redraw()


## L'IA nemica (o qualunque altro sistema di gioco) ha spostato un combattente senza passare dal
## click sulla mappa: allinea il token a schermo alla posizione autorevole di CombatManager.
func _on_combatant_position_changed(combatant_id: String, cell: Vector2i) -> void:
	var token_id: String = "tok-" + combatant_id
	if _tokens.has(token_id):
		_tokens[token_id]["cell"] = cell
		if _tokens[token_id]["kind"] == "pc":
			_reveal_around(cell, FOG_REVEAL_RADIUS)
		queue_redraw()


func _on_turn_changed(combatant_id: String, _round: int) -> void:
	_current_combatant_id = combatant_id
	queue_redraw()


# --- Game feel: reazioni visibili a colpi e cure ---

## Un critico appena tirato: il numero di danno che segue (stesso bersaglio) sara' evidenziato.
func _on_attack_resolved_feel(result: Dictionary) -> void:
	if bool(result.get("hit", false)) and bool(result.get("critical", false)):
		_crit_in_arrivo[String(result.get("target", ""))] = true


func _on_combatant_damaged_feel(combatant_id: String, amount: int, _hp: int) -> void:
	if amount <= 0:
		return
	var crit: bool = _crit_in_arrivo.erase(combatant_id)  # true se c'era un critico in coda
	_flashes[combatant_id] = FLASH_DURATA
	_aggiungi_floater(combatant_id, ("CRIT! -%d" % amount) if crit else "-%d" % amount,
		COL_CRIT if crit else COL_DANNO, crit)
	_avvia_effetti()


func _on_combatant_healed_feel(combatant_id: String, amount: int, _hp: int) -> void:
	if amount <= 0:
		return
	_aggiungi_floater(combatant_id, "+%d" % amount, COL_CURA, false)
	_avvia_effetti()


func _aggiungi_floater(combatant_id: String, testo: String, colore: Color, crit: bool) -> void:
	var token_id: String = "tok-" + combatant_id
	if not _tokens.has(token_id):
		return  # nessun token a schermo (combattimento "in astratto"): niente numero
	_floaters.append({
		"cell": _tokens[token_id]["cell"] as Vector2i, "off": Vector2.ZERO,
		"testo": testo, "colore": colore, "vita": FLOATER_DURATA,
		"vita_max": FLOATER_DURATA, "crit": crit,
	})


func _avvia_effetti() -> void:
	set_process(true)
	queue_redraw()


func _process(delta: float) -> void:
	var attivo: bool = false
	for cid: String in _flashes.keys():
		_flashes[cid] = float(_flashes[cid]) - delta
		if _flashes[cid] <= 0.0:
			_flashes.erase(cid)
		else:
			attivo = true
	for f: Dictionary in _floaters:
		f["vita"] = float(f["vita"]) - delta
		var t: float = 1.0 - float(f["vita"]) / float(f["vita_max"])
		f["off"] = Vector2(0.0, -FLOATER_SALITA_PX * t)
	_floaters = _floaters.filter(func(f: Dictionary) -> bool: return float(f["vita"]) > 0.0)
	if not _floaters.is_empty():
		attivo = true
	queue_redraw()
	if not attivo:
		set_process(false)


## Tinta di flash del token colpito (rosso che sfuma) e offset di scossa, dato il suo id.
func _flash_di(combatant_id: String) -> Dictionary:
	if not _flashes.has(combatant_id):
		return { "tinta": Color(1, 1, 1, 1), "scossa": Vector2.ZERO }
	var q: float = clampf(float(_flashes[combatant_id]) / FLASH_DURATA, 0.0, 1.0)
	var ampiezza: float = FLASH_SCOSSA_PX * (_cell_size / 32.0) * q
	return {
		"tinta": Color(1, 1, 1, 1).lerp(COL_DANNO, q * 0.75),
		"scossa": Vector2(randf_range(-ampiezza, ampiezza), randf_range(-ampiezza, ampiezza)),
	}


## Numeri di danno/cura fluttuanti, sopra i token (chiamato in coda a _draw).
func _draw_floaters() -> void:
	var font: Font = ThemeDB.fallback_font
	for f: Dictionary in _floaters:
		var base: Vector2 = _cell_to_pixel_center(f["cell"]) + (f["off"] as Vector2)
		var alpha: float = clampf(float(f["vita"]) / float(f["vita_max"]), 0.0, 1.0)
		var colore: Color = f["colore"]
		colore.a = alpha
		var dim: int = int(_cell_size * (0.62 if bool(f["crit"]) else 0.46))
		var testo: String = String(f["testo"])
		var largh: float = _cell_size * 3.0
		var pos: Vector2 = base - Vector2(largh * 0.5, 0.0)
		draw_string(font, pos + Vector2(1.5, 1.5), testo, HORIZONTAL_ALIGNMENT_CENTER,
			largh, dim, Color(0, 0, 0, alpha * 0.8))
		draw_string(font, pos, testo, HORIZONTAL_ALIGNMENT_CENTER, largh, dim, colore)


## Crea un token per ogni combattente che non ne ha gia' uno: i PG a sinistra, i nemici a destra
## (distanza tattica reale, come l'arena del Modulo 40). Preserva le posizioni dei token esistenti.
func _rebuild_tokens() -> void:
	var state: Dictionary = CombatManager.get_state()
	var pc_index: int = 0
	var npc_index: int = 0
	var seen: Dictionary = {}
	for c: Dictionary in state["combatants"]:
		var cid: String = String(c["id"])
		var token_id: String = "tok-" + cid
		seen[token_id] = true
		if _tokens.has(token_id):
			# esiste gia': solo avanza gli indici per non ricalpestare le celle di spawn
			if c["kind"] == "pc": pc_index += 1
			else: npc_index += 1
			continue
		var cell: Vector2i
		if c["kind"] == "pc":
			cell = _free_cell_near(PARTY_ANCHOR, pc_index)
			pc_index += 1
			_reveal_around(cell, FOG_REVEAL_RADIUS)
		else:
			cell = _free_cell_near(ENEMY_ANCHOR, npc_index)
			npc_index += 1
		_tokens[token_id] = {
			"id": token_id, "name": String(c["name"]), "cell": cell,
			"kind": String(c["kind"]), "combatant_id": cid,
		}
		CombatManager.set_combatant_cell(cid, cell)
	# Rimuove token di combattenti spariti dal tracker (oltre a quelli uccisi).
	for id: String in _tokens.keys():
		if not seen.has(id):
			_tokens.erase(id)


func _free_cell_near(anchor: Vector2i, index: int) -> Vector2i:
	# Dispone i token a spirale attorno all'ancora, evitando celle gia' occupate.
	var offsets: Array[Vector2i] = [
		Vector2i(0, 0), Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0),
		Vector2i(0, 2), Vector2i(0, -2), Vector2i(1, 1), Vector2i(-1, 1), Vector2i(1, -1),
	]
	var start: int = index % offsets.size()
	for i: int in range(offsets.size()):
		var cell: Vector2i = anchor + offsets[(start + i) % offsets.size()]
		if _in_bounds(cell) and _token_id_at(cell) == "":
			return cell
	return anchor
