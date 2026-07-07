class_name NexusMapManager
extends Node2D
## Nexus Map Engine (Priorita' 1) — motore mappa a TileMapLayer multipli con illuminazione dinamica,
## nebbia di guerra raycastata e Y-sort 2.5D. Sostituisce, per i dungeon complessi (cripte,
## roccaforti naniche, templi di lava, caverne), il semplice canvas _draw() di TacticalMap.
##
## STRATIFICAZIONE (dal basso verso l'alto), come richiesto:
##   - Ground   : pavimento/acqua/lava/ponte (terreno calpestabile o fluido)
##   - Walls     : muri + porte, con LightOccluder2D -> proiettano ombre (raycasting della luce)
##   - Props     : pilastri, macerie (Y-sortati: un pilastro davanti a un token lo copre)
##   - Overhead  : archi/volte disegnati SOPRA i token che ci passano sotto (effetto 2.5D)
##
## ILLUMINAZIONE: CanvasModulate scurisce l'ambiente; ogni torcia e la vista del party sono
## PointLight2D. I muri hanno occlusori, quindi la luce NON attraversa la pietra: cio' che sta
## dietro un muro resta al buio = Fog of War per linea di vista, senza codice di raycast manuale
## (lo fa il renderer 2D di Godot con luci + occlusori).
##
## AUTOSUFFICIENZA: niente asset esterni. Il TileSet, la texture delle luci e i token sono generati
## a runtime da Image (colori distinti per tipo di cella). Cosi' il progetto resta un unico pacchetto
## apribile senza scaricare tileset.
##
## Non e' un autoload: e' un nodo di scena (lo incapsula NexusView in un SubViewport). Dialoga con la
## logica di gioco SOLO via EventBus + i manager esistenti (CombatManager per spawn/turni) — nessuna
## logica di regole D&D duplicata qui: questo e' puro strato di presentazione/mappa.

signal cella_cliccata(cell: Vector2i)

const G := preload("res://scripts/map/dungeon_generator.gd")

const CELL_PX: int = 32            # lato del tile in pixel
const METRI_PER_CELLA: float = 1.5 # scala di gioco (coerente con TacticalMap/EnemyAI)

# Colori procedurali per tipo di cella (indice = colonna nell'atlas). Palette scura del progetto.
const COLORI_TILE: Array[Color] = [
	Color(0, 0, 0, 0),              # 0 VUOTO (trasparente)
	Color(0.16, 0.14, 0.12),       # 1 PAVIMENTO
	Color(0.09, 0.08, 0.07),       # 2 MURO
	Color(0.42, 0.28, 0.12),       # 3 PORTA
	Color(0.12, 0.26, 0.4),        # 4 ACQUA
	Color(0.62, 0.2, 0.08),        # 5 LAVA
	Color(0.2, 0.18, 0.16),        # 6 MACERIE
	Color(0.28, 0.25, 0.22),       # 7 PILASTRO
	Color(0.24, 0.19, 0.13),       # 8 PONTE
	Color(0.14, 0.12, 0.16),       # 9 ARCO (overhead)
]

# Celle su cui si puo' camminare (le altre bloccano il movimento e la linea di vista).
const CALPESTABILI: Array[int] = [G.PAVIMENTO, G.PORTA, G.PONTE]

var _ground: TileMapLayer
var _walls: TileMapLayer
var _props: TileMapLayer
var _overhead: TileMapLayer
var _occluders: Node2D
var _lights: Node2D
var _tokens_root: Node2D
var _canvas_modulate: CanvasModulate

var _tile_source_id: int = 0
var _luce_tex: Texture2D
var _token_tex: Texture2D
var _dati: Dictionary = {}
var _tokens: Dictionary = {}      # combatant_id -> Node2D
var _pc_light: PointLight2D
var _camera: VTTCamera


func _ready() -> void:
	y_sort_enabled = true
	_luce_tex = _crea_texture_luce(256)
	_token_tex = _crea_texture_token(CELL_PX)
	_costruisci_layers()
	_costruisci_ambiente()
	# Camera dedicata (pan/zoom fluidi + limiti mappa): la gestione della camera vive nel suo nodo,
	# non qui — il MapManager si occupa SOLO di griglia/token/luci (disaccoppiamento).
	_camera = VTTCamera.new()
	add_child(_camera)


# --- Costruzione dei 4 TileMapLayer + contenitori Y-sortati ---

func _costruisci_layers() -> void:
	var tileset: TileSet = _costruisci_tileset()
	_ground = _nuovo_layer(tileset, "Ground", 0, false)
	_walls = _nuovo_layer(tileset, "Walls", 1, false)
	_props = _nuovo_layer(tileset, "Props", 2, true)     # Y-sort: i props si ordinano coi token
	_overhead = _nuovo_layer(tileset, "Overhead", 4, false)

	# Contenitori (tra Props e Overhead) per occlusori, luci e token — tutti Y-sortati insieme.
	_occluders = Node2D.new()
	_occluders.name = "Occluders"
	add_child(_occluders)

	_lights = Node2D.new()
	_lights.name = "Lights"
	add_child(_lights)

	_tokens_root = Node2D.new()
	_tokens_root.name = "Tokens"
	_tokens_root.y_sort_enabled = true
	_tokens_root.z_index = 3
	add_child(_tokens_root)


func _nuovo_layer(tileset: TileSet, nome: String, z: int, y_sort: bool) -> TileMapLayer:
	var layer := TileMapLayer.new()
	layer.name = nome
	layer.tile_set = tileset
	layer.z_index = z
	layer.y_sort_enabled = y_sort
	add_child(layer)
	return layer


func _costruisci_ambiente() -> void:
	# Ambiente scuro: le luci (torce/vista) illuminano solo le zone in linea di vista -> fog of war.
	_canvas_modulate = CanvasModulate.new()
	_canvas_modulate.color = Color(0.14, 0.12, 0.16)  # non nero pieno: un minimo di lettura globale
	add_child(_canvas_modulate)


# --- Generazione TileSet procedurale (un atlante colorato: 1 colonna per tipo di cella) ---

func _costruisci_tileset() -> TileSet:
	var img := Image.create(G.TILE_COUNT * CELL_PX, CELL_PX, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for tipo: int in range(G.TILE_COUNT):
		var col: Color = COLORI_TILE[tipo]
		for y: int in range(CELL_PX):
			for x: int in range(CELL_PX):
				var px: int = tipo * CELL_PX + x
				# Bordo piu' scuro per leggere la griglia; leggera variazione per texture.
				var bordo: bool = x == 0 or y == 0 or x == CELL_PX - 1 or y == CELL_PX - 1
				var c: Color = col.darkened(0.35) if bordo else col
				img.set_pixel(px, y, c)

	var atlas := TileSetAtlasSource.new()
	atlas.texture = ImageTexture.create_from_image(img)
	atlas.texture_region_size = Vector2i(CELL_PX, CELL_PX)
	for tipo: int in range(G.TILE_COUNT):
		atlas.create_tile(Vector2i(tipo, 0))

	var tileset := TileSet.new()
	tileset.tile_size = Vector2i(CELL_PX, CELL_PX)
	_tile_source_id = tileset.add_source(atlas, 0)
	return tileset


# --- Texture procedurali (luce a gradiente radiale, token a cerchio) ---

func _crea_texture_luce(dim: int) -> Texture2D:
	var img := Image.create(dim, dim, false, Image.FORMAT_RGBA8)
	var centro := Vector2(dim, dim) * 0.5
	var raggio: float = dim * 0.5
	for y: int in range(dim):
		for x: int in range(dim):
			var d: float = Vector2(x, y).distance_to(centro) / raggio
			var a: float = clampf(1.0 - d, 0.0, 1.0)
			a = a * a  # caduta morbida (quadratica) verso i bordi
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)


func _crea_texture_token(dim: int) -> Texture2D:
	var img := Image.create(dim, dim, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var centro := Vector2(dim, dim) * 0.5
	var raggio: float = dim * 0.4
	for y: int in range(dim):
		for x: int in range(dim):
			var d: float = Vector2(x, y).distance_to(centro)
			if d <= raggio:
				img.set_pixel(x, y, Color(1, 1, 1, 1))
			elif d <= raggio + 2.0:
				img.set_pixel(x, y, Color(1, 1, 1, 0.5))  # anti-alias del bordo
	return ImageTexture.create_from_image(img)


# --- Generazione e disegno del dungeon ---

## Genera e dipinge un dungeon del tema dato. tema: cripta|roccaforte|tempio_lava|caverna.
func genera_dungeon(tema: String = "cripta", seme: int = -1) -> void:
	_dati = G.genera(tema, seme)
	_pulisci()
	_dipingi_layers()
	_piazza_occlusori()
	_piazza_luci_torce()
	_piazza_luce_party()
	if _camera:
		var w: int = int(_dati["larghezza"])
		var h: int = int(_dati["altezza"])
		_camera.imposta_limiti(Rect2(0, 0, w * CELL_PX, h * CELL_PX))
		_camera.centra_su(_centro_cella(_dati.get("spawn", Vector2i(2, 2))))
	EventBus.dungeon_generated.emit(tema, _dati)


func _pulisci() -> void:
	for layer: TileMapLayer in [_ground, _walls, _props, _overhead]:
		layer.clear()
	for gruppo: Node2D in [_occluders, _lights, _tokens_root]:
		for figlio: Node in gruppo.get_children():
			figlio.queue_free()
	_tokens.clear()
	_pc_light = null


func _dipingi_layers() -> void:
	var w: int = int(_dati["larghezza"])
	var h: int = int(_dati["altezza"])
	var celle: PackedInt32Array = _dati["celle"]
	var muri: PackedInt32Array = _dati["muri"]
	var props: PackedInt32Array = _dati["props"]
	var overhead: PackedInt32Array = _dati["overhead"]
	for y: int in range(h):
		for x: int in range(w):
			var idx: int = y * w + x
			var pos := Vector2i(x, y)
			if celle[idx] != G.VUOTO:
				_ground.set_cell(pos, _tile_source_id, Vector2i(celle[idx], 0))
			if muri[idx] != 0:
				_walls.set_cell(pos, _tile_source_id, Vector2i(muri[idx], 0))
			if props[idx] != 0:
				_props.set_cell(pos, _tile_source_id, Vector2i(props[idx], 0))
			if overhead[idx] != 0:
				_overhead.set_cell(pos, _tile_source_id, Vector2i(overhead[idx], 0))


## Un LightOccluder2D quadrato per ogni cella-muro: la luce non passa oltre la pietra (raycasting).
## Per mappe enormi si potrebbero fondere i muri contigui in polilinee — qui, a 48x36, un occlusore
## per cella e' semplice e piu' che sostenibile su hardware moderno (nota di scalabilita').
func _piazza_occlusori() -> void:
	var w: int = int(_dati["larghezza"])
	var h: int = int(_dati["altezza"])
	var muri: PackedInt32Array = _dati["muri"]
	var quad := PackedVector2Array([
		Vector2(0, 0), Vector2(CELL_PX, 0), Vector2(CELL_PX, CELL_PX), Vector2(0, CELL_PX),
	])
	for y: int in range(h):
		for x: int in range(w):
			if muri[y * w + x] != G.MURO:
				continue  # le porte lasciano passare la luce (aperte)
			var occ := LightOccluder2D.new()
			var poly := OccluderPolygon2D.new()
			poly.polygon = quad
			occ.occluder = poly
			occ.position = Vector2(x * CELL_PX, y * CELL_PX)
			_occluders.add_child(occ)


func _piazza_luci_torce() -> void:
	var torce: Array = _dati.get("torce", [])
	for t: Variant in torce:
		var cell: Vector2i = t
		var luce := _nuova_luce(Color(1.0, 0.68, 0.32), 1.6, 2.4)  # arancio caldo, torcia
		luce.position = _centro_cella(cell)
		_lights.add_child(luce)
	# La lava emette luce da sola: una luce rossa fioca su ogni cella di lava (campionata, non tutte).
	var w: int = int(_dati["larghezza"])
	var h: int = int(_dati["altezza"])
	var celle: PackedInt32Array = _dati["celle"]
	for y: int in range(h):
		for x: int in range(w):
			if celle[y * w + x] == G.LAVA and (x + y) % 4 == 0:
				var luce := _nuova_luce(Color(0.95, 0.32, 0.12), 1.1, 1.8)
				luce.position = _centro_cella(Vector2i(x, y))
				_lights.add_child(luce)


func _nuova_luce(colore: Color, energia: float, scala: float) -> PointLight2D:
	var luce := PointLight2D.new()
	luce.texture = _luce_tex
	luce.color = colore
	luce.energy = energia
	luce.texture_scale = scala
	luce.shadow_enabled = true  # abilita le ombre proiettate dagli occlusori dei muri
	return luce


## Luce di vista del party (bianca, ampia): segue il token del PG e con le ombre dei muri crea la
## nebbia di guerra per linea di vista. Piazzata sulla cella di spawn del dungeon.
func _piazza_luce_party() -> void:
	_pc_light = _nuova_luce(Color(0.9, 0.92, 1.0), 1.2, 5.0)
	_pc_light.position = _centro_cella(_dati.get("spawn", Vector2i(2, 2)))
	_lights.add_child(_pc_light)


# --- Token (Y-sortati) ---

## Crea un token visivo sulla mappa e (per i PG) ci aggancia la luce di vista. Non tocca le regole:
## la registrazione del combattente resta a CombatManager, qui c'e' solo la rappresentazione.
func spawn_token(combatant_id: String, cell: Vector2i, is_pc: bool, colore: Color) -> void:
	var token := Sprite2D.new()
	token.texture = _token_tex
	token.modulate = colore
	token.position = _centro_cella(cell)
	_tokens_root.add_child(token)
	_tokens[combatant_id] = token
	if is_pc and _pc_light:
		# La vista segue il PG: riattacca la luce del party a questo token.
		if _pc_light.get_parent():
			_pc_light.get_parent().remove_child(_pc_light)
		token.add_child(_pc_light)
		_pc_light.position = Vector2.ZERO
	EventBus.nexus_token_spawned.emit(combatant_id, cell)


func muovi_token(combatant_id: String, cell: Vector2i) -> void:
	if _tokens.has(combatant_id):
		(_tokens[combatant_id] as Sprite2D).position = _centro_cella(cell)


func rimuovi_token(combatant_id: String) -> void:
	if _tokens.has(combatant_id):
		(_tokens[combatant_id] as Node2D).queue_free()
		_tokens.erase(combatant_id)


# --- Conversioni cella <-> mondo, regole di calpestabilita', metri <-> celle ---

func _centro_cella(cell: Vector2i) -> Vector2:
	return Vector2((cell.x + 0.5) * CELL_PX, (cell.y + 0.5) * CELL_PX)


func mondo_a_cella(world_pos: Vector2) -> Vector2i:
	return Vector2i(int(world_pos.x / CELL_PX), int(world_pos.y / CELL_PX))


func in_mappa(cell: Vector2i) -> bool:
	if _dati.is_empty():
		return false
	return cell.x >= 0 and cell.y >= 0 and cell.x < int(_dati["larghezza"]) and cell.y < int(_dati["altezza"])


func cella_percorribile(cell: Vector2i) -> bool:
	if not in_mappa(cell):
		return false
	var w: int = int(_dati["larghezza"])
	var celle: PackedInt32Array = _dati["celle"]
	var muri: PackedInt32Array = _dati["muri"]
	if muri[cell.y * w + cell.x] == G.MURO:
		return false
	return CALPESTABILI.has(celle[cell.y * w + cell.x]) or muri[cell.y * w + cell.x] == G.PORTA


## Action Economy (Priorita' 3.2): converte i metri di movimento in celle di questa griglia.
static func metri_in_celle(metri: float) -> int:
	return int(round(metri / METRI_PER_CELLA))


static func celle_in_metri(celle: int) -> float:
	return celle * METRI_PER_CELLA


func dimensione_mappa() -> Vector2i:
	if _dati.is_empty():
		return Vector2i.ZERO
	return Vector2i(int(_dati["larghezza"]), int(_dati["altezza"]))


func cella_spawn() -> Vector2i:
	return _dati.get("spawn", Vector2i(2, 2))


# --- Input dal mondo. Il pan/zoom li gestisce VTTCamera (tasto dx/centrale + rotellina); qui resta
# SOLO il click sinistro = selezione cella. Girando dentro un SubViewport con Camera2D,
# get_global_mouse_position() restituisce gia' le coordinate MONDO sotto il cursore.

func _unhandled_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb != null and mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
		click_su_mondo(get_global_mouse_position())


## Aggancia le celle del mondo alla griglia D&D: dato un punto qualunque, ritorna il CENTRO della
## cella che lo contiene (snap dei token). Utile a chi piazza token da coordinate libere.
func snap_a_cella(world_pos: Vector2) -> Vector2:
	return _centro_cella(mondo_a_cella(world_pos))


func click_su_mondo(world_pos: Vector2) -> void:
	var cell: Vector2i = mondo_a_cella(world_pos)
	if in_mappa(cell):
		cella_cliccata.emit(cell)
		EventBus.nexus_cell_clicked.emit(cell)
