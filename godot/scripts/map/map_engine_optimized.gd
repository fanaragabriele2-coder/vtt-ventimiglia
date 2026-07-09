class_name MapEngineOptimized
extends Node2D
## Motore mappa OTTIMIZZATO: "Gigantic Map Stitcher" a chunk + culling visivo per liberare VRAM.
##
## VINCOLO HARDWARE (RTX 4050, 6 GB): sullo stesso laptop girano il gioco E un LLM locale — ogni
## megabyte di VRAM lasciato libero e' contesto in piu' per il Master. Strategia su tre livelli:
## 1. LUCI: le PointLight2D con ombre sono il vero costo GPU della scena. Fuori inquadratura
##    (+margine) vengono DISABILITATE (enabled=false: niente draw pass). ECCEZIONE deliberata:
##    le luci-vista dei PG (meta "visione") non si spengono MAI — sono stato di gioco (visione
##    condivisa del party), non decoro; spegnerle cambierebbe cio' che il tavolo vede.
## 2. TOKEN decorativi (meta "cullabile"): visible=false fuori vista.
## 3. CHUNK del map stitcher: la mappa gigante e' cucita da piu' immagini (stile Crosshead);
##    fuori vista un chunk si nasconde, MOLTO lontano la sua texture viene proprio SCARICATA
##    dalla VRAM (texture=null, si ricarica dal disco quando la camera torna vicina).
## I TileMapLayer NON vengono toccati: Godot li culla gia' da solo per quadranti interni —
## rifarlo qui sarebbe lavoro doppio e rischio di bug, non un'ottimizzazione.
##
## Il culling gira su un accumulatore a intervalli (0.15s), non a ogni frame: iterare l'albero
## 60 volte al secondo per spegnere le stesse luci e' churn inutile (memoria/CPU, ThePrimeagen).
##
## Uso: figlio di NexusMapManager (gia' cablato) o standalone dentro un SubViewport qualsiasi:
##   var motore := MapEngineOptimized.new(); add_child(motore)
##   motore.configura(camera, [nodo_luci, nodo_token])
##   motore.carica_cartella("C:/mappe/palude", 4)   # 4 colonne di chunk

const INTERVALLO_CULLING: float = 0.15
const MARGINE_PX: float = 280.0          # oltre il bordo visibile: ancora attivo (niente pop-in)
const MARGINE_SCARICO_PX: float = 1600.0  # oltre QUESTO: la texture del chunk lascia la VRAM
const ESTENSIONI_IMMAGINE: Array[String] = ["png", "jpg", "jpeg", "webp"]

var _camera: Camera2D
var _gruppi: Array[Node2D] = []
var _chunks: Array[Dictionary] = []  # { "sprite": Sprite2D, "rect": Rect2, "percorso": String }
var _dimensione_chunk: Vector2 = Vector2.ZERO
var _tinta: CanvasModulate
var _accumulo: float = 0.0
var _luci_attive: int = 0
var _luci_totali: int = 0


## Aggancia la camera da inseguire e i contenitori i cui discendenti vanno cullati (luci e token).
func configura(camera: Camera2D, gruppi_cullabili: Array[Node2D]) -> void:
	_camera = camera
	_gruppi = gruppi_cullabili
	set_process(true)


func _process(delta: float) -> void:
	_accumulo += delta
	if _accumulo < INTERVALLO_CULLING:
		return
	_accumulo = 0.0
	_esegui_culling()


# --- Map Stitcher: una mappa gigante cucita da piu' immagini locali ---

## Carica tutte le immagini di una cartella come chunk affiancati in griglia (ordine alfabetico,
## riga per riga). `colonne` <= 0 = griglia ~quadrata. Ritorna quanti chunk ha caricato.
func carica_cartella(percorso_cartella: String, colonne: int = 0) -> int:
	var dir: DirAccess = DirAccess.open(percorso_cartella)
	if dir == null:
		push_warning("MapEngineOptimized: cartella non leggibile: " + percorso_cartella)
		return 0
	var nomi: Array[String] = []
	for nome_file: String in dir.get_files():
		if ESTENSIONI_IMMAGINE.has(nome_file.get_extension().to_lower()):
			nomi.append(nome_file)
	nomi.sort()
	if nomi.is_empty():
		return 0
	var larghezza: int = colonne if colonne > 0 else ceili(sqrt(float(nomi.size())))
	var caricati: int = 0
	for i: int in range(nomi.size()):
		var percorso: String = percorso_cartella.path_join(nomi[i])
		var riga: int = floori(float(i) / float(larghezza))
		if aggiungi_chunk(percorso, i % larghezza, riga):
			caricati += 1
	return caricati


## Cuce un singolo chunk (immagine locale) alla posizione di griglia data. La dimensione della
## cella di cucitura e' quella del PRIMO chunk caricato: gli asset di uno stesso pacchetto mappa
## (stile Crosshead) condividono il formato, e' la loro convenzione.
func aggiungi_chunk(percorso_immagine: String, colonna: int, riga: int) -> bool:
	var tex: Texture2D = _carica_texture(percorso_immagine)
	if tex == null:
		return false
	if _dimensione_chunk == Vector2.ZERO:
		_dimensione_chunk = tex.get_size()
	var sprite := Sprite2D.new()
	sprite.texture = tex
	sprite.centered = false
	sprite.position = Vector2(colonna, riga) * _dimensione_chunk
	sprite.z_index = -10  # il terreno cucito sta sotto a tutto il resto della scena
	add_child(sprite)
	_chunks.append({
		"sprite": sprite, "percorso": percorso_immagine,
		"rect": Rect2(sprite.position, _dimensione_chunk),
	})
	return true


## Estensione totale della mappa cucita (per impostare i limiti della camera).
func rettangolo_mappa() -> Rect2:
	var totale: Rect2 = Rect2()
	for i: int in range(_chunks.size()):
		var rect: Rect2 = _chunks[i]["rect"]
		totale = rect if i == 0 else totale.merge(rect)
	return totale


## Illuminazione UNIFORME su tutta la mappa cucita (chunk di autori/lotti diversi hanno bilanci
## colore diversi: una CanvasModulate sopra tutti li porta alla stessa "ora del giorno").
func imposta_tinta(colore: Color) -> void:
	if _tinta == null:
		_tinta = CanvasModulate.new()
		add_child(_tinta)
	_tinta.color = colore


func rimuovi_chunks() -> void:
	for voce: Dictionary in _chunks:
		(voce["sprite"] as Node).queue_free()
	_chunks.clear()
	_dimensione_chunk = Vector2.ZERO


## Contatori onesti per il debug: quante luci stanno davvero disegnando, quanti chunk in VRAM.
func statistiche() -> Dictionary:
	var in_vram: int = 0
	for voce: Dictionary in _chunks:
		if (voce["sprite"] as Sprite2D).texture != null:
			in_vram += 1
	return {
		"luci_attive": _luci_attive, "luci_totali": _luci_totali,
		"chunk_in_vram": in_vram, "chunk_totali": _chunks.size(),
	}


# --- Culling ---

func _esegui_culling() -> void:
	if _camera == null or not is_instance_valid(_camera):
		return
	var vista: Rect2 = _rect_visibile().grow(MARGINE_PX)
	_luci_attive = 0
	_luci_totali = 0
	for gruppo: Node2D in _gruppi:
		if is_instance_valid(gruppo):
			_culla_ricorsivo(gruppo, vista)
	_culla_chunks(vista)


## Rettangolo del mondo effettivamente inquadrato: viewport / zoom, centrato sulla camera.
func _rect_visibile() -> Rect2:
	var schermo: Vector2 = get_viewport_rect().size
	var estensione: Vector2 = Vector2(
		schermo.x / maxf(_camera.zoom.x, 0.01), schermo.y / maxf(_camera.zoom.y, 0.01)
	)
	return Rect2(_camera.global_position - estensione * 0.5, estensione)


func _culla_ricorsivo(nodo: Node, vista: Rect2) -> void:
	for figlio: Node in nodo.get_children():
		if figlio is PointLight2D:
			_culla_luce(figlio as PointLight2D, vista)
		elif figlio is Sprite2D and bool(figlio.get_meta("cullabile", false)):
			(figlio as Sprite2D).visible = vista.has_point((figlio as Sprite2D).global_position)
		_culla_ricorsivo(figlio, vista)


func _culla_luce(luce: PointLight2D, vista: Rect2) -> void:
	_luci_totali += 1
	if bool(luce.get_meta("visione", false)):
		_luci_attive += 1  # luce-vista di un PG: stato di gioco, mai spenta (vedi testata)
		return
	luce.enabled = vista.has_point(luce.global_position)
	if luce.enabled:
		_luci_attive += 1


## Tre anelli per i chunk: visibile (texture + visible), vicino (texture in VRAM ma nascosto),
## lontano (texture SCARICATA — il percorso resta, si ricarica al ritorno).
func _culla_chunks(vista: Rect2) -> void:
	if _chunks.is_empty():
		return
	var anello_scarico: Rect2 = _rect_visibile().grow(MARGINE_SCARICO_PX)
	for voce: Dictionary in _chunks:
		var sprite: Sprite2D = voce["sprite"]
		var rect: Rect2 = voce["rect"]
		if not anello_scarico.intersects(rect):
			sprite.visible = false
			sprite.texture = null  # via dalla VRAM: quel budget ora e' dell'LLM
			continue
		if sprite.texture == null:
			sprite.texture = _carica_texture(String(voce["percorso"]))
		sprite.visible = vista.intersects(rect)


func _carica_texture(percorso: String) -> Texture2D:
	var img: Image = Image.load_from_file(percorso)
	if img == null:
		push_warning("MapEngineOptimized: immagine non caricabile: " + percorso)
		return null
	return ImageTexture.create_from_image(img)
