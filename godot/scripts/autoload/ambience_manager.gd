extends Node
## AmbienceManager (Autoload) — atmosfera PROCEDURALE del tavolo (il resto del Task 4 del
## monolite: "ambience + ducking").
##
## Niente file audio nel repository: le basi sono SINTETIZZATE all'avvio — PCM 16-bit generato
## in GDScript e chiuso in loop SENZA cuciture (frequenze dei droni multiple intere di 1/durata,
## rumore ricucito con un crossfade coda-su-testa). Il client resta autosufficiente:
## zero asset, zero download, zero diritti da pagare.
##
## Quattro scene, scelte dagli eventi di gioco (mai a mano durante la sessione):
## - "battaglia" (tamburi bassi): quando la State Machine entra in COMBAT;
## - "dungeon"  (drone cupo):    dopo EventBus.dungeon_generated, finche' non si riemerge;
## - "mare"     (onde):          POI di categoria natura/trasporti sull'overworld;
## - "citta"    (vento basso):   tutto il resto di Ventimiglia.
## Il passaggio e' un CROSSFADE (mai tagli secchi), e quando la voce del Master parla l'atmosfera
## si ABBASSA da sola (ducking sul bus "Ambience") per poi risalire a fine battuta.

const MIX_RATE: int = 22050
const NOME_BUS: String = "Ambience"
const VOLUME_BASE_DB: float = -12.0
const VOLUME_SPENTO_DB: float = -60.0
const DUCK_DB: float = -14.0
const DURATA_CROSSFADE: float = 1.8
const DURATA_DUCK: float = 0.35

## I POI di Ventimiglia con il mare addosso (la latitudine NON basta: Balzi Rossi e Capo Mortola
## sono costieri ma piu' a nord del centro — verificato sulle coordinate reali del catalogo).
const POI_COSTIERI: Array[String] = [
	"Porto Turistico", "Lungomare", "Foce del Roya", "Balzi Rossi", "Capo Mortola",
	"Giardini Hanbury",
]

var _players: Dictionary = {}   # nome scena -> AudioStreamPlayer
var _scena: String = ""
var _attiva: bool = true
var _in_dungeon: bool = false
var _tween_duck: Tween
var _bus_index: int = -1


func _ready() -> void:
	_crea_bus()
	_costruisci_scene()
	VttCoreManager.stato_cambiato.connect(_on_stato_cambiato)
	GameState.party_location_changed.connect(_on_party_location_changed)
	EventBus.dungeon_generated.connect(_on_dungeon_generated)
	MasterVoice.voce_iniziata.connect(_on_voce_iniziata)
	MasterVoice.voce_terminata.connect(_on_voce_terminata)
	_aggiorna_scena()


func is_attiva() -> bool:
	return _attiva


func imposta_attiva(attiva: bool) -> void:
	if attiva == _attiva:
		return
	_attiva = attiva
	if attiva:
		_aggiorna_scena(true)
	else:
		for player: AudioStreamPlayer in _players.values():
			_sfuma(player, VOLUME_SPENTO_DB)
		_scena = ""


## Forzatura manuale (per il futuro cassetto Strumenti del Master): "" = torna alla scelta
## automatica guidata dagli eventi.
func imposta_scena(nome: String) -> void:
	if nome.is_empty():
		_aggiorna_scena(true)
	elif _players.has(nome):
		_attiva_scena(nome)


# --- Scelta della scena (eventi > POI, mai polling) ---

func _scena_desiderata() -> String:
	if CombatManager.is_active():
		return "battaglia"
	if _in_dungeon:
		return "dungeon"
	var luogo: Variant = GameState.get_party_location()
	if luogo is Dictionary and POI_COSTIERI.has(String((luogo as Dictionary).get("name", ""))):
		return "mare"
	return "citta"


func _aggiorna_scena(forza: bool = false) -> void:
	if not _attiva:
		return
	var nome: String = _scena_desiderata()
	if nome != _scena or forza:
		_attiva_scena(nome)


func _attiva_scena(nome: String) -> void:
	_scena = nome
	for chiave: String in _players.keys():
		var player: AudioStreamPlayer = _players[chiave]
		if chiave == nome:
			if not player.playing:
				player.volume_db = VOLUME_SPENTO_DB
				player.play()
			_sfuma(player, VOLUME_BASE_DB)
		else:
			_sfuma(player, VOLUME_SPENTO_DB)


func _sfuma(player: AudioStreamPlayer, a_db: float) -> void:
	var tween: Tween = create_tween()
	tween.tween_property(player, "volume_db", a_db, DURATA_CROSSFADE)


func _on_stato_cambiato(_da: int, _a: int) -> void:
	_aggiorna_scena()


func _on_party_location_changed(_location: Dictionary) -> void:
	_in_dungeon = false  # viaggiare sull'overworld = si e' riemersi dal sottosuolo
	_aggiorna_scena()


func _on_dungeon_generated(_tema: String, _dati: Dictionary) -> void:
	_in_dungeon = true
	_aggiorna_scena()


# --- Ducking: la voce del Master ha SEMPRE la precedenza sull'atmosfera ---

func _on_voce_iniziata() -> void:
	_duck_verso(DUCK_DB)


func _on_voce_terminata() -> void:
	_duck_verso(0.0)


func _duck_verso(db: float) -> void:
	if _bus_index < 0:
		return
	if _tween_duck != null and _tween_duck.is_valid():
		_tween_duck.kill()
	_tween_duck = create_tween()
	_tween_duck.tween_method(_imposta_volume_bus, AudioServer.get_bus_volume_db(_bus_index),
		db, DURATA_DUCK)


func _imposta_volume_bus(db: float) -> void:
	AudioServer.set_bus_volume_db(_bus_index, db)


func _crea_bus() -> void:
	# Bus dedicato: il ducking abbassa TUTTA l'atmosfera con una sola manopola, senza toccare i
	# volumi relativi delle scene (che restano ai crossfade).
	_bus_index = AudioServer.get_bus_index(NOME_BUS)
	if _bus_index == -1:
		_bus_index = AudioServer.bus_count
		AudioServer.add_bus(_bus_index)
		AudioServer.set_bus_name(_bus_index, NOME_BUS)
		AudioServer.set_bus_send(_bus_index, "Master")


# --- Sintesi delle basi (PCM 16-bit, loop senza cuciture) ---

func _costruisci_scene() -> void:
	_aggiungi_scena("citta", _sintetizza_vento(5.0))
	_aggiungi_scena("mare", _sintetizza_onde(8.0))
	_aggiungi_scena("dungeon", _sintetizza_drone(6.0))
	_aggiungi_scena("battaglia", _sintetizza_tamburi(2.4))


func _aggiungi_scena(nome: String, campioni: PackedFloat32Array) -> void:
	var player := AudioStreamPlayer.new()
	player.stream = _wav_loop(campioni)
	player.bus = NOME_BUS
	player.volume_db = VOLUME_SPENTO_DB
	add_child(player)
	_players[nome] = player


## Impacchetta i campioni [-1..1] in un AudioStreamWAV mono 16-bit in loop.
func _wav_loop(campioni: PackedFloat32Array) -> AudioStreamWAV:
	var dati := PackedByteArray()
	dati.resize(campioni.size() * 2)
	for i: int in range(campioni.size()):
		dati.encode_s16(i * 2, int(clampf(campioni[i], -1.0, 1.0) * 32000.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = MIX_RATE
	wav.stereo = false
	wav.data = dati
	wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
	wav.loop_begin = 0
	wav.loop_end = campioni.size()
	return wav


## Vento basso dei vicoli: rumore "marrone" (bianco integrato = tutto sulle basse) ricucito in
## loop con un crossfade coda-su-testa.
func _sintetizza_vento(durata: float) -> PackedFloat32Array:
	var n: int = int(durata * MIX_RATE)
	var rng := RandomNumberGenerator.new()
	rng.seed = 20250709
	var out := PackedFloat32Array()
	out.resize(n)
	var b: float = 0.0
	for i: int in range(n):
		b = (b + (rng.randf() * 2.0 - 1.0) * 0.03) * 0.997
		out[i] = clampf(b * 3.5, -1.0, 1.0) * 0.30
	return _ricuci(out, int(0.25 * MIX_RATE))


## Onde sul lungomare: lo stesso rumore, ma con un LFO d'ampiezza a CICLI INTERI nella durata
## (il respiro delle onde riparte esattamente da dove il loop finisce).
func _sintetizza_onde(durata: float) -> PackedFloat32Array:
	var out: PackedFloat32Array = _sintetizza_vento(durata)
	var cicli: float = 2.0  # due onde per loop: periodo ~4s, da spiaggia vera
	for i: int in range(out.size()):
		var t: float = float(i) / float(out.size())
		out[i] *= 0.35 + 0.65 * (0.5 + 0.5 * sin(TAU * cicli * t - PI / 2.0))
	return out


## Drone cupo della cripta: tre sinusoidi gravi con battimenti lenti. Ogni frequenza e' arrotondata
## al multiplo intero di 1/durata: il loop si chiude in fase, zero click.
func _sintetizza_drone(durata: float) -> PackedFloat32Array:
	var n: int = int(durata * MIX_RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	var frequenze: Array[float] = [
		_armonizza(55.0, durata), _armonizza(55.7, durata), _armonizza(82.5, durata),
	]
	var lfo: float = _armonizza(0.35, durata)
	for i: int in range(n):
		var t: float = float(i) / float(MIX_RATE)
		var v: float = 0.0
		for f: float in frequenze:
			v += sin(TAU * f * t)
		var respiro: float = 0.7 + 0.3 * sin(TAU * lfo * t)
		out[i] = v / 3.0 * 0.22 * respiro
	return out


## Tamburi di battaglia: colpo grave con pitch a scendere (90->45 Hz) su una battuta di 4 quarti
## a 100 BPM (2.4s esatti), piu' un colpo "fantasma" in levare. La durata E' la battuta: loop pari.
func _sintetizza_tamburi(durata: float) -> PackedFloat32Array:
	var n: int = int(durata * MIX_RATE)
	var out := PackedFloat32Array()
	out.resize(n)
	var colpi: Array[Array] = [  # [inizio in s, ampiezza]
		[0.0, 1.0], [0.6, 0.7], [1.2, 1.0], [1.8, 0.7], [2.1, 0.45],
	]
	for colpo: Array in colpi:
		var inizio: int = int(float(colpo[0]) * MIX_RATE)
		var ampiezza: float = float(colpo[1])
		var durata_colpo: int = int(0.30 * MIX_RATE)
		for j: int in range(durata_colpo):
			var idx: int = inizio + j
			if idx >= n:
				break
			var t: float = float(j) / float(MIX_RATE)
			var freq: float = 45.0 + 45.0 * exp(-t * 18.0)  # il pitch cade: il "punch" del colpo
			var inviluppo: float = exp(-t * 11.0)
			out[idx] += sin(TAU * freq * t) * inviluppo * ampiezza * 0.5
	for i: int in range(n):
		out[i] = clampf(out[i], -1.0, 1.0)
	return out


## Arrotonda una frequenza al multiplo intero di 1/durata (chiusura del loop in fase).
func _armonizza(freq: float, durata: float) -> float:
	return roundf(freq * durata) / durata


## Rende un loop di rumore senza cuciture: gli ultimi `coda` campioni sfumano DENTRO i primi
## (equal-power), poi la coda viene tagliata — la fine del loop combacia con l'inizio.
func _ricuci(campioni: PackedFloat32Array, coda: int) -> PackedFloat32Array:
	var n: int = campioni.size()
	var utile: int = n - coda
	var out := PackedFloat32Array()
	out.resize(utile)
	for i: int in range(utile):
		out[i] = campioni[i]
	for i: int in range(coda):
		var peso: float = float(i) / float(coda)
		out[i] = campioni[utile + i] * (1.0 - peso) + campioni[i] * peso
	return out
