extends Node
## TravelJournal (Autoload) — il DIARIO DI VIAGGIO della Compagnia.
##
## Scrive da solo, giorno per giorno, le gesta del party: partenze e arrivi, agguati respinti,
## boss abbattuti, compagni caduti, notti al campo. Le voci si leggono nel pannello 📓 Diario
## (JournalPanel) e sopravvivono alle sessioni (persistenza per campagna in user://).
##
## Tiene anche l'elenco dei LUOGHI VISITATI: le etichette del Mondo cucito dei posti dove non
## siete mai stati si disegnano attenuate (WorldLabels chiede luogo_visitato) — la mappa si
## "accende" nome dopo nome, man mano che la si cammina davvero.
##
## A racconto finito (StoryDirector.racconto_finito) compone il RIEPILOGO delle gesta: giorni di
## cammino, scontri vinti, luoghi toccati — il canto della vostra avventura.

signal diario_aggiornato

const SALVATAGGIO: String = "user://diario_viaggio.json"
const MAX_VOCI: int = 250

var _voci: Array = []            # [{ "giorno": int, "testo": String }]
var _visitati: Array = []        # nomi normalizzati dei luoghi gia' toccati
var _vittorie: int = 0
var _ultimi_nemici: String = ""  # nomi dell'ultimo incontro bilanciato (per la voce di vittoria)


func _ready() -> void:
	_carica()
	TravelDirector.viaggio_iniziato.connect(_su_partenza)
	CombatManager.victory.connect(_su_vittoria)
	CombatManager.combatant_died_final.connect(_su_caduto)
	StoryDirector.racconto_finito.connect(_su_racconto_finito)
	GameState.event_published.connect(_su_evento)


## Le voci del diario (per il pannello), dalla piu' vecchia alla piu' recente.
func voci() -> Array:
	return _voci.duplicate(true)


## Il party e' mai arrivato in questo luogo? (WorldLabels attenua i nomi mai visitati)
func luogo_visitato(nome: String) -> bool:
	return _visitati.has(_normalizza(nome))


## Aggiunge una voce al diario col giorno corrente della Compagnia.
func scrivi(testo: String) -> void:
	_voci.append({ "giorno": CompanySpirit.giorno, "testo": testo })
	while _voci.size() > MAX_VOCI:
		_voci.pop_front()
	diario_aggiornato.emit()
	_salva()


func _su_partenza(dati: Dictionary) -> void:
	scrivi("In marcia verso %s: ~%d km di strada davanti a noi." % [
		String(dati.get("nome", "una nuova meta")), roundi(float(dati.get("distanza_km", 0.0))),
	])


func _su_vittoria() -> void:
	_vittorie += 1
	if _ultimi_nemici.is_empty():
		scrivi("Uno scontro vinto: la Compagnia e' ancora in piedi.")
	else:
		scrivi("Abbiamo avuto la meglio su: %s." % _ultimi_nemici)
	_ultimi_nemici = ""
	_salva()


func _su_caduto(id: String) -> void:
	var nome: String = String(CombatManager.get_combatant(id).get("name", "Un compagno"))
	scrivi("%s e' caduto. Il suo nome non sara' dimenticato." % nome)


## Fine del racconto: il diario compone il canto delle gesta della Compagnia.
func _su_racconto_finito() -> void:
	var recap: String = ("FINE DEL RACCONTO — %d giorni di cammino, %d scontri vinti, "
		+ "%d luoghi toccati. Le vostre gesta sono ora un canto della Terra di Mezzo.") % [
		CompanySpirit.giorno, _vittorie, _visitati.size(),
	]
	scrivi(recap)
	GameState.announce("📓 " + recap)


func _su_evento(nome_evento: String, payload: Variant) -> void:
	match nome_evento:
		"campagna:cambiata":
			_carica()
			diario_aggiornato.emit()
		"encounter:balanced":
			if payload is Dictionary:
				_memorizza_nemici(payload)
		"world:luogo":
			if payload is Dictionary:
				_arrivo(String((payload as Dictionary).get("name", "")))


func _arrivo(nome: String) -> void:
	if nome.is_empty():
		return
	var chiave: String = _normalizza(nome)
	if _visitati.has(chiave):
		return
	_visitati.append(chiave)
	scrivi("La Compagnia giunge per la prima volta a %s." % nome)


## Ricorda i nomi dell'ultimo incontro bilanciato: alla vittoria diventano la voce del diario.
func _memorizza_nemici(encounter: Dictionary) -> void:
	var nomi: PackedStringArray = []
	for t: Variant in encounter.get("lista", []):
		if t is Dictionary:
			var voce: String = String((t as Dictionary).get("name", ""))
			var count: int = int((t as Dictionary).get("count", 1))
			nomi.append(voce if count <= 1 else "%s ×%d" % [voce, count])
	_ultimi_nemici = ", ".join(nomi)


func _normalizza(testo: String) -> String:
	var s: String = testo.to_lower().strip_edges()
	var accenti: Dictionary = {
		"à": "a", "á": "a", "è": "e", "é": "e", "ì": "i", "í": "i",
		"ò": "o", "ó": "o", "ù": "u", "ú": "u", "û": "u",
	}
	for k: String in accenti:
		s = s.replace(k, accenti[k])
	return s


# --- Persistenza per campagna ---

func _salva() -> void:
	var tutto: Dictionary = _leggi_file()
	tutto[CampaignDirector.campagna_attuale_id()] = {
		"voci": _voci, "visitati": _visitati, "vittorie": _vittorie,
	}
	var file: FileAccess = FileAccess.open(SALVATAGGIO, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(tutto))


func _carica() -> void:
	var dati: Dictionary = _leggi_file().get(CampaignDirector.campagna_attuale_id(), {})
	_voci = dati.get("voci", []) if dati.get("voci") is Array else []
	_visitati = dati.get("visitati", []) if dati.get("visitati") is Array else []
	_vittorie = int(dati.get("vittorie", 0))


func _leggi_file() -> Dictionary:
	if not FileAccess.file_exists(SALVATAGGIO):
		return {}
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(SALVATAGGIO))
	return dati if dati is Dictionary else {}
