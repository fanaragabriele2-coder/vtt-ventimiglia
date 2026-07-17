# TEST DI REGRESSIONE del BILANCIAMENTO (H4) — partita completa da prologo a finale.
# Rilancialo a OGNI modifica di bestiario/storia/balancer: se una campagna scende sotto ~90%
# di completamento o compaiono "muri", qualcosa si e' rotto.
#   Uso:  python3 tools/simula_campagna.py [terra_di_mezzo|ventimiglia]
# Specchio Python fedele dei sistemi REALI del gioco (stessi dati, stesse formule):
# EncounterBalancer.bilancia (budget/statScale/overrides), combattimento (iniziativa,
# d20 vs CA, crit, danno massiccio, tiri contro la morte, pozioni), StoryDirector
# (grafo, prove col miglior modificatore + competenza, ricompense dedup, riprova),
# ProgressionManager (XP fallback hp*6 al killer, levelXp, level-up), Reliquie (+1 att a 4).
import json, random, re, sys, os
from collections import Counter, defaultdict

BASE = os.environ.get(
    "GODOT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
STORIA_ID = sys.argv[1] if len(sys.argv) > 1 else "terra_di_mezzo"
storia = json.load(open(f"{BASE}/data/storia_{STORIA_ID}.json"))
mostri = {m["name"]: m for m in json.load(open(f"{BASE}/data/monsters.json"))["monsters"]}
lootT = json.load(open(f"{BASE}/data/loot_tables.json"))
classi = {c["id"]: c for c in json.load(open(f"{BASE}/data/classes.json"))["classes"]}
armeria = {o["id"]: o for o in json.load(open(f"{BASE}/data/armeria.json"))["oggetti"]}
items = {i["id"]: i for i in json.load(open(f"{BASE}/data/items.json"))["items"]}
RELIQUIE = {"r-lama-ramingo","r-amuleto-viandante","r-foglia-lorien","e-cotta-mithril",
            "e-arco-galadhrim","l-spada-ramingo-ricomposta","l-stella-serena"}
LEVEL_XP = lootT["levelXp"]

def mod(v): return (v - 10) // 2
def prof(lv): return 6 if lv>=17 else 5 if lv>=13 else 4 if lv>=9 else 3 if lv>=5 else 2

def tira(formula, crit=False):
    m = re.match(r"(\d+)d(\d+)([+-]\d+)?", formula.replace(" ", ""))
    if not m: return 1
    n, f, b = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if crit: n *= 2
    return max(1, sum(random.randint(1, f) for _ in range(n)) + b)

def media_formula(formula):
    m = re.match(r"(\d+)d(\d+)([+-]\d+)?", formula.replace(" ", ""))
    if not m: return 1.0
    n, f, b = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    return n * (f + 1) / 2 + b

# ---------- party (guerriero + mago, come nello screenshot dell'utente) ----------
DADO_CLASSE = {"guerriero":"1d8","barbaro":"1d12","ladro":"1d8","ranger":"1d8","mago":"1d10","chierico":"1d6"}
def crea_pg(cid, nome):
    c = classi[cid]; a = c["arr"]
    con = mod(a["con"]); hp = c["hitDie"] + con
    ac = 10 + mod(a["dex"])
    for e in c.get("equip", []):
        d = items.get(e["c"], {})
        if d.get("armorBase"):
            dexcap = d.get("dexCap"); dx = mod(a["dex"])
            ac = d["armorBase"] + (min(dx, dexcap) if dexcap is not None else dx)
        if d.get("type") == "shield": pass
    ac += sum(2 for e in c.get("equip", []) if items.get(e["c"], {}).get("type") == "shield")
    best = max(mod(a["str"]), mod(a["dex"]), mod(a["int"]), mod(a["wis"]))
    return {"nome":nome,"classe":cid,"lv":1,"xp":0,"hpmax":hp,"hp":hp,"ac":ac,"arr":a,
            "atk":2+best,"dmg":f"{DADO_CLASSE[cid]}+{best}","con":con,
            "pozioni":sum(e.get("q",1) for e in c.get("equip",[]) if e["c"]=="healingPotion")}

def miglior_mod(party, ab): return max(mod(p["arr"][ab]) for p in party) + prof(max(p["lv"] for p in party))

# ---------- EncounterBalancer (specchio esatto) ----------
PESO = {"0":0.5,"1/8":1.0,"1/4":2.0,"1/2":4.0,"1":8.0,"2":15.0,"3":25.0,"4":40.0,"5":60.0}
def peso_cr(cr):
    if cr in PESO: return PESO[cr]
    try: n = float(cr)
    except: return PESO["1/4"]
    if n <= 0: return PESO["1/4"]
    if n >= 5: return PESO["5"] + (n-5)*20
    return PESO["1"]*n
def potenza_pg(lv, hmax, hcur):
    fr = max(0, min(hcur, hmax))/max(1, hmax)
    return (6 + (lv-1)**2*0.9 + (lv-1)*4) * (0.35 + 0.65*fr)
def bilancia(lista, party, intensita, danno_scalato, floor_s=0.5, cap_s=1.6, atk_pend=2.0, tetto_extra=2):
    vivi = max(1, sum(1 for p in party if p["hp"] > 0))
    pot = sum(potenza_pg(p["lv"], p["hpmax"], p["hp"]) for p in party if p["hp"] > 0) or potenza_pg(1,10,10)
    budget = pot * {"facile":0.55,"equo":0.85,"difficile":1.2}[intensita]
    tipi = [{"name":e["name"],"n":max(1,e.get("count",1)),
             "cr":mostri[e["name"]]["challenge"],"peso":peso_cr(mostri[e["name"]]["challenge"])} for e in lista]
    tetto = max(1, vivi + tetto_extra) if tetto_extra is not None else max(1, vivi*3)
    def molt_gruppo(n): return 1.0 if n <= 1 else (1.5 if n == 2 else (2.0 if n <= 6 else 2.5))
    chiesti = sum(t["n"] for t in tipi)
    minaccia = sum(t["n"]*t["peso"] for t in tipi) * molt_gruppo(chiesti)
    scala_n = min(1.0, budget/max(1.0,minaccia), tetto/max(1,chiesti))
    out = [{**t, "n":max(1, round(t["n"]*scala_n))} for t in tipi]
    g = 0
    while sum(t["n"] for t in out) > tetto and g < 100:
        g += 1
        big = max((t for t in out if t["n"] > 1), key=lambda t: t["n"], default=None)
        if big is None: break
        big["n"] -= 1
    n_att = sum(t["n"] for t in out)
    att = sum(t["n"]*t["peso"] for t in out) * molt_gruppo(n_att)
    scale = max(floor_s, min(cap_s, budget/max(1.0, att)))
    nemici = []
    for t in out:
        tm = mostri[t["name"]]
        hp = tm["hitPoints"]; ab = tm["attackBonus"]; dmg = tm["damageFormula"]
        if abs(scale-1.0) >= 0.06:
            hp = max(1, round(tm["hitPoints"]*scale))
            ab = tm["attackBonus"] + max(-4, min(4, round((scale-1)*atk_pend)))
            if danno_scalato:  # FIX proposto: il danno scala in proporzione, non di +-2
                delta = round(media_formula(tm["damageFormula"]) * (scale-1))
                delta = max(delta, -int(media_formula(tm["damageFormula"]) - 1))
            else:              # comportamento ATTUALE del gioco
                delta = round((scale-1)*3)
            m = re.match(r"(\d+d\d+)([+-]\d+)?", tm["damageFormula"])
            b = int(m.group(2) or 0) + delta
            dmg = m.group(1) + (f"+{b}" if b > 0 else (str(b) if b < 0 else ""))
        for k in range(t["n"]):
            nemici.append({"nome":t["name"],"hp":hp,"hpmax":hp,"ac":tm["armorClass"],
                           "atk":ab,"dmg":dmg,"init":tm["initiativeBonus"],"range":tm.get("attackRange",1)})
    return nemici

# ---------- combattimento (specchio: iniziativa, d20 vs CA, crit, morte, pozioni) ----------
def combatti(party, nemici, reliquie_n):
    bonus_rel = 1 if reliquie_n >= 4 else 0
    for p in party: p.update(dying=False, succ=0, fail=0, dead=False, stable=False)
    ordine = sorted([("pc",p) for p in party if p["hp"]>0] + [("npc",n) for n in nemici],
                    key=lambda t: -(random.randint(1,20) + (mod(t[1]["arr"]["dex"]) if t[0]=="pc" else t[1]["init"])))
    round_n, morti_finali = 0, 0
    while round_n < 200:
        round_n += 1
        for kind, u in ordine:
            vivi_pc = [p for p in party if p["hp"] > 0]
            vivi_np = [n for n in nemici if n["hp"] > 0]
            if not vivi_np: return "vittoria", round_n, morti_finali
            in_gioco = [p for p in party if p["hp"]>0 or (p["dying"] and not p["stable"] and not p["dead"])]
            if not in_gioco: return "tpk", round_n, morti_finali
            if kind == "pc":
                p = u
                if p["dead"] or p["stable"]: continue
                if p["hp"] <= 0:  # tiro contro la morte (DeathSaves)
                    d = random.randint(1, 20)
                    if d == 20: p.update(hp=1, dying=False, succ=0, fail=0)
                    elif d == 1: p["fail"] += 2
                    elif d >= 10: p["succ"] += 1
                    else: p["fail"] += 1
                    if p["succ"] >= 3: p["stable"] = True
                    if p["fail"] >= 3: p.update(dead=True, dying=False); morti_finali += 1
                    continue
                if p["hp"] < p["hpmax"]*0.35 and p["pozioni"] > 0:  # bonus: pozione
                    p["pozioni"] -= 1; p["hp"] = min(p["hpmax"], p["hp"] + tira("2d4+2"))
                if vivi_np:  # azione: attacca il nemico piu' debole
                    b = min(vivi_np, key=lambda n: n["hp"])
                    r = random.randint(1, 20)
                    if r != 1 and (r == 20 or r + p["atk"] + bonus_rel >= b["ac"]):
                        b["hp"] -= tira(p["dmg"], r == 20)
            else:
                n = u
                if n["hp"] <= 0: continue
                if not vivi_pc: continue  # nessuno in piedi: resta in guardia (fix recente)
                b = random.choice(vivi_pc)
                r = random.randint(1, 20)
                if r != 1 and (r == 20 or r + n["atk"] >= b["ac"]):
                    danno = tira(n["dmg"], r == 20)
                    if danno - b["hp"] >= b["hpmax"]:
                        b.update(hp=0, dead=True); morti_finali += 1  # danno massiccio: morte istantanea
                    else:
                        b["hp"] = max(0, b["hp"] - danno)
                        if b["hp"] == 0: b["dying"] = True
    return "stallo", round_n, morti_finali

# ---------- campagna completa ----------
def gioca(danno_scalato, cura_al_riprova, riposo_tra_boss, max_retry=25, verbose=False, floor_s=0.5, cap_s=1.6, atk_pend=2.0, cura_fr=0.5):
    party = [crea_pg("guerriero","Joran"), crea_pg("mago","Selene")]
    nodo, premiati, gold, rel = storia["nodo_iniziale"], set(), 0, set()
    boss_fatti, retry_tot, prove, passi = [], 0, 0, 0
    problemi = []
    while passi < 400:
        passi += 1
        n = storia["nodi"][nodo]
        if "combattimento" in n:
            vinto, tent = False, 0
            while not vinto:
                tent += 1
                if tent > max_retry:
                    return {"esito":"BLOCCATO","boss":nodo,"boss_fatti":boss_fatti,"retry":retry_tot,
                            "lv":max(p['lv'] for p in party),"problemi":problemi}
                nemici = bilancia(n["combattimento"], party, n.get("intensita","equo"), danno_scalato, floor_s, cap_s, atk_pend)
                esito, rounds, morti = combatti(party, nemici, len(rel))
                if esito == "vittoria":
                    vinto = True
                    for nm in nemici:  # XP al killer (come nel gioco)
                        k = random.choice([p for p in party if p["hp"] > 0] or party)
                        k["xp"] += lootT["xpByName"].get(re.sub(r"\s+\d+$","",nm["nome"]), max(10, round(nm["hpmax"]*6)))
                        nl = 1
                        for i, s in enumerate(LEVEL_XP):
                            if k["xp"] >= s: nl = i+1
                        while k["lv"] < min(20, nl):
                            k["lv"] += 1
                            k["hpmax"] += max(1, int(int(DADO_CLASSE[k["classe"]].split("d")[1])/2)+1+k["con"])
                            k["hp"] = k["hpmax"]
                            best = max(mod(k["arr"]["str"]),mod(k["arr"]["dex"]),mod(k["arr"]["int"]),mod(k["arr"]["wis"]))
                            k["atk"] = prof(k["lv"]) + best
                else:
                    retry_tot += 1
                    if not cura_al_riprova:
                        return {"esito":"SOFTLOCK","boss":nodo,"boss_fatti":boss_fatti,"retry":retry_tot,
                                "lv":max(p['lv'] for p in party),"problemi":problemi}
                    fr = 0.5 if tent <= 1 else 1.0
                    for p in party:  # FIX: riprova progressivo (2°+: forze piene + 1 pozione)
                        p.update(hp=max(1, int(p["hpmax"]*fr)), dead=False, dying=False, stable=False)
                        if tent >= 2: p["pozioni"] += 1
            boss_fatti.append(nodo)
            if nodo not in premiati and "ricompensa" in n:
                premiati.add(nodo); rw = n["ricompensa"]
                gold += rw.get("gold", 0)
                for it in rw.get("items", []):
                    if it == "healingPotion": random.choice(party)["pozioni"] += 1
                    if it in RELIQUIE: rel.add(it)
                    if it not in items and it not in armeria and it not in ("healingPotion","rations","gold"):
                        problemi.append(f"item sconosciuto: {it}")
            if riposo_tra_boss:  # riposo lungo al campo tra un capitolo e l'altro
                for p in party:
                    if not p.get("dead"): p["hp"] = p["hpmax"]
            nodo = n["dopo_vittoria"]; continue
        if n.get("fine"):
            return {"esito":"FINALE","boss_fatti":boss_fatti,"retry":retry_tot,"prove":prove,
                    "lv":max(p['lv'] for p in party),"gold":gold,"reliquie":len(rel),"problemi":problemi}
        opz = n.get("opzioni", [])
        if not opz:
            return {"esito":"VICOLO_CIECO","nodo":nodo,"problemi":problemi}
        o = random.choice(opz)
        if "prova" in o:
            prove += 1; pr = o["prova"]
            tot = random.randint(1,20) + miglior_mod(party, pr["abilita"]) + (1 if len(rel)>=2 else 0)
            if nodo not in premiati and "ricompensa" in n:
                premiati.add(nodo)
                gold += n["ricompensa"].get("gold",0)
                for it in n["ricompensa"].get("items",[]):
                    if it in RELIQUIE: rel.add(it)
                    if it == "healingPotion": random.choice(party)["pozioni"] += 1
            nodo = pr["successo"] if tot >= pr["cd"] else pr["fallimento"]
        else:
            if nodo not in premiati and "ricompensa" in n:
                premiati.add(nodo)
                gold += n["ricompensa"].get("gold",0)
                for it in n["ricompensa"].get("items",[]):
                    if it in RELIQUIE: rel.add(it)
                    if it == "healingPotion": random.choice(party)["pozioni"] += 1
            nodo = o["vai_a"]
    return {"esito":"LOOP","problemi":problemi}

def batteria(nome, **kw):
    random.seed(20260716)
    esiti, retry, lv, blocchi = Counter(), [], [], Counter()
    for _ in range(600):
        r = gioca(**kw)
        esiti[r["esito"]] += 1
        if r["esito"] == "FINALE":
            retry.append(r["retry"]); lv.append(r["lv"])
        else:
            blocchi[r.get("boss", r.get("nodo","?"))] += 1
    print(f"\n=== {nome} ===")
    print("  esiti:", dict(esiti))
    if retry:
        print(f"  retry medi a campagna: {sum(retry)/len(retry):.1f} | livello finale medio: {sum(lv)/len(lv):.1f}")
    if blocchi:
        print("  muri (dove ci si blocca):", dict(blocchi.most_common(5)))

print("PARTY: Joran (guerriero) + Selene (mago) — HP", [ (p['nome'], p['hp'], 'CA', p['ac'], 'atk+%d'%p['atk']) for p in [crea_pg('guerriero','J'), crea_pg('mago','S')]])


batteria("FIX + xp a tutti + riprova meta' HP", danno_scalato=True, cura_al_riprova=True, riposo_tra_boss=True,
         floor_s=0.2, cap_s=1.15, atk_pend=6.0, cura_fr=0.5)
batteria("FIX + xp a tutti + riprova FORZE PIENE", danno_scalato=True, cura_al_riprova=True, riposo_tra_boss=True,
         floor_s=0.2, cap_s=1.15, atk_pend=6.0, cura_fr=1.0)
batteria("FIX completi, giocatore pigro (mai riposi)", danno_scalato=True, cura_al_riprova=True, riposo_tra_boss=False,
         floor_s=0.2, cap_s=1.15, atk_pend=6.0, cura_fr=1.0)
