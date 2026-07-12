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


## Trova l'etichetta che meglio corrisponde a un nome narrato ("il guado", "Lago Chiaro"...):
## match esatto normalizzato, altrimenti contenimento a parole (vince il nome piu' lungo).
## Ritorna la voce { "nome", "pos" } o un Dictionary vuoto.
func trova(nome: String) -> Dictionary:
	var cercato: String = _normalizza(nome)
	if cercato.is_empty():
		return {}
	var migliore: Dictionary = {}
	var migliore_lunghezza: int = 0
	for voce: Dictionary in _voci:
		var candidato: String = _normalizza(String(voce["nome"]))
		if candidato == cercato:
			return voce
		if candidato.length() <= migliore_lunghezza:
			continue
		var imbottito_c: String = " " + cercato + " "
		var imbottito_v: String = " " + candidato + " "
		if imbottito_c.contains(" " + candidato + " ") or imbottito_v.contains(" " + cercato + " "):
			migliore_lunghezza = candidato.length()
			migliore = voce
	return migliore


## L'etichetta piu' vicina al punto entro `raggio` pixel-mondo (vuoto se nessuna): serve a
## capire "in che luogo" e' appena arrivato un token del party.
func piu_vicina(punto: Vector2, raggio: float) -> Dictionary:
	var migliore: Dictionary = {}
	var migliore_distanza: float = raggio
	for voce: Dictionary in _voci:
		var distanza: float = (voce["pos"] as Vector2).distance_to(punto)
		if distanza <= migliore_distanza:
			migliore_distanza = distanza
			migliore = voce
	return migliore


## Minuscolo, accenti ridotti, tutto cio' che non e' alfanumerico -> spazio singolo.
func _normalizza(testo: String) -> String:
	var s: String = testo.to_lower()
	var accenti: Dictionary = {
		"à": "a", "á": "a", "è": "e", "é": "e", "ì": "i", "í": "i",
		"ò": "o", "ó": "o", "ù": "u", "ú": "u",
	}
	for k: String in accenti:
		s = s.replace(k, accenti[k])
	var pulito: String = ""
	for i: int in range(s.length()):
		var ch: String = s[i]
		pulito += ch if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") else " "
	while pulito.contains("  "):
		pulito = pulito.replace("  ", " ")
	return pulito.strip_edges()


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
