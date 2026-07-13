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


## Il suono giusto per l'esito di un attacco: mancato -> whoosh; a segno -> freccia se
## l'attaccante tira da lontano (gittata > 1), altrimenti il thud della mischia; il critico
## ha il suo squillo SOPRA il colpo (due layer: botta + campana).
func _su_attacco(result: Dictionary) -> void:
	if bool(result.get("outOfRange", false)):
		return  # il colpo non e' mai partito: silenzio
	if not bool(result.get("hit", false)):
		suona("mancato")
		return
	var gittata: int = CombatManager.attack_range_of(String(result.get("attacker", "")))
	suona("freccia" if gittata > 1 else "colpo")
	if bool(result.get("critical", false)):
		suona("critico")
