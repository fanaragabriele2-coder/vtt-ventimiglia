// --- INIZIO MODULO 42 JS: NET OUTBOX (stato "Supabase-ready" con debounce/throttle) ---
// Task 2 della specifica "Lead Technical Director": preparare lo state manager al multiplayer
// reale (Supabase/WebSocket) SENZA floodare la rete. Il problema classico: l'utente trascina lo
// slider degli HP o muove un token — lo state manager notifica decine di cambi al secondo; se
// ognuno diventasse un pacchetto di rete, il canale si intaserebbe di payload identici a distanza
// di millisecondi.
//
// Questo modulo osserva le fonti di stato esistenti (UltimateVTTState per la scheda PG, il Global
// Game State del modulo 36, le posizioni dei token del modulo 08) e le COALIZZA:
//   - debounce con coda (attende che i cambi si fermino per DEBOUNCE_MS prima di emettere), MA
//   - con un tetto massimo di attesa (MAX_WAIT_MS): se l'utente continua a trascinare senza mai
//     fermarsi, un payload parte comunque a cadenza regolare (throttle garantito) — mai piu' di
//     ~1 pacchetto al secondo per flusso continuo, e sempre un pacchetto finale a mano ferma.
//
// Ogni emissione produce un PAYLOAD JSON PULITO (solo dati, niente riferimenti interni, pronto per
// JSON.stringify -> WebSocket): un DELTA con le sole sezioni cambiate rispetto all'ultimo snapshot
// inviato. Il payload finisce in un outbox limitato (ispezionabile) e, se un transport e' stato
// registrato con setTransport(fn) — il futuro canale Supabase — viene consegnato a quello.
//
// NON duplica il layer multiplayer esistente: il modulo 20 continua a streammare le posizioni dei
// token a 10Hz per la sessione live via relay; questo outbox e' il canale di PERSISTENZA/SYNC di
// stato (schede, HP, posizione del party, combattimento on/off) pensato per un backend documentale.
// Logica di coalescing e diff in funzioni PURE (timer e clock iniettabili), testabili senza DOM.
(function () {
  "use strict";

  var DEBOUNCE_MS = 250;   // quiete minima prima di emettere (i trascinamenti si fondono in 1)
  var MAX_WAIT_MS = 1000;  // ma mai piu' di 1s senza emettere se i cambi continuano (throttle)
  var POLL_TOKEN_MS = 400; // campionamento leggero delle posizioni token (confronto, non emissione)
  var OUTBOX_MAX = 50;     // payload conservati per il futuro drain verso Supabase

  // ---------------------------------------------------------------------------
  // SNAPSHOT NORMALIZZATO (pulito): estrae dallo stato interno solo cio' che ha senso spedire.
  // ---------------------------------------------------------------------------
  function snapshotPg() {
    try {
      var s = window.UltimateVTTState.getState();
      return {
        id: s.identity.id,
        name: s.identity.name,
        className: s.identity.className || "",
        level: s.identity.level || 1,
        hp: { current: s.resources.hp.current, max: s.resources.hp.max, temporary: s.resources.hp.temporary || 0 },
        armorClass: s.resources.armorClass,
        speedMeters: s.resources.speedMeters,
        proficiencyBonus: s.proficiencyBonus || 2
      };
    } catch (e) { return null; }
  }

  function snapshotTokens() {
    try {
      var st = window.UltimateVTTTokenPhysics.getState();
      return (st.tokens || []).filter(function (t) { return !t.hidden; }).map(function (t) {
        return { id: t.id, name: t.name, cellX: t.cellX, cellY: t.cellY };
      });
    } catch (e) { return null; }
  }

  function snapshotCombat() {
    try {
      var c = window.UltimateVTTCombat.getState();
      return { active: Boolean(c.active), round: c.round || 0 };
    } catch (e) { return null; }
  }

  function snapshotLocation() {
    try {
      var S = window.UltimateVTTGameState;
      var loc = S ? S.get("party.location") : null;
      return loc && loc.name ? { name: loc.name } : null;
    } catch (e) { return null; }
  }

  function snapshotCompleto() {
    return {
      pg: snapshotPg(),
      tokens: snapshotTokens(),
      combat: snapshotCombat(),
      location: snapshotLocation()
    };
  }

  // ---------------------------------------------------------------------------
  // DIFF PURO tra due snapshot: ritorna { delta, sezioni } con le SOLE sezioni cambiate
  // (confronto strutturale via JSON: gli snapshot sono gia' dati puri e piccoli), oppure null se
  // niente e' cambiato — in tal caso NON si emette alcun payload (un giro di slider che torna al
  // valore di partenza non spedisce nulla).
  // ---------------------------------------------------------------------------
  function diffSnapshot(precedente, corrente) {
    precedente = precedente || {};
    var delta = {}, sezioni = [];
    ["pg", "tokens", "combat", "location"].forEach(function (chiave) {
      var a = JSON.stringify(precedente[chiave] === undefined ? null : precedente[chiave]);
      var b = JSON.stringify(corrente[chiave] === undefined ? null : corrente[chiave]);
      if (a !== b) { delta[chiave] = corrente[chiave]; sezioni.push(chiave); }
    });
    return sezioni.length ? { delta: delta, sezioni: sezioni } : null;
  }

  // ---------------------------------------------------------------------------
  // COALESCER PURO (factory): fonde raffiche di segnalazioni in poche emissioni.
  //   creaCoalescer(emetti, opzioni) -> { segna(motivo), flushOra(), pendente() }
  // opzioni.debounceMs / maxWaitMs / setTimeout / clearTimeout / now iniettabili: nei test si
  // usano timer finti e si verifica il comportamento senza attese reali.
  // ---------------------------------------------------------------------------
  function creaCoalescer(emetti, opzioni) {
    opzioni = opzioni || {};
    var debounceMs = opzioni.debounceMs != null ? opzioni.debounceMs : DEBOUNCE_MS;
    var maxWaitMs = opzioni.maxWaitMs != null ? opzioni.maxWaitMs : MAX_WAIT_MS;
    var setT = opzioni.setTimeout || function (f, ms) { return window.setTimeout(f, ms); };
    var clearT = opzioni.clearTimeout || function (id) { window.clearTimeout(id); };
    var now = opzioni.now || function () { return Date.now(); };

    var timerId = null;
    var primaSegnatura = 0;
    var motivi = {};

    function flush() {
      if (timerId != null) { clearT(timerId); timerId = null; }
      var lista = Object.keys(motivi);
      motivi = {};
      primaSegnatura = 0;
      if (lista.length) { emetti(lista); }
    }

    function segna(motivo) {
      motivi[String(motivo || "stato")] = true;
      var adesso = now();
      if (!primaSegnatura) { primaSegnatura = adesso; }

      // Tetto di attesa (throttle): se la raffica dura da troppo, emetti SUBITO — l'utente che
      // trascina uno slider per 5 secondi produce ~5 payload, non 0-fino-al-rilascio ne' 300.
      if (adesso - primaSegnatura >= maxWaitMs) { flush(); return; }

      // Debounce a coda: ogni nuova segnalazione riparte l'attesa di quiete.
      if (timerId != null) { clearT(timerId); }
      timerId = setT(flush, debounceMs);
    }

    return { segna: segna, flushOra: flush, pendente: function () { return timerId != null || Object.keys(motivi).length > 0; } };
  }

  // ---------------------------------------------------------------------------
  // COSTRUZIONE PAYLOAD (puro): il pacchetto che in futuro viaggera' su Supabase/WebSocket.
  // Versionato (v:1) cosi' il backend potra' evolvere il formato senza ambiguita'.
  // ---------------------------------------------------------------------------
  function costruisciPayload(sezioniSporche, esitoDiff, ts) {
    return {
      v: 1,
      tipo: "vtt/delta-stato",
      ts: ts != null ? ts : Date.now(),
      motivi: sezioniSporche.slice().sort(),
      sezioni: esitoDiff.sezioni,
      delta: esitoDiff.delta
    };
  }

  // ---------------------------------------------------------------------------
  // Stato del modulo: ultimo snapshot INVIATO (base dei delta), outbox, transport futuro.
  // ---------------------------------------------------------------------------
  var ultimoInviato = null;
  var outbox = [];
  var transport = null;
  var ultimoPayload = null;

  function emettiDelta(motivi) {
    var corrente = snapshotCompleto();
    var esito = diffSnapshot(ultimoInviato, corrente);
    if (!esito) { return null; } // raffica che torna al punto di partenza: zero traffico
    ultimoInviato = corrente;

    var payload = costruisciPayload(motivi, esito);
    ultimoPayload = payload;
    outbox.push(payload);
    if (outbox.length > OUTBOX_MAX) { outbox.splice(0, outbox.length - OUTBOX_MAX); }

    // Consegna al transport se registrato (futuro canale Supabase); un transport rotto non deve
    // mai bloccare il gioco locale.
    if (typeof transport === "function") {
      try { transport(payload); } catch (e) { /* il gioco continua offline */ }
    }
    // Notifica sul bus condiviso (modulo 36): altri moduli possono reagire senza conoscerci.
    try {
      if (window.UltimateVTTGameState) { window.UltimateVTTGameState.publish("net:delta", payload); }
    } catch (e) { /* bus opzionale */ }
    return payload;
  }

  var coalescer = creaCoalescer(emettiDelta, {});

  // ---------------------------------------------------------------------------
  // AGGANCI alle fonti esistenti (in sola lettura, nessun modulo modificato):
  //  - UltimateVTTState.subscribe: ogni cambio scheda (HP, CA, caratteristiche) segna "pg";
  //  - Global Game State "change": posizione party / combattimento segnano la loro chiave;
  //  - token: campionamento leggero (le posizioni non emettono eventi) — il confronto vero lo fa
  //    comunque diffSnapshot al flush, quindi il poll serve solo ad accorgersi che C'E' movimento.
  // ---------------------------------------------------------------------------
  var agganciFatti = { stato: false, bus: false };
  var firmaTokenPrecedente = "";

  function collegaFonti() {
    if (!agganciFatti.stato && window.UltimateVTTState && typeof window.UltimateVTTState.subscribe === "function") {
      try {
        window.UltimateVTTState.subscribe(function (motivo) { coalescer.segna("pg:" + (motivo || "cambio")); });
        agganciFatti.stato = true;
      } catch (e) { /* riprova al giro dopo */ }
    }
    if (!agganciFatti.bus && window.UltimateVTTGameState && typeof window.UltimateVTTGameState.subscribe === "function") {
      try {
        window.UltimateVTTGameState.subscribe("change", function (ev) { coalescer.segna("stato:" + (ev && ev.chiave || "chiave")); });
        agganciFatti.bus = true;
      } catch (e) { /* riprova al giro dopo */ }
    }
  }

  function campionaToken() {
    var tokens = snapshotTokens();
    if (tokens === null) { return; }
    var firma = "";
    for (var i = 0; i < tokens.length; i += 1) { firma += tokens[i].id + ":" + tokens[i].cellX + "," + tokens[i].cellY + ";"; }
    if (firma !== firmaTokenPrecedente) {
      if (firmaTokenPrecedente !== "") { coalescer.segna("tokens"); }
      firmaTokenPrecedente = firma;
    }
  }

  var timer = null;
  function inizializza() {
    if (!window.document) { return; }
    collegaFonti();
    // Base dei delta: lo stato al caricamento (il primo payload descrivera' il primo VERO cambio,
    // non l'intero stato iniziale — per l'hydration completa c'e' gia' il sistema di salvataggio).
    ultimoInviato = snapshotCompleto();
    if (!timer) {
      timer = window.setInterval(function () { collegaFonti(); campionaToken(); }, POLL_TOKEN_MS);
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(42, { netOutbox: true }); } catch (e) { /* best-effort */ }
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog("Modulo 42 caricato: net outbox Supabase-ready (delta coalizzati, max ~1/s)."); } catch (e) { /* ignora */ }
    }
  }

  window.UltimateVTTNetOutbox = {
    // logica pura (testabile senza DOM/rete)
    diffSnapshot: diffSnapshot,
    creaCoalescer: creaCoalescer,
    costruisciPayload: costruisciPayload,
    // lettura
    snapshot: snapshotCompleto,
    getUltimoPayload: function () { return ultimoPayload; },
    getOutbox: function () { return outbox.slice(); },
    // svuota l'outbox restituendo i payload accumulati: e' cio' che il futuro worker Supabase
    // chiamera' a connessione (ri)stabilita per recuperare i cambi persi offline.
    drain: function () { var lista = outbox.slice(); outbox.length = 0; return lista; },
    // transport futuro (Supabase/WebSocket): fn(payload) chiamata a ogni emissione.
    setTransport: function (fn) { transport = typeof fn === "function" ? fn : null; },
    // controllo (utile ai test)
    _segna: function (m) { coalescer.segna(m); },
    _flushOra: function () { coalescer.flushOra(); },
    _resetBase: function () { ultimoInviato = snapshotCompleto(); },
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 42 JS: NET OUTBOX ---
