// --- INIZIO MODULO 24 JS: ATTACCHI DI OPPORTUNITA' / REAZIONI (stile BG3 / D&D 5e) ---
// Quando un combattente esce dalla portata in mischia (cella adiacente) di un nemico che ha
// ancora la reazione disponibile, quel nemico effettua un ATTACCO DI OPPORTUNITA'.
//
// Non modifica i moduli di gioco: usa solo i loro global (UltimateVTTCombat per le primitive di
// tiro/danno, UltimateVTTTokenPhysics per le posizioni, UltimateVTTCombatFSM per la mappatura
// token<->combattente, UltimateVTTInventory per la reazione del PG). Rileva i movimenti per polling
// leggero (come gia' fanno i moduli XP e HUD), perche' il modulo token non emette eventi.
//
// La logica decisionale e' una FUNZIONE PURA (attacchiOpportunita) testata a parte; il runtime fa
// solo da collante.
(function () {
  "use strict";

  var INTERVALLO_MS = 180;

  function combat() { return window.UltimateVTTCombat || null; }
  function physics() { return window.UltimateVTTTokenPhysics || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }
  function inventory() { return window.UltimateVTTInventory || null; }

  function log(m) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
  }
  function annuncia(m) {
    log(m);
    if (window.UltimateVTTCoreGameplay && typeof window.UltimateVTTCoreGameplay.appendChatMessage === "function") {
      try { window.UltimateVTTCoreGameplay.appendChatMessage("system", m); return; } catch (e) { /* ignora */ }
    }
    if (window.UltimateVTTMasterChat && typeof window.UltimateVTTMasterChat.appendSystemMessage === "function") {
      try { window.UltimateVTTMasterChat.appendSystemMessage(m); } catch (e) { /* ignora */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Geometria della portata in mischia
  // ---------------------------------------------------------------------------
  function chebyshev(a, b) { return Math.max(Math.abs(a.cellX - b.cellX), Math.abs(a.cellY - b.cellY)); }
  function inPortata(a, b) { return Boolean(a && b) && chebyshev(a, b) <= 1; } // adiacente (incl. diagonali) o stessa cella

  function trovaComb(combattenti, id) {
    for (var i = 0; i < (combattenti || []).length; i += 1) { if (combattenti[i].id === id) { return combattenti[i]; } }
    return null;
  }

  // ---------------------------------------------------------------------------
  // FUNZIONE PURA: chi effettua un attacco di opportunita' quando 'moverId' va da partenza ad arrivo?
  //   opts = {
  //     moverId, partenza:{cellX,cellY}, arrivo:{cellX,cellY},
  //     combattenti: [{ id, kind:'pc'|'npc', defeated }],
  //     posizioni: { combatantId: {cellX,cellY} },   // posizioni correnti (i minaccianti non si muovono)
  //     reazioneDisponibile: function(id) -> bool
  //   }
  // Restituisce l'elenco degli id che reagiscono. Regole: fazione opposta, vivo, era in portata della
  // cella di PARTENZA e NON lo e' piu' di quella d'ARRIVO, con reazione disponibile.
  // ---------------------------------------------------------------------------
  function attacchiOpportunita(opts) {
    var out = [];
    if (!opts || !opts.moverId || !opts.partenza || !opts.arrivo) { return out; }
    var mover = trovaComb(opts.combattenti, opts.moverId);
    if (!mover) { return out; }
    // Se il movimento non cambia cella, nessuna opportunita'.
    if (opts.partenza.cellX === opts.arrivo.cellX && opts.partenza.cellY === opts.arrivo.cellY) { return out; }

    (opts.combattenti || []).forEach(function (c) {
      if (!c || c.id === opts.moverId || c.defeated) { return; }
      if (c.kind === mover.kind) { return; } // stessa fazione: niente attacco di opportunita'
      var pos = opts.posizioni ? opts.posizioni[c.id] : null;
      if (!pos) { return; }
      var minacciavaPartenza = inPortata(pos, opts.partenza);
      var minacciaAncora = inPortata(pos, opts.arrivo);
      if (minacciavaPartenza && !minacciaAncora) {
        if (typeof opts.reazioneDisponibile === "function" && !opts.reazioneDisponibile(c.id)) { return; }
        out.push(c.id);
      }
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Mappatura token <-> combattente (preferisce la FSM, con fallback euristico)
  // ---------------------------------------------------------------------------
  function tokenAComb(tokenId) {
    var f = fsm();
    if (f && typeof f.tokenACombattente === "function") { var r = f.tokenACombattente(tokenId); if (r) { return r; } }
    if (tokenId === "token-pc") { return "pc-local"; }
    var m = /^token-npc-(\w+)$/.exec(tokenId); if (m) { return "npc-" + m[1]; }
    return null;
  }
  function combAToken(combId) {
    var f = fsm();
    if (f && typeof f.combattenteAToken === "function") { var r = f.combattenteAToken(combId); if (r) { return r; } }
    if (combId === "pc-local") { return "token-pc"; }
    var m = /^npc-(\w+)$/.exec(combId); if (m) { return "token-npc-" + m[1]; }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Reazione disponibile / consumo (PG via action economy del modulo 05; PNG via set interno)
  // ---------------------------------------------------------------------------
  var reazioniUsate = {}; // id PNG -> true (azzerato a ogni round)

  function reazioneDisponibile(id) {
    if (id === "pc-local") {
      var inv = inventory();
      try { return Boolean(inv && inv.getState && inv.getState().actionEconomy.reaction); } catch (e) { return true; }
    }
    return !reazioniUsate[id];
  }
  function consumaReazione(id) {
    if (id === "pc-local") {
      var inv = inventory();
      try { if (inv && typeof inv.spendActionResource === "function") { inv.spendActionResource("reaction"); } } catch (e) { /* ignora */ }
    } else {
      reazioniUsate[id] = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Risoluzione di un singolo attacco di opportunita' (usa le primitive del modulo 06)
  // ---------------------------------------------------------------------------
  function risolviAttacco(threatenerId, moverId) {
    var C = combat();
    if (!C) { return; }
    var st = C.getState();
    var T = trovaComb(st.combatants, threatenerId);
    var M = trovaComb(st.combatants, moverId);
    if (!T || !M || M.defeated) { return; }

    var roll = C.rollD20WithMode("normal");
    var totale = roll.chosen + (T.attackBonus || 0);
    var crit = Boolean(roll.naturalTwenty);
    var autoMiss = Boolean(roll.naturalOne);
    var ca = typeof M.armorClass === "number" ? M.armorClass : 10;
    var colpito = !autoMiss && (crit || totale >= ca);

    if (colpito) {
      var dmg = C.rollDamageFormula(T.damageFormula || "1d4", crit);
      if (typeof C.applyDamageToCombatant === "function") { C.applyDamageToCombatant(M.id, dmg.total); }
      annuncia("⚡ Attacco di opportunità: " + T.name + " colpisce " + M.name +
        " (" + totale + " vs CA " + ca + ") per " + dmg.total + " danni" + (crit ? " — CRITICO" : "") + ".");
    } else {
      annuncia("⚡ Attacco di opportunità: " + T.name + " manca " + M.name + " (" + totale + " vs CA " + ca + ").");
    }
  }

  // ---------------------------------------------------------------------------
  // Runtime: rilevamento movimenti per polling + innesco degli attacchi di opportunita'
  // ---------------------------------------------------------------------------
  var cellaRiposo = {};  // tokenId -> {cellX,cellY} quando il token NON e' trascinato
  var ultimoRound = 0;
  var eraAttivo = false;
  var abilitato = true;
  var timer = null;

  function statoCombat() { var c = combat(); if (!c || !c.getState) { return null; } try { return c.getState(); } catch (e) { return null; } }
  function statoToken() { var p = physics(); if (!p || !p.getState) { return null; } try { return p.getState(); } catch (e) { return null; } }

  function posizioniCombattenti(stTok, combattenti) {
    var pos = {};
    var perToken = {};
    (stTok.tokens || []).forEach(function (t) { perToken[t.id] = t; });
    (combattenti || []).forEach(function (c) {
      var tk = combAToken(c.id);
      var t = tk ? perToken[tk] : null;
      if (t) { pos[c.id] = { cellX: t.cellX, cellY: t.cellY }; }
    });
    return pos;
  }

  function inizializzaRiposo(stTok) {
    cellaRiposo = {};
    (stTok.tokens || []).forEach(function (t) { cellaRiposo[t.id] = { cellX: t.cellX, cellY: t.cellY }; });
  }

  function tick() {
    var stTok = statoToken();
    if (!stTok) { return; }
    var stCmb = statoCombat();
    var attivo = Boolean(stCmb && stCmb.active);

    // Transizioni di combattimento: alla partenza azzera reazioni e riallinea le celle di riposo.
    if (attivo && !eraAttivo) {
      reazioniUsate = {};
      ultimoRound = stCmb.round || 0;
      inizializzaRiposo(stTok);
    }
    eraAttivo = attivo;

    // Le reazioni si rinnovano a ogni nuovo round.
    if (attivo && stCmb.round !== ultimoRound) { reazioniUsate = {}; ultimoRound = stCmb.round; }

    var dragId = stTok.dragTokenId;

    (stTok.tokens || []).forEach(function (t) {
      if (t.id === dragId) { return; } // movimento in corso: si valuta solo a rilascio
      var corrente = { cellX: t.cellX, cellY: t.cellY };
      var riposo = cellaRiposo[t.id];
      if (!riposo) { cellaRiposo[t.id] = corrente; return; } // prima osservazione: inizializza senza innescare
      if (riposo.cellX === corrente.cellX && riposo.cellY === corrente.cellY) { return; } // fermo

      // Il token si e' spostato da 'riposo' a 'corrente'.
      if (abilitato && attivo) { valutaMovimento(t.id, riposo, corrente, stCmb, stTok); }
      cellaRiposo[t.id] = corrente;
    });
  }

  function valutaMovimento(tokenId, partenza, arrivo, stCmb, stTok) {
    var moverId = tokenAComb(tokenId);
    if (!moverId) { return; }
    var mover = trovaComb(stCmb.combatants, moverId);
    if (!mover || mover.defeated) { return; }

    var reattori = attacchiOpportunita({
      moverId: moverId,
      partenza: partenza,
      arrivo: arrivo,
      combattenti: stCmb.combatants,
      posizioni: posizioniCombattenti(stTok, stCmb.combatants),
      reazioneDisponibile: reazioneDisponibile
    });

    reattori.forEach(function (id) {
      // Rivaluta lo stato vivo del mover dopo ogni colpo (potrebbe cadere a metà sequenza).
      var st = statoCombat();
      var m = st ? trovaComb(st.combatants, moverId) : null;
      if (!m || m.defeated) { return; }
      consumaReazione(id);
      risolviAttacco(id, moverId);
    });
  }

  // ---------------------------------------------------------------------------
  // Avvio + API
  // ---------------------------------------------------------------------------
  function inizializza() {
    if (!window.document) { return; }
    if (!timer) { timer = window.setInterval(tick, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(24, { opportunityAttacks: true, reactions: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 24 caricato: attacchi di opportunità / reazioni (stile BG3).");
  }

  window.UltimateVTTReactions = {
    // logica pura (testabile)
    attacchiOpportunita: attacchiOpportunita,
    inPortata: inPortata,
    chebyshev: chebyshev,
    // controllo
    impostaAbilitato: function (v) { abilitato = Boolean(v); },
    eAbilitato: function () { return abilitato; },
    reazioneDisponibile: reazioneDisponibile,
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } },
    // utile ai test: forza una valutazione manuale
    _valutaMovimento: function (tokenId, partenza, arrivo) {
      var stCmb = statoCombat(), stTok = statoToken();
      if (stCmb && stTok) { valutaMovimento(tokenId, partenza, arrivo, stCmb, stTok); }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 24 JS: ATTACCHI DI OPPORTUNITA' / REAZIONI ---
