// --- INIZIO MODULO 22 JS: ROUTING DI RETE DEI SISTEMI DI GIOCO (HP, NEBBIA, SPAWN) ---
// Estende la sincronizzazione real-time ai sistemi rimanenti, SENZA modificare i moduli esistenti.
//
// Tutti questi eventi sono GM-autorevoli (il relay li accetta solo dal Master, vedi SOLO_MASTER):
//  - HP/danni:  avvolge UltimateVTTCombat.applyDamageToCombatant / healCombatant.
//  - Nebbia:    avvolge UltimateVTTCanvas.revealCircle / hideCircle / fillFog.
//  - Spawn:     avvolge VTTSpawn.spawn.
//
// Strategia: si instrada l'AZIONE (id+quantita', cella+raggio, lista nemici). Applicare l'azione
// inbound rieseguendo la stessa funzione e' deterministico finche' lo stato di partenza coincide,
// cosa garantita dall'hydration (modulo 18) e dai default condivisi. Durante l'applicazione inbound
// il flag staApplicandoRemoto del Sync Manager impedisce la ri-emissione (niente eco a catena).
(function () {
  "use strict";

  function log(m) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
    if (window.console && console.debug) { console.debug("[VTT-NetEv] " + m); }
  }

  function sync() { return window.UltimateVTTSync || null; }
  function applicandoRemoto() {
    var s = sync();
    return Boolean(s && s.staApplicandoRemoto && s.staApplicandoRemoto());
  }
  // Solo il Master instrada questi eventi. In single-player (Sync disabilitato) emetti() e' un no-op.
  function puoEmettere() {
    var s = sync();
    return Boolean(s && !applicandoRemoto() && s.isMaster());
  }
  function clona(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }

  // ---------------------------------------------------------------------------
  // Emissione
  // ---------------------------------------------------------------------------
  function emettiHp(azione, id, amount) {
    if (!puoEmettere()) { return; }
    var s = sync();
    s.emetti(s.creaEvento(s.TipiEvento.HP_AGGIORNATO, { azione: azione, id: String(id), amount: Number(amount) || 0 }));
  }

  function emettiNebbia(azione, cellX, cellY, radius, hidden) {
    if (!puoEmettere()) { return; }
    var s = sync();
    s.emetti(s.creaEvento(s.TipiEvento.NEBBIA_RIVELATA, {
      azione: azione,
      cellX: Math.trunc(cellX || 0), cellY: Math.trunc(cellY || 0),
      radius: Math.trunc(radius || 0), hidden: Boolean(hidden)
    }));
  }

  function emettiSpawn(list) {
    if (!puoEmettere()) { return; }
    var s = sync();
    s.emetti(s.creaEvento(s.TipiEvento.NEMICO_GENERATO, { list: clona(list) }));
  }

  // ---------------------------------------------------------------------------
  // Wrapping delle funzioni esistenti (idempotente)
  // ---------------------------------------------------------------------------
  function avvolgiCombat() {
    var c = window.UltimateVTTCombat;
    if (!c || c.__netEvWrapped) { return; }
    var origDanno = c.applyDamageToCombatant, origCura = c.healCombatant;
    if (typeof origDanno === "function") {
      c.applyDamageToCombatant = function (id, amount) {
        var r = origDanno.apply(this, arguments);
        if (r !== false) { emettiHp("danno", id, amount); }
        return r;
      };
    }
    if (typeof origCura === "function") {
      c.healCombatant = function (id, amount) {
        var r = origCura.apply(this, arguments);
        if (r !== false) { emettiHp("cura", id, amount); }
        return r;
      };
    }
    c.__netEvWrapped = true;
  }

  function avvolgiCanvas() {
    var cv = window.UltimateVTTCanvas;
    if (!cv || cv.__netEvWrapped) { return; }
    var origRivela = cv.revealCircle, origNascondi = cv.hideCircle, origRiempi = cv.fillFog;
    if (typeof origRivela === "function") {
      cv.revealCircle = function (cellX, cellY, radius) {
        var r = origRivela.apply(this, arguments);
        // Le rivelazioni a raggio 0 sono usate dall'idratazione interna del bridge IA per ricostruire
        // la nebbia cella per cella: non vanno instradate (eviterebbero un'inondazione di eventi).
        if ((Number(radius) || 0) >= 1) { emettiNebbia("rivela", cellX, cellY, radius, false); }
        return r;
      };
    }
    if (typeof origNascondi === "function") {
      cv.hideCircle = function (cellX, cellY, radius) {
        var r = origNascondi.apply(this, arguments);
        emettiNebbia("nascondi", cellX, cellY, radius, true);
        return r;
      };
    }
    if (typeof origRiempi === "function") {
      cv.fillFog = function (hidden) {
        var r = origRiempi.apply(this, arguments);
        emettiNebbia("riempi", 0, 0, 0, hidden);
        return r;
      };
    }
    cv.__netEvWrapped = true;
  }

  function avvolgiSpawn() {
    var sp = window.VTTSpawn;
    if (!sp || sp.__netEvWrapped) { return; }
    var origSpawn = sp.spawn;
    if (typeof origSpawn === "function") {
      sp.spawn = function (list) {
        var r = origSpawn.apply(this, arguments);
        emettiSpawn(list);
        return r;
      };
    }
    sp.__netEvWrapped = true;
  }

  function avvolgiTutto() { avvolgiCombat(); avvolgiCanvas(); avvolgiSpawn(); }

  // ---------------------------------------------------------------------------
  // Applicazione inbound (riesegue l'azione; il guard remoto blocca la ri-emissione)
  // ---------------------------------------------------------------------------
  function gestisciHpInbound(evento) {
    var c = window.UltimateVTTCombat;
    if (!c) { return; }
    var p = evento.payload || {};
    try {
      if (p.azione === "cura" && typeof c.healCombatant === "function") { c.healCombatant(p.id, p.amount); }
      else if (typeof c.applyDamageToCombatant === "function") { c.applyDamageToCombatant(p.id, p.amount); }
    } catch (e) { log("HP inbound fallito: " + (e && e.message)); }
  }

  function gestisciNebbiaInbound(evento) {
    var cv = window.UltimateVTTCanvas;
    if (!cv) { return; }
    var p = evento.payload || {};
    try {
      if (p.azione === "riempi" && typeof cv.fillFog === "function") { cv.fillFog(p.hidden); }
      else if (p.azione === "nascondi" && typeof cv.hideCircle === "function") { cv.hideCircle(p.cellX, p.cellY, p.radius); }
      else if (typeof cv.revealCircle === "function") { cv.revealCircle(p.cellX, p.cellY, p.radius); }
    } catch (e) { log("Nebbia inbound fallita: " + (e && e.message)); }
  }

  function gestisciSpawnInbound(evento) {
    var sp = window.VTTSpawn;
    var p = evento.payload || {};
    try {
      if (sp && typeof sp.spawn === "function" && p.list) { sp.spawn(p.list); }
    } catch (e) { log("Spawn inbound fallito: " + (e && e.message)); }
  }

  function registraAscolti() {
    var s = sync();
    if (!s || typeof s.inAscolto !== "function") { return; }
    s.inAscolto(s.TipiEvento.HP_AGGIORNATO, gestisciHpInbound);
    s.inAscolto(s.TipiEvento.NEBBIA_RIVELATA, gestisciNebbiaInbound);
    s.inAscolto(s.TipiEvento.NEMICO_GENERATO, gestisciSpawnInbound);
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  function inizializza() {
    avvolgiTutto();
    registraAscolti();
    // Alcuni moduli (es. spawn, canvas) potrebbero registrarsi piu' tardi: riprova una volta.
    setTimeout(avvolgiTutto, 0);
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(22, { networkGameEvents: true, hp: true, fog: true, spawn: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 22 caricato: routing di rete di HP/danni, nebbia e spawn nemici.");
  }

  window.UltimateVTTNetEvents = {
    // Riaggancio manuale (utile se i moduli vengono ricreati).
    avvolgi: avvolgiTutto,
    // Esposti per i test / uso programmatico.
    gestisciHpInbound: gestisciHpInbound,
    gestisciNebbiaInbound: gestisciNebbiaInbound,
    gestisciSpawnInbound: gestisciSpawnInbound
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 22 JS: ROUTING DI RETE DEI SISTEMI DI GIOCO ---
