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

# Bestiario riconoscibile nella prosa (nomi del catalogo monsters.json + plurali italiani),
# UNO per campagna (CampaignDirector.bestiario_attuale() sceglie quale usare): il Master IA di
# Ventimiglia non deve far scattare un Uruk-hai, e viceversa (era il bug "Master che racconta
# Ventimiglia mentre si gioca in Terra di Mezzo" — prima esisteva una sola lista fissa).
const BESTIARIO_VENTIMIGLIA: Array[Dictionary] = [
	{ "nome": "Goblin", "singolare": "goblin", "plurale": "goblin" },
	{ "nome": "Bandito", "singolare": "bandito", "plurale": "banditi" },
	{ "nome": "Scheletro", "singolare": "scheletro", "plurale": "scheletri" },
	{ "nome": "Lupo", "singolare": "lupo", "plurale": "lupi" },
	{ "nome": "Orco", "singolare": "orco", "plurale": "orchi" },
	{ "nome": "Cultista", "singolare": "cultista", "plurale": "cultisti" },
	{ "nome": "Zombie", "singolare": "zombie", "plurale": "zombie" },
	{ "nome": "Hobgoblin", "singolare": "hobgoblin", "plurale": "hobgoblin" },
]

const BESTIARIO_TERRA_DI_MEZZO: Array[Dictionary] = [
	{ "nome": "Goblin di Moria", "singolare": "goblin di moria", "plurale": "goblin di moria" },
	{ "nome": "Uomo Selvaggio di Dunland", "singolare": "uomo selvaggio",
		"plurale": "uomini selvaggi" },
	{ "nome": "Orco di Isengard", "singolare": "orco di isengard", "plurale": "orchi di isengard" },
	{ "nome": "Corsaro di Umbar", "singolare": "corsaro di umbar", "plurale": "corsari di umbar" },
	{ "nome": "Uruk-hai", "singolare": "uruk-hai", "plurale": "uruk-hai" },
	{ "nome": "Arciere Haradrim", "singolare": "arciere haradrim", "plurale": "arcieri haradrim" },
	{ "nome": "Capitano Uruk-hai", "singolare": "capitano uruk-hai",
		"plurale": "capitani uruk-hai" },
	{ "nome": "Spettro della Palude", "singolare": "spettro della palude",
		"plurale": "spettri della palude" },
	{ "nome": "Troll delle Caverne", "singolare": "troll delle caverne",
		"plurale": "troll delle caverne" },
	{ "nome": "Grima Vermilinguo", "singolare": "grima", "plurale": "grima" },
	{ "nome": "Guardiano nell'Acqua", "singolare": "guardiano nell'acqua",
		"plurale": "guardiani nell'acqua" },
	{ "nome": "Khamûl lo Stregone Orientale", "singolare": "khamûl", "plurale": "khamûl" },
	{ "nome": "Akhorahil", "singolare": "akhorahil", "plurale": "akhorahil" },
	{ "nome": "Ren lo Sconvolto", "singolare": "ren lo sconvolto", "plurale": "ren lo sconvolto" },
	{ "nome": "Adûnaphel la Silente", "singolare": "adûnaphel", "plurale": "adûnaphel" },
	{ "nome": "Uvatha il Cavaliere", "singolare": "uvatha", "plurale": "uvatha" },
	{ "nome": "Hoarmurath di Dir", "singolare": "hoarmurath", "plurale": "hoarmurath" },
	{ "nome": "Dwar di Waw", "singolare": "dwar", "plurale": "dwar" },
	{ "nome": "Ji Indur Sventamorte", "singolare": "ji indur", "plurale": "ji indur" },
	{ "nome": "Saruman il Bianco", "singolare": "saruman", "plurale": "saruman" },
	{ "nome": "La Bocca di Sauron", "singolare": "bocca di sauron", "plurale": "bocca di sauron" },
	{ "nome": "Il Re Stregone di Angmar", "singolare": "re stregone", "plurale": "re stregone" },
	{ "nome": "Drago delle Montagne Grigie", "singolare": "drago delle montagne grigie",
		"plurale": "drago delle montagne grigie" },
	{ "nome": "Shelob", "singolare": "shelob", "plurale": "shelob" },
	{ "nome": "Balrog di Morgoth", "singolare": "balrog", "plurale": "balrog" },
]

# Parole che segnalano che lo scontro sta INIZIANDO ora (non una semplice menzione di un goblin).
const PAROLE_COMBATTIMENTO: String = (
	"(?i)(combattiment|attacc|assal|agguato|imboscata|iniziativa|battaglia|scontro|vi circondano|"
	+ "ostil|minacci|balzano|si scagliano|si lanciano|sguainano|piombano|caricano)"
)

# Nemici GENERICI: se il Master narra uno scontro nominando creature non del bestiario ("ombre",
# "briganti", "non-morti"), le si mappa sul mostro piu' simile — cosi' il combattimento a turni
# parte DAVVERO invece di svolgersi solo a parole in chat. Anche questi UNO per campagna.
const GENERICI_VENTIMIGLIA: Array[Dictionary] = [
	{ "nome": "Bandito", "singolare": "brigante", "plurale": "briganti" },
	{ "nome": "Bandito", "singolare": "predone", "plurale": "predoni" },
	{ "nome": "Bandito", "singolare": "furfante", "plurale": "furfanti" },
	{ "nome": "Scheletro", "singolare": "ombra", "plurale": "ombre" },
	{ "nome": "Scheletro", "singolare": "non-morto", "plurale": "non-morti" },
	{ "nome": "Zombie", "singolare": "putrefatto", "plurale": "putrefatti" },
	{ "nome": "Lupo", "singolare": "belva", "plurale": "belve" },
]

const GENERICI_TERRA_DI_MEZZO: Array[Dictionary] = [
	{ "nome": "Goblin di Moria", "singolare": "goblin", "plurale": "goblin" },
	{ "nome": "Orco di Isengard", "singolare": "orco", "plurale": "orchi" },
	{ "nome": "Troll delle Caverne", "singolare": "troll", "plurale": "troll" },
	{ "nome": "Arciere Haradrim", "singolare": "haradrim", "plurale": "haradrim" },
	{ "nome": "Corsaro di Umbar", "singolare": "corsaro", "plurale": "corsari" },
	{ "nome": "Spettro della Palude", "singolare": "ombra", "plurale": "ombre" },
	{ "nome": "Spettro della Palude", "singolare": "non-morto", "plurale": "non-morti" },
	{ "nome": "Khamûl lo Stregone Orientale", "singolare": "nazgul", "plurale": "nazgul" },
	{ "nome": "Khamûl lo Stregone Orientale", "singolare": "cavaliere nero",
		"plurale": "cavalieri neri" },
]

# Ultima spiaggia: uno scontro annunciato con un termine puramente generico ("i nemici vi
# circondano", "delle creature vi assalgono") fa comparire comunque un manipolo di default.
const PAROLE_NEMICI_GENERICI: String = (
	"(?i)\\b(nemic[oi]|avversari[oi]?|creatur[ae]|mostr[oi]|figur[ae]|sagom[ae]|bestie|"
	+ "assalitori|aggressori)\\b"
)
const DEFAULT_GENERICO_VENTIMIGLIA: String = "Bandito"
const DEFAULT_GENERICO_TERRA_DI_MEZZO: String = "Orco di Isengard"
const DEFAULT_GENERICO_QUANTITA: int = 2

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
	GameState.announce(
		"⚔ La narrazione del Master annunciava uno scontro senza comandi di spawn: nemici"
		+ " evocati (%s)." % ", ".join(descrizioni))
	EncounterBalancer.spawn_bilanciato(lista)


## Bestiario/sinonimi/default della campagna ATTIVA (CampaignDirector.bestiario_attuale()):
## il rilevamento dalla prosa deve riconoscere SOLO i mostri del mondo che si sta giocando.
func _bestiario_attivo() -> Array[Dictionary]:
	if CampaignDirector.bestiario_attuale() == "terra_di_mezzo":
		return BESTIARIO_TERRA_DI_MEZZO
	return BESTIARIO_VENTIMIGLIA


func _generici_attivi() -> Array[Dictionary]:
	if CampaignDirector.bestiario_attuale() == "terra_di_mezzo":
		return GENERICI_TERRA_DI_MEZZO
	return GENERICI_VENTIMIGLIA


func _default_generico_attivo() -> String:
	if CampaignDirector.bestiario_attuale() == "terra_di_mezzo":
		return DEFAULT_GENERICO_TERRA_DI_MEZZO
	return DEFAULT_GENERICO_VENTIMIGLIA


## Analizza la narrazione: se annuncia uno scontro con creature note ritorna [{name, count}, ...],
## pronta per l'Encounter Balancer; lista vuota altrimenti. Pura (nessun effetto collaterale).
func rileva_nemici_da_testo(testo: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if testo.strip_edges().is_empty() or _re_combattimento.search(testo) == null:
		return out
	# 1) creature del bestiario nominate esplicitamente.
	for voce: Dictionary in _bestiario_attivo():
		var n: int = conta_creatura(testo, voce)
		if n > 0:
			out.append({ "name": voce["nome"], "count": n })
	if not out.is_empty():
		return out
	# 2) nessuna creatura nota: prova i sinonimi generici mappati sul bestiario ("ombre" -> Scheletro).
	for voce: Dictionary in _generici_attivi():
		var n: int = conta_creatura(testo, voce)
		if n > 0:
			out.append({ "name": voce["nome"], "count": n })
	if not out.is_empty():
		return out
	# 3) scontro coi soli termini generici ("i nemici vi circondano"): manipolo di default.
	var re_generico := RegEx.new()
	re_generico.compile(PAROLE_NEMICI_GENERICI)
	if re_generico.search(testo) != null:
		out.append({ "name": _default_generico_attivo(), "count": DEFAULT_GENERICO_QUANTITA })
	return out


## Quante creature di questo tipo annuncia il testo? Porting fedele di contaCreatura (js/34):
## 1) elenchi numerati "goblin 1 ... goblin 4" -> l'indice massimo, ma SOLO con almeno DUE indici
##    distinti (una singola menzione "goblin 8" e' quasi sempre il NOME di un nemico esistente,
##    non un conteggio — interpretarla come 8 creature evocava un'orda a ogni citazione);
## 2) numero (cifra o parola) davanti al nome: "tre goblin", "4 banditi";
## 3) menzione al PLURALE senza numero ("le ombre si lanciano") -> 2 (un plurale e' almeno due);
## 4) semplice menzione al singolare -> 1.
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
	re_numero.compile(
		"(?i)\\b(\\d{1,2}|un|uno|una|due|tre|quattro|cinque|sei|sette|otto)\\s+(?:%s|%s)\\b"
		% [singolare, plurale])
	var m2: RegExMatch = re_numero.search(testo)
	if m2 != null:
		var parola: String = m2.get_string(1).to_lower()
		var valore: int = int(NUMERI.get(parola, 0))
		if valore == 0:
			valore = maxi(1, int(parola))
		return clampi(valore, 1, MAX_PER_TIPO)

	# Plurale senza numero ("le ombre", "i briganti"): almeno due. Solo se il plurale differisce dal
	# singolare (goblin/zombie/hobgoblin hanno forma unica: restano 1 se non c'e' un numero esplicito).
	if plurale != singolare:
		var re_plurale := RegEx.new()
		re_plurale.compile("(?i)\\b" + plurale + "\\b")
		if re_plurale.search(testo) != null:
			return 2

	var re_menzione := RegEx.new()
	re_menzione.compile("(?i)\\b(?:%s|%s)\\b" % [singolare, plurale])
	return 1 if re_menzione.search(testo) != null else 0
