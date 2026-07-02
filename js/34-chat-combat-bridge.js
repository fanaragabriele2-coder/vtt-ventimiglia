// --- INIZIO MODULO 34 JS: PONTE CHAT MASTER -> COMBAT SYSTEM (stile BG3) ---
// Problema reale osservato in partita: il Master IA narrava un intero combattimento in prosa
// ("Il combattimento e' iniziato! Goblin 1: 5/5 HP...", attacchi risolti a parole, HP inventati)
// SENZA emettere il campo JSON "spawn" — quindi il vero sistema di combattimento (griglia, HUD BG3,
// iniziativa, dadi, IA nemici) restava spento ("Combat: off") mentre la chat raccontava una
// battaglia che il gioco non stava giocando. Chat e combat system viaggiavano scollegati.
//
// Questo modulo li ricollega dal lato del gioco: osserva (per wrapping non invasivo di
// appendChatMessage, stesso pattern dei moduli 29/32) ogni risposta del Master e, se il
// combattimento NON e' attivo ma il testo annuncia uno scontro con creature note del bestiario
// ("tre goblin vi attaccano!", "Goblin 1... Goblin 4", "un'imboscata di banditi"), fa comparire
// DAVVERO quei nemici via VTTSpawn.spawn — che avvia il combattimento, mappa i token, mostra la
// HUD BG3 e mette in moto l'IA dei nemici (modulo 33). E' la rete di sicurezza dal lato motore;
// dal lato IA, il prompt di sistema (js/12) ora impone di emettere "spawn" e di NON risolvere
// mai gli attacchi in prosa.
//
// L'elaborazione e' RITARDATA di qualche centinaio di ms: se la risposta del Master conteneva
// anche il campo JSON "spawn" (percorso gia' funzionante, gestito da handleAIMovement in js/12),
// al momento dell'elaborazione il combattimento risulta gia' attivo e il ponte non fa nulla —
// niente doppio spawn, qualunque sia l'ordine con cui js/12 processa testo e comandi.
(function () {
  "use strict";

  var INTERVALLO_MS = 500; // retry del wrapping (js/12 si inizializza dopo questo script nel bundle)
  var RITARDO_MS = 350;    // attesa prima di elaborare un testo (lascia passare l'eventuale spawn JSON)

  function combat() { return window.UltimateVTTCombat || null; }
  function coreGameplay() { return window.UltimateVTTCoreGameplay || null; }

  function isMasterOrSolo() { return !window.UltimateVTTSync || window.UltimateVTTSync.isMaster(); }

  function log(m) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Bestiario riconosciuto nel testo (stesse creature del catalogo di js/06 / prompt di js/12),
  // con plurale italiano. "hobgoblin" prima di "goblin" non serve: i \b impediscono che "goblin"
  // combaci dentro "hobgoblin" (preceduto da una lettera).
  // ---------------------------------------------------------------------------
  var BESTIARIO = [
    { nome: "Goblin",    singolare: "goblin",    plurale: "goblin" },
    { nome: "Bandito",   singolare: "bandito",   plurale: "banditi" },
    { nome: "Scheletro", singolare: "scheletro", plurale: "scheletri" },
    { nome: "Lupo",      singolare: "lupo",      plurale: "lupi" },
    { nome: "Orco",      singolare: "orco",      plurale: "orchi" },
    { nome: "Cultista",  singolare: "cultista",  plurale: "cultisti" },
    { nome: "Zombie",    singolare: "zombie",    plurale: "zombie" },
    { nome: "Hobgoblin", singolare: "hobgoblin", plurale: "hobgoblin" }
  ];

  // Parole che segnalano che lo scontro sta INIZIANDO/avvenendo ora (non una semplice menzione).
  var PAROLE_COMBATTIMENTO = /(combattiment|attacc|assal|agguato|imboscata|iniziativa|battaglia|scontro|vi circondano|ostil|minacci|balzano|si scagliano|sguainano)/i;

  var NUMERI = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8 };

  // ---------------------------------------------------------------------------
  // FUNZIONI PURE (testabili)
  // ---------------------------------------------------------------------------
  function contaCreatura(testo, voce) {
    // 1) "Goblin 1 ... Goblin 4" (elenchi numerati): il massimo indice e' il conteggio.
    var reIndice = new RegExp("\\b" + voce.singolare + "\\s+(\\d{1,2})\\b", "gi");
    var max = 0, m;
    while ((m = reIndice.exec(testo))) { max = Math.max(max, parseInt(m[1], 10)); }
    if (max > 0) { return Math.min(8, max); }
    // 2) "tre goblin", "4 banditi": numero (cifra o parola) davanti al nome.
    var reNumero = new RegExp("\\b(\\d{1,2}|un|uno|una|due|tre|quattro|cinque|sei|sette|otto)\\s+(?:" + voce.singolare + "|" + voce.plurale + ")\\b", "i");
    m = reNumero.exec(testo);
    if (m) {
      var v = NUMERI[m[1].toLowerCase()] || parseInt(m[1], 10) || 1;
      return Math.min(8, Math.max(1, v));
    }
    // 3) Semplice menzione: 1.
    var reMenzione = new RegExp("\\b(?:" + voce.singolare + "|" + voce.plurale + ")\\b", "i");
    return reMenzione.test(testo) ? 1 : 0;
  }

  // Analizza il testo di una risposta del Master: se annuncia uno scontro con creature note,
  // ritorna la lista [{name, count}] pronta per VTTSpawn.spawn; altrimenti null.
  function rilevaNemiciDaTesto(testo) {
    testo = String(testo || "");
    if (!testo || !PAROLE_COMBATTIMENTO.test(testo)) { return null; }
    var lista = [];
    BESTIARIO.forEach(function (voce) {
      var n = contaCreatura(testo, voce);
      if (n > 0) { lista.push({ name: voce.nome, count: n }); }
    });
    return lista.length ? lista : null;
  }

  // ---------------------------------------------------------------------------
  // Elaborazione (con guardie): solo Master/solitaria, solo a combattimento spento.
  // ---------------------------------------------------------------------------
  function processaTesto(testo) {
    if (!isMasterOrSolo()) { return false; }
    var C = combat();
    if (!C || typeof C.getState !== "function") { return false; }
    var attivo; try { attivo = Boolean(C.getState().active); } catch (e) { return false; }
    if (attivo) { return false; } // lo spawn JSON (o un combattimento gia' in corso) ha gia' fatto tutto
    var lista = rilevaNemiciDaTesto(testo);
    if (!lista) { return false; }
    var S = window.VTTSpawn;
    if (!S || typeof S.spawn !== "function") { return false; }
    try { S.spawn(lista); } catch (e) { return false; }
    log("Modulo 34: la narrazione del Master annunciava uno scontro senza spawn JSON — nemici fatti comparire e combattimento avviato (" +
      lista.map(function (e) { return e.count + "x " + e.name; }).join(", ") + ").");
    return true;
  }

  var pendenti = [];
  function esegui(voce) {
    if (voce.fatto) { return; }
    voce.fatto = true;
    processaTesto(voce.testo);
  }
  function pianifica(testo) {
    var voce = { testo: String(testo || ""), fatto: false };
    pendenti.push(voce);
    if (pendenti.length > 20) { pendenti = pendenti.filter(function (v) { return !v.fatto; }).slice(-20); }
    window.setTimeout(function () { esegui(voce); }, RITARDO_MS);
  }

  // ---------------------------------------------------------------------------
  // Wrapping (idempotente) di appendChatMessage: intercetta SOLO i messaggi del Master.
  // ---------------------------------------------------------------------------
  var wrappingFatto = false;
  function avvolgiAppendChatMessage() {
    var CG = coreGameplay();
    if (!CG || wrappingFatto || typeof CG.appendChatMessage !== "function") { return; }
    var originale = CG.appendChatMessage;
    CG.appendChatMessage = function (speaker, testo) {
      var r = originale.apply(this, arguments);
      if (speaker === "master" && typeof testo === "string") { pianifica(testo); }
      return r;
    };
    wrappingFatto = true;
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  var timer = null;
  function tick() { avvolgiAppendChatMessage(); }

  function inizializza() {
    if (!window.document) { return; }
    tick();
    if (!timer) { timer = window.setInterval(tick, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(34, { chatCombatBridge: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 34 caricato: ponte chat Master -> combat system.");
  }

  window.UltimateVTTChatCombatBridge = {
    // logica pura (testabile)
    rilevaNemiciDaTesto: rilevaNemiciDaTesto,
    // elaborazione sincrona (usata anche dai test)
    _processaTesto: processaTesto,
    // esegue subito le elaborazioni in attesa (nei test evita di aspettare il ritardo reale)
    _flush: function () { pendenti.slice().forEach(esegui); },
    // controllo
    isMasterOrSolo: isMasterOrSolo,
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } },
    _tick: function () { tick(); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 34 JS: PONTE CHAT MASTER -> COMBAT SYSTEM ---
