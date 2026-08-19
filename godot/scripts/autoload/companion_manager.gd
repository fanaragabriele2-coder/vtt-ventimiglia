extends Node
## CompanionManager (Autoload) — GRAMPASSO, il compagno Ramingo della Terra di Mezzo.
##
## Il Ramingo dagli occhi grigi che vi ha presi in carico al Puledro Impennato cammina con voi
## per tutta l'avventura dell'Anello:
## - COMMENTA i momenti che contano (partenza, agguati, l'arrivo del Terrore, vittorie, arrivi,
##   il riposo al campo) con battute brevi in chat — mai piu' di una per evento, mai a raffica;
## - in COMBATTIMENTO si getta a stabilizzare un compagno morente (UNA volta per scontro: dopo
##   il suo intervento tocca a voi tenerli in vita);
## - al CAMPO la sua veglia dimezza il rischio di agguati notturni (lo usa JourneyEvents).
## Presente solo nella campagna Terra di Mezzo: a Ventimiglia tace e non interviene.

const LINEE: Dictionary = {
	"partenza": [
		"«La strada e' lunga e non aspetta. Passo svelto e occhi aperti.»",
		"«Conosco queste terre. Restate dietro di me e arriveremo.»",
		"«Ogni lega guadagnata di giorno e' una lega che l'Ombra non ci toglie di notte.»",
	],
	"agguato": [
		"«In guardia! Schiena contro schiena!»",
		"«Li sentivo da un miglio. Fate largo alle lame!»",
		"«Non e' il primo agguato che vedo. Non sara' l'ultimo. COMBATTETE!»",
	],
	"terrore": [
		"«Fuoco! Il fuoco li tiene a bada — non fatevi prendere dal gelo!»",
		"«Non guardatelo negli occhi che non ha. Colpite e rialzatevi.»",
	],
	"vittoria": [
		"«Ben combattuto. Ma non e' che una goccia nel mare che ci aspetta.»",
		"«Riprendete fiato. La strada non e' finita.»",
	],
	"arrivo": [
		"«Ci siamo. Tenete la lingua a freno e la mano vicino all'elsa.»",
		"«Riposate finche' potete: da qui in poi si fa piu' dura.»",
	],
	"riposo": [
		"«Dormite. Il primo turno di guardia e' mio, come sempre.»",
		"«Un fuoco basso e niente canti stanotte. Le orecchie dell'Ombra sono lunghe.»",
	],
	"soccorso": [
		"«Resta con me! Non si muore oggi, non sotto la mia guardia.»",
		"«Ti tengo io. Respira. RESPIRA!»",
	],
}

var _soccorso_usato: bool = false
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	TravelDirector.viaggio_iniziato.connect(_su_partenza)
	TravelDirector.viaggio_arrivato.connect(_su_arrivo)
	CombatManager.combat_started.connect(_su_combattimento)
	CombatManager.victory.connect(_su_vittoria)
	CombatManager.combatant_dying.connect(_su_morente)


## Grampasso c'e' solo nell'avventura dell'Anello.
func presente() -> bool:
	return CampaignDirector.campagna_attuale_id() == "terra_di_mezzo"


## Una battuta dal pool indicato (usata anche da JourneyEvents per agguati e riposo).
func commenta(tipo: String) -> void:
	if not presente() or not LINEE.has(tipo):
		return
	var pool: Array = LINEE[tipo]
	GameState.announce("🗡 Grampasso: %s" % String(pool[_rng.randi_range(0, pool.size() - 1)]))


func _su_partenza(_dati: Dictionary) -> void:
	commenta("partenza")


func _su_arrivo(_nome: String) -> void:
	if _rng.randf() < 0.6:
		commenta("arrivo")


func _su_combattimento() -> void:
	_soccorso_usato = false
	if CompanySpirit.terrore_in_vista():
		commenta("terrore")


func _su_vittoria() -> void:
	if _rng.randf() < 0.4:
		commenta("vittoria")


## Un compagno cade morente: il Ramingo si getta a stabilizzarlo (una volta per scontro).
## Un breve respiro di scena, poi la presa: se nel frattempo e' gia' stato curato, non serve.
func _su_morente(id: String) -> void:
	if not presente() or _soccorso_usato:
		return
	_soccorso_usato = true
	await get_tree().create_timer(1.4).timeout
	if CombatManager.is_pc_dying(id) and not CombatManager.is_pc_stable(id):
		commenta("soccorso")
		CombatManager.stabilizza(id)
