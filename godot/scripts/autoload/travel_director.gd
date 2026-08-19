extends Node
## TravelDirector (Autoload) — "Viaggio guidato dai dadi".
##
## Quando il Master dichiara uno spostamento (o il giocatore sceglie una meta dalla toolbar), il
## party NON si teletrasporta: LA MAPPA CALCOLA TUTTO — distanza reale sul mondo cucito, numero di
## tappe di marcia, avanzata di ogni tiro — e ci si muove SOLO tirando il dado. Ogni 1d20 fa
## avanzare la compagnia verso la meta di una frazione che dipende dal risultato: un tiro alto
## divora la strada, un tiro basso e' una giornata storta (maltempo, guadi, deviazioni), un 20 e'
## una cavalcata e un 1 un imprevisto. Quando la distanza percorsa raggiunge il totale, si arriva.
##
## Questo autoload e' PURO stato + matematica: non conosce ne' token ne' camera. WorldBuilder
## ascolta i suoi segnali e RENDE il viaggio (muove i gettoni tappa per tappa, disegna la rotta,
## dirada la nebbia, pubblica l'arrivo nel luogo). Cosi' la logica del viaggio sopravvive a ogni
## "Ricarica mappe" (il builder si puo' ricreare, il viaggio no).

signal viaggio_iniziato(dati: Dictionary)
signal viaggio_avanzato(dati: Dictionary)
signal viaggio_arrivato(nome: String)
signal viaggio_annullato

## Scala dell'overworld: quanti km rappresenta un pixel del mondo cucito (solo per il "sapore":
## le distanze mostrate in km/giorni; la matematica lavora in pixel).
const KM_PER_PX: float = 0.5
## Lunghezza indicativa di una TAPPA di marcia in pixel-mondo: fissa quante volte, in media, si
## deve tirare per coprire un tragitto (una tappa ~ un tiro medio).
const PX_PER_TAPPA: float = 340.0
const KM_PER_GIORNO: float = 30.0
const TAPPE_MIN: int = 2
const TAPPE_MAX: int = 8
## Sotto questa distanza residua (px) si considera raggiunta la meta.
const ARRIVO_EPSILON_PX: float = 8.0

## Eventi di viaggio a tema. Vuoti = tappa tranquilla. Pescati a seconda del tiro e della campagna.
const BOON_LOTR: Array[String] = [
	"Il sentiero e' sgombro e il cielo terso: divorate la strada e il morale si leva.",
	"Un vecchio miliare degli Uomini del Nord vi indica la via piu' breve: guadagnate terreno.",
	"Il vento vi spinge alle spalle come una mano amica: la marcia vola.",
]
const GUAI_LOTR: Array[String] = [
	"Un fiume in piena vi costringe a una lunga deviazione: perdete quasi una giornata.",
	"Nebbia fitta cala sulle terre selvagge e rallenta ogni passo.",
	"Un grido lontano nel cielo vi fa acquattare tra le rocce, in attesa che l'Ombra passi.",
	"Il sentiero si perde nel pantano: tornate sui vostri passi e ricominciate.",
]
const FLASH_LOTR: Array[String] = [
	"Corvi neri vi seguono di cresta in cresta: qualcuno sa dove andate.",
	"Rovine coperte d'edera raccontano di un regno che fu, prima dell'Ombra.",
	"Fuochi lontani, di notte, all'orizzonte: eserciti in marcia, non i vostri.",
	"Un cippo elfico mezzo sepolto brilla debolmente al vostro passaggio.",
	"Il profilo aguzzo di monti che non c'erano: vi state avvicinando a un confine oscuro.",
]
const BOON_VENT: Array[String] = [
	"Strade libere e cielo aperto: filate spediti verso la meta.",
	"Un passante indica una scorciatoia tra i vicoli: guadagnate tempo.",
]
const GUAI_VENT: Array[String] = [
	"Un posto di blocco vi costringe a un lungo giro.",
	"Pioggia battente sul lungomare: si procede a fatica.",
]
const FLASH_VENT: Array[String] = [
	"Il profumo del mare e il vociare del mercato vi accompagnano.",
	"Campane in lontananza scandiscono il cammino.",
]

## Interruttore del viaggio a dadi: ON = ogni spostamento dichiarato dal Master diventa una marcia
## a tiri; OFF = teletrasporto immediato (modalita' sandbox). Di default ON: e' la richiesta.
var abilitato: bool = true

var _attivo: bool = false
var _nome: String = ""
var _pos_partenza: Vector2 = Vector2.ZERO
var _pos_dest: Vector2 = Vector2.ZERO
var _pos_corrente: Vector2 = Vector2.ZERO
var _dist_totale: float = 0.0
var _dist_percorsa: float = 0.0
var _tappe: int = TAPPE_MIN
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func in_viaggio() -> bool:
	return _attivo


func destinazione() -> String:
	return _nome


## Avvia una marcia da `pos_partenza` a `pos_dest`. Se la distanza e' trascurabile si e' gia'
## arrivati (emette subito viaggio_arrivato). Un nuovo viaggio sostituisce il precedente.
func inizia(nome: String, pos_partenza: Vector2, pos_dest: Vector2) -> void:
	_nome = nome
	_pos_partenza = pos_partenza
	_pos_dest = pos_dest
	_pos_corrente = pos_partenza
	_dist_totale = pos_partenza.distance_to(pos_dest)
	_dist_percorsa = 0.0
	_tappe = clampi(roundi(_dist_totale / PX_PER_TAPPA), TAPPE_MIN, TAPPE_MAX)
	if _dist_totale <= ARRIVO_EPSILON_PX:
		_attivo = false
		viaggio_arrivato.emit(_nome)
		return
	_attivo = true
	viaggio_iniziato.emit(_riepilogo())


## Un colpo di dado (tipicamente 1d20) fa avanzare la compagnia. Ritorna il dizionario della tappa
## (per chi non ascolta il segnale). Fuori da un viaggio non fa nulla.
func avanza(totale_dado: int, facce: int = 20) -> Dictionary:
	if not _attivo:
		return {}
	var r: int = clampi(totale_dado, 1, facce)
	var fattore: float = _fattore(r, facce)
	var base: float = _dist_totale / float(_tappe)
	var restante_prima: float = _dist_totale - _dist_percorsa
	var avanzata: float = minf(base * fattore, restante_prima)
	_dist_percorsa += avanzata
	var frazione: float = clampf(_dist_percorsa / _dist_totale, 0.0, 1.0)
	_pos_corrente = _pos_partenza.lerp(_pos_dest, frazione)
	var arrivato: bool = (_dist_totale - _dist_percorsa) <= ARRIVO_EPSILON_PX
	var dati: Dictionary = {
		"nome": _nome,
		"a": _pos_corrente,
		"roll": r,
		"facce": facce,
		"avanzata_km": avanzata * KM_PER_PX,
		"restante_km": maxf(0.0, _dist_totale - _dist_percorsa) * KM_PER_PX,
		"frazione": frazione,
		"tappe": _tappe,
		"evento": _evento(r, facce, arrivato),
		"arrivato": arrivato,
	}
	viaggio_avanzato.emit(dati)
	if arrivato:
		_attivo = false
		viaggio_arrivato.emit(_nome)
	return dati


func annulla() -> void:
	if not _attivo:
		return
	_attivo = false
	viaggio_annullato.emit()


func _riepilogo() -> Dictionary:
	var km: float = _dist_totale * KM_PER_PX
	return {
		"nome": _nome,
		"distanza_km": km,
		"giorni": maxi(1, roundi(km / KM_PER_GIORNO)),
		"tappe": _tappe,
		"da": _pos_partenza,
		"a": _pos_dest,
	}


## Quanto pesa un tiro sull'avanzata: 1 = strisciata (giornata storta), 20 = cavalcata; in mezzo,
## proporzionale al risultato attorno alla media del dado, con un pavimento e un tetto perche'
## nessun tiro sia inutile del tutto ne' teletrasporti a destinazione.
func _fattore(r: int, facce: int) -> float:
	if r >= facce:
		return 2.2
	if r <= 1:
		return 0.35
	var medio: float = (float(facce) + 1.0) / 2.0
	return clampf(float(r) / medio, 0.45, 1.9)


## Evento della tappa, a tema con la campagna attuale. Vuoto = niente di rilevante. All'arrivo mai
## eventi (il momento dell'arrivo lo racconta il luogo).
func _evento(r: int, facce: int, arrivato: bool) -> String:
	if arrivato:
		return ""
	var lotr: bool = CampaignDirector.campagna_attuale_id() != "ventimiglia"
	if r >= facce:
		return _pesca(BOON_LOTR if lotr else BOON_VENT)
	if r <= 1:
		return _pesca(GUAI_LOTR if lotr else GUAI_VENT)
	if _rng.randf() < 0.22:
		return _pesca(FLASH_LOTR if lotr else FLASH_VENT)
	return ""


func _pesca(pool: Array[String]) -> String:
	if pool.is_empty():
		return ""
	return pool[_rng.randi_range(0, pool.size() - 1)]
