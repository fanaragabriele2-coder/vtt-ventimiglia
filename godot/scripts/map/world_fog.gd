class_name WorldFog
extends Node2D
## Fog of war del Mondo cucito: il mondo parte coperto da una coltre scura e si SCOPRE
## esplorando — spostare un token del party rivela l'area attorno al punto di arrivo.
##
## Com'e' fatta per pesare NIENTE:
## - la maschera e' un'Image a 1/16 della risoluzione del mondo (un mondo 3072x3072 fa una
##   maschera 192x192) disegnata su un unico Sprite2D scalato: il filtro lineare della GPU
##   ammorbidisce i bordi gratis;
## - la rivelazione scrive i pixel SOLO nel rettangolo del cerchio toccato (poche migliaia
##   di operazioni per spostamento, non milioni);
## - l'ESPLORATO E' PERSISTENTE: la maschera si salva come PNG in user:// (si ricarica solo
##   se le dimensioni del mondo coincidono ancora; cancella il file per azzerarla).

const SCALA: int = 16
const FILE_SALVATAGGIO: String = "user://world_fog.png"
const ALPHA_COPERTO: float = 0.88
const RAGGIO_RIVELA: float = 620.0     # pixel-mondo: ~5 celle di visione attorno al token
const COLORE_COLTRE: Color = Color(0.02, 0.02, 0.05)

var _img: Image
var _tex: ImageTexture
var _sprite: Sprite2D
var _rect: Rect2
var _attiva: bool = false
var _da_salvare: bool = false


func configura(rect_mondo: Rect2) -> void:
	_rect = rect_mondo
	var larg: int = maxi(1, ceili(rect_mondo.size.x / float(SCALA)))
	var alt: int = maxi(1, ceili(rect_mondo.size.y / float(SCALA)))
	_img = _carica_salvata(larg, alt)
	if _img == null:
		_img = Image.create(larg, alt, false, Image.FORMAT_RGBA8)
		_img.fill(Color(COLORE_COLTRE.r, COLORE_COLTRE.g, COLORE_COLTRE.b, ALPHA_COPERTO))
	_tex = ImageTexture.create_from_image(_img)
	_sprite = Sprite2D.new()
	_sprite.texture = _tex
	_sprite.centered = false
	_sprite.position = rect_mondo.position
	_sprite.scale = Vector2(SCALA, SCALA)
	_sprite.visible = false
	add_child(_sprite)


func imposta_attiva(valore: bool) -> void:
	_attiva = valore
	if _sprite != null:
		_sprite.visible = valore


func attiva() -> bool:
	return _attiva


## Dirada la coltre attorno a un punto del mondo: cerchio pieno al centro, sfumato sul bordo.
## La nebbia RICORDA: una zona rivelata resta rivelata (si tiene sempre l'alpha minore).
func rivela(punto_mondo: Vector2) -> void:
	if _img == null:
		return
	var centro: Vector2 = (punto_mondo - _rect.position) / float(SCALA)
	var raggio: float = RAGGIO_RIVELA / float(SCALA)
	var x0: int = maxi(0, int(centro.x - raggio))
	var x1: int = mini(_img.get_width() - 1, int(centro.x + raggio) + 1)
	var y0: int = maxi(0, int(centro.y - raggio))
	var y1: int = mini(_img.get_height() - 1, int(centro.y + raggio) + 1)
	for y: int in range(y0, y1 + 1):
		for x: int in range(x0, x1 + 1):
			var dist: float = Vector2(float(x) + 0.5, float(y) + 0.5).distance_to(centro)
			if dist > raggio:
				continue
			# Dentro il 70% del raggio: tutto chiaro; da li' al bordo: dissolvenza morbida.
			var velo: float = ALPHA_COPERTO * clampf((dist / raggio - 0.7) / 0.3, 0.0, 1.0)
			var attuale: Color = _img.get_pixel(x, y)
			if velo < attuale.a:
				attuale.a = velo
				_img.set_pixel(x, y, attuale)
	_tex.update(_img)
	_da_salvare = true


## Scrive la maschera su disco (chiamata all'uscita dalla scena; economica: e' un PNG 192px).
func salva() -> void:
	if _img != null and _da_salvare:
		_img.save_png(FILE_SALVATAGGIO)
		_da_salvare = false


func _exit_tree() -> void:
	salva()


## Riusa la maschera salvata SOLO se il mondo ha ancora le stesse dimensioni (un set di mappe
## diverso = mondo diverso = si riparte coperti; cancellare il file azzera l'esplorato).
func _carica_salvata(larg: int, alt: int) -> Image:
	if not FileAccess.file_exists(FILE_SALVATAGGIO):
		return null
	var img: Image = Image.load_from_file(
		ProjectSettings.globalize_path(FILE_SALVATAGGIO))
	if img == null or img.get_width() != larg or img.get_height() != alt:
		return null
	img.convert(Image.FORMAT_RGBA8)
	return img
