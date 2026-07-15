extends Node
## CompanySpirit (Autoload) — il FARDELLO dell'Ombra e la SPERANZA della Compagnia.
##
## Due misure di gruppo, il cuore tematico dell'avventura dell'Anello:
## - FARDELLO (0..100): la corruzione che pesa sulle spalle. Cresce vicino ai Nazgul (nemici
##   dal comportamento "terrore"), nei luoghi oscuri (Moria, Cirith Ungol, le Paludi...) e nelle
##   giornate storte di marcia (un 1 al dado). Cala riposando e nei luoghi sicuri. Piu' pesa,
##   piu' le PROVE del racconto si fanno dure (-1 ogni 25 punti) e piu' l'Ombra vi trova
##   (JourneyEvents alza il rischio di agguati col fardello).
## - SPERANZA (0..100, parte a 50): il morale della Compagnia. Le vittorie la alzano, i compagni
##   caduti e il terrore la spengono. Alta (>=70) da' +1 alle prove e ai tiri salvezza contro la
##   morte; bassa (<=25) li penalizza di 1 — si muore piu' facilmente quando non si spera piu'.
## Tiene anche il conto dei GIORNI di cammino (ogni tappa di marcia o riposo = un giorno).
##
## Attivo solo nella campagna Terra di Mezzo (fuori, i modificatori valgono 0 e nulla si accumula).
## Persistenza per campagna in user:// — lo spirito della Compagnia sopravvive alle sessioni.

signal stato_cambiato(speranza: int, fardello: int, giorno: int)

const SALVATAGGIO: String = "user://spirito_compagnia.json"
const SPERANZA_INIZIALE: int = 50
## Luoghi che pesano sul cuore (arrivo -> punti di fardello) e rifugi che lo alleggeriscono.
const LUOGHI_OSCURI: Dictionary = {
	"Cancello Ovest di Moria": 4, "Cirith Ungol": 5, "Paludi Morte": 4,
	"Cancelli Neri": 5, "Emyn Muil": 2,
}
const LUOGHI_SICURI: Dictionary = {
	"Brea": { "speranza": 2, "fardello": -2 },
	"Guado di Bruinen": { "speranza": 3, "fardello": -4 },
}

var speranza: int = SPERANZA_INIZIALE
var fardello: int = 0
var giorno: int = 1

# catalogId -> comportamento (da monsters.json): serve a riconoscere i nemici "terrore" (Nazgul).
var _comportamenti: Dictionary = {}
var _terrore_in_vista: bool = false


func _ready() -> void:
	_carica_comportamenti()
	_carica()
	CombatManager.combatant_added.connect(_su_combattente_aggiunto)
	CombatManager.combat_started.connect(_su_combattimento_iniziato)
	CombatManager.combat_ended.connect(func() -> void: _terrore_in_vista = false)
	CombatManager.victory.connect(_su_vittoria)
	CombatManager.combatant_dying.connect(_su_morente)
	CombatManager.combatant_died_final.connect(_su_caduto)
	CombatManager.combatant_revived.connect(_su_rialzato)
	TravelDirector.viaggio_avanzato.connect(_su_tappa)
	GameState.event_published.connect(_su_evento)


## Attivo solo nell'avventura dell'Anello: fuori dalla Terra di Mezzo lo spirito non si muove.
func attivo() -> bool:
	return CampaignDirector.campagna_attuale_id() == "terra_di_mezzo"


## C'e' un Nazgul (o il Re Stregone) nello scontro in corso? (per Grampasso e per gli annunci)
func terrore_in_vista() -> bool:
	return _terrore_in_vista


## Modificatore dello spirito alle PROVE del racconto: speranza alta +1 / bassa -1, e -1 ogni
## 25 punti di fardello. E' la voce "spirito" nel tiro mostrato in chat.
func mod_prove() -> int:
	if not attivo():
		return 0
	var m: int = 0
	if speranza >= 70:
		m += 1
	elif speranza <= 25:
		m -= 1
	return m - int(floorf(fardello / 25.0))


## Modificatore ai TIRI SALVEZZA CONTRO LA MORTE: chi spera ancora si aggrappa alla vita (+1),
## chi non spera piu' scivola via (-1). I 20 e gli 1 naturali restano naturali.
func mod_tiri_morte() -> int:
	if not attivo():
		return 0
	if speranza >= 70:
		return 1
	if speranza <= 25:
		return -1
	return 0


## Variazione di spirito con annuncio (solo se qualcosa cambia davvero). `motivo` finisce in chat.
func modifica(d_speranza: int, d_fardello: int, motivo: String = "") -> void:
	if not attivo():
		return
	var s: int = clampi(speranza + d_speranza, 0, 100)
	var f: int = clampi(fardello + d_fardello, 0, 100)
	if s == speranza and f == fardello:
		return
	speranza = s
	fardello = f
	if not motivo.is_empty():
		GameState.announce(motivo)
	stato_cambiato.emit(speranza, fardello, giorno)
	_salva()


## Un giorno di cammino passa (una tappa di marcia, o una notte di riposo).
func avanza_giorno() -> void:
	giorno += 1
	stato_cambiato.emit(speranza, fardello, giorno)
	_salva()


## Una notte di riposo al campo: il corpo guarisce (JourneyEvents), lo spirito si alleggerisce.
func riposo() -> void:
	avanza_giorno()
	modifica(2, -3, "🕯 La notte di riposo rincuora la Compagnia e alleggerisce l'Ombra.")


# --- Reazioni agli eventi di gioco ---

func _su_combattente_aggiunto(combatant: Dictionary) -> void:
	if String(combatant.get("kind", "")) == "pc":
		return
	var cid: String = String(combatant.get("catalogId", ""))
	if String(_comportamenti.get(cid, "")) == "terrore":
		_terrore_in_vista = true


func _su_combattimento_iniziato() -> void:
	if _terrore_in_vista:
		modifica(-4, 6, "🌑 Il gelo dei Nazgul cala sul campo: il Fardello pesa, la Speranza trema.")


func _su_vittoria() -> void:
	if _terrore_in_vista:
		modifica(5, -2, "🕯 Avete respinto gli Spettri: la Speranza della Compagnia divampa.")
	else:
		modifica(3, 0, "")


func _su_morente(_id: String) -> void:
	modifica(-3, 0, "")


func _su_caduto(id: String) -> void:
	var nome: String = String(CombatManager.get_combatant(id).get("name", "un compagno"))
	modifica(-8, 0, "🕯 La caduta di %s spegne un lume nel cuore della Compagnia." % nome)


func _su_rialzato(_id: String) -> void:
	modifica(3, 0, "")


## Ogni tappa di marcia: un 1 al dado e' una giornata che lascia il segno.
func _su_tappa(dati: Dictionary) -> void:
	if int(dati.get("roll", 10)) <= 1:
		modifica(0, 2, "")


func _su_evento(nome_evento: String, payload: Variant) -> void:
	if nome_evento == "campagna:cambiata":
		_carica()
		stato_cambiato.emit(speranza, fardello, giorno)
		return
	if nome_evento != "world:luogo" or not (payload is Dictionary):
		return
	var luogo: String = String((payload as Dictionary).get("name", ""))
	if LUOGHI_OSCURI.has(luogo):
		modifica(0, int(LUOGHI_OSCURI[luogo]),
			"🌑 %s: l'oscurita' di questo luogo si posa sulle vostre spalle." % luogo)
	elif LUOGHI_SICURI.has(luogo):
		var dono: Dictionary = LUOGHI_SICURI[luogo]
		modifica(int(dono.get("speranza", 0)), int(dono.get("fardello", 0)),
			"🕯 %s: un rifugio sicuro rinfranca la Compagnia." % luogo)


# --- Dati e persistenza ---

func _carica_comportamenti() -> void:
	if not FileAccess.file_exists("res://data/monsters.json"):
		return
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/monsters.json"))
	if not (dati is Dictionary):
		return
	for m: Variant in (dati as Dictionary).get("monsters", []):
		if m is Dictionary:
			_comportamenti[String((m as Dictionary).get("id", ""))] = \
				String((m as Dictionary).get("comportamento", "standard"))


func _salva() -> void:
	var tutto: Dictionary = _leggi_file()
	tutto[CampaignDirector.campagna_attuale_id()] = {
		"speranza": speranza, "fardello": fardello, "giorno": giorno,
	}
	var file: FileAccess = FileAccess.open(SALVATAGGIO, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(tutto))


func _carica() -> void:
	var dati: Dictionary = _leggi_file().get(CampaignDirector.campagna_attuale_id(), {})
	speranza = int(dati.get("speranza", SPERANZA_INIZIALE))
	fardello = int(dati.get("fardello", 0))
	giorno = int(dati.get("giorno", 1))


func _leggi_file() -> Dictionary:
	if not FileAccess.file_exists(SALVATAGGIO):
		return {}
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(SALVATAGGIO))
	return dati if dati is Dictionary else {}
