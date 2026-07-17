extends Node
## CombatSfx (Autoload) — gli STINGER sonori del combattimento: dadi, colpi, frecce, magie,
## critici, cure, cadute e vittoria. Suoni SINTETIZZATI inclusi nel progetto (assets/sfx,
## generati proceduralmente: zero licenze), agganciati ai signal di CombatManager — nessun
## altro modulo deve sapere che l'audio esiste.
##
## Pool di AudioStreamPlayer (4): i suoni si sovrappongono senza tagliarsi (un colpo durante
## il tintinnio dei dadi non lo strozza). Volume moderato e ducking naturale: sono punteggiatura,
## non protagonisti. `set_enabled(false)` spegne tutto (per chi gioca in silenzio).

const CARTELLA: String = "res://assets/sfx"
const VOCI: Array[String] = [
	"colpo", "mancato", "freccia", "magia", "critico", "cura", "dadi", "sconfitta", "vittoria",
	"spada", "mazza", "arco", "armatura",   # H2: il colpo suona come l'ARMA e come il BERSAGLIO
]
## CA da cui il bersaglio "suona" corazzato: il colpo fa CLANK sull'acciaio, non il tonfo carne.
const CA_CORAZZA: int = 15
## Chi mena di piatto: classi e mostri che colpiscono CONTUNDENTE (mazza, non lama).
const CONTUNDENTI: Array[String] = [
	"chierico", "troll", "ogre", "golem", "mazza", "martello", "clava", "guardiano",
]
const VOLUME_DB: float = -9.0
const DIM_POOL: int = 4

var _streams: Dictionary = {}
var _pool: Array[AudioStreamPlayer] = []
var _prossimo: int = 0
var _abilitato: bool = true


func _ready() -> void:
	for nome: String in VOCI:
		var percorso: String = CARTELLA.path_join(nome + ".wav")
		if ResourceLoader.exists(percorso):
			_streams[nome] = load(percorso)
	for i: int in range(DIM_POOL):
		var p := AudioStreamPlayer.new()
		p.volume_db = VOLUME_DB
		add_child(p)
		_pool.append(p)
	CombatManager.initiative_rolled.connect(func(_o: Array) -> void: suona("dadi"))
	CombatManager.attack_resolved.connect(_su_attacco)
	CombatManager.combatant_healed.connect(func(_id: String, q: int, _hp: int) -> void:
		if q > 0:
			suona("cura"))
	CombatManager.combatant_defeated.connect(func(_id: String, _da: String) -> void:
		suona("sconfitta"))
	CombatManager.victory.connect(func() -> void: suona("vittoria"))


## Suona uno stinger per nome ("colpo", "magia", ...). Ignora nomi ignoti e audio spento.
func suona(nome: String) -> void:
	if not _abilitato or not _streams.has(nome):
		return
	var p: AudioStreamPlayer = _pool[_prossimo]
	_prossimo = (_prossimo + 1) % _pool.size()
	p.stream = _streams[nome]
	p.play()


func set_enabled(v: bool) -> void:
	_abilitato = v


func is_enabled() -> bool:
	return _abilitato


## Il suono giusto per l'esito di un attacco (H2: per TIPO D'ARMA e BERSAGLIO):
## - mancato -> whoosh;
## - a distanza -> il TWANG dell'arco al lancio;
## - a segno -> il colpo suona come il bersaglio: CLANK sull'armatura (CA alta) oppure il suono
##   dell'arma sulla carne — lama (spada) o botta contundente (mazza) a seconda dell'attaccante;
## - il critico ha il suo CRACK sopra il colpo (layer aggiuntivo).
func _su_attacco(result: Dictionary) -> void:
	if bool(result.get("outOfRange", false)):
		return  # il colpo non e' mai partito: silenzio
	var attaccante: String = String(result.get("attacker", ""))
	var gittata: int = CombatManager.attack_range_of(attaccante)
	if not bool(result.get("hit", false)):
		suona("mancato")
		return
	if gittata > 1:
		suona("arco")   # il twang della corda; l'impatto sotto e' quello del bersaglio
	var bersaglio: Dictionary = CombatManager.get_combatant(String(result.get("target", "")))
	if int(bersaglio.get("armorClass", 10)) >= CA_CORAZZA:
		suona("armatura")
	elif gittata > 1:
		suona("freccia")   # freccia nella carne: il vecchio impatto secco
	else:
		suona("mazza" if _e_contundente(attaccante) else "spada")
	if bool(result.get("critical", false)):
		suona("critico")


## L'attaccante colpisce CONTUNDENTE? Si decide dal nome del combattente (troll, ogre...) o,
## per i PG, dalla classe sulla scheda (il chierico mena di mazza, per voto).
func _e_contundente(attacker_id: String) -> bool:
	var indizi: String = String(CombatManager.get_combatant(attacker_id).get("name", "")).to_lower()
	var char_id: String = CombatManager.character_id_di(attacker_id)
	if not char_id.is_empty():
		for pg: CharacterData in CharacterManager.get_party():
			if pg.id == char_id:
				indizi += " " + pg.class_name_label.to_lower()
				break
	for parola: String in CONTUNDENTI:
		if indizi.contains(parola):
			return true
	return false
