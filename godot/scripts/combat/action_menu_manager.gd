extends Node
## ActionMenuManager (Autoload singleton) — porting del Modulo 38 JS "Action / Bonus Action Menu
## Dinamico". Le opzioni di Azione Bonus non sono fisse: si generano valutando CLASSE, RAZZA e
## INVENTARIO del PG attivo (una pozione bevuta si consuma, un'arma secondaria equipaggiata abilita
## un attacco bonus, una capacita' di classe cura/potenzia). Generazione PURA e testabile;
## esecuzione con effetti reali (spende l'Azione Bonus, poi applica l'effetto).
##
## Registrazione: Project Settings > Autoload -> "ActionMenuManager" (dopo CharacterManager,
## InventoryManager, CombatManager).

signal options_changed(options: Array[Dictionary])

const CAPABILITIES_PATH: String = "res://data/bonus_capabilities.json"

var _capacita_classe: Dictionary = {}
var _capacita_razza: Dictionary = {}


func _ready() -> void:
	if not FileAccess.file_exists(CAPABILITIES_PATH):
		push_warning("ActionMenuManager: catalogo non trovato: " + CAPABILITIES_PATH)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CAPABILITIES_PATH))
	if parsed is Dictionary:
		_capacita_classe = parsed.get("classe", {})
		_capacita_razza = parsed.get("razza", {})


func _normalizza(s: String) -> String:
	return s.to_lower().strip_edges()


func _voce_da_capacita(cap: Dictionary, fonte: String) -> Dictionary:
	return {
		"id": String(cap.get("id", "")), "etichetta": String(cap.get("etichetta", "")),
		"kind": String(cap.get("kind", "bonusAction")), "fonte": fonte,
		"effetto": String(cap.get("effetto", "annuncio")), "descrizione": String(cap.get("descrizione", "")),
		"formula": cap.get("formula"), "scalaLivello": bool(cap.get("scalaLivello", false)),
	}


## Genera le opzioni disponibili ORA (funzione pura, testabile). ctx = { className, ancestry,
## level, consumabili:[{inventoryId,name,healing}], armaSecondaria:{name,damage}|null }.
func opzioni_azione_bonus(ctx: Dictionary) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var cls: String = _normalizza(String(ctx.get("className", "")))
	for cap: Variant in _capacita_classe.get(cls, []):
		out.append(_voce_da_capacita(cap, "classe"))
	var raz: String = _normalizza(String(ctx.get("ancestry", "")))
	for cap: Variant in _capacita_razza.get(raz, []):
		out.append(_voce_da_capacita(cap, "razza"))
	for c: Variant in ctx.get("consumabili", []):
		if not (c is Dictionary) or String((c as Dictionary).get("healing", "")).is_empty():
			continue
		var cd: Dictionary = c
		out.append({
			"id": "usa-" + String(cd["inventoryId"]), "etichetta": "Bevi " + String(cd["name"]),
			"kind": "bonusAction", "fonte": "inventario", "effetto": "pozione",
			"descrizione": "Cura " + String(cd["healing"]) + " HP. L'oggetto viene consumato.",
			"inventoryId": String(cd["inventoryId"]), "formula": String(cd["healing"]),
		})
	var arma_sec: Variant = ctx.get("armaSecondaria")
	if arma_sec is Dictionary and not String((arma_sec as Dictionary).get("name", "")).is_empty():
		var ad: Dictionary = arma_sec
		out.append({
			"id": "offhand-attack", "etichetta": "Colpo con " + String(ad["name"]),
			"kind": "bonusAction", "fonte": "inventario", "effetto": "attaccoSecondario",
			"descrizione": "Attacco bonus con l'arma secondaria (" + String(ad.get("damage", "1d4")) + ").",
			"danno": String(ad.get("damage", "1d4")),
		})
	return out


## Legge il contesto REALE dal gioco (PG attivo + inventario).
func contesto_corrente() -> Dictionary:
	var active: CharacterData = CharacterManager.get_active()
	if active == null:
		return { "className": "", "ancestry": "", "level": 1, "consumabili": [], "armaSecondaria": null }
	var consumabili: Array[Dictionary] = []
	for entry: Dictionary in InventoryManager.get_inventory():
		var def: Dictionary = InventoryManager.item_definition(String(entry["catalogId"]))
		if String(def.get("type", "")) == "consumable" and def.has("healing"):
			consumabili.append({ "inventoryId": entry["inventoryId"], "name": def["name"], "healing": def["healing"] })
	var arma_secondaria: Variant = null
	var off_id: Variant = InventoryManager.get_equipment().get("offHand")
	if off_id != null:
		for entry: Dictionary in InventoryManager.get_inventory():
			if entry["inventoryId"] == off_id:
				var def: Dictionary = InventoryManager.item_definition(String(entry["catalogId"]))
				if String(def.get("type", "")) == "weapon" and def.has("damage"):
					arma_secondaria = { "name": def["name"], "damage": def["damage"] }
				break
	return {
		"className": active.class_name_label, "ancestry": active.ancestry, "level": active.level,
		"consumabili": consumabili, "armaSecondaria": arma_secondaria,
	}


func get_current_options() -> Array[Dictionary]:
	var opzioni: Array[Dictionary] = opzioni_azione_bonus(contesto_corrente())
	options_changed.emit(opzioni)
	return opzioni


## Esegue un'opzione: spende la risorsa (Azione Bonus) e applica l'effetto. target_id serve solo
## per "attaccoSecondario" (il bersaglio selezionato nell'HUD di combattimento). Ritorna true se
## eseguita, false se la risorsa era gia' esaurita.
func esegui(opzione: Dictionary, target_id: String = "") -> bool:
	if opzione.is_empty():
		return false
	if not InventoryManager.spend_action_resource(String(opzione.get("kind", "bonusAction"))):
		GameState.announce("Azione Bonus gia' spesa in questo turno.")
		return false
	match String(opzione.get("effetto", "annuncio")):
		"pozione":
			return _effetto_pozione(opzione)
		"curaSe":
			return _effetto_cura_se(opzione)
		"attaccoSecondario":
			return _effetto_attacco_secondario(opzione, target_id)
		"movimento":
			return _effetto_movimento(opzione)
		_:
			var desc: String = String(opzione.get("descrizione", ""))
			GameState.announce("✦ %s%s" % [String(opzione["etichetta"]), (" — " + desc) if not desc.is_empty() else ""])
			return true


func _tira(formula: String) -> int:
	return int(CombatManager.roll_damage_formula(formula, false)["total"])


func _effetto_pozione(opzione: Dictionary) -> bool:
	var guarigione: int = _tira(String(opzione.get("formula", "2d4+2")))
	CharacterManager.heal(guarigione)
	if opzione.has("inventoryId"):
		InventoryManager.drop_item(String(opzione["inventoryId"]))
	GameState.announce("🧪 %s: cura %d HP. Oggetto consumato." % [String(opzione["etichetta"]), guarigione])
	return true


func _effetto_cura_se(opzione: Dictionary) -> bool:
	var active: CharacterData = CharacterManager.get_active()
	var bonus: int = active.level if bool(opzione.get("scalaLivello", false)) else (active.modifier_of("wis") if active else 0)
	var guarigione: int = _tira(String(opzione.get("formula", "1d4"))) + bonus
	CharacterManager.heal(guarigione)
	GameState.announce("✚ %s: recuperi %d HP." % [String(opzione["etichetta"]), guarigione])
	return true


## Attacco bonus (combattimento con due armi): stessa risoluzione dell'attacco standard sul PG
## attivo (il danno dell'arma secondaria specifica non e' distinto — fedele al monolite, che fa
## lo stesso). Senza un bersaglio passato dall'HUD, si limita ad annunciare.
func _effetto_attacco_secondario(opzione: Dictionary, target_id: String) -> bool:
	if target_id.is_empty():
		GameState.announce("⚔️ Nessun bersaglio per l'attacco secondario.")
		return true
	CombatManager.resolve_attack(CombatManager.pc_attivo_id(), target_id, "normal")
	GameState.announce("⚔️ %s (attacco bonus)." % String(opzione["etichetta"]))
	return true


func _effetto_movimento(opzione: Dictionary) -> bool:
	GameState.announce("💨 %s: guadagni movimento extra." % String(opzione["etichetta"]))
	return true
