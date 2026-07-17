extends Node
## JourneyEvents (Autoload) — la vita lungo la strada: REGIONI VIVE, AGGUATI in marcia e
## ACCAMPAMENTO notturno. E' il compagno "di mondo" di TravelDirector (che resta pura matematica).
##
## - REGIONI: data/regioni_terra_di_mezzo.json divide il mondo in zone (Bosco Atro, Soglie di
##   Moria, Paludi Morte...) con pericolo 0-3, mostri del posto, eventi di colore e una scena
##   ambience. A ogni tappa si controlla DOVE si e' arrivati: entrando in una regione nuova la si
##   annuncia, l'ambience cambia e (se e' un luogo d'ombra, pericolo 3) il Fardello cresce.
## - AGGUATI: dopo una tappa puo' scattare un incontro coi mostri della regione (spawn bilanciato
##   sul party): probabilita' = base + pericolo della regione + Fardello; un 1 al dado e' quasi
##   sempre guai. Si combatte sul posto, poi la marcia riprende (il viaggio non si perde).
## - ACCAMPAMENTO: durante una marcia ci si puo' fermare per la notte (pulsante nel TravelPanel):
##   cala la notte sul mondo, si rischia un agguato notturno (dimezzato se Grampasso veglia con
##   voi), poi il riposo CURA tutto il party e rinfranca lo spirito (CompanySpirit.riposo). Ogni
##   tappa o notte fa passare UN GIORNO.
## Incontri e regioni sono attivi solo nella Terra di Mezzo; il conto dei giorni sempre.

signal riposo_finito

const REGIONI_PATH: String = "res://data/regioni_terra_di_mezzo.json"
const PROB_BASE: float = 0.08          # rischio d'agguato di una tappa qualunque
const PROB_PER_PERICOLO: float = 0.07  # + per livello di pericolo della regione
const PROB_CON_UNO: float = 0.5        # un 1 al dado: mezza volta su due sono guai veri
const PROB_CAMPO_BASE: float = 0.18    # rischio d'agguato di una notte al campo
const PROB_CAMPO_PERICOLO: float = 0.08
const FARDELLO_PESO: float = 0.002     # ogni punto di Fardello: +0.2% di rischio

var _regioni: Array[Dictionary] = []
var _fallback: Dictionary = {}
var _regione_corrente: String = ""
var _riposo_in_corso: bool = false
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_carica_regioni()
	TravelDirector.viaggio_iniziato.connect(_su_viaggio_iniziato)
	TravelDirector.viaggio_avanzato.connect(_su_tappa)
	# Il riposo interrotto da un agguato riprende alla vittoria (e salta se il party cade):
	# connessioni permanenti, i gestori guardano il flag _riposo_in_corso.
	CombatManager.victory.connect(_su_vittoria)
	CombatManager.party_wiped.connect(_su_party_caduto)


func _lotr() -> bool:
	return CampaignDirector.campagna_attuale_id() == "terra_di_mezzo"


## La regione che contiene la posizione (centro piu' vicino entro il suo raggio), o il fallback.
func regione_di(pos: Vector2) -> Dictionary:
	var migliore: Dictionary = _fallback
	var migliore_distanza: float = INF
	for r: Dictionary in _regioni:
		var centro := Vector2(float(r.get("x", 0)), float(r.get("y", 0)))
		var distanza: float = centro.distance_to(pos)
		if distanza <= float(r.get("raggio", 0)) and distanza < migliore_distanza:
			migliore_distanza = distanza
			migliore = r
	return migliore


func _su_viaggio_iniziato(_dati: Dictionary) -> void:
	_regione_corrente = ""  # la prima tappa riannuncia la regione di partenza


## Ogni tappa di marcia: passa un giorno, si controlla la regione, e la strada puo' mordere.
func _su_tappa(dati: Dictionary) -> void:
	CompanySpirit.avanza_giorno()
	if not _lotr():
		return
	var pos: Vector2 = dati.get("a", Vector2.ZERO)
	var regione: Dictionary = regione_di(pos)
	var nome: String = String(regione.get("nome", ""))
	if nome != _regione_corrente:
		_regione_corrente = nome
		_entra_in_regione(regione)
	if bool(dati.get("arrivato", false)) or CombatManager.is_active():
		return  # l'arrivo lo racconta il luogo (e magari il suo capitolo), non un agguato
	var roll: int = int(dati.get("roll", 10))
	var prob: float = PROB_CON_UNO if roll <= 1 else \
		PROB_BASE + float(regione.get("pericolo", 1)) * PROB_PER_PERICOLO \
		+ CompanySpirit.fardello * FARDELLO_PESO
	if _rng.randf() < prob:
		_agguato(regione, "equo" if roll <= 1 else "facile")


## Annuncia l'ingresso in una regione: evento di colore, ambience della zona, e nei luoghi
## d'ombra (pericolo 3) il Fardello si fa sentire.
func _entra_in_regione(regione: Dictionary) -> void:
	var eventi: Array = regione.get("eventi", [])
	var colore: String = ""
	if not eventi.is_empty():
		colore = " " + String(eventi[_rng.randi_range(0, eventi.size() - 1)])
	GameState.announce("🗺 %s.%s" % [String(regione.get("nome", "Terre sconosciute")), colore])
	# La voce del Master RACCONTA l'ingresso nella regione (H2): il viaggio arriva all'orecchio,
	# non solo in chat. Tono cupo da solo nelle terre d'ombra (pericolo alto).
	MasterVoice.parla("%s.%s" % [String(regione.get("nome", "Terre sconosciute")), colore],
		"terrore" if int(regione.get("pericolo", 0)) >= 3 else "narrazione")
	# Il METEO della regione (WorldWeather) e chiunque altro voglia reagire al cambio di zona.
	GameState.publish("regione:cambiata", regione)
	var scena: String = String(regione.get("scena", ""))
	if not scena.is_empty() and AmbienceManager.is_attiva():
		AmbienceManager.imposta_scena(scena)
	if int(regione.get("pericolo", 0)) >= 3:
		CompanySpirit.modifica(0, 3, "🌑 Queste terre appartengono all'Ombra: il Fardello cresce.")


## Un agguato coi mostri della regione: 1 tipo pescato dal posto, spawn bilanciato sul party.
func _agguato(regione: Dictionary, intensita: String) -> void:
	var mostri: Array = regione.get("mostri", [])
	if mostri.is_empty():
		return
	var nome_mostro: String = String(mostri[_rng.randi_range(0, mostri.size() - 1)])
	GameState.announce("⚔ AGGUATO! Nemici vi piombano addosso lungo la strada!")
	MasterVoice.parla("Agguato! Nemici vi piombano addosso lungo la strada!", "combattimento")
	CompanionManager.commenta("agguato")
	EncounterBalancer.spawn_bilanciato([{ "name": nome_mostro, "count": 2 }], intensita)


# --- Accampamento ---

func riposo_in_corso() -> bool:
	return _riposo_in_corso


## Ci si accampa per la notte (pulsante 🏕 del TravelPanel, durante una marcia). Cala la notte;
## se l'Ombra vi trova si combatte PRIMA di dormire (il riposo arriva a vittoria ottenuta).
func accampati() -> void:
	if _riposo_in_corso or CombatManager.is_active():
		return
	_riposo_in_corso = true
	_imposta_ora("notte")
	GameState.announce("🏕 La Compagnia si accampa: fuoco basso, turni di guardia, poche parole.")
	CompanionManager.commenta("riposo")
	await get_tree().create_timer(1.8).timeout
	if not _riposo_in_corso:
		return  # annullato nel frattempo (cambio campagna, party caduto...)
	var prob: float = 0.0
	if _lotr():
		var regione: Dictionary = _regione_qui()
		prob = PROB_CAMPO_BASE + float(regione.get("pericolo", 1)) * PROB_CAMPO_PERICOLO \
			+ CompanySpirit.fardello * FARDELLO_PESO
		if CompanionManager.presente():
			prob *= 0.5  # Grampasso veglia: e' difficile sorprendere un Ramingo
	if _lotr() and _rng.randf() < prob:
		GameState.announce("🌑 Nel cuore della notte, la sentinella da' l'allarme: NON siete soli!")
		_agguato(_regione_qui(), "facile")
		return  # il riposo si completa alla vittoria (_su_vittoria)
	_fine_riposo()


## La regione della posizione attuale del party (centro del gruppo sul Mondo cucito).
func _regione_qui() -> Dictionary:
	var wb: Node = get_tree().get_first_node_in_group("world_builder")
	if wb != null and not _regione_corrente.is_empty():
		for r: Dictionary in _regioni:
			if String(r.get("nome", "")) == _regione_corrente:
				return r
	return _fallback


func _su_vittoria() -> void:
	if _riposo_in_corso:
		GameState.announce("⚔ L'agguato notturno e' respinto: il resto della notte passa tranquillo.")
		_fine_riposo()


func _su_party_caduto() -> void:
	if _riposo_in_corso:
		_riposo_in_corso = false
		_imposta_ora("giorno")
		riposo_finito.emit()


## Il riposo LUNGO compie il suo lavoro (regole 5e/BG3): tutti i PF, tutti i DADI VITA, tutti
## gli SLOT incantesimo tornano al massimo; lo spirito si alleggerisce e all'alba si riparte.
func _fine_riposo() -> void:
	if not _riposo_in_corso:
		return
	_riposo_in_corso = false
	for pg: CharacterData in CharacterManager.get_party():
		CharacterManager.heal_by_id(pg.id, 999)
		pg.hit_dice_remaining = pg.hit_dice_total
	for livello: int in range(1, 10):
		InventoryManager.set_spell_slot(livello, "remaining", 9)  # clampato al max dello slot
	CompanySpirit.riposo()
	GameState.announce("🌅 L'alba trova la Compagnia riposata: ferite chiuse, dadi vita e "
		+ "slot incantesimo ritrovati.")
	_imposta_ora("giorno")
	riposo_finito.emit()


## RIPOSO BREVE (stile BG3): ogni PG ferito spende UN DADO VITA (il suo dX + mod Costituzione)
## e recupera i PF corrispondenti. Niente notte, niente agguati: una pausa per rifiatare.
## I dadi vita sono finiti — tornano tutti col riposo lungo al campo.
func riposo_breve() -> void:
	if CombatManager.is_active():
		GameState.announce("⛔ Non si riposa con le lame sguainate: prima finisci lo scontro.")
		return
	var curati: int = 0
	for pg: CharacterData in CharacterManager.get_party():
		if pg.hp_current >= pg.hp_max:
			continue
		if pg.hit_dice_remaining <= 0:
			GameState.announce("☕ %s non ha piu' dadi vita: serve un riposo lungo." %
				pg.character_name)
			continue
		var facce: int = maxi(4, int(String(pg.hit_dice_formula).get_slice("d", 1)))
		var cura: int = maxi(1, randi_range(1, facce) + pg.modifier_of("con"))
		pg.hit_dice_remaining -= 1
		CharacterManager.heal_by_id(pg.id, cura)
		GameState.announce("☕ %s spende un dado vita (1d%d): recupera %d PF (dadi rimasti: %d)."
			% [pg.character_name, facce, cura, pg.hit_dice_remaining])
		curati += 1
	if curati == 0:
		GameState.announce("☕ Riposo breve: nessuno aveva ferite da medicare (o dadi vita).")


func _imposta_ora(nome: String) -> void:
	var wb: Node = get_tree().get_first_node_in_group("world_builder")
	if wb != null and wb.has_method("imposta_ora"):
		wb.imposta_ora(nome)


func _carica_regioni() -> void:
	if not FileAccess.file_exists(REGIONI_PATH):
		return
	var dati: Variant = JSON.parse_string(FileAccess.get_file_as_string(REGIONI_PATH))
	if not (dati is Dictionary):
		return
	_fallback = (dati as Dictionary).get("fallback", {})
	for r: Variant in (dati as Dictionary).get("regioni", []):
		if r is Dictionary:
			_regioni.append(r)
