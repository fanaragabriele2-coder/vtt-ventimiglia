extends Node
## TokenDirector (Autoload) — il Master REGISTA dei SINGOLI token sul Mondo cucito.
##
## Due strade, stessa regia:
## 1. COMANDO strutturato `moveToken` del Master IA: {"command":"moveToken","target":"troll",
##    "to":"verso Elrik|lontano|copertura|altura|<luogo>","cells":4} — instradato qui da
##    AIBridge._dispatch_command. `target` e' fuzzy: un nemico per TIPO muove TUTTI i token di
##    quel tipo ("gli orchi"), un nome del party muove quel solo PG.
## 2. PROSA narrata: se il Master SCRIVE uno spostamento senza emettere il comando ("il troll
##    carica", "gli orchi ripiegano dietro le rocce", "gli arcieri salgono sulla cresta"), il
##    riconoscitore lo trova — radice del nome (senza vocale finale: 'orc' prende orco/orchi)
##    + verbo di movimento nella stessa frase — e muove i token davvero. Gemello di
##    ChatTravelBridge, ma per i gettoni singoli.
##
## Destinazioni RELATIVE calcolate sulla mappa vera: verso il bersaglio (adiacente se carica),
## lontano dal nemico, dietro la COPERTURA piu' vicina (CoverManager), sull'ALTURA piu' vicina
## (ElevationManager), o un LUOGO con nome (etichette del set). I nemici si muovono via
## CombatManager.set_combatant_cell (il token sul mondo segue da solo, celle di gioco allineate);
## i PG con WorldTokens.muovi_verso (planata + nebbia + cella). Ogni mossa e' annunciata.

const PX_PER_CELLA: float = 128.0
const CELLE_PASSO: int = 4        # avanzata/ritirata "dichiarata" (6 m)
const RAGGIO_RICERCA: int = 8     # copertura/altura piu' vicina entro 8 celle (12 m)
const MAX_MOSSE_NARRATE: int = 4  # tetto per narrazione: niente valanghe di token
## Parole il cui match NON basta a riconoscere un nemico (troppo generiche nella prosa).
const PAROLE_GENERICHE: Array[String] = ["uomo", "della", "delle", "degli", "dell"]
## Radici dei verbi di movimento -> categoria di mossa.
const VERBI: Dictionary = {
	"carica": ["caric", "si avvent", "si lanci", "si gett", "piomba", "balza su"],
	"avanza": ["avanz", "si avvicin", "incalz", "marcia vers", "punta vers", "si port"],
	"ritira": ["ritir", "ripieg", "indietregg", "arretr", "fugg", "scapp", "si sganci"],
	"copertura": ["nascond", "al riparo", "copertur", "acquatt", "dietro le", "dietro la"],
	"altura": ["salgon", "sale s", "arrampic", "altur", "sul colle", "collina", "cresta"],
}
const DESCRIZIONI: Dictionary = {
	"carica": "carica verso %s", "avanza": "avanza verso %s", "ritira": "si ritira",
	"copertura": "corre al riparo", "altura": "guadagna l'altura", "luogo": "si dirige verso %s",
}


func _ready() -> void:
	AIBridge.master_complete.connect(_su_narrazione)


## COMANDO del Master: muove il/i token che rispondono a `target` secondo `dest`.
## Ritorna true se almeno un token si e' mosso.
func muovi_dichiarato(target: String, dest: String, celle: int = CELLE_PASSO) -> bool:
	var movers: Array[Dictionary] = _risolvi_target(target)
	if movers.is_empty():
		GameState.announce("🎭 Regia: nessun token sulla mappa risponde a \"%s\"." % target)
		return false
	var norm_dest: String = _normalizza(dest)
	var mossi: int = 0
	for mover: Dictionary in movers:
		if _applica_destinazione(mover, norm_dest, celle):
			mossi += 1
	return mossi > 0


## Destinazione del comando: prima le parole chiave (lontano/copertura/altura), poi "verso X"
## o direttamente un nome del party, infine un LUOGO della mappa. Default: verso l'avversario.
func _applica_destinazione(mover: Dictionary, norm_dest: String, celle: int) -> bool:
	if _contiene_radice(norm_dest, VERBI["ritira"]) or norm_dest.contains("lontan"):
		return _mossa(mover, "ritira", celle)
	if _contiene_radice(norm_dest, VERBI["copertura"]) or norm_dest.contains("riparo"):
		return _mossa(mover, "copertura", celle)
	if _contiene_radice(norm_dest, VERBI["altura"]):
		return _mossa(mover, "altura", celle)
	var dopo_verso: String = _dopo_parola(norm_dest, "verso")
	var nome_pg: String = dopo_verso if not dopo_verso.is_empty() else norm_dest
	var pg: Dictionary = _pg_per_nome(nome_pg)
	if not pg.is_empty():
		return _mossa(mover, "avanza", celle, pg["pos"] as Vector2)
	var luogo: Variant = _pos_luogo(norm_dest)
	if luogo != null:
		return _muovi(mover, luogo as Vector2, DESCRIZIONI["luogo"] % dest_leggibile(norm_dest))
	return _mossa(mover, "avanza", celle)


static func dest_leggibile(norm: String) -> String:
	return norm.strip_edges().capitalize()


# --- PROSA: gli spostamenti narrati muovono i token (se il Master non ha dato comandi) ---

func _su_narrazione(narration: String, commands: Array) -> void:
	for c: Variant in commands:
		var cn: String = String((c as Dictionary).get("command", "")) if c is Dictionary else ""
		if cn == "moveToken" or cn == "moveNpc":
			return  # il Master ha gia' diretto i token col comando: la prosa non raddoppia
	if narration.strip_edges().is_empty():
		return
	var frasi: PackedStringArray = narration.replace("!", ".").replace("?", ".").split(".")
	var gia_mossi: Array[String] = []
	var mosse: int = 0
	for frase: String in frasi:
		if mosse >= MAX_MOSSE_NARRATE:
			return
		var norm: String = _normalizza(frase)
		if norm.is_empty():
			continue
		var categoria: String = _categoria_verbo(norm)
		if categoria.is_empty():
			continue
		for mover: Dictionary in _movers_nella_frase(norm):
			var chiave: String = "%s:%s" % [String(mover["tipo"]), String(mover["nome"])]
			if gia_mossi.has(chiave):
				continue
			gia_mossi.append(chiave)
			if _mossa(mover, categoria, CELLE_PASSO):
				mosse += 1
			if mosse >= MAX_MOSSE_NARRATE:
				break


func _categoria_verbo(norm: String) -> String:
	for categoria: String in VERBI:
		if _contiene_radice(norm, VERBI[categoria]):
			return categoria
	return ""


## I token citati nella frase: ogni TIPO di nemico in scena (radice del nome) e ogni PG.
func _movers_nella_frase(norm: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var tipi_visti: Array[String] = []
	for npc: Dictionary in _npc_in_scena():
		var tipo: String = String(npc["nome"])
		if not tipi_visti.has(tipo) and _nome_citato(norm, tipo):
			tipi_visti.append(tipo)
	for npc: Dictionary in _npc_in_scena():
		if tipi_visti.has(String(npc["nome"])):
			out.append(npc)
	for pg: Dictionary in _pg_in_scena():
		if _nome_citato(norm, String(pg["nome"])):
			out.append(pg)
	return out


# --- Mosse: dalla categoria alla destinazione sul mondo ---

## Esegue una mossa di categoria nota. `verso_pos` forza il punto di riferimento (comando
## "verso Elrik"); altrimenti il riferimento e' l'avversario piu' vicino.
func _mossa(mover: Dictionary, categoria: String, celle: int,
		verso_pos: Vector2 = Vector2.INF) -> bool:
	var esito: Dictionary = _destinazione_di(mover, categoria, celle, verso_pos)
	if esito.is_empty():
		return false
	return _muovi(mover, esito["dest"] as Vector2, String(esito["descrizione"]))


## Traduce la categoria in { dest, descrizione } — vuoto se la mossa non ha senso qui (nessun
## avversario, nessun riparo/altura a portata).
func _destinazione_di(mover: Dictionary, categoria: String, celle: int,
		verso_pos: Vector2) -> Dictionary:
	if categoria == "carica" or categoria == "avanza":
		return _dest_verso_avversario(mover, categoria, celle, verso_pos)
	if categoria == "ritira":
		return _dest_ritirata(mover, celle)
	if categoria == "copertura":
		return _dest_copertura(mover)
	if categoria == "altura":
		return _dest_altura(mover)
	return {}


func _dest_verso_avversario(mover: Dictionary, categoria: String, celle: int,
		verso_pos: Vector2) -> Dictionary:
	var nome_rif: String = "il bersaglio"
	if verso_pos == Vector2.INF:
		var rif: Dictionary = _avversario_vicino(mover)
		if rif.is_empty():
			return {}
		verso_pos = rif["pos"]
		nome_rif = String(rif["nome"])
	var arrivo: Vector2 = _verso(mover["pos"] as Vector2, verso_pos, celle, categoria == "carica")
	return { "dest": arrivo, "descrizione": DESCRIZIONI[categoria] % nome_rif }


func _dest_ritirata(mover: Dictionary, celle: int) -> Dictionary:
	var pos: Vector2 = mover["pos"]
	var direzione: Vector2 = (pos - _centro_avversari(mover)).normalized()
	if direzione == Vector2.ZERO:
		direzione = Vector2.RIGHT
	return { "dest": pos + direzione * celle * PX_PER_CELLA, "descrizione": DESCRIZIONI["ritira"] }


func _dest_copertura(mover: Dictionary) -> Dictionary:
	var riparo: Variant = CoverManager.cella_copertura_vicina(
		_cella_di(mover["pos"] as Vector2), RAGGIO_RICERCA)
	if riparo == null:
		return {}
	return { "dest": _centro_cella(riparo as Vector2i), "descrizione": DESCRIZIONI["copertura"] }


func _dest_altura(mover: Dictionary) -> Dictionary:
	var cima: Variant = _altura_vicina(mover["pos"] as Vector2)
	if cima == null:
		return {}
	return { "dest": _centro_cella(cima as Vector2i), "descrizione": DESCRIZIONI["altura"] }


## Punto d'arrivo verso un bersaglio: ADIACENTE (1 cella) se carica, altrimenti un passo di
## `celle` che non supera mai l'adiacenza.
func _verso(da: Vector2, a: Vector2, celle: int, adiacente: bool) -> Vector2:
	var direzione: Vector2 = (a - da).normalized()
	if direzione == Vector2.ZERO:
		direzione = Vector2.RIGHT
	var arrivo_adiacente: Vector2 = a - direzione * PX_PER_CELLA
	if adiacente:
		return arrivo_adiacente
	var passo: Vector2 = da + direzione * celle * PX_PER_CELLA
	if da.distance_to(a) - float(celle) * PX_PER_CELLA < PX_PER_CELLA:
		return arrivo_adiacente
	return passo


## L'altura piu' vicina che salga rispetto alla quota attuale (celle dipinte di ElevationManager).
func _altura_vicina(pos: Vector2) -> Variant:
	var mia: Vector2i = _cella_di(pos)
	var mia_quota: int = ElevationManager.quota_di(mia.x, mia.y)
	var migliore: Variant = null
	var migliore_quota: int = mia_quota
	var migliore_distanza: int = RAGGIO_RICERCA + 1
	for k: String in ElevationManager.celle_dipinte():
		var parti: PackedStringArray = k.split(",")
		if parti.size() != 2:
			continue
		var c := Vector2i(int(parti[0]), int(parti[1]))
		var quota: int = ElevationManager.quota_di(c.x, c.y)
		var d: int = maxi(absi(c.x - mia.x), absi(c.y - mia.y))
		if d == 0 or d > RAGGIO_RICERCA or quota <= mia_quota:
			continue
		if quota > migliore_quota or (quota == migliore_quota and d < migliore_distanza):
			migliore_quota = quota
			migliore_distanza = d
			migliore = c
	return migliore


## Applica la mossa al token giusto: i nemici via cella autorevole (il gettone segue da solo),
## i PG con la planata singola. Annuncia la regia in chat.
func _muovi(mover: Dictionary, dest: Vector2, descrizione: String) -> bool:
	var builder: Node = _builder()
	if builder == null:
		return false
	var arrivo: Vector2 = _dentro_mappa(dest)
	if String(mover["tipo"]) == "npc":
		CombatManager.set_combatant_cell(String(mover["id"]), _cella_di(arrivo))
	else:
		var tokens: WorldTokens = builder.regia()["party"] as WorldTokens
		if tokens == null:
			return false
		tokens.muovi_verso(String(mover["id"]), arrivo)
	GameState.announce("🎭 %s %s." % [String(mover["nome"]), descrizione])
	return true


# --- Chi c'e' in scena (token vivi sul mondo) ---

## I nemici col token sul mondo: { tipo:"npc", id, nome, pos }.
func _npc_in_scena() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var builder: Node = _builder()
	if builder == null:
		return out
	var nemici: WorldEnemyTokens = builder.regia()["nemici"] as WorldEnemyTokens
	if nemici == null:
		return out
	for c: Variant in CombatManager.get_state()["combatants"]:
		var comb: Dictionary = c
		if String(comb.get("kind", "")) != "npc" or int(comb.get("hitPoints", 0)) <= 0:
			continue
		var id: String = String(comb.get("id", ""))
		var pos: Variant = nemici.posizione_di(id)
		if pos == null:
			continue
		out.append({ "tipo": "npc", "id": id, "nome": String(comb.get("name", "?")),
			"pos": pos as Vector2 })
	return out


## I PG col token sul mondo: { tipo:"pc", id (personaggio), nome, pos }.
func _pg_in_scena() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var builder: Node = _builder()
	if builder == null:
		return out
	var tokens: WorldTokens = builder.regia()["party"] as WorldTokens
	if tokens == null:
		return out
	for pg: CharacterData in CharacterManager.get_party():
		var pos: Variant = tokens.posizione_di("pc-" + pg.id)
		if pos == null:
			continue
		out.append({ "tipo": "pc", "id": pg.id, "nome": pg.character_name, "pos": pos as Vector2 })
	return out


## Risolve il target di un comando: prima i nemici (per TIPO: tutti i token di quel tipo),
## poi un membro del party (uno solo).
func _risolvi_target(target: String) -> Array[Dictionary]:
	var norm: String = _normalizza(target)
	var out: Array[Dictionary] = []
	for npc: Dictionary in _npc_in_scena():
		if _nome_citato(norm, String(npc["nome"])) or \
				_nome_citato(norm, String(CombatManager.get_combatant(
					String(npc["id"])).get("catalogId", ""))):
			out.append(npc)
	if not out.is_empty():
		return out
	var pg: Dictionary = _pg_per_nome(norm)
	if not pg.is_empty():
		out.append(pg)
	return out


func _pg_per_nome(norm_nome: String) -> Dictionary:
	if norm_nome.strip_edges().is_empty():
		return {}
	for pg: Dictionary in _pg_in_scena():
		if _nome_citato(norm_nome, String(pg["nome"])):
			return pg
	if norm_nome.contains("party") or norm_nome.contains("grupp") or norm_nome.contains("eroi"):
		var tutti: Array[Dictionary] = _pg_in_scena()
		if not tutti.is_empty():
			return tutti[0]
	return {}


## L'avversario piu' vicino al mover: per un nemico il PG piu' vicino, per un PG il nemico.
func _avversario_vicino(mover: Dictionary) -> Dictionary:
	var pool: Array[Dictionary] = _pg_in_scena() if String(mover["tipo"]) == "npc" \
		else _npc_in_scena()
	var migliore: Dictionary = {}
	var distanza: float = INF
	for candidato: Dictionary in pool:
		var d: float = (mover["pos"] as Vector2).distance_to(candidato["pos"] as Vector2)
		if d < distanza:
			distanza = d
			migliore = candidato
	return migliore


func _centro_avversari(mover: Dictionary) -> Vector2:
	var pool: Array[Dictionary] = _pg_in_scena() if String(mover["tipo"]) == "npc" \
		else _npc_in_scena()
	if pool.is_empty():
		return mover["pos"]
	var somma: Vector2 = Vector2.ZERO
	for candidato: Dictionary in pool:
		somma += candidato["pos"] as Vector2
	return somma / float(pool.size())


# --- Testo: radici e citazioni ---

## Un nome ("Troll delle Caverne") e' citato nel testo normalizzato? Basta che UNA parola non
## generica del nome (radice senza vocale finale, min 3 lettere) apra una parola del testo:
## 'orc' prende orco e orchi, 'arcier' arciere e arcieri, 'spettr' spettro e spettri.
func _nome_citato(testo_norm: String, nome: String) -> bool:
	var parole_testo: PackedStringArray = testo_norm.split(" ")
	for parola_nome: String in _normalizza(nome).split(" "):
		if parola_nome.length() < 3 or PAROLE_GENERICHE.has(parola_nome):
			continue
		var radice: String = _radice(parola_nome)
		for parola: String in parole_testo:
			if parola.begins_with(radice):
				return true
	return false


## La radice di una parola: senza la vocale finale (orco->orc, spettro->spettr, troll->troll).
static func _radice(parola: String) -> String:
	if parola.length() > 3 and "aeiou".contains(parola.right(1)):
		return parola.left(parola.length() - 1)
	return parola


static func _contiene_radice(testo: String, radici: Array) -> bool:
	for radice: Variant in radici:
		if testo.contains(String(radice)):
			return true
	return false


## Il testo dopo una parola ("verso il troll" -> "il troll"), vuoto se la parola non c'e'.
static func _dopo_parola(testo: String, parola: String) -> String:
	var indice: int = testo.find(parola + " ")
	if indice < 0:
		return ""
	return testo.substr(indice + parola.length() + 1).strip_edges()


static func _normalizza(testo: String) -> String:
	var s: String = testo.to_lower()
	var accenti: Dictionary = {
		"à": "a", "á": "a", "è": "e", "é": "e", "ì": "i", "í": "i",
		"ò": "o", "ó": "o", "ù": "u", "ú": "u", "û": "u",
	}
	for k: String in accenti:
		s = s.replace(k, accenti[k])
	var pulito: String = ""
	for i: int in range(s.length()):
		var ch: String = s[i]
		pulito += ch if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") else " "
	while pulito.contains("  "):
		pulito = pulito.replace("  ", " ")
	return pulito.strip_edges()


# --- Mondo: celle, limiti, luoghi ---

func _builder() -> Node:
	return get_tree().get_first_node_in_group("world_builder")


func _rect() -> Rect2:
	var builder: Node = _builder()
	return builder.rettangolo() if builder != null else Rect2()


func _cella_di(pos: Vector2) -> Vector2i:
	var locale: Vector2 = pos - _rect().position
	return Vector2i(
		maxi(0, floori(locale.x / PX_PER_CELLA)), maxi(0, floori(locale.y / PX_PER_CELLA)))


func _centro_cella(cella: Vector2i) -> Vector2:
	return _dentro_mappa(_rect().position
		+ Vector2((float(cella.x) + 0.5) * PX_PER_CELLA, (float(cella.y) + 0.5) * PX_PER_CELLA))


func _dentro_mappa(p: Vector2) -> Vector2:
	var r: Rect2 = _rect()
	if r.size == Vector2.ZERO:
		return p
	return p.clamp(r.position, r.end)


## La posizione di un LUOGO con nome (etichette del set attivo), null se sconosciuto.
func _pos_luogo(nome: String) -> Variant:
	var builder: Node = _builder()
	if builder == null:
		return null
	var etichette: WorldLabels = builder.regia()["etichette"] as WorldLabels
	if etichette == null:
		return null
	var voce: Dictionary = etichette.trova(nome)
	return voce.get("pos") if not voce.is_empty() else null
