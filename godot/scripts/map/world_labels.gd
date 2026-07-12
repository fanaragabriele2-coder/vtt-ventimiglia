class_name WorldLabels
extends Node2D
## Etichette dei LUOGHI sul Mondo cucito (nomi di villaggi, laghi, guadi...).
##
## Le voci vivono in un file `etichette.json` DENTRO la cartella mappe attiva — cosi' ogni set
## di mappe porta con se' i propri nomi (quelle incluse nel progetto hanno il loro file in
## assets/maps; per le tue mappe crea user://maps/etichette.json con lo stesso formato):
##   [ { "nome": "Villaggio di Confine", "x": 1536, "y": 1430 }, ... ]
## Coordinate in PIXEL della mappa cucita (origine in alto a sinistra del mondo).
## Le etichette stanno SOTTO la nebbia (z piu' basso): i nomi si scoprono esplorando.

const FILE_NOME: String = "etichette.json"
const DIM_MONDO: float = 64.0     # corpo del testo in pixel-mondo...
const DIM_SCHERMO_MIN: float = 15.0  # ...ma mai sotto questa dimensione su schermo

var _camera: Camera2D
var _voci: Array[Dictionary] = []
var _ultimo_zoom: float = 0.0


func configura(camera: Camera2D) -> void:
	_camera = camera
	set_process(true)


## Legge etichette.json dalla cartella indicata (res:// o user://). Ritorna quante voci valide.
func carica(cartella: String) -> int:
	_voci.clear()
	var percorso: String = cartella.path_join(FILE_NOME)
	if FileAccess.file_exists(percorso):
		var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(percorso))
		if dati is Array:
			for voce: Variant in dati:
				if voce is Dictionary and voce.has("nome") and voce.has("x") and voce.has("y"):
					_voci.append({
						"nome": String(voce["nome"]),
						"pos": Vector2(float(voce["x"]), float(voce["y"])),
					})
	queue_redraw()
	return _voci.size()


func _process(_delta: float) -> void:
	if _voci.is_empty() or _camera == null:
		return
	if not is_equal_approx(_camera.zoom.x, _ultimo_zoom):
		_ultimo_zoom = _camera.zoom.x
		queue_redraw()


func _draw() -> void:
	if _voci.is_empty() or _camera == null:
		return
	var font: Font = ThemeDB.fallback_font
	var zoom: float = maxf(_camera.zoom.x, 0.01)
	var dim: int = int(maxf(DIM_MONDO, DIM_SCHERMO_MIN / zoom))
	var mezza: float = dim * 6.0
	for voce: Dictionary in _voci:
		var pos: Vector2 = voce["pos"]
		var nome: String = voce["nome"]
		var ombra: float = maxf(2.0, dim * 0.04)
		draw_string(font, pos + Vector2(-mezza + ombra, ombra), nome,
			HORIZONTAL_ALIGNMENT_CENTER, mezza * 2.0, dim, Color(0, 0, 0, 0.8))
		draw_string(font, pos + Vector2(-mezza, 0), nome,
			HORIZONTAL_ALIGNMENT_CENTER, mezza * 2.0, dim, Color(0.92, 0.86, 0.7))
