class_name WorldBuilder
extends Node2D
## Direttiva OMEGA — Ultra Map Stitcher & Visual Coherence Engine (open-world 2D locale).
##
## All'avvio (_ready) esegue le tre macro-funzioni della direttiva:
## 1. AUTO-STITCHING A GRIGLIA: scansiona res://assets/maps (png/jpg, ordine alfabetico) e cuce
##    le battlemap in una griglia PERFETTA — delega a MapEngineOptimized (gia' collaudato): cella
##    comune, chunk di formato diverso riscalati alla cella, zero intercapedini.
## 2. MOTORE DI COERENZA VISIVA: pacchetti diversi, un solo mondo.
##    - color grading via software: la media cromatica di ogni chunk (misurata su una miniatura
##      32x32) viene portata verso la media GLOBALE del set con self_modulate — micro-correzioni
##      (clamp 0.85..1.18): si bilanciano neri e mezzitoni senza stravolgere l'artwork;
##    - seam blending: UN ShaderMaterial condiviso fonde una banda sottile ai bordi di ogni chunk
##      verso un tono neutro comune — i due lati di ogni cucitura convergono allo stesso colore e
##      lo stacco si attenua (fondere davvero i vicini richiederebbe chunk sovrapposti);
##    - CanvasModulate globale per il ciclo giorno/tramonto/notte/dungeon (imposta_ora).
## 3. CHUNK CULLING HARDWARE-AWARE (target 6 GB di VRAM): riusa il ciclo a intervalli 0.15s di
##    MapEngineOptimized — fuori vista il chunk si nasconde, MOLTO lontano la sua texture lascia
##    proprio la VRAM (texture = null: l'ImageTexture muore di refcount, niente leak) e si
##    ricarica dal disco quando la camera torna vicina.
##
## NOTA EXPORT: le mappe si leggono come FILE grezzi (Image.load_from_file) — dall'editor
## funziona subito; in un progetto esportato vanno inclusi i *.png/jpg nei filtri di export.
##
## DUE cartelle possibili, in ordine di priorita':
## 1. user://maps — FUORI dal progetto (nella cartella dati dell'utente del sistema operativo).
##    E' la scelta CONSIGLIATA: sostituire il progetto con una versione piu' recente (un nuovo
##    zip, un git pull...) non la tocca mai, quindi le mappe qui dentro sopravvivono per sempre
##    agli aggiornamenti del gioco. Creata automaticamente vuota al primo avvio; apri_cartella_
##    mappe() la apre nel file manager del sistema, senza percorsi da copiare a mano.
## 2. res://assets/maps — dentro il repository Git, per chi preferisce versionare le mappe col
##    progetto. Usata SOLO se user://maps non contiene immagini valide.
const CARTELLA_MAPPE_UTENTE: String = "user://maps"
const CARTELLA_MAPPE_PROGETTO: String = "res://assets/maps"
const ESTENSIONI: Array[String] = ["png", "jpg", "jpeg", "webp"]
const CAMPIONE_PX: int = 32     # le statistiche cromatiche si misurano su una miniatura
const GRADING_MIN: float = 0.85  # micro-correzioni: mai stravolgere l'artwork originale
const GRADING_MAX: float = 1.18
const MINIMAPPA_LATO_MAX: int = 220  # lato maggiore della minimappa (composta UNA volta, al load)

## Il ciclo del giorno: tinte del CanvasModulate globale (tutti i chunk vi reagiscono insieme).
const ORE: Dictionary = {
	"giorno": Color(1.0, 1.0, 1.0),
	"tramonto": Color(1.0, 0.82, 0.62),
	"notte": Color(0.36, 0.41, 0.6),
	"dungeon": Color(0.55, 0.5, 0.45),
}

const SHADER_CUCITURE: String = """
shader_type canvas_item;
uniform float banda = 0.035;
uniform float forza = 0.35;
uniform vec4 tono : source_color = vec4(0.5, 0.47, 0.42, 1.0);
void fragment() {
	vec4 tex = texture(TEXTURE, UV);
	float bordo = min(min(UV.x, 1.0 - UV.x), min(UV.y, 1.0 - UV.y));
	float fusione = (1.0 - smoothstep(0.0, banda, bordo)) * forza;
	COLOR = vec4(mix(tex.rgb, tono.rgb, fusione), tex.a) * COLOR;
}
"""

## Se impostata PRIMA che il nodo entri nell'albero (WorldView la scrive subito dopo il .new(),
## prima di add_child), il builder carica SOLO da questa cartella — ignora user://maps e il
## fallback assets/maps. E' il selettore "Set" della toolbar (Mondo/Castello/Banca): ogni set
## bundled (assets/maps_castello, assets/maps_banca...) e' autosufficiente e ha il suo
## etichette.json.
var cartella_forzata: String = ""

var _motore: MapEngineOptimized
var _camera: VTTCamera
var _tinta: CanvasModulate
var _materiale_cuciture: ShaderMaterial
var _griglia: WorldGrid
var _minimappa: ImageTexture
var _atmosfera: WorldAtmosphere
var _tween_ora: Tween
var _tokens: WorldTokens
var _nemici_mondo: WorldEnemyTokens
var _combat_fx: WorldCombatFX
var _righello: WorldRuler
var _etichette: WorldLabels
var _nebbia: WorldFog
var _props: WorldProps
var _route: WorldRoute
var _npcs: WorldNpcs
var _battle_mode: WorldBattleMode
var _file_trovati: bool = false  # distingue "cartella vuota" da "file presenti ma non caricabili"
var _cartella_attiva: String = CARTELLA_MAPPE_UTENTE  # quale delle due e' stata davvero usata
var _ultimo_luogo: String = ""   # debounce degli arrivi ai luoghi (evento world:luogo)
var _in_viaggio_dadi: bool = false  # true durante una marcia a tiri: i token non si trascinano
# one-shot: inquadra il mondo intero appena il viewport ha una dimensione reale.
var _da_inquadrare: bool = false
var _rect_mappa: Rect2


func _ready() -> void:
	add_to_group("world_builder")  # il cassetto Strumenti del Master trova il mondo da qui
	_costruisci_ambiente()
	_assicura_cartella_utente()
	var chunks: Array[Sprite2D] = _cuci_mappe()
	if chunks.is_empty():
		# Se dei file erano presenti ma sono tutti falliti, _cuci_mappe() ha gia' spiegato il
		# motivo (formato/CMYK) file per file: qui si avvisa solo se ENTRAMBE le cartelle erano vuote.
		if not _file_trovati:
			GameState.announce(("🌍 Mondo: nessuna mappa trovata. TRASCINA le tue battlemap " +
				"(PNG/JPG/WebP) direttamente su questa finestra, oppure mettile in %s (pulsante " +
				"\"📁 Apri cartella mappe\") — cartella FUORI dal progetto: gli aggiornamenti " +
				"del gioco non la cancellano mai.") % percorso_cartella_utente())
		return
	_uniforma_colori(chunks)
	# Inquadra tutta la mega-mappa: differito, perche' durante _ready il SubViewport puo' non avere
	# ancora una dimensione (la prende dal container dopo il layout). Un _process one-shot aspetta
	# il primo frame con viewport valido, cosi' l'apertura mostra SEMPRE il mondo intero.
	_rect_mappa = _motore.rettangolo_mappa()
	_componi_minimappa(chunks)
	# Atmosfera (nuvole in movimento, lucciole, pulviscolo): solo se c'e' un mondo da vestire.
	_atmosfera = WorldAtmosphere.new()
	add_child(_atmosfera)
	_atmosfera.configura(_rect_mappa, _camera)
	# Props a -4: sopra la griglia (-5) ma sotto le ombre delle nuvole (-3), che cosi'
	# accarezzano anche alberi e casse; la nebbia (2) li copre finche' non si esplora.
	_props = WorldProps.new()
	_props.z_index = -4
	add_child(_props)
	_props.configura(_rect_mappa, _camera)
	# Livelli di gioco sopra il terreno, dal basso verso l'alto: etichette dei luoghi (1, sotto
	# la nebbia: i nomi si scoprono esplorando), nebbia (2), token del party (3), righello (4).
	_etichette = WorldLabels.new()
	_etichette.z_index = 1
	add_child(_etichette)
	_etichette.configura(_camera)
	_etichette.carica(_cartella_attiva)  # ogni set di mappe porta i propri nomi dei luoghi
	_nebbia = WorldFog.new()
	_nebbia.z_index = 2
	add_child(_nebbia)
	_nebbia.configura(_rect_mappa)
	# Rotta del viaggio a dadi (linea + pennino + bandierina): sopra la nebbia, sotto i token,
	# cosi' i gettoni del party restano sempre in primo piano sul tracciato.
	_route = WorldRoute.new()
	_route.z_index = 2
	add_child(_route)
	_tokens = WorldTokens.new()
	_tokens.z_index = 3
	add_child(_tokens)
	_tokens.configura(_rect_mappa, _camera)
	_tokens.token_spostato.connect(_su_token_spostato)
	# NPC del mondo (mercanti "M" e missioni "!"): marker accanto alle etichette dei loro luoghi,
	# cliccabili da vicino. Stesso piano dei token cosi' restano leggibili sopra la nebbia.
	_npcs = WorldNpcs.new()
	_npcs.z_index = 3
	add_child(_npcs)
	_npcs.configura(_camera, _etichette, _tokens)
	# Token dei NEMICI evocati in combattimento (Encounter Balancer): appaiono a distanza reale
	# dal party, stesso livello dei token del party cosi' condividono lo stesso piano visivo.
	_nemici_mondo = WorldEnemyTokens.new()
	_nemici_mondo.z_index = 3
	add_child(_nemici_mondo)
	_nemici_mondo.configura(_rect_mappa, _camera, _tokens)
	# Animazione del combattimento (affondi, proiettili, impatti, numeri di danno) SOPRA i token.
	_combat_fx = WorldCombatFX.new()
	_combat_fx.z_index = 5
	add_child(_combat_fx)
	_combat_fx.configura(_camera, _tokens, _nemici_mondo)
	# MODALITA' BATTAGLIA (stile BG3): a inizio scontro la mappa diventa l'arena — camera che si
	# stringe, penombra fuori, griglia tattica locale, coperture e alture in evidenza. Sotto i
	# token (z 2, come la nebbia) cosi' i gettoni restano sempre leggibili.
	_battle_mode = WorldBattleMode.new()
	_battle_mode.z_index = 2
	add_child(_battle_mode)
	_battle_mode.configura(_rect_mappa, _camera, _tokens, _nemici_mondo)
	_righello = WorldRuler.new()
	_righello.z_index = 4
	add_child(_righello)
	_righello.configura(_camera)
	# VIAGGIO NARRATO: quando il Master (prosa o comando moveTo) sposta il party su un POI,
	# se un'etichetta del mondo ha quel nome anche i token viaggiano li'. Connessione a metodo
	# (non lambda): si scollega da sola quando il builder viene liberato dal "Ricarica mappe".
	GameState.party_location_changed.connect(_su_viaggio_party)
	# VIAGGIO A DADI: TravelDirector regge la marcia (distanza/tappe/eventi), il builder la RENDE —
	# muove i token tappa per tappa, disegna la rotta, dirada la nebbia, pubblica l'arrivo al luogo.
	# Comando "mappa:viaggia" (moveTo del Master fuori Ventimiglia) instrada qui la destinazione.
	TravelDirector.viaggio_iniziato.connect(_su_viaggio_iniziato)
	TravelDirector.viaggio_avanzato.connect(_su_viaggio_avanzato)
	TravelDirector.viaggio_arrivato.connect(_su_viaggio_arrivato)
	TravelDirector.viaggio_annullato.connect(_su_viaggio_annullato)
	GameState.event_published.connect(_su_evento_mappa)
	_da_inquadrare = true
	set_process(true)
	# Macro-funzione 3: culling + scarico VRAM, gia' collaudati in MapEngineOptimized.
	# _props nel gruppo cullabile: le PointLight2D dei falo' si SPENGONO fuori inquadratura.
	_motore.configura(_camera, [_props])
	var da_dove: String = "user://maps (permanente)" if _cartella_attiva == CARTELLA_MAPPE_UTENTE \
		else "assets/maps del progetto"
	GameState.announce("🌍 Mondo cucito: %d mappe da %s, coerenza visiva applicata." % [
		chunks.size(), da_dove,
	])


## One-shot: appena il SubViewport ha una dimensione reale, inquadra l'intera mega-mappa e si
## spegne (il culling continua per conto suo dentro MapEngineOptimized).
func _process(_delta: float) -> void:
	if not _da_inquadrare:
		set_process(false)
		return
	if get_viewport_rect().size.x <= 0.0:
		return  # viewport non ancora dimensionato: si riprova al prossimo frame
	_da_inquadrare = false
	_camera.imposta_limiti(_rect_mappa)
	_camera.adatta_a(_rect_mappa)
	set_process(false)


## Cambia l'ora del mondo ("giorno", "tramonto", "notte", "dungeon"): un'unica manopola globale,
## tutti i chunk reagiscono insieme via CanvasModulate. La tinta non scatta piu': fa una
## DISSOLVENZA di ~1.2s (come un tramonto vero), e l'atmosfera si adegua (nuvole/lucciole).
func imposta_ora(nome: String) -> void:
	if not ORE.has(nome):
		return
	if _tween_ora != null and _tween_ora.is_valid():
		_tween_ora.kill()  # un click impaziente non lascia due dissolvenze a contendersi la tinta
	_tween_ora = create_tween()
	_tween_ora.tween_property(_tinta, "color", ORE[nome], 1.2) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	if _atmosfera != null:
		_atmosfera.imposta_ora(nome)


func statistiche() -> Dictionary:
	return _motore.statistiche() if _motore != null else {}


## Crea user://maps se non esiste ancora: cosi' e' li' pronta da trovare (col pulsante "Apri
## cartella") anche PRIMA che l'utente ci abbia mai messo un file dentro.
func _assicura_cartella_utente() -> void:
	if not DirAccess.dir_exists_absolute(CARTELLA_MAPPE_UTENTE):
		DirAccess.make_dir_recursive_absolute(CARTELLA_MAPPE_UTENTE)


## Percorso reale sul disco di user://maps (per aprirla in Esplora File/Finder/Nautilus).
func percorso_cartella_utente() -> String:
	return ProjectSettings.globalize_path(CARTELLA_MAPPE_UTENTE)


## Apre la cartella mappe consigliata nel file manager del sistema operativo: zero percorsi da
## copiare o digitare a mano. Usato dal pulsante "📁 Apri cartella mappe" della toolbar.
## shell_show_in_file_manager (non il piu' generico shell_open, meno affidabile su alcune
## piattaforme per aprire una CARTELLA) e' l'API di Godot pensata apposta per questo.
func apri_cartella_mappe() -> void:
	OS.shell_show_in_file_manager(percorso_cartella_utente())


func cartella_attiva() -> String:
	return _cartella_attiva


## Griglia da battaglia sovrapposta: 0 = spenta, altrimenti lato cella in pixel-mappa.
## Creata pigramente al primo uso; sta SOPRA i chunk (-10) e sotto token/luci.
func imposta_griglia(cella_px: float) -> void:
	if _griglia == null:
		_griglia = WorldGrid.new()
		_griglia.z_index = -5
		add_child(_griglia)
		_griglia.configura(_rect_mappa, _camera)
	_griglia.imposta_cella(cella_px)
	# Griglia e resto del tavolo vanno a braccetto: snap di token e props, conteggio righello.
	if _tokens != null:
		_tokens.cella = cella_px
	if _righello != null:
		_righello.cella = cella_px if cella_px > 0.0 else 128.0
	if _props != null:
		_props.cella = cella_px


## Accende/spegne il righello ("📏"): mentre misura, i token non rispondono al mouse.
func attiva_righello(valore: bool) -> void:
	if _righello == null:
		return
	_righello.imposta_attivo(valore)
	_aggiorna_blocco_token()


## Accende/spegne la modalita' props ("🌳"): il layer e' della vista, qui solo lo stato.
func attiva_props(valore: bool) -> void:
	if _props == null:
		return
	_props.imposta_modalita(valore)
	_aggiorna_blocco_token()


func props() -> WorldProps:
	return _props


## Gli attori della REGIA del Master (TokenDirector): i token del party, quelli dei nemici e
## le etichette dei luoghi, in un colpo solo — un solo accessor per non gonfiare la facciata.
func regia() -> Dictionary:
	return { "party": _tokens, "nemici": _nemici_mondo, "etichette": _etichette }


## VIAGGIO sul mondo verso un luogo (nome tra le etichette). Con il viaggio a dadi ATTIVO (default)
## non si teletrasporta: parte una MARCIA A TIRI (TravelDirector calcola distanza/tappe, il party
## avanza solo tirando il dado). Con il viaggio a dadi disattivato, il party ci plana come prima.
## Ritorna true se il luogo esiste (marcia avviata o planata), false se il nome non e' noto.
func viaggia_verso(nome_luogo: String) -> bool:
	if _etichette == null or _tokens == null:
		return false
	var voce: Dictionary = _etichette.trova(nome_luogo)
	if voce.is_empty():
		return false
	var pos: Vector2 = voce["pos"]
	if TravelDirector.abilitato:
		TravelDirector.inizia(String(voce["nome"]), _tokens.centro_gruppo(), pos)
		return true
	_tokens.muovi_tutti_verso(pos)
	_camera.punta(pos)
	if _nebbia != null and _nebbia.attiva():
		_nebbia.rivela(pos)
	GameState.announce("🌍 Sul mondo cucito il party si dirige verso %s." % String(voce["nome"]))
	return true


## Nomi dei luoghi del set di mappe attivo (per il selettore "Viaggia a…" della toolbar).
func nomi_luoghi() -> PackedStringArray:
	return _etichette.nomi() if _etichette != null else PackedStringArray()


func _su_viaggio_party(location: Dictionary) -> void:
	viaggia_verso(String(location.get("name", "")))


## Comando di viaggio instradato dal Master (moveTo fuori Ventimiglia) via evento globale.
func _su_evento_mappa(nome_evento: String, payload: Variant) -> void:
	if nome_evento == "mappa:viaggia" and payload is Dictionary:
		viaggia_verso(String((payload as Dictionary).get("nome", "")))


# --- Viaggio a dadi: il builder RENDE cio' che TravelDirector calcola ---

## Inizio marcia: blocca il trascinamento dei token (si avanza SOLO col dado), disegna la rotta e
## annuncia distanza e tappe. Il pannello di viaggio (TravelPanel) mostra barra e tasto Marcia.
func _su_viaggio_iniziato(dati: Dictionary) -> void:
	_in_viaggio_dadi = true
	_aggiorna_blocco_token()
	if _route != null:
		_route.imposta_rotta(dati.get("da", Vector2.ZERO), dati.get("a", Vector2.ZERO))
	GameState.announce("🧭 In marcia verso %s: ~%d km, circa %d tappe. Tira il dado per avanzare." % [
		String(dati.get("nome", "")), roundi(float(dati.get("distanza_km", 0.0))),
		int(dati.get("tappe", 0)),
	])


## Una tappa: i token planano verso il punto raggiunto, la camera segue, la rotta si aggiorna.
## L'eventuale evento della tappa finisce in chat.
func _su_viaggio_avanzato(dati: Dictionary) -> void:
	var a: Vector2 = dati.get("a", Vector2.ZERO)
	_tokens.muovi_tutti_verso(a)
	_camera.punta(a)
	if _route != null:
		_route.imposta_progresso(a)
	var evento: String = String(dati.get("evento", ""))
	if not evento.is_empty():
		GameState.announce("🎲 %d — %s" % [int(dati.get("roll", 0)), evento])


## Arrivo: sblocca i token, pulisce la rotta, dirada la nebbia sul luogo e PUBBLICA l'arrivo
## (evento world:luogo, il gancio dei capitoli di campagna).
func _su_viaggio_arrivato(nome: String) -> void:
	_in_viaggio_dadi = false
	_aggiorna_blocco_token()
	if _route != null:
		_route.pulisci()
	var voce: Dictionary = _etichette.trova(nome) if _etichette != null else {}
	if not voce.is_empty() and _nebbia != null:
		_nebbia.rivela(voce["pos"] as Vector2)
	_ultimo_luogo = nome
	GameState.announce("🏁 La compagnia giunge a %s." % nome)
	GameState.publish("world:luogo", { "name": nome })


func _su_viaggio_annullato() -> void:
	_in_viaggio_dadi = false
	_aggiorna_blocco_token()
	if _route != null:
		_route.pulisci()


## Ogni spostamento di token (a mano o da viaggio narrato) fa due cose: dirada la nebbia e,
## se il token e' arrivato VICINO a un'etichetta (300 px), pubblica l'arrivo nel luogo —
## e' il gancio su cui la campagna (CampaignDirector) innesca i capitoli. Il debounce evita
## di rioannunciare lo stesso luogo finche' non ci si allontana.
func _su_token_spostato(_id: String, pos: Vector2) -> void:
	_nebbia.rivela(pos)
	# Durante una marcia a dadi l'arrivo lo gestisce il viaggio (a destinazione): i passi
	# intermedi diradano solo la nebbia, senza annunciare luoghi sfiorati lungo la strada.
	if _in_viaggio_dadi:
		return
	if _etichette == null:
		return
	var voce: Dictionary = _etichette.piu_vicina(pos, 300.0)
	if voce.is_empty():
		_ultimo_luogo = ""  # lontani da tutto: il prossimo arrivo puo' riannunciare
		return
	var nome: String = String(voce["nome"])
	if nome == _ultimo_luogo:
		return
	_ultimo_luogo = nome
	GameState.publish("world:luogo", { "name": nome })


## I token si trascinano solo quando NE' il righello NE' la modalita' props reclamano il mouse.
func _aggiorna_blocco_token() -> void:
	if _tokens == null:
		return
	var righello_on: bool = _righello != null and _righello.attivo()
	var props_on: bool = _props != null and _props.modalita()
	# Durante una marcia a dadi il trascinamento e' bloccato: ci si muove SOLO tirando il dado.
	_tokens.blocco_input = righello_on or props_on or _in_viaggio_dadi


## Accende/spegne la nebbia ("🌫"): all'accensione rivela subito attorno ai token del party.
func attiva_nebbia(valore: bool) -> void:
	if _nebbia == null:
		return
	_nebbia.imposta_attiva(valore)
	if valore and _tokens != null:
		for pos: Vector2 in _tokens.posizioni():
			_nebbia.rivela(pos)


## Strumento del Master: svela l'intero mondo (nebbia via ovunque, resta accesa ma trasparente).
func svela_tutta_la_nebbia() -> void:
	if _nebbia != null:
		_nebbia.svela_tutto()


## Strumento del Master: rimette la coltre ovunque e riscopre solo attorno ai token del party
## (non toglie la vista al gruppo, la "resetta" — come faceva la vecchia mappa tattica).
func rinnebbia_tutto() -> void:
	if _nebbia == null:
		return
	_nebbia.rinnebbia_tutto()
	if _tokens != null:
		for pos: Vector2 in _tokens.posizioni():
			_nebbia.rivela(pos)


## La miniatura dell'intero mondo per la minimappa (null se nessuna mappa e' caricata).
func minimappa_texture() -> Texture2D:
	return _minimappa


func rettangolo() -> Rect2:
	return _rect_mappa


func camera_vtt() -> VTTCamera:
	return _camera


## Re-inquadra l'INTERO mondo cucito (pulsante "🗺 Inquadra tutto"): dopo aver zoomato ed
## esplorato, un click riporta la vista d'insieme senza dover arretrare a colpi di rotellina.
func inquadra_mondo() -> void:
	if _rect_mappa.size == Vector2.ZERO:
		return  # nessuna mappa caricata: niente da inquadrare
	_camera.imposta_limiti(_rect_mappa)
	_camera.adatta_a(_rect_mappa)


## Importa in user://maps i file passati (percorsi ASSOLUTI del sistema operativo, tipicamente
## trascinati sulla finestra del gioco): copia solo le immagini con estensione supportata.
## Ritorna quanti file ha copiato davvero — chi chiama decide se ricostruire il mondo.
func importa_mappe(percorsi: PackedStringArray) -> int:
	_assicura_cartella_utente()
	var copiati: int = 0
	for percorso: String in percorsi:
		if not ESTENSIONI.has(percorso.get_extension().to_lower()):
			continue
		var destinazione: String = percorso_cartella_utente().path_join(percorso.get_file())
		if DirAccess.copy_absolute(percorso, destinazione) == OK:
			copiati += 1
		else:
			GameState.announce("🌍 Mondo: impossibile copiare \"%s\" nella cartella mappe."
				% percorso.get_file())
	return copiati


# --- Macro-funzione 1: auto-stitching ---

## user://maps ha priorita' (sopravvive agli aggiornamenti del gioco); si ripiega su
## res://assets/maps SOLO se la cartella utente non ha proprio nessuna immagine. Un set
## FORZATO (Castello/Banca dalla toolbar) salta questa logica: usa solo la sua cartella.
func _cuci_mappe() -> Array[Sprite2D]:
	if not cartella_forzata.is_empty():
		var out_forzato: Array[Sprite2D] = _cuci_da_cartella(cartella_forzata)
		_cartella_attiva = cartella_forzata
		return out_forzato
	var out: Array[Sprite2D] = _cuci_da_cartella(CARTELLA_MAPPE_UTENTE)
	if not out.is_empty() or _file_trovati:
		_cartella_attiva = CARTELLA_MAPPE_UTENTE
		return out
	out = _cuci_da_cartella(CARTELLA_MAPPE_PROGETTO)
	if not out.is_empty() or _file_trovati:
		_cartella_attiva = CARTELLA_MAPPE_PROGETTO
	return out


## Cuce tutte le immagini di UNA cartella (res:// o user://) in griglia. Imposta _file_trovati
## SOLO se trova almeno un nome file (distingue "cartella vuota" da "file presenti ma falliti").
func _cuci_da_cartella(cartella: String) -> Array[Sprite2D]:
	var out: Array[Sprite2D] = []
	var dir: DirAccess = DirAccess.open(cartella)
	if dir == null:
		return out
	var nomi: Array[String] = []
	for nome_file: String in dir.get_files():
		if ESTENSIONI.has(nome_file.get_extension().to_lower()):
			nomi.append(nome_file)
	nomi.sort()  # ordine alfabetico = layout deterministico, riga per riga
	if nomi.is_empty():
		return out
	_file_trovati = true
	var colonne: int = maxi(1, ceili(sqrt(float(nomi.size()))))
	# I fallimenti di caricamento andavano prima solo in console (push_warning, invisibile a chi
	# gioca): ora finiscono anche in chat con nome del file, cosi' il motivo si legge in gioco.
	var falliti: PackedStringArray = []
	for i: int in range(nomi.size()):
		var riga: int = floori(float(i) / float(colonne))
		var sprite: Sprite2D = _motore.aggiungi_chunk(cartella.path_join(nomi[i]), i % colonne, riga)
		if sprite != null:
			sprite.material = _materiale_cuciture  # seam blending, materiale CONDIVISO
			out.append(sprite)
		else:
			falliti.append(nomi[i])
	if not falliti.is_empty():
		GameState.announce(("🌍 Mondo: %d immagine/i non caricata/e (%s) — formato non " % [
			falliti.size(), ", ".join(falliti)])
			+ "supportato o file danneggiato. Causa piu' frequente: JPG salvato in CMYK "
			+ "invece che RGB (Godot legge solo JPG/PNG in RGB). Riesporta l'immagine come "
			+ "PNG o JPG standard (RGB) e riprova.")
	return out


# --- Macro-funzione 2: coerenza visiva ---

## Porta la media cromatica di ogni chunk verso la media globale del set: mappe di pacchetti
## diversi convergono allo stesso bilanciamento (neri e mezzitoni allineati), da micro-correzione.
func _uniforma_colori(chunks: Array[Sprite2D]) -> void:
	var medie: Array[Color] = []
	for sprite: Sprite2D in chunks:
		medie.append(_media_cromatica(sprite.texture))
	var bersaglio: Color = Color(0, 0, 0)
	for media: Color in medie:
		bersaglio += media
	bersaglio /= float(medie.size())
	for i: int in range(chunks.size()):
		chunks[i].self_modulate = _correzione(medie[i], bersaglio)


## Media RGB della texture, misurata su una miniatura (CAMPIONE_PX^2 letture, non milioni).
## Robusto: una texture importata puo' non restituire un'immagine leggibile (get_image null,
## compressa in un formato che decompress non gestisce, o vuota) — in quel caso si torna un grigio
## neutro (nessuna correzione), MAI un crash che lascerebbe il mondo nero.
func _media_cromatica(tex: Texture2D) -> Color:
	if tex == null:
		return Color(0.5, 0.5, 0.5)
	var img: Image = tex.get_image()
	if img == null:
		return Color(0.5, 0.5, 0.5)
	if img.is_compressed() and img.decompress() != OK:
		return Color(0.5, 0.5, 0.5)
	if img.get_width() == 0 or img.get_height() == 0:
		return Color(0.5, 0.5, 0.5)
	img.resize(CAMPIONE_PX, CAMPIONE_PX, Image.INTERPOLATE_BILINEAR)
	var somma: Color = Color(0, 0, 0)
	for y: int in range(CAMPIONE_PX):
		for x: int in range(CAMPIONE_PX):
			somma += img.get_pixel(x, y)
	return somma / float(CAMPIONE_PX * CAMPIONE_PX)


## Fattore di modulazione per-canale che avvicina `media` a `bersaglio`, entro i limiti "micro".
func _correzione(media: Color, bersaglio: Color) -> Color:
	return Color(
		clampf(bersaglio.r / maxf(media.r, 0.02), GRADING_MIN, GRADING_MAX),
		clampf(bersaglio.g / maxf(media.g, 0.02), GRADING_MIN, GRADING_MAX),
		clampf(bersaglio.b / maxf(media.b, 0.02), GRADING_MIN, GRADING_MAX),
		1.0
	)


## Compone la miniatura dell'INTERO mondo per la minimappa: ogni chunk viene rimpicciolito e
## incollato alla sua posizione (in scala) su una tela unica. Succede UNA volta al caricamento
## (le texture sono tutte ancora in VRAM: il culling non ha ancora scaricato nulla), poi la
## minimappa vive di rendita — zero costo per frame. Un chunk illeggibile resta fondo scuro.
func _componi_minimappa(chunks: Array[Sprite2D]) -> void:
	if _rect_mappa.size.x <= 0.0 or _rect_mappa.size.y <= 0.0:
		return
	var scala: float = float(MINIMAPPA_LATO_MAX) / maxf(_rect_mappa.size.x, _rect_mappa.size.y)
	var tela := Image.create(
		maxi(1, roundi(_rect_mappa.size.x * scala)),
		maxi(1, roundi(_rect_mappa.size.y * scala)),
		false, Image.FORMAT_RGBA8
	)
	tela.fill(Color(0.08, 0.07, 0.06))
	for sprite: Sprite2D in chunks:
		if sprite.texture == null:
			continue
		var img: Image = sprite.texture.get_image()
		if img == null or (img.is_compressed() and img.decompress() != OK):
			continue
		if img.get_width() == 0 or img.get_height() == 0:
			continue
		# Estensione mondo del chunk: dimensione naturale x scala sprite (il riscalo alla cella).
		var rect_chunk := Rect2(sprite.position, sprite.texture.get_size() * sprite.scale)
		var thumb_w: int = maxi(1, roundi(rect_chunk.size.x * scala))
		var thumb_h: int = maxi(1, roundi(rect_chunk.size.y * scala))
		img.convert(Image.FORMAT_RGBA8)
		img.resize(thumb_w, thumb_h, Image.INTERPOLATE_BILINEAR)
		var pos := Vector2i(((rect_chunk.position - _rect_mappa.position) * scala).round())
		tela.blit_rect(img, Rect2i(0, 0, thumb_w, thumb_h), pos)
	_minimappa = ImageTexture.create_from_image(tela)


# --- Costruzione ambiente (tinta globale, shader cuciture, camera) ---

func _costruisci_ambiente() -> void:
	_tinta = CanvasModulate.new()
	_tinta.color = ORE["giorno"]
	add_child(_tinta)

	var shader := Shader.new()
	shader.code = SHADER_CUCITURE
	_materiale_cuciture = ShaderMaterial.new()
	_materiale_cuciture.shader = shader

	_motore = MapEngineOptimized.new()
	add_child(_motore)

	_camera = VTTCamera.new()
	add_child(_camera)
