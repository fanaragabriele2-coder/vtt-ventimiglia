extends Node
## EnemyAI (Autoload singleton) — porting del Modulo 33 JS "IA dei nemici" (turno automatico PNG).
##
## Prima di questo modulo, al turno di un PNG non succedeva nulla: bisognava premere "Termina
## turno" al posto suo. Ora, al proprio turno, un PNG vivo si avvicina al PG piu' vicino e, se a
## portata di mischia, lo attacca (tiro e danni REALI via CombatManager), poi conclude il turno.
##
## Agganciato a CombatManager.turn_changed invece del polling a 700ms del monolite (li' serviva a
## rilevare da soli il cambio turno; qui il signal lo notifica gia'). Una breve pausa rende
## leggibile l'azione prima di procedere.
##
## Registrazione: Project Settings > Autoload -> "EnemyAI" (dopo CombatManager).

const PORTATA_MOVIMENTO: int = 6   # celle percorribili in un turno (~9 m con celle da 1,5 m)
const PAUSA_AZIONE_SEC: float = 0.5
# Bordi della griglia tattica (coerenti con TacticalMap.GRID_COLS/ROWS): l'arciere non arretra fuori.
const GRIGLIA_MAX_X: int = 25
const GRIGLIA_MAX_Y: int = 17

var _abilitata: bool = true
var _ultima_chiave_turno: String = ""


func _ready() -> void:
	CombatManager.turn_changed.connect(_on_turn_changed)


## chiave = round:indice:id — dedup contro doppie emissioni dello stesso turno (stesso principio
## di ultimaChiaveTurno nel JS): NON blocca la naturale ricorsione quando questo stesso modulo,
## concludendo il turno di un PNG, fa scattare il turno_changed del PNG SUCCESSIVO in catena.
func _on_turn_changed(combatant_id: String, round_number: int) -> void:
	if not _abilitata:
		return
	var stato: Dictionary = CombatManager.get_state()
	var cur: Dictionary = CombatManager.get_combatant(combatant_id)
	if cur.is_empty() or String(cur["kind"]) != "npc" or bool(cur["defeated"]):
		return
	if _pg_vivi(stato).is_empty():
		return  # nessun PG vivo da attaccare: non far girare a vuoto i turni dei nemici
	var chiave: String = "%d:%d:%s" % [round_number, int(stato["currentTurnIndex"]), combatant_id]
	if chiave == _ultima_chiave_turno:
		return
	_ultima_chiave_turno = chiave
	await get_tree().create_timer(PAUSA_AZIONE_SEC).timeout
	_agisci_nemico(cur)


static func chebyshev(a: Vector2i, b: Vector2i) -> int:
	return maxi(absi(a.x - b.x), absi(a.y - b.y))


## Cella di destinazione avvicinandosi al bersaglio, senza mai finire sopra di lui (si ferma al
## massimo su una cella adiacente). null se gia' adiacente (niente da fare).
static func cella_verso_bersaglio(npc_cell: Vector2i, pc_cell: Vector2i, portata: int) -> Variant:
	var dist: int = chebyshev(npc_cell, pc_cell)
	if dist <= 1:
		return null
	var passi: int = mini(portata, dist - 1)
	var step_x: int = clampi(pc_cell.x - npc_cell.x, -passi, passi)
	var step_y: int = clampi(pc_cell.y - npc_cell.y, -passi, passi)
	return Vector2i(npc_cell.x + step_x, npc_cell.y + step_y)


func _pg_vivi(stato: Dictionary) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for c: Dictionary in stato["combatants"]:
		if String(c["kind"]) == "pc" and not bool(c["defeated"]) and int(c["hitPoints"]) > 0:
			out.append(c)
	return out


## Il PG vivo con il token piu' vicino al PNG (se le posizioni sono note), altrimenti il primo vivo.
func bersaglio_piu_vicino(stato: Dictionary, npc_id: String) -> Dictionary:
	var candidati: Array[Dictionary] = _pg_vivi(stato)
	if candidati.is_empty():
		return {}
	var npc_cell: Variant = CombatManager.get_combatant_cell(npc_id)
	if npc_cell == null:
		return candidati[0]
	var migliore: Dictionary = {}
	var min_dist: int = 999999
	for pc: Dictionary in candidati:
		var pc_cell: Variant = CombatManager.get_combatant_cell(String(pc["id"]))
		var d: int = chebyshev(npc_cell, pc_cell) if pc_cell != null else 1000
		if d < min_dist:
			min_dist = d
			migliore = pc
	return migliore if not migliore.is_empty() else candidati[0]


func _agisci_nemico(cur: Dictionary) -> void:
	var stato: Dictionary = CombatManager.get_state()
	var bersaglio: Dictionary = bersaglio_piu_vicino(stato, String(cur["id"]))
	if bersaglio.is_empty():
		CombatManager.next_turn()
		return

	var npc_cell: Variant = CombatManager.get_combatant_cell(String(cur["id"]))
	var pc_cell: Variant = CombatManager.get_combatant_cell(String(bersaglio["id"]))
	var gittata: int = CombatManager.attack_range_of(String(cur["id"]))

	if npc_cell != null and pc_cell != null:
		if gittata > 1:
			_agisci_a_distanza(cur, bersaglio, npc_cell, pc_cell, gittata)
		else:
			_agisci_in_mischia(cur, bersaglio, npc_cell, pc_cell)
	else:
		# Nessuna posizione nota (nessun token piazzato): il PNG attacca comunque.
		CombatManager.resolve_attack(String(cur["id"]), String(bersaglio["id"]), "normal")

	CombatManager.next_turn()


## Nemico da mischia: avanza (evitando le celle occupate) e colpisce se arriva adiacente.
## TATTICA: se puo' arrivare in mischia questo turno, tra le celle adiacenti al bersaglio
## preferisce quella che crea un FIANCHEGGIAMENTO con un alleato (vantaggio al tiro) —
## i nemici ora vi GIRANO ATTORNO invece di mettersi in fila indiana.
func _agisci_in_mischia(cur: Dictionary, bersaglio: Dictionary, npc_cell: Vector2i, pc_cell: Vector2i) -> void:
	var dist: int = chebyshev(npc_cell, pc_cell)
	if dist > 1:
		var dest: Variant = null
		var fiancheggia: bool = false
		if dist - 1 <= PORTATA_MOVIMENTO:
			var scelta: Dictionary = _cella_mischia_migliore(String(cur["id"]), npc_cell, pc_cell)
			dest = scelta.get("cella")
			fiancheggia = bool(scelta.get("fiancheggia", false))
		if dest == null:
			dest = _cella_libera_verso(String(cur["id"]), npc_cell, pc_cell)
		if dest != null:
			CombatManager.set_combatant_cell(String(cur["id"]), dest)
			GameState.announce(("⚔ %s aggira %s e lo prende ai fianchi!" if fiancheggia
				else "👣 %s avanza verso %s.") % [String(cur["name"]), String(bersaglio["name"])])
		npc_cell = CombatManager.get_combatant_cell(String(cur["id"]))
		dist = chebyshev(npc_cell, pc_cell) if npc_cell != null else 999
	if dist <= 1:
		CombatManager.resolve_attack(String(cur["id"]), String(bersaglio["id"]), "normal")
	else:
		GameState.announce("🛡 %s non riesce a raggiungere %s e resta in guardia." % [String(cur["name"]), String(bersaglio["name"])])


## Nemico da tiro (arco/incantesimo): fa KITING — se il bersaglio e' addosso (adiacente) indietreggia
## per non farsi prendere in mischia, se e' fuori gittata si avvicina quel tanto che basta, e poi
## tira se il bersaglio e' a portata. La distanza ideale e' ~gittata: sta lontano ma colpisce.
func _agisci_a_distanza(cur: Dictionary, bersaglio: Dictionary, npc_cell: Vector2i, pc_cell: Vector2i, gittata: int) -> void:
	var dist: int = chebyshev(npc_cell, pc_cell)
	if dist <= 1:
		var fuga: Variant = _cella_libera_lontano(String(cur["id"]), npc_cell, pc_cell, gittata)
		if fuga != null:
			CombatManager.set_combatant_cell(String(cur["id"]), fuga)
			GameState.announce("🏹 %s indietreggia per prendere la mira su %s." % [String(cur["name"]), String(bersaglio["name"])])
			npc_cell = CombatManager.get_combatant_cell(String(cur["id"]))
			dist = chebyshev(npc_cell, pc_cell) if npc_cell != null else dist
	elif dist > gittata:
		var dest: Variant = _cella_libera_verso(String(cur["id"]), npc_cell, pc_cell)
		if dest != null:
			CombatManager.set_combatant_cell(String(cur["id"]), dest)
			GameState.announce("🏹 %s si porta a tiro di %s." % [String(cur["name"]), String(bersaglio["name"])])
			npc_cell = CombatManager.get_combatant_cell(String(cur["id"]))
			dist = chebyshev(npc_cell, pc_cell) if npc_cell != null else dist
	if dist >= 1 and dist <= gittata:
		CombatManager.resolve_attack(String(cur["id"]), String(bersaglio["id"]), "normal")
	elif dist > gittata:
		GameState.announce("🏹 %s non ha ancora %s a tiro." % [String(cur["name"]), String(bersaglio["name"])])


## Come cella_verso_bersaglio, ma MAI su una cella gia' occupata da un altro combattente
## (prima i nemici si accatastavano sullo stesso quadretto): se la destinazione ideale e'
## presa, accorcia il passo finche' trova una cella libera; se sono tutte prese resta fermo.
func _cella_libera_verso(npc_id: String, npc_cell: Vector2i, pc_cell: Vector2i) -> Variant:
	var occupate: Dictionary = {}
	for c: Dictionary in CombatManager.get_state()["combatants"]:
		var cid: String = String(c["id"])
		if cid == npc_id or bool(c["defeated"]):
			continue
		var cella: Variant = CombatManager.get_combatant_cell(cid)
		if cella != null:
			occupate[cella] = true
	for passi: int in range(PORTATA_MOVIMENTO, 0, -1):
		var dest: Variant = cella_verso_bersaglio(npc_cell, pc_cell, passi)
		if dest == null:
			return null
		if not occupate.has(dest):
			return dest
	return null


## La migliore cella ADIACENTE al bersaglio raggiungibile in questo turno: se una crea
## fiancheggiamento con un alleato gia' in mischia, vince quella; altrimenti la prima libera.
## Ritorna { "cella": Vector2i|null, "fiancheggia": bool }.
func _cella_mischia_migliore(npc_id: String, npc_cell: Vector2i, pc_cell: Vector2i) -> Dictionary:
	var occupate: Dictionary = {}
	var alleati_in_mischia: Array[Vector2i] = []
	for c: Dictionary in CombatManager.get_state()["combatants"]:
		var cid: String = String(c["id"])
		if cid == npc_id or bool(c["defeated"]):
			continue
		var cella: Variant = CombatManager.get_combatant_cell(cid)
		if cella == null:
			continue
		occupate[cella] = true
		if String(c["kind"]) == "npc" and chebyshev(cella, pc_cell) == 1:
			alleati_in_mischia.append(cella)
	var ripiego: Variant = null
	for dx: int in range(-1, 2):
		for dy: int in range(-1, 2):
			if dx == 0 and dy == 0:
				continue
			var cand := Vector2i(pc_cell.x + dx, pc_cell.y + dy)
			if cand.x < 0 or cand.x > GRIGLIA_MAX_X or cand.y < 0 or cand.y > GRIGLIA_MAX_Y:
				continue
			if occupate.has(cand) or chebyshev(npc_cell, cand) > PORTATA_MOVIMENTO:
				continue
			for alleato: Vector2i in alleati_in_mischia:
				if FlankingSystem.sta_fiancheggiando(pc_cell, cand, alleato):
					return { "cella": cand, "fiancheggia": true }
			if ripiego == null:
				ripiego = cand
	return { "cella": ripiego, "fiancheggia": false }


## Cella di FUGA per l'arciere: si allontana dal bersaglio (direzione opposta) di un passo di
## movimento, restando dentro la griglia e su una cella libera. null se non puo' arretrare.
func _cella_libera_lontano(npc_id: String, npc_cell: Vector2i, pc_cell: Vector2i, gittata: int) -> Variant:
	var occupate: Dictionary = {}
	for c: Dictionary in CombatManager.get_state()["combatants"]:
		var cid: String = String(c["id"])
		if cid == npc_id or bool(c["defeated"]):
			continue
		var cella: Variant = CombatManager.get_combatant_cell(cid)
		if cella != null:
			occupate[cella] = true
	var dir_x: int = signi(npc_cell.x - pc_cell.x)
	var dir_y: int = signi(npc_cell.y - pc_cell.y)
	if dir_x == 0 and dir_y == 0:
		dir_x = 1  # sovrapposti (raro): scegli una direzione qualunque per staccarti
	# Prova a indietreggiare piu' che puoi, poi ripiega su passi piu' corti; mai oltre la gittata.
	for passi: int in range(mini(PORTATA_MOVIMENTO, gittata - 1), 0, -1):
		var dest := Vector2i(
			clampi(npc_cell.x + dir_x * passi, 0, GRIGLIA_MAX_X),
			clampi(npc_cell.y + dir_y * passi, 0, GRIGLIA_MAX_Y)
		)
		if dest != npc_cell and not occupate.has(dest):
			return dest
	return null


func set_enabled(enabled: bool) -> void:
	_abilitata = enabled


func is_enabled() -> bool:
	return _abilitata
