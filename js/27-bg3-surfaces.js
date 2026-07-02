// --- INIZIO MODULO 27 JS: SUPERFICI (fuoco, veleno — stile BG3) ---
// Aree del campo di battaglia che infliggono danno a chiunque vi si trovi all'inizio di ogni round,
// e scadono dopo un numero fisso di round. Progettato GM-autorevole FIN DA SUBITO (lezione imparata
// dai moduli 24/26: le mutazioni condivise devono risolversi solo sul Master, altrimenti ogni client
// tirerebbe dadi propri e non sincronizzati). Non modifica nessun modulo esistente: usa le primitive
// di UltimateVTTCombat (danno), UltimateVTTTokenPhysics (posizioni), UltimateVTTCombatFSM (mappatura
// token<->combattente + round sincronizzato), UltimateVTTCanvas (overlay) e UltimateVTTSync (rete).
//
// Ambito volutamente limitato: solo danno periodico (fuoco/veleno), niente condizioni (il gioco non
// ha ancora uno stato "avvelenato"/"in fiamme" persistente oltre il danno) e niente propagazione
// dinamica delle superfici (es. il fuoco che si estende su erba), entrambe estensioni future.
(function () {
  "use strict";

  var INTERVALLO_MS = 300;
  var DURATA_DEFAULT = { fuoco: 3, veleno: 2 };
  var FORMULA_DANNO = { fuoco: "1d4", veleno: "1d4" };
  var COLORE_RGB = { fuoco: "224,96,58", veleno: "123,196,90" };

  function combat() { return window.UltimateVTTCombat || null; }
  function physics() { return window.UltimateVTTTokenPhysics || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }
  function canvas() { return window.UltimateVTTCanvas || null; }
  function sync() { return window.UltimateVTTSync || null; }

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

  // Solo il Master crea/risolve le superfici in multiplayer (stesso pattern dei moduli 19/24/26).
  function isMasterOrSolo() { return !window.UltimateVTTSync || window.UltimateVTTSync.isMaster(); }

  // ---------------------------------------------------------------------------
  // Stato locale: elenco delle superfici attive. Il round di riferimento e' quello della FSM (23/19),
  // l'UNICO tenuto sincronizzato su tutti i ruoli — il round locale di UltimateVTTCombat NON lo e'
  // per i client giocatore (che non rieseguono nextTurn in locale, solo la FSM riceve l'evento).
  // ---------------------------------------------------------------------------
  var superfici = [];
  var prossimoId = 1;
  var dannoDatoPerRound = {}; // "supId:round" -> true, evita di applicare il danno piu' volte a round

  function roundCorrente() {
    var f = fsm();
    if (f && typeof f.getStato === "function") {
      try { var s = f.getStato(); if (typeof s.round === "number") { return s.round; } } catch (e) { /* fallback sotto */ }
    }
    var c = combat();
    if (c && typeof c.getState === "function") {
      try { return c.getState().round || 0; } catch (e) { /* ignora */ }
    }
    return 0;
  }

  // ---------------------------------------------------------------------------
  // FUNZIONI PURE (testabili)
  // ---------------------------------------------------------------------------
  function chebyshev(a, b) { return Math.max(Math.abs(a.cellX - b.cellX), Math.abs(a.cellY - b.cellY)); }
  function eDentro(superficie, cella) { return chebyshev(superficie, cella) <= superficie.raggio; }
  function eScaduta(superficie, roundAttuale) { return (roundAttuale - superficie.creataAlRound) >= superficie.durataRound; }
  function formulaDanno(tipo) { return FORMULA_DANNO[tipo] || "1d4"; }
  function durataDefault(tipo) { return DURATA_DEFAULT[tipo] || 2; }

  // ---------------------------------------------------------------------------
  // Mappatura token <-> combattente (stesso pattern dei moduli 24/25/26)
  // ---------------------------------------------------------------------------
  function combAToken(combId) {
    var f = fsm();
    if (f && typeof f.combattenteAToken === "function") { var r = f.combattenteAToken(combId); if (r) { return r; } }
    if (combId === "pc-local") { return "token-pc"; }
    var m = /^npc-(\w+)$/.exec(combId); if (m) { return "token-npc-" + m[1]; }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Creazione (GM-autorevole) + applicazione inbound (identica sui client non-Master)
  // ---------------------------------------------------------------------------
  function creaSuperficieLocale(tipo, cellX, cellY, raggio, durataRound, id, creataAlRound) {
    var s = {
      id: id || ("sup-" + (prossimoId++)),
      tipo: tipo === "veleno" ? "veleno" : "fuoco",
      cellX: Math.trunc(cellX) || 0,
      cellY: Math.trunc(cellY) || 0,
      raggio: Math.max(0, Math.trunc(raggio) || 0),
      durataRound: Math.max(1, Math.trunc(durataRound) || durataDefault(tipo)),
      creataAlRound: typeof creataAlRound === "number" ? creataAlRound : roundCorrente()
    };
    superfici.push(s);
    var cv = canvas();
    if (cv && typeof cv.requestRender === "function") { try { cv.requestRender(); } catch (e) { /* ignora */ } }
    return s;
  }

  function creaSuperficie(tipo, cellX, cellY, raggio, durataRound) {
    if (!isMasterOrSolo()) {
      var msg = "Solo il Master può creare superfici in una sessione multiplayer.";
      annuncia("🔥 " + msg);
      return { ok: false, message: msg };
    }
    var s = creaSuperficieLocale(tipo, cellX, cellY, raggio, durataRound);
    annuncia((s.tipo === "fuoco" ? "🔥 Superficie di fuoco" : "☠️ Superficie di veleno") +
      " creata in (" + s.cellX + "," + s.cellY + "), raggio " + s.raggio + ", " + s.durataRound + " round.");

    var S = sync();
    if (S && typeof S.emetti === "function" && typeof S.creaEvento === "function" && S.TipiEvento) {
      try {
        S.emetti(S.creaEvento(S.TipiEvento.SUPERFICIE_CREATA, {
          id: s.id, tipo: s.tipo, cellX: s.cellX, cellY: s.cellY,
          raggio: s.raggio, durataRound: s.durataRound, creataAlRound: s.creataAlRound
        }));
      } catch (e) { /* la superficie resta comunque valida in locale */ }
    }
    return { ok: true, superficie: s };
  }

  function gestisciSuperficieInbound(evento) {
    var p = evento.payload || {};
    if (!p.tipo || typeof p.cellX !== "number" || typeof p.cellY !== "number") { return; }
    if (p.id && superfici.some(function (s) { return s.id === p.id; })) { return; } // gia' presente
    creaSuperficieLocale(p.tipo, p.cellX, p.cellY, p.raggio, p.durataRound, p.id, p.creataAlRound);
  }

  // ---------------------------------------------------------------------------
  // Pulizia delle superfici scadute (sicura su ogni client: decisione puramente basata sul round
  // sincronizzato della FSM, nessuna mutazione di stato condiviso, nessun evento di rete necessario).
  // ---------------------------------------------------------------------------
  function pulisciScadute() {
    var r = roundCorrente();
    var vive = [];
    var rimosse = [];
    superfici.forEach(function (s) { if (eScaduta(s, r)) { rimosse.push(s.id); } else { vive.push(s); } });
    if (rimosse.length) {
      superfici = vive;
      rimosse.forEach(function (id) {
        Object.keys(dannoDatoPerRound).forEach(function (k) { if (k.indexOf(id + ":") === 0) { delete dannoDatoPerRound[k]; } });
      });
      var cv = canvas();
      if (cv && typeof cv.requestRender === "function") { try { cv.requestRender(); } catch (e) { /* ignora */ } }
    }
  }

  // ---------------------------------------------------------------------------
  // Tick del danno: SOLO sul Master (o in single-player). Applica il danno una volta per round a
  // ogni combattente vivo la cui posizione ricade in una superficie ancora attiva.
  // ---------------------------------------------------------------------------
  function combattentiIn(superficie, stCmb, stTok) {
    var risultato = [];
    var perToken = {};
    (stTok.tokens || []).forEach(function (t) { perToken[t.id] = t; });
    (stCmb.combatants || []).forEach(function (c) {
      if (c.defeated) { return; }
      var tk = combAToken(c.id);
      var t = tk ? perToken[tk] : null;
      if (t && eDentro(superficie, { cellX: t.cellX, cellY: t.cellY })) { risultato.push(c); }
    });
    return risultato;
  }

  function applicaTickDanno() {
    var C = combat();
    if (!C || typeof C.getState !== "function" || !superfici.length) { return; }
    var stCmb; try { stCmb = C.getState(); } catch (e) { return; }
    if (!stCmb.active) { return; }
    var P = physics();
    if (!P || typeof P.getState !== "function") { return; }
    var stTok; try { stTok = P.getState(); } catch (e) { return; }

    var r = roundCorrente();
    superfici.forEach(function (s) {
      if (eScaduta(s, r)) { return; }
      var chiave = s.id + ":" + r;
      if (dannoDatoPerRound[chiave]) { return; } // gia' applicato in questo round
      var colpiti = combattentiIn(s, stCmb, stTok);
      if (!colpiti.length) { return; }
      dannoDatoPerRound[chiave] = true;
      colpiti.forEach(function (c) {
        var dmg = C.rollDamageFormula(formulaDanno(s.tipo), false);
        if (typeof C.applyDamageToCombatant === "function") { C.applyDamageToCombatant(c.id, dmg.total); }
        annuncia((s.tipo === "fuoco" ? "🔥 " : "☠️ ") + c.name + " subisce " + dmg.total +
          " danni da " + (s.tipo === "fuoco" ? "fuoco" : "veleno") + ".");
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Overlay canvas (stesso pattern del raggio di movimento nel modulo 20)
  // ---------------------------------------------------------------------------
  function disegnaSuperfici(rendererContext) {
    var ctx = rendererContext && rendererContext.context;
    if (!ctx || !superfici.length) { return; }
    var cv = canvas();
    var metriche = (cv && typeof cv.getGridMetrics === "function") ? cv.getGridMetrics() : { gridSize: 48 };
    var g = metriche.gridSize || 48;
    var scala = (rendererContext.mapState && rendererContext.mapState.viewport) ? rendererContext.mapState.viewport.scale : 1;

    superfici.forEach(function (s) {
      var centro = (cv && typeof cv.cellToWorldCenter === "function")
        ? cv.cellToWorldCenter(s.cellX, s.cellY)
        : { x: s.cellX * g + g / 2, y: s.cellY * g + g / 2 };
      var raggioPx = (s.raggio + 0.5) * g;
      var rgb = COLORE_RGB[s.tipo] || COLORE_RGB.fuoco;

      ctx.save();
      ctx.beginPath();
      ctx.arc(centro.x, centro.y, raggioPx, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + rgb + ",0.22)";
      ctx.fill();
      ctx.lineWidth = 2 / Math.max(scala, 0.01);
      if (ctx.setLineDash) { ctx.setLineDash([5, 4]); }
      ctx.strokeStyle = "rgba(" + rgb + ",0.75)";
      ctx.stroke();
      ctx.restore();
    });
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  var timer = null;
  var rendererRegistrato = false;

  function tick() {
    pulisciScadute();
    if (isMasterOrSolo()) { applicaTickDanno(); }
  }

  function inizializza() {
    if (!window.document) { return; }
    var cv = canvas();
    if (cv && typeof cv.addWorldRenderer === "function" && !rendererRegistrato) {
      try { cv.addWorldRenderer(disegnaSuperfici); rendererRegistrato = true; } catch (e) { /* ignora */ }
    }
    var s = sync();
    if (s && typeof s.inAscolto === "function" && s.TipiEvento) {
      s.inAscolto(s.TipiEvento.SUPERFICIE_CREATA, gestisciSuperficieInbound);
    }
    if (!timer) { timer = window.setInterval(tick, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(27, { surfaces: true, fire: true, poison: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 27 caricato: superfici (fuoco/veleno, stile BG3).");
  }

  window.UltimateVTTSurfaces = {
    Tipi: { FUOCO: "fuoco", VELENO: "veleno" },
    // comandi
    creaSuperficie: creaSuperficie,
    elencoAttivo: function () {
      var r = roundCorrente();
      return superfici.filter(function (s) { return !eScaduta(s, r); })
        .map(function (s) { return { id: s.id, tipo: s.tipo, cellX: s.cellX, cellY: s.cellY, raggio: s.raggio, durataRound: s.durataRound, creataAlRound: s.creataAlRound }; });
    },
    // logica pura (testabile)
    eDentro: eDentro,
    eScaduta: eScaduta,
    formulaDanno: formulaDanno,
    durataDefault: durataDefault,
    // controllo
    isMasterOrSolo: isMasterOrSolo,
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } },
    // utile ai test
    _tick: function () { tick(); },
    _reset: function () { superfici = []; dannoDatoPerRound = {}; prossimoId = 1; },
    _gestisciInbound: gestisciSuperficieInbound
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 27 JS: SUPERFICI ---
