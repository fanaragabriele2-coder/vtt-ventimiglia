class_name OverworldMap
extends Control
## Overworld di Ventimiglia (vista città) — porting della mappa Leaflet reale (Modulo 12) e del
## ponte narrazione->POI (Modulo 39).
##
## Il monolite usava Leaflet con tile OpenStreetMap: qui, per restare un client Godot autosufficiente
## (nessuna dipendenza di rete per le tile), i POI con coordinate lat/lng REALI vengono normalizzati
## in coordinate schermo e disegnati su una mappa stilizzata (terra + mare Ligure a sud). Il party
## viaggia tra i POI col click; ogni spostamento aggiorna GameState (chiave "party.location"), cosi'
## chat, HUD e — in futuro — il Master IA leggono la stessa, unica posizione.

signal party_traveled(poi_name: String, poi: Dictionary)
## Un'imboscata casuale e' scattata durante la camminata: la vista deve passare alla mappa tattica.
signal encounter_triggered()

const POIS_PATH: String = "res://data/ventimiglia_pois.json"

# Colore per categoria di POI.
const CAT_COLORS: Dictionary = {
	"storico": Color(0.78, 0.61, 0.24),
	"civile": Color(0.44, 0.56, 0.69),
	"trasporti": Color(0.36, 0.72, 0.78),
	"natura": Color(0.36, 0.62, 0.27),
	"militare": Color(0.7, 0.23, 0.18),
}
const COL_LAND: Color = Color(0.09, 0.1, 0.08)
const COL_LAND_HI: Color = Color(0.12, 0.13, 0.1)
const COL_SEA: Color = Color(0.06, 0.12, 0.18)
const COL_ROAD: Color = Color(0.78, 0.61, 0.24, 0.14)
const COL_PARTY: Color = Color(0.94, 0.83, 0.53)

var _pois: Array[Dictionary] = []
var _lat_min: float = 0.0
var _lat_max: float = 0.0
var _lng_min: float = 0.0
var _lng_max: float = 0.0
var _current_index: int = 0
var _hovered_index: int = -1
var _pad: float = 40.0

# --- Modalita' "Campagna a piedi" (porting di js/12 VTTCampagna): invece del solo click-to-travel
# fra POI, il party si muove liberamente con WASD/frecce e la vicinanza a un POI ("zona") fa scattare
# l'arrivo da sola, con narrazione automatica — come il joystick+zone-detection del monolite. Niente
# tile reali/pan di camera qui (l'overworld resta stilizzata, come gia' documentato nel README): la
# mappa intera e' sempre visibile, cambia solo come ci si sposta dentro di essa.
const WALK_SPEED_PX: float = 140.0
const ZONE_RADIUS_PX: float = 42.0

# --- Incontri casuali durante la camminata: ogni ENCOUNTER_CHECK_SEC secondi di movimento attivo si
# tira una probabilita' di imboscata, piu' alta nelle zone selvatiche/militari che in quelle civili
# (tocco 5e: non e' lo stesso rischio ovunque). Il monolite faceva comparire nemici vicino al PG solo
# su comando del Master IA (VTTCampagna.spawnEnemyNearPg) — qui e' un'aggiunta autonoma del gioco.
const ENCOUNTER_CHECK_SEC: float = 5.0
const ENCOUNTER_CHANCE_PER_CAT: Dictionary = {
	"natura": 0.30, "militare": 0.30, "trasporti": 0.16, "storico": 0.12, "civile": 0.05,
}
const ENCOUNTER_CHANCE_DEFAULT: float = 0.12

var _walk_mode: bool = false
var _party_pixel_pos: Vector2 = Vector2.ZERO
var _last_zone_index: int = -1
var _walk_toggle_btn: Button
var _zone_chip: Label
var _encounter_timer: float = 0.0


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_STOP
	_load_pois()
	# Party di partenza: la Città Alta (o il primo POI).
	_current_index = _index_of("Città Alta")
	_publish_location()
	resized.connect(queue_redraw)
	_build_walk_controls()
	set_process(false)


func _load_pois() -> void:
	if not FileAccess.file_exists(POIS_PATH):
		push_warning("OverworldMap: POI non trovati: " + POIS_PATH)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(POIS_PATH))
	if not (parsed is Dictionary and parsed.has("pois")):
		return
	for entry: Variant in parsed["pois"]:
		if entry is Dictionary:
			_pois.append(entry)
	# Bounding box lat/lng per la normalizzazione in coordinate schermo.
	_lat_min = INF; _lat_max = -INF; _lng_min = INF; _lng_max = -INF
	for p: Dictionary in _pois:
		_lat_min = minf(_lat_min, float(p["lat"]))
		_lat_max = maxf(_lat_max, float(p["lat"]))
		_lng_min = minf(_lng_min, float(p["lng"]))
		_lng_max = maxf(_lng_max, float(p["lng"]))


func _index_of(poi_name: String) -> int:
	for i: int in range(_pois.size()):
		if String(_pois[i]["name"]) == poi_name:
			return i
	return 0


# --- Conversione lat/lng -> pixel (nord in alto) ---

func _latlng_to_pixel(lat: float, lng: float) -> Vector2:
	var w: float = maxf(1.0, size.x - _pad * 2.0)
	var h: float = maxf(1.0, size.y - _pad * 2.0)
	var nx: float = (lng - _lng_min) / maxf(0.0001, _lng_max - _lng_min)
	var ny: float = (_lat_max - lat) / maxf(0.0001, _lat_max - _lat_min)  # lat alta = alto
	return Vector2(_pad + nx * w, _pad + ny * h)


# --- Disegno ---

func _draw() -> void:
	# 1) Terra + fascia di mare a sud (le lat piu' basse = parte bassa dello schermo).
	draw_rect(Rect2(Vector2.ZERO, size), COL_LAND, true)
	var sea_top: float = size.y * 0.78
	draw_rect(Rect2(Vector2(0, sea_top), Vector2(size.x, size.y - sea_top)), COL_SEA, true)
	# Qualche macchia di terra piu' chiara per texture.
	for i: int in range(6):
		var cx: float = size.x * (0.12 + 0.14 * i)
		draw_circle(Vector2(cx, size.y * 0.32), size.x * 0.09, COL_LAND_HI)

	if _pois.is_empty():
		return

	# 2) Sentieri: collega ogni POI al centro storico (Città Alta) con linee tenui.
	var hub: Vector2 = _latlng_to_pixel(float(_pois[_index_of("Città Alta")]["lat"]), float(_pois[_index_of("Città Alta")]["lng"]))
	for p: Dictionary in _pois:
		draw_line(hub, _latlng_to_pixel(float(p["lat"]), float(p["lng"])), COL_ROAD, 1.0)

	# 3) Marker dei POI.
	var font: Font = ThemeDB.fallback_font
	for i: int in range(_pois.size()):
		var p: Dictionary = _pois[i]
		var pos: Vector2 = _latlng_to_pixel(float(p["lat"]), float(p["lng"]))
		var col: Color = CAT_COLORS.get(String(p["cat"]), Color.WHITE)
		var is_current: bool = i == _current_index
		var is_hover: bool = i == _hovered_index
		var r: float = 9.0 if (is_current or is_hover) else 6.0
		draw_circle(pos, r, col)
		draw_arc(pos, r, 0, TAU, 24, Color(0, 0, 0, 0.5), 1.5)
		# Etichetta solo per il POI corrente e quello sotto il mouse (anti-clutter).
		if is_current or is_hover:
			draw_string(font, pos + Vector2(-60, -14), String(p["name"]),
				HORIZONTAL_ALIGNMENT_CENTER, 120, 13, Color(0.9, 0.85, 0.72))

	# 4) Marker del party: in modalita' a piedi segue la posizione libera (WASD), altrimenti resta
	# ancorato al POI corrente (click-to-travel).
	var party_pos: Vector2 = _party_pixel_pos if _walk_mode else _latlng_to_pixel(float(_pois[_current_index]["lat"]), float(_pois[_current_index]["lng"]))
	draw_arc(party_pos, 14.0, 0, TAU, 32, COL_PARTY, 2.5)
	draw_arc(party_pos, 18.0, 0, TAU, 32, Color(COL_PARTY.r, COL_PARTY.g, COL_PARTY.b, 0.4), 1.5)

	# 5) Barra info in basso: nome + descrizione del POI corrente/hover.
	var info_index: int = _hovered_index if _hovered_index >= 0 else _current_index
	var p_info: Dictionary = _pois[info_index]
	var label: String = "%s  %s — %s" % [String(p_info["icon"]), String(p_info["name"]), String(p_info["desc"])]
	var bar := Rect2(Vector2(8, size.y - 30), Vector2(size.x - 16, 24))
	draw_rect(bar, Color(0, 0, 0, 0.55), true)
	draw_string(font, Vector2(16, size.y - 12), label, HORIZONTAL_ALIGNMENT_LEFT, size.x - 32, 13, Color(0.88, 0.82, 0.68))


# --- Modalita' "Campagna a piedi": pulsante toggle + movimento continuo + rilevamento zone ---

func _build_walk_controls() -> void:
	_walk_toggle_btn = Button.new()
	_walk_toggle_btn.text = "🚶 Modalità a piedi"
	_walk_toggle_btn.position = Vector2(10, 10)
	_walk_toggle_btn.custom_minimum_size = Vector2(0, 36)
	_walk_toggle_btn.pressed.connect(_toggle_walk_mode)
	add_child(_walk_toggle_btn)

	_zone_chip = Label.new()
	_zone_chip.position = Vector2(10, 50)
	_zone_chip.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	_zone_chip.add_theme_font_size_override("font_size", 13)
	_zone_chip.visible = false
	add_child(_zone_chip)


func _toggle_walk_mode() -> void:
	_walk_mode = not _walk_mode
	if _walk_mode:
		_party_pixel_pos = _latlng_to_pixel(float(_pois[_current_index]["lat"]), float(_pois[_current_index]["lng"]))
		_last_zone_index = _current_index
		_walk_toggle_btn.text = "🛑 Esci dalla modalità a piedi"
		_zone_chip.visible = true
		_zone_chip.text = "📍 " + String(_pois[_current_index]["name"])
		GameState.announce("🚶 Modalità a piedi attiva: usa WASD o le frecce per muoverti per Ventimiglia.")
	else:
		_walk_toggle_btn.text = "🚶 Modalità a piedi"
		_zone_chip.visible = false
	set_process(_walk_mode)
	queue_redraw()


func _process(delta: float) -> void:
	if not _walk_mode or not visible:
		return
	var dir := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
		dir.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
		dir.y += 1.0
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
		dir.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
		dir.x += 1.0
	if dir == Vector2.ZERO:
		return
	_party_pixel_pos += dir.normalized() * WALK_SPEED_PX * delta
	_party_pixel_pos.x = clampf(_party_pixel_pos.x, _pad, maxf(_pad, size.x - _pad))
	_party_pixel_pos.y = clampf(_party_pixel_pos.y, _pad, maxf(_pad, size.y - _pad))
	_check_zone()
	_update_encounter_timer(delta)
	queue_redraw()


## Ogni ENCOUNTER_CHECK_SEC secondi di camminata attiva, tira una probabilita' di imboscata (piu'
## alta nelle zone selvatiche/militari). Non tira nulla se un combattimento e' gia' in corso.
func _update_encounter_timer(delta: float) -> void:
	if CombatManager.is_active():
		return
	_encounter_timer += delta
	if _encounter_timer < ENCOUNTER_CHECK_SEC:
		return
	_encounter_timer = 0.0
	var categoria: String = String(_pois[_last_zone_index].get("cat", "")) if _last_zone_index >= 0 else ""
	var chance: float = float(ENCOUNTER_CHANCE_PER_CAT.get(categoria, ENCOUNTER_CHANCE_DEFAULT))
	if randf() < chance:
		_trigger_random_encounter()


## Fa comparire un piccolo gruppo di nemici casuali (scalati sul party dall'Encounter Balancer) e
## passa la mano alla mappa tattica: non si puo' restare a camminare durante un'imboscata.
func _trigger_random_encounter() -> void:
	var catalog: Array[Dictionary] = CombatManager.get_monster_catalog()
	if catalog.is_empty():
		return
	var pick: Dictionary = catalog[randi() % catalog.size()]
	var count: int = randi_range(1, 3)
	GameState.announce("⚔ Imboscata! Un gruppo di " + String(pick["name"]) + " emerge dall'ombra mentre attraversate Ventimiglia.")
	EncounterBalancer.spawn_bilanciato([{ "name": String(pick["name"]), "count": count }])
	_walk_mode = false
	_walk_toggle_btn.text = "🚶 Modalità a piedi"
	_zone_chip.visible = false
	set_process(false)
	encounter_triggered.emit()


## Rileva il POI piu' vicino alla posizione libera del party: se si entra in una zona nuova,
## l'arrivo scatta da solo (niente click), con narrazione automatica — porting di checkZones.
func _check_zone() -> void:
	var nearest: int = -1
	var nearest_dist: float = ZONE_RADIUS_PX
	for i: int in range(_pois.size()):
		var p: Dictionary = _pois[i]
		var d: float = _party_pixel_pos.distance_to(_latlng_to_pixel(float(p["lat"]), float(p["lng"])))
		if d < nearest_dist:
			nearest_dist = d
			nearest = i
	_zone_chip.text = ("📍 " + String(_pois[nearest]["name"])) if nearest >= 0 else "🧭 Tra i vicoli di Ventimiglia"
	if nearest >= 0 and nearest != _last_zone_index:
		_last_zone_index = nearest
		_current_index = nearest
		_publish_location()
		var p: Dictionary = _pois[nearest]
		GameState.announce("➜ Il party arriva a " + String(p["name"]) + ". " + String(p.get("desc", "")))
		party_traveled.emit(String(p["name"]), p)


# --- Input: hover + viaggio (click-to-travel, disattivo durante la modalita' a piedi) ---

func _gui_input(event: InputEvent) -> void:
	var mm := event as InputEventMouseMotion
	if mm != null:
		var idx: int = _poi_near(mm.position)
		if idx != _hovered_index:
			_hovered_index = idx
			queue_redraw()
		return
	if _walk_mode:
		return  # in modalita' a piedi ci si muove con WASD/frecce, non col click
	var mb := event as InputEventMouseButton
	if mb != null and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
		var idx: int = _poi_near(mb.position)
		if idx >= 0 and idx != _current_index:
			_travel_to(idx)


func _poi_near(pos: Vector2) -> int:
	var best: int = -1
	var best_dist: float = 18.0  # raggio di click/hover in pixel
	for i: int in range(_pois.size()):
		var p: Dictionary = _pois[i]
		var d: float = pos.distance_to(_latlng_to_pixel(float(p["lat"]), float(p["lng"])))
		if d < best_dist:
			best_dist = d
			best = i
	return best


func _travel_to(index: int) -> void:
	_current_index = index
	_last_zone_index = index
	_publish_location()
	var p: Dictionary = _pois[index]
	GameState.announce("➜ Il party si dirige verso " + String(p["name"]) + ". " + String(p.get("desc", "")))
	party_traveled.emit(String(p["name"]), p)
	queue_redraw()


func _publish_location() -> void:
	if _pois.is_empty():
		return
	var p: Dictionary = _pois[_current_index]
	# Unica fonte di verita' della posizione (GameState), come nel monolite (Modulo 36/39).
	GameState.set_party_location({ "name": String(p["name"]), "lat": float(p["lat"]), "lng": float(p["lng"]) })
	GameState.publish("party:moved", p)


## Sposta il party su un POI per nome (usato dal ponte chat->mappa: la narrazione del Master).
func travel_to_named(poi_name: String) -> bool:
	var idx: int = _index_of(poi_name)
	if idx == _current_index and String(_pois[idx]["name"]) != poi_name:
		return false
	_travel_to(idx)
	return true
