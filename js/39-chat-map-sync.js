// --- INIZIO MODULO 39 JS: CHAT -> MAPPA VENTIMIGLIA (event listener sui POI) ---
// REGOLA 3 della specifica "Lead Game Designer": quando il MASTER narra un cambio di location
// nominando un POI di Ventimiglia (es. "Arrivate alla Passeggiata", "Giungete al Forte
// dell'Annunziata"), un listener sulla chat estrae il nome via parsing, lo mappa al POI codificato
// e trasla automaticamente l'icona del party sulla mappa overworld — senza che il giocatore debba
// spostarsi a mano.
//
// Unifica chat e mappe attraverso il Global Game State (modulo 36, VINCOLO NEGATIVO 1): la posizione
// del party vive in UN solo posto ("party.location"); questo modulo la scrive, le mappe la seguono.
// Non duplica lo stato e non entra in conflitto col percorso JSON esistente (campo "moveTo"/
// "teleportCity" del Master IA in js/12): se il party è GIA' in quel POI, non rifa il movimento.
//
// Si aggancia avvolgendo appendChatMessage (idempotente, stesso schema dei moduli 29 e 34). Il
// riconoscimento del luogo è una funzione PURA e testabile.
(function () {
  "use strict";

  var RITARDO_MS = 320; // lascia correre prima l'eventuale percorso JSON (moveTo) del Master IA

  function isMasterOrSolo() { return !window.UltimateVTTSync || window.UltimateVTTSync.isMaster(); }
  function stato() { return window.UltimateVTTGameState || null; }

  // ---------------------------------------------------------------------------
  // Alias semantici -> nome canonico del POI (data-driven). Non è "hardcode nella logica": è una
  // tabella dati estendibile, come i cataloghi di razze/classi/item. Il matcher sotto la consulta.
  // ---------------------------------------------------------------------------
  var ALIAS_POI = {
    "passeggiata": "Lungomare", "lungomare": "Lungomare", "spiaggia": "Lungomare",
    "stazione": "Stazione FS", "treni": "Stazione FS", "treno": "Stazione FS",
    "porto": "Porto Turistico", "molo": "Porto Turistico", "banchina": "Porto Turistico",
    "forte": "Forte dell'Annunziata", "annunziata": "Forte dell'Annunziata", "fortezza": "Forte dell'Annunziata",
    "giardini": "Giardini Hanbury", "hanbury": "Giardini Hanbury",
    "balzi": "Balzi Rossi", "grotte": "Balzi Rossi",
    "cattedrale": "Cattedrale Assunta", "duomo": "Cattedrale Assunta", "chiesa": "Cattedrale Assunta",
    "teatro": "Teatro Romano", "romano": "Teatro Romano", "rovine": "Teatro Romano",
    "municipio": "Municipio", "comune": "Municipio",
    "mercato": "Mercato Settimanale",
    "orologio": "Torre dell'Orologio", "torre": "Torre dell'Orologio",
    "ponte": "Ponte sul Roya", "roya": "Ponte sul Roya",
    "citta alta": "Città Alta", "città alta": "Città Alta", "borgo": "Città Alta", "collina": "Città Alta",
    "confine": "Confine Italia-FR", "frontiera": "Confine Italia-FR", "dogana": "Confine Italia-FR",
    "capo": "Capo Mortola", "mortola": "Capo Mortola"
  };

  // Verbi/locuzioni di ARRIVO nella narrazione del Master (distinti dall'intento di movimento del
  // giocatore, gestito altrove): "arrivate/giungete/entrate/vi trovate/eccovi a/raggiungete...".
  var ARRIVO_RE = /\b(arriv\w+|giung\w+|giunti|entr(?:ate|i|ano)|raggiung\w+|approd\w+|sbuc\w+|sal(?:ite|iate)|scend(?:ete|i)|vi inerpicate|percorrete|vi (?:ritrovate|trovate|affacciate)|eccovi|siete (?:a|davanti|presso|in|giunti)|vi accoglie|vi conduce|dopo il (?:viaggio|cammino)|vi lasciate alle spalle)\b/i;

  // ---------------------------------------------------------------------------
  // Riconoscimento del luogo (PURO): dato il testo del Master e l'elenco POI noti, ritorna il nome
  // canonico del POI verso cui spostare il party, oppure null. Serve un contesto di ARRIVO più il
  // nome (alias, nome completo, o parole chiave), così una menzione di sfuggita non teletrasporta.
  //   opzioni.richiediArrivo (default true): se false, basta il nome (utile ai test del solo match).
  // ---------------------------------------------------------------------------
  function rilevaLuogo(testo, elencoPOI, opzioni) {
    opzioni = opzioni || {};
    var richiediArrivo = opzioni.richiediArrivo !== false;
    if (!testo) { return null; }
    var t = String(testo).toLowerCase().replace(/[''`]/g, " ");

    if (richiediArrivo && !ARRIVO_RE.test(t)) { return null; }

    // 1) Alias semantici (match più lungo vince).
    var aliasMatch = null, aliasLen = 0;
    Object.keys(ALIAS_POI).forEach(function (k) {
      if (t.indexOf(k) >= 0 && k.length > aliasLen) { aliasMatch = ALIAS_POI[k]; aliasLen = k.length; }
    });
    if (aliasMatch && appartiene(aliasMatch, elencoPOI)) { return aliasMatch; }
    if (aliasMatch && !elencoPOI) { return aliasMatch; }

    // 2) Nome completo del POI (match più lungo vince).
    var poi = elencoPOI || [];
    var nomeMatch = null, nomeLen = 0;
    poi.forEach(function (name) {
      var n = String(name).toLowerCase().replace(/[''`]/g, " ");
      if (t.indexOf(n) >= 0 && n.length > nomeLen) { nomeMatch = name; nomeLen = n.length; }
    });
    if (nomeMatch) { return nomeMatch; }

    // 3) Parole chiave (>3 char) dei nomi POI, punteggio per lunghezza.
    var candidati = [];
    poi.forEach(function (name) {
      var parole = String(name).toLowerCase().split(/[\s.']+/).filter(function (w) { return w.length > 3; });
      var punti = 0;
      parole.forEach(function (w) { if (t.indexOf(w) >= 0) { punti += w.length; } });
      if (punti > 0) { candidati.push({ name: name, punti: punti }); }
    });
    if (candidati.length) { candidati.sort(function (a, b) { return b.punti - a.punti; }); return candidati[0].name; }

    return null;
  }

  function appartiene(nome, elenco) {
    if (!elenco) { return false; }
    var n = String(nome).toLowerCase();
    return elenco.some(function (x) { return String(x).toLowerCase() === n; });
  }

  // ---------------------------------------------------------------------------
  // Applicazione: sposta il party sul POI, aggiornando la fonte unica (Global Game State) e poi le
  // mappe (overworld Campagna + mappa reale Ventimiglia). GM-autorevole come le altre azioni.
  // ---------------------------------------------------------------------------
  function elencoPlaces() {
    try { if (window.VTTCampagna && window.VTTCampagna.places) { return window.VTTCampagna.places(); } } catch (e) { /* ignora */ }
    return null;
  }

  function posizioneCorrenteNome() {
    var S = stato();
    if (!S) { return null; }
    var loc = S.get("party.location");
    return loc && loc.name ? loc.name : null;
  }

  function spostaSuPOI(nome) {
    if (!nome) { return false; }
    // Idempotenza: se il party è già lì (magari mosso dal percorso JSON del Master IA), non rifare.
    if (posizioneCorrenteNome() === nome) { return false; }

    var applicato = false;
    try { if (window.VTTCampagna && window.VTTCampagna.goToPlace) { applicato = Boolean(window.VTTCampagna.goToPlace(nome)) || applicato; } } catch (e) { /* ignora */ }
    try { if (window.VentimigliaMap && window.VentimigliaMap.goTo) { window.VentimigliaMap.goTo(nome); applicato = true; } } catch (e) { /* ignora */ }

    // Fonte unica: registra la posizione e notifica (le mappe e la HUD possono reagire allo stesso
    // evento invece di tenere copie divergenti).
    var S = stato();
    if (S) {
      S.set("party.location", { name: nome });
      S.publish("party:moved", { name: nome, fonte: "chat-master" });
    }
    return applicato || Boolean(S);
  }

  function processa(testo) {
    if (!isMasterOrSolo()) { return; }
    // Durante il combattimento la chat è in pausa e non si esplora: nessuno spostamento overworld.
    try {
      var c = window.UltimateVTTCombat && window.UltimateVTTCombat.getState && window.UltimateVTTCombat.getState();
      if (c && c.active) { return; }
    } catch (e) { /* ignora */ }

    var nome = rilevaLuogo(testo, elencoPlaces());
    if (nome) { spostaSuPOI(nome); }
  }

  // ---------------------------------------------------------------------------
  // Aggancio alla chat: avvolge appendChatMessage (idempotente) e processa i messaggi del Master.
  // Ritardato di RITARDO_MS per lasciare correre prima l'eventuale percorso JSON (moveTo) del gioco.
  // ---------------------------------------------------------------------------
  var timerFlush = null, codaTesto = null;
  function pianifica(testo) {
    codaTesto = testo;
    if (timerFlush) { return; }
    timerFlush = window.setTimeout(function () { timerFlush = null; var t = codaTesto; codaTesto = null; processa(t); }, RITARDO_MS);
  }

  var avvolto = false;
  function avvolgiChat() {
    var CG = window.UltimateVTTCoreGameplay;
    if (avvolto || !CG || typeof CG.appendChatMessage !== "function") { return; }
    var originale = CG.appendChatMessage;
    CG.appendChatMessage = function (speaker, testo) {
      var r = originale.apply(this, arguments);
      if (speaker === "master") { try { pianifica(testo); } catch (e) { /* ignora */ } }
      return r;
    };
    avvolto = true;
  }

  var timerAvvolgi = null;
  function inizializza() {
    if (!window.document) { return; }
    avvolgiChat();
    if (!avvolto && !timerAvvolgi) {
      // Il core gameplay potrebbe non essere ancora pronto: ritenta finché non c'è.
      timerAvvolgi = window.setInterval(function () { avvolgiChat(); if (avvolto && timerAvvolgi) { clearInterval(timerAvvolgi); timerAvvolgi = null; } }, 300);
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(39, { chatMapSync: true }); } catch (e) { /* best-effort */ }
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog("Modulo 39 caricato: la narrazione del Master sposta il party sui POI di Ventimiglia."); } catch (e) { /* ignora */ }
    }
  }

  window.UltimateVTTMapSync = {
    // logica pura (testabile)
    rilevaLuogo: rilevaLuogo,
    ALIAS_POI: ALIAS_POI,
    // applicazione + aggancio
    spostaSuPOI: spostaSuPOI,
    _processa: processa,
    _flush: function () { if (timerFlush) { clearTimeout(timerFlush); timerFlush = null; } var t = codaTesto; codaTesto = null; if (t != null) { processa(t); } },
    isMasterOrSolo: isMasterOrSolo,
    fermaAggiornamento: function () { if (timerAvvolgi) { clearInterval(timerAvvolgi); timerAvvolgi = null; } if (timerFlush) { clearTimeout(timerFlush); timerFlush = null; } }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 39 JS: CHAT -> MAPPA VENTIMIGLIA ---
