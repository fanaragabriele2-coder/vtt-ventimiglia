extends Node
## ProgressionManager (Autoload singleton) — porting del Modulo 15 JS "XP & Loot System".
##
## Ascolta CombatManager.combatant_defeated: assegna XP a chi ha DAVVERO sferrato il colpo (il
## source_id passato da resolve_attack, non il PG mostrato in hotseat), gestisce il level-up
## (HP max e competenza, via CharacterManager.apply_level_up), e mette in coda il bottino (oggetti
## reali del catalogo + oro, con drop di rarita' dell'Armeria scalati sulla forza del nemico).
##
## Registrazione: Project Settings > Autoload -> "ProgressionManager" (dopo ArmeriaManager,
## prima di CombatManager — deve poter ascoltare il suo signal appena CombatManager e' pronto).

## Un personaggio guadagna XP (per la barra XP della UI).
signal xp_gained(character_id: String, amount: int, reason: String)
## Un personaggio sale di livello.
signal leveled_up(character_id: String, from_level: int, to_level: int, hp_gain: int)
## Bottino pronto da mostrare (popup): { items: [catalogId...], gold: int, enemyName: String }.
signal loot_ready(loot: Dictionary)

const LOOT_TABLES_PATH: String = "res://data/loot_tables.json"

var _xp_by_name: Dictionary = {}
var _level_xp: PackedInt32Array = []
var _loot_by_name: Dictionary = {}
var _loot_fallback: Array = []

# Progressione per personaggio: id -> { xp:int, level:int, gold:int }.
var _progression: Dictionary = {}


func _ready() -> void:
	_load_tables()
	CombatManager.combatant_defeated.connect(_on_combatant_defeated)


func _load_tables() -> void:
	if not FileAccess.file_exists(LOOT_TABLES_PATH):
		push_warning("ProgressionManager: tabelle non trovate: " + LOOT_TABLES_PATH)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(LOOT_TABLES_PATH))
	if not (parsed is Dictionary):
		return
	_xp_by_name = parsed.get("xpByName", {})
	for v: Variant in parsed.get("levelXp", []):
		_level_xp.append(int(v))
	_loot_by_name = parsed.get("lootByName", {})
	_loot_fallback = parsed.get("lootFallback", [])


func _proficiency_by_level(level: int) -> int:
	if level >= 17:
		return 6
	if level >= 13:
		return 5
	if level >= 9:
		return 4
	if level >= 5:
		return 3
	return 2


## Rimuove il numero finale ("Goblin 2" -> "Goblin"): i nemici duplicati portano un contatore nel
## nome (CombatManager.add_npc), ma le tabelle XP/loot sono per SPECIE.
func _base_name(combatant_name: String) -> String:
	var regex := RegEx.new()
	regex.compile("\\s+\\d+$")
	return regex.sub(combatant_name, "").strip_edges()


func _xp_for_enemy(combatant: Dictionary) -> int:
	var bn: String = _base_name(String(combatant.get("name", "")))
	if _xp_by_name.has(bn):
		return int(_xp_by_name[bn])
	return maxi(10, roundi(float(combatant.get("maxHitPoints", combatant.get("hitPoints", 4))) * 6))


func _level_for_xp(xp: int) -> int:
	var level: int = 1
	for i: int in range(_level_xp.size()):
		if xp >= _level_xp[i]:
			level = i + 1
	return mini(20, level)


func get_prog(character_id: String) -> Dictionary:
	if not _progression.has(character_id):
		var c: CharacterData = CharacterManager.get_character_by_id(character_id)
		var level: int = c.level if c else 1
		_progression[character_id] = {
			"xp": _level_xp[maxi(0, level - 1)] if not _level_xp.is_empty() else 0,
			"level": level, "gold": 0,
		}
	return _progression[character_id]


## L'ORO complessivo del party (la borsa comune: i mercanti la guardano tutta, non solo il PG
## attivo — l'oro dei bottini finisce a chi da' il colpo di grazia, ma si spende insieme).
func oro_totale() -> int:
	var totale: int = 0
	for pg: CharacterData in CharacterManager.get_party():
		totale += int(get_prog(pg.id).get("gold", 0))
	return totale


## Spende oro dalla borsa comune (prima dal PG attivo, poi dagli altri). Ritorna false (e non
## tocca nulla) se il party non ha abbastanza oro in tutto.
func spendi_oro(quanto: int) -> bool:
	if quanto <= 0:
		return true
	if oro_totale() < quanto:
		return false
	var resto: int = quanto
	var ordine: Array[CharacterData] = []
	var attivo: CharacterData = CharacterManager.get_active()
	if attivo:
		ordine.append(attivo)
	for pg: CharacterData in CharacterManager.get_party():
		if not ordine.has(pg):
			ordine.append(pg)
	for pg: CharacterData in ordine:
		if resto <= 0:
			break
		var prog: Dictionary = get_prog(pg.id)
		var suo: int = int(prog.get("gold", 0))
		var preso: int = mini(suo, resto)
		prog["gold"] = suo - preso
		resto -= preso
	return true


## Progresso frazionario verso il prossimo livello (per la barra XP): { cur, need, pct }.
func xp_band(character_id: String) -> Dictionary:
	var prog: Dictionary = get_prog(character_id)
	var level: int = int(prog["level"])
	if level >= 20 or _level_xp.size() < 20:
		return { "cur": int(prog["xp"]) - (_level_xp[19] if _level_xp.size() > 19 else 0), "need": 0, "pct": 100 }
	var base: int = _level_xp[level - 1]
	var next_xp: int = _level_xp[level]
	var pct: int = roundi(float(int(prog["xp"]) - base) / float(maxi(1, next_xp - base)) * 100.0)
	return { "cur": int(prog["xp"]) - base, "need": next_xp - base, "pct": clampi(pct, 0, 100) }


## Assegna XP a un personaggio (default: il PG attivo). Gestisce level-up in cascata se necessario.
func gain_xp(amount: int, reason: String = "", target_id: String = "") -> void:
	var amt: int = maxi(0, amount)
	if amt <= 0:
		return
	var id: String = target_id if not target_id.is_empty() else (CharacterManager.get_active().id if CharacterManager.get_active() else "")
	if id.is_empty():
		return
	var prog: Dictionary = get_prog(id)
	var from_level: int = int(prog["level"])
	prog["xp"] = int(prog["xp"]) + amt
	var suffix: String = (" — " + reason) if not reason.is_empty() else ""
	GameState.announce("✨ +%d XP%s (%s)." % [amt, suffix, _name_of(id)])
	xp_gained.emit(id, amt, reason)
	var to_level: int = _level_for_xp(int(prog["xp"]))
	if to_level > from_level:
		prog["level"] = to_level
		_apply_level_up(id, from_level, to_level)


func _apply_level_up(character_id: String, from_level: int, to_level: int) -> void:
	var c: CharacterData = CharacterManager.get_character_by_id(character_id)
	var con_mod: int = c.modifier_of("con") if c else 0
	var hit_die: int = 8
	if c:
		var regex := RegEx.new()
		regex.compile("d(\\d+)")
		var m: RegExMatch = regex.search(c.hit_dice_formula)
		if m:
			hit_die = int(m.get_string(1))
	var hp_gain: int = 0
	for _l: int in range(from_level + 1, to_level + 1):
		@warning_ignore("integer_division")  # meta' del dado vita (regola 5e): intero voluto
		hp_gain += maxi(1, int(hit_die / 2) + 1 + con_mod)
	var prof: int = _proficiency_by_level(to_level)
	CharacterManager.apply_level_up(character_id, hp_gain, to_level, prof)
	GameState.announce("⭐ LIVELLO %d! %s sale di livello: +%d HP max, competenza +%d." % [
		to_level, _name_of(character_id), hp_gain, prof,
	])
	leveled_up.emit(character_id, from_level, to_level, hp_gain)


func _name_of(character_id: String) -> String:
	var c: CharacterData = CharacterManager.get_character_by_id(character_id)
	return c.character_name if c else "Eroe"


func complete_quest(quest_name: String, xp: int = 100) -> void:
	gain_xp(xp, "missione" + (": " + quest_name if not quest_name.is_empty() else "") + " completata")


# --- Bottino ---

func _loot_for_enemy(combatant: Dictionary) -> Dictionary:
	var bn: String = _base_name(String(combatant.get("name", "")))
	var table: Array = _loot_by_name.get(bn, _loot_fallback)
	var items: Array = []
	for row: Variant in table:
		if randf() < float(row[1]):
			items.append(String(row[0]))
	var ref: int = int(_xp_by_name.get(bn, 30))
	for id: String in ArmeriaManager.roll_drop_nemico(ref):
		items.append(id)
	@warning_ignore("integer_division")  # oro scalato sull'XP del nemico: intero voluto
	var gold: int = randi_range(1, maxi(3, int(ref / 8)))
	return { "items": items, "gold": gold, "enemyName": bn }


func _item_name(catalog_id: String) -> String:
	var def: Dictionary = InventoryManager.item_definition(catalog_id)
	return String(def.get("name", catalog_id))


## Raccoglie il bottino in coda: aggiunge gli oggetti allo zaino e l'oro alla progressione del PG
## attivo, poi annuncia in chat.
func collect_loot(loot: Dictionary) -> void:
	for item_id: Variant in loot.get("items", []):
		InventoryManager.add_item(String(item_id), 1)
	var gold: int = int(loot.get("gold", 0))
	if gold > 0:
		var active: CharacterData = CharacterManager.get_active()
		if active:
			var prog: Dictionary = get_prog(active.id)
			prog["gold"] = int(prog.get("gold", 0)) + gold
	var parts: PackedStringArray = []
	for item_id: Variant in loot.get("items", []):
		parts.append(_item_name(String(item_id)))
	if gold > 0:
		parts.append("%d oro" % gold)
	var joined: String = ", ".join(parts) if not parts.is_empty() else "nulla"
	GameState.announce("🎒 Raccolto da %s: %s." % [String(loot.get("enemyName", "")), joined])


func _on_combatant_defeated(combatant_id: String, source_id: String) -> void:
	var combatant: Dictionary = CombatManager.get_combatant(combatant_id)
	if combatant.is_empty():
		return
	# Se il colpo di grazia non ha un attaccante noto (es. superficie ambientale) l'XP va al PG
	# attivo: e' comunque il party ad averlo ottenuto, meglio di perderlo.
	var killer_id: String = source_id if not source_id.is_empty() else CombatManager.pc_attivo_id()
	# Ogni membro del party e' un combattente ("pc-<id>"): l'XP va al PERSONAGGIO che ha sferrato
	# il colpo, chiunque fosse sulla scheda in quel momento. Colpi "ambientali" -> PG attivo.
	var char_id: String = CombatManager.character_id_di(killer_id)
	var progression_id: String = char_id if not char_id.is_empty() else (CharacterManager.get_active().id if CharacterManager.get_active() else killer_id)
	gain_xp(_xp_for_enemy(combatant), "sconfitto " + _base_name(String(combatant.get("name", ""))), progression_id)
	var loot: Dictionary = _loot_for_enemy(combatant)
	if not loot["items"].is_empty() or int(loot["gold"]) > 0:
		loot_ready.emit(loot)


# --- Salvataggio partita (SaveManager) ---

## Tutta la progressione (xp/livello/oro) di ogni PG mai esistito nel party, non solo l'attivo.
func get_save_state() -> Dictionary:
	return _progression.duplicate(true)


## Non emette segnali: chi chiama (SaveManager) lo fa PRIMA di CharacterManager.hydrate_party, cosi'
## quando party_changed scatena il refresh della UI (barra XP...) i dati sono gia' quelli giusti.
func hydrate_save_state(state: Dictionary) -> void:
	_progression = state.duplicate(true)
