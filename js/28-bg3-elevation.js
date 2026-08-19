// --- INIZIO MODULO 28 JS: TERRENO SOPRAELEVATO (ELEVATION, stile BG3) ---
// Estende la mappa con una quota per cella (livello intero, 0 = terreno normale, positivo = piu'
// alto, negativo = piu' basso). Attaccare da una quota piu' alta di quella del bersaglio da
// vantaggio; attaccare da una quota piu' bassa da svantaggio — la lettura "terreno sopraelevato"
// di BG3 piu' riconoscibile ai giocatori, qui semplificata a un confronto diretto di quota (nessuna
// linea di vista/ostacoli intermedi: fuori ambito, richiederebbe un sistema di raycasting).
//
// Progettato GM-autorevole fin da subito (stesso approccio del modulo 27, superfici): solo il
// Master dipinge la quota (evento di rete, propagato agli altri client); la LETTURA della quota
// per calcolare vantaggio/svantaggio e' invece sicura su ogni client, perche' non muta nulla — usa
// solo dati gia' sincronizzati (l'elenco delle quote ricevuto via rete).
//
// Non modifica nessun modulo esistente: usa le primitive di UltimateVTTTokenPhysics (posizioni),
// UltimateVTTCombat (combattenti), UltimateVTTCombatFSM (mappatura token<->combattente) e
// UltimateVTTCanvas (overlay). Il modulo 23 (HUD) lo consulta se presente, componendolo con il
// fiancheggiamento (modulo 25) secondo le regole di sovrapposizione 5e; funziona comunque anche
// da solo, senza HUD.
(function () {
  "use strict";

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

  function isMasterOrSolo() { return !window.UltimateVTTSync || window.UltimateVTTSync.isMaster(); }

  // ---------------------------------------------------------------------------
  // Stato locale: mappa sparsa "x,y" -> livello. Le celle assenti sono quota 0 (terreno normale).
  // ---------------------------------------------------------------------------
  var quote = {};

  function chiave(cellX, cellY) { return cellX + "," + cellY; }
  function quotaDi(cellX, cellY) {
    var v = quote[chiave(cellX, cellY)];
    return typeof v === "number" ? v : 0;
  }

  // ---------------------------------------------------------------------------
  // FUNZIONI PURE (testabili)
  // ---------------------------------------------------------------------------
  function chebyshev(a, b) { return Math.max(Math.abs(a.cellX - b.cellX), Math.abs(a.cellY - b.cellY)); }

  function differenzaElevazione(quotaAttaccante, quotaBersaglio) { return quotaAttaccante - quotaBersaglio; }

  // "advantage" se l'attaccante e' piu' in alto, "disadvantage" se piu' in basso, "normal" a parita'.
  function vantaggioPerElevazione(quotaAttaccante, quotaBersaglio) {
    var d = differenzaElevazione(quotaAttaccante, quotaBersaglio);
    if (d > 0) { return "advantage"; }
    if (d < 0) { return "disadvantage"; }
    return "normal";
  }

  // Regola di sovrapposizione 5e generalizzata a piu' fonti: se c'e' ALMENO una fonte di vantaggio
  // E almeno una di svantaggio, si annullano (torna "normale"); altrimenti vince quella presente.
  function componiModalita(modalitaScelta, haVantaggioExtra, haSvantaggioExtra) {
    var vantaggio = Boolean(haVantaggioExtra) || modalitaScelta === "advantage";
    var svantaggio = Boolean(haSvantaggioExtra) || modalitaScelta === "disadvantage";
    if (vantaggio && svantaggio) { return "normal"; }
    if (vantaggio) { return "advantage"; }
    if (svantaggio) { return "disadvantage"; }
    return "normal";
  }

  // ---------------------------------------------------------------------------
  // Mappatura token <-> combattente (stesso pattern dei moduli 24/25/26/27)
  // ---------------------------------------------------------------------------
  function combAToken(combId) {
    var f = fsm();
    if (f && typeof f.combattenteAToken === "function") { var r = f.combattenteAToken(combId); if (r) { return r; } }
    if (combId === "pc-local") { return "token-pc"; }
    var m = /^npc-(\w+)$/.exec(combId); if (m) { return "token-npc-" + m[1]; }
    return null;
  }
  function cellaCombattente(combId) {
    var tk = combAToken(combId);
    var P = physics();
    if (!tk || !P || typeof P.getState !== "function") { return null; }
    var st; try { st = P.getState(); } catch (e) { return null; }
    var t = (st.tokens || []).find(function (x) { return x.id === tk; });
    return t ? { cellX: t.cellX, cellY: t.cellY } : null;
  }

  // ---------------------------------------------------------------------------
  // Lettura live: vantaggio/svantaggio per una coppia attaccante/bersaglio (basata sulle loro
  // posizioni correnti). Sicura su ogni client: legge soltanto, non muta nulla.
  // ---------------------------------------------------------------------------
  function valutaElevazione(attaccanteId, bersaglioId) {
    var cellaAtt = cellaCombattente(attaccanteId);
    var cellaBer = cellaCombattente(bersaglioId);
    if (!cellaAtt || !cellaBer) { return "normal"; }
    return vantaggioPerElevazione(quotaDi(cellaAtt.cellX, cellaAtt.cellY), quotaDi(cellaBer.cellX, cellaBer.cellY));
  }

  // ---------------------------------------------------------------------------
  // Pittura (GM-autorevole): imposta la quota su un'area circolare (raggio in celle, Chebyshev).
  // ---------------------------------------------------------------------------
  function impostaAreaLocale(cellX, cellY, raggio, livello) {
    var celleModificate = [];
    for (var dx = -raggio; dx <= raggio; dx += 1) {
      for (var dy = -raggio; dy <= raggio; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) > raggio) { continue; }
        var cx = cellX + dx, cy = cellY + dy;
        var k = chiave(cx, cy);
        if (livello === 0) { delete quote[k]; } else { quote[k] = livello; }
        celleModificate.push({ cellX: cx, cellY: cy });
      }
    }
    var cv = canvas();
    if (cv && typeof cv.requestRender === "function") { try { cv.requestRender(); } catch (e) { /* ignora */ } }
    return celleModificate;
  }

  function impostaElevazioneArea(cellX, cellY, raggio, livello) {
    if (!isMasterOrSolo()) {
      var msg = "Solo il Master può modificare la quota del terreno in una sessione multiplayer.";
      annuncia("⛰ " + msg);
      return { ok: false, message: msg };
    }
    cellX = Math.trunc(cellX) || 0;
    cellY = Math.trunc(cellY) || 0;
    raggio = Math.max(0, Math.trunc(raggio) || 0);
    livello = Math.trunc(livello) || 0;
    impostaAreaLocale(cellX, cellY, raggio, livello);
    annuncia("⛰ Quota " + (livello >= 0 ? "+" + livello : livello) + " impostata in (" + cellX + "," + cellY + "), raggio " + raggio + ".");

    var S = sync();
    if (S && typeof S.emetti === "function" && typeof S.creaEvento === "function" && S.TipiEvento) {
      try {
        S.emetti(S.creaEvento(S.TipiEvento.ELEVAZIONE_IMPOSTATA, { cellX: cellX, cellY: cellY, raggio: raggio, livello: livello }));
      } catch (e) { /* la modifica resta comunque valida in locale */ }
    }
    return { ok: true, cellX: cellX, cellY: cellY, raggio: raggio, livello: livello };
  }

  function gestisciElevazioneInbound(evento) {
    var p = evento.payload || {};
    if (typeof p.cellX !== "number" || typeof p.cellY !== "number") { return; }
    impostaAreaLocale(p.cellX, p.cellY, p.raggio || 0, typeof p.livello === "number" ? p.livello : 0);
  }

  // ---------------------------------------------------------------------------
  // Overlay canvas: numero della quota al centro di ogni cella modificata (stesso pattern del
  // modulo 27 per le superfici / modulo 20 per il raggio di movimento).
  // ---------------------------------------------------------------------------
  function disegnaElevazione(rendererContext) {
    var ctx = rendererContext && rendererContext.context;
    var chiavi = Object.keys(quote);
    if (!ctx || !chiavi.length) { return; }
    var cv = canvas();
    var metriche = (cv && typeof cv.getGridMetrics === "function") ? cv.getGridMetrics() : { gridSize: 48 };
    var g = metriche.gridSize || 48;

    chiavi.forEach(function (k) {
      var parti = k.split(",");
      var cellX = parseInt(parti[0], 10), cellY = parseInt(parti[1], 10);
      var livello = quote[k];
      if (!livello) { return; }
      var centro = (cv && typeof cv.cellToWorldCenter === "function")
        ? cv.cellToWorldCenter(cellX, cellY)
        : { x: cellX * g + g / 2, y: cellY * g + g / 2 };
      var lato = g * 0.86;

      ctx.save();
      ctx.strokeStyle = livello > 0 ? "rgba(200,155,60,0.75)" : "rgba(91,140,183,0.75)";
      ctx.lineWidth = 2;
      ctx.strokeRect(centro.x - lato / 2, centro.y - lato / 2, lato, lato);
      ctx.fillStyle = livello > 0 ? "#f0d472" : "#9fc4e0";
      ctx.font = "bold " + Math.round(g * 0.34) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((livello > 0 ? "+" : "") + livello, centro.x, centro.y);
      ctx.restore();
    });
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  var rendererRegistrato = false;

  function inizializza() {
    if (!window.document) { return; }
    var cv = canvas();
    if (cv && typeof cv.addWorldRenderer === "function" && !rendererRegistrato) {
      try { cv.addWorldRenderer(disegnaElevazione); rendererRegistrato = true; } catch (e) { /* ignora */ }
    }
    var s = sync();
    if (s && typeof s.inAscolto === "function" && s.TipiEvento) {
      s.inAscolto(s.TipiEvento.ELEVAZIONE_IMPOSTATA, gestisciElevazioneInbound);
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(28, { elevation: true, highGround: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 28 caricato: terreno sopraelevato (stile BG3).");
  }

  window.UltimateVTTElevation = {
    // comandi
    impostaElevazioneArea: impostaElevazioneArea,
    quotaDi: quotaDi,
    // logica pura (testabile)
    differenzaElevazione: differenzaElevazione,
    vantaggioPerElevazione: vantaggioPerElevazione,
    componiModalita: componiModalita,
    // lettura live (consultata dal modulo 23)
    valutaElevazione: valutaElevazione,
    // controllo
    isMasterOrSolo: isMasterOrSolo,
    // utile ai test
    _gestisciInbound: gestisciElevazioneInbound,
    _reset: function () { quote = {}; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 28 JS: TERRENO SOPRAELEVATO ---
