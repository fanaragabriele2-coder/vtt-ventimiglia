extends Control
## VTTMain — scena radice. Costruisce il layout a 3 colonne del monolite (Scheda PG · Mappa+Combat ·
## Chat Master) e una toolbar in alto. Ogni pannello si aggancia da solo ai signal dei manager: qui
## si fa solo la composizione + qualche pulsante globale (evoca nemici, strumenti, ecc.).
##
## UNA SOLA MAPPA: il centro e' il Mondo cucito (WorldView) — la mappa interattiva della campagna
## (Terra di Mezzo o Ventimiglia, a seconda della scelta). Le vecchie viste separate (mappa
## tattica astratta, overworld cittadino, Dungeon Nexus) sono state rimosse: TUTTO — esplorazione,
## arrivi della campagna, spawn dei nemici a distanza reale, combattimento animato — vive sulla
## stessa mappa cucita.
##
## E' la scena principale del progetto (project.godot -> run/main_scene = res://main.tscn).

var _world_view: WorldView
var _ai_toggle_btn: Button
var _voce_btn: Button
var _dadi_telefono_btn: Button
var _storia_btn: Button
var _musica_btn: Button
var _partite_panel: SaveSlotsPanel
var _master_tools: MasterToolsPanel
var _chat_panel: MasterChatPanel
var _story_panel: CampaignStoryPanel
var _token_dialog: FileDialog


func _ready() -> void:
	_apply_background()
	_build_layout()
	_show_campaign_select()


## PRIMA di ogni altra cosa, anche prima della scheda del personaggio: si sceglie la campagna
## (Ventimiglia o Terra di Mezzo). CampaignDirector.imposta_campagna gia' allinea da solo il
## Set di mappe giusto; qui si passa solo alla creazione del party.
func _show_campaign_select() -> void:
	var screen := CampaignSelectScreen.new()
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.campagna_scelta.connect(func() -> void:
		screen.queue_free()
		_show_character_creation())
	add_child(screen)


## Crea il party (Modulo 14). Il layout di gioco e' gia' costruito sotto (con il PG "Eroe
## Locale" di default), ma la creazione lo sostituisce SUBITO che si preme "Inizia
## l'avventura" — coerente col comportamento del monolite.
func _show_character_creation() -> void:
	var screen := CharacterCreationScreen.new()
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.adventure_started.connect(func() -> void: screen.queue_free())
	add_child(screen)


func _apply_background() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.color = Color(0.04, 0.035, 0.03)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)


func _build_layout() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	add_child(margin)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	margin.add_child(col)

	col.add_child(_build_toolbar())

	# --- Le 3 colonne ---
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 10)
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(columns)

	# Sinistra: Scheda PG + barra XP. Larghezza minima fissa: la scheda non deve schiacciarsi.
	var left := VBoxContainer.new()
	left.add_theme_constant_override("separation", 8)
	left.custom_minimum_size = Vector2(260, 0)
	columns.add_child(left)
	left.add_child(XpBar.new())
	var sheet := CharacterSheetPanel.new()
	sheet.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(sheet)

	# Centro: toggle vista + (mappa tattica | overworld Ventimiglia) + HUD combattimento in basso.
	var center := VBoxContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.add_theme_constant_override("separation", 8)
	columns.add_child(center)

	# LA mappa: il Mondo cucito (WorldBuilder, direttiva OMEGA) — le battlemap della campagna
	# unite in un open-world con coerenza visiva e culling VRAM. Sempre visibile: e' l'unica.
	_world_view = WorldView.new()
	_world_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	center.add_child(_world_view)

	var combat_hud := CombatHUD.new()
	center.add_child(combat_hud)

	center.add_child(DiceRoller.new())

	# Destra: Chat Master + Modalita' Storia (NLP). Convivono nello stesso spazio come le viste
	# del centro: una sola e' visibile, il pulsante in toolbar le scambia. Larghezza minima fissa:
	# quando il combattimento riempie il centro, la chat NON deve venire schiacciata via (era il bug
	# "la chat non si vede piu' appena inizia lo scontro").
	_chat_panel = MasterChatPanel.new()
	_chat_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_chat_panel.custom_minimum_size = Vector2(320, 0)
	columns.add_child(_chat_panel)
	# "📖 Storia" apre il RACCONTO ramificato autoriale (StoryDirector): narrazione, opzioni,
	# prove di dado e boss fight LOTR — funziona offline, senza dipendere dal Master IA/Groq.
	_story_panel = CampaignStoryPanel.new()
	_story_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_story_panel.custom_minimum_size = Vector2(320, 0)
	_story_panel.visible = false
	columns.add_child(_story_panel)

	# Barra di stato in fondo a tutta la finestra (fuori dalle 3 colonne, come il session panel
	# del monolite): turno/combattimento/party/IA nemica a colpo d'occhio.
	col.add_child(StatusBar.new())

	# Overlay globale (sopra tutto): popup di bottino (Modulo 15/41).
	add_child(LootPopup.new())

	# Vassoio dei dadi 3D fisici (Modulo 8): sopra tutto, nascosto finche' non si tira.
	var vassoio := DiceTray3D.new()
	vassoio.visible = false
	add_child(vassoio)

	# Overlay di debug (F3): FPS, VRAM, stato macchina e statistiche del culling in tempo reale.
	add_child(DebugOverlay.new())

	# Cassetto Strumenti del Master: overlay a comparsa in alto a destra (toggle dal pulsante 🛠).
	_master_tools = MasterToolsPanel.new()
	_master_tools.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_master_tools.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_master_tools.offset_top = 62
	_master_tools.offset_right = -12
	add_child(_master_tools)


func _build_toolbar() -> PanelContainer:
	var panel := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.07, 0.06)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	panel.add_theme_stylebox_override("panel", sb)

	# Titolo su una riga, pulsanti sotto in un contenitore che VA A CAPO da solo (HFlowContainer):
	# con 14 comandi una riga unica sfonderebbe una TV — su schermi larghi resta comunque una riga.
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)

	var title := Label.new()
	title.text = "⚜ Tavolo Oscuro di Ventimiglia"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.94, 0.83, 0.53))
	col.add_child(title)

	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 8)
	row.add_theme_constant_override("v_separation", 6)
	col.add_child(row)

	# Handler con nome (i lambda multi-linea come argomento sono fragili in GDScript: meglio metodi).
	# Separatori verticali raggruppano i comandi per funzione (combattimento · IA/audio · sistema).
	row.add_child(_toolbar_button("⚔ Evoca avanguardia", _spawn_avanguardia))
	row.add_child(_toolbar_button("💀 Evoca bruto", _spawn_bruto))
	row.add_child(_toolbar_button("🏳 Fine scontro", _end_combat))
	row.add_child(_separatore_toolbar())
	_ai_toggle_btn = _toolbar_button("🐺 IA Nemica: ON", _toggle_enemy_ai)
	row.add_child(_ai_toggle_btn)
	_voce_btn = _toolbar_button("🔊 Voce Master: ON", _toggle_voce_master)
	row.add_child(_voce_btn)
	_musica_btn = _toolbar_button("🎵 Musica: ON", _toggle_musica)
	row.add_child(_musica_btn)
	_storia_btn = _toolbar_button("📖 Storia", _toggle_storia)
	row.add_child(_storia_btn)
	_dadi_telefono_btn = _toolbar_button("📱 Dadi: OFF", _toggle_dice_server)
	row.add_child(_dadi_telefono_btn)
	row.add_child(_toolbar_button("🛠 Strumenti", _toggle_strumenti_master))
	row.add_child(_separatore_toolbar())
	row.add_child(_toolbar_button("📥 Importa token", _importa_token))
	row.add_child(_toolbar_button("⛶ Schermo intero", _toggle_fullscreen))
	row.add_child(_toolbar_button("💾 Partite", _apri_partite))
	return panel


## Sottile separatore verticale tra gruppi di pulsanti della toolbar.
func _separatore_toolbar() -> VSeparator:
	var sep := VSeparator.new()
	sep.add_theme_constant_override("separation", 10)
	return sep


## UI asimmetrica: accende/spegne il mini server HTTP dei dadi (i giocatori tirano dal telefono,
## il risultato compare in chat; l'indirizzo da digitare viene annunciato in chat all'accensione).
func _toggle_dice_server() -> void:
	if DiceServer.e_attivo():
		DiceServer.ferma()
	else:
		DiceServer.avvia()
	_dadi_telefono_btn.text = "📱 Dadi: ON" if DiceServer.e_attivo() else "📱 Dadi: OFF"


## Il pannello degli SLOT di salvataggio (H4): tre slot + rapido, con targhetta e conferme.
func _apri_partite() -> void:
	if _partite_panel == null:
		_partite_panel = SaveSlotsPanel.new()
		add_child(_partite_panel)
		_partite_panel.set_anchors_and_offsets_preset(
			Control.PRESET_CENTER, Control.PRESET_MODE_KEEP_SIZE, 0)
	if _partite_panel.visible:
		_partite_panel.hide()
	else:
		_partite_panel.apri()


## Importa i ritratti dei token dell'utente (es. la cartella "nemi" sul Desktop): selettore
## multi-file -> copia in user://tokens -> cache azzerata. NON serve rinominare niente: il
## match fuzzy di TokenArt aggancia "Goblin di Moria - Guerriero.png" a Goblin di Moria da solo.
func _importa_token() -> void:
	if _token_dialog == null:
		_token_dialog = FileDialog.new()
		_token_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILES
		_token_dialog.access = FileDialog.ACCESS_FILESYSTEM
		_token_dialog.title = "Scegli i ritratti dei token (puoi selezionarli TUTTI insieme)"
		_token_dialog.filters = PackedStringArray(["*.png, *.jpg, *.jpeg, *.webp ; Immagini"])
		_token_dialog.size = Vector2i(820, 520)
		_token_dialog.files_selected.connect(_on_token_files_selected)
		add_child(_token_dialog)
	_token_dialog.popup_centered()


func _on_token_files_selected(percorsi: PackedStringArray) -> void:
	if not DirAccess.dir_exists_absolute("user://tokens"):
		DirAccess.make_dir_recursive_absolute("user://tokens")
	var destinazione_base: String = ProjectSettings.globalize_path("user://tokens")
	var copiati: int = 0
	for percorso: String in percorsi:
		if DirAccess.copy_absolute(percorso, destinazione_base.path_join(percorso.get_file())) == OK:
			copiati += 1
	TokenArt.azzera_cache()
	if copiati > 0:
		GameState.announce(("🎭 %d ritratto/i importato/i: i nemici con quel nome ora usano la "
			+ "TUA arte (match automatico sul nome file — per forzare un abbinamento rinomina "
			+ "il file come da assets/tokens/README.md).") % copiati)
	else:
		GameState.announce("🎭 Nessun file importato (formati supportati: png, jpg, webp).")


func _toggle_enemy_ai() -> void:
	EnemyAI.set_enabled(not EnemyAI.is_enabled())
	_ai_toggle_btn.text = "🐺 IA Nemica: ON" if EnemyAI.is_enabled() else "🐺 IA Nemica: OFF"


## Scambia il pannello destro: Chat Master classica <-> RACCONTO ramificato (StoryDirector):
## narrazione + opzioni cliccabili + prove di dado + boss fight, con testo libero.
func _toggle_storia() -> void:
	var storia_attiva: bool = not _story_panel.visible
	_story_panel.visible = storia_attiva
	_chat_panel.visible = not storia_attiva
	_storia_btn.text = "💬 Chat" if storia_attiva else "📖 Storia"


## Apre/chiude il cassetto Strumenti del Master (nebbia manuale, HP dei combattenti, atmosfera).
func _toggle_strumenti_master() -> void:
	_master_tools.alterna()


## Accende/spegne l'atmosfera procedurale (vento/onde/drone/tamburi, scelta dagli eventi).
func _toggle_musica() -> void:
	AmbienceManager.imposta_attiva(not AmbienceManager.is_attiva())
	_musica_btn.text = "🎵 Musica: ON" if AmbienceManager.is_attiva() else "🔇 Musica: OFF"


## Accende/spegne la lettura ad alta voce della narrazione del Master (TTS del sistema operativo).
func _toggle_voce_master() -> void:
	if not MasterVoice.e_disponibile():
		GameState.announce(
			"🔇 Voce Master non disponibile su questo sistema (manca il sintetizzatore vocale).")
		return
	MasterVoice.imposta_attiva(not MasterVoice.is_attiva())
	_voce_btn.text = "🔊 Voce Master: ON" if MasterVoice.is_attiva() else "🔇 Voce Master: OFF"


func _toggle_fullscreen() -> void:
	var fullscreen: bool = DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
	DisplayServer.window_set_mode(
		DisplayServer.WINDOW_MODE_WINDOWED if fullscreen else DisplayServer.WINDOW_MODE_FULLSCREEN
	)


## I pulsanti Evoca pescano dal bestiario della CAMPAGNA ATTIVA: l'avanguardia e' il mostro
## piu' debole (in coppia), il bruto il piu' robusto sotto CR 3 — cosi' in Terra di Mezzo si
## evocano Goblin di Moria e Uruk-hai, a Ventimiglia Goblin e Orchi, senza nomi fissi nel codice.
func _spawn_avanguardia() -> void:
	# Encounter Balancer (Modulo 37): la quantita'/statistiche si scalano sul party REALE, non sono
	# fisse — con un party forte potrebbero comparire piu' nemici, con uno debole/ferito meno.
	var nome: String = _nome_dal_bestiario(true)
	if not nome.is_empty():
		EncounterBalancer.spawn_bilanciato([{ "name": nome, "count": 2 }])


func _spawn_bruto() -> void:
	var nome: String = _nome_dal_bestiario(false)
	if not nome.is_empty():
		EncounterBalancer.spawn_bilanciato([{ "name": nome, "count": 1 }])


## Nome di un mostro del set attivo: `debole`=true il piu' fragile, false il piu' tosto tra i
## gregari (HP piu' alti ma niente boss: si resta sotto i 35 HP, gli scontri rapidi non
## meritano un Balrog).
func _nome_dal_bestiario(debole: bool) -> String:
	var set_attivo: String = CampaignDirector.bestiario_attuale()
	var scelto: Dictionary = {}
	for m: Dictionary in CombatManager.get_monster_catalog():
		if String(m.get("set", "ventimiglia")) != set_attivo:
			continue
		var hp: int = int(m.get("hitPoints", 1))
		if not debole and hp > 35:
			continue
		if scelto.is_empty():
			scelto = m
			continue
		var hp_scelto: int = int(scelto.get("hitPoints", 1))
		if (debole and hp < hp_scelto) or (not debole and hp > hp_scelto):
			scelto = m
	return String(scelto.get("name", ""))


func _end_combat() -> void:
	CombatManager.end_combat()


func _toolbar_button(text: String, handler: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 44)
	b.pressed.connect(handler)
	return b
