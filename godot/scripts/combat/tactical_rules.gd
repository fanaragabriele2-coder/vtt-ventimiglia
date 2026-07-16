extends Node
## TacticalRules (Autoload) — le regole tattiche in stile BG3 che chiudono il set:
##
## - ATTACCHI DI OPPORTUNITA': chi ESCE dalla portata di mischia di un nemico (senza Disimpegno)
##   subisce un attacco gratuito di REAZIONE (una a round per creatura). E' la regola che rende
##   il posizionamento strategico: agganciare un arciere lo inchioda. Gli spostamenti FORZATI
##   (una spinta) non provocano, come da regola.
## - DISIMPEGNO / SCATTO / SCHIVATA: azioni complete. Disimpegno = niente opportunita' fino al
##   tuo prossimo turno; Scatto = passo raddoppiato (9 -> 18 m); Schivata = svantaggio a chi ti
##   attacca fino al tuo prossimo turno. Le usa anche l'IA (codardo, berserker, guardiano).
## - SPINTA alla BG3 (azione BONUS, non piena): se riesce sposta il bersaglio di UNA cella via
##   dall'attaccante; se la cella d'arrivo e' PIU' BASSA (alture) si aggiunge il DANNO DA CADUTA
##   (1d6 per livello di quota perso).
## - SALTO nel movimento: le superfici pericolose (fuoco, veleno) si SCAVALCANO — bruciano solo
##   se ci ATTERRI dentro (danno d'ingresso immediato), non se le attraversi con lo slancio.
## - ISPIRAZIONE e VANTAGGIO SITUAZIONALE dal Master: comandi inspire/advantage/disadvantage —
##   vantaggio (o svantaggio) al PROSSIMO tiro d'attacco di quel combattente, consumato all'uso.
## Anche il PASSO vive qui: 9 m a turno per combattente (18 con lo Scatto), spesi trascinando.

const PASSO_BASE_METRI: float = 9.0
const METRI_PER_CELLA: float = 1.5

var _reazioni: Dictionary = {}      # id -> round in cui la reazione e' stata spesa
var _disimpegnati: Dictionary = {}  # id -> true fino all'inizio del suo prossimo turno
var _schivate: Dictionary = {}      # id -> true: svantaggio a chi lo attacca
var _scatti: Dictionary = {}        # id -> true: passo raddoppiato in questo turno
var _metri: Dictionary = {}         # id -> metri di passo gia' spesi nel turno
var _ispirazioni: Dictionary = {}   # id -> true: vantaggio al prossimo attacco
var _situazionali: Dictionary = {}  # id -> "advantage"/"disadvantage" al prossimo attacco
var _forzato: bool = false          # spostamento forzato in corso: non provoca opportunita'
var _in_reazione: bool = false      # attacco di opportunita' in corso (guardia di rientro)


func _ready() -> void:
	CombatManager.combat_ended.connect(_reset)
	CombatManager.turn_changed.connect(_su_turno)
	CombatManager.shove_resolved.connect(_su_spinta)


func _reset() -> void:
	_reazioni.clear()
	_disimpegnati.clear()
	_schivate.clear()
	_scatti.clear()
	_metri.clear()
	_situazionali.clear()


## All'inizio del TUO turno scadono gli stati "fino al tuo prossimo turno" e il passo si azzera.
func _su_turno(combatant_id: String, _round: int) -> void:
	_disimpegnati.erase(combatant_id)
	_schivate.erase(combatant_id)
	_scatti.erase(combatant_id)
	_metri[combatant_id] = 0.0


# --- Le tre azioni tattiche ---

func disimpegna(id: String) -> void:
	_disimpegnati[id] = true
	GameState.announce("🌀 %s si DISIMPEGNA: si sgancia senza esporsi (niente attacchi "
		% _nome(id) + "di opportunita').")


func scatta(id: String) -> void:
	_scatti[id] = true
	GameState.announce("💨 %s SCATTA: passo raddoppiato in questo turno (18 m)." % _nome(id))


func schiva(id: String) -> void:
	_schivate[id] = true
	GameState.announce("🛡 %s si mette in SCHIVATA: chi lo attacca ha svantaggio." % _nome(id))


func in_schivata(id: String) -> bool:
	return _schivate.has(id)


# --- Ispirazione e vantaggio situazionale (comandi del Master) ---

## Ispirazione a un PG (per nome): vantaggio al suo prossimo tiro d'attacco.
func ispira(nome: String) -> void:
	var id: String = _risolvi_combattente(nome)
	if id.is_empty():
		return
	_ispirazioni[id] = true
	GameState.announce("🌟 %s guadagna l'ISPIRAZIONE: vantaggio al prossimo attacco!" % _nome(id))


## Vantaggio/svantaggio situazionale deciso dal Master sul prossimo attacco di un combattente.
func vantaggio_situazionale(nome: String, modo: String) -> void:
	var id: String = _risolvi_combattente(nome)
	if id.is_empty() or (modo != "advantage" and modo != "disadvantage"):
		return
	_situazionali[id] = modo
	var come: String = "VANTAGGIO" if modo == "advantage" else "SVANTAGGIO"
	GameState.announce("🎭 Il Master concede %s al prossimo attacco di %s." % [come, _nome(id)])


## Modificatori consumabili sul tiro d'attacco (chiamato UNA volta per attacco da resolve_attack):
## schivata del bersaglio + ispirazione/situazionale dell'attaccante (spesi qui).
func modificatori_attacco(attacker_id: String, target_id: String) -> Dictionary:
	var vantaggio: bool = false
	var svantaggio: bool = _schivate.has(target_id)
	if _ispirazioni.has(attacker_id):
		_ispirazioni.erase(attacker_id)
		vantaggio = true
		GameState.announce("🌟 %s spende l'ispirazione." % _nome(attacker_id))
	match String(_situazionali.get(attacker_id, "")):
		"advantage":
			vantaggio = true
			_situazionali.erase(attacker_id)
		"disadvantage":
			svantaggio = true
			_situazionali.erase(attacker_id)
	return { "vantaggio": vantaggio, "svantaggio": svantaggio }


# --- Passo (movimento a metri per combattente) ---

func passo_di(id: String) -> float:
	return PASSO_BASE_METRI * (2.0 if _scatti.has(id) else 1.0)


func metri_rimasti(id: String) -> float:
	return maxf(0.0, passo_di(id) - float(_metri.get(id, 0.0)))


func spendi_metri(id: String, metri: float) -> void:
	_metri[id] = float(_metri.get(id, 0.0)) + maxf(0.0, metri)


# --- Spostamenti: opportunita' e superfici (chiamato da CombatManager PRIMA di muovere) ---

## Uno spostamento VOLONTARIO da `da` ad `a` (celle): risolve gli attacchi di opportunita' di
## chi viene abbandonato in mischia e il danno/salto sulle superfici pericolose.
func pre_spostamento(id: String, da: Vector2i, a: Vector2i) -> void:
	if _forzato or _in_reazione or not CombatManager.is_active() or da == a:
		return
	var mover: Dictionary = CombatManager.get_combatant(id)
	if mover.is_empty() or int(mover.get("hitPoints", 0)) <= 0:
		return
	_attacchi_opportunita(id, mover, da, a)
	_superfici_e_salto(id, mover, da, a)


## Spostamento FORZATO (spinta): muove senza provocare opportunita' ne' salti.
func sposta_forzato(id: String, cella: Vector2i) -> void:
	_forzato = true
	CombatManager.set_combatant_cell(id, cella)
	_forzato = false


func _attacchi_opportunita(id: String, mover: Dictionary, da: Vector2i, a: Vector2i) -> void:
	if _disimpegnati.has(id):
		return
	var kind: String = String(mover.get("kind", ""))
	var round_attuale: int = int(CombatManager.get_state()["round"])
	for c: Variant in CombatManager.get_state()["combatants"]:
		var nemico: Dictionary = c
		if String(nemico.get("kind", "")) == kind or int(nemico.get("hitPoints", 0)) <= 0:
			continue
		var nid: String = String(nemico.get("id", ""))
		if CombatManager.attack_range_of(nid) > 1:
			continue  # l'opportunita' e' della mischia: gli arcieri non la fanno
		var cella: Variant = CombatManager.get_combatant_cell(nid)
		if cella == null:
			continue
		var nc: Vector2i = cella
		if maxi(absi(nc.x - da.x), absi(nc.y - da.y)) != 1:
			continue  # non era agganciato in mischia
		if maxi(absi(nc.x - a.x), absi(nc.y - a.y)) <= 1:
			continue  # gli resta addosso: nessuno sgancio
		if int(_reazioni.get(nid, -1)) == round_attuale:
			continue  # reazione gia' spesa in questo round
		if nid == CombatManager.pc_attivo_id() and not InventoryManager.can_afford("reaction"):
			continue  # il PG attivo ha gia' speso la reazione (economia del turno)
		_reazioni[nid] = round_attuale
		GameState.announce("⚡ ATTACCO DI OPPORTUNITA': %s colpisce %s che si sgancia!" % [
			String(nemico.get("name", "?")), String(mover.get("name", "?")),
		])
		_in_reazione = true
		CombatManager.opportunity_attack(nid, id)
		_in_reazione = false


## Le superfici si SCAVALCANO col movimento (salto): bruciano solo ATTERRANDOCI dentro.
func _superfici_e_salto(id: String, mover: Dictionary, da: Vector2i, a: Vector2i) -> void:
	var atterraggio: Dictionary = _superficie_su(a)
	if not atterraggio.is_empty():
		var tipo: String = String(atterraggio.get("tipo", "fuoco"))
		var danno: int = int(CombatManager.roll_damage_formula(
			SurfacesManager.formula_danno(tipo), false)["total"])
		GameState.announce("🔥 %s atterra in mezzo a una superficie di %s: %d danni!" % [
			String(mover.get("name", "?")), tipo, danno,
		])
		CombatManager.apply_damage_to_combatant(id, danno, "")
		return
	for cella: Vector2i in CoverManager.linea_celle(da, a):
		if not _superficie_su(cella).is_empty():
			GameState.announce("🤸 %s salta oltre la superficie pericolosa senza toccarla."
				% String(mover.get("name", "?")))
			return


func _superficie_su(cella: Vector2i) -> Dictionary:
	var round_attuale: int = int(CombatManager.get_state()["round"])
	for s: Dictionary in SurfacesManager.elenco_attivo():
		if not SurfacesManager.e_scaduta(s, round_attuale) and SurfacesManager.e_dentro(s, cella):
			return s
	return {}


# --- Spinta alla BG3: sposta di una cella + danno da caduta dalle alture ---

func _su_spinta(result: Dictionary) -> void:
	if not bool(result.get("success", false)):
		return
	var atk: String = String(result.get("attacker", ""))
	var trg: String = String(result.get("target", ""))
	var ca: Variant = CombatManager.get_combatant_cell(atk)
	var cb: Variant = CombatManager.get_combatant_cell(trg)
	if ca == null or cb == null:
		return
	var spinta: Vector2i = Vector2i(signi((cb as Vector2i).x - (ca as Vector2i).x),
		signi((cb as Vector2i).y - (ca as Vector2i).y))
	if spinta == Vector2i.ZERO:
		spinta = Vector2i(1, 0)
	var dest: Vector2i = (cb as Vector2i) + spinta
	dest = Vector2i(maxi(0, dest.x), maxi(0, dest.y))
	if dest == (cb as Vector2i):
		return  # spinto contro il bordo del mondo: non c'e' dove arretrare
	# I corpi bloccano: se la cella dietro e' OCCUPATA da un altro combattente vivo, il bersaglio
	# ci sbatte contro e non arretra (niente token sovrapposti).
	if _cella_occupata(dest, trg):
		GameState.announce("👐 %s sbatte contro qualcuno alle sue spalle e non arretra!"
			% _nome(trg))
		return
	var quota_prima: int = ElevationManager.quota_di((cb as Vector2i).x, (cb as Vector2i).y)
	var quota_dopo: int = ElevationManager.quota_di(dest.x, dest.y)
	sposta_forzato(trg, dest)
	GameState.announce("👐 %s viene scaraventato indietro di una cella!" % _nome(trg))
	if quota_dopo < quota_prima:
		var piani: int = quota_prima - quota_dopo
		var danno: int = 0
		for i: int in range(piani):
			danno += randi_range(1, 6)
		GameState.announce("⛰ %s CADE dall'altura (%d livelli): %d danni da caduta!" % [
			_nome(trg), piani, danno,
		])
		CombatManager.apply_damage_to_combatant(trg, danno, atk)


## La cella e' occupata da un combattente VIVO diverso da `escluso`?
func _cella_occupata(cella: Vector2i, escluso: String) -> bool:
	for c: Variant in CombatManager.get_state()["combatants"]:
		var comb: Dictionary = c
		var cid: String = String(comb.get("id", ""))
		if cid == escluso or int(comb.get("hitPoints", 0)) <= 0:
			continue
		var pos: Variant = CombatManager.get_combatant_cell(cid)
		if pos != null and (pos as Vector2i) == cella:
			return true
	return false


# --- Abilita' fisiche (per la spinta: qui per alleggerire CombatManager) ---

## Bonus di Atletica: la scheda vera per i PG, per i PNG un proxy onesto dal bonus d'attacco.
func bonus_atletica(combatant_id: String) -> int:
	var char_id: String = CombatManager.character_id_di(combatant_id)
	if not char_id.is_empty():
		var pg: CharacterData = CharacterManager.get_character_by_id(char_id)
		if pg:
			return pg.skill_modifier("athletics")
	var c: Dictionary = CombatManager.get_combatant(combatant_id)
	return int(c.get("attackBonus", 2)) - 2 if not c.is_empty() else 0


func bonus_acrobazia(combatant_id: String) -> int:
	var char_id: String = CombatManager.character_id_di(combatant_id)
	if not char_id.is_empty():
		var pg: CharacterData = CharacterManager.get_character_by_id(char_id)
		if pg:
			return pg.skill_modifier("acrobatics")
	var c: Dictionary = CombatManager.get_combatant(combatant_id)
	return int(c.get("initiativeBonus", 0)) if not c.is_empty() else 0


# --- Aiuti ---

func _nome(id: String) -> String:
	return String(CombatManager.get_combatant(id).get("name", id))


## Risolve un nome libero ("elrik", "il troll") nel combattente VIVO piu' somigliante.
func _risolvi_combattente(nome: String) -> String:
	var cercato: String = nome.to_lower().strip_edges()
	if cercato.is_empty():
		return ""
	for c: Variant in CombatManager.get_state()["combatants"]:
		var comb: Dictionary = c
		if int(comb.get("hitPoints", 0)) <= 0:
			continue
		var candidato: String = String(comb.get("name", "")).to_lower()
		if candidato.contains(cercato) or cercato.contains(candidato):
			return String(comb.get("id", ""))
	return ""
