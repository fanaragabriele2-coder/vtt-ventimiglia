extends Node
## TravelSfx (Autoload) — i suoni del VIAGGIO: la strada si sente, non solo si legge.
##  - PASSI a ogni tappa di marcia (TravelDirector.viaggio_avanzato): la Compagnia cammina;
##  - stinger di REGIONE quando si entra in un territorio nuovo ("regione:cambiata"):
##      · Moria (e le sue soglie)      -> i TAMBURI nel profondo,
##      · Rohan / Campi del Pelennor   -> il CORNO che chiama a raccolta,
##      · regioni di PIOGGIA           -> il TUONO in lontananza;
##  - CORNO anche all'arrivo a destinazione (viaggio_arrivato): la meta va salutata.
## Stinger sintetizzati da tools/genera_sfx_h2.py (assets/sfx). Volume basso: scenografia.

const CARTELLA: String = "res://assets/sfx"
const VOCI: Array[String] = ["passi", "tuono", "corno", "tamburi"]
const VOLUME_DB: float = -12.0
const DIM_POOL: int = 2

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
	TravelDirector.viaggio_avanzato.connect(func(_dati: Dictionary) -> void: suona("passi"))
	TravelDirector.viaggio_arrivato.connect(func(_nome: String) -> void: suona("corno"))
	GameState.event_published.connect(_su_evento)


func _su_evento(nome_evento: String, dati: Variant) -> void:
	if nome_evento != "regione:cambiata" or not (dati is Dictionary):
		return
	var regione: Dictionary = dati
	var nome: String = String(regione.get("nome", "")).to_lower()
	if nome.contains("moria"):
		suona("tamburi")
	elif nome.contains("rohan") or nome.contains("pelennor"):
		suona("corno")
	elif String(regione.get("meteo", "")) == "pioggia":
		suona("tuono")


## Suona uno stinger di viaggio per nome. Ignora nomi ignoti e audio spento.
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
