extends Node
## CoverManager (Autoload) — COPERTURA (D&D 5e, stile BG3): un bersaglio riparato da un ostacolo
## e' piu' difficile da colpire a distanza. MEZZA copertura = +2 CA, TRE QUARTI = +5 CA.
##
## Le celle di copertura sono quelle occupate dai PROPS piazzati sul Mondo cucito (alberi, rocce,
## casse, botti...): WorldProps le registra qui a ogni modifica del layout. Quando si risolve un
## attacco A DISTANZA, resolve_attack chiede il bonus: se un prop sta TRA attaccante e bersaglio
## (nella cella subito davanti al bersaglio, sulla linea verso chi tira), il bersaglio e' coperto.
## La mischia ignora la copertura (si e' adiacenti). E' "terreno": vale finche' i props restano.
##
## Registrazione: Project Settings > Autoload -> "CoverManager" (dopo CombatManager).

signal copertura_cambiata()

var _celle: Dictionary = {}   # "x,y" -> livello (1 = mezza/+2, 2 = tre quarti/+5)


func _chiave(cell_x: int, cell_y: int) -> String:
	return "%d,%d" % [cell_x, cell_y]


## WorldProps rimpiazza l'intera mappa delle celle di copertura (chiamato a ogni layout salvato).
func imposta_celle(celle: Dictionary) -> void:
	_celle = celle.duplicate()
	copertura_cambiata.emit()


## La cella di copertura piu' VICINA a `cella` entro `raggio` (distanza Chebyshev, esclusa la
## cella stessa), o null se nessun riparo a portata. Usata dalla regia del Master ("il goblin
## si nasconde dietro le casse"): il token corre al riparo piu' a portata di zampa.
func cella_copertura_vicina(cella: Vector2i, raggio: int) -> Variant:
	var migliore: Variant = null
	var distanza_migliore: int = raggio + 1
	for k: String in _celle:
		var parti: PackedStringArray = k.split(",")
		if parti.size() != 2:
			continue
		var c := Vector2i(int(parti[0]), int(parti[1]))
		var d: int = maxi(absi(c.x - cella.x), absi(c.y - cella.y))
		if d > 0 and d < distanza_migliore:
			distanza_migliore = d
			migliore = c
	return migliore


func copertura_di(cell_x: int, cell_y: int) -> int:
	return int(_celle.get(_chiave(cell_x, cell_y), 0))


## Bonus di CA dato dalla copertura del bersaglio rispetto all'attaccante (0 se nessuna). Guarda
## la cella subito DAVANTI al bersaglio sulla linea verso l'attaccante: se e' coperta, il colpo
## deve superare il riparo. Le posizioni arrivano da CombatManager (celle di combattimento).
func bonus_ca(attacker_id: String, target_id: String) -> int:
	var a: Variant = CombatManager.get_combatant_cell(attacker_id)
	var t: Variant = CombatManager.get_combatant_cell(target_id)
	if not (a is Vector2i and t is Vector2i):
		return 0
	var dir := Vector2i(
		signi((a as Vector2i).x - (t as Vector2i).x),
		signi((a as Vector2i).y - (t as Vector2i).y))
	if dir == Vector2i.ZERO:
		return 0
	var davanti: Vector2i = (t as Vector2i) + dir
	var liv: int = copertura_di(davanti.x, davanti.y)
	if liv <= 0:
		return 0
	return 5 if liv >= 2 else 2


func reset() -> void:
	_celle.clear()
	copertura_cambiata.emit()
