extends Node
## FlankingSystem (Autoload singleton) — porting del Modulo 25 JS "Fiancheggiamento" (stile BG3 /
## regola opzionale 5e). Quando due alleati sono su celle adiacenti al bersaglio su lati OPPOSTI (o
## angoli opposti), il bersaglio e' fiancheggiato: gli attacchi in mischia contro di lui hanno
## vantaggio. Solo logica + lettura delle posizioni in CombatManager, nessuna mutazione di stato.
##
## Registrazione: Project Settings > Autoload -> "FlankingSystem" (dopo CombatManager).

const NESSUNA_DIREZIONE: Vector2i = Vector2i(999, 999)


static func _segno(v: int) -> int:
	return 1 if v > 0 else (-1 if v < 0 else 0)


static func _chebyshev(a: Vector2i, b: Vector2i) -> int:
	return maxi(absi(a.x - b.x), absi(a.y - b.y))


## Direzione unitaria dalla cella 'da' verso 'a' (dx,dy in -1..1). NESSUNA_DIREZIONE se non adiacenti.
static func direzione_verso(da: Vector2i, a: Vector2i) -> Vector2i:
	if _chebyshev(da, a) != 1:
		return NESSUNA_DIREZIONE
	return Vector2i(_segno(a.x - da.x), _segno(a.y - da.y))


## Due celle adiacenti al bersaglio fiancheggiano se le direzioni dal bersaglio sono opposte su
## ENTRAMBI gli assi (lati opposti N/S, E/O, o angoli opposti NE/SO, NO/SE).
static func sta_fiancheggiando(bersaglio: Vector2i, cella_a: Vector2i, cella_b: Vector2i) -> bool:
	var d_a: Vector2i = direzione_verso(bersaglio, cella_a)
	var d_b: Vector2i = direzione_verso(bersaglio, cella_b)
	if d_a == NESSUNA_DIREZIONE or d_b == NESSUNA_DIREZIONE:
		return false
	return d_a.x == -d_b.x and d_a.y == -d_b.y


## Cerca un alleato dell'attaccante che fiancheggi il bersaglio insieme a lui. Ritorna il suo id, o
## stringa vuota se nessuno fiancheggia.
func trova_alleato_fiancheggiante(attaccante_id: String, bersaglio_id: String) -> String:
	var attaccante: Dictionary = CombatManager.get_combatant(attaccante_id)
	var bersaglio: Dictionary = CombatManager.get_combatant(bersaglio_id)
	if attaccante.is_empty() or bersaglio.is_empty():
		return ""
	if String(attaccante["kind"]) == String(bersaglio["kind"]):
		return ""  # fazioni uguali: non ha senso fiancheggiare
	if CombatManager.cell_distance(attaccante_id, bersaglio_id) != 1:
		return ""  # l'attaccante deve essere in mischia
	var pos_bersaglio: Variant = CombatManager.get_combatant_cell(bersaglio_id)
	var pos_attaccante: Variant = CombatManager.get_combatant_cell(attaccante_id)
	if pos_bersaglio == null or pos_attaccante == null:
		return ""

	var stato: Dictionary = CombatManager.get_state()
	for c: Dictionary in stato["combatants"]:
		var cid: String = String(c["id"])
		if cid == attaccante_id or cid == bersaglio_id or bool(c["defeated"]):
			continue
		if String(c["kind"]) != String(attaccante["kind"]):
			continue  # deve essere alleato dell'attaccante
		if CombatManager.cell_distance(cid, bersaglio_id) != 1:
			continue  # deve essere anche lui in mischia col bersaglio
		var pos_alleato: Variant = CombatManager.get_combatant_cell(cid)
		if pos_alleato == null:
			continue
		if sta_fiancheggiando(pos_bersaglio, pos_attaccante, pos_alleato):
			return cid
	return ""


## Regola di sovrapposizione 5e: il fiancheggiamento da' vantaggio, che si annulla con uno
## svantaggio gia' presente (torna "normale"); se il tiro e' gia' a vantaggio, resta tale.
static func modalita_effettiva(modalita_scelta: String, fiancheggiato: bool) -> String:
	if not fiancheggiato:
		return modalita_scelta if not modalita_scelta.is_empty() else "normal"
	if modalita_scelta == "disadvantage":
		return "normal"
	return "advantage"


func valuta_fiancheggiamento(attaccante_id: String, bersaglio_id: String) -> Dictionary:
	var alleato: String = trova_alleato_fiancheggiante(attaccante_id, bersaglio_id)
	return { "fiancheggiato": not alleato.is_empty(), "alleatoId": alleato }
