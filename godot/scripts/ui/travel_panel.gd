class_name TravelPanel
extends PanelContainer
## Pannello del VIAGGIO A DADI: appare quando parte una marcia (TravelDirector) e mostra dove si va,
## quanta strada resta (barra + km + tappe), l'ultimo evento del cammino, e un unico grande tasto
## "🎲 Marcia (1d20)" — l'unico modo di avanzare sulla mappa quando il Master vi fa spostare. A
## viaggio finito si congratula e si nasconde da solo. Vive come overlay del Mondo (WorldView).

const COL_ORO: Color = Color(0.86, 0.72, 0.34)
const COL_TESTO: Color = Color(0.90, 0.85, 0.74)
const CHIUSURA_AUTO: float = 2.6

var _titolo: Label
var _barra: ProgressBar
var _residuo: Label
var _evento: Label
var _marcia_btn: Button
var _campo_btn: Button
var _attesa_tiro: bool = false
var _vassoio_connesso: bool = false
var _generazione: int = 0


func _ready() -> void:
	_apply_style()
	_build_ui()
	visible = false
	TravelDirector.viaggio_iniziato.connect(_su_iniziato)
	TravelDirector.viaggio_avanzato.connect(_su_avanzato)
	TravelDirector.viaggio_arrivato.connect(_su_arrivato)
	TravelDirector.viaggio_annullato.connect(_su_annullato)
	# Durante uno scontro (agguato in marcia, agguato notturno al campo) non si avanza ne' ci si
	# accampa: prima si combatte. I pulsanti seguono lo stato del combattimento.
	CombatManager.combat_started.connect(_aggiorna_pulsanti)
	CombatManager.combat_ended.connect(_aggiorna_pulsanti)
	JourneyEvents.riposo_finito.connect(_aggiorna_pulsanti)


func _su_iniziato(dati: Dictionary) -> void:
	_generazione += 1
	_attesa_tiro = false
	visible = true
	_titolo.text = "🧭 In marcia verso %s" % String(dati.get("nome", ""))
	_barra.value = 0.0
	var km: int = roundi(float(dati.get("distanza_km", 0.0)))
	var giorni: int = int(dati.get("giorni", 0))
	var tappe: int = int(dati.get("tappe", 0))
	_residuo.text = "~%d km · %d tappe · ~%d giorni di marcia" % [km, tappe, giorni]
	_evento.text = "Tira il dado per avanzare lungo la strada."
	_marcia_btn.disabled = false
	_marcia_btn.text = "🎲 Marcia (1d20)"
	_campo_btn.disabled = false


func _su_avanzato(dati: Dictionary) -> void:
	_attesa_tiro = false
	_barra.value = clampf(float(dati.get("frazione", 0.0)) * 100.0, 0.0, 100.0)
	var resto: int = roundi(float(dati.get("restante_km", 0.0)))
	_residuo.text = "Restano ~%d km alla meta" % resto
	var evt: String = String(dati.get("evento", ""))
	_evento.text = evt if not evt.is_empty() else "La compagnia prosegue lungo il cammino."
	if not bool(dati.get("arrivato", false)):
		# Se la tappa ha innescato un AGGUATO (JourneyEvents riceve il segnale prima di noi),
		# i pulsanti restano spenti: si riaccendono a scontro finito (_aggiorna_pulsanti).
		_marcia_btn.disabled = CombatManager.is_active()
		_campo_btn.disabled = CombatManager.is_active()
		_marcia_btn.text = "🎲 Marcia (1d20)"


func _su_arrivato(nome: String) -> void:
	_attesa_tiro = false
	_barra.value = 100.0
	_titolo.text = "🏁 Arrivati a %s" % nome
	_residuo.text = "La compagnia ha raggiunto la meta."
	_marcia_btn.disabled = true
	_campo_btn.disabled = true
	_chiudi_dopo(CHIUSURA_AUTO)


func _su_annullato() -> void:
	_attesa_tiro = false
	visible = false


## Con uno scontro in corso i pulsanti del viaggio si spengono: prima le lame, poi la strada.
func _aggiorna_pulsanti() -> void:
	var blocco: bool = CombatManager.is_active()
	if TravelDirector.in_viaggio():
		_marcia_btn.disabled = blocco or _attesa_tiro
		_campo_btn.disabled = blocco or JourneyEvents.riposo_in_corso()


## Marcia: apre il vassoio 3D per un 1d20; l'esito fa avanzare il viaggio. Senza vassoio (scena
## spoglia) tira all'istante, stesso flusso. Un solo tiro alla volta (il tasto si disabilita).
func _on_marcia() -> void:
	if not TravelDirector.in_viaggio() or _attesa_tiro:
		return
	if CombatManager.is_active() or JourneyEvents.riposo_in_corso():
		return  # prima si risolve lo scontro (o si finisce di dormire), poi si riparte
	_attesa_tiro = true
	_marcia_btn.disabled = true
	_marcia_btn.text = "🎲 …"
	var vassoio: DiceTray3D = get_tree().get_first_node_in_group("vassoio_dadi_3d") as DiceTray3D
	if vassoio == null:
		TravelDirector.avanza(randi_range(1, 20))
		return
	if not _vassoio_connesso:
		vassoio.tiro_completato.connect(_on_tiro)
		_vassoio_connesso = true
	vassoio.tira(20, 1)


func _on_tiro(facce: int, totale: int, _singoli: PackedInt32Array) -> void:
	# Solo il 1d20 che aspettiamo noi (gli altri tiri del tavolo non muovono il viaggio).
	if not _attesa_tiro or facce != 20:
		return
	TravelDirector.avanza(totale)


func _chiudi_dopo(secondi: float) -> void:
	var mia: int = _generazione
	await get_tree().create_timer(secondi).timeout
	if _generazione == mia and not TravelDirector.in_viaggio():
		visible = false


# --- Costruzione UI ---

func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.05, 0.045, 0.94)
	sb.border_color = Color(COL_ORO.r, COL_ORO.g, COL_ORO.b, 0.45)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	add_theme_stylebox_override("panel", sb)
	custom_minimum_size = Vector2(320, 0)


func _build_ui() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	add_child(col)

	_titolo = Label.new()
	_titolo.text = "🧭 Viaggio"
	_titolo.add_theme_color_override("font_color", COL_ORO)
	col.add_child(_titolo)

	_barra = ProgressBar.new()
	_barra.min_value = 0.0
	_barra.max_value = 100.0
	_barra.value = 0.0
	_barra.show_percentage = false
	_barra.custom_minimum_size = Vector2(0, 16)
	col.add_child(_barra)

	_residuo = Label.new()
	_residuo.text = ""
	_residuo.add_theme_color_override("font_color", COL_TESTO)
	col.add_child(_residuo)

	_evento = Label.new()
	_evento.text = ""
	_evento.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_evento.custom_minimum_size = Vector2(300, 0)
	_evento.add_theme_color_override("font_color", Color(0.78, 0.72, 0.6))
	col.add_child(_evento)

	_marcia_btn = Button.new()
	_marcia_btn.text = "🎲 Marcia (1d20)"
	_marcia_btn.custom_minimum_size = Vector2(0, 44)
	_marcia_btn.pressed.connect(_on_marcia)
	col.add_child(_marcia_btn)

	_campo_btn = Button.new()
	_campo_btn.text = "🏕 Accampati per la notte"
	_campo_btn.tooltip_text = "Una notte di riposo: cura tutto il party e rinfranca lo spirito " \
		+ "— ma nelle terre pericolose l'Ombra potrebbe trovarvi nel sonno."
	_campo_btn.custom_minimum_size = Vector2(0, 38)
	_campo_btn.pressed.connect(_on_campo)
	col.add_child(_campo_btn)


## Accampamento: lo gestisce JourneyEvents (notte, rischio d'agguato, cura all'alba).
func _on_campo() -> void:
	if CombatManager.is_active() or JourneyEvents.riposo_in_corso():
		return
	_campo_btn.disabled = true
	JourneyEvents.accampati()
