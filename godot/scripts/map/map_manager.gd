# gdlint: disable=max-public-methods
# (E' la facciata del Map Engine: griglia, token, luci, fog, livelli — l'API pubblica e' ampia
# per design, documentata nel design doc; spezzarla ora creerebbe indirection senza valore.)
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
	Color(0.3, 0.26, 0.18),        # 10 SCALA_GIU
	Color(0.42, 0.37, 0.26),       # 11 SCALA_SU
	Color(0.11, 0.11, 0.15),       # 12 TETTO (layer a scomparsa)
]

# Terreni su cui si puo' camminare. L'acqua e' percorribile ma LENTA (peso 2.0 nell'A*), le
# macerie rallentano (1.5); muri e pilastri bloccano del tutto (vedi cella_percorribile).
const CALPESTABILI: Array[int] = [G.PAVIMENTO, G.PORTA, G.PONTE, G.ACQUA, G.SCALA_GIU, G.SCALA_SU]

const FOG_SHADER := preload("res://scripts/map/fog_of_war.gdshader")
const RAGGIO_VISIONE: int = 10  # celle di vista del party (per la memoria dell'esplorato)

var _ground: TileMapLayer
var _walls: TileMapLayer
var _props: TileMapLayer
var _overhead: TileMapLayer
var _lights: Node2D
var _tokens_root: Node2D
var _canvas_modulate: CanvasModulate

# Fase 2: pathfinding e nebbia a doppio canale.
var _astar: AStarGrid2D
var _fog_esplorata: PackedByteArray = PackedByteArray()
var _fog_lava: PackedByteArray = PackedByteArray()
var _fog_image: Image
var _fog_sprite: Sprite2D

# Fase 3: complesso multi-livello, tetti a scomparsa, stato per il salvataggio "seme+delta".
var _livelli: Array[Dictionary] = []
var _fog_per_livello: Array[PackedByteArray] = []
var _livello_corrente: int = 0
var _tema_corrente: String = "cripta"
var _seme_base: int = 0
var _ultime_celle_party: Array[Vector2i] = []
var _tetti: Array[TileMapLayer] = []
var _tetti_stanze: Array[Rect2i] = []
var _tetti_alpha: Array[float] = []

var _tile_source_id: int = 0
var _luce_tex: Texture2D
var _token_tex: Texture2D
var _dati: Dictionary = {}
var _tokens: Dictionary = {}      # combatant_id -> Node2D
var _camera: VTTCamera
var _ottimizzatore: MapEngineOptimized


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
	# Culling (MapEngineOptimized): fuori inquadratura le luci-decoro si spengono e i token PNG
	# si nascondono — VRAM libera per l'LLM locale. Le luci-vista dei PG non si toccano mai.
	_ottimizzatore = MapEngineOptimized.new()
	add_child(_ottimizzatore)
	_ottimizzatore.configura(_camera, [_lights, _tokens_root])


# --- Costruzione dei 4 TileMapLayer + contenitori Y-sortati ---

func _costruisci_layers() -> void:
	var tileset: TileSet = _costruisci_tileset()
	_ground = _nuovo_layer(tileset, "Ground", 0, false)
	_walls = _nuovo_layer(tileset, "Walls", 1, false)
	_props = _nuovo_layer(tileset, "Props", 2, true)     # Y-sort: i props si ordinano coi token
	_overhead = _nuovo_layer(tileset, "Overhead", 4, false)

	# Contenitori (tra Props e Overhead) per luci e token. Gli occlusori NON hanno piu' un nodo:
	# vivono nel TileSet (occlusion layer per-tile) — dipingere un muro porta l'ombra con se'.
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
				# Muro bicolore: la fascia bassa e' la "faccia" visibile (piu' chiara), la parte
				# alta e' la cima — lettura 2.5D dei muri senza tile 32x64 (che richiedono arte vera).
				if tipo == G.MURO and not bordo and y >= int(CELL_PX * 0.62):
					c = col.lightened(0.4)
				img.set_pixel(px, y, c)

	var atlas := TileSetAtlasSource.new()
	atlas.texture = ImageTexture.create_from_image(img)
	atlas.texture_region_size = Vector2i(CELL_PX, CELL_PX)
	for tipo: int in range(G.TILE_COUNT):
		atlas.create_tile(Vector2i(tipo, 0))

	var tileset := TileSet.new()
	tileset.tile_size = Vector2i(CELL_PX, CELL_PX)
	# Occlusion layer PER-TILE: muri e pilastri portano l'occlusore con se' quando vengono dipinti.
	# Niente piu' un nodo LightOccluder2D per cella: la luce non attraversa la pietra "gratis".
	# (Nota 4.4+: set_occluder e' rinominata set_occluder_polygon; su 4.3 e' questa.)
	tileset.add_occlusion_layer()
	_tile_source_id = tileset.add_source(atlas, 0)
	var mezzo: float = CELL_PX * 0.5
	var quad := OccluderPolygon2D.new()
	quad.polygon = PackedVector2Array([
		Vector2(-mezzo, -mezzo), Vector2(mezzo, -mezzo), Vector2(mezzo, mezzo), Vector2(-mezzo, mezzo),
	])
	for tipo_occlusore: int in [G.MURO, G.PILASTRO]:
		var td: TileData = atlas.get_tile_data(Vector2i(tipo_occlusore, 0), 0)
		td.set_occluder(0, quad)
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

## Genera e dipinge un COMPLESSO del tema dato: n_livelli piani collegati da scale (Fase 3).
## Il seme base e' fissato QUI (anche quando casuale): livello i = seme_base + i, cosi' la coppia
## (tema, seme) rigenera l'intero complesso identico al bit — e' cio' che rende possibile il
## salvataggio "seme+delta". tema: cripta|roccaforte|tempio_lava|caverna.
func genera_dungeon(tema: String = "cripta", seme: int = -1, n_livelli: int = 2) -> void:
	_tema_corrente = tema
	_seme_base = seme if seme >= 0 else (randi() % 2000000000)
	_livelli.clear()
	_fog_per_livello.clear()
	for i: int in range(maxi(1, n_livelli)):
		_livelli.append(G.genera(tema, _seme_base + i))
		_fog_per_livello.append(PackedByteArray())
	for i: int in range(_livelli.size() - 1):
		G.collega_livelli(_livelli[i], _livelli[i + 1])
	_livello_corrente = 0
	_applica_livello()
	aggiorna_visione(_dati.get("spawn", Vector2i(2, 2)))
	EventBus.dungeon_generated.emit(tema, _dati)


## Dipinge il livello corrente (usato da genera_dungeon, dal cambio livello e dal ripristino).
func _applica_livello() -> void:
	_dati = _livelli[_livello_corrente]
	_pulisci()
	_dipingi_layers()
	_costruisci_tetti()
	_piazza_luci_torce()
	_ricostruisci_astar()
	_inizializza_fog()
	if _camera:
		var w: int = int(_dati["larghezza"])
		var h: int = int(_dati["altezza"])
		_camera.imposta_limiti(Rect2(0, 0, w * CELL_PX, h * CELL_PX))
		_camera.centra_su(_centro_cella(_dati.get("spawn", Vector2i(2, 2))))


func _pulisci() -> void:
	for layer: TileMapLayer in [_ground, _walls, _props, _overhead]:
		layer.clear()
	for tetto: TileMapLayer in _tetti:
		tetto.queue_free()
	_tetti.clear()
	_tetti_stanze.clear()
	_tetti_alpha.clear()
	for gruppo: Node2D in [_lights, _tokens_root]:
		for figlio: Node in gruppo.get_children():
			figlio.queue_free()
	_tokens.clear()


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


# --- Tetti a scomparsa (Fase 3): un mini-TileMapLayer di tetto PER STANZA, perche' il fading in
# Godot e' per-layer, non per-cella. Quando il party entra nella stanza k, il tetto k svanisce. ---

func _costruisci_tetti() -> void:
	for stanza_v: Variant in _dati.get("stanze", []):
		var stanza: Rect2i = stanza_v
		var layer := TileMapLayer.new()
		layer.tile_set = _ground.tile_set
		layer.z_index = 5
		for y: int in range(stanza.position.y, stanza.end.y):
			for x: int in range(stanza.position.x, stanza.end.x):
				layer.set_cell(Vector2i(x, y), _tile_source_id, Vector2i(G.TETTO, 0))
		add_child(layer)
		_tetti.append(layer)
		_tetti_stanze.append(stanza)
		_tetti_alpha.append(1.0)


## Il tetto di una stanza svanisce se QUALSIASI membro del party e' dentro (visione di gruppo).
func _aggiorna_tetti(celle_party: Array[Vector2i]) -> void:
	for i: int in range(_tetti.size()):
		var dentro: bool = false
		for cella: Vector2i in celle_party:
			if _tetti_stanze[i].has_point(cella):
				dentro = true
				break
		var alpha_target: float = 0.0 if dentro else 1.0
		if not is_equal_approx(_tetti_alpha[i], alpha_target):
			_tetti_alpha[i] = alpha_target
			create_tween().tween_property(_tetti[i], "modulate:a", alpha_target, 0.25)


# --- Complesso multi-livello (Fase 3): scale su/giu' fra i piani ---

func numero_livelli() -> int:
	return _livelli.size()


func livello_corrente() -> int:
	return _livello_corrente


## +1 se la cella e' una scala che scende, -1 se risale, 0 altrimenti.
func direzione_scala(cell: Vector2i) -> int:
	if not in_mappa(cell):
		return 0
	var tipo: int = (_dati["celle"] as PackedInt32Array)[cell.y * int(_dati["larghezza"]) + cell.x]
	if tipo == G.SCALA_GIU:
		return 1
	if tipo == G.SCALA_SU:
		return -1
	return 0


## Cambia piano seguendo una scala. Ritorna la cella d'arrivo sul nuovo livello (la scala
## complementare), o (-1,-1) se il piano non esiste. La fog di ogni piano e' persistente.
func cambia_livello_via_scala(direzione: int) -> Vector2i:
	var destinazione: int = _livello_corrente + direzione
	if destinazione < 0 or destinazione >= _livelli.size():
		return Vector2i(-1, -1)
	_fog_per_livello[_livello_corrente] = _fog_esplorata
	_livello_corrente = destinazione
	_applica_livello()
	var arrivo: Vector2i = _dati.get("scala_su" if direzione > 0 else "scala_giu", _dati.get("spawn", Vector2i(2, 2)))
	# La visione la ricalcola la vista DOPO aver ripiazzato i token del party (visione di gruppo).
	if _camera:
		_camera.centra_su(_centro_cella(arrivo))
	return arrivo


# --- Salvataggio "seme+delta" (Fase 3): il mondo si rigenera dal seme, si persiste solo il resto ---

## Pubblica in GameState lo stato minimo per ricostruire il dungeon: tema+seme (rigenerano le mappe
## identiche al bit), fog esplorata per livello (il "delta"), livello e celle del party. SaveManager
## lo raccoglie da li' senza conoscere questo nodo (disaccoppiamento).
func _pubblica_stato_salvataggio() -> void:
	if _livelli.is_empty():
		return
	_fog_per_livello[_livello_corrente] = _fog_esplorata
	var fogs: Array[String] = []
	for f: PackedByteArray in _fog_per_livello:
		fogs.append(Marshalls.raw_to_base64(f) if not f.is_empty() else "")
	var celle_party: Array = []
	for c: Vector2i in _ultime_celle_party:
		celle_party.append([c.x, c.y])
	GameState.set_value("nexus.save", {
		"tema": _tema_corrente, "seme": _seme_base, "livelli": _livelli.size(),
		"livelloCorrente": _livello_corrente, "fog": fogs,
		"partyCells": celle_party,
	})


## Ricostruisce il complesso da uno stato salvato: rigenera dal seme, poi riapplica i delta
## (fog esplorata, livello corrente). Ritorna le celle dove rimettere i token del party.
func ripristina_da_salvataggio(stato: Dictionary) -> Array[Vector2i]:
	genera_dungeon(String(stato.get("tema", "cripta")), int(stato.get("seme", 0)), int(stato.get("livelli", 2)))
	var fogs: Array = stato.get("fog", [])
	for i: int in range(mini(fogs.size(), _fog_per_livello.size())):
		var b64: String = String(fogs[i])
		if not b64.is_empty():
			_fog_per_livello[i] = Marshalls.base64_to_raw(b64)
	var livello: int = clampi(int(stato.get("livelloCorrente", 0)), 0, _livelli.size() - 1)
	if livello != _livello_corrente:
		_livello_corrente = livello
		_applica_livello()
	else:
		_inizializza_fog()  # ricarica la fog del livello 0 appena ripristinata
	var celle: Array[Vector2i] = []
	for e: Variant in stato.get("partyCells", []):
		if e is Array and (e as Array).size() == 2:
			celle.append(Vector2i(int(e[0]), int(e[1])))
	# Retrocompatibilita' coi salvataggi a cella singola ("partyCell").
	if celle.is_empty():
		var pc_raw: Array = stato.get("partyCell", [])
		celle.append(Vector2i(int(pc_raw[0]), int(pc_raw[1])) if pc_raw.size() == 2 else _dati.get("spawn", Vector2i(2, 2)))
	aggiorna_visione_multipla(celle)
	if _camera:
		_camera.centra_su(_centro_cella(celle[0]))
	return celle


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


# --- Token (Y-sortati) ---

## Crea un token visivo sulla mappa. Ogni PG porta la PROPRIA luce di vista (visione di gruppo:
## con piu' membri sparsi, l'illuminazione a schermo E' gia' l'unione delle loro viste — le ombre
## le tagliano i muri). Non tocca le regole: il combattente resta a CombatManager.
func spawn_token(combatant_id: String, cell: Vector2i, is_pc: bool, colore: Color) -> void:
	var token := Sprite2D.new()
	token.texture = _token_tex
	token.modulate = colore
	token.position = _centro_cella(cell)
	_tokens_root.add_child(token)
	_tokens[combatant_id] = token
	if is_pc:
		# La luce-vista di un PG e' STATO DI GIOCO (visione condivisa), non decoro: il meta
		# "visione" dice al culling di non spegnerla mai, anche se il token esce dall'inquadratura.
		var vista: PointLight2D = _nuova_luce(Color(0.9, 0.92, 1.0), 1.1, 4.2)
		vista.set_meta("visione", true)
		token.add_child(vista)
	else:
		token.set_meta("cullabile", true)  # i PNG fuori schermo possono sparire senza conseguenze
	EventBus.nexus_token_spawned.emit(combatant_id, cell)


## Id del token che occupa la cella ("" se libera). Le posizioni si derivano dagli sprite: nessuna
## seconda mappa di stato da tenere sincronizzata.
func token_in_cella(cell: Vector2i) -> String:
	for id: String in _tokens.keys():
		if mondo_a_cella((_tokens[id] as Node2D).position) == cell:
			return id
	return ""


func cella_di_token(token_id: String) -> Vector2i:
	if not _tokens.has(token_id):
		return Vector2i(-1, -1)
	return mondo_a_cella((_tokens[token_id] as Node2D).position)


## Evidenzia il token selezionato dal tavolo (leggermente ingrandito); "" per azzerare tutti.
func evidenzia_token(token_id: String) -> void:
	for id: String in _tokens.keys():
		(_tokens[id] as Node2D).scale = Vector2(1.25, 1.25) if id == token_id else Vector2.ONE


func muovi_token(combatant_id: String, cell: Vector2i) -> void:
	if _tokens.has(combatant_id):
		(_tokens[combatant_id] as Sprite2D).position = _centro_cella(cell)


## Anima il token lungo un percorso di celle (l'output di trova_percorso): un piccolo tween per
## tappa, in sequenza. La luce di vista del party segue da sola (e' figlia del token). Ritorna il
## Tween cosi' il chiamante puo' attendere l'arrivo (await tw.finished) — es. per le scale.
func muovi_token_lungo_percorso(combatant_id: String, percorso: Array[Vector2i]) -> Tween:
	if not _tokens.has(combatant_id) or percorso.is_empty():
		return null
	var token := _tokens[combatant_id] as Sprite2D
	var tw: Tween = create_tween()
	for cell: Vector2i in percorso:
		tw.tween_property(token, "position", _centro_cella(cell), 0.09)
	return tw


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
	var idx: int = cell.y * w + cell.x
	var celle: PackedInt32Array = _dati["celle"]
	var muri: PackedInt32Array = _dati["muri"]
	var props: PackedInt32Array = _dati["props"]
	if muri[idx] == G.MURO or props[idx] == G.PILASTRO:
		return false
	return CALPESTABILI.has(celle[idx]) or muri[idx] == G.PORTA


# --- Pathfinding (AStarGrid2D nativa) + cancello unico di validazione del movimento ---

## Ricostruita UNA volta a fine generazione dalla maschera di percorribilita'. E' il "cancello
## unico": giocatore, IA nemica e comandi del Master IA muovono i token SOLO lungo percorsi che
## esistono qui — un muro non si attraversa perche' nessun percorso lo attraversa.
func _ricostruisci_astar() -> void:
	var w: int = int(_dati["larghezza"])
	var h: int = int(_dati["altezza"])
	_astar = AStarGrid2D.new()
	_astar.region = Rect2i(0, 0, w, h)
	_astar.cell_size = Vector2(CELL_PX, CELL_PX)
	_astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	_astar.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_astar.update()
	var celle: PackedInt32Array = _dati["celle"]
	var props: PackedInt32Array = _dati["props"]
	for y: int in range(h):
		for x: int in range(w):
			var cell := Vector2i(x, y)
			if not cella_percorribile(cell):
				_astar.set_point_solid(cell, true)
			elif celle[y * w + x] == G.ACQUA:
				_astar.set_point_weight_scale(cell, 2.0)   # guadare rallenta
			elif props[y * w + x] == G.MACERIE:
				_astar.set_point_weight_scale(cell, 1.5)   # terreno accidentato


## Percorso da->a come lista di TAPPE (la cella di partenza e' esclusa). Vuoto = irraggiungibile.
func trova_percorso(da: Vector2i, a: Vector2i) -> Array[Vector2i]:
	var vuoto: Array[Vector2i] = []
	if _astar == null or not in_mappa(da) or not in_mappa(a) or not cella_percorribile(a):
		return vuoto
	var percorso: Array[Vector2i] = _astar.get_id_path(da, a)
	if percorso.size() <= 1:
		return vuoto  # nessun percorso (o gia' sul posto)
	percorso.remove_at(0)
	return percorso


## true se un movimento da->a e' possibile lungo un percorso reale (per validazioni esterne: IA,
## comandi del Master, futura rete host-authoritative).
func valida_movimento(da: Vector2i, a: Vector2i) -> bool:
	return not trova_percorso(da, a).is_empty()


## Costo in METRI del percorso (per l'Action Economy): tappe x 1,5 m.
func costo_percorso_metri(percorso: Array[Vector2i]) -> float:
	return celle_in_metri(percorso.size())


# --- Fog of War a doppio canale (Fase 2): memoria dell'esplorato su griglia + shader ---

func _inizializza_fog() -> void:
	var w: int = int(_dati["larghezza"])
	var h: int = int(_dati["altezza"])
	_fog_esplorata = PackedByteArray()
	_fog_esplorata.resize(w * h)
	# Canale "autoilluminato": la lava scrive un bagliore che filtra anche oltre la nebbia.
	_fog_lava = PackedByteArray()
	_fog_lava.resize(w * h)
	var celle: PackedInt32Array = _dati["celle"]
	for i: int in range(w * h):
		if celle[i] == G.LAVA:
			_fog_lava[i] = 1
	# Fog persistente per livello (Fase 3): tornando su un piano gia' visitato, la memoria resta.
	var salvata: PackedByteArray = _fog_per_livello[_livello_corrente] if _livello_corrente < _fog_per_livello.size() else PackedByteArray()
	if salvata.size() == w * h:
		_fog_esplorata = salvata.duplicate()
	_fog_image = Image.create(w, h, false, Image.FORMAT_RGB8)
	if _fog_sprite == null:
		_fog_sprite = Sprite2D.new()
		_fog_sprite.centered = false
		_fog_sprite.z_index = 6  # sopra TUTTO (anche tetti e overhead): la nebbia copre il mondo
		_fog_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR  # bordi morbidi via upscale
		var mat := ShaderMaterial.new()
		mat.shader = FOG_SHADER
		_fog_sprite.material = mat
		add_child(_fog_sprite)
	_fog_sprite.scale = Vector2(CELL_PX, CELL_PX)  # 1 texel -> 1 cella
	_fog_sprite.texture = ImageTexture.create_from_image(_fog_image)


## Visione singola: scorciatoia per la visione di gruppo con un'unica origine.
func aggiorna_visione(origine: Vector2i) -> void:
	var origini: Array[Vector2i] = [origine]
	aggiorna_visione_multipla(origini)


## VISIONE DI GRUPPO (tavolo condiviso, direttiva locale): la nebbia mostrata sullo schermo
## centrale e' l'UNIONE dei campi visivi di TUTTI i token del party — non una vista per client.
## Event-driven: si ricalcola SOLO quando un token del party si muove, mai per frame. Per ogni
## origine, raggi di Bresenham verso le celle nel raggio di visione; i muri bloccano; le celle
## viste da CHIUNQUE entrano per sempre nella memoria comune dell'esplorato.
func aggiorna_visione_multipla(origini: Array[Vector2i]) -> void:
	if _dati.is_empty() or origini.is_empty():
		return
	var w: int = int(_dati["larghezza"])
	var visibili: Dictionary = {}
	for origine: Vector2i in origini:
		if not in_mappa(origine):
			continue
		for dy: int in range(-RAGGIO_VISIONE, RAGGIO_VISIONE + 1):
			for dx: int in range(-RAGGIO_VISIONE, RAGGIO_VISIONE + 1):
				if dx * dx + dy * dy > RAGGIO_VISIONE * RAGGIO_VISIONE:
					continue  # cerchio, non quadrato
				var c := Vector2i(origine.x + dx, origine.y + dy)
				if in_mappa(c) and _linea_vista_libera(origine, c):
					var idx: int = c.y * w + c.x
					visibili[idx] = true
					_fog_esplorata[idx] = 1
	_ridisegna_fog(visibili)
	_ultime_celle_party = origini.duplicate()
	_aggiorna_tetti(origini)         # una stanza col party dentro perde il tetto
	_pubblica_stato_salvataggio()    # stato sempre pronto per SaveManager (seme+delta)


## Bresenham intero da->a: false se una cella INTERMEDIA e' un muro (il muro stesso, come
## bersaglio finale, resta visibile: e' il primo ostacolo che vedi).
func _linea_vista_libera(da: Vector2i, a: Vector2i) -> bool:
	var w: int = int(_dati["larghezza"])
	var muri: PackedInt32Array = _dati["muri"]
	var dx: int = absi(a.x - da.x)
	var dy: int = -absi(a.y - da.y)
	var sx: int = 1 if da.x < a.x else -1
	var sy: int = 1 if da.y < a.y else -1
	var err: int = dx + dy
	var cur: Vector2i = da
	while cur != a:
		var e2: int = err * 2
		if e2 >= dy:
			err += dy
			cur.x += sx
		if e2 <= dx:
			err += dx
			cur.y += sy
		if cur == a:
			break
		if muri[cur.y * w + cur.x] == G.MURO:
			return false
	return true


func _ridisegna_fog(visibili: Dictionary) -> void:
	var w: int = int(_dati["larghezza"])
	var h: int = int(_dati["altezza"])
	for y: int in range(h):
		for x: int in range(w):
			var idx: int = y * w + x
			_fog_image.set_pixel(x, y, Color8(
				255 if _fog_esplorata[idx] == 1 else 0,
				255 if visibili.has(idx) else 0,
				255 if _fog_lava[idx] == 1 else 0))
	(_fog_sprite.texture as ImageTexture).update(_fog_image)


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
