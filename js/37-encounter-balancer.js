// --- INIZIO MODULO 37 JS: ENCOUNTER BALANCER (bilanciamento matematico degli scontri) ---
// REGOLA 1 della specifica "Lead Game Designer": basta col PG solitario circondato da 10 goblin.
// Prima di far comparire i nemici, questo modulo calcola un "budget di minaccia" a partire dal
// party REALE (quanti sono, che livello hanno, quanti HP hanno ADESSO) e ridimensiona sia la
// QUANTITA' sia le STATISTICHE dei nemici, così lo scontro è una sfida equa e non un TPK garantito.
//
// Tutta la matematica è in funzioni pure e testabili; l'aggancio allo spawn (modulo 16) è opzionale
// e retrocompatibile. Il risultato di ogni bilanciamento viene pubblicato sul Global Game State
// (modulo 36), così HUD/chat possono reagire allo stesso evento senza stato divergente.
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Pesi di minaccia dei nemici, per Challenge Rating 5e (data-driven, niente numeri sparsi nel
  // codice): quanto "vale" un nemico nel budget. Ricavati dal GS del bestiario del modulo 06.
  // Un CR non elencato ricade sul più vicino sensato.
  // ---------------------------------------------------------------------------
  var PESO_PER_CR = {
    "0": 0.5, "1/8": 1, "1/4": 2, "1/2": 4, "1": 8, "2": 15, "3": 25, "4": 40, "5": 60
  };

  function pesoDaCr(cr) {
    var chiave = String(cr == null ? "1/4" : cr).trim();
    if (PESO_PER_CR[chiave] != null) { return PESO_PER_CR[chiave]; }
    var n = parseFloat(chiave);
    if (!isFinite(n)) { return PESO_PER_CR["1/4"]; }
    if (n <= 0) { return PESO_PER_CR["0"]; }
    if (n >= 5) { return PESO_PER_CR["5"] + (n - 5) * 20; }
    return PESO_PER_CR["1"] * n; // interpolazione grezza per CR interi non tabellati
  }

  // ---------------------------------------------------------------------------
  // Potenza di un singolo PG: cresce col livello (quadratica leggera, come i budget XP 5e) ed è
  // scalata dalla frazione di HP correnti — un eroe a metà vita "vale" meno, così dopo scontri duri
  // il balancer manda avversari più leggeri e non finisce il party (anti-TPK).
  // ---------------------------------------------------------------------------
  function potenzaPg(pg) {
    var livello = clamp(intero(pg && pg.level, 1), 1, 20);
    var hpMax = Math.max(1, intero(pg && pg.hpMax, 1));
    var hpCur = clamp(intero(pg && pg.hpCur, hpMax), 0, hpMax);
    var fraz = hpCur / hpMax;                 // 0..1
    var base = 6 + (livello - 1) * (livello - 1) * 0.9 + (livello - 1) * 4; // ~cresce col livello
    // Un PG quasi morto conta poco (min 35%): il budget scende e i nemici si alleggeriscono.
    var mod = 0.35 + 0.65 * fraz;
    return base * mod;
  }

  // Potenza totale del party = somma delle potenze dei membri VIVI (chi è a 0 HP non combatte).
  function potenzaPartito(party) {
    if (!Array.isArray(party) || !party.length) { return potenzaPg({ level: 1, hpMax: 10, hpCur: 10 }); }
    return party.reduce(function (tot, pg) {
      if (pg && intero(pg.hpCur, 1) <= 0) { return tot; } // membro a terra: non aggiunge budget
      return tot + potenzaPg(pg);
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Budget di minaccia dello scontro: quota della potenza del party. INTENSITA' regolabile
  // ("facile"/"equo"/"difficile"): "equo" mira a uno scontro impegnativo ma vincibile.
  // ---------------------------------------------------------------------------
  var INTENSITA = { facile: 0.55, equo: 0.85, difficile: 1.2 };

  function budgetSfida(party, intensita) {
    var fattore = INTENSITA[intensita] || INTENSITA.equo;
    return potenzaPartito(party) * fattore;
  }

  // ---------------------------------------------------------------------------
  // Bilanciamento della lista di spawn richiesta dal Master ([{name/type,count}]).
  // Restituisce { lista, statScale, cr, budget, potenza, intensita }:
  //   - lista: stessi tipi di nemici, ma con "count" e "overrides" (statistiche scalate) ricalcolati
  //     così che la minaccia TOTALE ~ budget, senza mai superare un tetto di nemici per PG vivo
  //     (niente sciami) e con almeno 1 nemico.
  //   - statScale: fattore < 1 applicato quando anche col minimo di nemici si sfora il budget
  //     (nemici indeboliti invece di rimossi), > 1 quando il party è forte e i nemici vanno gonfiati.
  // pesiPerTipo: mappa id/nome -> CR (dal bestiario). Se assente, si assume CR 1/4.
  // ---------------------------------------------------------------------------
  function bilancia(listaRichiesta, party, opzioni) {
    opzioni = opzioni || {};
    var intensita = opzioni.intensita || "equo";
    var bestiario = opzioni.bestiario || [];
    var vivi = Array.isArray(party) ? party.filter(function (p) { return intero(p && p.hpCur, 1) > 0; }).length : 1;
    vivi = Math.max(1, vivi);

    var budget = budgetSfida(party, intensita);
    var potenza = potenzaPartito(party);

    // Normalizza la lista in ingresso e assegna a ciascun tipo il suo peso di minaccia unitario.
    var tipi = (Array.isArray(listaRichiesta) ? listaRichiesta : [listaRichiesta]).filter(Boolean).map(function (e) {
      var nome = e.name || e.type || e.id || "";
      var cr = crPerNome(nome, bestiario);
      return {
        name: nome,
        countRichiesto: Math.max(1, intero(e.count, 1)),
        cr: cr,
        pesoUnitario: pesoDaCr(cr)
      };
    });
    if (!tipi.length) { return { lista: [], statScale: 1, cr: 0, budget: budget, potenza: potenza, intensita: intensita }; }

    // Tetto di nemici: non più di ~3 per PG vivo (evita l'accerchiamento ingiocabile), e comunque
    // non più di quanti ne ha chiesti il Master. Minimo 1.
    var tettoTotale = Math.max(1, vivi * 3);
    var chiestoTotale = tipi.reduce(function (s, t) { return s + t.countRichiesto; }, 0);
    var minacciaRichiesta = tipi.reduce(function (s, t) { return s + t.countRichiesto * t.pesoUnitario; }, 0);

    // 1) Riduci le QUANTITA' proporzionalmente finché la minaccia sta nel budget e nel tetto.
    var scalaCount = Math.min(1, budget / Math.max(1, minacciaRichiesta), tettoTotale / Math.max(1, chiestoTotale));
    var lista = tipi.map(function (t) {
      var count = Math.max(1, Math.round(t.countRichiesto * scalaCount));
      return { name: t.name, count: count, cr: t.cr, pesoUnitario: t.pesoUnitario };
    });

    // Applica il tetto duro sul totale (arrotondamenti possono farlo sforare di poco).
    lista = applicaTetto(lista, tettoTotale);

    // 2) Con le quantità minime (già ridotte), quanta minaccia resta? Se ancora sopra budget, NON
    //    si tolgono altri nemici (avremmo sotto-scontri banali di 0-1 mostri): si INDEBOLISCONO
    //    (statScale < 1). Se invece siamo molto sotto budget, si RINFORZANO (statScale > 1).
    var minacciaAttuale = lista.reduce(function (s, t) { return s + t.count * t.pesoUnitario; }, 0);
    var statScale = clamp(budget / Math.max(1, minacciaAttuale), 0.5, 1.6);

    // Traduci statScale in override concreti per lo spawn (HP e offesa scalati; niente di sotto a 1).
    lista.forEach(function (t) {
      t.overrides = overridesDaScala(t, statScale, bestiario);
      delete t.pesoUnitario; // dettaglio interno, fuori dal risultato pubblico
    });

    var crMedio = lista.reduce(function (s, t) { return s + pesoDaCr(t.cr) * t.count; }, 0);
    return {
      lista: lista, statScale: round2(statScale),
      cr: round2(crMedio), budget: round2(budget), potenza: round2(potenza),
      intensita: intensita, nemiciTotali: lista.reduce(function (s, t) { return s + t.count; }, 0)
    };
  }

  function overridesDaScala(tipo, statScale, bestiario) {
    var tmpl = templatePerNome(tipo.name, bestiario);
    if (!tmpl || Math.abs(statScale - 1) < 0.06) { return null; } // scala ~1: nessun override
    var hp = Math.max(1, Math.round((tmpl.hitPoints || 1) * statScale));
    // L'offesa scala in modo più tenue degli HP (radice), per non trasformare un goblin gonfiato in
    // un one-shot: il modificatore di danno cambia di ±1/±2, il bonus attacco di ±1.
    var deltaAttacco = Math.round((statScale - 1) * 2);
    var deltaDanno = Math.round((statScale - 1) * 3);
    return {
      hitPoints: hp,
      maxHitPoints: hp,
      attackBonus: (tmpl.attackBonus || 0) + deltaAttacco,
      damageBonusDelta: deltaDanno
    };
  }

  // ---------------------------------------------------------------------------
  // Lettura del party reale dal gioco: roster hotseat (window.partyData) + progressione (modulo 15)
  // per i livelli; fallback al solo PG locale dallo state manager / combat state.
  // ---------------------------------------------------------------------------
  function partyCorrente() {
    var roster = window.partyData;
    if (Array.isArray(roster) && roster.length) {
      return roster.map(function (m) {
        var hp = m && m.resources && m.resources.hp ? m.resources.hp : {};
        return {
          id: m && m.identity && m.identity.id,
          level: livelloDi(m),
          hpMax: intero(hp.max, 10),
          hpCur: intero(hp.current, intero(hp.max, 10))
        };
      });
    }
    // Fallback: PG locale.
    try {
      var s = window.UltimateVTTState.getState();
      return [{
        id: s.identity.id,
        level: intero(s.identity.level, 1),
        hpMax: intero(s.resources.hp.max, 10),
        hpCur: intero(s.resources.hp.current, 10)
      }];
    } catch (e) {
      return [{ level: 1, hpMax: 10, hpCur: 10 }];
    }
  }

  function livelloDi(membro) {
    // La progressione (modulo 15) è la fonte autorevole del livello; identity.level è il fallback.
    try {
      var P = window.VTTXpLoot || window.UltimateVTTProgression;
      var id = membro && membro.identity && membro.identity.id;
      if (P && typeof P.getProg === "function" && id) {
        var prog = P.getProg(id);
        if (prog && prog.level) { return prog.level; }
      }
    } catch (e) { /* fallback sotto */ }
    return intero(membro && membro.identity && membro.identity.level, 1);
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------
  function intero(v, def) { var n = parseInt(v, 10); return isFinite(n) ? n : def; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round2(v) { return Math.round(v * 100) / 100; }

  function crPerNome(nome, bestiario) {
    var t = templatePerNome(nome, bestiario);
    return t ? t.challenge : "1/4";
  }
  function templatePerNome(nome, bestiario) {
    var n = String(nome || "").toLowerCase().trim();
    var b = bestiario || [];
    for (var i = 0; i < b.length; i++) { if (b[i].id === n || b[i].name.toLowerCase() === n) { return b[i]; } }
    for (var j = 0; j < b.length; j++) { if (n && n.indexOf(b[j].name.toLowerCase()) >= 0) { return b[j]; } }
    return null;
  }

  // Rimuove nemici in eccesso rispetto al tetto, uno per volta dai gruppi più numerosi, mai sotto 1.
  function applicaTetto(lista, tetto) {
    var totale = function () { return lista.reduce(function (s, t) { return s + t.count; }, 0); };
    var guardia = 0;
    while (totale() > tetto && guardia++ < 100) {
      var piuGrande = null;
      lista.forEach(function (t) { if (t.count > 1 && (!piuGrande || t.count > piuGrande.count)) { piuGrande = t; } });
      if (!piuGrande) { break; } // tutti a 1: non si può scendere oltre
      piuGrande.count -= 1;
    }
    return lista;
  }

  // ---------------------------------------------------------------------------
  // API pubblica
  // ---------------------------------------------------------------------------
  function bilanciaPerGioco(listaRichiesta) {
    var bestiario = (window.UltimateVTTCombat && window.UltimateVTTCombat.npcCatalog) || [];
    var risultato = bilancia(listaRichiesta, partyCorrente(), { bestiario: bestiario });
    // Pubblica sul Global Game State: un'unica verità che HUD/chat possono leggere.
    try {
      if (window.UltimateVTTGameState) {
        window.UltimateVTTGameState.set("encounter.last", risultato);
        window.UltimateVTTGameState.publish("encounter:balanced", risultato);
      }
    } catch (e) { /* lo store è opzionale */ }
    return risultato;
  }

  window.UltimateVTTEncounterBalancer = {
    // logica pura (testabile)
    potenzaPg: potenzaPg,
    potenzaPartito: potenzaPartito,
    budgetSfida: budgetSfida,
    pesoDaCr: pesoDaCr,
    bilancia: bilancia,
    // lettura del gioco reale + pubblicazione sullo stato
    partyCorrente: partyCorrente,
    bilanciaPerGioco: bilanciaPerGioco
  };

  if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
    try { window.UltimateVTT.registerModule(37, { encounterBalancer: true }); } catch (e) { /* best-effort */ }
  }
  if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
    try { window.UltimateVTT.appendSystemLog("Modulo 37 caricato: Encounter Balancer (scontri bilanciati su party/livelli/HP)."); } catch (e) { /* ignora */ }
  }
})();
// --- FINE MODULO 37 JS: ENCOUNTER BALANCER ---
