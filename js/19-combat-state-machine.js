// --- INIZIO MODULO 19 JS: MACCHINA A STATI DEL COMBATTIMENTO + ACTION ECONOMY ---
// Fase 3 dell'architettura: livello logico.
//
// Stati: FuoriCombattimento, TiroIniziativa, CombattimentoAttivo(turnoId), CombattimentoInPausa(GM).
//
// Il modulo NON reimplementa il combattimento (gia' presente in UltimateVTTCombat): lo avvolge.
//  - Intercetta startCombat / nextTurn / endCombat per pilotare la FSM ed emettere eventi di rete.
//  - Mantiene il "budget di movimento" per combattente (metri = velocita' - movimento gia' speso),
//    azzerato a ogni cambio turno: e' la base per limitare il raggio di trascinamento sulla mappa.
//  - Applica gli eventi inbound (CombattimentoIniziato / TurnoTerminato) ricevuti dal Sync Manager.
//
// Mappatura token <-> combattente (default ragionevole, sovrascrivibile):
//   token-pc      -> pc-local
//   token-npc-N   -> npc-N
(function () {
  "use strict";

  var VELOCITA_DEFAULT_M = 9; // velocita' di riserva quando non ricavabile dalla scheda

  var Stati = {
    FUORI: "OutOfCombat",
    INIZIATIVA: "RollingInitiative",
    ATTIVO: "CombatActive",
    PAUSA: "CombatPaused"
  };

  var fsm = {
    nome: Stati.FUORI,
    turnoId: null,        // id del combattente di turno quando ATTIVO
    round: 0,
    gmOverride: false     // true quando il Master ha messo in pausa
  };

  var budget = {};        // combatantId -> { velocita, usato }
  var mappaTokenOverride = {}; // tokenId -> combatantId (override manuali)
  var ordineAutoritativo = []; // ordine d'iniziativa dettato dal Master (lato giocatore)
  var listeners = [];     // osservatori UI della FSM
  var imposta = {
    enforceMovimento: true // se true il livello mappa limita il movimento dei giocatori
  };

  // ---------------------------------------------------------------------------
  // Utilita'
  // ---------------------------------------------------------------------------
  function log(messaggio) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(messaggio); } catch (e) { /* ignora */ }
    }
    if (window.console && typeof console.debug === "function") { console.debug("[VTT-FSM] " + messaggio); }
  }

  function combatModulo() { return window.UltimateVTTCombat || null; }

  function statoCombat() {
    var m = combatModulo();
    if (!m) { return null; }
    try { return m.getState(); } catch (e) { return null; }
  }

  function applicandoRemoto() {
    return Boolean(window.UltimateVTTSync && window.UltimateVTTSync.staApplicandoRemoto && window.UltimateVTTSync.staApplicandoRemoto());
  }

  function isMaster() {
    return !window.UltimateVTTSync || window.UltimateVTTSync.isMaster();
  }

  function notifica() {
    var snap = getStato();
    listeners.forEach(function (fn) {
      try { fn(snap); } catch (e) { /* ignora */ }
    });
    if (typeof window.CustomEvent === "function") {
      try { window.dispatchEvent(new CustomEvent("vtt-combat-fsm", { detail: snap })); } catch (e) { /* ignora */ }
    }
    // La mappa deve ridisegnare il raggio di movimento quando lo stato cambia.
    if (window.UltimateVTTCanvas && typeof window.UltimateVTTCanvas.requestRender === "function") {
      try { window.UltimateVTTCanvas.requestRender(); } catch (e) { /* ignora */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Mappatura token <-> combattente
  // ---------------------------------------------------------------------------
  function tokenACombattente(tokenId) {
    tokenId = String(tokenId);
    if (mappaTokenOverride[tokenId]) { return mappaTokenOverride[tokenId]; }
    if (tokenId === "token-pc") { return "pc-local"; }
    var m = /^token-npc-(\w+)$/.exec(tokenId);
    if (m) { return "npc-" + m[1]; }
    return null;
  }

  function combattenteAToken(combatantId) {
    combatantId = String(combatantId);
    var chiavi = Object.keys(mappaTokenOverride);
    for (var i = 0; i < chiavi.length; i += 1) {
      if (mappaTokenOverride[chiavi[i]] === combatantId) { return chiavi[i]; }
    }
    if (combatantId === "pc-local") { return "token-pc"; }
    var m = /^npc-(\w+)$/.exec(combatantId);
    if (m) { return "token-npc-" + m[1]; }
    return null;
  }

  function impostaMappaToken(tokenId, combatantId) {
    if (combatantId == null) { delete mappaTokenOverride[String(tokenId)]; }
    else { mappaTokenOverride[String(tokenId)] = String(combatantId); }
  }

  // ---------------------------------------------------------------------------
  // Budget di movimento / action economy
  // ---------------------------------------------------------------------------
  function velocitaDi(combatantId) {
    if (combatantId === "pc-local" && window.UltimateVTTState) {
      try {
        var s = window.UltimateVTTState.getState();
        if (s && s.resources && typeof s.resources.speedMeters === "number") { return s.resources.speedMeters; }
      } catch (e) { /* fallback sotto */ }
    }
    return VELOCITA_DEFAULT_M;
  }

  function ricostruisciBudget() {
    budget = {};
    var st = statoCombat();
    if (!st || !Array.isArray(st.combatants)) { return; }
    st.combatants.forEach(function (c) {
      budget[c.id] = { velocita: velocitaDi(c.id), usato: 0 };
    });
  }

  function clonaLista(lista) {
    try { return JSON.parse(JSON.stringify(lista)); } catch (e) { return Array.isArray(lista) ? lista.slice() : []; }
  }

  // Ricostruisce il budget a partire da un elenco di combattenti esplicito (lato giocatore,
  // dove l'ordine d'iniziativa e' quello dettato dal Master, non quello del combat locale).
  function ricostruisciBudgetDaLista(lista) {
    budget = {};
    (lista || []).forEach(function (c) {
      if (c && c.id != null) { budget[String(c.id)] = { velocita: velocitaDi(String(c.id)), usato: 0 }; }
    });
  }

  function azzeraBudgetTurno(combatantId) {
    if (!combatantId) { return; }
    if (!budget[combatantId]) { budget[combatantId] = { velocita: velocitaDi(combatantId), usato: 0 }; }
    budget[combatantId].usato = 0;
    budget[combatantId].velocita = velocitaDi(combatantId);
    // Mantiene allineata anche l'action economy esistente del PG (UI "Movimento X/Y m").
    if (combatantId === "pc-local" && window.UltimateVTTInventory && typeof window.UltimateVTTInventory.resetTurn === "function") {
      try { window.UltimateVTTInventory.resetTurn(); } catch (e) { /* ignora */ }
    }
  }

  function movimentoResiduo(tokenId) {
    var id = tokenACombattente(tokenId);
    if (!id || !budget[id]) { return Infinity; } // nessun budget noto: non limitare
    return Math.max(0, budget[id].velocita - budget[id].usato);
  }

  function spendiMovimento(tokenId, metri) {
    var id = tokenACombattente(tokenId);
    if (!id || !budget[id] || !(metri > 0)) { return 0; }
    var disponibile = Math.max(0, budget[id].velocita - budget[id].usato);
    var speso = Math.min(disponibile, metri);
    budget[id].usato += speso;
    // Riflette nell'action economy del PG a passi di 3 m (best-effort, non blocca nulla).
    if (id === "pc-local" && window.UltimateVTTInventory && typeof window.UltimateVTTInventory.spendActionResource === "function") {
      try {
        var passi = Math.floor(speso / 3);
        for (var i = 0; i < passi; i += 1) { window.UltimateVTTInventory.spendActionResource("movement"); }
      } catch (e) { /* ignora */ }
    }
    notifica();
    return speso;
  }

  // E' il turno del token indicato? (oppure il Master ha autorita' totale)
  function eIlTurnoDi(tokenId) {
    if (fsm.nome !== Stati.ATTIVO) { return false; }
    var id = tokenACombattente(tokenId);
    return id != null && id === fsm.turnoId;
  }

  // Puo' muovere ORA quel token? Regole: Master sempre; altrimenti deve essere il suo turno,
  // il combattimento attivo e non in pausa.
  function puoMuovereOra(tokenId) {
    if (fsm.nome === Stati.FUORI) { return true; }          // fuori combattimento: libero
    if (fsm.nome === Stati.PAUSA) { return isMaster(); }     // in pausa solo il Master
    if (isMaster()) { return true; }
    return eIlTurnoDi(tokenId);
  }

  // ---------------------------------------------------------------------------
  // Transizioni di stato
  // ---------------------------------------------------------------------------
  function turnoCorrenteId() {
    var st = statoCombat();
    if (!st || !Array.isArray(st.combatants)) { return null; }
    if (st.currentTurnIndex < 0 || st.currentTurnIndex >= st.combatants.length) { return null; }
    return st.combatants[st.currentTurnIndex].id;
  }

  function vaiAStato(nome, extra) {
    fsm.nome = nome;
    extra = extra || {};
    if (Object.prototype.hasOwnProperty.call(extra, "turnoId")) { fsm.turnoId = extra.turnoId; }
    if (Object.prototype.hasOwnProperty.call(extra, "round")) { fsm.round = extra.round; }
    if (Object.prototype.hasOwnProperty.call(extra, "gmOverride")) { fsm.gmOverride = extra.gmOverride; }
    notifica();
  }

  // Allinea la FSM allo stato reale di UltimateVTTCombat dopo una sua mutazione.
  function sincronizzaDaCombat() {
    var st = statoCombat();
    if (!st) { return; }
    if (!st.active) {
      vaiAStato(Stati.FUORI, { turnoId: null, round: 0, gmOverride: false });
      return;
    }
    if (fsm.nome === Stati.PAUSA) { return; } // la pausa e' uno stato della FSM, non di combat
    vaiAStato(Stati.ATTIVO, { turnoId: turnoCorrenteId(), round: st.round });
  }

  // ---------------------------------------------------------------------------
  // Emissione eventi di rete (solo se l'azione e' locale, non un'applicazione remota)
  // ---------------------------------------------------------------------------
  function sync() { return window.UltimateVTTSync || null; }

  function emettiCombattimentoIniziato(attivo) {
    var s = sync();
    if (!s || applicandoRemoto()) { return; }
    var st = statoCombat();
    var combattenti = st && Array.isArray(st.combatants)
      ? st.combatants.map(function (c) { return { id: c.id, name: c.name, initiative: c.initiative }; })
      : [];
    var evento = s.creaEventoCombattimentoIniziato(attivo, turnoCorrenteId(), combattenti);
    evento.payload.round = st ? st.round : 0; // i client allineano anche il numero di round
    s.emetti(evento);
  }

  function emettiTurnoTerminato(daId) {
    var s = sync();
    if (!s || applicandoRemoto()) { return; }
    var st = statoCombat();
    s.emetti(s.creaEventoTurnoTerminato(daId, turnoCorrenteId(), st ? st.round : 0));
  }

  // ---------------------------------------------------------------------------
  // Wrapping dei metodi pubblici di UltimateVTTCombat
  // ---------------------------------------------------------------------------
  function avvolgiCombat() {
    var m = combatModulo();
    if (!m || m.__fsmWrapped) { return; }

    var origStart = m.startCombat;
    var origEnd = m.endCombat;
    var origNext = m.nextTurn;

    m.startCombat = function () {
      vaiAStato(Stati.INIZIATIVA, {});
      var r = origStart.apply(this, arguments);
      ricostruisciBudget();
      sincronizzaDaCombat();
      emettiCombattimentoIniziato(true);
      return r;
    };

    m.endCombat = function () {
      var r = origEnd.apply(this, arguments);
      vaiAStato(Stati.FUORI, { turnoId: null, round: 0, gmOverride: false });
      emettiCombattimentoIniziato(false);
      return r;
    };

    m.nextTurn = function () {
      var daId = turnoCorrenteId();
      var eraAttivo = (statoCombat() || {}).active;
      var r = origNext.apply(this, arguments);
      if (!eraAttivo) {
        // nextTurn() su combattimento spento equivale a startCombat()
        ricostruisciBudget();
      }
      sincronizzaDaCombat();
      azzeraBudgetTurno(turnoCorrenteId());
      emettiTurnoTerminato(daId);
      return r;
    };

    m.__fsmWrapped = true;
  }

  // ---------------------------------------------------------------------------
  // Comandi espliciti della FSM (usati da UI o rete)
  // ---------------------------------------------------------------------------
  function iniziaCombattimento() {
    var m = combatModulo();
    if (m && typeof m.startCombat === "function") { m.startCombat(); }
  }

  function terminaTurno() {
    var m = combatModulo();
    if (m && typeof m.nextTurn === "function") { m.nextTurn(); }
  }

  function terminaCombattimento() {
    var m = combatModulo();
    if (m && typeof m.endCombat === "function") { m.endCombat(); }
  }

  function pausa() {
    if (!isMaster()) { log("Solo il Master puo' mettere in pausa."); return; }
    if (fsm.nome !== Stati.ATTIVO) { return; }
    vaiAStato(Stati.PAUSA, { gmOverride: true });
    var s = sync();
    if (s && !applicandoRemoto()) {
      s.emetti(s.creaEvento(s.TipiEvento.CONTROLLO_COMBATTIMENTO, { azione: "pausa" }));
    }
  }

  function riprendi() {
    if (!isMaster()) { log("Solo il Master puo' riprendere."); return; }
    if (fsm.nome !== Stati.PAUSA) { return; }
    vaiAStato(Stati.ATTIVO, { turnoId: turnoCorrenteId(), gmOverride: false });
    var s = sync();
    if (s && !applicandoRemoto()) {
      s.emetti(s.creaEvento(s.TipiEvento.CONTROLLO_COMBATTIMENTO, { azione: "riprendi" }));
    }
  }

  // ---------------------------------------------------------------------------
  // Applicazione degli eventi inbound dal Sync Manager
  // ---------------------------------------------------------------------------
  function gestisciCombattimentoIniziatoInbound(evento) {
    var p = evento.payload || {};
    // Il Master e' la fonte autorevole: si riallinea solo dal proprio combat locale.
    if (isMaster()) { sincronizzaDaCombat(); return; }

    // Lato giocatore: l'ordine d'iniziativa e lo stato dei turni sono DETTATI dal Master.
    // Non si pilota il combat locale con euristiche (eviterebbe desync sull'ordine).
    if (Array.isArray(p.combattenti) && p.combattenti.length) {
      ordineAutoritativo = clonaLista(p.combattenti);
      ricostruisciBudgetDaLista(ordineAutoritativo);
    }
    if (p.attivo) {
      var round = typeof p.round === "number" ? p.round : fsm.round;
      vaiAStato(Stati.ATTIVO, { turnoId: p.turnoCorrenteId != null ? String(p.turnoCorrenteId) : null, round: round, gmOverride: false });
      azzeraBudgetTurno(p.turnoCorrenteId != null ? String(p.turnoCorrenteId) : null);
    } else {
      vaiAStato(Stati.FUORI, { turnoId: null, round: 0, gmOverride: false });
    }
  }

  function gestisciTurnoTerminatoInbound(evento) {
    var p = evento.payload || {};
    // Il Master e' autorevole: si riallinea dal combat locale.
    if (isMaster()) { sincronizzaDaCombat(); return; }

    // Lato giocatore: il nuovo turno corrente e' quello indicato dal Master (payload.a).
    var nuovo = p.a != null ? String(p.a) : turnoCorrenteId();
    var round = typeof p.round === "number" ? p.round : fsm.round;
    vaiAStato(Stati.ATTIVO, { turnoId: nuovo, round: round, gmOverride: false });
    azzeraBudgetTurno(nuovo);
  }

  function gestisciControlloInbound(evento) {
    if (evento.payload.azione === "pausa") { vaiAStato(Stati.PAUSA, { gmOverride: true }); }
    else if (evento.payload.azione === "riprendi") { vaiAStato(Stati.ATTIVO, { turnoId: turnoCorrenteId(), gmOverride: false }); }
  }

  // Idratazione a partita in corso (Fase 2 del multiplayer): un giocatore che entra a metà
  // riceve lo snapshot autorevole dal Master e allinea la FSM dei turni + il budget di movimento.
  // Lo chiama il Sync Manager (modulo 18) dopo aver idratato stato del PG e posizioni dei token.
  function applicaSnapshot(snap) {
    if (!snap || typeof snap !== "object") { return; }
    if (isMaster()) { return; } // il Master e' la fonte autorevole: non si auto-idrata

    var fsmSnap = snap.combattimentoFsm || null;
    var combat = snap.combattimento || null;

    // Ordine d'iniziativa autorevole: dal combat del Master (preferito) o dallo snapshot FSM.
    var combattenti = (combat && Array.isArray(combat.combatants) && combat.combatants.length)
      ? combat.combatants
      : (fsmSnap && Array.isArray(fsmSnap.ordine) ? fsmSnap.ordine : []);
    if (combattenti && combattenti.length) {
      ordineAutoritativo = clonaLista(combattenti);
      ricostruisciBudgetDaLista(ordineAutoritativo);
    }

    if (fsmSnap) {
      // Idrata direttamente lo stato della FSM così com'è sul Master.
      var round = typeof fsmSnap.round === "number" ? fsmSnap.round : fsm.round;
      if (fsmSnap.nome === Stati.ATTIVO) {
        vaiAStato(Stati.ATTIVO, { turnoId: fsmSnap.turnoId != null ? String(fsmSnap.turnoId) : null, round: round, gmOverride: false });
        azzeraBudgetTurno(fsmSnap.turnoId != null ? String(fsmSnap.turnoId) : null);
      } else if (fsmSnap.nome === Stati.PAUSA) {
        vaiAStato(Stati.PAUSA, { turnoId: fsmSnap.turnoId != null ? String(fsmSnap.turnoId) : null, round: round, gmOverride: true });
      } else {
        vaiAStato(Stati.FUORI, { turnoId: null, round: 0, gmOverride: false });
      }
      // Ripristina il movimento già speso nel turno corrente, se noto.
      if (fsmSnap.budget && typeof fsmSnap.budget === "object") {
        Object.keys(fsmSnap.budget).forEach(function (id) {
          var voce = fsmSnap.budget[id];
          if (!budget[id]) { budget[id] = { velocita: velocitaDi(id), usato: 0 }; }
          if (voce && typeof voce.usato === "number") { budget[id].usato = voce.usato; }
          if (voce && typeof voce.velocita === "number") { budget[id].velocita = voce.velocita; }
        });
        notifica();
      }
    } else if (combat) {
      // Nessuno snapshot FSM: deduci lo stato dei turni dal combat del Master.
      if (combat.active) {
        var idx = combat.currentTurnIndex;
        var tid = (idx >= 0 && Array.isArray(combat.combatants) && combat.combatants[idx]) ? combat.combatants[idx].id : null;
        vaiAStato(Stati.ATTIVO, { turnoId: tid != null ? String(tid) : null, round: combat.round || 0, gmOverride: false });
        azzeraBudgetTurno(tid != null ? String(tid) : null);
      } else {
        vaiAStato(Stati.FUORI, { turnoId: null, round: 0, gmOverride: false });
      }
    }
    log("FSM idratata dallo snapshot del Master (turno=" + fsm.turnoId + ", round=" + fsm.round + ").");
  }

  function registraAscolti() {
    var s = sync();
    if (!s) { return; }
    s.inAscolto(s.TipiEvento.COMBATTIMENTO_INIZIATO, gestisciCombattimentoIniziatoInbound);
    s.inAscolto(s.TipiEvento.TURNO_TERMINATO, gestisciTurnoTerminatoInbound);
    s.inAscolto(s.TipiEvento.CONTROLLO_COMBATTIMENTO, gestisciControlloInbound);
  }

  // ---------------------------------------------------------------------------
  // API pubblica
  // ---------------------------------------------------------------------------
  function getStato() {
    var id = fsm.turnoId;
    return {
      nome: fsm.nome,
      turnoId: id,
      tokenDiTurno: id ? combattenteAToken(id) : null,
      round: fsm.round,
      gmOverride: fsm.gmOverride,
      enforceMovimento: imposta.enforceMovimento,
      budget: JSON.parse(JSON.stringify(budget))
    };
  }

  function subscribe(fn) {
    if (typeof fn !== "function") { return function () {}; }
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
  }

  function impostaEnforceMovimento(valore) { imposta.enforceMovimento = Boolean(valore); }

  function inizializza() {
    avvolgiCombat();
    registraAscolti();
    sincronizzaDaCombat();
    log("Modulo 19 caricato: macchina a stati del combattimento + action economy.");
  }

  window.UltimateVTTCombatFSM = {
    Stati: Stati,
    getStato: getStato,
    subscribe: subscribe,
    // comandi
    iniziaCombattimento: iniziaCombattimento,
    terminaTurno: terminaTurno,
    terminaCombattimento: terminaCombattimento,
    pausa: pausa,
    riprendi: riprendi,
    // budget / regole movimento
    movimentoResiduo: movimentoResiduo,
    spendiMovimento: spendiMovimento,
    eIlTurnoDi: eIlTurnoDi,
    puoMuovereOra: puoMuovereOra,
    impostaEnforceMovimento: impostaEnforceMovimento,
    // mappatura
    tokenACombattente: tokenACombattente,
    combattenteAToken: combattenteAToken,
    impostaMappaToken: impostaMappaToken,
    // idratazione a partita in corso (chiamata dal Sync Manager)
    applicaSnapshot: applicaSnapshot,
    // utile per la mappa
    statiPossibili: Stati
  };

  if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
    try {
      window.UltimateVTT.registerModule(19, {
        combatStateMachine: true,
        stati: Object.keys(Stati).length,
        actionEconomy: true
      });
    } catch (e) { /* best-effort */ }
  }

  // Avvio quando il DOM e gli altri moduli sono pronti.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 19 JS: MACCHINA A STATI DEL COMBATTIMENTO + ACTION ECONOMY ---
