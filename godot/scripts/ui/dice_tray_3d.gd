class_name DiceTray3D
extends Control
## Vassoio dei dadi 3D (la meta' scenica del Modulo 8 "3D Dice Engine"): overlay a schermo intero
## con un mondo 3D dedicato (SubViewport con World3D proprio) dove i Dice3D vengono LANCIATI
## davvero — gravita', rimbalzi sul feltro e sulle sponde invisibili, poi si legge la faccia in
## alto. Il totale e' annunciato nel canale unico (GameState.announce) a nome del PG attivo, cosi'
## resta nel log della Chat Master come ogni altro tiro.
##
## Chiunque puo' aprirlo via gruppo "vassoio_dadi_3d" (lo usa DiceRoller); un click lo chiude.

signal tiro_completato(facce: int, totale: int, singoli: PackedInt32Array)

const MEZZO_X: float = 3.4  # semi-larghezza interna del vassoio (unita' mondo)
const MEZZO_Z: float = 2.1  # semi-profondita'
const DIMENSIONE_DADO: float = 0.52
const MAX_DADI: int = 8
const TEMPO_MASSIMO: float = 6.0  # oltre: si legge comunque (dado in bilico contro una sponda)
const FRAME_DI_QUIETE: int = 25   # ~0.4s di immobilita' prima di dichiarare il risultato
const CHIUSURA_AUTO: float = 2.8
const FACCE_DISPONIBILI: Array[int] = [4, 6, 8, 10, 12, 20]

var _viewport: SubViewport
var _mondo: Node3D
var _etichetta: Label
var _dettaglio: Label
var _selettore_quanti: OptionButton
var _dadi: Array[Dice3D] = []
var _facce_correnti: int = 20
var _in_corso: bool = false
var _frame_fermi: int = 0
var _tempo: float = 0.0
var _generazione: int = 0  # invalida chiusure automatiche pendenti quando parte un nuovo tiro


func _ready() -> void:
	add_to_group("vassoio_dadi_3d")
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_costruisci_ui()
	_costruisci_mondo()
	set_physics_process(false)


## Lancia `quanti` dadi a `nuove_facce` facce nel vassoio (aprendolo se serve). Un tiro alla
## volta: mentre i dadi rotolano le richieste vengono ignorate, come al tavolo vero.
func tira(nuove_facce: int, quanti: int = 1) -> void:
	if _in_corso or _mondo == null:
		return
	show()
	_generazione += 1
	_pulisci_dadi()
	_facce_correnti = nuove_facce
	_in_corso = true
	_frame_fermi = 0
	_tempo = 0.0
	var n: int = clampi(quanti, 1, MAX_DADI)
	_etichetta.text = "…"
	_dettaglio.text = ("%dd%d" % [n, nuove_facce]) if n > 1 else ("d%d" % nuove_facce)
	for i: int in range(n):
		var dado := Dice3D.new()
		dado.configura(nuove_facce, DIMENSIONE_DADO)
		_mondo.add_child(dado)
		# Entrano dal bordo vicino alla camera, scagliati verso il fondo del vassoio.
		var x: float = lerpf(-1.6, 1.6, (i + 0.5) / n) + randf_range(-0.2, 0.2)
		dado.lancia(
			Vector3(x, 2.0 + 0.3 * (i % 3), MEZZO_Z - 0.4),
			Vector3(randf_range(-2.0, 2.0), -2.0, randf_range(-11.0, -8.0))
		)
		_dadi.append(dado)
	set_physics_process(true)


func _physics_process(delta: float) -> void:
	if not _in_corso:
		set_physics_process(false)
		return
	_tempo += delta
	var tutti_fermi: bool = true
	for dado: Dice3D in _dadi:
		if not dado.e_fermo():
			tutti_fermi = false
			break
	_frame_fermi = _frame_fermi + 1 if tutti_fermi else 0
	if _frame_fermi >= FRAME_DI_QUIETE or _tempo >= TEMPO_MASSIMO:
		_concludi()


func _concludi() -> void:
	_in_corso = false
	set_physics_process(false)
	var singoli := PackedInt32Array()
	var totale: int = 0
	for dado: Dice3D in _dadi:
		var r: int = dado.risultato()
		singoli.append(r)
		totale += r
	_etichetta.text = str(totale)
	_dettaglio.text = _testo_dettaglio(singoli)
	_annuncia(totale, singoli)
	tiro_completato.emit(_facce_correnti, totale, singoli)
	_chiudi_dopo(CHIUSURA_AUTO)


func _testo_dettaglio(singoli: PackedInt32Array) -> String:
	if singoli.size() <= 1:
		return "d%d" % _facce_correnti
	var parti: PackedStringArray = []
	for r: int in singoli:
		parti.append(str(r))
	return "%dd%d: %s" % [singoli.size(), _facce_correnti, " + ".join(parti)]


func _annuncia(totale: int, singoli: PackedInt32Array) -> void:
	var pg: CharacterData = CharacterManager.get_active()
	var nome: String = pg.character_name if pg else "Il tavolo"
	if singoli.size() > 1:
		GameState.announce("🎲 %s tira %s = %d" % [nome, _testo_dettaglio(singoli), totale])
		return
	var extra: String = ""
	if _facce_correnti == 20 and totale == 20:
		extra = " — CRITICO! 💥"
	elif _facce_correnti == 20 and totale == 1:
		extra = " — fallimento critico… 💀"
	GameState.announce("🎲 %s tira 1d%d: %d%s" % [nome, _facce_correnti, totale, extra])


func _chiudi_dopo(secondi: float) -> void:
	var mia_generazione: int = _generazione
	await get_tree().create_timer(secondi).timeout
	if _generazione == mia_generazione and not _in_corso:
		hide()


func _pulisci_dadi() -> void:
	for dado: Dice3D in _dadi:
		if is_instance_valid(dado):
			dado.queue_free()
	_dadi.clear()


## Alla chiusura i dadi si liberano subito: il mondo del vassoio non deve costare nulla (ne'
## fisica ne' rendering) mentre e' nascosto.
func _notification(cosa: int) -> void:
	if cosa == NOTIFICATION_VISIBILITY_CHANGED and is_inside_tree() and not visible:
		_in_corso = false
		set_physics_process(false)
		_pulisci_dadi()


func _gui_input(evento: InputEvent) -> void:
	if evento is InputEventMouseButton and evento.pressed and not _in_corso:
		hide()


# --- Costruzione UI (overlay 2D) ---

func _costruisci_ui() -> void:
	var contenitore := SubViewportContainer.new()
	contenitore.set_anchors_preset(Control.PRESET_FULL_RECT)
	contenitore.stretch = true
	contenitore.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(contenitore)
	_viewport = SubViewport.new()
	_viewport.own_world_3d = true
	_viewport.handle_input_locally = false
	_viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	contenitore.add_child(_viewport)
	add_child(_costruisci_intestazione())
	add_child(_costruisci_barra_dadi())


func _costruisci_intestazione() -> VBoxContainer:
	var alto := VBoxContainer.new()
	alto.set_anchors_preset(Control.PRESET_CENTER_TOP)
	alto.grow_horizontal = Control.GROW_DIRECTION_BOTH
	alto.offset_top = 18
	alto.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_etichetta = Label.new()
	_etichetta.text = "🎲"
	_etichetta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_etichetta.add_theme_font_size_override("font_size", 54)
	_etichetta.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	_etichetta.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	_etichetta.add_theme_constant_override("outline_size", 10)
	alto.add_child(_etichetta)
	_dettaglio = Label.new()
	_dettaglio.text = ""
	_dettaglio.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_dettaglio.add_theme_font_size_override("font_size", 20)
	_dettaglio.add_theme_color_override("font_color", Color(0.85, 0.8, 0.7))
	_dettaglio.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	_dettaglio.add_theme_constant_override("outline_size", 6)
	alto.add_child(_dettaglio)
	return alto


func _costruisci_barra_dadi() -> HBoxContainer:
	var basso := HBoxContainer.new()
	basso.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	basso.grow_horizontal = Control.GROW_DIRECTION_BOTH
	basso.grow_vertical = Control.GROW_DIRECTION_BEGIN
	basso.offset_bottom = -16
	basso.add_theme_constant_override("separation", 6)
	for f: int in FACCE_DISPONIBILI:
		var bottone := Button.new()
		bottone.text = "D%d" % f
		bottone.custom_minimum_size = Vector2(0, 44)
		bottone.pressed.connect(_on_bottone_dado.bind(f))
		basso.add_child(bottone)
	_selettore_quanti = OptionButton.new()
	for n: int in range(1, MAX_DADI + 1):
		_selettore_quanti.add_item("×%d" % n)
	_selettore_quanti.custom_minimum_size = Vector2(0, 44)
	basso.add_child(_selettore_quanti)
	var chiudi := Button.new()
	chiudi.text = "✕ Chiudi"
	chiudi.custom_minimum_size = Vector2(0, 44)
	chiudi.pressed.connect(hide)
	basso.add_child(chiudi)
	return basso


func _on_bottone_dado(f: int) -> void:
	tira(f, _selettore_quanti.selected + 1)


# --- Costruzione del mondo 3D (feltro, sponde, luci, camera) ---

func _costruisci_mondo() -> void:
	_mondo = Node3D.new()
	_viewport.add_child(_mondo)
	_mondo.add_child(_crea_ambiente())
	_mondo.add_child(_crea_luce())
	_mondo.add_child(_crea_camera())
	_mondo.add_child(_scatola_statica(Vector3(0, -0.5, 0),
		Vector3(MEZZO_X * 2.0 + 1.4, 1.0, MEZZO_Z * 2.0 + 1.4), true))
	for sponda: StaticBody3D in _crea_sponde():
		_mondo.add_child(sponda)


func _crea_ambiente() -> WorldEnvironment:
	var ambiente := Environment.new()
	ambiente.background_mode = Environment.BG_COLOR
	ambiente.background_color = Color(0.045, 0.04, 0.035)
	ambiente.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	ambiente.ambient_light_color = Color(0.55, 0.53, 0.5)
	ambiente.ambient_light_energy = 0.9
	var nodo := WorldEnvironment.new()
	nodo.environment = ambiente
	return nodo


func _crea_luce() -> DirectionalLight3D:
	var luce := DirectionalLight3D.new()
	luce.rotation_degrees = Vector3(-55, 28, 0)
	luce.light_energy = 1.2
	luce.shadow_enabled = true
	return luce


func _crea_camera() -> Camera3D:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 6.4, 3.1)
	camera.fov = 42.0
	camera.current = true
	# Guarda l'origine (equivale a look_at, ma senza richiedere il nodo gia' nell'albero).
	camera.basis = Basis.looking_at(-camera.position.normalized())
	return camera


## Le 4 sponde + il "soffitto": collisioni INVISIBILI appena fuori dall'inquadratura, cosi' i
## dadi restano sempre in scena per quanto violento sia il lancio.
func _crea_sponde() -> Array[StaticBody3D]:
	var lato: Vector3 = Vector3(0.5, 4.0, MEZZO_Z * 2.0 + 1.4)
	var fondo: Vector3 = Vector3(MEZZO_X * 2.0 + 1.4, 4.0, 0.5)
	return [
		_scatola_statica(Vector3(MEZZO_X + 0.25, 2.0, 0), lato, false),
		_scatola_statica(Vector3(-MEZZO_X - 0.25, 2.0, 0), lato, false),
		_scatola_statica(Vector3(0, 2.0, MEZZO_Z + 0.25), fondo, false),
		_scatola_statica(Vector3(0, 2.0, -MEZZO_Z - 0.25), fondo, false),
		_scatola_statica(Vector3(0, 4.5, 0),
			Vector3(MEZZO_X * 2.0 + 1.4, 0.5, MEZZO_Z * 2.0 + 1.4), false),
	]


func _scatola_statica(posizione: Vector3, dimensioni: Vector3, visibile: bool) -> StaticBody3D:
	var corpo := StaticBody3D.new()
	corpo.position = posizione
	var forma := BoxShape3D.new()
	forma.size = dimensioni
	var collisione := CollisionShape3D.new()
	collisione.shape = forma
	corpo.add_child(collisione)
	if visibile:
		var mesh := MeshInstance3D.new()
		var scatola := BoxMesh.new()
		scatola.size = dimensioni
		mesh.mesh = scatola
		var feltro := StandardMaterial3D.new()
		feltro.albedo_color = Color(0.08, 0.13, 0.09)  # feltro verde scuro da tavolo da gioco
		feltro.roughness = 0.95
		mesh.material_override = feltro
		corpo.add_child(mesh)
	return corpo
