# gdlint: disable=max-public-methods
# (Facciata del sistema di combattimento: turni, dadi, danni, posizioni — API ampia per design.)
extends Node
## CombatManager (Autoload singleton) — porting dei Moduli 05 (Combat Tracker), 24 (Reazioni) e
## 26 (Spingi) del monolite JS.
##
## Possiede l'elenco dei combattenti (PG + PNG), l'ordine di iniziativa e il turno corrente.
## Regole D&D 5e fedeli al legacy: tiro d20 con vantaggio/svantaggio, formule di danno con
## raddoppio dei SOLI dadi sui critici, prova contrapposta per la Spinta, attacco di opportunita'.
##
## OGNI membro del party e' un combattente ("pc-<id>", hotseat vero): il danno ai PG viene
## instradato su CharacterManager per-personaggio (unica verita' sugli HP); i PNG hanno HP locali qui. Alla morte dell'ultimo nemico lo scontro finisce da
## solo (VITTORIA), a party interamente a terra si interrompe (TPK) — come nel monolite.
##
## Registrazione: Project Settings > Autoload -> "CombatManager" (dopo CharacterManager).

signal combat_started()
signal combat_ended()
signal turn_changed(combatant_id: String, round_number: int)
signal combatant_added(combatant: Dictionary)
signal combatant_damaged(combatant_id: String, amount: int, current_hp: int)
signal combatant_defeated(combatant_id: String, source_id: String)
signal combatant_healed(combatant_id: String, amount: int, current_hp: int)
signal initiative_rolled(order: Array)
signal attack_resolved(result: Dictionary)
signal shove_resolved(result: Dictionary)
signal victory()
signal party_wiped()
## La cella di un combattente e' cambiata (la UI mappa si allinea da sola).
signal combatant_position_changed(combatant_id: String, cell: Vector2i)
## Un combattente e' stato TOLTO dalla scena dal Master (non ucciso: niente XP/bottino). La UI
## mappa rimuove il token ascoltando questo signal.
signal combatant_removed(combatant_id: String)
## TIRI SALVEZZA CONTRO LA MORTE (D&D 5e): un PG a 0 PF non muore subito, e' MORENTE e ogni suo
## turno tira 1d20 (10+ = successo, altrimenti fallimento; 20 = si rialza a 1 PF; 1 = due
## fallimenti). 3 successi = stabile; 3 fallimenti = morto. La UI/HUD reagisce a questi signal.
signal death_save_rolled(
	combatant_id: String, tiro: int, esito: String, successi: int, fallimenti: int)
signal combatant_dying(combatant_id: String)
signal combatant_stabilized(combatant_id: String)
signal combatant_died_final(combatant_id: String)
signal combatant_revived(combatant_id: String)

const MONSTERS_PATH: String = "res://data/monsters.json"
const PC_PREFIX: String = "pc-"
# Dado di danno dell'arma "di elezione" di ogni classe (senza il modificatore, aggiunto a parte):
# la scheda ORA conta — un barbaro picchia da barbaro, un chierico no.
const DADO_DANNO_CLASSE: Dictionary = {
	"guerriero": "1d8", "barbaro": "1d12", "ladro": "1d8",
	"ranger": "1d8", "mago": "1d10", "chierico": "1d6",
}
# Gittata d'attacco in CELLE (1 cella = 1,5 m). Le classi da tiro colpiscono da lontano: il
# ranger con l'arco (~24 celle) e il mago con gli incantesimi (~12); le altre sono da mischia
# (1 cella). Un attacco a distanza NON riceve fiancheggiamento (richiede adiacenza) — corretto.
const GITTATA_CLASSE: Dictionary = {
	"ranger": 24, "mago": 12,
}
const GITTATA_MISCHIA: int = 1

var _monster_catalog: Array[Dictionary] = []
var _combatants: Array[Dictionary] = []
var _active: bool = false
var _round: int = 0
var _current_turn_index: int = -1
var _next_npc_number: int = 1
var _last_event: String = ""

# Posizione sulla griglia di ogni combattente (combattente_id -> cella, 1 cella = 1,5 m =
# 128 px del Mondo cucito). Vive QUI, non nella UI, cosi' la logica di gioco (fiancheggiamento,
# elevazione, IA nemici) puo' leggerla senza dipendere da un nodo di scena. La scrivono i token
# del Mondo cucito (WorldTokens per i PG al trascinamento/viaggio/inizio scontro,
# WorldEnemyTokens per i PNG allo spawn), e WorldEnemyTokens vi si aggancia per riflettere gli
# spostamenti causati dal gioco (es. l'IA nemica che avanza o fugge).
var _positions: Dictionary = {}

# Tipi di mostro la cui LORE e' gia' stata raccontata in questo scontro (catalog_id -> true):
# la storia di un nemico si annuncia UNA volta alla sua prima comparsa, non per ogni gregario.
var _lore_annunciate: Dictionary = {}

# Stato dei TIRI SALVEZZA CONTRO LA MORTE dei PG morenti (combattente_id -> { successi, fallimenti,
# stabile, morto }). Vive solo durante lo scontro (azzerato a end_combat): un PG "morente" e' a
# 0 PF, non stabile e non morto; puo' tornare in gioco con una cura o un 20 naturale.
var _tiri_morte: Dictionary = {}


func _ready() -> void:
	_monster_catalog = _load_catalog(MONSTERS_PATH, "monsters")
	# UN combattente per OGNI membro del party (hotseat vero): niente piu' singolo "pc-local".
	_rebuild_pc_combatants()
	CharacterManager.party_changed.connect(_on_party_changed)


## Id del combattente di un personaggio del party ("pc-<id personaggio>").
func pc_id_di(character_id: String) -> String:
	return PC_PREFIX + character_id


## Il combattente del PG ATTIVO sulla scheda (l'attaccante di default dell'HUD).
func pc_attivo_id() -> String:
	var c: CharacterData = CharacterManager.get_active()
	return pc_id_di(c.id) if c else ""


## L'id personaggio dietro un combattente-PG ("" se e' un PNG o non esiste).
func character_id_di(combatant_id: String) -> String:
	var c: Dictionary = get_combatant(combatant_id)
	return String(c.get("characterId", "")) if not c.is_empty() else ""


## Statistiche d'attacco DERIVATE DALLA SCHEDA (prima erano fisse 4 / 1d8+2 per tutti):
## bonus = competenza + il miglior modificatore da combattimento (FOR/DES/INT/SAG — copre
## marziali, schermitori e incantatori); danno = dado della classe + lo stesso modificatore;
## gittata = celle dalla classe (ranger/mago colpiscono da lontano), 1 per la mischia.
func _attacco_da_scheda(c: CharacterData) -> Dictionary:
	var mod: int = maxi(
		maxi(c.modifier_of("str"), c.modifier_of("dex")),
		maxi(c.modifier_of("int"), c.modifier_of("wis"))
	)
	var classe: String = c.class_name_label.to_lower()
	var dado: String = String(DADO_DANNO_CLASSE.get(classe, "1d8"))
	var formula: String = dado
	if mod > 0:
		formula += "+%d" % mod
	elif mod < 0:
		formula += str(mod)
	return {
		"bonus": c.proficiency_bonus + mod, "formula": formula,
		"range": int(GITTATA_CLASSE.get(classe, GITTATA_MISCHIA)),
	}


func _make_pc_combatant(c: CharacterData) -> Dictionary:
	# Specchia la scheda del membro; gli HP restano autorevoli in CharacterManager, qui e' un riflesso.
	var attacco: Dictionary = _attacco_da_scheda(c)
	return {
		"id": pc_id_di(c.id), "kind": "pc", "characterId": c.id,
		"name": c.character_name,
		"armorClass": c.armor_class,
		"hitPoints": c.hp_current,
		"maxHitPoints": c.hp_max,
		"temporaryHitPoints": c.hp_temporary,
		"initiative": 0,
		"initiativeBonus": c.modifier_of("dex"),
		"attackBonus": int(attacco["bonus"]),
		"damageFormula": String(attacco["formula"]),
		"attackRange": int(attacco["range"]),
		"defeated": c.hp_current <= 0,
	}


## Ricostruisce i combattenti-PG dal roster (nuova partita, membri aggiunti/rimossi). Mai durante
## uno scontro attivo: in quel caso rimanda alla fine del combattimento.
func _rebuild_pc_combatants() -> void:
	for c: Dictionary in _combatants:
		if c["kind"] == "pc":
			clear_combatant_cell(String(c["id"]))
	_combatants = _combatants.filter(func(c: Dictionary) -> bool: return c["kind"] != "pc")
	var party: Array[CharacterData] = CharacterManager.get_party()
	for i: int in range(party.size()):
		_combatants.insert(i, _make_pc_combatant(party[i]))


func _on_party_changed(_party: Array) -> void:
	if _active:
		return  # a scontro finito end_combat() riallinea il roster
	_allinea_pc_roster()


## Ricostruisce SOLO se la composizione del party e' cambiata (membri aggiunti/rimossi/nuova
## partita); per un semplice cambio di HP (party_changed scatta anche li') basta sincronizzare —
## ricostruire ogni volta azzererebbe le posizioni sulla griglia.
func _allinea_pc_roster() -> void:
	var attesi: Array[String] = []
	for c: CharacterData in CharacterManager.get_party():
		attesi.append(pc_id_di(c.id))
	var attuali: Array[String] = []
	for c: Dictionary in _combatants:
		if c["kind"] == "pc":
			attuali.append(String(c["id"]))
	if attesi != attuali:
		_rebuild_pc_combatants()
	else:
		_sync_pcs_from_characters()


func _load_catalog(path: String, key: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not FileAccess.file_exists(path):
		push_warning("CombatManager: catalogo non trovato: " + path)
		return out
	var text: String = FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary and parsed.has(key):
		for entry: Variant in parsed[key]:
			if entry is Dictionary:
				out.append(entry)
	return out


# --- Stato / lettura ---

## Il bestiario caricato (usato dall'Encounter Balancer per risalire a CR/id dal nome).
func get_monster_catalog() -> Array[Dictionary]:
	return _monster_catalog


func get_state() -> Dictionary:
	return {
		"active": _active, "round": _round,
		"currentTurnIndex": _current_turn_index,
		"combatants": _combatants.duplicate(true),
		"lastEvent": _last_event,
	}


func get_combatant(combatant_id: String) -> Dictionary:
	for c: Dictionary in _combatants:
		if c["id"] == combatant_id:
			return c
	return {}


func is_active() -> bool:
	return _active


# --- Spawn nemici (porting di addNpc del Modulo 05) ---

## Sposta il bonus fisso di una formula di danno ("1d6+2" con delta -1 -> "1d6+1"); usato
## dall'Encounter Balancer (damageBonusDelta) per indebolire/rinforzare i nemici senza toccare il
## bestiario. Il dado resta invariato, solo il bonus fisso si sposta.
func _applica_delta_danno(formula: String, delta: int) -> String:
	var regex := RegEx.new()
	regex.compile("^(.*?d\\d+)\\s*([+-]\\s*\\d+)?$")
	var m: RegExMatch = regex.search(formula.strip_edges())
	if not m:
		return formula
	var dado: String = m.get_string(1).replace(" ", "")
	var bonus_str: String = m.get_string(2).replace(" ", "")
	var bonus_attuale: int = int(bonus_str) if not bonus_str.is_empty() else 0
	var nuovo: int = bonus_attuale + delta
	if nuovo == 0:
		return dado
	return dado + (("+" + str(nuovo)) if nuovo > 0 else str(nuovo))


## Aggiunge un PNG dal bestiario. `overrides` puo' scalare hitPoints/armorClass/attackBonus/
## damageBonusDelta (usato dall'Encounter Balancer). Ritorna il combattente creato (o {} se il
## catalogo non ha l'id).
func add_npc(catalog_id: String, overrides: Dictionary = {}) -> Dictionary:
	var template: Dictionary = {}
	for m: Dictionary in _monster_catalog:
		if m["id"] == catalog_id:
			template = m
			break
	if template.is_empty():
		return {}
	# Numera i nemici dello stesso tipo (Goblin 1, Goblin 2, ...).
	var same_type: int = 1
	for c: Dictionary in _combatants:
		if c["kind"] == "npc" and String(c["name"]).begins_with(String(template["name"])):
			same_type += 1
	var hp: int = int(overrides.get("hitPoints", template["hitPoints"]))
	var damage_formula: String = String(template["damageFormula"])
	if overrides.has("damageBonusDelta"):
		damage_formula = _applica_delta_danno(damage_formula, int(overrides["damageBonusDelta"]))
	var combatant: Dictionary = {
		"id": "npc-%d" % _next_npc_number,
		"kind": "npc",
		# L'id del catalogo resta sul combattente: l'IA vi legge il COMPORTAMENTO del mostro
		# (codardo/berserker/...) e il Master IA la sua lore, senza rifare il match sul nome.
		"catalogId": catalog_id,
		"name": "%s %d" % [template["name"], same_type],
		"armorClass": int(overrides.get("armorClass", template["armorClass"])),
		"hitPoints": hp,
		"maxHitPoints": int(overrides.get("maxHitPoints", hp)),
		"temporaryHitPoints": 0,
		"initiative": 0,
		"initiativeBonus": int(template["initiativeBonus"]),
		"attackBonus": int(overrides.get("attackBonus", template["attackBonus"])),
		"damageFormula": damage_formula,
		# Gittata del PNG: dal bestiario ("attackRange" nel monster, per futuri arcieri), 1 se assente.
		"attackRange": int(overrides.get("attackRange", template.get("attackRange", GITTATA_MISCHIA))),
		"defeated": false,
	}
	_next_npc_number += 1
	_combatants.append(combatant)
	_last_event = "PNG aggiunto: " + combatant["name"]
	# La STORIA del nemico si racconta alla prima comparsa del suo tipo in questo scontro:
	# ogni mostro ha la sua lore (data/monsters.json) e si presenta al tavolo come merita.
	var lore: String = String(template.get("lore", ""))
	if not lore.is_empty() and not _lore_annunciate.has(catalog_id):
		_lore_annunciate[catalog_id] = true
		GameState.announce("☠ %s — %s" % [String(template["name"]), lore])
	combatant_added.emit(combatant)
	return combatant


# --- Ciclo del combattimento (porting di startCombat/endCombat/nextTurn) ---

func start_combat() -> void:
	_sync_pcs_from_characters()
	# Non si combatte con tutto il party a terra.
	var any_conscious: bool = false
	for c: Dictionary in _combatants:
		if c["kind"] == "pc" and not c["defeated"] and int(c["hitPoints"]) > 0:
			any_conscious = true
			break
	if not any_conscious:
		_last_event = "Tutti i PG sono incoscienti. Rianimali prima."
		return
	# Non si avvia un combattimento SENZA nemici: un "startCombat" nudo (dal Master IA o altrove)
	# lascerebbe la scena con solo i PG e i pulsanti che girano a vuoto. Chi vuole davvero uno
	# scontro deve prima piazzare almeno un PNG (Encounter Balancer, addNpc, il ponte narrazione).
	var nemico_vivo: bool = false
	for c: Dictionary in _combatants:
		if c["kind"] == "npc" and not c["defeated"] and int(c["hitPoints"]) > 0:
			nemico_vivo = true
			break
	if not nemico_vivo:
		_last_event = "Nessun nemico in scena: evoca dei PNG prima di iniziare il combattimento."
		return
	_active = true
	_round = 1
	roll_all_initiative()
	_current_turn_index = _find_next_living_index(-1)
	_last_event = "Combattimento iniziato."
	GameState.set_combat_active(true)
	combat_started.emit()
	if _current_turn_index >= 0:
		turn_changed.emit(_combatants[_current_turn_index]["id"], _round)


func end_combat() -> void:
	_active = false
	_round = 0
	_current_turn_index = -1
	_last_event = "Combattimento terminato."
	# Gli EFFETTI TRANSITORI muoiono con lo scontro: condizioni e superfici di un combattimento
	# non devono infestare il successivo (il round riparte da 1 e la loro scadenza non
	# scatterebbe MAI: "round_attuale - appliedAt" diventerebbe negativo). L'elevazione invece
	# resta: e' terreno dell'arena, non un effetto.
	ConditionsManager.reset()
	SurfacesManager.reset()
	_lore_annunciate.clear()  # al prossimo scontro le storie si raccontano di nuovo
	_tiri_morte.clear()       # i tiri contro la morte valgono solo dentro lo scontro
	ConcentrationManager.reset()  # nessun incantesimo di concentrazione sopravvive allo scontro
	GameState.set_combat_active(false)
	combat_ended.emit()
	_allinea_pc_roster()


func next_turn() -> void:
	if not _active:
		_last_event = "Il combattimento non e' attivo."
		return
	var next_index: int = _find_next_living_index(_current_turn_index)
	if next_index == -1:
		_last_event = "Nessun combattente vivo."
		return
	# Giro completo -> nuovo round.
	if next_index <= _current_turn_index:
		_round += 1
	_current_turn_index = next_index
	turn_changed.emit(_combatants[_current_turn_index]["id"], _round)


func _find_next_living_index(from_index: int) -> int:
	var n: int = _combatants.size()
	if n == 0:
		return -1
	for offset: int in range(1, n + 1):
		var index: int = (from_index + offset + n) % n
		if _puo_avere_turno(_combatants[index]):
			return index
	return -1


## Chi ha diritto a un turno: i PNG in piedi, i PG coscienti, e i PG MORENTI (il loro turno
## serve solo a tirare il salvezza contro la morte). Restano fuori i morti e gli stabili.
func _puo_avere_turno(c: Dictionary) -> bool:
	if String(c["kind"]) == "npc":
		return not bool(c["defeated"]) and int(c["hitPoints"]) > 0
	if int(c["hitPoints"]) > 0:
		return true
	return is_pc_dying(String(c["id"]))


func roll_all_initiative() -> void:
	for c: Dictionary in _combatants:
		c["initiative"] = roll_d20_with_mode("normal")["chosen"] + int(c["initiativeBonus"])
	_combatants.sort_custom(_compare_by_initiative)
	var order: Array = []
	for c: Dictionary in _combatants:
		order.append({ "id": c["id"], "name": c["name"], "initiative": c["initiative"] })
	initiative_rolled.emit(order)


# Ordina per iniziativa decrescente (il piu' alto agisce per primo).
func _compare_by_initiative(a: Dictionary, b: Dictionary) -> bool:
	return int(a["initiative"]) > int(b["initiative"])


func _sync_pcs_from_characters() -> void:
	for pc: Dictionary in _combatants:
		if pc["kind"] != "pc":
			continue
		var c: CharacterData = CharacterManager.get_character_by_id(String(pc["characterId"]))
		if c == null:
			continue
		pc["name"] = c.character_name
		pc["armorClass"] = c.armor_class
		pc["hitPoints"] = c.hp_current
		pc["maxHitPoints"] = c.hp_max
		pc["temporaryHitPoints"] = c.hp_temporary
		pc["initiativeBonus"] = c.modifier_of("dex")
		pc["defeated"] = c.hp_current <= 0
		# Anche l'attacco segue la scheda (level-up o caratteristiche cambiate a meta' campagna).
		var attacco: Dictionary = _attacco_da_scheda(c)
		pc["attackBonus"] = int(attacco["bonus"])
		pc["damageFormula"] = String(attacco["formula"])
		pc["attackRange"] = int(attacco["range"])


# --- Dadi e formule di danno (porting fedele di rollD20WithMode / rollDamageFormula) ---

## Tiro d20. mode: "normal" | "advantage" | "disadvantage".
func roll_d20_with_mode(mode: String) -> Dictionary:
	var rolls: Array[int] = []
	rolls.append(randi_range(1, 20))
	if mode == "advantage" or mode == "disadvantage":
		rolls.append(randi_range(1, 20))
	var chosen: int = rolls[0]
	if mode == "advantage":
		chosen = maxi(rolls[0], rolls[1])
	elif mode == "disadvantage":
		chosen = mini(rolls[0], rolls[1])
	return {
		"rolls": rolls, "chosen": chosen,
		"naturalOne": chosen == 1, "naturalTwenty": chosen == 20,
	}


## Interpreta "2d6+3" -> [{dice,count,sides,sign}, {flat,value}]. Ricade su 1d4 se non valida.
func parse_damage_formula(formula: String) -> Array[Dictionary]:
	var terms: Array[Dictionary] = []
	var regex := RegEx.new()
	regex.compile("([+-]?)(\\d*)d(\\d+)|([+-]?\\d+)")
	var found: bool = false
	for m: RegExMatch in regex.search_all(formula.strip_edges().to_lower()):
		if m.get_string(3) != "":
			var sign: int = -1 if m.get_string(1) == "-" else 1
			var count: int = int(m.get_string(2)) if m.get_string(2) != "" else 1
			terms.append({ "type": "dice", "sign": sign, "count": count, "sides": int(m.get_string(3)) })
			found = true
		elif m.get_string(4) != "":
			terms.append({ "type": "flat", "value": int(m.get_string(4)) })
			found = true
	if not found:
		terms.append({ "type": "dice", "sign": 1, "count": 1, "sides": 4 })
	return terms


## Tira una formula di danno. Sul critico SOLO i dadi raddoppiano (il bonus fisso no). Mai < 0.
func roll_damage_formula(formula: String, critical: bool = false) -> Dictionary:
	var total: int = 0
	for term: Dictionary in parse_damage_formula(formula):
		if term["type"] == "dice":
			var count: int = int(term["count"]) * (2 if critical else 1)
			for i: int in range(count):
				total += int(term["sign"]) * randi_range(1, int(term["sides"]))
		else:
			total += int(term["value"])
	return { "formula": formula, "critical": critical, "total": maxi(0, total) }


# --- Applicazione di danno/cura (porting di applyDamageToCombatant / healCombatant) ---

## source_id: chi ha inferto il danno (attaccante, superficie, comando IA...), se noto. Serve a
## ProgressionManager per accreditare l'XP a chi ha DAVVERO sferrato il colpo, non a chi e' mostrato
## in hotseat quando il PNG cade (porting del problema che js/15 risolveva parsando lastRoll.title —
## qui e' diretto, perche' resolve_attack conosce gia' l'attaccante).
func apply_damage_to_combatant(combatant_id: String, amount: int, source_id: String = "",
		critico: bool = false) -> bool:
	var combatant: Dictionary = get_combatant(combatant_id)
	if combatant.is_empty():
		return false
	var damage: int = clampi(amount, 0, 9999)
	var was_defeated: bool = bool(combatant["defeated"])
	var era_gia_a_zero: bool = combatant["kind"] == "pc" and int(combatant["hitPoints"]) <= 0

	if combatant["kind"] == "pc":
		# Un membro del party: gli HP autorevoli stanno in CharacterManager (per-personaggio).
		CharacterManager.apply_damage_by_id(String(combatant["characterId"]), damage)
		_sync_pcs_from_characters()
	else:
		combatant["hitPoints"] = maxi(0, int(combatant["hitPoints"]) - damage)
		combatant["defeated"] = int(combatant["hitPoints"]) <= 0

	combatant_damaged.emit(combatant_id, damage, int(combatant["hitPoints"]))
	if combatant["kind"] == "npc" and combatant["defeated"] and not was_defeated:
		combatant_defeated.emit(combatant_id, source_id)
	elif combatant["kind"] == "pc" and int(combatant["hitPoints"]) <= 0:
		_gestisci_pg_a_zero(combatant_id, combatant, damage, era_gia_a_zero, critico)

	# CONCENTRAZIONE (5e): se il ferito manteneva un incantesimo, il colpo puo' spezzarlo.
	if damage > 0 and ConcentrationManager.e_concentrato(combatant_id):
		ConcentrationManager.su_danno(combatant_id, damage)

	_check_end_conditions(combatant)
	return true


## BENEDIZIONE (chierico): l'incantatore si concentra e benedice fino a 3 alleati vivi del party
## (se stesso incluso per primo): finche' regge la concentrazione, i benedetti tirano +1d4 per
## colpire. Ritorna false se non c'e' nessuno da benedire.
func benedici(caster_id: String) -> bool:
	var bersagli: Array = []
	if not get_combatant(caster_id).is_empty() and int(get_combatant(caster_id).get("hitPoints", 0)) > 0:
		bersagli.append(caster_id)
	for c: Dictionary in _combatants:
		if bersagli.size() >= 3:
			break
		if c["kind"] == "pc" and not bool(c["defeated"]) and int(c["hitPoints"]) > 0 \
				and not bersagli.has(String(c["id"])):
			bersagli.append(String(c["id"]))
	if bersagli.is_empty():
		return false
	ConcentrationManager.inizia(caster_id, "Benedizione", bersagli)
	GameState.announce("✨ %s invoca la Benedizione: %d alleato/i colpisce con +1d4 finche' "
		% [String(get_combatant(caster_id).get("name", "Il chierico")), bersagli.size()]
		+ "l'incantatore regge la concentrazione.")
	return true


## Un PG e' sceso (o resta) a 0 PF: entra nello stato MORENTE (o subisce fallimenti se lo era
## gia'). Danno >= PF massimi = morte istantanea (regola del danno massiccio 5e).
func _gestisci_pg_a_zero(id: String, combatant: Dictionary, danno: int, era_gia_a_zero: bool,
		critico: bool) -> void:
	var nome: String = String(combatant.get("name", "L'eroe"))
	# Chi cade a terra perde ogni concentrazione (incosciente): la Benedizione svanisce.
	ConcentrationManager.interrompi(id)
	if danno >= int(combatant.get("maxHitPoints", 1)) and era_gia_a_zero:
		_tiri_morte[id] = { "successi": 0, "fallimenti": 3, "stabile": false, "morto": true }
		combatant_died_final.emit(id)
		GameState.announce("💀 %s subisce un colpo devastante mentre e' a terra... e spira." % nome)
		return
	if not _tiri_morte.has(id):
		_tiri_morte[id] = { "successi": 0, "fallimenti": 0, "stabile": false, "morto": false }
		combatant_dying.emit(id)
		GameState.announce("🩸 %s cade a terra a 0 PF! Ogni suo turno tira contro la morte "
			% nome + "(o curatelo prima che sia tardi).")
		return
	if era_gia_a_zero and not _tiri_morte[id]["morto"]:
		# Colpito mentre e' gia' a terra: un fallimento automatico (due se e' un critico).
		_tiri_morte[id]["stabile"] = false
		_aggiungi_fallimenti(id, 2 if critico else 1)


# --- Tiri salvezza contro la morte ---

## Il PG e' MORENTE (a terra, ancora in bilico: ne' stabile ne' morto)?
func is_pc_dying(id: String) -> bool:
	var s: Variant = _tiri_morte.get(id)
	if s == null:
		return false
	return not bool((s as Dictionary)["stabile"]) and not bool((s as Dictionary)["morto"])


func is_pc_stable(id: String) -> bool:
	var s: Variant = _tiri_morte.get(id)
	return s != null and bool((s as Dictionary)["stabile"])


func is_pc_dead(id: String) -> bool:
	var s: Variant = _tiri_morte.get(id)
	return s != null and bool((s as Dictionary)["morto"])


## Stato dei tiri per la UI ({} se il PG non e' in pericolo di morte).
func stato_morte(id: String) -> Dictionary:
	return _tiri_morte.get(id, {})


## Tira 1d20 per un PG morente (lo chiama DeathSaves al suo turno). 20 = torna a 1 PF; 1 = due
## fallimenti; 10+ = un successo; altrimenti un fallimento. 3 successi = stabile, 3 = morto.
func roll_death_save(id: String) -> void:
	if not is_pc_dying(id):
		return
	var nome: String = String(get_combatant(id).get("name", "L'eroe"))
	var d: int = randi_range(1, 20)
	if d == 20:
		_rianima(id, 1)
		GameState.announce("🎲 %s tira un 20 NATURALE contro la morte: si rialza con 1 PF!" % nome)
		death_save_rolled.emit(id, d, "rivive", 0, 0)
		return
	var s: Dictionary = _tiri_morte[id]
	if d == 1:
		s["fallimenti"] = int(s["fallimenti"]) + 2
	elif d >= 10:
		s["successi"] = int(s["successi"]) + 1
	else:
		s["fallimenti"] = int(s["fallimenti"]) + 1
	var esito: String = "successo" if d >= 10 else "fallimento"
	if int(s["successi"]) >= 3:
		s["stabile"] = true
		combatant_stabilized.emit(id)
		GameState.announce("🩹 %s si stabilizza: fuori pericolo, ma resta a terra." % nome)
		esito = "stabile"
	elif int(s["fallimenti"]) >= 3:
		s["morto"] = true
		combatant_died_final.emit(id)
		GameState.announce("💀 %s fallisce il terzo tiro salvezza contro la morte... e spira." % nome)
		esito = "morto"
	else:
		GameState.announce("🎲 %s, tiro contro la morte: %d (%s) — successi %d, fallimenti %d." % [
			nome, d, esito, int(s["successi"]), int(s["fallimenti"]),
		])
	death_save_rolled.emit(id, d, esito, int(s["successi"]), int(s["fallimenti"]))
	_check_end_conditions(get_combatant(id))


## Un alleato/Master STABILIZZA un PG morente (azione: prova di Medicina o kit del guaritore):
## niente piu' tiri, resta a terra ma non muore.
func stabilizza(id: String) -> bool:
	if not is_pc_dying(id):
		return false
	_tiri_morte[id]["stabile"] = true
	combatant_stabilized.emit(id)
	var nome: String = String(get_combatant(id).get("name", "L'eroe"))
	GameState.announce("🩹 %s viene stabilizzato: non morira'." % nome)
	return true


func _aggiungi_fallimenti(id: String, n: int) -> void:
	var s: Dictionary = _tiri_morte[id]
	s["fallimenti"] = int(s["fallimenti"]) + n
	if int(s["fallimenti"]) >= 3:
		s["morto"] = true
		combatant_died_final.emit(id)
		var nome: String = String(get_combatant(id).get("name", "L'eroe"))
		GameState.announce("💀 %s, colpito a terra, non ce la fa piu'." % nome)
	death_save_rolled.emit(
		id, 0, "morto" if s["morto"] else "fallimento", int(s["successi"]), int(s["fallimenti"]))


## Riporta in vita un PG morente/stabile a `pf` punti ferita (cura o 20 naturale): esce dallo
## stato di morte e torna cosciente.
func _rianima(id: String, pf: int) -> void:
	_tiri_morte.erase(id)
	var c: Dictionary = get_combatant(id)
	var char_id: String = String(c.get("characterId", ""))
	if not char_id.is_empty():
		# Il PG e' a 0 PF: curarlo di `pf` lo porta esattamente a `pf` (min con i PF massimi).
		CharacterManager.heal_by_id(char_id, maxi(1, pf))
		_sync_pcs_from_characters()
	combatant_revived.emit(id)
	combatant_healed.emit(id, pf, int(get_combatant(id).get("hitPoints", pf)))


func heal_combatant(combatant_id: String, amount: int) -> bool:
	var combatant: Dictionary = get_combatant(combatant_id)
	if combatant.is_empty():
		return false
	var healing: int = clampi(amount, 0, 9999)
	if combatant["kind"] == "pc":
		# Curare un PG MORENTE/stabile lo riporta in gioco: esce dallo stato di morte.
		var era_a_terra: bool = _tiri_morte.has(String(combatant_id))
		CharacterManager.heal_by_id(String(combatant["characterId"]), healing)
		_sync_pcs_from_characters()
		if era_a_terra and int(get_combatant(combatant_id).get("hitPoints", 0)) > 0:
			_tiri_morte.erase(String(combatant_id))
			combatant_revived.emit(combatant_id)
			GameState.announce("✨ %s riprende conoscenza e torna in piedi!"
				% String(combatant.get("name", "L'eroe")))
	else:
		combatant["hitPoints"] = mini(int(combatant["maxHitPoints"]), int(combatant["hitPoints"]) + healing)
		combatant["defeated"] = int(combatant["hitPoints"]) <= 0
	combatant_healed.emit(combatant_id, healing, int(get_combatant(combatant_id).get("hitPoints", 0)))
	return true


func _check_end_conditions(last_hit: Dictionary) -> void:
	if not _active:
		return
	# TPK: nessun PG puo' piu' agire — ne' cosciente ne' MORENTE (un morente potrebbe ancora
	# rialzarsi con un 20 o una cura, quindi finche' ce n'e' uno lo scontro NON e' perso).
	var pcs: Array = _combatants.filter(func(c: Dictionary) -> bool: return c["kind"] == "pc")
	var pcs_in_gioco: Array = pcs.filter(func(c: Dictionary) -> bool:
		return int(c["hitPoints"]) > 0 or is_pc_dying(String(c["id"])))
	if pcs.size() > 0 and pcs_in_gioco.is_empty():
		_last_event = "TPK: tutto il party e' a terra."
		party_wiped.emit()
		end_combat()
		return
	# VITTORIA: quando cade l'ultimo nemico (controllo solo sul danno a un PNG).
	if last_hit["kind"] == "npc":
		var npcs: Array = _combatants.filter(func(c: Dictionary) -> bool: return c["kind"] == "npc")
		var npcs_alive: Array = npcs.filter(func(c: Dictionary) -> bool: return not c["defeated"] and int(c["hitPoints"]) > 0)
		if npcs.size() > 0 and npcs_alive.is_empty():
			_last_event = "VITTORIA: tutti i nemici sconfitti."
			victory.emit()
			end_combat()


# --- Attacco completo (d20 vs CA, danno a segno; crit su 20 naturale) ---

## Compone la modalita' di tiro EFFETTIVA da tutte le fonti di vantaggio/svantaggio del gioco:
## condizioni di stato (Modulo 30), fiancheggiamento (Modulo 25) ed elevazione (Modulo 28), oltre
## alla modalita' scelta dal giocatore. Regola di sovrapposizione 5e: una fonte di vantaggio E una
## di svantaggio si annullano a "normal" (ElevationManager.componi_modalita la applica).
func modalita_effettiva_per_attacco(attacker_id: String, target_id: String, mode_richiesta: String) -> String:
	var vantaggio_extra: bool = false
	var svantaggio_extra: bool = false

	var cond: Dictionary = ConditionsManager.valuta_condizioni(attacker_id, target_id)
	if bool(cond.get("vantaggio", false)):
		vantaggio_extra = true
	if bool(cond.get("svantaggio", false)):
		svantaggio_extra = true

	if bool(FlankingSystem.valuta_fiancheggiamento(attacker_id, target_id).get("fiancheggiato", false)):
		vantaggio_extra = true

	var elev: String = ElevationManager.valuta_elevazione(attacker_id, target_id)
	if elev == "advantage":
		vantaggio_extra = true
	elif elev == "disadvantage":
		svantaggio_extra = true

	return ElevationManager.componi_modalita(mode_richiesta, vantaggio_extra, svantaggio_extra)


## Gittata d'attacco di un combattente in celle (1 se non specificata: mischia).
func attack_range_of(combatant_id: String) -> int:
	var c: Dictionary = get_combatant(combatant_id)
	return int(c.get("attackRange", GITTATA_MISCHIA)) if not c.is_empty() else GITTATA_MISCHIA


## Il bersaglio e' a portata dell'attaccante? Vero anche se le posizioni non sono note (nessun
## token piazzato: si combatte "in astratto", come prima della griglia). Falso solo quando
## entrambe le celle esistono e la distanza supera la gittata.
func in_attack_range(attacker_id: String, target_id: String) -> bool:
	var dist: int = cell_distance(attacker_id, target_id)
	if dist < 0:
		return true  # posizione ignota: non si blocca l'attacco
	return dist <= attack_range_of(attacker_id)


func resolve_attack(attacker_id: String, target_id: String, mode: String = "normal") -> Dictionary:
	var attacker: Dictionary = get_combatant(attacker_id)
	var target: Dictionary = get_combatant(target_id)
	if attacker.is_empty() or target.is_empty():
		return { "ok": false }
	# Fuori gittata: niente tiro (l'HUD valida prima e non spende l'azione; per IA/reazioni e'
	# la rete di sicurezza). Ritorna un risultato "mancato per distanza" leggibile.
	if not in_attack_range(attacker_id, target_id):
		var fuori: Dictionary = {
			"ok": true, "attacker": attacker_id, "target": target_id, "hit": false,
			"outOfRange": true, "damage": 0,
			"targetAc": int(target["armorClass"]), "attackTotal": 0,
		}
		attack_resolved.emit(fuori)
		return fuori
	var modalita_finale: String = modalita_effettiva_per_attacco(attacker_id, target_id, mode)
	var d20: Dictionary = roll_d20_with_mode(modalita_finale)
	var attack_total: int = int(d20["chosen"]) + int(attacker["attackBonus"])
	# BENEDIZIONE (concentrazione): un attaccante benedetto aggiunge +1d4 al tiro per colpire.
	var benedizione: int = 0
	if ConcentrationManager.benedetto(attacker_id):
		benedizione = randi_range(1, 4)
		attack_total += benedizione
	var critical: bool = bool(d20["naturalTwenty"])
	# COPERTURA (5e): a distanza, un bersaglio riparato da un prop alza la sua CA (+2 mezza, +5
	# tre quarti). In mischia non conta (si e' adiacenti).
	var copertura: int = 0
	if attack_range_of(attacker_id) > 1:
		copertura = CoverManager.bonus_ca(attacker_id, target_id)
	var ca_bersaglio: int = int(target["armorClass"]) + copertura
	# 1 naturale sbaglia sempre; 20 naturale colpisce sempre (e critica); altrimenti d20+bonus vs CA.
	var hit: bool = not bool(d20["naturalOne"]) and (critical or attack_total >= ca_bersaglio)
	if copertura > 0 and not hit:
		GameState.announce("🛡 %s e' protetto dalla copertura (CA +%d): il colpo non passa." % [
			String(target["name"]), copertura])
	var result: Dictionary = {
		"ok": true, "attacker": attacker_id, "target": target_id, "mode": modalita_finale,
		"roll": d20["chosen"], "attackTotal": attack_total, "blessing": benedizione,
		"targetAc": ca_bersaglio, "cover": copertura, "critical": critical, "hit": hit, "damage": 0,
	}
	if hit:
		var dmg: Dictionary = roll_damage_formula(String(attacker["damageFormula"]), critical)
		result["damage"] = int(dmg["total"])
		apply_damage_to_combatant(target_id, int(dmg["total"]), attacker_id, critical)
	attack_resolved.emit(result)
	return result


# --- Tiri salvezza e incantesimi ad AREA (Palla di Fuoco) ---

## Tiro salvezza di un combattente su una caratteristica ("dex", "con"...). Per i PG usa la
## scheda vera (mod + competenza se proficiente); per i PNG un proxy onesto: DES dal bonus di
## iniziativa, il resto dal bonus d'attacco - 2 (robustezza fisica approssimata).
func saving_throw(combatant_id: String, ability: String, dc: int) -> Dictionary:
	var bonus: int = 0
	var char_id: String = character_id_di(combatant_id)
	if not char_id.is_empty():
		var pg: CharacterData = CharacterManager.get_character_by_id(char_id)
		if pg:
			bonus = pg.saving_throw_modifier(ability)
	else:
		var c: Dictionary = get_combatant(combatant_id)
		bonus = int(c.get("initiativeBonus", 0)) if ability == "dex" \
			else maxi(0, int(c.get("attackBonus", 2)) - 2)
	var tiro: int = roll_d20_with_mode("normal")["chosen"]
	return {
		"combatant": combatant_id, "ability": ability, "dc": dc,
		"roll": tiro, "total": tiro + bonus, "success": tiro + bonus >= dc,
	}


## PALLA DI FUOCO del mago (5e semplificata): esplosione centrata sulla cella del bersaglio,
## raggio in celle (Chebyshev), tiro salvezza su DES per TUTTI i combattenti nell'area —
## alleati compresi: il fuoco amico e' D&D vero. Danno pieno se fallito, META' se riuscito.
## Lascia una superficie di FUOCO sull'area (brucia nei round successivi: SurfacesManager).
## dc e formula arrivano dal chiamante (l'HUD li deriva dalla scheda del mago).
func palla_di_fuoco(caster_id: String, centro: Vector2i, raggio: int, formula: String, dc: int) -> Dictionary:
	var caster: Dictionary = get_combatant(caster_id)
	if caster.is_empty():
		return { "ok": false }
	var colpiti: Array[Dictionary] = []
	for c: Dictionary in _combatants:
		if bool(c["defeated"]):
			continue
		var cid: String = String(c["id"])
		var cella: Variant = get_combatant_cell(cid)
		if cella == null:
			continue
		if maxi(absi((cella as Vector2i).x - centro.x), absi((cella as Vector2i).y - centro.y)) > raggio:
			continue
		var salvezza: Dictionary = saving_throw(cid, "dex", dc)
		var danno: Dictionary = roll_damage_formula(formula, false)
		var subito: int = int(danno["total"])
		if bool(salvezza["success"]):
			@warning_ignore("integer_division")
			subito = subito / 2  # meta' danno (arrotondato in giu'), regola 5e
		apply_damage_to_combatant(cid, subito, caster_id)
		colpiti.append({
			"id": cid, "name": String(c["name"]), "salvato": bool(salvezza["success"]),
			"tiro": int(salvezza["total"]), "danno": subito,
		})
		if not _active:
			break  # l'esplosione ha CHIUSO lo scontro (vittoria/TPK): stop, niente altri bersagli
	# L'area resta in fiamme: chi ci sta dentro nei prossimi round si scotta (Modulo 27).
	SurfacesManager.crea_superficie("fuoco", centro.x, centro.y, raggio)
	var righe: PackedStringArray = []
	for hit: Dictionary in colpiti:
		righe.append("%s %s (%d): %d danni" % [
			String(hit["name"]), "salva" if bool(hit["salvato"]) else "FALLISCE",
			int(hit["tiro"]), int(hit["danno"]),
		])
	GameState.announce("🔥 %s scaglia una PALLA DI FUOCO (CD %d)! %s" % [
		String(caster["name"]), dc,
		" · ".join(righe) if not righe.is_empty() else "L'area brucia, ma nessuno era nel raggio.",
	])
	_last_event = "Palla di fuoco di " + String(caster["name"])
	return { "ok": true, "colpiti": colpiti, "centro": centro, "raggio": raggio }


# --- Spinta (porting del Modulo 26): prova contrapposta Atletica vs Atletica/Acrobazia ---

## L'attaccante spinge il bersaglio: Atletica (FOR) contro la migliore tra Atletica e Acrobazia
## (DES) del bersaglio. In caso di successo il bersaglio va spostato di 1 cella (il movimento sulla
## griglia lo gestira' il modulo mappa via il signal shove_resolved).
func shove(attacker_id: String, target_id: String) -> Dictionary:
	var attacker: Dictionary = get_combatant(attacker_id)
	var target: Dictionary = get_combatant(target_id)
	if attacker.is_empty() or target.is_empty():
		return { "ok": false }
	var atk_bonus: int = _athletics_bonus(attacker_id)
	var def_bonus: int = maxi(_athletics_bonus(target_id), _acrobatics_bonus(target_id))
	var atk_roll: int = roll_d20_with_mode("normal")["chosen"] + atk_bonus
	var def_roll: int = roll_d20_with_mode("normal")["chosen"] + def_bonus
	var success: bool = atk_roll >= def_roll  # in parita' vince chi spinge (regola del monolite)
	var result: Dictionary = {
		"ok": true, "attacker": attacker_id, "target": target_id,
		"attackRoll": atk_roll, "defenseRoll": def_roll, "success": success,
	}
	_last_event = "%s spinge %s: %s" % [attacker["name"], target["name"], "riuscita" if success else "fallita"]
	shove_resolved.emit(result)
	return result


func _athletics_bonus(combatant_id: String) -> int:
	var char_id: String = character_id_di(combatant_id)
	if not char_id.is_empty():
		var pg: CharacterData = CharacterManager.get_character_by_id(char_id)
		if pg:
			return pg.skill_modifier("athletics")
	# PNG: approssimazione dal bonus d'attacco (proxy della forza fisica), come nel legacy.
	var c: Dictionary = get_combatant(combatant_id)
	return int(c.get("attackBonus", 2)) - 2 if not c.is_empty() else 0


func _acrobatics_bonus(combatant_id: String) -> int:
	var char_id: String = character_id_di(combatant_id)
	if not char_id.is_empty():
		var pg: CharacterData = CharacterManager.get_character_by_id(char_id)
		if pg:
			return pg.skill_modifier("acrobatics")
	var c: Dictionary = get_combatant(combatant_id)
	return int(c.get("initiativeBonus", 0)) if not c.is_empty() else 0


# --- Reazione / Attacco di opportunita' (porting del Modulo 24) ---

## Un combattente sferra un attacco di opportunita' su un bersaglio che si allontana. Consuma la
## reazione (la spesa la valida InventoryManager per il PG). Ritorna il risultato dell'attacco.
func opportunity_attack(reactor_id: String, target_id: String) -> Dictionary:
	# L'economia azioni "viva" e' del PG ATTIVO (gli altri membri hanno la loro in snapshot):
	# la spesa della reazione si valida solo per lui; i compagni reagiscono senza contabilita'.
	if reactor_id == pc_attivo_id() and not InventoryManager.spend_action_resource("reaction"):
		return { "ok": false, "reason": "Reazione gia' spesa." }
	return resolve_attack(reactor_id, target_id, "normal")


# --- Posizioni sulla griglia (letta da fiancheggiamento/elevazione/superfici/IA nemici) ---

## Registra/aggiorna la cella di un combattente ed emette il signal (la UI mappa si allinea da sola).
func set_combatant_cell(combatant_id: String, cell: Vector2i) -> void:
	_positions[combatant_id] = cell
	combatant_position_changed.emit(combatant_id, cell)


## Cella corrente di un combattente, o null se non ancora nota (nessun token piazzato per lui).
func get_combatant_cell(combatant_id: String) -> Variant:
	return _positions.get(combatant_id)


func has_combatant_cell(combatant_id: String) -> bool:
	return _positions.has(combatant_id)


func clear_combatant_cell(combatant_id: String) -> void:
	_positions.erase(combatant_id)


## Toglie un PNG dalla scena su ordine del Master (strumento del cassetto): NON e' una morte —
## niente XP ne' bottino, il nemico semplicemente se ne va (fugge, viene rimosso per errore, ecc.).
## Non tocca i PG del party (quelli si gestiscono dalla scheda/creazione). Se era il suo turno, si
## passa al successivo per non lasciare il combattimento appeso su un combattente inesistente.
func remove_combatant(combatant_id: String) -> bool:
	var indice: int = -1
	for i: int in range(_combatants.size()):
		if _combatants[i]["id"] == combatant_id:
			indice = i
			break
	if indice == -1 or _combatants[indice]["kind"] == "pc":
		return false
	var era_suo_turno: bool = _active and indice == _current_turn_index
	_combatants.remove_at(indice)
	_positions.erase(combatant_id)
	if _active and indice < _current_turn_index:
		_current_turn_index -= 1  # l'ordine si e' accorciato prima del turno corrente
	combatant_removed.emit(combatant_id)
	var npc_rimasti: Array = _combatants.filter(func(c: Dictionary) -> bool: return c["kind"] == "npc")
	if _active and npc_rimasti.is_empty():
		# tolto l'ultimo nemico: e' comunque una fine dello scontro (senza vittoria "da uccisione")
		end_combat()
	elif era_suo_turno:
		# Il turno passa al PROSSIMO VIVO, non semplicemente a chi e' scivolato in quell'indice
		# (che potrebbe essere un combattente gia' sconfitto: il giro si bloccherebbe su di lui).
		var prossimo: int = _find_next_living_index(_current_turn_index - 1)
		if prossimo >= 0:
			_current_turn_index = prossimo
			turn_changed.emit(String(_combatants[_current_turn_index]["id"]), _round)
	return true


## Distanza Chebyshev in celle tra due combattenti, o -1 se una posizione non e' nota.
func cell_distance(id_a: String, id_b: String) -> int:
	if not (_positions.has(id_a) and _positions.has(id_b)):
		return -1
	var a: Vector2i = _positions[id_a]
	var b: Vector2i = _positions[id_b]
	return maxi(absi(a.x - b.x), absi(a.y - b.y))
