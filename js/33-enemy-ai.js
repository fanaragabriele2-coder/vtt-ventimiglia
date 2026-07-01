// --- INIZIO MODULO 33 JS: IA DEI NEMICI (turno automatico dei PNG) ---
// Prima di questo modulo, quando in combattimento arrivava il turno di un PNG NON succedeva NULLA:
// il nemico restava immobile e il giocatore doveva premere "Termina turno" al posto suo, senza che
// il PNG agisse mai. Questo modulo fa agire i nemici come veri avversari: al loro turno si
// avvicinano al PG piu' vicino e, se a portata di mischia, lo attaccano (tiro per colpire + danni
// reali tramite UltimateVTTCombat), poi concludono il turno.
//
// Progettato GM-autorevole (stesso approccio dei moduli 27/28/30): solo il Master (o il gioco in
// solitaria/hotseat, dove Sync e' assente) pilota i nemici, cosi' in multiplayer non e' ogni client
// a tirare dadi propri e non sincronizzati. Non modifica nessun modulo esistente: usa le primitive
// di UltimateVTTCombat (stato, attacco diretto, avanzamento turno), UltimateVTTTokenPhysics
// (posizioni + movimento) e UltimateVTTCombatFSM (mappatura token<->combattente).
(function () {
  "use strict";

  var INTERVALLO_MS = 700;   // pausa tra un'azione nemica e la successiva (leggibilita' del turno)
  var PORTATA_MOVIMENTO = 6; // celle percorribili in un turno (~9 m con celle da 1.5 m)

  function combat() { return window.UltimateVTTCombat || null; }
  function physics() { return window.UltimateVTTTokenPhysics || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }

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
  // FUNZIONI PURE (testabili)
  // ---------------------------------------------------------------------------
  function segno(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function chebyshev(a, b) { return Math.max(Math.abs(a.cellX - b.cellX), Math.abs(a.cellY - b.cellY)); }

  // Cella di destinazione avvicinandosi al bersaglio di al massimo `portata` celle (metrica
  // Chebyshev, come si muovono i token sulla griglia), senza mai finire sopra il bersaglio: si
  // ferma al massimo su una cella adiacente. Ritorna null se il PNG e' gia' adiacente (niente da fare).
  function cellaVersoBersaglio(npcCell, pcCell, portata) {
    if (!npcCell || !pcCell) { return null; }
    var dist = chebyshev(npcCell, pcCell);
    if (dist <= 1) { return null; }
    var passi = Math.min(portata, dist - 1);
    var stepX = clamp(pcCell.cellX - npcCell.cellX, -passi, passi);
    var stepY = clamp(pcCell.cellY - npcCell.cellY, -passi, passi);
    return { cellX: npcCell.cellX + stepX, cellY: npcCell.cellY + stepY };
  }

  // ---------------------------------------------------------------------------
  // Mappatura token <-> combattente (stesso pattern dei moduli 24/25/26/27/28)
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
  // Scelta del bersaglio: il PG vivo con il token piu' vicino al PNG (se le posizioni sono note),
  // altrimenti semplicemente il primo PG vivo (fallback quando non c'e' una griglia con token).
  // ---------------------------------------------------------------------------
  function pgVivi(stato) {
    return (stato.combatants || []).filter(function (c) { return c.kind === "pc" && !c.defeated && c.hitPoints > 0; });
  }
  function bersaglioPiuVicino(stato, npcId) {
    var candidati = pgVivi(stato);
    if (!candidati.length) { return null; }
    var npcCell = cellaCombattente(npcId);
    if (!npcCell) { return candidati[0]; }
    var migliore = null, minDist = Infinity;
    candidati.forEach(function (pc) {
      var pcCell = cellaCombattente(pc.id);
      var d = pcCell ? chebyshev(npcCell, pcCell) : 1000;
      if (d < minDist) { minDist = d; migliore = pc; }
    });
    return migliore || candidati[0];
  }

  // ---------------------------------------------------------------------------
  // Azione del nemico di turno: avvicinati e attacca, poi concludi il turno.
  // ---------------------------------------------------------------------------
  function terminaTurno() {
    var C = combat();
    if (C && typeof C.nextTurn === "function") { try { C.nextTurn(); } catch (e) { /* ignora */ } }
  }

  function agisciNemico(stato, cur) {
    var C = combat();
    var bersaglio = bersaglioPiuVicino(stato, cur.id);
    if (!bersaglio) { terminaTurno(); return; }

    var npcCell = cellaCombattente(cur.id);
    var pcCell = cellaCombattente(bersaglio.id);

    // Se conosciamo le posizioni sulla griglia, il PNG si avvicina; altrimenti si assume mischia.
    if (npcCell && pcCell) {
      var dist = chebyshev(npcCell, pcCell);
      if (dist > 1) {
        var dest = cellaVersoBersaglio(npcCell, pcCell, PORTATA_MOVIMENTO);
        var P = physics();
        if (dest && P && typeof P.moveTokenToCell === "function") {
          var tokenNpc = combAToken(cur.id);
          var mosso = false;
          try { mosso = P.moveTokenToCell(tokenNpc, dest.cellX, dest.cellY, true); } catch (e) { mosso = false; }
          if (mosso) { annuncia("👣 " + cur.name + " avanza verso " + bersaglio.name + "."); }
        }
        npcCell = cellaCombattente(cur.id);
        dist = (npcCell && pcCell) ? chebyshev(npcCell, pcCell) : 999;
      }
      if (dist <= 1) {
        if (C && typeof C.resolveAttackBetween === "function") { C.resolveAttackBetween(cur.id, bersaglio.id, "normal"); }
      } else {
        annuncia("🛡 " + cur.name + " non riesce a raggiungere " + bersaglio.name + " e resta in guardia.");
      }
    } else {
      // Nessuna posizione nota (nessuna griglia/token): il PNG attacca comunque in mischia.
      if (C && typeof C.resolveAttackBetween === "function") { C.resolveAttackBetween(cur.id, bersaglio.id, "normal"); }
    }

    terminaTurno();
  }

  // ---------------------------------------------------------------------------
  // Ciclo di polling: agisce quando e' il turno di un PNG vivo (uno per tick, con pausa leggibile).
  // ---------------------------------------------------------------------------
  var inCorso = false;
  var ultimaChiaveTurno = "";

  function tick() {
    if (!isMasterOrSolo()) { return; }         // solo il Master/solitaria pilota i nemici
    if (inCorso) { return; }
    var C = combat();
    if (!C || typeof C.getState !== "function") { return; }
    var stato; try { stato = C.getState(); } catch (e) { return; }
    if (!stato.active) { return; }

    var idx = stato.currentTurnIndex;
    var cur = (idx >= 0 && stato.combatants) ? stato.combatants[idx] : null;
    if (!cur || cur.kind !== "npc" || cur.defeated || cur.hitPoints <= 0) { return; }

    // Se non c'e' nessun PG vivo da attaccare, non far girare a vuoto i turni dei nemici: lascia
    // che sia il Master a decidere (evita un ciclo infinito di "passa turno" quando il PG e' a terra).
    if (!pgVivi(stato).length) { return; }

    // Dedup: agisci una sola volta per (round, indice, id) — rete di sicurezza contro la rientranza;
    // in condizioni normali agisciNemico avanza il turno e la chiave cambia da sola al tick seguente.
    var chiave = stato.round + ":" + idx + ":" + cur.id;
    if (chiave === ultimaChiaveTurno) { return; }
    ultimaChiaveTurno = chiave;

    inCorso = true;
    try { agisciNemico(stato, cur); } catch (e) { /* non bloccare il loop */ } finally { inCorso = false; }
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  var timer = null;
  function inizializza() {
    if (!window.document) { return; }
    if (!timer) { timer = window.setInterval(tick, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(33, { enemyAi: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 33 caricato: IA dei nemici (turno automatico dei PNG).");
  }

  window.UltimateVTTEnemyAI = {
    // logica pura (testabile)
    chebyshev: chebyshev,
    cellaVersoBersaglio: cellaVersoBersaglio,
    // lettura (testabile)
    bersaglioPiuVicino: bersaglioPiuVicino,
    // controllo
    isMasterOrSolo: isMasterOrSolo,
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } },
    // utile ai test: esegue un ciclo di polling reale
    _tick: function () { tick(); },
    _reset: function () { inCorso = false; ultimaChiaveTurno = ""; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 33 JS: IA DEI NEMICI ---
