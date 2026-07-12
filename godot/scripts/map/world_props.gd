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

## Lato cella per lo snap (0 = niente snap). Allineato alla griglia dalla WorldBuilder.
var cella: float = 0.0

var _rect: Rect2
var _camera: Camera2D
var _modalita: bool = false
var _selezionato: String = ""            # nome del prop scelto nella palette
var _catalogo: Dictionary = {}           # nome -> Texture2D (user:// vince sul progetto)
var _voci: Array[Dictionary] = []        # { "file": String, "pos": Vector2 }
var _trascinato: int = -1


func configura(rect_mondo: Rect2, camera: Camera2D) -> void:
	_rect = rect_mondo
	_camera = camera
	_carica_catalogo()
	_carica_layout()
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
				queue_redraw()
			get_viewport().set_input_as_handled()
		elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			var idx: int = _colpito(punto)
			if idx >= 0:
				_voci.remove_at(idx)
				_salva()
				queue_redraw()
				get_viewport().set_input_as_handled()
		return
	var mm := event as InputEventMouseMotion
	if mm != null and _trascinato >= 0:
		_voci[_trascinato]["pos"] = get_global_mouse_position()
		queue_redraw()
		get_viewport().set_input_as_handled()


func _draw() -> void:
	for voce: Dictionary in _voci:
		var tex: Texture2D = _catalogo.get(String(voce["file"]))
		if tex == null:
			continue  # immagine sparita dal disco: la voce resta, tornera' col file
		var meta: Vector2 = tex.get_size() * 0.5
		draw_texture(tex, (voce["pos"] as Vector2) - meta)


func _piazza(nome: String, punto: Vector2) -> void:
	_voci.append({ "file": nome, "pos": _snap(punto.clamp(_rect.position, _rect.end)) })
	_salva()
	queue_redraw()


## Indice del prop il cui riquadro contiene il punto (dall'ultimo disegnato), -1 se nessuno.
func _colpito(punto: Vector2) -> int:
	for i: int in range(_voci.size() - 1, -1, -1):
		var tex: Texture2D = _catalogo.get(String(_voci[i]["file"]))
		if tex == null:
			continue
		var meta: Vector2 = tex.get_size() * 0.5
		if Rect2((_voci[i]["pos"] as Vector2) - meta, tex.get_size()).has_point(punto):
			return i
	return -1


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
		dati.append({ "file": voce["file"], "x": pos.x, "y": pos.y })
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
			})
