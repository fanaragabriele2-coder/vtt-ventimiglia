extends Node
## RelicsManager (Autoload) — i DONI DEL CAMMINO, il set di reliquie dell'avventura dell'Anello.
##
## Sette reliquie si guadagnano lungo il racconto (dai bivi, dalle prove riuscite, dai boss):
## Lama del Ramingo, Amuleto del Viandante, Foglia di Lorien, Cotta di Mithril, Arco dei
## Galadhrim, Spada del Ramingo Ricomposta, Stella Serena. Piu' Doni la Compagnia raccoglie,
## piu' il set "canta":
## - 2 Doni: +1 alle PROVE del racconto (la strada riconosce i suoi);
## - 4 Doni: +1 ai TIRI PER COLPIRE dei PG (le mani antiche guidano le vostre);
## - 6 Doni: +1 ai TIRI SALVEZZA dei PG (la luce dell'Ovest veglia su di voi).
## Il conteggio segue l'inventario (pezzi DISTINTI: due copie non contano doppio); al passaggio
## di ogni soglia lo annuncia in chat. Premia chi esplora i bivi della storia invece di correre.

signal reliquie_cambiate(quante: int)

const RELIQUIE: Array[String] = [
	"r-lama-ramingo", "r-amuleto-viandante", "r-foglia-lorien", "e-cotta-mithril",
	"e-arco-galadhrim", "l-spada-ramingo-ricomposta", "l-stella-serena",
]
const SOGLIE: Dictionary = {
	2: "🌟 2 Doni del Cammino: la strada vi riconosce — +1 alle prove del racconto.",
	4: "🌟 4 Doni del Cammino: mani antiche guidano le vostre — +1 ai tiri per colpire.",
	6: "🌟 6 Doni del Cammino: la luce dell'Ovest veglia su di voi — +1 ai tiri salvezza.",
}

var _quante: int = 0


func _ready() -> void:
	InventoryManager.inventory_changed.connect(_su_inventario)
	_ricalcola(InventoryManager.get_inventory())


func conta() -> int:
	return _quante


## +1 alle prove del racconto con almeno 2 Doni.
func bonus_prove() -> int:
	return 1 if _quante >= 2 else 0


## +1 ai tiri per colpire dei PG con almeno 4 Doni.
func bonus_attacco() -> int:
	return 1 if _quante >= 4 else 0


## +1 ai tiri salvezza dei PG con almeno 6 Doni.
func bonus_ts() -> int:
	return 1 if _quante >= 6 else 0


func _su_inventario(inventory: Array) -> void:
	_ricalcola(inventory)


## Conta i Doni DISTINTI presenti nello zaino e annuncia le soglie appena varcate.
func _ricalcola(inventory: Array) -> void:
	var trovate: Array[String] = []
	for e: Variant in inventory:
		if not (e is Dictionary):
			continue
		var cid: String = String((e as Dictionary).get("catalogId", ""))
		if RELIQUIE.has(cid) and not trovate.has(cid):
			trovate.append(cid)
	var nuove: int = trovate.size()
	if nuove == _quante:
		return
	for soglia: int in SOGLIE:
		if _quante < soglia and nuove >= soglia:
			GameState.announce(String(SOGLIE[soglia]))
	_quante = nuove
	reliquie_cambiate.emit(_quante)
