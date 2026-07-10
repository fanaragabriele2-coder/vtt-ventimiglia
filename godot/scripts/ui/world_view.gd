class_name WorldView
extends Control
## Vista "🌍 Mondo" — incapsula il WorldBuilder (open-world cucito dalle battlemap dell'utente)
## in un SubViewport con la camera VTT (pan col destro, zoom sulla rotellina), come NexusView.
## In alto una mini-toolbar per il ciclo del giorno (CanvasModulate globale del mondo), per aprire
## la cartella delle mappe nel file manager, e per ricaricare dopo aver aggiunto/tolto immagini.
##
## DRAG & DROP: trascina i file immagine (png/jpg/webp) direttamente sulla finestra del gioco
## mentre questa vista e' aperta — vengono copiati in user://maps e il mondo si ricostruisce da
## solo. Zero file manager, zero percorsi: il modo piu' semplice di aggiungere battlemap.

const ORE_BOTTONI: Array[Array] = [
	["☀ Giorno", "giorno"], ["🌇 Tramonto", "tramonto"],
	["🌙 Notte", "notte"], ["🕯 Dungeon", "dungeon"],
]
# Il pulsante griglia CICLA tra questi lati di cella (pixel-mappa); 0 = spenta.
const CELLE_GRIGLIA: Array[float] = [0.0, 64.0, 128.0, 256.0]

var _viewport: SubViewport
var _builder: WorldBuilder
var _minimap: WorldMinimap
var _griglia_btn: Button
var _griglia_idx: int = 0  # lo stato vive QUI: sopravvive alla ricreazione del builder


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	_build_viewport()
	_build_toolbar()
	_build_minimap()
	# files_dropped vive sulla Window (la vista puo' essere ricreata, la finestra no): connesso
	# qui e scollegato in _exit_tree, con guardia di visibilita' dentro il gestore — i drop
	# valgono solo quando il Mondo cucito e' la vista attiva.
	get_window().files_dropped.connect(_su_file_trascinati)


func _exit_tree() -> void:
	var finestra: Window = get_window()
	if finestra != null and finestra.files_dropped.is_connected(_su_file_trascinati):
		finestra.files_dropped.disconnect(_su_file_trascinati)


func _build_viewport() -> void:
	var container := SubViewportContainer.new()
	container.stretch = true
	container.set_anchors_preset(Control.PRESET_FULL_RECT)
	container.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(container)

	_viewport = SubViewport.new()
	_viewport.handle_input_locally = true
	_viewport.gui_disable_input = false
	_viewport.transparent_bg = false
	container.add_child(_viewport)

	_builder = WorldBuilder.new()
	_viewport.add_child(_builder)


func _build_toolbar() -> void:
	var panel := PanelContainer.new()
	panel.position = Vector2(8, 8)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.045, 0.9)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 8
	sb.content_margin_right = 8
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", sb)
	add_child(panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	panel.add_child(row)
	var titolo := Label.new()
	titolo.text = "🌍 Mondo:"
	titolo.add_theme_color_override("font_color", Color(0.78, 0.61, 0.24))
	row.add_child(titolo)
	for voce: Array in ORE_BOTTONI:
		var b := Button.new()
		b.text = String(voce[0])
		b.custom_minimum_size = Vector2(0, 34)
		# Passa dal wrapper (non da _builder.imposta_ora diretto): dopo un "Ricarica mappe" il
		# builder viene ricreato, e un Callable legato all'istanza VECCHIA fallirebbe (nodo libero).
		b.pressed.connect(_on_ora_pressed.bind(String(voce[1])))
		row.add_child(b)

	var apri_cartella := Button.new()
	apri_cartella.text = "📁 Apri cartella mappe"
	apri_cartella.tooltip_text = "Apre user://maps nel file manager: metti li' le tue " \
		+ "battlemap, non vengono MAI cancellate dagli aggiornamenti del gioco."
	apri_cartella.custom_minimum_size = Vector2(0, 34)
	apri_cartella.pressed.connect(_su_apri_cartella)
	row.add_child(apri_cartella)

	var rigenera := Button.new()
	rigenera.text = "🔄 Ricarica mappe"
	rigenera.tooltip_text = "Rilegge la cartella dopo aver aggiunto/tolto immagini."
	rigenera.custom_minimum_size = Vector2(0, 34)
	rigenera.pressed.connect(_su_ricarica)
	row.add_child(rigenera)

	var inquadra := Button.new()
	inquadra.text = "🗺 Inquadra tutto"
	inquadra.tooltip_text = "Riporta la camera a inquadrare l'intero mondo cucito."
	inquadra.custom_minimum_size = Vector2(0, 34)
	inquadra.pressed.connect(_su_inquadra)
	row.add_child(inquadra)

	_griglia_btn = Button.new()
	_griglia_btn.text = "▦ Griglia: OFF"
	_griglia_btn.tooltip_text = "Griglia da battaglia sopra il mondo: cicla OFF → 64 → 128 → " \
		+ "256 px per cella. Si nasconde da sola quando lo zoom e' troppo lontano."
	_griglia_btn.custom_minimum_size = Vector2(0, 34)
	_griglia_btn.pressed.connect(_su_griglia)
	row.add_child(_griglia_btn)


## Minimappa in basso a destra: miniatura del mondo intero + rettangolo dell'inquadratura,
## click per teletrasportare la camera. Ri-agganciata a ogni ricostruzione del builder.
func _build_minimap() -> void:
	_minimap = WorldMinimap.new()
	add_child(_minimap)
	_aggancia_minimap()


func _aggancia_minimap() -> void:
	_minimap.configura(_builder.minimappa_texture(), _builder.rettangolo(), _builder.camera_vtt())
	_minimap.set_anchors_and_offsets_preset(
		Control.PRESET_BOTTOM_RIGHT, Control.PRESET_MODE_KEEP_SIZE, 10
	)


func _on_ora_pressed(nome: String) -> void:
	_builder.imposta_ora(nome)


func _su_apri_cartella() -> void:
	_builder.apri_cartella_mappe()


func _su_inquadra() -> void:
	_builder.inquadra_mondo()


func _su_griglia() -> void:
	_griglia_idx = (_griglia_idx + 1) % CELLE_GRIGLIA.size()
	var cella: float = CELLE_GRIGLIA[_griglia_idx]
	_griglia_btn.text = "▦ Griglia: OFF" if cella <= 0.0 else "▦ Griglia: %d" % int(cella)
	_builder.imposta_griglia(cella)


## File trascinati sulla finestra del gioco: se questa vista e' quella attiva, le immagini valide
## vengono copiate in user://maps e il mondo si ricuce da solo. La guardia di visibilita' evita
## che un drop fatto in un'altra vista (Nexus, scheda PG...) importi mappe di nascosto.
func _su_file_trascinati(percorsi: PackedStringArray) -> void:
	if not is_visible_in_tree():
		return
	var copiati: int = _builder.importa_mappe(percorsi)
	if copiati == 0:
		GameState.announce("🌍 Mondo: nessun file immagine valido tra quelli trascinati "
			+ "(formati supportati: png, jpg, webp).")
		return
	GameState.announce("🌍 Mondo: %d mappa/e importata/e — ricucio il mondo..." % copiati)
	_su_ricarica()


## Dopo aver aggiunto/tolto file dalla cartella mappe, ricostruisce il mondo da zero (nuovo nodo
## WorldBuilder nello stesso SubViewport) senza dover chiudere e riaprire tutta la vista.
func _su_ricarica() -> void:
	_builder.queue_free()
	_builder = WorldBuilder.new()
	_viewport.add_child(_builder)  # add_child esegue il _ready del builder QUI, in modo sincrono
	# Il nuovo builder parte "nudo": si ri-applica lo stato che vive nella vista (griglia) e si
	# ri-aggancia la minimappa alla sua nuova miniatura/camera.
	if CELLE_GRIGLIA[_griglia_idx] > 0.0:
		_builder.imposta_griglia(CELLE_GRIGLIA[_griglia_idx])
	_aggancia_minimap()
