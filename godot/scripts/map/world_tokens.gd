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
var _ultimo_zoom: float = 0.0


func configura(rect_mondo: Rect2, camera: Camera2D) -> void:
	_rect = rect_mondo
	_camera = camera
	_ricostruisci_roster()
	CharacterManager.party_changed.connect(func(_p: Array[CharacterData]) -> void:
		_ricostruisci_roster())
	set_process(true)


## Posizioni correnti (per la rivelazione iniziale della nebbia).
func posizioni() -> Array[Vector2]:
	var out: Array[Vector2] = []
	for g: Dictionary in _gettoni:
		out.append(g["pos"])
	return out


func _process(_delta: float) -> void:
	# I token scalano con lo zoom (clamp su schermo): al cambio zoom serve un redraw.
	if _camera != null and not is_equal_approx(_camera.zoom.x, _ultimo_zoom):
		_ultimo_zoom = _camera.zoom.x
		queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if blocco_input or _gettoni.is_empty():
		return
	var mb := event as InputEventMouseButton
	if mb != null and mb.button_index == MOUSE_BUTTON_LEFT:
		if mb.pressed:
			_trascinato = _colpito(get_global_mouse_position())
			if _trascinato >= 0:
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
		var pos: Vector2 = g["pos"]
		var colore: Color = g["colore"]
		draw_circle(pos, r * 1.14, Color(0.08, 0.06, 0.05, 0.9))     # bordo scuro
		draw_circle(pos, r, colore)
		draw_circle(pos, r * 0.78, colore.lightened(0.18))           # cuore piu' chiaro
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
			"id": pg.id, "nome": pg.character_name,
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
