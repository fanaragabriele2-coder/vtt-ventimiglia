extends Node
## UiSfx (Autoload) — i suoni dell'INTERFACCIA: il tavolo risponde alla mano.
##  - CLICK su OGNI pulsante del gioco: agganciato in automatico via node_added (ogni BaseButton
##    che entra nell'albero riceve il tick alla pressione — zero cablaggi nei singoli pannelli);
##  - PANNELLO: il whoosh d'apertura, suonato da UiFx.entra (una sola porta d'ingresso);
##  - ORO: il tintinnio all'acquisto dal mercante (evento "oro:speso");
##  - RACCOLTO: il chime del pickup (stesso evento "oggetto:raccolto" del ToastUi);
##  - FANFARA: il level-up (ProgressionManager.leveled_up).
## Stinger sintetizzati da tools/genera_sfx_h2.py (assets/sfx). Volume basso: punteggiatura.

const CARTELLA: String = "res://assets/sfx"
const VOCI: Array[String] = ["click", "pannello", "oro", "fanfara", "raccolto"]
const VOLUME_DB: float = -14.0
const DIM_POOL: int = 3

var _streams: Dictionary = {}
var _pool: Array[AudioStreamPlayer] = []
var _prossimo: int = 0
var _abilitato: bool = true


func _ready() -> void:
	for nome: String in VOCI:
		var percorso: String = CARTELLA.path_join(nome + ".wav")
		if ResourceLoader.exists(percorso):
			_streams[nome] = load(percorso)
	for i: int in range(DIM_POOL):
		var p := AudioStreamPlayer.new()
		p.volume_db = VOLUME_DB
		add_child(p)
		_pool.append(p)
	GameState.event_published.connect(_su_evento)
	ProgressionManager.leveled_up.connect(
		func(_id: String, _da: int, _a: int, _hp: int) -> void: suona("fanfara"))
	# CLICK GLOBALE: ogni pulsante che nasce da qui in poi fa tick. Gli autoload partono prima
	# della scena principale, quindi node_added vede TUTTI i pulsanti del gioco.
	get_tree().node_added.connect(_su_nodo_aggiunto)


func _su_nodo_aggiunto(nodo: Node) -> void:
	if nodo is BaseButton:
		(nodo as BaseButton).pressed.connect(_su_click)


func _su_click() -> void:
	suona("click")


func _su_evento(nome_evento: String, _dati: Variant) -> void:
	match nome_evento:
		"oggetto:raccolto":
			suona("raccolto")
		"oro:speso":
			suona("oro")


## Suona uno stinger d'interfaccia per nome. Ignora nomi ignoti e audio spento.
func suona(nome: String) -> void:
	if not _abilitato or not _streams.has(nome):
		return
	var p: AudioStreamPlayer = _pool[_prossimo]
	_prossimo = (_prossimo + 1) % _pool.size()
	p.stream = _streams[nome]
	p.play()


func set_enabled(v: bool) -> void:
	_abilitato = v


func is_enabled() -> bool:
	return _abilitato
