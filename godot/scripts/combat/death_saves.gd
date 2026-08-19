extends Node
## DeathSaves (Autoload) — al turno di un PG MORENTE (a 0 PF, non stabile, non morto) tira per lui
## il salvezza contro la morte e passa il turno, come EnemyAI fa per i PNG. Il giocatore non deve
## premere nulla: il tiro si vede in chat (successi/fallimenti, 20 = si rialza) e lo scontro va
## avanti. Curare il PG PRIMA del suo turno lo rimette in piedi ed evita il tiro.
##
## Registrazione: Project Settings > Autoload -> "DeathSaves" (dopo CombatManager, come EnemyAI).

const PAUSA_SEC: float = 0.7

var _ultima_chiave: String = ""


func _ready() -> void:
	CombatManager.turn_changed.connect(_su_turno)


func _su_turno(combatant_id: String, round_number: int) -> void:
	var c: Dictionary = CombatManager.get_combatant(combatant_id)
	if c.is_empty() or String(c.get("kind", "")) != "pc":
		return
	if not CombatManager.is_pc_dying(combatant_id):
		return
	# Dedup: lo stesso turno non deve tirare due volte (stessa guardia di EnemyAI).
	var chiave: String = "%d:%s" % [round_number, combatant_id]
	if chiave == _ultima_chiave:
		return
	_ultima_chiave = chiave
	await get_tree().create_timer(PAUSA_SEC).timeout
	# Il PG potrebbe essere stato curato/rianimato durante la pausa: ricontrolla.
	if CombatManager.is_pc_dying(combatant_id):
		CombatManager.roll_death_save(combatant_id)
	CombatManager.next_turn()
