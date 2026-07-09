extends Node
## MasterVoice (Autoload) — la VOCE del Master (parte del Task 4 del monolite "TTS non bloccante").
##
## Legge ad alta voce la NARRAZIONE del Master IA usando il sintetizzatore vocale del sistema
## operativo (DisplayServer TTS: SAPI su Windows, speech-dispatcher su Linux, AVSpeech su macOS).
## Con un PC collegato alla TV al centro del tavolo, il Master che PARLA cambia tutto: nessuno deve
## leggere lo schermo, la storia arriva a voce come da un vero DM.
##
## Non bloccante e in coda: le battute si accodano nel motore TTS del sistema (interrupt=false) e
## vengono lette una dopo l'altra mentre il gioco continua. Preferisce una voce ITALIANA se il
## sistema ne ha una; se il TTS non e' disponibile (es. Linux senza speech-dispatcher) si spegne da
## solo e lo dice una volta sola, senza mai bloccare il gioco.
##
## Registrazione: Autoload dopo AIBridge (deve poterne ascoltare i signal). Richiede il project
## setting "audio/general/text_to_speech=true" (gia' impostato in project.godot).

signal stato_cambiato(attiva: bool)
## La voce ha iniziato/finito di parlare (bordi VERI dal motore TTS del sistema): li usa
## AmbienceManager per abbassare l'atmosfera mentre il Master parla (ducking) e poi rialzarla.
signal voce_iniziata
signal voce_terminata

## Oltre questa lunghezza la battuta viene troncata a fine frase: una risposta fiume del Master non
## deve inchiodare la voce per minuti (e il testo resta comunque leggibile in chat).
const MAX_CARATTERI: int = 900

var _attiva: bool = true
var _disponibile: bool = false
var _voce_id: String = ""
var _avvisato_indisponibile: bool = false
var _prossimo_utterance_id: int = 0
var _battute_in_corso: int = 0


func _ready() -> void:
	_disponibile = DisplayServer.has_feature(DisplayServer.FEATURE_TEXT_TO_SPEECH)
	if _disponibile:
		_scegli_voce()
		# Bordi delle battute dal motore TTS vero: servono al ducking dell'atmosfera.
		DisplayServer.tts_set_utterance_callback(
			DisplayServer.TTS_UTTERANCE_STARTED, _on_utterance_iniziata)
		DisplayServer.tts_set_utterance_callback(
			DisplayServer.TTS_UTTERANCE_ENDED, _on_utterance_finita)
		DisplayServer.tts_set_utterance_callback(
			DisplayServer.TTS_UTTERANCE_CANCELED, _on_utterance_finita)
	AIBridge.master_complete.connect(_on_master_complete)
	AIBridge.speak_requested.connect(_on_speak_requested)


## Voce preferita: la prima italiana disponibile; in mancanza, la prima qualsiasi (la voce di
## default del sistema). Se non c'e' proprio nessuna voce, il TTS resta di fatto indisponibile.
func _scegli_voce() -> void:
	var italiane: PackedStringArray = DisplayServer.tts_get_voices_for_language("it")
	if not italiane.is_empty():
		_voce_id = italiane[0]
		return
	var tutte: Array = DisplayServer.tts_get_voices()
	if not tutte.is_empty() and tutte[0] is Dictionary:
		_voce_id = String((tutte[0] as Dictionary).get("id", ""))


func is_attiva() -> bool:
	return _attiva and _disponibile


func e_disponibile() -> bool:
	return _disponibile


## Accende/spegne la voce. Spegnendola, interrompe subito la battuta in corso e svuota la coda.
func imposta_attiva(attiva: bool) -> void:
	if attiva == _attiva:
		return
	_attiva = attiva
	if not attiva:
		ferma()
	elif not _disponibile:
		_avvisa_indisponibile()
	stato_cambiato.emit(is_attiva())


## Interrompe la lettura in corso e scarta le battute in coda (es. inizia un combattimento e non
## vogliamo che la voce continui a narrare la scena precedente).
func ferma() -> void:
	if _disponibile:
		DisplayServer.tts_stop()
	# tts_stop dovrebbe far scattare i CANCELED, ma non tutti i backend lo fanno: si chiude il
	# conteggio a mano, cosi' il ducking dell'atmosfera non resta mai incastrato a meta'.
	if _battute_in_corso > 0:
		_battute_in_corso = 0
		voce_terminata.emit()


## Accoda una battuta da leggere (interrupt=false: si mette in fila, non taglia quella in corso).
## Testo ripulito da emoji/markup e troncato a una frase intera entro MAX_CARATTERI.
func parla(testo: String) -> void:
	if not is_attiva():
		return
	var pulito: String = _ripulisci(testo)
	if pulito.is_empty():
		return
	DisplayServer.tts_speak(pulito, _voce_id, 60, 1.0, 1.0, _nuovo_utterance_id(), false)


func _on_master_complete(narration: String, _commands: Array) -> void:
	parla(narration)


## Il comando strutturato "speak" del Master (una battuta a voce mirata): la si legge SUBITO,
## interrompendo la narrazione in corso — e' un'intenzione esplicita del Master (es. la voce di un
## PNG che tuona), non deve aspettare la fine del racconto.
func _on_speak_requested(text: String) -> void:
	if not is_attiva():
		return
	var pulito: String = _ripulisci(text)
	if pulito.is_empty():
		return
	DisplayServer.tts_speak(pulito, _voce_id, 65, 1.05, 1.0, _nuovo_utterance_id(), true)


func _nuovo_utterance_id() -> int:
	_prossimo_utterance_id += 1
	return _prossimo_utterance_id


func _on_utterance_iniziata(_id: int) -> void:
	_battute_in_corso += 1
	if _battute_in_corso == 1:
		voce_iniziata.emit()


func _on_utterance_finita(_id: int) -> void:
	_battute_in_corso = maxi(0, _battute_in_corso - 1)
	if _battute_in_corso == 0:
		voce_terminata.emit()


func _avvisa_indisponibile() -> void:
	if _avvisato_indisponibile:
		return
	_avvisato_indisponibile = true
	GameState.announce("🔇 La voce del Master non e' disponibile su questo sistema (manca il "
		+ "sintetizzatore vocale; su Linux installa 'speech-dispatcher').")


## Prepara il testo per il sintetizzatore: via le emoji e il markup BBCode, spazi compattati, e
## troncamento gentile a fine frase se supera MAX_CARATTERI (meglio una frase intera in meno che
## una tagliata a meta').
func _ripulisci(testo: String) -> String:
	var senza_bbcode := RegEx.new()
	senza_bbcode.compile("\\[/?[^\\]]+\\]")
	var s: String = senza_bbcode.sub(testo, "", true)
	var pulito: String = ""
	for i: int in range(s.length()):
		# Tiene lettere latine (accenti inclusi), cifre e punteggiatura; scarta emoji, frecce e
		# simboli decorativi (da 0x2100 in su), che il TTS leggerebbe come nomi buffi o salterebbe.
		var c: String = s[i]
		if c.unicode_at(0) < 0x2100:
			pulito += c
	pulito = " ".join(pulito.split("\n", false))
	while pulito.contains("  "):
		pulito = pulito.replace("  ", " ")
	pulito = pulito.strip_edges()
	if pulito.length() <= MAX_CARATTERI:
		return pulito
	var taglio: int = pulito.rfind(".", MAX_CARATTERI)
	if taglio < MAX_CARATTERI / 2:
		taglio = MAX_CARATTERI
	return pulito.substr(0, taglio + 1).strip_edges()
