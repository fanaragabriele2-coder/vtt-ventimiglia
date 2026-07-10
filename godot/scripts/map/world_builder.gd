class_name WorldBuilder
extends Node2D
## Direttiva OMEGA — Ultra Map Stitcher & Visual Coherence Engine (open-world 2D locale).
##
## All'avvio (_ready) esegue le tre macro-funzioni della direttiva:
## 1. AUTO-STITCHING A GRIGLIA: scansiona res://assets/maps (png/jpg, ordine alfabetico) e cuce
##    le battlemap in una griglia PERFETTA — delega a MapEngineOptimized (gia' collaudato): cella
##    comune, chunk di formato diverso riscalati alla cella, zero intercapedini.
## 2. MOTORE DI COERENZA VISIVA: pacchetti diversi, un solo mondo.
##    - color grading via software: la media cromatica di ogni chunk (misurata su una miniatura
##      32x32) viene portata verso la media GLOBALE del set con self_modulate — micro-correzioni
##      (clamp 0.85..1.18): si bilanciano neri e mezzitoni senza stravolgere l'artwork;
##    - seam blending: UN ShaderMaterial condiviso fonde una banda sottile ai bordi di ogni chunk
##      verso un tono neutro comune — i due lati di ogni cucitura convergono allo stesso colore e
##      lo stacco si attenua (fondere davvero i vicini richiederebbe chunk sovrapposti);
##    - CanvasModulate globale per il ciclo giorno/tramonto/notte/dungeon (imposta_ora).
## 3. CHUNK CULLING HARDWARE-AWARE (target 6 GB di VRAM): riusa il ciclo a intervalli 0.15s di
##    MapEngineOptimized — fuori vista il chunk si nasconde, MOLTO lontano la sua texture lascia
##    proprio la VRAM (texture = null: l'ImageTexture muore di refcount, niente leak) e si
##    ricarica dal disco quando la camera torna vicina.
##
## NOTA EXPORT: le mappe si leggono come FILE grezzi (Image.load_from_file) — dall'editor
## funziona subito; in un progetto esportato vanno inclusi i *.png/jpg nei filtri di export.

const CARTELLA_MAPPE: String = "res://assets/maps"
const ESTENSIONI: Array[String] = ["png", "jpg", "jpeg"]
const CAMPIONE_PX: int = 32     # le statistiche cromatiche si misurano su una miniatura
const GRADING_MIN: float = 0.85  # micro-correzioni: mai stravolgere l'artwork originale
const GRADING_MAX: float = 1.18

## Il ciclo del giorno: tinte del CanvasModulate globale (tutti i chunk vi reagiscono insieme).
const ORE: Dictionary = {
	"giorno": Color(1.0, 1.0, 1.0),
	"tramonto": Color(1.0, 0.82, 0.62),
	"notte": Color(0.36, 0.41, 0.6),
	"dungeon": Color(0.55, 0.5, 0.45),
}

const SHADER_CUCITURE: String = """
shader_type canvas_item;
uniform float banda = 0.035;
uniform float forza = 0.35;
uniform vec4 tono : source_color = vec4(0.5, 0.47, 0.42, 1.0);
void fragment() {
	vec4 tex = texture(TEXTURE, UV);
	float bordo = min(min(UV.x, 1.0 - UV.x), min(UV.y, 1.0 - UV.y));
	float fusione = (1.0 - smoothstep(0.0, banda, bordo)) * forza;
	COLOR = vec4(mix(tex.rgb, tono.rgb, fusione), tex.a) * COLOR;
}
"""

var _motore: MapEngineOptimized
var _camera: VTTCamera
var _tinta: CanvasModulate
var _materiale_cuciture: ShaderMaterial
var _file_trovati: bool = false  # distingue "cartella vuota" da "file presenti ma non caricabili"
# one-shot: inquadra il mondo intero appena il viewport ha una dimensione reale.
var _da_inquadrare: bool = false
var _rect_mappa: Rect2


func _ready() -> void:
	_costruisci_ambiente()
	var chunks: Array[Sprite2D] = _cuci_mappe()
	if chunks.is_empty():
		# Se dei file erano presenti ma sono tutti falliti, _cuci_mappe() ha gia' spiegato il
		# motivo (formato/CMYK) file per file: qui si avvisa solo se la cartella era proprio vuota.
		if not _file_trovati:
			GameState.announce("🌍 Mondo: nessuna mappa trovata in %s — copia li' le tue "
				% CARTELLA_MAPPE + "battlemap PNG/JPG e riapri la vista.")
		return
	_uniforma_colori(chunks)
	# Inquadra tutta la mega-mappa: differito, perche' durante _ready il SubViewport puo' non avere
	# ancora una dimensione (la prende dal container dopo il layout). Un _process one-shot aspetta
	# il primo frame con viewport valido, cosi' l'apertura mostra SEMPRE il mondo intero.
	_rect_mappa = _motore.rettangolo_mappa()
	_da_inquadrare = true
	set_process(true)
	# Macro-funzione 3: culling + scarico VRAM, gia' collaudati in MapEngineOptimized.
	_motore.configura(_camera, [])
	GameState.announce(
		"🌍 Mondo cucito: %d mappe in griglia, coerenza visiva applicata." % chunks.size())


## One-shot: appena il SubViewport ha una dimensione reale, inquadra l'intera mega-mappa e si
## spegne (il culling continua per conto suo dentro MapEngineOptimized).
func _process(_delta: float) -> void:
	if not _da_inquadrare:
		set_process(false)
		return
	if get_viewport_rect().size.x <= 0.0:
		return  # viewport non ancora dimensionato: si riprova al prossimo frame
	_da_inquadrare = false
	_camera.imposta_limiti(_rect_mappa)
	_camera.adatta_a(_rect_mappa)
	set_process(false)


## Cambia l'ora del mondo ("giorno", "tramonto", "notte", "dungeon"): un'unica manopola globale,
## tutti i chunk reagiscono insieme via CanvasModulate.
func imposta_ora(nome: String) -> void:
	if not ORE.has(nome):
		return
	_tinta.color = ORE[nome]


func statistiche() -> Dictionary:
	return _motore.statistiche() if _motore != null else {}


# --- Macro-funzione 1: auto-stitching ---

func _cuci_mappe() -> Array[Sprite2D]:
	var out: Array[Sprite2D] = []
	var dir: DirAccess = DirAccess.open(CARTELLA_MAPPE)
	if dir == null:
		return out
	var nomi: Array[String] = []
	for nome_file: String in dir.get_files():
		if ESTENSIONI.has(nome_file.get_extension().to_lower()):
			nomi.append(nome_file)
	nomi.sort()  # ordine alfabetico = layout deterministico, riga per riga
	_file_trovati = not nomi.is_empty()
	if nomi.is_empty():
		return out  # "nessuna mappa trovata" lo annuncia gia' _ready()
	var colonne: int = maxi(1, ceili(sqrt(float(nomi.size()))))
	# I fallimenti di caricamento andavano prima solo in console (push_warning, invisibile a chi
	# gioca): ora finiscono anche in chat con nome del file, cosi' il motivo si legge in gioco.
	var falliti: PackedStringArray = []
	for i: int in range(nomi.size()):
		var riga: int = floori(float(i) / float(colonne))
		var sprite: Sprite2D = _motore.aggiungi_chunk(
			CARTELLA_MAPPE.path_join(nomi[i]), i % colonne, riga)
		if sprite != null:
			sprite.material = _materiale_cuciture  # seam blending, materiale CONDIVISO
			out.append(sprite)
		else:
			falliti.append(nomi[i])
	if not falliti.is_empty():
		GameState.announce(("🌍 Mondo: %d immagine/i non caricata/e (%s) — formato non " % [
			falliti.size(), ", ".join(falliti)])
			+ "supportato o file danneggiato. Causa piu' frequente: JPG salvato in CMYK "
			+ "invece che RGB (Godot legge solo JPG/PNG in RGB). Riesporta l'immagine come "
			+ "PNG o JPG standard (RGB) e riprova.")
	return out


# --- Macro-funzione 2: coerenza visiva ---

## Porta la media cromatica di ogni chunk verso la media globale del set: mappe di pacchetti
## diversi convergono allo stesso bilanciamento (neri e mezzitoni allineati), da micro-correzione.
func _uniforma_colori(chunks: Array[Sprite2D]) -> void:
	var medie: Array[Color] = []
	for sprite: Sprite2D in chunks:
		medie.append(_media_cromatica(sprite.texture))
	var bersaglio: Color = Color(0, 0, 0)
	for media: Color in medie:
		bersaglio += media
	bersaglio /= float(medie.size())
	for i: int in range(chunks.size()):
		chunks[i].self_modulate = _correzione(medie[i], bersaglio)


## Media RGB della texture, misurata su una miniatura (CAMPIONE_PX^2 letture, non milioni).
## Robusto: una texture importata puo' non restituire un'immagine leggibile (get_image null,
## compressa in un formato che decompress non gestisce, o vuota) — in quel caso si torna un grigio
## neutro (nessuna correzione), MAI un crash che lascerebbe il mondo nero.
func _media_cromatica(tex: Texture2D) -> Color:
	if tex == null:
		return Color(0.5, 0.5, 0.5)
	var img: Image = tex.get_image()
	if img == null:
		return Color(0.5, 0.5, 0.5)
	if img.is_compressed() and img.decompress() != OK:
		return Color(0.5, 0.5, 0.5)
	if img.get_width() == 0 or img.get_height() == 0:
		return Color(0.5, 0.5, 0.5)
	img.resize(CAMPIONE_PX, CAMPIONE_PX, Image.INTERPOLATE_BILINEAR)
	var somma: Color = Color(0, 0, 0)
	for y: int in range(CAMPIONE_PX):
		for x: int in range(CAMPIONE_PX):
			somma += img.get_pixel(x, y)
	return somma / float(CAMPIONE_PX * CAMPIONE_PX)


## Fattore di modulazione per-canale che avvicina `media` a `bersaglio`, entro i limiti "micro".
func _correzione(media: Color, bersaglio: Color) -> Color:
	return Color(
		clampf(bersaglio.r / maxf(media.r, 0.02), GRADING_MIN, GRADING_MAX),
		clampf(bersaglio.g / maxf(media.g, 0.02), GRADING_MIN, GRADING_MAX),
		clampf(bersaglio.b / maxf(media.b, 0.02), GRADING_MIN, GRADING_MAX),
		1.0
	)


# --- Costruzione ambiente (tinta globale, shader cuciture, camera) ---

func _costruisci_ambiente() -> void:
	_tinta = CanvasModulate.new()
	_tinta.color = ORE["giorno"]
	add_child(_tinta)

	var shader := Shader.new()
	shader.code = SHADER_CUCITURE
	_materiale_cuciture = ShaderMaterial.new()
	_materiale_cuciture.shader = shader

	_motore = MapEngineOptimized.new()
	add_child(_motore)

	_camera = VTTCamera.new()
	add_child(_camera)
