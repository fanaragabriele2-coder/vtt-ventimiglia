extends Node
## SpellBook (Autoload) — il GRIMORIO GIOCABILE: gli incantesimi del catalogo (data/spells.json)
## che si LANCIANO davvero in combattimento, consumando gli SLOT della scheda (InventoryManager).
##
## Incantesimi implementati (gli altri del catalogo restano voci da scheda):
##  - fireBolt (trucchetto): attacco magico a distanza, 1d10 fuoco (raddoppia sul 20);
##  - magicMissile (L1): 3 dardi da 1d4+1 che colpiscono SEMPRE;
##  - cureWounds (L1, contatto): cura 1d8+mod al PG piu' ferito ADIACENTE (o te stesso);
##  - healingWord (L1, azione BONUS): cura 1d4+mod a distanza al PG piu' ferito;
##  - shieldSpell (L1, REAZIONE): +5 CA fino al tuo turno — offerto con un PROMPT quando un
##    nemico ti attacca (EnemyAI attende la risposta: la reazione e' una SCELTA del giocatore);
##  - lightningBolt (L2): 4d6 a TUTTI sulla LINEA incantatore->bersaglio, TS DES dimezza;
##  - web (L2): area raggio 1 — TS FOR o AFFERRATO (2 round, niente movimento).
## CD e attacco magico derivano dalla SCHEDA (8/prof + mod INT per il mago, SAG per il chierico).
## Gli slot sono del PG ATTIVO (la scheda aperta): e' lui che lancia dai pulsanti.

const PC_PREFISSO: String = "pc-"
## Incantesimi con un EFFETTO giocabile (gli altri del catalogo non compaiono nel popup).
const IMPLEMENTATI: Array[String] = [
	"fireBolt", "magicMissile", "cureWounds", "healingWord", "lightningBolt", "web",
]
const CELLE_PER_METRO: float = 1.0 / 1.5


## Gli incantesimi PREPARATI e implementati del PG attivo, pronti per il popup dell'HUD:
## { id, nome, livello, costo ("action"/"bonusAction"), slotResidui, descrizione }.
func lanciabili() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var slots: Dictionary = InventoryManager.get_spell_slots()
	for voce: Dictionary in InventoryManager.get_spellbook():
		if not bool(voce.get("prepared", false)):
			continue
		var id: String = String(voce.get("spellId", ""))
		if not IMPLEMENTATI.has(id):
			continue
		var def: Dictionary = InventoryManager.spell_definition(id)
		var livello: int = int(def.get("level", 0))
		var residui: int = 99 if livello == 0 \
			else int((slots.get(livello, {}) as Dictionary).get("remaining", 0))
		out.append({
			"id": id, "nome": String(def.get("name", id)), "livello": livello,
			"costo": String(def.get("castingTime", "action")), "slotResidui": residui,
			"descrizione": String(def.get("effect", "")),
		})
	return out


## Lancia un incantesimo. Valida bersaglio/gittata, POI consuma lo slot, poi applica l'effetto.
## `gratis` = true per le pergamene (nessuno slot). Ritorna { ok, motivo }.
func lancia(caster_id: String, spell_id: String, target_id: String = "",
		gratis: bool = false) -> Dictionary:
	var caster: Dictionary = CombatManager.get_combatant(caster_id)
	if caster.is_empty() or int(caster.get("hitPoints", 0)) <= 0:
		return { "ok": false, "motivo": "L'incantatore non puo' agire." }
	var esito: Dictionary = _valida_ed_esegui(caster_id, spell_id, target_id, gratis)
	if bool(esito.get("ok", false)):
		CombatSfx.suona("magia")
	return esito


## Il PROMPT dello SCUDO (reazione interattiva): un nemico sta per attaccare questo PG — se il
## PG attivo conosce Scudo, ha uno slot L1 e la reazione libera, gli si CHIEDE se lanciarlo
## (+5 CA fino al suo turno). Atteso da EnemyAI prima di risolvere il colpo.
func offri_scudo(target_id: String, nome_attaccante: String) -> void:
	if not _puo_offrire_scudo(target_id):
		return
	var nome: String = String(CombatManager.get_combatant(target_id).get("name", "il PG"))
	var si: bool = await ReactionPrompt.chiedi(
		"⚡ %s attacca %s!" % [nome_attaccante, nome],
		"Lanciare SCUDO come reazione? +5 CA fino al suo prossimo turno (1 slot L1).",
		"🛡 Scudo!", "Lascia correre")
	if not si or not CombatManager.is_active() or not InventoryManager.cast_spell("shieldSpell"):
		return
	TacticalRules.spendi_reazione(target_id)
	TacticalRules.attiva_scudo(target_id)
	CombatSfx.suona("magia")


## Tutte le porte da superare perche' il prompt dello Scudo abbia senso. Gli slot sono della
## scheda APERTA: lo Scudo si offre solo al PG attivo.
func _puo_offrire_scudo(target_id: String) -> bool:
	if not target_id.begins_with(PC_PREFISSO) or not CombatManager.is_active():
		return false
	var c: Dictionary = CombatManager.get_combatant(target_id)
	if c.is_empty() or int(c.get("hitPoints", 0)) <= 0:
		return false
	if TacticalRules.scudo_attivo(target_id) or not TacticalRules.reazione_disponibile(target_id):
		return false
	var attivo: CharacterData = CharacterManager.get_active()
	if attivo == null or CombatManager.character_id_di(target_id) != attivo.id:
		return false
	return _conosce_preparato("shieldSpell") and _ha_slot(1)


# --- Validazione e smistamento ---

## NOTA su bind(): in Godot 4 gli argomenti legati vanno IN CODA alla chiamata — percio' ogni
## effetto ha `solo_valida` come PRIMO parametro (arriva da call()), e il resto legato dopo.
func _valida_ed_esegui(caster_id: String, spell_id: String, target_id: String,
		gratis: bool) -> Dictionary:
	var effetti: Dictionary = {
		"fireBolt": _dardo_di_fuoco.bind(caster_id, target_id),
		"magicMissile": _dardo_incantato.bind(caster_id, target_id),
		"cureWounds": _cura_ferite.bind(caster_id, true),
		"healingWord": _cura_ferite.bind(caster_id, false),
		"lightningBolt": _fulmine.bind(caster_id, target_id),
		"web": _ragnatela.bind(caster_id, target_id),
	}
	if not effetti.has(spell_id):
		return { "ok": false, "motivo": "Incantesimo non ancora implementato." }
	return _con_slot(spell_id, gratis, effetti[spell_id])


## Prova l'effetto e SOLO se e' valido consuma lo slot: uno slot non si spreca mai su un
## bersaglio fuori portata (l'effetto valida prima di toccare il mondo).
func _con_slot(spell_id: String, gratis: bool, effetto: Callable) -> Dictionary:
	var controllo: Variant = effetto.call(true)   # prova a vuoto: solo validazione
	if controllo is Dictionary and not bool((controllo as Dictionary).get("ok", false)):
		return controllo
	if not gratis and not InventoryManager.cast_spell(spell_id):
		return { "ok": false, "motivo": "Nessuno slot disponibile per questo livello." }
	return effetto.call(false)                    # esecuzione vera


func _mod_incantatore(caster_id: String) -> Dictionary:
	var pg: CharacterData = CharacterManager.get_character_by_id(
		CombatManager.character_id_di(caster_id))
	if pg == null:
		return { "mod": 2, "prof": 2, "dc": 12 }
	var stat: String = "wis" if pg.class_name_label.to_lower() == "chierico" else "int"
	var mod: int = pg.modifier_of(stat)
	return { "mod": mod, "prof": pg.proficiency_bonus, "dc": 8 + pg.proficiency_bonus + mod }


func _celle_da_range(metri: float) -> int:
	return maxi(1, roundi(metri * CELLE_PER_METRO))


func _distanza_celle(a_id: String, b_id: String) -> int:
	var a: Variant = CombatManager.get_combatant_cell(a_id)
	var b: Variant = CombatManager.get_combatant_cell(b_id)
	if a == null or b == null:
		return 9999
	return maxi(absi((a as Vector2i).x - (b as Vector2i).x),
		absi((a as Vector2i).y - (b as Vector2i).y))


func _nome(id: String) -> String:
	return String(CombatManager.get_combatant(id).get("name", id))


# --- Effetti (`solo_valida` PRIMO parametro: arriva da call(), il resto e' legato con bind) ---

func _dardo_di_fuoco(solo_valida: bool, caster_id: String, target_id: String) -> Dictionary:
	if target_id.is_empty():
		return { "ok": false, "motivo": "Scegli un bersaglio per il Dardo di Fuoco." }
	if _distanza_celle(caster_id, target_id) > _celle_da_range(36.0):
		return { "ok": false, "motivo": "Bersaglio oltre i 36 m del Dardo di Fuoco." }
	if solo_valida:
		return { "ok": true }
	var m: Dictionary = _mod_incantatore(caster_id)
	var d20: Dictionary = CombatManager.roll_d20_with_mode("normal")
	var totale: int = int(d20["chosen"]) + int(m["prof"]) + int(m["mod"])
	var ca: int = int(CombatManager.get_combatant(target_id).get("armorClass", 12))
	var critico: bool = bool(d20["naturalTwenty"])
	if bool(d20["naturalOne"]) or (not critico and totale < ca):
		GameState.announce("🔥 %s scaglia un Dardo di Fuoco su %s… e MANCA (%d vs CA %d)." % [
			_nome(caster_id), _nome(target_id), totale, ca])
		return { "ok": true }
	var danno: int = int(CombatManager.roll_damage_formula("1d10", critico)["total"])
	CombatManager.apply_damage_to_combatant(target_id, danno, caster_id, critico)
	GameState.announce("🔥 Dardo di Fuoco di %s: %s brucia per %d danni%s." % [
		_nome(caster_id), _nome(target_id), danno, " (CRITICO!)" if critico else ""])
	return { "ok": true }


func _dardo_incantato(solo_valida: bool, caster_id: String, target_id: String) -> Dictionary:
	if target_id.is_empty():
		return { "ok": false, "motivo": "Scegli un bersaglio per il Dardo Incantato." }
	if _distanza_celle(caster_id, target_id) > _celle_da_range(36.0):
		return { "ok": false, "motivo": "Bersaglio oltre i 36 m del Dardo Incantato." }
	if solo_valida:
		return { "ok": true }
	var totale: int = 0
	for i: int in range(3):
		totale += randi_range(1, 4) + 1
	CombatManager.apply_damage_to_combatant(target_id, totale, caster_id)
	GameState.announce("✨ DARDO INCANTATO di %s: tre dardi infallibili colpiscono %s (%d danni)."
		% [_nome(caster_id), _nome(target_id), totale])
	return { "ok": true }


## Cura Ferite (contatto: bersaglio ADIACENTE) o Parola Guaritrice (a distanza, bonus): il
## bersaglio e' il PG messo PEGGIO (i morenti prima di tutti — curarli li rialza).
func _cura_ferite(solo_valida: bool, caster_id: String, contatto: bool) -> Dictionary:
	var bersaglio: String = _pg_piu_ferito(caster_id, contatto)
	if bersaglio.is_empty():
		return { "ok": false, "motivo": "Nessun alleato ferito %s." % \
			("a portata di MANO (contatto)" if contatto else "da curare") }
	if solo_valida:
		return { "ok": true }
	var m: Dictionary = _mod_incantatore(caster_id)
	var cura: int = int(CombatManager.roll_damage_formula(
		"1d8" if contatto else "1d4", false)["total"]) + int(m["mod"])
	CombatManager.heal_combatant(bersaglio, maxi(1, cura))
	GameState.announce("✚ %s (%s): %s recupera %d PF." % [
		"Cura Ferite" if contatto else "Parola Guaritrice",
		_nome(caster_id), _nome(bersaglio), maxi(1, cura)])
	return { "ok": true }


## Il PG vivo (o MORENTE) con la percentuale di PF piu' bassa; con `adiacente` solo entro 1 cella.
func _pg_piu_ferito(caster_id: String, adiacente: bool) -> String:
	var scelto: String = ""
	var peggio: float = 0.999   # solo chi ha PERSO qualcosa (o e' a terra)
	for c: Variant in CombatManager.get_state()["combatants"]:
		var comb: Dictionary = c
		if String(comb.get("kind", "")) != "pc" or bool(comb.get("defeated", false)):
			continue
		var id: String = String(comb.get("id", ""))
		if adiacente and id != caster_id and _distanza_celle(caster_id, id) > 1:
			continue
		if int(comb.get("hitPoints", 0)) <= 0 and not CombatManager.is_pc_dying(id) \
				and not CombatManager.is_pc_stable(id):
			continue
		var quota: float = float(comb.get("hitPoints", 0)) / maxf(1.0, float(comb.get("maxHitPoints", 1)))
		if quota < peggio:
			peggio = quota
			scelto = id
	return scelto


## FULMINE: colpisce TUTTI i combattenti sulla linea di celle incantatore -> bersaglio.
func _fulmine(solo_valida: bool, caster_id: String, target_id: String) -> Dictionary:
	if target_id.is_empty():
		return { "ok": false, "motivo": "Scegli il bersaglio in fondo alla linea del Fulmine." }
	var da: Variant = CombatManager.get_combatant_cell(caster_id)
	var a: Variant = CombatManager.get_combatant_cell(target_id)
	if da == null or a == null:
		return { "ok": false, "motivo": "Posizioni non note per tracciare la linea." }
	if _distanza_celle(caster_id, target_id) > _celle_da_range(18.0):
		return { "ok": false, "motivo": "Bersaglio oltre i 18 m del Fulmine." }
	if solo_valida:
		return { "ok": true }
	var m: Dictionary = _mod_incantatore(caster_id)
	var linea: Array[Vector2i] = CoverManager.linea_celle(da, a)
	linea.append(a as Vector2i)
	var righe: PackedStringArray = []
	for c: Variant in CombatManager.get_state()["combatants"]:
		var comb: Dictionary = c
		var cid: String = String(comb.get("id", ""))
		if cid == caster_id or bool(comb.get("defeated", false)):
			continue
		var cella: Variant = CombatManager.get_combatant_cell(cid)
		if cella == null or not linea.has(cella as Vector2i):
			continue
		var ts: Dictionary = CombatManager.saving_throw(cid, "dex", int(m["dc"]))
		var danno: int = int(CombatManager.roll_damage_formula("4d6", false)["total"])
		if bool(ts["success"]):
			@warning_ignore("integer_division")
			danno = danno / 2
		CombatManager.apply_damage_to_combatant(cid, danno, caster_id)
		righe.append("%s %s: %d danni" % [
			String(comb.get("name", cid)), "salva" if bool(ts["success"]) else "FALLISCE", danno])
		if not CombatManager.is_active():
			break
	GameState.announce("🌩 %s scatena un FULMINE (CD %d)! %s" % [_nome(caster_id), int(m["dc"]),
		" · ".join(righe) if not righe.is_empty() else "La saetta non trova nessuno sulla linea."])
	return { "ok": true }


## RAGNATELA: area raggio 1 sul bersaglio — chi fallisce il TS di FORZA resta AFFERRATO 2 round.
func _ragnatela(solo_valida: bool, caster_id: String, target_id: String) -> Dictionary:
	if target_id.is_empty():
		return { "ok": false, "motivo": "Scegli il centro della Ragnatela." }
	var centro: Variant = CombatManager.get_combatant_cell(target_id)
	if centro == null:
		return { "ok": false, "motivo": "Il bersaglio non ha una posizione sulla griglia." }
	if _distanza_celle(caster_id, target_id) > _celle_da_range(18.0):
		return { "ok": false, "motivo": "Bersaglio oltre i 18 m della Ragnatela." }
	if solo_valida:
		return { "ok": true }
	var m: Dictionary = _mod_incantatore(caster_id)
	var righe: PackedStringArray = []
	for c: Variant in CombatManager.get_state()["combatants"]:
		var comb: Dictionary = c
		var cid: String = String(comb.get("id", ""))
		if cid == caster_id or bool(comb.get("defeated", false)):
			continue
		var cella: Variant = CombatManager.get_combatant_cell(cid)
		if cella == null or maxi(absi((cella as Vector2i).x - (centro as Vector2i).x),
				absi((cella as Vector2i).y - (centro as Vector2i).y)) > 1:
			continue
		var ts: Dictionary = CombatManager.saving_throw(cid, "str", int(m["dc"]))
		if bool(ts["success"]):
			righe.append("%s si strappa dai fili" % String(comb.get("name", cid)))
		else:
			ConditionsManager.applica_condizione(cid, "afferrato", 2)
			righe.append("%s resta INTRAPPOLATO" % String(comb.get("name", cid)))
	GameState.announce("🕸 %s tesse una RAGNATELA (CD %d)! %s" % [_nome(caster_id), int(m["dc"]),
		" · ".join(righe) if not righe.is_empty() else "I fili si posano su celle vuote."])
	return { "ok": true }


# --- Aiuti sul grimorio del PG attivo ---

func _conosce_preparato(spell_id: String) -> bool:
	for voce: Dictionary in InventoryManager.get_spellbook():
		if String(voce.get("spellId", "")) == spell_id and bool(voce.get("prepared", false)):
			return true
	return false


func _ha_slot(livello: int) -> bool:
	var slot: Dictionary = InventoryManager.get_spell_slots().get(livello, {})
	return int(slot.get("remaining", 0)) > 0
