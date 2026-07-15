class_name QuestPanel
extends PanelContainer
## Dialogo MISSIONI: aperto dal marker "!" di un luogo mostra gli NPC del posto con le loro
## quest — Accetta (disponibile), progresso (attiva), Riscuoti la ricompensa (completata).
## Aperto dal pulsante 📜 Missioni della toolbar mostra il REGISTRO di tutte le missioni note
## con il loro stato. Si aggiorna da solo quando una quest avanza (QuestManager.quest_cambiata).

const COL_TITOLO: Color = Color(0.95, 0.85, 0.3)
const NOMI_STATO: Dictionary = {
	"disponibile": "nuova", "attiva": "in corso", "completata": "da riscuotere",
	"riscossa": "compiuta",
}

var _titolo: Label
var _lista: VBoxContainer
var _luogo: String = ""   # "" = modalita' registro (tutte le missioni)


func _ready() -> void:
	visible = false
	_apply_style()
	_build_ui()
	QuestManager.quest_cambiata.connect(_riempi)


## Dialogo con gli NPC di un luogo (dal marker sulla mappa, da vicino).
func apri_luogo(luogo: String) -> void:
	_luogo = luogo
	_titolo.text = "📜 Missioni — %s" % luogo
	visible = true
	_riempi()


## Registro di tutte le missioni note (dal pulsante 📜 della toolbar).
func apri_registro() -> void:
	_luogo = ""
	_titolo.text = "📜 Registro delle missioni"
	visible = true
	_riempi()


func _riempi() -> void:
	if not visible:
		return
	for figlio: Node in _lista.get_children():
		figlio.queue_free()
	var quests: Array[Dictionary] = QuestManager.quest_a(_luogo) if not _luogo.is_empty() \
		else QuestManager.quest_correnti()
	if quests.is_empty():
		var vuoto := Label.new()
		vuoto.text = "Nessuna missione da queste parti."
		vuoto.add_theme_color_override("font_color", Color(0.6, 0.55, 0.48))
		_lista.add_child(vuoto)
		return
	for q: Dictionary in quests:
		_aggiungi_quest(q)


func _aggiungi_quest(q: Dictionary) -> void:
	var stato: String = String(q.get("stato", "disponibile"))
	var titolo := Label.new()
	titolo.text = "%s — %s (%s)" % [
		String(q.get("titolo", "")), String(q.get("npc", "")),
		String(NOMI_STATO.get(stato, stato)),
	]
	titolo.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	titolo.add_theme_color_override("font_color", COL_TITOLO)
	_lista.add_child(titolo)
	# La descrizione intera solo parlando con l'NPC (nel registro basta l'obiettivo).
	if not _luogo.is_empty() and stato == "disponibile":
		var descr := Label.new()
		descr.text = String(q.get("descrizione", ""))
		descr.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		descr.custom_minimum_size = Vector2(360, 0)
		descr.add_theme_color_override("font_color", Color(0.78, 0.73, 0.62))
		_lista.add_child(descr)
	var dettaglio := Label.new()
	dettaglio.add_theme_color_override("font_color", Color(0.68, 0.64, 0.55))
	if String(q.get("tipo", "")) == "caccia":
		dettaglio.text = "Obiettivo: %d × %s — progresso %d/%d" % [
			int(q.get("quanti", 1)), String(q.get("bersaglio", "")),
			int(q.get("progresso", 0)), int(q.get("quanti", 1)),
		]
	else:
		dettaglio.text = "Obiettivo: raggiungi %s" % String(q.get("bersaglio", ""))
	_lista.add_child(dettaglio)
	var premio: Dictionary = q.get("ricompensa", {})
	var voci: PackedStringArray = []
	for it: Variant in premio.get("items", []):
		voci.append(String(InventoryManager.item_definition(String(it)).get("name", String(it))))
	if int(premio.get("gold", 0)) > 0:
		voci.append("%d oro" % int(premio.get("gold", 0)))
	if int(premio.get("xp", 0)) > 0:
		voci.append("%d XP" % int(premio.get("xp", 0)))
	var ricompensa := Label.new()
	ricompensa.text = "Ricompensa: " + ", ".join(voci)
	ricompensa.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	_lista.add_child(ricompensa)
	# Azioni solo nel dialogo col posto giusto (nel registro si legge e basta).
	if not _luogo.is_empty():
		if stato == "disponibile":
			var accetta := Button.new()
			accetta.text = "✋ Accetta la missione"
			accetta.custom_minimum_size = Vector2(0, 38)
			accetta.pressed.connect(func() -> void: QuestManager.accetta(String(q.get("id", ""))))
			_lista.add_child(accetta)
		elif stato == "completata":
			var riscuoti := Button.new()
			riscuoti.text = "🎁 Riscuoti la ricompensa"
			riscuoti.custom_minimum_size = Vector2(0, 38)
			riscuoti.pressed.connect(func() -> void: QuestManager.riscuoti(String(q.get("id", ""))))
			_lista.add_child(riscuoti)
	_lista.add_child(HSeparator.new())


# --- Costruzione UI ---

func _apply_style() -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.055, 0.05, 0.043, 0.96)
	sb.border_color = Color(0.95, 0.85, 0.3, 0.4)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	add_theme_stylebox_override("panel", sb)
	custom_minimum_size = Vector2(400, 0)


func _build_ui() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	add_child(col)
	var riga := HBoxContainer.new()
	col.add_child(riga)
	_titolo = Label.new()
	_titolo.text = "📜 Missioni"
	_titolo.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_titolo.add_theme_color_override("font_color", COL_TITOLO)
	riga.add_child(_titolo)
	var chiudi := Button.new()
	chiudi.text = "✕"
	chiudi.custom_minimum_size = Vector2(34, 30)
	chiudi.pressed.connect(hide)
	riga.add_child(chiudi)
	var scorri := ScrollContainer.new()
	scorri.custom_minimum_size = Vector2(0, 380)
	scorri.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(scorri)
	_lista = VBoxContainer.new()
	_lista.add_theme_constant_override("separation", 5)
	_lista.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scorri.add_child(_lista)
