// --- INIZIO MODULO 25 JS: FIANCHEGGIAMENTO (FLANKING, stile BG3 / D&D 5e opzionale) ---
// Quando due alleati sono su celle adiacenti al bersaglio su lati OPPOSTI (o angoli opposti),
// il bersaglio e' "fiancheggiato": gli attacchi in mischia contro di lui hanno vantaggio (regola
// opzionale 5e, sempre attiva in BG3). Modulo di sola LOGICA + lettura stato: non tocca nessun
// modulo di gioco esistente. Il modulo 23 (HUD) lo consulta, se presente, per mostrare il badge e
// calcolare la modalita' di tiro effettiva; funziona comunque anche se la HUD non e' caricata.
(function () {
  "use strict";

  function combat() { return window.UltimateVTTCombat || null; }
  function physics() { return window.UltimateVTTTokenPhysics || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }

  // ---------------------------------------------------------------------------
  // Geometria: direzione (solo se adiacente, distanza di Chebyshev == 1) e fiancheggiamento.
  // ---------------------------------------------------------------------------
  function segno(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function chebyshev(a, b) { return Math.max(Math.abs(a.cellX - b.cellX), Math.abs(a.cellY - b.cellY)); }

  // Direzione unitaria dalla cella 'da' verso 'a' (dx,dy in {-1,0,1}); null se non adiacenti o coincidenti.
  function direzioneVerso(da, a) {
    if (!da || !a) { return null; }
    if (chebyshev(da, a) !== 1) { return null; }
    return { dx: segno(a.cellX - da.cellX), dy: segno(a.cellY - da.cellY) };
  }

  // Due celle adiacenti al bersaglio fiancheggiano se le loro direzioni dal bersaglio sono opposte
  // su ENTRAMBI gli assi (lati opposti: N/S, E/O; oppure angoli opposti: NE/SO, NO/SE).
  function staFiancheggiando(bersaglio, cellaA, cellaB) {
    var dA = direzioneVerso(bersaglio, cellaA);
    var dB = direzioneVerso(bersaglio, cellaB);
    if (!dA || !dB) { return false; }
    return dA.dx === -dB.dx && dA.dy === -dB.dy;
  }

  // ---------------------------------------------------------------------------
  // FUNZIONE PURA: cerca un alleato dell'attaccante che fiancheggi il bersaglio insieme a lui.
  //   opts = { attaccanteId, bersaglioId, combattenti:[{id,kind,defeated}], posizioni:{id:{cellX,cellY}} }
  // Ritorna l'id dell'alleato fiancheggiante, o null.
  // ---------------------------------------------------------------------------
  function trovaAlleatoFiancheggiante(opts) {
    if (!opts) { return null; }
    var combattenti = opts.combattenti || [];
    var posizioni = opts.posizioni || {};
    var attaccante = trovaComb(combattenti, opts.attaccanteId);
    var bersaglio = trovaComb(combattenti, opts.bersaglioId);
    var posAttaccante = posizioni[opts.attaccanteId];
    var posBersaglio = posizioni[opts.bersaglioId];
    if (!attaccante || !bersaglio || !posAttaccante || !posBersaglio) { return null; }
    if (attaccante.kind === bersaglio.kind) { return null; } // fazioni uguali: non ha senso fiancheggiare
    if (chebyshev(posAttaccante, posBersaglio) !== 1) { return null; } // l'attaccante deve essere in mischia

    for (var i = 0; i < combattenti.length; i += 1) {
      var c = combattenti[i];
      if (!c || c.id === opts.attaccanteId || c.id === opts.bersaglioId || c.defeated) { continue; }
      if (c.kind !== attaccante.kind) { continue; } // deve essere alleato dell'attaccante
      var posAlleato = posizioni[c.id];
      if (!posAlleato) { continue; }
      if (chebyshev(posAlleato, posBersaglio) !== 1) { continue; } // deve essere anche lui in mischia col bersaglio
      if (staFiancheggiando(posBersaglio, posAttaccante, posAlleato)) { return c.id; }
    }
    return null;
  }

  function trovaComb(lista, id) {
    for (var i = 0; i < (lista || []).length; i += 1) { if (lista[i].id === id) { return lista[i]; } }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Regola di sovrapposizione 5e: il fiancheggiamento concede vantaggio, che si annulla con uno
  // svantaggio gia' presente (tornando a "normale"); se il tiro e' gia' a vantaggio, resta tale.
  // ---------------------------------------------------------------------------
  function modalitaEffettiva(modalitaScelta, fiancheggiato) {
    if (!fiancheggiato) { return modalitaScelta || "normal"; }
    if (modalitaScelta === "disadvantage") { return "normal"; } // si annullano
    return "advantage";
  }

  // ---------------------------------------------------------------------------
  // Lettura dello stato live (combattimento + posizioni token) per valutare una coppia attaccante/bersaglio.
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

  function posizioniCorrenti(combattenti) {
    var p = physics();
    var pos = {};
    if (!p || typeof p.getState !== "function") { return pos; }
    var stTok; try { stTok = p.getState(); } catch (e) { return pos; }
    var perToken = {};
    (stTok.tokens || []).forEach(function (t) { perToken[t.id] = t; });
    (combattenti || []).forEach(function (c) {
      var tk = combAToken(c.id);
      var t = tk ? perToken[tk] : null;
      if (t) { pos[c.id] = { cellX: t.cellX, cellY: t.cellY }; }
    });
    return pos;
  }

  // Valuta se 'bersaglioId' e' fiancheggiato rispetto all'attacco di 'attaccanteId', leggendo lo
  // stato corrente del combattimento e le posizioni reali dei token.
  function valutaFiancheggiamento(attaccanteId, bersaglioId) {
    var c = combat();
    if (!c || typeof c.getState !== "function") { return { fiancheggiato: false, alleatoId: null }; }
    var st; try { st = c.getState(); } catch (e) { return { fiancheggiato: false, alleatoId: null }; }
    var pos = posizioniCorrenti(st.combatants);
    var alleatoId = trovaAlleatoFiancheggiante({
      attaccanteId: attaccanteId, bersaglioId: bersaglioId, combattenti: st.combatants, posizioni: pos
    });
    return { fiancheggiato: Boolean(alleatoId), alleatoId: alleatoId };
  }

  // ---------------------------------------------------------------------------
  // API pubblica (nessun DOM, nessun timer: e' consultata da chi ne ha bisogno, es. il modulo 23)
  // ---------------------------------------------------------------------------
  window.UltimateVTTFlanking = {
    direzioneVerso: direzioneVerso,
    staFiancheggiando: staFiancheggiando,
    trovaAlleatoFiancheggiante: trovaAlleatoFiancheggiante,
    modalitaEffettiva: modalitaEffettiva,
    valutaFiancheggiamento: valutaFiancheggiamento
  };

  if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
    try { window.UltimateVTT.registerModule(25, { flanking: true }); } catch (e) { /* best-effort */ }
  }
  if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
    try { window.UltimateVTT.appendSystemLog("Modulo 25 caricato: fiancheggiamento (stile BG3)."); } catch (e) { /* ignora */ }
  }
})();
// --- FINE MODULO 25 JS: FIANCHEGGIAMENTO ---
