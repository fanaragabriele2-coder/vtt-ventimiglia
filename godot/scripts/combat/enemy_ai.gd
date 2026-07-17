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
# Sotto questa frazione di HP un CODARDO smette di combattere e scappa (goblin, Grima...).
const SOGLIA_FUGA_CODARDO: float = 0.35
# Bordo MINIMO della zona di manovra. Sul Mondo cucito la griglia non ha bordi fissi: il limite
# vero lo calcola _limite_massimo() dalle celle dei combattenti in scena (+margine di un turno),
# cosi' l'IA manovra ovunque si stia combattendo sulla mappa, senza costanti legate a una griglia.
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
	# Non e' il turno di un PNG: l'IA non interviene (i PG coscienti li muove il giocatore, i
	# PG morenti li gestisce DeathSaves). NON tocca next_turn: non e' il suo turno.
	if cur.is_empty() or String(cur["kind"]) != "npc":
		return
	var chiave: String = "%d:%d:%s" % [round_number, int(stato["currentTurnIndex"]), combatant_id]
	if chiave == _ultima_chiave_turno:
		return
	_ultima_chiave_turno = chiave
	# Un PNG sconfitto non dovrebbe avere il turno; se capita, lo si PASSA (mai bloccare la coda).
	if bool(cur["defeated"]):
		CombatManager.next_turn()
		return
	# NOTA: NON si esce se non ci sono PG coscienti. Se tutti i PG sono a terra ma MORENTI, lo
	# scontro non e' finito (possono rialzarsi con un 20 o una cura): il nemico DEVE comunque
	# agire e concludere il turno, altrimenti i morenti non arriverebbero mai a tirare contro la
	# morte e il combattimento si bloccherebbe (era il bug del turno nemico "congelato").
	await get_tree().create_timer(PAUSA_AZIONE_SEC).timeout
	# Durante la pausa lo scontro (o questo PNG) puo' essere finito: si esce senza toccare i turni.
	if not CombatManager.is_active():
		return
	var attuale: Dictionary = CombatManager.get_combatant(combatant_id)
	if attuale.is_empty() or bool(attuale.get("defeated", false)):
		CombatManager.next_turn()
		return
	await _agisci_nemico(attuale)


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


## Il COMPORTAMENTO del mostro dal bestiario (via catalogId messo da add_npc): e' la sua storia
## che decide come combatte — un goblin non ragiona come un Nazgul (data/monsters.json, "lore").
func _comportamento_di(cur: Dictionary) -> String:
	var catalog_id: String = String(cur.get("catalogId", ""))
	if catalog_id.is_empty():
		return "standard"
	for m: Dictionary in CombatManager.get_monster_catalog():
		if String(m["id"]) == catalog_id:
			return String(m.get("comportamento", "standard"))
	return "standard"


## Bersaglio secondo il carattere: il CACCIATORE (lupi, Shelob, il drago) punta il PG con MENO
## HP; il TERRORE (i Nazgul) punta il PIU' FORTE, per spezzare il coraggio degli altri; tutti
## gli altri attaccano il piu' vicino.
func _bersaglio_per_comportamento(comp: String, stato: Dictionary, npc_id: String) -> Dictionary:
	if comp != "cacciatore" and comp != "terrore":
		return bersaglio_piu_vicino(stato, npc_id)
	var candidati: Array[Dictionary] = _pg_vivi(stato)
	if candidati.is_empty():
		return {}
	var migliore: Dictionary = candidati[0]
	for pc: Dictionary in candidati:
		var hp: int = int(pc["hitPoints"])
		var hp_migliore: int = int(migliore["hitPoints"])
		if (comp == "cacciatore" and hp < hp_migliore) \
				or (comp == "terrore" and hp > hp_migliore):
			migliore = pc
	return migliore


func _agisci_nemico(cur: Dictionary) -> void:
	# STORDITO: il turno salta del tutto (condizione 5e semplificata alla BG3).
	if ConditionsManager.ha_condizione(String(cur["id"]), "stordito"):
		GameState.announce("💫 %s e' STORDITO: barcolla e perde il turno." % String(cur["name"]))
		CombatManager.next_turn()
		return
	var stato: Dictionary = CombatManager.get_state()
	var comp: String = _comportamento_di(cur)
	var bersaglio: Dictionary = _bersaglio_per_comportamento(comp, stato, String(cur["id"]))
	if bersaglio.is_empty():
		# Nessun PG in piedi: il nemico non infierisce sui caduti e conclude il turno — cosi'
		# i morenti (tutti a terra) possono tirare contro la morte e magari rialzarsi.
		GameState.announce("🛡 %s non trova nemici in piedi da affrontare e resta in guardia."
			% String(cur["name"]))
		CombatManager.next_turn()
		return

	var npc_cell: Variant = CombatManager.get_combatant_cell(String(cur["id"]))
	var pc_cell: Variant = CombatManager.get_combatant_cell(String(bersaglio["id"]))
	var gittata: int = CombatManager.attack_range_of(String(cur["id"]))

	# AFFERRATO (Ragnatela, prese): prova a strapparsi (FOR CD 12); se resta intrappolato non
	# si muove — puo' solo colpire chi ha gia' a portata, poi il turno finisce.
	if ConditionsManager.ha_condizione(String(cur["id"]), "afferrato"):
		var fuga_ts: Dictionary = CombatManager.saving_throw(String(cur["id"]), "str", 12)
		if bool(fuga_ts["success"]):
			ConditionsManager.rimuovi_condizione(String(cur["id"]), "afferrato")
			GameState.announce("🕸 %s si STRAPPA dai fili con la forza bruta!" % String(cur["name"]))
		else:
			var d: int = 999
			if npc_cell != null and pc_cell != null:
				d = chebyshev(npc_cell, pc_cell)
			if d >= 1 and d <= gittata:
				await _attacca(cur, bersaglio)
			else:
				GameState.announce("🕸 %s si dibatte nella ragnatela senza liberarsi."
					% String(cur["name"]))
			CombatManager.next_turn()
			return

	# CODARDO ferito (goblin, Grima): la sua storia dice che scappa — fugge invece di combattere.
	# E scappa da FURBO: si DISIMPEGNA prima di correre (niente attacchi di opportunita').
	if comp == "codardo" and npc_cell != null and pc_cell != null \
			and float(cur["hitPoints"]) < float(cur["maxHitPoints"]) * SOGLIA_FUGA_CODARDO:
		var fuga: Variant = _cella_libera_lontano(
			String(cur["id"]), npc_cell, pc_cell, PORTATA_MOVIMENTO + 1)
		if fuga != null:
			TacticalRules.disimpegna(String(cur["id"]))
			CombatManager.set_combatant_cell(String(cur["id"]), fuga)
			GameState.announce("🏃 %s, ferito, perde il coraggio e scappa via da %s!"
				% [String(cur["name"]), String(bersaglio["name"])])
			CombatManager.next_turn()
			return

	# GUARDIANO (il Guardiano nell'Acqua): difende il suo posto, NON insegue chi sta lontano —
	# e mentre attende si mette in SCHIVATA (svantaggio a chi lo bersaglia da fuori).
	if comp == "guardiano" and npc_cell != null and pc_cell != null \
			and chebyshev(npc_cell, pc_cell) > gittata + 1:
		TacticalRules.schiva(String(cur["id"]))
		GameState.announce("🗿 %s non abbandona il suo posto: attende nell'ombra."
			% String(cur["name"]))
		CombatManager.next_turn()
		return

	if npc_cell != null and pc_cell != null:
		if gittata > 1:
			await _agisci_a_distanza(cur, bersaglio, npc_cell, pc_cell, gittata)
		else:
			await _agisci_in_mischia(cur, bersaglio, npc_cell, pc_cell, comp)
	else:
		# Nessuna posizione nota (nessun token piazzato): il PNG attacca comunque.
		await _attacca(cur, bersaglio)

	CombatManager.next_turn()


## L'attacco di un PNG su un PG passa da qui: PRIMA si offre al difensore la REAZIONE (lo SCUDO
## del mago, col prompt di SpellBook — l'IA e' asincrona e ASPETTA la scelta), poi si risolve.
func _attacca(cur: Dictionary, bersaglio: Dictionary) -> void:
	await SpellBook.offri_scudo(String(bersaglio["id"]), String(cur["name"]))
	if not CombatManager.is_active():
		return  # durante il prompt lo scontro puo' essere finito
	CombatManager.resolve_attack(String(cur["id"]), String(bersaglio["id"]), "normal")


## Nemico da mischia: avanza (evitando le celle occupate) e colpisce se arriva adiacente.
## TATTICA: se puo' arrivare in mischia questo turno, tra le celle adiacenti al bersaglio
## preferisce quella che crea un FIANCHEGGIAMENTO con un alleato (vantaggio al tiro) —
## i nemici ora vi GIRANO ATTORNO invece di mettersi in fila indiana.
## Il BERSERKER (orchi, Uruk-hai, troll, Balrog...) invece non fa finezze: la sua storia dice
## che carica dritto sul bersaglio, senza cercare fianchi ne' alture.
func _agisci_in_mischia(cur: Dictionary, bersaglio: Dictionary, npc_cell: Vector2i,
		pc_cell: Vector2i, comp: String = "standard") -> void:
	var dist: int = chebyshev(npc_cell, pc_cell)
	if dist > 1:
		var dest: Variant = null
		var fiancheggia: bool = false
		if comp != "berserker" and dist - 1 <= PORTATA_MOVIMENTO:
			var scelta: Dictionary = _cella_mischia_migliore(String(cur["id"]), npc_cell, pc_cell)
			dest = scelta.get("cella")
			fiancheggia = bool(scelta.get("fiancheggia", false))
		var altura: bool = false
		if dest == null:
			dest = _cella_libera_verso(String(cur["id"]), npc_cell, pc_cell)
		elif not fiancheggia:
			altura = ElevationManager.quota_di((dest as Vector2i).x, (dest as Vector2i).y) \
				> ElevationManager.quota_di(pc_cell.x, pc_cell.y)
		if dest != null:
			CombatManager.set_combatant_cell(String(cur["id"]), dest)
			var frase: String = "👣 %s avanza verso %s."
			if comp == "berserker":
				frase = "💢 %s carica dritto su %s, incurante di tutto!"
			elif fiancheggia:
				frase = "⚔ %s aggira %s e lo prende ai fianchi!"
			elif altura:
				frase = "⛰ %s guadagna l'altura e incombe su %s!"
			GameState.announce(frase % [String(cur["name"]), String(bersaglio["name"])])
		npc_cell = CombatManager.get_combatant_cell(String(cur["id"]))
		dist = chebyshev(npc_cell, pc_cell) if npc_cell != null else 999
		# Il BERSERKER che non arriva a contatto SCATTA (azione: passo raddoppiato) e avanza
		# ancora: la carica non si ferma a meta' strada.
		if comp == "berserker" and dist > 1 and npc_cell != null:
			var rincorsa: Variant = _cella_libera_verso(String(cur["id"]), npc_cell, pc_cell)
			if rincorsa != null:
				TacticalRules.scatta(String(cur["id"]))
				CombatManager.set_combatant_cell(String(cur["id"]), rincorsa)
				npc_cell = CombatManager.get_combatant_cell(String(cur["id"]))
				dist = chebyshev(npc_cell, pc_cell) if npc_cell != null else 999
	if dist <= 1:
		await _attacca(cur, bersaglio)
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
	else:
		# Gia' a tiro e non minacciato: se sul campo c'e' un'ALTURA raggiungibile che tiene il
		# bersaglio in gittata, ci SALE prima di tirare (vantaggio da elevazione, Modulo 28).
		var colle: Variant = _cella_altura_a_tiro(String(cur["id"]), npc_cell, pc_cell, gittata)
		if colle != null:
			CombatManager.set_combatant_cell(String(cur["id"]), colle)
			GameState.announce("⛰ %s sale sull'altura, arco teso su %s." % [String(cur["name"]), String(bersaglio["name"])])
			npc_cell = CombatManager.get_combatant_cell(String(cur["id"]))
			dist = chebyshev(npc_cell, pc_cell) if npc_cell != null else dist
	if dist >= 1 and dist <= gittata:
		await _attacca(cur, bersaglio)
	elif dist > gittata:
		GameState.announce("🏹 %s non ha ancora %s a tiro." % [String(cur["name"]), String(bersaglio["name"])])


## Come cella_verso_bersaglio, ma MAI su una cella gia' occupata da un altro combattente
## (prima i nemici si accatastavano sullo stesso quadretto): se la destinazione ideale e'
## presa, accorcia il passo finche' trova una cella libera; se sono tutte prese resta fermo.
func _cella_libera_verso(npc_id: String, npc_cell: Vector2i, pc_cell: Vector2i) -> Variant:
	var occupate: Dictionary = _celle_occupate(npc_id)
	for passi: int in range(PORTATA_MOVIMENTO, 0, -1):
		var dest: Variant = cella_verso_bersaglio(npc_cell, pc_cell, passi)
		if dest == null:
			return null
		if not occupate.has(dest):
			return dest
	return null


## Bordo massimo della zona di manovra: sul Mondo cucito lo scontro puo' avvenire OVUNQUE,
## quindi il limite si ricava dalle celle dei combattenti in scena + un turno di movimento di
## margine (mai sotto il minimo storico della griglia, cosi' i vecchi salvataggi non cambiano).
func _limite_massimo() -> Vector2i:
	var lim := Vector2i(GRIGLIA_MAX_X, GRIGLIA_MAX_Y)
	for c: Dictionary in CombatManager.get_state()["combatants"]:
		var cella: Variant = CombatManager.get_combatant_cell(String(c["id"]))
		if cella is Vector2i:
			lim.x = maxi(lim.x, (cella as Vector2i).x + PORTATA_MOVIMENTO)
			lim.y = maxi(lim.y, (cella as Vector2i).y + PORTATA_MOVIMENTO)
	return lim


## Le celle occupate dagli ALTRI combattenti vivi (per non calpestarsi): helper condiviso
## da tutte le manovre dell'IA (avanzata, fuga, fiancheggiamento, altura).
func _celle_occupate(escluso_id: String) -> Dictionary:
	var occupate: Dictionary = {}
	for c: Dictionary in CombatManager.get_state()["combatants"]:
		var cid: String = String(c["id"])
		if cid == escluso_id or bool(c["defeated"]):
			continue
		var cella: Variant = CombatManager.get_combatant_cell(cid)
		if cella != null:
			occupate[cella] = true
	return occupate


## La migliore cella ADIACENTE al bersaglio raggiungibile in questo turno, in ordine di
## preferenza TATTICA: 1) crea fiancheggiamento con un alleato gia' in mischia (vantaggio),
## 2) sta PIU' IN ALTO del bersaglio (vantaggio da elevazione, Modulo 28), 3) la prima libera.
## Ritorna { "cella": Vector2i|null, "fiancheggia": bool, "altura": bool }.
func _cella_mischia_migliore(npc_id: String, npc_cell: Vector2i, pc_cell: Vector2i) -> Dictionary:
	var occupate: Dictionary = _celle_occupate(npc_id)
	var alleati_in_mischia: Array[Vector2i] = []
	for c: Dictionary in CombatManager.get_state()["combatants"]:
		var cid: String = String(c["id"])
		if cid == npc_id or bool(c["defeated"]) or String(c["kind"]) != "npc":
			continue
		var cella: Variant = CombatManager.get_combatant_cell(cid)
		if cella != null and chebyshev(cella, pc_cell) == 1:
			alleati_in_mischia.append(cella)
	var quota_bersaglio: int = ElevationManager.quota_di(pc_cell.x, pc_cell.y)
	var lim: Vector2i = _limite_massimo()
	var ripiego: Variant = null
	var ripiego_altura: Variant = null
	for dx: int in range(-1, 2):
		for dy: int in range(-1, 2):
			if dx == 0 and dy == 0:
				continue
			var cand := Vector2i(pc_cell.x + dx, pc_cell.y + dy)
			if cand.x < 0 or cand.x > lim.x or cand.y < 0 or cand.y > lim.y:
				continue
			if occupate.has(cand) or chebyshev(npc_cell, cand) > PORTATA_MOVIMENTO:
				continue
			for alleato: Vector2i in alleati_in_mischia:
				if FlankingSystem.sta_fiancheggiando(pc_cell, cand, alleato):
					return { "cella": cand, "fiancheggia": true, "altura": false }
			if ripiego_altura == null \
					and ElevationManager.quota_di(cand.x, cand.y) > quota_bersaglio:
				ripiego_altura = cand
			if ripiego == null:
				ripiego = cand
	if ripiego_altura != null:
		return { "cella": ripiego_altura, "fiancheggia": false, "altura": true }
	return { "cella": ripiego, "fiancheggia": false, "altura": false }


## L'ALTURA per l'arciere: tra le celle sopraelevate DIPINTE sul campo (Modulo 28), la piu'
## alta raggiungibile col movimento di un turno che tenga il bersaglio a tiro SENZA finirgli
## addosso (distanza in [2, gittata]) e piu' in alto di dove sta ora. A parita' di quota vince
## la piu' vicina (meno strada). null se nessuna altura conviene.
func _cella_altura_a_tiro(npc_id: String, npc_cell: Vector2i, pc_cell: Vector2i, gittata: int) -> Variant:
	var occupate: Dictionary = _celle_occupate(npc_id)
	var mia_quota: int = ElevationManager.quota_di(npc_cell.x, npc_cell.y)
	var lim: Vector2i = _limite_massimo()
	var migliore: Variant = null
	var migliore_quota: int = mia_quota
	var migliore_passi: int = 999
	for chiave: String in ElevationManager.celle_dipinte():
		var parti: PackedStringArray = chiave.split(",")
		var cella := Vector2i(int(parti[0]), int(parti[1]))
		if cella.x < 0 or cella.x > lim.x or cella.y < 0 or cella.y > lim.y:
			continue
		var quota: int = ElevationManager.quota_di(cella.x, cella.y)
		if quota <= mia_quota or occupate.has(cella):
			continue
		var passi: int = chebyshev(npc_cell, cella)
		if passi == 0 or passi > PORTATA_MOVIMENTO:
			continue
		var dist_bersaglio: int = chebyshev(cella, pc_cell)
		if dist_bersaglio < 2 or dist_bersaglio > gittata:
			continue  # non deve ne' finire in mischia ne' perdere il tiro
		if quota > migliore_quota or (quota == migliore_quota and passi < migliore_passi):
			migliore_quota = quota
			migliore_passi = passi
			migliore = cella
	return migliore


## Cella di FUGA per l'arciere: si allontana dal bersaglio (direzione opposta) di un passo di
## movimento, restando dentro la griglia e su una cella libera. null se non puo' arretrare.
func _cella_libera_lontano(npc_id: String, npc_cell: Vector2i, pc_cell: Vector2i, gittata: int) -> Variant:
	var occupate: Dictionary = _celle_occupate(npc_id)
	var lim: Vector2i = _limite_massimo()
	var dir_x: int = signi(npc_cell.x - pc_cell.x)
	var dir_y: int = signi(npc_cell.y - pc_cell.y)
	if dir_x == 0 and dir_y == 0:
		dir_x = 1  # sovrapposti (raro): scegli una direzione qualunque per staccarti
	# Prova a indietreggiare piu' che puoi, poi ripiega su passi piu' corti; mai oltre la gittata.
	for passi: int in range(mini(PORTATA_MOVIMENTO, gittata - 1), 0, -1):
		var dest := Vector2i(
			clampi(npc_cell.x + dir_x * passi, 0, lim.x),
			clampi(npc_cell.y + dir_y * passi, 0, lim.y)
		)
		if dest != npc_cell and not occupate.has(dest):
			return dest
	return null


func set_enabled(enabled: bool) -> void:
	_abilitata = enabled


func is_enabled() -> bool:
	return _abilitata
