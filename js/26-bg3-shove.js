// --- INIZIO MODULO 26 JS: SPINGI (SHOVE, stile BG3 / D&D 5e) ---
// Prova contrapposta: Atletica dell'attaccante contro Atletica o Acrobazia del bersaglio (il
// bersaglio usa la sua prova migliore). Se l'attaccante vince, il bersaglio viene spinto di una
// cella nella direzione opposta all'attaccante. Ambito volutamente ristretto alla sola SPINTA
// (variante "push 5 ft" della regola 5e): non implementa la variante "atterra" perche' il gioco
// non ha ancora un sistema di condizioni/stati (prono, ecc.).
//
// Non modifica nessun modulo esistente: usa le primitive di UltimateVTTCombat (tiro d20, stato
// combattenti), UltimateVTTTokenPhysics (posizioni + movimento, che gia' blocca da solo il terreno
// impraticabile), UltimateVTTState (statistiche reali del PG) e UltimateVTTCombatFSM (mappatura
// token<->combattente). Se la HUD (modulo 23) e' presente, si aggiunge da solo un pulsante "Spingi"
// nella sua barra azioni; funziona comunque anche senza, via API pubblica.
(function () {
  "use strict";

  var INTERVALLO_MS = 300;

  function combat() { return window.UltimateVTTCombat || null; }
  function physics() { return window.UltimateVTTTokenPhysics || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }

  // In multiplayer, solo il Master risolve la spinta: la chiamata diretta a moveTokenToCell qui
  // sotto NON passa dal livello cinematico di rete (modulo 20), quindi da un client giocatore
  // resterebbe visibile solo sul suo schermo. Il Master, dopo aver mosso il token in locale, emette
  // esplicitamente l'evento (vedi spingi()); in single-player (Sync assente) risolve sempre lui.
  function isMasterOrSolo() { return !window.UltimateVTTSync || window.UltimateVTTSync.isMaster(); }

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
  // Modificatori di prova: reali per il PG (modulo 04), euristica ragionevole per i PNG (che nel
  // catalogo non hanno punteggi di caratteristica): Atletica ~ attackBonus, Acrobazia ~ initiativeBonus
  // (nella maggior parte dei mostri l'iniziativa e' guidata da Destrezza).
  // ---------------------------------------------------------------------------
  function modificatoreAtleticaProxy(c) { return typeof (c && c.attackBonus) === "number" ? c.attackBonus : 0; }
  function modificatoreAcrobaziaProxy(c) { return typeof (c && c.initiativeBonus) === "number" ? c.initiativeBonus : 0; }

  function modificatoreReale(combattenteId, chiaveAbilita) {
    if (combattenteId !== "pc-local") { return null; }
    var S = window.UltimateVTTState;
    if (S && typeof S.calculateSkillModifier === "function") {
      try { return S.calculateSkillModifier(chiaveAbilita); } catch (e) { /* fallback sotto */ }
    }
    return null;
  }

  // Modificatore di Atletica del combattente (per la prova dell'attaccante).
  function modAtletica(c) {
    var reale = modificatoreReale(c.id, "athletics");
    return reale != null ? reale : modificatoreAtleticaProxy(c);
  }
  // Modificatore di difesa del bersaglio: il migliore tra Atletica e Acrobazia (sceglie lui, regola 5e).
  function modDifesa(c) {
    var atl = modificatoreReale(c.id, "athletics");
    var acr = modificatoreReale(c.id, "acrobatics");
    if (atl == null) { atl = modificatoreAtleticaProxy(c); }
    if (acr == null) { acr = modificatoreAcrobaziaProxy(c); }
    return Math.max(atl, acr);
  }

  // ---------------------------------------------------------------------------
  // FUNZIONE PURA: esito della prova contrapposta. Ammette tiri iniettati per test deterministici.
  //   opts = { attaccanteMod, bersaglioMod, tiroAttaccante(1-20), tiroBersaglio(1-20) }
  // Regola: l'attaccante deve SUPERARE (non pareggiare) il bersaglio; in parita' vince il bersaglio.
  // ---------------------------------------------------------------------------
  function esitoSpinta(opts) {
    opts = opts || {};
    var totaleAttaccante = (opts.tiroAttaccante || 0) + (opts.attaccanteMod || 0);
    var totaleBersaglio = (opts.tiroBersaglio || 0) + (opts.bersaglioMod || 0);
    return {
      successo: totaleAttaccante > totaleBersaglio,
      totaleAttaccante: totaleAttaccante,
      totaleBersaglio: totaleBersaglio
    };
  }

  // ---------------------------------------------------------------------------
  // FUNZIONE PURA: cella di destinazione della spinta (un passo oltre il bersaglio, nella stessa
  // direzione attaccante->bersaglio). Richiede portata di mischia (celle adiacenti); altrimenti null.
  // ---------------------------------------------------------------------------
  function segno(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function chebyshev(a, b) { return Math.max(Math.abs(a.cellX - b.cellX), Math.abs(a.cellY - b.cellY)); }

  function celleSpinta(attaccante, bersaglio) {
    if (!attaccante || !bersaglio) { return null; }
    if (chebyshev(attaccante, bersaglio) !== 1) { return null; } // fuori portata di mischia
    var dx = segno(bersaglio.cellX - attaccante.cellX);
    var dy = segno(bersaglio.cellY - attaccante.cellY);
    return { cellX: bersaglio.cellX + dx, cellY: bersaglio.cellY + dy };
  }

  // ---------------------------------------------------------------------------
  // Mappatura token <-> combattente (stesso pattern dei moduli 24/25)
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
  function trovaComb(lista, id) {
    for (var i = 0; i < (lista || []).length; i += 1) { if (lista[i].id === id) { return lista[i]; } }
    return null;
  }
  function cellaToken(tokenId) {
    var p = physics();
    if (!p || typeof p.getState !== "function") { return null; }
    var st; try { st = p.getState(); } catch (e) { return null; }
    var t = (st.tokens || []).find(function (x) { return x.id === tokenId; });
    return t ? { cellX: t.cellX, cellY: t.cellY } : null;
  }

  // ---------------------------------------------------------------------------
  // Comando runtime: spinge il bersaglio selezionato usando il combattente di turno come attaccante.
  // ---------------------------------------------------------------------------
  function turnoCorrenteEBersaglio(st) {
    var corrente = null, bersaglio = null;
    if (st && Array.isArray(st.combatants) && st.currentTurnIndex >= 0 && st.currentTurnIndex < st.combatants.length) {
      corrente = st.combatants[st.currentTurnIndex];
    }
    if (st && st.selectedTargetId) { bersaglio = trovaComb(st.combatants, st.selectedTargetId); }
    return { corrente: corrente, bersaglio: bersaglio };
  }

  function spingi() {
    if (!isMasterOrSolo()) {
      var msgSoloMaster = "Solo il Master può risolvere un'azione Spingi in una sessione multiplayer.";
      annuncia("🤼 " + msgSoloMaster);
      return { ok: false, message: msgSoloMaster };
    }
    var C = combat();
    if (!C || typeof C.getState !== "function") { return { ok: false, message: "Combattimento non disponibile." }; }
    var st = C.getState();
    if (!st.active) { return { ok: false, message: "Nessun combattimento attivo." }; }

    var coppia = turnoCorrenteEBersaglio(st);
    var attaccante = coppia.corrente, bersaglio = coppia.bersaglio;
    if (!attaccante || !bersaglio || attaccante.id === bersaglio.id || bersaglio.defeated) {
      return { ok: false, message: "Nessun bersaglio valido per la spinta." };
    }

    var cellaAtt = cellaToken(combAToken(attaccante.id));
    var cellaBer = cellaToken(combAToken(bersaglio.id));
    var destinazione = celleSpinta(cellaAtt, cellaBer);
    if (!destinazione) {
      annuncia("🤼 " + attaccante.name + " non è abbastanza vicino a " + bersaglio.name + " per spingerlo.");
      return { ok: false, message: "Fuori portata di mischia." };
    }

    var tiroA = C.rollD20WithMode("normal").chosen;
    var tiroB = C.rollD20WithMode("normal").chosen;
    var esito = esitoSpinta({
      attaccanteMod: modAtletica(attaccante), bersaglioMod: modDifesa(bersaglio),
      tiroAttaccante: tiroA, tiroBersaglio: tiroB
    });

    if (!esito.successo) {
      annuncia("🤼 " + attaccante.name + " tenta di spingere " + bersaglio.name +
        " (" + esito.totaleAttaccante + " vs " + esito.totaleBersaglio + "): FALLITO.");
      return { ok: true, successo: false, esito: esito };
    }

    var P = physics();
    var tokenBersaglio = combAToken(bersaglio.id);
    var spostato = false;
    if (P && typeof P.moveTokenToCell === "function") {
      try { spostato = P.moveTokenToCell(tokenBersaglio, destinazione.cellX, destinazione.cellY, true); } catch (e) { spostato = false; }
    }
    annuncia("🤼 " + attaccante.name + " spinge " + bersaglio.name +
      " (" + esito.totaleAttaccante + " vs " + esito.totaleBersaglio + "): RIUSCITO" +
      (spostato ? "." : " (ma la cella di arrivo è bloccata: resta al suo posto)."));

    // Propaga il movimento agli altri client connessi (il Master e' sempre autorizzato a muovere
    // qualsiasi token). In single-player e' un no-op che ritorna true (gia' applicato in locale).
    if (spostato) {
      var s = window.UltimateVTTSync;
      if (s && typeof s.emetti === "function" && typeof s.creaEventoTokenMosso === "function") {
        try {
          s.emetti(s.creaEventoTokenMosso(tokenBersaglio, destinazione.cellX, destinazione.cellY, {
            anteprima: false, cellaPrecedenteX: cellaBer.cellX, cellaPrecedenteY: cellaBer.cellY
          }), function annullaSpinta() {
            try { P.moveTokenToCell(tokenBersaglio, cellaBer.cellX, cellaBer.cellY, true); } catch (e) { /* ignora */ }
          });
        } catch (e) { /* la spinta resta comunque valida in locale */ }
      }
    }

    return { ok: true, successo: true, esito: esito, spostato: spostato, destinazione: destinazione };
  }

  // ---------------------------------------------------------------------------
  // Iniezione del pulsante "Spingi" nella barra azioni della HUD (modulo 23), se presente.
  // Modulo 23 non deve sapere nulla di questo modulo: si aggancia da solo, in sola lettura del DOM.
  // ---------------------------------------------------------------------------
  var iniettato = false;
  function iniettaBottone() {
    if (iniettato || !document.body) { return; }
    var tray = document.querySelector(".bg3-actions");
    if (!tray) { return; } // HUD non ancora costruita (o assente): si ritenta al prossimo tick
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "bg3ShoveButton";
    btn.className = "bg3-btn shove";
    btn.textContent = "Spingi";
    btn.addEventListener("click", spingi);
    var endBtn = null;
    for (var i = 0; i < tray.children.length; i += 1) {
      if (/Termina turno/.test(tray.children[i].textContent || "")) { endBtn = tray.children[i]; break; }
    }
    if (endBtn) { tray.insertBefore(btn, endBtn); } else { tray.appendChild(btn); }
    iniettato = true;
  }

  var timer = null;
  function inizializza() {
    if (!window.document) { return; }
    iniettaBottone();
    if (!timer) { timer = window.setInterval(iniettaBottone, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(26, { shove: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 26 caricato: azione Spingi (stile BG3).");
  }

  window.UltimateVTTShove = {
    // logica pura (testabile)
    esitoSpinta: esitoSpinta,
    celleSpinta: celleSpinta,
    modificatoreAtleticaProxy: modificatoreAtleticaProxy,
    modificatoreAcrobaziaProxy: modificatoreAcrobaziaProxy,
    // comando
    spingi: spingi,
    // controllo (utile ai test)
    isMasterOrSolo: isMasterOrSolo,
    fermaAggiornamento: function () { if (timer) { clearInterval(timer); timer = null; } }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 26 JS: SPINGI (SHOVE) ---
