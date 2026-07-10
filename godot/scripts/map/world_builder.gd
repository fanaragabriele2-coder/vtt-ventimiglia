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
##
## DUE cartelle possibili, in ordine di priorita':
## 1. user://maps — FUORI dal progetto (nella cartella dati dell'utente del sistema operativo).
##    E' la scelta CONSIGLIATA: sostituire il progetto con una versione piu' recente (un nuovo
##    zip, un git pull...) non la tocca mai, quindi le mappe qui dentro sopravvivono per sempre
##    agli aggiornamenti del gioco. Creata automaticamente vuota al primo avvio; apri_cartella_
##    mappe() la apre nel file manager del sistema, senza percorsi da copiare a mano.
## 2. res://assets/maps — dentro il repository Git, per chi preferisce versionare le mappe col
##    progetto. Usata SOLO se user://maps non contiene immagini valide.
const CARTELLA_MAPPE_UTENTE: String = "user://maps"
const CARTELLA_MAPPE_PROGETTO: String = "res://assets/maps"
const ESTENSIONI: Array[String] = ["png", "jpg", "jpeg", "webp"]
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
var _cartella_attiva: String = CARTELLA_MAPPE_UTENTE  # quale delle due e' stata davvero usata
# one-shot: inquadra il mondo intero appena il viewport ha una dimensione reale.
var _da_inquadrare: bool = false
var _rect_mappa: Rect2


func _ready() -> void:
	_costruisci_ambiente()
	_assicura_cartella_utente()
	var chunks: Array[Sprite2D] = _cuci_mappe()
	if chunks.is_empty():
		# Se dei file erano presenti ma sono tutti falliti, _cuci_mappe() ha gia' spiegato il
		# motivo (formato/CMYK) file per file: qui si avvisa solo se ENTRAMBE le cartelle erano vuote.
		if not _file_trovati:
			GameState.announce(("🌍 Mondo: nessuna mappa trovata. TRASCINA le tue battlemap " +
				"(PNG/JPG/WebP) direttamente su questa finestra, oppure mettile in %s (pulsante " +
				"\"📁 Apri cartella mappe\") — cartella FUORI dal progetto: gli aggiornamenti " +
				"del gioco non la cancellano mai.") % percorso_cartella_utente())
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
	var da_dove: String = "user://maps (permanente)" if _cartella_attiva == CARTELLA_MAPPE_UTENTE \
		else "assets/maps del progetto"
	GameState.announce("🌍 Mondo cucito: %d mappe da %s, coerenza visiva applicata." % [
		chunks.size(), da_dove,
	])


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


## Crea user://maps se non esiste ancora: cosi' e' li' pronta da trovare (col pulsante "Apri
## cartella") anche PRIMA che l'utente ci abbia mai messo un file dentro.
func _assicura_cartella_utente() -> void:
	if not DirAccess.dir_exists_absolute(CARTELLA_MAPPE_UTENTE):
		DirAccess.make_dir_recursive_absolute(CARTELLA_MAPPE_UTENTE)


## Percorso reale sul disco di user://maps (per aprirla in Esplora File/Finder/Nautilus).
func percorso_cartella_utente() -> String:
	return ProjectSettings.globalize_path(CARTELLA_MAPPE_UTENTE)


## Apre la cartella mappe consigliata nel file manager del sistema operativo: zero percorsi da
## copiare o digitare a mano. Usato dal pulsante "📁 Apri cartella mappe" della toolbar.
## shell_show_in_file_manager (non il piu' generico shell_open, meno affidabile su alcune
## piattaforme per aprire una CARTELLA) e' l'API di Godot pensata apposta per questo.
func apri_cartella_mappe() -> void:
	OS.shell_show_in_file_manager(percorso_cartella_utente())


func cartella_attiva() -> String:
	return _cartella_attiva


## Re-inquadra l'INTERO mondo cucito (pulsante "🗺 Inquadra tutto"): dopo aver zoomato ed
## esplorato, un click riporta la vista d'insieme senza dover arretrare a colpi di rotellina.
func inquadra_mondo() -> void:
	if _rect_mappa.size == Vector2.ZERO:
		return  # nessuna mappa caricata: niente da inquadrare
	_camera.imposta_limiti(_rect_mappa)
	_camera.adatta_a(_rect_mappa)


## Importa in user://maps i file passati (percorsi ASSOLUTI del sistema operativo, tipicamente
## trascinati sulla finestra del gioco): copia solo le immagini con estensione supportata.
## Ritorna quanti file ha copiato davvero — chi chiama decide se ricostruire il mondo.
func importa_mappe(percorsi: PackedStringArray) -> int:
	_assicura_cartella_utente()
	var copiati: int = 0
	for percorso: String in percorsi:
		if not ESTENSIONI.has(percorso.get_extension().to_lower()):
			continue
		var destinazione: String = percorso_cartella_utente().path_join(percorso.get_file())
		if DirAccess.copy_absolute(percorso, destinazione) == OK:
			copiati += 1
		else:
			GameState.announce("🌍 Mondo: impossibile copiare \"%s\" nella cartella mappe."
				% percorso.get_file())
	return copiati


# --- Macro-funzione 1: auto-stitching ---

## user://maps ha priorita' (sopravvive agli aggiornamenti del gioco); si ripiega su
## res://assets/maps SOLO se la cartella utente non ha proprio nessuna immagine.
func _cuci_mappe() -> Array[Sprite2D]:
	var out: Array[Sprite2D] = _cuci_da_cartella(CARTELLA_MAPPE_UTENTE)
	if not out.is_empty() or _file_trovati:
		_cartella_attiva = CARTELLA_MAPPE_UTENTE
		return out
	out = _cuci_da_cartella(CARTELLA_MAPPE_PROGETTO)
	if not out.is_empty() or _file_trovati:
		_cartella_attiva = CARTELLA_MAPPE_PROGETTO
	return out


## Cuce tutte le immagini di UNA cartella (res:// o user://) in griglia. Imposta _file_trovati
## SOLO se trova almeno un nome file (distingue "cartella vuota" da "file presenti ma falliti").
func _cuci_da_cartella(cartella: String) -> Array[Sprite2D]:
	var out: Array[Sprite2D] = []
	var dir: DirAccess = DirAccess.open(cartella)
	if dir == null:
		return out
	var nomi: Array[String] = []
	for nome_file: String in dir.get_files():
		if ESTENSIONI.has(nome_file.get_extension().to_lower()):
			nomi.append(nome_file)
	nomi.sort()  # ordine alfabetico = layout deterministico, riga per riga
	if nomi.is_empty():
		return out
	_file_trovati = true
	var colonne: int = maxi(1, ceili(sqrt(float(nomi.size()))))
	# I fallimenti di caricamento andavano prima solo in console (push_warning, invisibile a chi
	# gioca): ora finiscono anche in chat con nome del file, cosi' il motivo si legge in gioco.
	var falliti: PackedStringArray = []
	for i: int in range(nomi.size()):
		var riga: int = floori(float(i) / float(colonne))
		var sprite: Sprite2D = _motore.aggiungi_chunk(cartella.path_join(nomi[i]), i % colonne, riga)
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
