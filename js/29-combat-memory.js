// --- INIZIO MODULO 29 JS: MEMORIA DI COMBATTIMENTO PER IL MASTER IA ---
// Il Master IA (js/12: Groq/Ollama) non riceveva MAI gli eventi di combattimento: i moduli di
// gioco (attacchi/danni in js/06, XP/loot in js/15, spawn in js/16, reazioni/spinte/superfici/
// elevazione nei moduli 24/26/27/28) narrano tutto nella chat VISIBILE, ma quella narrazione non
// finiva mai nella cronologia (`groqChatHistory`) inviata all'IA — che quindi "non sapeva" cosa
// fosse successo in battaglia e non poteva riprendere la storia in modo coerente a scontro finito.
//
// Questo modulo osserva (per polling, senza modificare nessun modulo esistente) tutto cio' che
// accade durante un combattimento e, alla fine dello scontro, costruisce un riepilogo conciso che
// inietta nella MEMORIA REALE del Master IA tramite le funzioni esposte da js/12
// (UltimateVTTCoreGameplay.notifyMasterMemory / setUltimoRiepilogoCombattimento):
//  - notifyMasterMemory: entra nella cronologia inviata a Groq (gli ultimi scambi).
//  - setUltimoRiepilogoCombattimento: resta disponibile anche oltre la finestra scorrevole della
//    cronologia (16 messaggi) ed e' incluso nel prompt di sistema sia di Groq sia di Ollama
//    (quest'ultimo del tutto stateless altrimenti).
//
// Cattura gli eventi in due modi complementari, per non perdere nulla indipendentemente dal
// percorso UI usato:
//  1) Polling di combatState.lastEvent (scritto sia dal tracker classico a due fasi sia dalla
//     nuova HUD stile BG3, sia da applyDamageToCombatant/healCombatant): cattura ogni attacco/
//     danno/cura, qualunque sia il pulsante che l'ha originato.
//  2) Wrapping di UltimateVTTCoreGameplay.appendChatMessage per bufferizzare i messaggi "system"
//     gia' narrati da XP/loot, spawn, reazioni, spinte, superfici, elevazione durante il
//     combattimento (quel testo e' gia' buono: lo si riusa cosi' com'e').
//  3) Confronto dei combattenti "defeated" tra un tick e l'altro: rete di sicurezza che cattura
//     le sconfitte causate da QUALSIASI via (anche danni applicati fuori da resolveAttack, es.
//     dal bridge IA o dal pannello GM), indipendentemente dal testo narrato.
(function () {
  "use strict";

  var INTERVALLO_MS = 300;
  var MAX_RIGHE_DIGEST = 14;

  function combat() { return window.UltimateVTTCombat || null; }
  function coreGameplay() { return window.UltimateVTTCoreGameplay || null; }
  function progression() { return window.VTTProgression || null; }
  function statoPg() { return window.UltimateVTTState || null; }

  function log(m) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Stato locale
  // ---------------------------------------------------------------------------
  var combattimentoAttivo = false;
  var bufferEventi = [];
  var ultimoEventoVisto = "";
  var defeatedPrecedenti = {};
  var ultimoSnapshotAttivo = null; // { round, combatants } dell'ultimo tick con active:true
  var xpGoldIniziali = null;

  function idPgAttivo() {
    var S = statoPg();
    if (!S || typeof S.getState !== "function") { return null; }
    try { var st = S.getState(); return st && st.identity ? st.identity.id : null; } catch (e) { return null; }
  }

  function xpGoldCorrenti() {
    var P = progression();
    var id = idPgAttivo();
    if (!P || !id || typeof P.getProg !== "function") { return null; }
    try { var prog = P.getProg(id); return { xp: prog.xp || 0, gold: prog.gold || 0, livello: prog.level || 1 }; } catch (e) { return null; }
  }

  // ---------------------------------------------------------------------------
  // Bufferizzazione: wrapping di appendChatMessage (idempotente) per catturare la narrazione gia'
  // prodotta da XP/loot, spawn, reazioni, spinte, superfici, elevazione mentre il combattimento e' attivo.
  // ---------------------------------------------------------------------------
  function bufferizza(testo) {
    if (!testo) { return; }
    var t = String(testo);
    if (bufferEventi.length && bufferEventi[bufferEventi.length - 1] === t) { return; } // evita ripetizioni consecutive identiche
    bufferEventi.push(t);
  }

  var wrappingFatto = false;
  function avvolgiAppendChatMessage() {
    var CG = coreGameplay();
    if (!CG || wrappingFatto || typeof CG.appendChatMessage !== "function") { return; }
    var originale = CG.appendChatMessage;
    CG.appendChatMessage = function (speaker, testo) {
      var r = originale.apply(this, arguments);
      if (combattimentoAttivo && speaker === "system") { bufferizza(testo); }
      return r;
    };
    wrappingFatto = true;
  }

  // ---------------------------------------------------------------------------
  // Rilevamento avvio/fine combattimento + raccolta eventi per polling
  // ---------------------------------------------------------------------------
  function nomiCombattenti(lista, filtro) {
    return (lista || []).filter(filtro).map(function (c) { return c.name || c.id; });
  }

  function costruisciEsito(combattenti) {
    var pg = (combattenti || []).filter(function (c) { return c.kind === "pc"; });
    var pnc = (combattenti || []).filter(function (c) { return c.kind === "npc"; });
    var pgVivi = pg.filter(function (c) { return !c.defeated; });
    var pncVivi = pnc.filter(function (c) { return !c.defeated; });
    if (pg.length && pgVivi.length === 0) { return "sconfitta del party"; }
    if (pnc.length && pncVivi.length === 0 && pgVivi.length > 0) { return "vittoria del party"; }
    return "combattimento interrotto";
  }

  function costruisciDigest(snapshotFinale) {
    var combattenti = (snapshotFinale && snapshotFinale.combatants) || [];
    var round = (snapshotFinale && snapshotFinale.round) || 0;
    var esito = costruisciEsito(combattenti);
    var sconfitti = nomiCombattenti(combattenti, function (c) { return c.defeated; });

    var righe = [];
    righe.push("📋 RIEPILOGO DEL COMBATTIMENTO APPENA CONCLUSO (usalo per continuare la narrazione in modo coerente, senza ripetere domande su cosa e' successo):");
    righe.push("Esito: " + esito + " dopo " + round + " round" + (sconfitti.length ? "; sconfitti: " + sconfitti.join(", ") + "." : "."));

    var eventi = bufferEventi.slice(-MAX_RIGHE_DIGEST);
    if (eventi.length) {
      if (bufferEventi.length > MAX_RIGHE_DIGEST) { righe.push("[...eventi precedenti omessi per brevita'...]"); }
      eventi.forEach(function (e) { righe.push("- " + e); });
    }

    var pgFinali = combattenti.filter(function (c) { return c.kind === "pc"; });
    if (pgFinali.length) {
      righe.push("Stato finale del party: " + pgFinali.map(function (c) {
        return (c.name || c.id) + " " + Math.max(0, c.hitPoints) + "/" + (c.maxHitPoints || c.hitPoints) + " HP" + (c.defeated ? " (a terra)" : "");
      }).join(", ") + ".");
    }

    var xpGoldFinali = xpGoldCorrenti();
    if (xpGoldIniziali && xpGoldFinali) {
      var deltaXp = xpGoldFinali.xp - xpGoldIniziali.xp;
      var deltaGold = xpGoldFinali.gold - xpGoldIniziali.gold;
      if (deltaXp > 0 || deltaGold > 0) {
        righe.push("Guadagni: " + (deltaXp > 0 ? "+" + deltaXp + " XP" : "") + (deltaXp > 0 && deltaGold > 0 ? ", " : "") + (deltaGold > 0 ? "+" + deltaGold + " oro" : "") + ".");
      }
      if (xpGoldFinali.livello > xpGoldIniziali.livello) {
        righe.push("Il personaggio e' salito al livello " + xpGoldFinali.livello + " durante lo scontro.");
      }
    }

    return righe.join("\n");
  }

  function iniziaTracciamento(stato) {
    combattimentoAttivo = true;
    bufferEventi = [];
    ultimoEventoVisto = "";
    defeatedPrecedenti = {};
    (stato.combatants || []).forEach(function (c) { defeatedPrecedenti[c.id] = Boolean(c.defeated); });
    ultimoSnapshotAttivo = { round: stato.round, combatants: stato.combatants };
    xpGoldIniziali = xpGoldCorrenti();
  }

  function aggiornaTracciamento(stato) {
    // Attacchi/danni/cure gia' narrati in combatState.lastEvent, indipendentemente dal percorso UI.
    var evento = stato.lastEvent;
    if (evento && evento !== ultimoEventoVisto && evento !== "Combattimento iniziato." && evento !== "Combattimento terminato.") {
      bufferizza(evento);
    }
    ultimoEventoVisto = evento;

    // Rete di sicurezza: sconfitte rilevate confrontando lo stato, qualunque ne sia stata la causa.
    (stato.combatants || []).forEach(function (c) {
      var eraSconfitto = Boolean(defeatedPrecedenti[c.id]);
      var oraSconfitto = Boolean(c.defeated);
      if (oraSconfitto && !eraSconfitto) { bufferizza("☠ " + (c.name || c.id) + " è stato sconfitto."); }
      defeatedPrecedenti[c.id] = oraSconfitto;
    });

    ultimoSnapshotAttivo = { round: stato.round, combatants: stato.combatants };
  }

  function terminaTracciamento() {
    if (!ultimoSnapshotAttivo) { combattimentoAttivo = false; return; }
    var digest = costruisciDigest(ultimoSnapshotAttivo);
    combattimentoAttivo = false;

    var CG = coreGameplay();
    if (CG) {
      if (typeof CG.notifyMasterMemory === "function") { try { CG.notifyMasterMemory(digest); } catch (e) { /* ignora */ } }
      if (typeof CG.setUltimoRiepilogoCombattimento === "function") { try { CG.setUltimoRiepilogoCombattimento(digest); } catch (e) { /* ignora */ } }
      if (typeof CG.appendChatMessage === "function") {
        try { CG.appendChatMessage("system", "📋 Combattimento concluso: " + costruisciEsito(ultimoSnapshotAttivo.combatants) + " (round " + ultimoSnapshotAttivo.round + ")."); } catch (e) { /* ignora */ }
      }
    }
    log("Modulo 29: riepilogo di combattimento inviato alla memoria del Master IA.");
    ultimoSnapshotAttivo = null;
    bufferEventi = [];
  }

  // ---------------------------------------------------------------------------
  // Ciclo di polling
  // ---------------------------------------------------------------------------
  function tick() {
    var C = combat();
    if (!C || typeof C.getState !== "function") { return; }
    var stato; try { stato = C.getState(); } catch (e) { return; }
    var attivoOra = Boolean(stato.active);

    if (attivoOra && !combattimentoAttivo) { iniziaTracciamento(stato); return; }
    if (attivoOra && combattimentoAttivo) { aggiornaTracciamento(stato); return; }
    if (!attivoOra && combattimentoAttivo) { terminaTracciamento(); return; }
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  var timer = null;
  function inizializza() {
    if (!window.document) { return; }
    avvolgiAppendChatMessage();
    if (!timer) { timer = window.setInterval(tick, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(29, { combatMemory: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 29 caricato: memoria di combattimento per il Master IA.");
  }

  window.UltimateVTTCombatMemory = {
    // logica pura (testabile)
    costruisciEsito: costruisciEsito,
    costruisciDigest: costruisciDigest,
    // controllo
    combattimentoAttivo: function () { return combattimentoAttivo; },
    bufferCorrente: function () { return bufferEventi.slice(); },
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } },
    // utile ai test: esegue un ciclo di polling reale
    _tick: function () { tick(); },
    _reset: function () {
      combattimentoAttivo = false; bufferEventi = []; ultimoEventoVisto = "";
      defeatedPrecedenti = {}; ultimoSnapshotAttivo = null; xpGoldIniziali = null;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 29 JS: MEMORIA DI COMBATTIMENTO PER IL MASTER IA ---
