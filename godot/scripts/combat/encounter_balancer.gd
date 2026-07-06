extends Node
## EncounterBalancer (Autoload singleton) — porting del Modulo 37 JS "Encounter Balancer".
##
## Prima di far comparire i nemici, calcola un "budget di minaccia" dal party REALE (quanti sono,
## che livello, quanti HP ADESSO) e scala sia la QUANTITA' che le STATISTICHE dei nemici, cosi' uno
## scontro e' una sfida equa e non un PG solitario circondato da 10 goblin. Matematica pura e
## testabile; l'aggancio allo spawn (spawn_bilanciato) e' opzionale e retrocompatibile.
##
## Registrazione: Project Settings > Autoload -> "EncounterBalancer" (dopo CharacterManager,
## CombatManager e ProgressionManager).

signal encounter_balanced(result: Dictionary)

const PESO_PER_CR: Dictionary = {
	"0": 0.5, "1/8": 1.0, "1/4": 2.0, "1/2": 4.0, "1": 8.0, "2": 15.0, "3": 25.0, "4": 40.0, "5": 60.0,
}
const INTENSITA: Dictionary = { "facile": 0.55, "equo": 0.85, "difficile": 1.2 }


func peso_da_cr(cr: String) -> float:
	var chiave: String = cr if not cr.is_empty() else "1/4"
	if PESO_PER_CR.has(chiave):
		return float(PESO_PER_CR[chiave])
	var n: float = chiave.to_float()
	if n <= 0.0:
		return float(PESO_PER_CR["1/4"])
	if n >= 5.0:
		return float(PESO_PER_CR["5"]) + (n - 5.0) * 20.0
	return float(PESO_PER_CR["1"]) * n


## Potenza di un singolo PG: cresce col livello (quadratica leggera) ed e' scalata dalla frazione
## di HP correnti — un eroe a meta' vita "vale" meno, cosi' dopo scontri duri il balancer manda
## avversari piu' leggeri (anti-TPK a cascata).
func potenza_pg(level: int, hp_max: int, hp_cur: int) -> float:
	var lvl: int = clampi(level, 1, 20)
	var hmax: int = maxi(1, hp_max)
	var hcur: int = clampi(hp_cur, 0, hmax)
	var fraz: float = float(hcur) / float(hmax)
	var base: float = 6.0 + float(lvl - 1) * float(lvl - 1) * 0.9 + float(lvl - 1) * 4.0
	var modificatore: float = 0.35 + 0.65 * fraz
	return base * modificatore


## Potenza totale del party = somma delle potenze dei membri VIVI (chi e' a 0 HP non combatte).
func potenza_partito(party: Array[Dictionary]) -> float:
	if party.is_empty():
		return potenza_pg(1, 10, 10)
	var tot: float = 0.0
	for pg: Dictionary in party:
		if int(pg.get("hpCur", 1)) <= 0:
			continue
		tot += potenza_pg(int(pg.get("level", 1)), int(pg.get("hpMax", 10)), int(pg.get("hpCur", 10)))
	return tot


func budget_sfida(party: Array[Dictionary], intensita: String = "equo") -> float:
	var fattore: float = float(INTENSITA.get(intensita, INTENSITA["equo"]))
	return potenza_partito(party) * fattore


func _template_per_nome(nome: String) -> Dictionary:
	var n: String = nome.to_lower().strip_edges()
	for m: Dictionary in CombatManager.get_monster_catalog():
		if String(m["id"]) == n or String(m["name"]).to_lower() == n:
			return m
	for m: Dictionary in CombatManager.get_monster_catalog():
		if not n.is_empty() and n.contains(String(m["name"]).to_lower()):
			return m
	return {}


## Rimuove nemici in eccesso rispetto al tetto, uno per volta dai gruppi piu' numerosi, mai sotto 1.
func _applica_tetto(lista: Array[Dictionary], tetto: int) -> Array[Dictionary]:
	var guardia: int = 0
	while guardia < 100:
		guardia += 1
		var totale: int = 0
		for t: Dictionary in lista:
			totale += int(t["count"])
		if totale <= tetto:
			break
		var piu_grande: Dictionary = {}
		for t: Dictionary in lista:
			if int(t["count"]) > 1 and (piu_grande.is_empty() or int(t["count"]) > int(piu_grande["count"])):
				piu_grande = t
		if piu_grande.is_empty():
			break
		piu_grande["count"] = int(piu_grande["count"]) - 1
	return lista


func _overrides_da_scala(tipo: Dictionary, stat_scale: float) -> Variant:
	var tmpl: Dictionary = _template_per_nome(String(tipo["name"]))
	if tmpl.is_empty() or absf(stat_scale - 1.0) < 0.06:
		return null
	var hp: int = maxi(1, roundi(float(tmpl.get("hitPoints", 1)) * stat_scale))
	var delta_attacco: int = roundi((stat_scale - 1.0) * 2.0)
	var delta_danno: int = roundi((stat_scale - 1.0) * 3.0)
	return {
		"hitPoints": hp, "maxHitPoints": hp,
		"attackBonus": int(tmpl.get("attackBonus", 0)) + delta_attacco,
		"damageBonusDelta": delta_danno,
	}


## Bilancia la lista di spawn richiesta ([{name, count}, ...]). Ritorna { lista, statScale, cr,
## budget, potenza, intensita, nemiciTotali }. lista: stessi tipi ma con count/overrides ricalcolati
## cosi' la minaccia totale ~ budget, senza mai superare ~3 nemici per PG vivo, ne' scendere sotto 1.
func bilancia(lista_richiesta: Array, party: Array[Dictionary], intensita: String = "equo") -> Dictionary:
	var vivi: int = 0
	for pg: Dictionary in party:
		if int(pg.get("hpCur", 1)) > 0:
			vivi += 1
	vivi = maxi(1, vivi)

	var budget: float = budget_sfida(party, intensita)
	var potenza: float = potenza_partito(party)

	var tipi: Array[Dictionary] = []
	for e: Variant in lista_richiesta:
		if not (e is Dictionary):
			continue
		var entry: Dictionary = e
		var nome: String = String(entry.get("name", entry.get("type", entry.get("id", ""))))
		var tmpl: Dictionary = _template_per_nome(nome)
		var cr: String = String(tmpl.get("challenge", "1/4")) if not tmpl.is_empty() else "1/4"
		tipi.append({
			"name": nome, "countRichiesto": maxi(1, int(entry.get("count", 1))),
			"cr": cr, "pesoUnitario": peso_da_cr(cr),
		})
	if tipi.is_empty():
		return { "lista": [], "statScale": 1.0, "cr": 0.0, "budget": budget, "potenza": potenza, "intensita": intensita, "nemiciTotali": 0 }

	var tetto_totale: int = maxi(1, vivi * 3)
	var chiesto_totale: int = 0
	var minaccia_richiesta: float = 0.0
	for t: Dictionary in tipi:
		chiesto_totale += int(t["countRichiesto"])
		minaccia_richiesta += float(t["countRichiesto"]) * float(t["pesoUnitario"])

	var scala_count: float = minf(1.0, minf(budget / maxf(1.0, minaccia_richiesta), float(tetto_totale) / float(maxi(1, chiesto_totale))))
	var lista: Array[Dictionary] = []
	for t: Dictionary in tipi:
		var count: int = maxi(1, roundi(float(t["countRichiesto"]) * scala_count))
		lista.append({ "name": t["name"], "count": count, "cr": t["cr"], "pesoUnitario": t["pesoUnitario"] })
	lista = _applica_tetto(lista, tetto_totale)

	var minaccia_attuale: float = 0.0
	for t: Dictionary in lista:
		minaccia_attuale += float(t["count"]) * float(t["pesoUnitario"])
	var stat_scale: float = clampf(budget / maxf(1.0, minaccia_attuale), 0.5, 1.6)

	for t: Dictionary in lista:
		t["overrides"] = _overrides_da_scala(t, stat_scale)
		t.erase("pesoUnitario")

	var cr_medio: float = 0.0
	var nemici_totali: int = 0
	for t: Dictionary in lista:
		cr_medio += peso_da_cr(String(t["cr"])) * float(t["count"])
		nemici_totali += int(t["count"])

	return {
		"lista": lista, "statScale": snappedf(stat_scale, 0.01),
		"cr": snappedf(cr_medio, 0.01), "budget": snappedf(budget, 0.01), "potenza": snappedf(potenza, 0.01),
		"intensita": intensita, "nemiciTotali": nemici_totali,
	}


## Lettura del party reale: roster hotseat (CharacterManager) + livello autorevole da
## ProgressionManager (chi ha guadagnato XP, non solo identity.level).
func partito_corrente() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for c: CharacterData in CharacterManager.get_party():
		var prog: Dictionary = ProgressionManager.get_prog(c.id)
		out.append({ "id": c.id, "level": int(prog.get("level", c.level)), "hpMax": c.hp_max, "hpCur": c.hp_current })
	if out.is_empty():
		out.append({ "level": 1, "hpMax": 10, "hpCur": 10 })
	return out


## Bilancia per il gioco REALE e pubblica il risultato sul Global Game State (HUD/chat reagiscono
## allo stesso evento, nessuno stato divergente).
func bilancia_per_gioco(lista_richiesta: Array, intensita: String = "equo") -> Dictionary:
	var risultato: Dictionary = bilancia(lista_richiesta, partito_corrente(), intensita)
	GameState.set_last_encounter(risultato)
	encounter_balanced.emit(risultato)
	return risultato


## Evoca i nemici della lista GIA' bilanciata (chiamare bilancia_per_gioco prima) e avvia il
## combattimento se non e' gia' attivo. Ritorna i nomi comparsi (per l'annuncio).
func spawn_bilanciato(lista_richiesta: Array, intensita: String = "equo") -> Array[String]:
	var risultato: Dictionary = bilancia_per_gioco(lista_richiesta, intensita)
	var nomi: Array[String] = []
	for t: Dictionary in risultato["lista"]:
		var tmpl: Dictionary = _template_per_nome(String(t["name"]))
		var cid: String = String(tmpl.get("id", String(t["name"]).to_lower())) if not tmpl.is_empty() else String(t["name"]).to_lower()
		var overrides: Dictionary = t.get("overrides", {}) if t.get("overrides") != null else {}
		for i: int in range(int(t["count"])):
			var combattente: Dictionary = CombatManager.add_npc(cid, overrides)
			if not combattente.is_empty():
				nomi.append(String(combattente["name"]))
	if not nomi.is_empty() and not CombatManager.is_active():
		CombatManager.start_combat()
	return nomi
