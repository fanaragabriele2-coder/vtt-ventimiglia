extends Node
## MusicDirector (Autoload) — la MUSICA adattiva del tavolo: l'atmosfera (AmbienceManager) e' il
## rumore del mondo, questa e' la MELODIA che gli sta sopra. Tre temi, SINTETIZZATI all'avvio
## come tutto l'audio procedurale del progetto (zero file, zero licenze), chiusi in loop senza
## cuciture (frequenze dei droni multiple intere di 1/durata + ricucitura coda-su-testa):
##  - "esplorazione": arpeggio pizzicato in RE minore pentatonico su un drone morbido — il passo
##    calmo della Compagnia in cammino;
##  - "battaglia": tamburi che martellano e un motivo minore incalzante — parte a combat_started;
##  - "terrore": due droni gravi che BATTONO tra loro (55 vs 55.5 Hz), un tritono che si gonfia,
##    un battito di cuore — parte quando tra i nemici c'e' un'ombra grande (Nazgul, Balrog,
##    Re Stregone, spettri).
## Il passaggio e' sempre un CROSSFADE; quando la voce del Master parla, la musica si abbassa
## (ducking sul bus "Musica") e risale a fine battuta. `imposta_attiva(false)` spegne tutto.

const MIX_RATE: int = 22050
const NOME_BUS: String = "Musica"
const VOLUME_BASE_DB: float = -16.0
const VOLUME_SPENTO_DB: float = -60.0
const DUCK_DB: float = -12.0
const DURATA_CROSSFADE: float = 2.5
const DURATA_DUCK: float = 0.35
## Nemici la cui sola presenza cambia la musica in "terrore".
const OMBRE_GRANDI: Array[String] = ["nazgul", "balrog", "stregone", "spettro"]

var _players: Dictionary = {}   # nome tema -> AudioStreamPlayer
var _tema: String = ""
var _attiva: bool = true
var _tween_duck: Tween
var _bus_index: int = -1


func _ready() -> void:
	_crea_bus()
	_costruisci_temi()
	CombatManager.combat_started.connect(_su_inizio_scontro)
	CombatManager.combat_ended.connect(func() -> void: imposta_tema("esplorazione"))
	MasterVoice.voce_iniziata.connect(func() -> void: _duck_verso(DUCK_DB))
	MasterVoice.voce_terminata.connect(func() -> void: _duck_verso(0.0))
	imposta_tema("esplorazione")


func is_attiva() -> bool:
	return _attiva


func imposta_attiva(attiva: bool) -> void:
	if attiva == _attiva:
		return
	_attiva = attiva
	if attiva:
		imposta_tema(_tema if not _tema.is_empty() else "esplorazione", true)
	else:
		for player: AudioStreamPlayer in _players.values():
			_sfuma(player, VOLUME_SPENTO_DB)


## Porta la musica su un tema ("esplorazione", "battaglia", "terrore") con un crossfade.
func imposta_tema(nome: String, forza: bool = false) -> void:
	if nome == _tema and not forza:
		return
	_tema = nome
	if not _attiva:
		return
	for chiave: String in _players.keys():
		var player: AudioStreamPlayer = _players[chiave]
		if chiave == nome:
			if not player.playing:
				player.volume_db = VOLUME_SPENTO_DB
				player.play()
			_sfuma(player, VOLUME_BASE_DB)
		else:
			_sfuma(player, VOLUME_SPENTO_DB)


## A combat_started: "terrore" se tra i combattenti c'e' un'ombra grande, altrimenti "battaglia".
func _su_inizio_scontro() -> void:
	var tema: String = "battaglia"
	for c: Variant in CombatManager.get_state()["combatants"]:
		var nome: String = String((c as Dictionary).get("name", "")).to_lower()
		for ombra: String in OMBRE_GRANDI:
			if nome.contains(ombra):
				tema = "terrore"
				break
		if tema == "terrore":
			break
	imposta_tema(tema)


func _sfuma(player: AudioStreamPlayer, a_db: float) -> void:
	var tween: Tween = create_tween()
	tween.tween_property(player, "volume_db", a_db, DURATA_CROSSFADE)


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
	_bus_index = AudioServer.get_bus_index(NOME_BUS)
	if _bus_index == -1:
		_bus_index = AudioServer.bus_count
		AudioServer.add_bus(_bus_index)
		AudioServer.set_bus_name(_bus_index, NOME_BUS)
		AudioServer.set_bus_send(_bus_index, "Master")


# --- Sintesi dei temi (PCM 16-bit, loop senza cuciture) ---

func _costruisci_temi() -> void:
	_aggiungi_tema("esplorazione", _tema_esplorazione(12.8))
	_aggiungi_tema("battaglia", _tema_battaglia(9.6))
	_aggiungi_tema("terrore", _tema_terrore(14.0))


func _aggiungi_tema(nome: String, campioni: PackedFloat32Array) -> void:
	var player := AudioStreamPlayer.new()
	player.stream = _wav_loop(campioni)
	player.bus = NOME_BUS
	player.volume_db = VOLUME_SPENTO_DB
	add_child(player)
	_players[nome] = player


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


## Freq piu' vicina con un numero INTERO di cicli nel loop: il drone non "salta" al riavvolgersi.
func _armonizza(freq: float, durata: float) -> float:
	return roundf(freq * durata) / durata


## Una NOTA PIZZICATA (fondamentale + 2 armonici, decadimento esponenziale) sommata nel buffer.
func _pizzica(buf: PackedFloat32Array, inizio: float, freq: float, amp: float, k: float) -> void:
	var da: int = int(inizio * MIX_RATE)
	var n: int = mini(int(1.6 * MIX_RATE), buf.size() - da)
	for i: int in range(n):
		var x: float = float(i) / MIX_RATE
		var inv: float = exp(-k * x) * minf(1.0, x / 0.008)
		buf[da + i] += amp * inv * (sin(TAU * freq * x)
			+ 0.45 * sin(TAU * 2.0 * freq * x) + 0.2 * sin(TAU * 3.0 * freq * x))


## Un COLPO DI TAMBURO (seno che scivola verso il grave + soffio) sommato nel buffer.
func _tamburo(buf: PackedFloat32Array, inizio: float, f0: float, amp: float) -> void:
	var da: int = int(inizio * MIX_RATE)
	var n: int = mini(int(0.35 * MIX_RATE), buf.size() - da)
	var rng := RandomNumberGenerator.new()
	rng.seed = int(inizio * 1000.0)
	for i: int in range(n):
		var x: float = float(i) / MIX_RATE
		var inv: float = exp(-11.0 * x)
		buf[da + i] += amp * inv * (sin(TAU * (f0 - f0 * 0.5 * x / 0.35) * x)
			+ 0.35 * rng.randf_range(-1.0, 1.0) * exp(-30.0 * x))


## ESPLORAZIONE: drone RE2+LA2 sotto, arpeggio pentatonico di RE minore sopra (8 note x 2 giri).
func _tema_esplorazione(durata: float) -> PackedFloat32Array:
	var n: int = int(durata * MIX_RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var re2: float = _armonizza(73.42, durata)
	var la2: float = _armonizza(110.0, durata)
	for i: int in range(n):
		var x: float = float(i) / MIX_RATE
		var respiro: float = 0.8 + 0.2 * sin(TAU * x / durata)  # 1 ciclo esatto: loop pulito
		buf[i] = 0.10 * respiro * (sin(TAU * re2 * x) + 0.6 * sin(TAU * la2 * x))
	var scala: Array[float] = [146.83, 174.61, 220.0, 261.63, 293.66, 261.63, 220.0, 174.61]
	for giro: int in range(2):
		for j: int in range(scala.size()):
			# Il secondo giro varia la chiusura: l'orecchio non sente il "disco rotto".
			var freq: float = scala[j] if giro == 0 or j < 6 else scala[7 - j % 2]
			_pizzica(buf, (giro * 8 + j) * 0.8, freq, 0.16, 2.2)
	return _ricuci(buf, int(0.4 * MIX_RATE))


## BATTAGLIA: tamburi di guerra su 16 battiti (0.6s), motivo minore LA-DO-MI che incalza.
func _tema_battaglia(durata: float) -> PackedFloat32Array:
	var n: int = int(durata * MIX_RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var la1: float = _armonizza(55.0, durata)
	for i: int in range(n):
		var x: float = float(i) / MIX_RATE
		buf[i] = 0.06 * sin(TAU * la1 * x)
	for b: int in range(16):
		var forte: bool = b % 4 == 0
		_tamburo(buf, b * 0.6, 70.0 if forte else 105.0, 0.5 if forte else 0.3)
		if b % 4 == 2:
			_tamburo(buf, b * 0.6 + 0.3, 105.0, 0.24)  # controtempo: la carica non e' un metronomo
	var motivo: Array[float] = [110.0, 130.81, 164.81, 130.81]
	for g: int in range(4):
		for j: int in range(motivo.size()):
			_pizzica(buf, g * 2.4 + j * 0.6 + 0.15, motivo[(j + g) % motivo.size()], 0.11, 4.0)
	return _ricuci(buf, int(0.3 * MIX_RATE))


## TERRORE: due droni che BATTONO (55 vs 55.5 Hz), tritono che si gonfia, battito di cuore.
func _tema_terrore(durata: float) -> PackedFloat32Array:
	var n: int = int(durata * MIX_RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var basso_a: float = _armonizza(55.0, durata)
	var basso_b: float = _armonizza(55.5, durata)
	var acuto: float = _armonizza(466.16, durata)
	for i: int in range(n):
		var x: float = float(i) / MIX_RATE
		var lfo: float = 0.5 + 0.5 * sin(TAU * 2.0 * x / durata)  # 2 cicli esatti nel loop
		buf[i] = 0.14 * (sin(TAU * basso_a * x) + sin(TAU * basso_b * x)) \
			+ 0.03 * lfo * sin(TAU * acuto * x)
	# Il TRITONO (SI1 -> FA2): l'intervallo del diavolo, gonfiato due volte nel giro.
	for inizio: float in [2.0, 8.5]:
		var da: int = int(inizio * MIX_RATE)
		var lung: int = mini(int(3.0 * MIX_RATE), n - da)
		for i: int in range(lung):
			var x: float = float(i) / MIX_RATE
			var gonfia: float = pow(sin(PI * x / 3.0), 2.0)
			buf[da + i] += 0.12 * gonfia * (sin(TAU * 61.74 * x) + 0.7 * sin(TAU * 87.31 * x))
	for inizio: float in [5.5, 5.9, 12.0, 12.4]:   # il cuore: due battiti doppi
		_tamburo(buf, inizio, 58.0, 0.30)
	return _ricuci(buf, int(0.4 * MIX_RATE))


## Ultimi `coda` campioni sfusi DENTRO i primi, poi tagliati: fine e inizio del loop combaciano.
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
