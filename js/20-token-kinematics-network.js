// --- INIZIO MODULO 20 JS: CINEMATICA TOKEN, THROTTLE DI RETE, RAGGIO DI MOVIMENTO ---
// Fase 2 dell'architettura: livello VTT (mappa).
//
// Aggiunge, SENZA modificare il modulo 8 (token physics):
//  - Traduzione di coordinate schermo <-> mondo <-> cella (con self-test di round-trip).
//  - Throttle di rete a ~10Hz durante il drag: il token si muove a 60fps in locale, ma gli
//    eventi TokenMosso vengono inviati al massimo 10 volte al secondo (anti-flooding).
//  - Limite di movimento in combattimento: a fine drag, se siamo in CombatActive, il movimento
//    viene confrontato con il budget del combattente (velocita' - movimento speso). Per i giocatori
//    il drag viene clampato al raggio raggiungibile; per il Master il movimento e' libero ma l'AP
//    viene comunque scalata. Fuori dal turno, ai giocatori il movimento e' negato.
//  - Overlay del raggio di movimento raggiungibile attorno al token di turno.
//
// Il rilevamento del drag avviene per polling (10Hz) di UltimateVTTTokenPhysics.getState().dragTokenId,
// cosi' non interferisce con la gestione pointer interna del modulo 8.
(function () {
  "use strict";

  var INTERVALLO_MS = 100;     // ~10Hz: throttle di rete e rilevamento drag
  var EPS = 0.01;              // tolleranza sui metri

  var samplerTimer = null;
  var dragVisto = false;       // true mentre un drag e' in corso
  var ultimoDrag = null;       // { tokenId, cellaPartenza:{cellX,cellY}, ultimaInviata:{cellX,cellY} }
  var rendererRegistrato = false;

  // ---------------------------------------------------------------------------
  // Accessi difensivi ai moduli
  // ---------------------------------------------------------------------------
  function log(m) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
    if (window.console && console.debug) { console.debug("[VTT-Kine] " + m); }
  }

  function canvas() { return window.UltimateVTTCanvas || null; }
  function physics() { return window.UltimateVTTTokenPhysics || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }
  function sync() { return window.UltimateVTTSync || null; }

  function feedback(testo) {
    log(testo);
    // Mostra un messaggio in chat se disponibile, senza far fallire nulla.
    if (window.UltimateVTTMasterChat && typeof window.UltimateVTTMasterChat.appendSystemMessage === "function") {
      try { window.UltimateVTTMasterChat.appendSystemMessage(testo); } catch (e) { /* ignora */ }
    }
  }

  function metriche() {
    var c = canvas();
    if (c && typeof c.getGridMetrics === "function") {
      try { return c.getGridMetrics(); } catch (e) { /* fallback */ }
    }
    return { gridSize: 48, cellMeters: 1.5, columns: 40, rows: 30 };
  }

  function trovaToken(stato, tokenId) {
    if (!stato || !Array.isArray(stato.tokens)) { return null; }
    for (var i = 0; i < stato.tokens.length; i += 1) {
      if (stato.tokens[i].id === tokenId) { return stato.tokens[i]; }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Traduzione di coordinate (deliverable Fase 2)
  // ---------------------------------------------------------------------------
  function worldToCell(worldX, worldY) {
    var g = metriche().gridSize || 48;
    return { cellX: Math.floor(worldX / g), cellY: Math.floor(worldY / g) };
  }

  function cellToWorldCenter(cellX, cellY) {
    var c = canvas();
    if (c && typeof c.cellToWorldCenter === "function") { return c.cellToWorldCenter(cellX, cellY); }
    var g = metriche().gridSize || 48;
    return { x: cellX * g + g / 2, y: cellY * g + g / 2 };
  }

  function cellToScreen(cellX, cellY) {
    var c = canvas();
    var centro = cellToWorldCenter(cellX, cellY);
    if (c && typeof c.worldToScreen === "function") { return c.worldToScreen(centro.x, centro.y); }
    return centro;
  }

  function screenToCell(clientX, clientY) {
    var c = canvas();
    if (c && typeof c.screenToCell === "function") { return c.screenToCell(clientX, clientY); }
    return worldToCell(clientX, clientY);
  }

  // Distanza di griglia (Chebyshev, coerente col modulo token) in celle e in metri.
  function distanzaCelle(a, b) {
    return Math.max(Math.abs(a.cellX - b.cellX), Math.abs(a.cellY - b.cellY));
  }
  function distanzaMetri(a, b) {
    var cm = metriche().cellMeters || 1.5;
    return distanzaCelle(a, b) * cm;
  }

  // Clampa la cella di arrivo lungo il percorso entro il budget in metri.
  function clampPercorso(partenza, arrivo, residuoMetri) {
    var cm = metriche().cellMeters || 1.5;
    var celleMax = Math.floor((residuoMetri + EPS) / cm);
    var dx = arrivo.cellX - partenza.cellX;
    var dy = arrivo.cellY - partenza.cellY;
    var cheb = Math.max(Math.abs(dx), Math.abs(dy));
    if (cheb <= celleMax || cheb === 0) { return { cellX: arrivo.cellX, cellY: arrivo.cellY }; }
    var fattore = celleMax / cheb;
    return {
      cellX: partenza.cellX + Math.round(dx * fattore),
      cellY: partenza.cellY + Math.round(dy * fattore)
    };
  }

  // Self-test della traduzione di coordinate: round-trip cella -> mondo -> cella.
  function runCoordinateSelfTest() {
    var casi = [{ cellX: 0, cellY: 0 }, { cellX: 5, cellY: 3 }, { cellX: 16, cellY: 12 }, { cellX: 23, cellY: 9 }];
    var passati = 0;
    var dettagli = [];
    casi.forEach(function (c) {
      var centro = cellToWorldCenter(c.cellX, c.cellY);
      var ritorno = worldToCell(centro.x, centro.y);
      var ok = ritorno.cellX === c.cellX && ritorno.cellY === c.cellY;
      if (ok) { passati += 1; }
      dettagli.push({ cella: c, ritorno: ritorno, ok: ok });
    });
    return { passati: passati, totali: casi.length, ok: passati === casi.length, dettagli: dettagli };
  }

  // ---------------------------------------------------------------------------
  // Throttle di rete durante il drag (~10Hz) + rilevamento inizio/fine
  // ---------------------------------------------------------------------------
  function syncAbilitato() {
    var s = sync();
    return Boolean(s && s.statoConnessione && s.statoConnessione().abilitato);
  }

  function emettiAnteprima(tokenId, cella) {
    var s = sync();
    if (!s || !syncAbilitato()) { return; }
    if (ultimoDrag && ultimoDrag.ultimaInviata &&
        ultimoDrag.ultimaInviata.cellX === cella.cellX &&
        ultimoDrag.ultimaInviata.cellY === cella.cellY) {
      return; // nessun cambio cella: niente da inviare
    }
    if (ultimoDrag) { ultimoDrag.ultimaInviata = { cellX: cella.cellX, cellY: cella.cellY }; }
    s.emetti(s.creaEventoTokenMosso(tokenId, cella.cellX, cella.cellY, { anteprima: true }));
  }

  function emettiFinale(tokenId, cellaArrivo, cellaPartenza) {
    var s = sync();
    if (!s) { return; }
    var ev = s.creaEventoTokenMosso(tokenId, cellaArrivo.cellX, cellaArrivo.cellY, {
      anteprima: false,
      cellaPrecedenteX: cellaPartenza.cellX,
      cellaPrecedenteY: cellaPartenza.cellY,
      metri: distanzaMetri(cellaPartenza, cellaArrivo)
    });
    // L'undo (rollback predittivo) riporta il token alla cella di partenza.
    s.emetti(ev, function undo() {
      var ph = physics();
      if (ph && typeof ph.moveTokenToCell === "function") {
        try { ph.moveTokenToCell(tokenId, cellaPartenza.cellX, cellaPartenza.cellY, true); } catch (e) { /* ignora */ }
      }
    });
  }

  function tickSampler() {
    var ph = physics();
    if (!ph) { return; }
    var st;
    try { st = ph.getState(); } catch (e) { return; }
    var dragId = st.dragTokenId;

    if (dragId) {
      var tok = trovaToken(st, dragId);
      if (!tok) { return; }
      var cella = worldToCell(tok.x, tok.y);
      if (!dragVisto || !ultimoDrag || ultimoDrag.tokenId !== dragId) {
        dragVisto = true;
        var partenza = st.dragStartCell
          ? { cellX: st.dragStartCell.cellX, cellY: st.dragStartCell.cellY }
          : { cellX: tok.cellX, cellY: tok.cellY };
        ultimoDrag = { tokenId: dragId, cellaPartenza: partenza, ultimaInviata: null };
      }
      emettiAnteprima(dragId, cella);
    } else if (dragVisto) {
      // Il drag si e' appena concluso.
      dragVisto = false;
      var concluso = ultimoDrag;
      ultimoDrag = null;
      if (concluso) { finalizzaDrag(concluso, st); }
    }
  }

  // ---------------------------------------------------------------------------
  // Limite di movimento in combattimento, applicato a fine drag
  // ---------------------------------------------------------------------------
  function isMaster() {
    var s = sync();
    return !s || s.isMaster();
  }

  function finalizzaDrag(info, statoPhysics) {
    var ph = physics();
    if (!ph) { return; }
    var st = statoPhysics || ph.getState();
    var tok = trovaToken(st, info.tokenId);
    if (!tok) { return; }

    var partenza = info.cellaPartenza;
    var arrivo = { cellX: tok.cellX, cellY: tok.cellY };

    var f = fsm();
    if (f) {
      var sf = f.getStato();
      var inCombattimento = sf.nome !== f.Stati.FUORI;
      if (inCombattimento) {
        // Fuori turno (e non Master): movimento negato, torna alla partenza.
        if (!f.puoMuovereOra(info.tokenId)) {
          try { ph.moveTokenToCell(info.tokenId, partenza.cellX, partenza.cellY, true); } catch (e) { /* ignora */ }
          feedback("Non e' il turno di questo token: movimento annullato.");
          emettiFinale(info.tokenId, partenza, partenza);
          return;
        }
        var metri = distanzaMetri(partenza, arrivo);
        var residuo = f.movimentoResiduo(info.tokenId);
        var limitabile = sf.enforceMovimento && isFinite(residuo);
        // Solo i giocatori vengono fermati dal budget; il Master e' libero (ma scala comunque l'AP).
        if (limitabile && !isMaster() && metri > residuo + EPS) {
          var cellaMax = clampPercorso(partenza, arrivo, residuo);
          try { ph.moveTokenToCell(info.tokenId, cellaMax.cellX, cellaMax.cellY, true); } catch (e2) { /* ignora */ }
          var speso = f.spendiMovimento(info.tokenId, distanzaMetri(partenza, cellaMax));
          feedback("Movimento limitato dal turno: " + Math.round(speso) + " m percorsi (residuo esaurito).");
          emettiFinale(info.tokenId, cellaMax, partenza);
          return;
        }
        // Entro il budget (o Master): scala comunque l'AP di movimento.
        if (isFinite(residuo)) { f.spendiMovimento(info.tokenId, metri); }
      }
    }

    emettiFinale(info.tokenId, arrivo, partenza);
  }

  // ---------------------------------------------------------------------------
  // Applicazione dei movimenti inbound (da altri client tramite il Sync Manager)
  // ---------------------------------------------------------------------------
  function gestisciTokenMossoInbound(evento) {
    var ph = physics();
    if (!ph || typeof ph.moveTokenToCell !== "function") { return; }
    var p = evento.payload || {};
    try {
      // Movimenti remoti SEMPRE animati (animated=true): la molla di easing del modulo 8 interpola
      // i token verso ogni cella di anteprima (~10Hz) facendoli scivolare in modo fluido invece di
      // "teletrasportarsi" a scatti. L'ultimo evento finale fa assestare il token sulla cella esatta.
      ph.moveTokenToCell(p.tokenId, p.cellaX, p.cellaY, true);
    } catch (e) { log("Applicazione TokenMosso inbound fallita: " + (e && e.message)); }
  }

  // ---------------------------------------------------------------------------
  // Overlay del raggio di movimento raggiungibile
  // ---------------------------------------------------------------------------
  function disegnaRaggioMovimento(rendererContext) {
    var f = fsm();
    if (!f) { return; }
    var sf = f.getStato();
    if (sf.nome !== f.Stati.ATTIVO) { return; }
    var tokenId = sf.tokenDiTurno;
    if (!tokenId) { return; }

    var ph = physics();
    if (!ph) { return; }
    var st;
    try { st = ph.getState(); } catch (e) { return; }
    var tok = trovaToken(st, tokenId);
    if (!tok || tok.hidden) { return; }

    var residuo = f.movimentoResiduo(tokenId);
    if (!isFinite(residuo) || residuo <= 0) { return; }

    var g = metriche();
    var celle = residuo / (g.cellMeters || 1.5);
    var raggio = celle * (g.gridSize || 48);

    var ctx = rendererContext && rendererContext.context;
    if (!ctx) { return; }
    var scala = (rendererContext.mapState && rendererContext.mapState.viewport)
      ? rendererContext.mapState.viewport.scale : 1;

    ctx.save();
    ctx.beginPath();
    ctx.arc(tok.x, tok.y, raggio, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(91, 183, 200, 0.10)";
    ctx.fill();
    ctx.lineWidth = 2 / Math.max(scala, 0.01);
    if (ctx.setLineDash) { ctx.setLineDash([6, 5]); }
    ctx.strokeStyle = "rgba(91, 183, 200, 0.65)";
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Inizializzazione
  // ---------------------------------------------------------------------------
  function inizializza() {
    // Registra l'overlay del raggio sul canvas.
    var c = canvas();
    if (c && typeof c.addWorldRenderer === "function" && !rendererRegistrato) {
      try { c.addWorldRenderer(disegnaRaggioMovimento); rendererRegistrato = true; } catch (e) { /* ignora */ }
    }

    // Ascolta i movimenti token in arrivo dalla rete.
    var s = sync();
    if (s && typeof s.inAscolto === "function") {
      s.inAscolto(s.TipiEvento.TOKEN_MOSSO, gestisciTokenMossoInbound);
    }

    // Avvia il sampler ~10Hz (throttle di rete + rilevamento drag).
    if (!samplerTimer) { samplerTimer = window.setInterval(tickSampler, INTERVALLO_MS); }

    // Self-test di traduzione coordinate (diagnostica, non blocca).
    var test = runCoordinateSelfTest();
    log("Self-test coordinate: " + test.passati + "/" + test.totali + (test.ok ? " OK" : " FALLITO"));

    log("Modulo 20 caricato: cinematica token, throttle di rete 10Hz, raggio di movimento.");
  }

  window.UltimateVTTKinematics = {
    // traduzione coordinate
    worldToCell: worldToCell,
    cellToWorldCenter: cellToWorldCenter,
    cellToScreen: cellToScreen,
    screenToCell: screenToCell,
    distanzaCelle: distanzaCelle,
    distanzaMetri: distanzaMetri,
    clampPercorso: clampPercorso,
    runCoordinateSelfTest: runCoordinateSelfTest,
    // diagnostica
    statoDrag: function () { return { inCorso: dragVisto, ultimoDrag: ultimoDrag ? JSON.parse(JSON.stringify(ultimoDrag)) : null }; },
    // controllo manuale del sampler
    fermaSampler: function () { if (samplerTimer) { clearInterval(samplerTimer); samplerTimer = null; } },
    avviaSampler: function () { if (!samplerTimer) { samplerTimer = window.setInterval(tickSampler, INTERVALLO_MS); } }
  };

  if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
    try {
      window.UltimateVTT.registerModule(20, {
        kinematics: true,
        throttleHz: Math.round(1000 / INTERVALLO_MS),
        movementRadius: true,
        coordinateTranslation: true
      });
    } catch (e) { /* best-effort */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 20 JS: CINEMATICA TOKEN, THROTTLE DI RETE, RAGGIO DI MOVIMENTO ---
