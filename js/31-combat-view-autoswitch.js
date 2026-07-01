// --- INIZIO MODULO 31 JS: CAMBIO AUTOMATICO ALLA GRIGLIA TATTICA A INIZIO COMBATTIMENTO ---
// Il gioco ha tre superfici visive indipendenti, commutate SOLO manualmente da un pulsante: la
// mappa reale di Ventimiglia (Leaflet/OSM, window.VentimigliaMap), l'esplorazione fullscreen
// "Campagna" (window.VTTCampagna) e la griglia tattica di combattimento (UltimateVTTCanvas, dietro
// l'id #vttCanvas). UltimateVTTCombat.startCombat() non tocca nessuna di queste tre — quindi se il
// Master (che spesso gioca da solo con tutti i giocatori sullo stesso laptop, in hotseat) sta
// guardando la mappa di Ventimiglia o l'esplorazione quando parte un combattimento (es. innescato
// automaticamente da uno spawn nemico, js/16), la griglia — coi token e TUTTI gli overlay BG3
// (elevazione 28, superfici 27, condizioni 30, fiancheggiamento 25) — resta invisibile dietro un
// div nascosto: il Master "perde" il combattimento appena iniziato.
//
// Questo modulo osserva (per polling, senza modificare nessun modulo esistente) la transizione
// "combattimento assente -> attivo" e forza il ritorno alla griglia tattica chiamando deactivate()
// sulle altre due superfici, se presenti. Non fa nulla alla FINE del combattimento: il Master resta
// libero di tornare manualmente all'esplorazione quando vuole.
(function () {
  "use strict";

  var INTERVALLO_MS = 300;

  function combat() { return window.UltimateVTTCombat || null; }
  function log(m) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
  }

  var eraAttivo = false;
  var numeroCommutazioni = 0;

  function mostraGrigliaTattica() {
    var VM = window.VentimigliaMap;
    if (VM && typeof VM.deactivate === "function") { try { VM.deactivate(); } catch (e) { /* ignora */ } }
    var CAMP = window.VTTCampagna;
    if (CAMP && typeof CAMP.deactivate === "function") { try { CAMP.deactivate(); } catch (e) { /* ignora */ } }
    numeroCommutazioni += 1;
    log("Modulo 31: combattimento avviato, si torna alla griglia tattica.");
  }

  function tick() {
    var C = combat();
    if (!C || typeof C.getState !== "function") { return; }
    var stato; try { stato = C.getState(); } catch (e) { return; }
    var attivoOra = Boolean(stato.active);
    if (attivoOra && !eraAttivo) { mostraGrigliaTattica(); }
    eraAttivo = attivoOra;
  }

  var timer = null;
  function inizializza() {
    if (!window.document) { return; }
    if (!timer) { timer = window.setInterval(tick, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(31, { combatViewAutoswitch: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 31 caricato: cambio automatico alla griglia tattica a inizio combattimento.");
  }

  window.UltimateVTTCombatViewSwitch = {
    // controllo/lettura (utile ai test)
    numeroCommutazioni: function () { return numeroCommutazioni; },
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } },
    _tick: function () { tick(); },
    _reset: function () { eraAttivo = false; numeroCommutazioni = 0; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 31 JS: CAMBIO AUTOMATICO ALLA GRIGLIA TATTICA ---
