class_name ItemArt
extends RefCounted
## Risolutore della FIGURA di un oggetto: dato l'id del catalogo ("longsword", "l-stella-serena")
## trova l'icona giusta, con questa priorita' (la stessa idea di TokenArt):
## 1. user://items/<id>.png — la TUA icona col nome esatto: fuori dal progetto, vince su tutto;
## 2. res://assets/items/<id>.png — le icone incluse (generate da tools/genera_icone_oggetti.py);
## 3. null — chi disegna fa fallback (niente icona, solo il nome; zero crash).
##
## Le incluse si leggono PRIMA come risorsa (in editor c'e' la cache d'import) e poi come FILE
## GREZZO (Image.load_from_file): cosi' si vedono anche in un progetto appena estratto da uno zip,
## senza i .import — la stessa lezione imparata sui token. Cache statica per sessione.

const CARTELLA_UTENTE: String = "user://items"
const CARTELLA_PROGETTO: String = "res://assets/items"

static var _cache: Dictionary = {}
static var _cartella_pronta: bool = false


## Texture dell'oggetto per id di catalogo, o null se non c'e' figura per lui.
static func per_id(catalog_id: String) -> Texture2D:
	var chiave: String = catalog_id.strip_edges()
	if chiave.is_empty():
		return null
	if _cache.has(chiave):
		return _cache[chiave]
	var tex: Texture2D = _carica_utente(chiave)
	if tex == null:
		tex = _carica_inclusa(chiave)
	_cache[chiave] = tex  # anche i null: un file assente non va ricercato a ogni frame
	return tex


## Svuota la cache (dopo aver copiato nuove icone in user://items a gioco acceso).
static func azzera_cache() -> void:
	_cache.clear()


static func _carica_utente(id: String) -> Texture2D:
	_assicura_cartella()
	return _carica_grezzo(CARTELLA_UTENTE.path_join(id + ".png"))


static func _carica_inclusa(id: String) -> Texture2D:
	var progetto: String = CARTELLA_PROGETTO.path_join(id + ".png")
	if ResourceLoader.exists(progetto):
		var risorsa: Resource = load(progetto)
		if risorsa is Texture2D:
			return risorsa
	return _carica_grezzo(progetto)


## Lettura RAW di un PNG (immune al sistema d'import): globalize + Image.load_from_file.
static func _carica_grezzo(percorso: String) -> Texture2D:
	if not FileAccess.file_exists(percorso):
		return null
	var img: Image = Image.load_from_file(ProjectSettings.globalize_path(percorso))
	return ImageTexture.create_from_image(img) if img != null else null


static func _assicura_cartella() -> void:
	if not _cartella_pronta:
		if not DirAccess.dir_exists_absolute(CARTELLA_UTENTE):
			DirAccess.make_dir_recursive_absolute(CARTELLA_UTENTE)
		_cartella_pronta = true
