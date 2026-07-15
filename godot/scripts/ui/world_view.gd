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
##
## SET: il menu a tendina "Mondo/Castello/Banca/Terra di Mezzo" cambia cartella e ricostruisce
## il builder. I set inclusi (assets/maps_castello, assets/maps_banca, assets/maps_terra_di_mezzo)
## sono AUTOSUFFICIENTI — ignorano user://maps — con le proprie etichette dei luoghi (WorldLabels
## le carica da sole per cartella).
##
## CAMPAGNA: il secondo menu a tendina sceglie l'arco narrativo (CampaignDirector.imposta_campagna).
## Cambiare campagna alliena in automatico il Set giusto (evento "campagna:cambiata" di GameState).

const ORE_BOTTONI: Array[Array] = [
	["☀ Giorno", "giorno"], ["🌇 Tramonto", "tramonto"],
	["🌙 Notte", "notte"], ["🕯 Dungeon", "dungeon"],
]
# Il pulsante griglia CICLA tra questi lati di cella (pixel-mappa); 0 = spenta.
const CELLE_GRIGLIA: Array[float] = [0.0, 64.0, 128.0, 256.0]
# Selettore di set: nome in toolbar -> cartella forzata ("" = Mondo cucito normale, user://maps
# con fallback assets/maps). I dungeon sono bundled nel progetto, pronti all'uso.
const SET_CARTELLE: Array[Array] = [
	["🌍 Mondo", ""],
	["🏰 Castello", "res://assets/maps_castello"],
	["🏦 Banca", "res://assets/maps_banca"],
	["🧙 Terra di Mezzo", "res://assets/maps_terra_di_mezzo"],
]

## Vignettatura cinematografica + grana di pellicola leggerissima, sopra il viewport del mondo.
## E' un overlay passivo (mouse_filter IGNORE): non tocca input, camera o culling.
const SHADER_VIGNETTA: String = """
shader_type canvas_item;
uniform float forza = 0.34;
uniform float grana = 0.05;
void fragment() {
	float v = smoothstep(0.42, 0.98, length(UV - 0.5) * 1.42);
	float g = (fract(sin(dot(UV + fract(TIME * 7.0), vec2(12.9898, 78.233)))
		* 43758.5453) - 0.5) * grana;
	COLOR = vec4(vec3(g * 0.6), v * forza + abs(g) * 0.4);
}
"""

var _viewport: SubViewport
var _builder: WorldBuilder
var _minimap: WorldMinimap
var _griglia_btn: Button
var _righello_btn: Button
var _props_btn: Button
var _set_option: OptionButton
var _campagna_option: OptionButton
var _viaggia_option: OptionButton
var _dadi_btn: Button
var _travel_panel: TravelPanel
var _palette: PanelContainer
var _palette_row: HBoxContainer
# Lo stato dei comandi vive QUI (non nel builder): sopravvive a ogni "Ricarica mappe".
var _griglia_idx: int = 0
var _righello_on: bool = false
var _nebbia_on: bool = false
var _props_on: bool = false
var _set_idx: int = 0


func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	_build_viewport()
	_build_toolbar()
	_build_palette()
	_build_minimap()
	_build_travel_panel()
	_popola_viaggio()
	# files_dropped vive sulla Window (la vista puo' essere ricreata, la finestra no): connesso
	# qui e scollegato in _exit_tree, con guardia di visibilita' dentro il gestore — i drop
	# valgono solo quando il Mondo cucito e' la vista attiva.
	get_window().files_dropped.connect(_su_file_trascinati)
	GameState.event_published.connect(_su_evento_globale)


func _exit_tree() -> void:
	var finestra: Window = get_window()
	if finestra != null and finestra.files_dropped.is_connected(_su_file_trascinati):
		finestra.files_dropped.disconnect(_su_file_trascinati)
	if GameState.event_published.is_connected(_su_evento_globale):
		GameState.event_published.disconnect(_su_evento_globale)


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

	# Vignetta + grana SOPRA il SubViewportContainer ma FUORI dal SubViewport: non entra nel
	# mondo (niente interferenze con culling/zoom), e' solo un velo da regia sul vetro.
	var vignetta := ColorRect.new()
	vignetta.set_anchors_preset(Control.PRESET_FULL_RECT)
	vignetta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader := Shader.new()
	shader.code = SHADER_VIGNETTA
	var mat := ShaderMaterial.new()
	mat.shader = shader
	vignetta.material = mat
	add_child(vignetta)


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

	_viaggia_option = OptionButton.new()
	_viaggia_option.custom_minimum_size = Vector2(150, 34)
	_viaggia_option.tooltip_text = "Viaggia a dadi verso un luogo del mondo: la mappa calcola " \
		+ "distanza e tappe, e il party avanza SOLO tirando il dado (pulsante Marcia)."
	_viaggia_option.item_selected.connect(_su_viaggia_selezionato)
	row.add_child(_viaggia_option)

	_dadi_btn = Button.new()
	_dadi_btn.toggle_mode = true
	_dadi_btn.button_pressed = TravelDirector.abilitato
	_dadi_btn.text = "🎲 Viaggio a dadi: ON"
	_dadi_btn.tooltip_text = "Quando il Master vi fa spostare, il party marcia tirando il dado " \
		+ "(distanza calcolata dalla mappa). Spegni per il viaggio immediato."
	_dadi_btn.custom_minimum_size = Vector2(0, 34)
	_dadi_btn.toggled.connect(_su_dadi_toggle)
	row.add_child(_dadi_btn)

	_set_option = OptionButton.new()
	for voce: Array in SET_CARTELLE:
		_set_option.add_item(String(voce[0]))
	_set_option.custom_minimum_size = Vector2(130, 34)
	_set_option.tooltip_text = "Scegli quale mondo cucire: il Mondo (le tue mappe/quello " \
		+ "incluso) o uno dei dungeon pronti — Castello o Banca del Drago d'Oro."
	_set_option.item_selected.connect(_su_set_selezionato)
	row.add_child(_set_option)

	_campagna_option = OptionButton.new()
	for voce: Dictionary in CampaignDirector.campagne_disponibili():
		_campagna_option.add_item(String(voce["titolo"]))
	_campagna_option.custom_minimum_size = Vector2(170, 34)
	_campagna_option.tooltip_text = "Scegli l'arco narrativo da giocare: cambiarlo alliena " \
		+ "in automatico il Set di mappe giusto (il progresso di ogni campagna resta separato)."
	_campagna_option.selected = _indice_campagna(CampaignDirector.campagna_attuale_id())
	_campagna_option.item_selected.connect(_su_campagna_selezionata)
	row.add_child(_campagna_option)

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

	var apri_token := Button.new()
	apri_token.text = "🎭 Cartella token"
	apri_token.tooltip_text = "Apre user://tokens: metti qui i TUOI ritratti (PNG con nome " \
		+ "<id>.png, es. balrog.png) e sostituiscono i distintivi inclusi. Vedi il README " \
		+ "in assets/tokens per la lista completa dei nomi file."
	apri_token.custom_minimum_size = Vector2(0, 34)
	apri_token.pressed.connect(_su_apri_token)
	row.add_child(apri_token)

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

	_righello_btn = Button.new()
	_righello_btn.text = "📏 Righello"
	_righello_btn.toggle_mode = true
	_righello_btn.tooltip_text = "Misura le distanze: click-e-trascina col sinistro. " \
		+ "1 cella = 1,5 m (D&D 5e). Mentre e' attivo i token non si trascinano."
	_righello_btn.custom_minimum_size = Vector2(0, 34)
	_righello_btn.toggled.connect(_su_righello)
	row.add_child(_righello_btn)

	_props_btn = Button.new()
	_props_btn.text = "🌳 Props"
	_props_btn.toggle_mode = true
	_props_btn.tooltip_text = "Arreda il mondo: click piazza il prop scelto, trascina " \
		+ "sposta, click DESTRO elimina. Il layout si salva da solo. Metti i tuoi PNG " \
		+ "in user://props per ampliare la palette."
	_props_btn.custom_minimum_size = Vector2(0, 34)
	_props_btn.toggled.connect(_su_props)
	row.add_child(_props_btn)

	var nebbia := Button.new()
	nebbia.text = "🌫 Nebbia"
	nebbia.toggle_mode = true
	nebbia.tooltip_text = "Fog of war: il mondo si scopre spostando i token del party. " \
		+ "L'esplorato resta salvato tra le sessioni."
	nebbia.custom_minimum_size = Vector2(0, 34)
	nebbia.toggled.connect(_su_nebbia)
	row.add_child(nebbia)


## Palette dei props: seconda barra sotto la toolbar, visibile solo in modalita' "🌳 Props".
## Un toggle per ogni immagine del catalogo (assets/props + user://props, quest'ultima vince).
func _build_palette() -> void:
	_palette = PanelContainer.new()
	_palette.position = Vector2(8, 60)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.045, 0.9)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 8
	sb.content_margin_right = 8
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	_palette.add_theme_stylebox_override("panel", sb)
	_palette.visible = false
	add_child(_palette)
	_palette_row = HBoxContainer.new()
	_palette_row.add_theme_constant_override("separation", 6)
	_palette.add_child(_palette_row)
	_riempi_palette()


func _riempi_palette() -> void:
	for figlio: Node in _palette_row.get_children():
		figlio.queue_free()
	var catalogo: Dictionary = _builder.props().catalogo()
	var nomi: Array = catalogo.keys()
	nomi.sort()
	var gruppo := ButtonGroup.new()
	var primo: Button = null
	for nome: Variant in nomi:
		var b := Button.new()
		b.text = String(nome)
		b.toggle_mode = true
		b.button_group = gruppo
		b.custom_minimum_size = Vector2(0, 30)
		b.toggled.connect(_su_prop_scelto.bind(String(nome)))
		_palette_row.add_child(b)
		if primo == null:
			primo = b
	var aiuto := Label.new()
	aiuto.text = "  click: piazza · trascina: sposta (rotella: scala, R: ruota) · destro: elimina"
	aiuto.add_theme_color_override("font_color", Color(0.6, 0.55, 0.48))
	_palette_row.add_child(aiuto)
	if primo != null:
		primo.button_pressed = true  # un prop e' sempre selezionato: il click piazza subito


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


## Overlay del viaggio a dadi (barra + tasto Marcia): in alto-centro, sopra la mappa. Persiste ai
## "Ricarica mappe" (e' figlio della vista, non del builder) e si mostra da solo quando parte una
## marcia, ascoltando TravelDirector.
func _build_travel_panel() -> void:
	_travel_panel = TravelPanel.new()
	add_child(_travel_panel)
	_travel_panel.set_anchors_and_offsets_preset(
		Control.PRESET_CENTER_TOP, Control.PRESET_MODE_KEEP_SIZE, 12
	)


## Riempie il selettore "Viaggia a…" coi luoghi del set attivo (prima voce = intestazione inerte).
func _popola_viaggio() -> void:
	if _viaggia_option == null:
		return
	_viaggia_option.clear()
	_viaggia_option.add_item("🧭 Viaggia a…")
	_viaggia_option.set_item_disabled(0, true)
	for nome: String in _builder.nomi_luoghi():
		_viaggia_option.add_item(nome)
	_viaggia_option.selected = 0


## Scelta di una meta dal selettore: avvia la marcia a dadi (o il salto immediato se il viaggio a
## dadi e' spento). Torna alla voce-intestazione cosi' si puo' riscegliere lo stesso luogo.
func _su_viaggia_selezionato(indice: int) -> void:
	if indice <= 0:
		return
	var nome: String = _viaggia_option.get_item_text(indice)
	_viaggia_option.selected = 0
	_builder.viaggia_verso(nome)


func _su_dadi_toggle(acceso: bool) -> void:
	TravelDirector.abilitato = acceso
	_dadi_btn.text = "🎲 Viaggio a dadi: ON" if acceso else "🎲 Viaggio a dadi: OFF"


func _on_ora_pressed(nome: String) -> void:
	_builder.imposta_ora(nome)


func _su_apri_cartella() -> void:
	_builder.apri_cartella_mappe()


## Apre user://tokens nel file manager (creandola se manca): e' la cartella dove l'utente mette
## i propri ritratti dipinti dei nemici/eroi (<id>.png), che vincono sui distintivi inclusi.
func _su_apri_token() -> void:
	if not DirAccess.dir_exists_absolute("user://tokens"):
		DirAccess.make_dir_recursive_absolute("user://tokens")
	OS.shell_show_in_file_manager(ProjectSettings.globalize_path("user://tokens"))
	GameState.announce("🎭 Cartella token aperta. Metti qui i tuoi ritratti (es. balrog.png, "
		+ "uruk-hai.png): la lista completa dei nomi file e' nel README in assets/tokens.")


func _su_inquadra() -> void:
	_builder.inquadra_mondo()


func _su_griglia() -> void:
	_griglia_idx = (_griglia_idx + 1) % CELLE_GRIGLIA.size()
	var cella: float = CELLE_GRIGLIA[_griglia_idx]
	_griglia_btn.text = "▦ Griglia: OFF" if cella <= 0.0 else "▦ Griglia: %d" % int(cella)
	_builder.imposta_griglia(cella)


func _su_righello(acceso: bool) -> void:
	_righello_on = acceso
	if acceso and _props_btn != null and _props_btn.button_pressed:
		_props_btn.button_pressed = false  # righello e props si contendono il sinistro: uno solo
	_builder.attiva_righello(acceso)


func _su_props(acceso: bool) -> void:
	_props_on = acceso
	if acceso and _righello_btn != null and _righello_btn.button_pressed:
		_righello_btn.button_pressed = false
	_builder.attiva_props(acceso)
	if _palette != null:
		_palette.visible = acceso


func _su_prop_scelto(acceso: bool, nome: String) -> void:
	if acceso:
		_builder.props().seleziona(nome)


func _su_nebbia(accesa: bool) -> void:
	_nebbia_on = accesa
	_builder.attiva_nebbia(accesa)


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
	_ricrea_builder()


## Cambio di SET dal menu a tendina (Mondo/Castello/Banca/Terra di Mezzo): ricostruisce il
## builder puntandolo alla cartella del set scelto (WorldBuilder.cartella_forzata, letta al suo
## _ready).
func _su_set_selezionato(indice: int) -> void:
	_set_idx = indice
	_ricrea_builder()


## Cambio di CAMPAGNA dal menu a tendina: CampaignDirector cambia arco e pubblica
## "campagna:cambiata", che _su_evento_globale intercetta per allineare il Set di mappe.
func _su_campagna_selezionata(indice: int) -> void:
	var elenco: Array[Dictionary] = CampaignDirector.campagne_disponibili()
	if indice < 0 or indice >= elenco.size():
		return
	CampaignDirector.imposta_campagna(String(elenco[indice]["id"]))


## Indice nel menu a tendina della campagna dato il suo id ("" o non trovata -> 0).
func _indice_campagna(id: String) -> int:
	var elenco: Array[Dictionary] = CampaignDirector.campagne_disponibili()
	for i: int in range(elenco.size()):
		if String(elenco[i]["id"]) == id:
			return i
	return 0


## Indice nel menu a tendina del Set dato il percorso cartella ("" -> Mondo cucito normale).
func _indice_set(cartella: String) -> int:
	for i: int in range(SET_CARTELLE.size()):
		if String(SET_CARTELLE[i][1]) == cartella:
			return i
	return 0


## Eventi globali del gioco che riguardano questa vista: al cambio campagna, allinea Set e
## menu a tendina (senza toccare il resto: griglia/righello/nebbia/props restano come sono).
func _su_evento_globale(nome_evento: String, payload: Variant) -> void:
	if nome_evento != "campagna:cambiata" or not (payload is Dictionary):
		return
	var cartella: String = String((payload as Dictionary).get("cartella", ""))
	var nuovo_idx: int = _indice_set(cartella)
	if nuovo_idx == _set_idx:
		return
	_set_idx = nuovo_idx
	if _set_option != null:
		_set_option.selected = _set_idx
	_ricrea_builder()


## Nodo condiviso da "Ricarica mappe" e dal cambio di Set: libera il builder attuale, ne crea
## uno nuovo puntato alla cartella giusta (cartella_forzata va scritta PRIMA di add_child, cosi'
## _ready() del builder la trova gia' pronta — add_child esegue _ready qui, in modo sincrono),
## e ripristina lo stato dei comandi che vive nella vista (griglia, righello, nebbia, props).
func _ricrea_builder() -> void:
	if _builder != null:
		_builder.queue_free()
	_builder = WorldBuilder.new()
	_builder.cartella_forzata = String(SET_CARTELLE[_set_idx][1])
	_viewport.add_child(_builder)
	if CELLE_GRIGLIA[_griglia_idx] > 0.0:
		_builder.imposta_griglia(CELLE_GRIGLIA[_griglia_idx])
	if _righello_on:
		_builder.attiva_righello(true)
	if _nebbia_on:
		_builder.attiva_nebbia(true)
	if _props_on:
		_builder.attiva_props(true)
	_riempi_palette()
	_aggancia_minimap()
	_popola_viaggio()
