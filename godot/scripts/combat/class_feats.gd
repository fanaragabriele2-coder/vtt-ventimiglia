extends Node
## ClassFeats (Autoload) — le CAPACITA' DI CLASSE che agiscono davvero in combattimento (H3):
##  - ATTACCO FURTIVO (ladro): quando colpisce con VANTAGGIO, il colpo affonda per +1d6 — scatta
##    da solo ascoltando attack_resolved (il vantaggio e' nel risultato: fiancheggiamento,
##    bersaglio prono/afferrato, ispirazione...);
##  - FURIA (barbaro): finche' brucia (condizione "furia", 3 round) i colpi in MISCHIA fanno
##    +2 danni — e i danni SUBITI si dimezzano (TacticalRules.filtra_danno);
##  - AZIONE IMPETUOSA (guerriero): una volta per scontro RECUPERA l'azione del turno — due
##    attacchi, o attacco + Scatto (dal menu ⚡ Bonus, effetto "azioneExtra").
## I bonus extra arrivano come danno aggiuntivo DOPO il colpo (annunciato): il flusso
## dell'attacco resta intatto, la classe ci mette la firma sopra.

const PC_PREFISSO: String = "pc-"

var _impetuose_usate: Dictionary = {}   # character_id -> true: gia' usata in questo scontro


func _ready() -> void:
	CombatManager.attack_resolved.connect(_su_attacco)
	CombatManager.combat_started.connect(func() -> void: _impetuose_usate.clear())


## FURIA del barbaro: si attiva dal menu ⚡ Bonus (bonus_capabilities, effetto "furia").
func attiva_furia() -> bool:
	var id: String = CombatManager.pc_attivo_id()
	if id.is_empty() or not CombatManager.is_active():
		GameState.announce("💢 La Furia serve in combattimento.")
		return false
	ConditionsManager.applica_condizione(id, "furia", 3)
	return true


## AZIONE IMPETUOSA del guerriero: recupera l'azione del turno, una volta per scontro.
func azione_impetuosa() -> bool:
	var pg: CharacterData = CharacterManager.get_active()
	if pg == null or not CombatManager.is_active():
		return false
	if _impetuose_usate.has(pg.id):
		GameState.announce("⚔ Azione Impetuosa gia' spesa in questo scontro: il fiato ha un limite.")
		return false
	_impetuose_usate[pg.id] = true
	InventoryManager.restore_action_resource("action")
	GameState.announce("⚔ AZIONE IMPETUOSA! %s attinge alle ultime forze: l'azione del turno "
		% pg.character_name + "torna disponibile.")
	return true


## I cavalieri (riders) di classe sul colpo a segno: furtivo del ladro, furia del barbaro.
func _su_attacco(result: Dictionary) -> void:
	if not bool(result.get("hit", false)) or not CombatManager.is_active():
		return
	var attaccante: String = String(result.get("attacker", ""))
	if not attaccante.begins_with(PC_PREFISSO):
		return
	var bersaglio: String = String(result.get("target", ""))
	var pg: CharacterData = CharacterManager.get_character_by_id(
		CombatManager.character_id_di(attaccante))
	if pg == null:
		return
	var classe: String = pg.class_name_label.to_lower()
	if classe == "ladro" and String(result.get("mode", "")) == "advantage":
		var extra: int = randi_range(1, 6)
		CombatManager.apply_damage_to_combatant(bersaglio, extra, attaccante)
		GameState.announce("🗡 ATTACCO FURTIVO di %s: la lama trova il varco (+%d danni)."
			% [pg.character_name, extra])
	elif classe == "barbaro" and ConditionsManager.ha_condizione(attaccante, "furia") \
			and CombatManager.attack_range_of(attaccante) <= 1:
		CombatManager.apply_damage_to_combatant(bersaglio, 2, attaccante)
		GameState.announce("💢 La FURIA di %s morde piu' a fondo (+2 danni)." % pg.character_name)
