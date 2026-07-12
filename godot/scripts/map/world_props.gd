class_name WorldProps
extends Node2D
## Layer dei PROPS del Mondo cucito: alberi, rocce, botti, falo'... piazzati DOVE VUOI.
##
## Modalita' "🌳 Props" attiva (dalla toolbar):
## - click sinistro su un punto vuoto  -> piazza il prop selezionato nella palette;
## - trascina un prop esistente        -> lo sposta (snap alla griglia se accesa);
## - click DESTRO su un prop           -> lo elimina.
## Il layout e' PERSISTENTE (user://world_props.json): sopravvive a ricariche e aggiornamenti.
##
## Le immagini vengono da DUE cartelle, come mappe e token:
## - user://props     — i render dell'utente (es. Blender: tools/blender/genera_props.py),
##                      hanno la precedenza a parita' di nome;
## - res://assets/props — gli 8 prop inclusi nel gioco.
## Sta sotto le ombre delle nuvole (che quindi accarezzano anche i props) e sotto la nebbia.

const SALVATAGGIO: String = "user://world_props.json"
const CARTELLA_UTENTE: String = "user://props"
const CARTELLA_PROGETTO: String = "res://assets/props"
# Prop "di fuoco": piazzarli accende ANCHE una PointLight2D vera nel punto — di notte il falo'
# scava una pozza di luce calda nel buio del CanvasModulate. Riconosciuti dal nome file.
const LUMINOSI: Array[String] = [
	"falo", "fuoco", "braciere", "lanterna", "torcia", "campfire", "lantern", "torch",
]
const LUCE_COLORE: Color = Color(1.0, 0.72, 0.35)
const LUCE_ENERGIA: float = 1.05
const LUCE_SCALA: float = 3.2   # texture radiale 256px -> raggio luce ~400px a scala prop 1.0
const SCALA_MIN: float = 0.4
const SCALA_MAX: float = 3.0
const PASSO_ROTAZIONE: float = 15.0  # gradi per pressione di R

## Lato cella per lo snap (0 = niente snap). Allineato alla griglia dalla WorldBuilder.
var cella: float = 0.0

var _rect: Rect2
var _camera: Camera2D
var _modalita: bool = false
var _selezionato: String = ""            # nome del prop scelto nella palette
var _catalogo: Dictionary = {}           # nome -> Texture2D (user:// vince sul progetto)
var _voci: Array[Dictionary] = []        # { "file", "pos": Vector2, "scala": float, "rot": float }
var _trascinato: int = -1
var _luci: Node2D                        # contenitore delle PointLight2D dei prop luminosi
var _texture_luce: GradientTexture2D


func configura(rect_mondo: Rect2, camera: Camera2D) -> void:
	_rect = rect_mondo
	_camera = camera
	_luci = Node2D.new()
	add_child(_luci)
	_carica_catalogo()
	_carica_layout()
	_sincronizza_luci()
	queue_redraw()


## Il catalogo per la palette della toolbar (nome -> texture), in ordine alfabetico.
func catalogo() -> Dictionary:
	return _catalogo


func imposta_modalita(attiva: bool) -> void:
	_modalita = attiva
	if not attiva:
		_trascinato = -1


func modalita() -> bool:
	return _modalita


func seleziona(nome: String) -> void:
	_selezionato = nome if _catalogo.has(nome) else ""


func _unhandled_input(event: InputEvent) -> void:
	if not _modalita:
		return
	var mb := event as InputEventMouseButton
	if mb != null:
		var punto: Vector2 = get_global_mouse_position()
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				_trascinato = _colpito(punto)
				if _trascinato < 0 and not _selezionato.is_empty():
					_piazza(_selezionato, punto)
			elif _trascinato >= 0:
				_voci[_trascinato]["pos"] = _snap(punto)
				_trascinato = -1
				_salva()
				_sincronizza_luci()
				queue_redraw()
			get_viewport().set_input_as_handled()
		elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			var idx: int = _colpito(punto)
			if idx >= 0:
				_voci.remove_at(idx)
				_salva()
				_sincronizza_luci()
				queue_redraw()
				get_viewport().set_input_as_handled()
		elif _trascinato >= 0 and mb.pressed and (mb.button_index == MOUSE_BUTTON_WHEEL_UP
				or mb.button_index == MOUSE_BUTTON_WHEEL_DOWN):
			# Rotella COL PROP IN MANO: lo scala (e ruba il colpo allo zoom della camera).
			var fattore: float = 1.1 if mb.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0 / 1.1
			_voci[_trascinato]["scala"] = clampf(
				float(_voci[_trascinato].get("scala", 1.0)) * fattore, SCALA_MIN, SCALA_MAX)
			queue_redraw()
			get_viewport().set_input_as_handled()
		return
	var mm := event as InputEventMouseMotion
	if mm != null and _trascinato >= 0:
		_voci[_trascinato]["pos"] = get_global_mouse_position()
		queue_redraw()
		get_viewport().set_input_as_handled()
		return
	var key := event as InputEventKey
	if key != null and key.pressed and not key.echo and key.keycode == KEY_R \
			and _trascinato >= 0:
		# R col prop in mano: ruota a scatti di 15 gradi.
		_voci[_trascinato]["rot"] = fmod(
			float(_voci[_trascinato].get("rot", 0.0)) + PASSO_ROTAZIONE, 360.0)
		queue_redraw()
		get_viewport().set_input_as_handled()


func _draw() -> void:
	for voce: Dictionary in _voci:
		var tex: Texture2D = _catalogo.get(String(voce["file"]))
		if tex == null:
			continue  # immagine sparita dal disco: la voce resta, tornera' col file
		var scala: float = float(voce.get("scala", 1.0))
		var rot: float = deg_to_rad(float(voce.get("rot", 0.0)))
		draw_set_transform(voce["pos"] as Vector2, rot, Vector2(scala, scala))
		draw_texture(tex, -tex.get_size() * 0.5)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _piazza(nome: String, punto: Vector2) -> void:
	_voci.append({
		"file": nome, "pos": _snap(punto.clamp(_rect.position, _rect.end)),
		"scala": 1.0, "rot": 0.0,
	})
	_salva()
	_sincronizza_luci()
	queue_redraw()


## Indice del prop il cui riquadro (scalato) contiene il punto, dall'ultimo disegnato in giu'.
func _colpito(punto: Vector2) -> int:
	for i: int in range(_voci.size() - 1, -1, -1):
		var tex: Texture2D = _catalogo.get(String(_voci[i]["file"]))
		if tex == null:
			continue
		var meta: Vector2 = tex.get_size() * 0.5 * float(_voci[i].get("scala", 1.0))
		if Rect2((_voci[i]["pos"] as Vector2) - meta, meta * 2.0).has_point(punto):
			return i
	return -1


## Una PointLight2D per ogni prop "di fuoco": ricostruite in blocco a ogni modifica del layout
## (sono pochi nodi). Il culling di MapEngineOptimized le spegne fuori inquadratura.
func _sincronizza_luci() -> void:
	if _luci == null:
		return
	for figlio: Node in _luci.get_children():
		figlio.queue_free()
	for voce: Dictionary in _voci:
		if not LUMINOSI.has(String(voce["file"]).to_lower()):
			continue
		var luce := PointLight2D.new()
		luce.texture = _texture_alone()
		luce.position = voce["pos"]
		luce.color = LUCE_COLORE
		luce.energy = LUCE_ENERGIA
		luce.texture_scale = LUCE_SCALA * float(voce.get("scala", 1.0))
		_luci.add_child(luce)


## Texture radiale dell'alone, generata UNA volta e condivisa da tutte le luci.
func _texture_alone() -> GradientTexture2D:
	if _texture_luce != null:
		return _texture_luce
	var grad := Gradient.new()
	grad.set_color(0, Color(1, 1, 1, 1))
	grad.set_color(1, Color(1, 1, 1, 0))
	_texture_luce = GradientTexture2D.new()
	_texture_luce.gradient = grad
	_texture_luce.fill = GradientTexture2D.FILL_RADIAL
	_texture_luce.fill_from = Vector2(0.5, 0.5)
	_texture_luce.fill_to = Vector2(0.5, 0.0)
	_texture_luce.width = 256
	_texture_luce.height = 256
	return _texture_luce


func _snap(p: Vector2) -> Vector2:
	if cella <= 0.0:
		return p
	var locale: Vector2 = p - _rect.position
	return _rect.position + Vector2(
		(floorf(locale.x / cella) + 0.5) * cella,
		(floorf(locale.y / cella) + 0.5) * cella
	)


# --- Catalogo (unione delle due cartelle) e persistenza del layout ---

func _carica_catalogo() -> void:
	_catalogo.clear()
	if not DirAccess.dir_exists_absolute(CARTELLA_UTENTE):
		DirAccess.make_dir_recursive_absolute(CARTELLA_UTENTE)
	# Prima il progetto, poi user://: a parita' di nome vince il file dell'utente.
	_aggiungi_cartella(CARTELLA_PROGETTO)
	_aggiungi_cartella(CARTELLA_UTENTE)


func _aggiungi_cartella(cartella: String) -> void:
	var dir: DirAccess = DirAccess.open(cartella)
	if dir == null:
		return
	for nome_file: String in dir.get_files():
		if nome_file.get_extension().to_lower() != "png":
			continue
		var nome: String = nome_file.get_basename()
		var percorso: String = cartella.path_join(nome_file)
		var tex: Texture2D = null
		if percorso.begins_with("res://") and ResourceLoader.exists(percorso):
			var risorsa: Resource = load(percorso)
			if risorsa is Texture2D:
				tex = risorsa
		else:
			var img: Image = Image.load_from_file(ProjectSettings.globalize_path(percorso))
			if img != null:
				tex = ImageTexture.create_from_image(img)
		if tex != null:
			_catalogo[nome] = tex


func _salva() -> void:
	var dati: Array = []
	for voce: Dictionary in _voci:
		var pos: Vector2 = voce["pos"]
		dati.append({
			"file": voce["file"], "x": pos.x, "y": pos.y,
			"scala": float(voce.get("scala", 1.0)), "rot": float(voce.get("rot", 0.0)),
		})
	var file: FileAccess = FileAccess.open(SALVATAGGIO, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(dati))


func _carica_layout() -> void:
	_voci.clear()
	if not FileAccess.file_exists(SALVATAGGIO):
		return
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(SALVATAGGIO))
	if dati is not Array:
		return
	for voce: Variant in dati:
		if voce is Dictionary and voce.has("file") and voce.has("x") and voce.has("y"):
			_voci.append({
				"file": String(voce["file"]),
				"pos": Vector2(float(voce["x"]), float(voce["y"])),
				"scala": float(voce.get("scala", 1.0)),
				"rot": float(voce.get("rot", 0.0)),
			})
