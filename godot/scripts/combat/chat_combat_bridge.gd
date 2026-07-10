extends Node
## ChatCombatBridge (Autoload) — porting del Modulo 34 JS "chat -> combat bridge".
##
## RETE DI SICUREZZA sul lato motore: a volte il Master IA NARRA uno scontro ("tre goblin vi
## tendono un'imboscata!") ma non emette i comandi <<DATI>> di spawn — e il combattimento resterebbe
## spento mentre la chat racconta una battaglia inesistente. Questo modulo analizza la narrazione:
## se annuncia uno scontro con creature note del bestiario e il canale JSON non ha gia' provveduto,
## fa comparire DAVVERO i nemici (via Encounter Balancer, quindi scalati sul party) e il
## combattimento parte da solo.
##
## Differenza dal JS (che aspettava 350ms per lasciar passare l'eventuale spawn JSON): qui
## master_complete consegna narrazione E comandi INSIEME, quindi la guardia "il JSON ha gia'
## fatto tutto" e' sincrona — niente timer, niente corse.

const MAX_PER_TIPO: int = 8

# Bestiario riconoscibile nella prosa (nomi del catalogo monsters.json + plurali italiani).
const BESTIARIO: Array[Dictionary] = [
	{ "nome": "Goblin", "singolare": "goblin", "plurale": "goblin" },
	{ "nome": "Bandito", "singolare": "bandito", "plurale": "banditi" },
	{ "nome": "Scheletro", "singolare": "scheletro", "plurale": "scheletri" },
	{ "nome": "Lupo", "singolare": "lupo", "plurale": "lupi" },
	{ "nome": "Orco", "singolare": "orco", "plurale": "orchi" },
	{ "nome": "Cultista", "singolare": "cultista", "plurale": "cultisti" },
	{ "nome": "Zombie", "singolare": "zombie", "plurale": "zombie" },
	{ "nome": "Hobgoblin", "singolare": "hobgoblin", "plurale": "hobgoblin" },
]

# Parole che segnalano che lo scontro sta INIZIANDO ora (non una semplice menzione di un goblin).
const PAROLE_COMBATTIMENTO: String = "(?i)(combattiment|attacc|assal|agguato|imboscata|iniziativa|battaglia|scontro|vi circondano|ostil|minacci|balzano|si scagliano|sguainano)"

const NUMERI: Dictionary = {
	"un": 1, "uno": 1, "una": 1, "due": 2, "tre": 3, "quattro": 4,
	"cinque": 5, "sei": 6, "sette": 7, "otto": 8,
}

# Comandi <<DATI>> che dimostrano che il Master ha DAVVERO piazzato dei nemici via canale
# strutturato: solo questi disattivano il rilevamento dalla prosa. NON "startCombat" — un
# startCombat "nudo" (senza addNpc/spawnAt) e' proprio il caso in cui i nemici NON sono stati
# piazzati e questa rete di sicurezza DEVE intervenire (era il bug "combattimento senza nemici").
const COMANDI_SPAWN: Array[String] = ["addNpc", "spawnAt"]

var _re_combattimento: RegEx


func _ready() -> void:
	_re_combattimento = RegEx.new()
	_re_combattimento.compile(PAROLE_COMBATTIMENTO)
	AIBridge.master_complete.connect(_on_master_complete)


func _on_master_complete(narration: String, commands: Array) -> void:
	# Guardia 1: il canale JSON ha gia' fatto tutto (spawn o avvio combattimento espliciti).
	for c: Variant in commands:
		if c is Dictionary and COMANDI_SPAWN.has(String((c as Dictionary).get("command", ""))):
			return
	# Guardia 2: combattimento gia' in corso — qualunque menzione e' cronaca, non un nuovo scontro.
	if CombatManager.is_active():
		return
	var lista: Array[Dictionary] = rileva_nemici_da_testo(narration)
	if lista.is_empty():
		return
	var descrizioni: PackedStringArray = []
	for voce: Dictionary in lista:
		descrizioni.append("%dx %s" % [int(voce["count"]), String(voce["name"])])
	GameState.announce("⚔ La narrazione del Master annunciava uno scontro senza comandi di spawn: nemici evocati (%s)." % ", ".join(descrizioni))
	EncounterBalancer.spawn_bilanciato(lista)


## Analizza la narrazione: se annuncia uno scontro con creature note ritorna [{name, count}, ...],
## pronta per l'Encounter Balancer; lista vuota altrimenti. Pura (nessun effetto collaterale).
func rileva_nemici_da_testo(testo: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if testo.strip_edges().is_empty() or _re_combattimento.search(testo) == null:
		return out
	for voce: Dictionary in BESTIARIO:
		var n: int = conta_creatura(testo, voce)
		if n > 0:
			out.append({ "name": voce["nome"], "count": n })
	return out


## Quante creature di questo tipo annuncia il testo? Porting fedele di contaCreatura (js/34):
## 1) elenchi numerati "goblin 1 ... goblin 4" -> l'indice massimo, ma SOLO con almeno DUE indici
##    distinti (una singola menzione "goblin 8" e' quasi sempre il NOME di un nemico esistente,
##    non un conteggio — interpretarla come 8 creature evocava un'orda a ogni citazione);
## 2) numero (cifra o parola) davanti al nome: "tre goblin", "4 banditi";
## 3) semplice menzione -> 1.
func conta_creatura(testo: String, voce: Dictionary) -> int:
	var singolare: String = String(voce["singolare"])
	var plurale: String = String(voce["plurale"])

	var re_indice := RegEx.new()
	re_indice.compile("(?i)\\b" + singolare + "\\s+(\\d{1,2})\\b")
	var indici: Dictionary = {}
	var massimo: int = 0
	for m: RegExMatch in re_indice.search_all(testo):
		var idx: int = int(m.get_string(1))
		indici[idx] = true
		massimo = maxi(massimo, idx)
	if indici.size() >= 2:
		return mini(MAX_PER_TIPO, massimo)

	var re_numero := RegEx.new()
	re_numero.compile("(?i)\\b(\\d{1,2}|un|uno|una|due|tre|quattro|cinque|sei|sette|otto)\\s+(?:%s|%s)\\b" % [singolare, plurale])
	var m2: RegExMatch = re_numero.search(testo)
	if m2 != null:
		var parola: String = m2.get_string(1).to_lower()
		var valore: int = int(NUMERI.get(parola, 0))
		if valore == 0:
			valore = maxi(1, int(parola))
		return clampi(valore, 1, MAX_PER_TIPO)

	var re_menzione := RegEx.new()
	re_menzione.compile("(?i)\\b(?:%s|%s)\\b" % [singolare, plurale])
	return 1 if re_menzione.search(testo) != null else 0
