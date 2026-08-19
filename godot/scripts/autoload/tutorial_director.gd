extends CanvasLayer
## TutorialDirector (Autoload) — il PRIMO SCONTRO GUIDATO (H4): alla prima partita il tavolo
## offre una guida rapida ("Prima volta? Vuoi che ti mostri come si gioca?", col prompt delle
## reazioni). Se accetti, una CARD in alto a sinistra ti porta per mano attraverso i gesti
## fondamentali, avanzando DA SOLA sugli eventi veri del gioco:
##   1. viaggia con "🧭 Viaggia a…"        (attende TravelDirector.viaggio_iniziato)
##   2. tira la marcia coi dadi            (attende viaggio_avanzato)
##   3. un goblin di prova ti sbarra la strada (spawn bilanciato, intensita' facile)
##   4. attaccalo dall'HUD                 (attende il tuo primo attack_resolved)
##   5. vinci — e la card ti mostra Bonus/Magie/Oggetti e il resto del tavolo.
## Fatto (o rifiutato) una volta, non si ripresenta: user://tutorial_fatto.json.

const SEGNALIBRO: String = "user://tutorial_fatto.json"
const ATTESA_OFFERTA_SEC: float = 4.0

var _card: PanelContainer
var _testo: Label
var _passo: int = 0        # 0 = spento; 1..5 = passi della guida
var _offerto: bool = false


func _ready() -> void:
	layer = 70  # sotto prompt (85) ed epilogo (84): la guida non copre mai le decisioni
	_costruisci_card()
	if FileAccess.file_exists(SEGNALIBRO):
		return
	CharacterManager.party_changed.connect(_su_party)
	TravelDirector.viaggio_iniziato.connect(func(_d: Dictionary) -> void: _avanza_da(1))
	TravelDirector.viaggio_avanzato.connect(func(_d: Dictionary) -> void: _avanza_da(2))
	CombatManager.combat_started.connect(func() -> void: _avanza_da(3))
	CombatManager.attack_resolved.connect(_su_attacco)
	CombatManager.victory.connect(func() -> void: _avanza_da(4))


## C'e' un party: la partita e' davvero cominciata — si offre la guida (una volta sola).
func _su_party(party: Array[CharacterData]) -> void:
	if _offerto or party.is_empty() or FileAccess.file_exists(SEGNALIBRO):
		return
	_offerto = true
	_offri()


func _offri() -> void:
	await get_tree().create_timer(ATTESA_OFFERTA_SEC).timeout
	var si: bool = await ReactionPrompt.chiedi(
		"🎓 Prima volta al Tavolo Oscuro?",
		"Vuoi una guida rapida? Cinque passi: viaggio a dadi, marcia, uno scontro di prova, "
		+ "l'attacco e la vittoria. (Potrai sempre ignorarla.)",
		"🎓 Guidami", "So gia' giocare", 12.0)
	if not si:
		_completa(false)
		return
	_passo = 1
	_mostra("PASSO 1/5 — IL VIAGGIO\nApri il selettore \"🧭 Viaggia a…\" in alto e scegli "
		+ "una meta: nel Tavolo Oscuro ci si muove COL DADO, non col mouse.")


func _avanza_da(passo_atteso: int) -> void:
	if _passo != passo_atteso:
		return
	_passo += 1
	match _passo:
		2:
			_mostra("PASSO 2/5 — LA MARCIA\nOgni tratto di strada e' un tiro: premi "
				+ "\"🎲 Marcia (1d20)\" nel pannello del viaggio. Alto = si avanza bene; "
				+ "basso = la strada morde.")
		3:
			_mostra("PASSO 3/5 — LO SCONTRO\nUn goblin di prova ti sbarra il cammino! La mappa "
				+ "si trasforma in arena: griglia, coperture, iniziativa. Niente paura: e' solo.")
			_spawn_goblin_di_prova()
		4:
			_mostra("PASSO 4/5 — L'ATTACCO\nNel TUO turno: scegli il bersaglio in basso e premi "
				+ "\"⚔ Attacca\". Puoi anche trascinare il tuo token (entro 9 m) per avvicinarti.")
		5:
			_mostra("PASSO 5/5 — VITTORIA!\nHai vinto il tuo primo scontro. Da qui in poi: "
				+ "⚡ Bonus (pozioni, capacita'), 📖 Magie (per gli incantatori), 🧪 Oggetti "
				+ "(olio, pergamene), 📖 Storia per il racconto e 💾 Partite per salvare. "
				+ "Buon cammino!")
			_completa(true)


## Il goblin della guida: uno solo, bilanciato al minimo — una vittoria quasi garantita.
func _spawn_goblin_di_prova() -> void:
	if not CombatManager.is_active():
		EncounterBalancer.spawn_bilanciato([{ "name": "Goblin", "count": 1 }], "facile")


func _su_attacco(result: Dictionary) -> void:
	if _passo == 4 and String(result.get("attacker", "")).begins_with("pc-"):
		# Non si avanza qui al passo 5: ci pensa la VITTORIA (potrebbero servire piu' colpi).
		_mostra("PASSO 4/5 — L'ATTACCO\nColpo tirato! Continua finche' il goblin non cade "
			+ "(o prova ⚡ Bonus e le altre azioni). Poi \"⏭ Termina turno\".")


## Chiude la guida e pianta il segnalibro: mai piu' riproposta (finche' il file non si cancella).
func _completa(finita: bool) -> void:
	if finita:
		await get_tree().create_timer(14.0).timeout
	_card.visible = false
	_passo = 0
	var f: FileAccess = FileAccess.open(SEGNALIBRO, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({ "completato": finita }))


func _mostra(testo: String) -> void:
	_testo.text = testo
	_card.visible = true
	UiFx.entra(_card)
	GameState.announce("🎓 " + testo.split("\n")[0])


# --- Costruzione della card ---

func _costruisci_card() -> void:
	_card = PanelContainer.new()
	_card.visible = false
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.06, 0.07, 0.05, 0.96)
	sb.border_color = Color(0.55, 0.75, 0.35, 0.7)
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	_card.add_theme_stylebox_override("panel", sb)
	_card.set_anchors_and_offsets_preset(
		Control.PRESET_TOP_LEFT, Control.PRESET_MODE_KEEP_SIZE, 12)
	_card.offset_top = 64  # sotto la toolbar
	add_child(_card)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	_card.add_child(col)
	var titolo := Label.new()
	titolo.text = "🎓 Guida del tavolo"
	titolo.add_theme_color_override("font_color", Color(0.6, 0.8, 0.4))
	col.add_child(titolo)
	_testo = Label.new()
	_testo.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_testo.custom_minimum_size = Vector2(340, 0)
	_testo.add_theme_font_size_override("font_size", 13)
	_testo.add_theme_color_override("font_color", Color(0.88, 0.86, 0.78))
	col.add_child(_testo)
