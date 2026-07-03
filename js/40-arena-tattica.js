// --- INIZIO MODULO 40 JS: ARENA TATTICA (ostacoli, punti sopraelevati, luogo, movimento BG3) ---
// La mappa di combattimento diventa STRATEGICA, come in BG3: muoversi bene conta quanto attaccare.
// A inizio combattimento questo modulo:
//   1. genera OSTACOLI (coperture) sulla griglia attorno alla zona dello scontro;
//   2. dipinge una ZONA SOPRAELEVATA (highground) usando il modulo 28 — chi ci sale ha vantaggio
//      sui bersagli in basso (meccanica gia' attiva nel motore);
//   3. mostra il LUOGO del combattimento (dal Global Game State: l'ultimo POI di Ventimiglia
//      narrato dal Master, modulo 39) in un'insegna sotto la barra iniziativa, e adatta la palette
//      del terreno al tipo di luogo;
//   4. aggiunge il pulsante "👣 Sposta" alla barra azioni BG3: clicchi, poi scegli la cella di
//      destinazione sulla griglia — il PG si muove ENTRO il budget di movimento del turno (FSM,
//      modulo 19), rispettando gli ostacoli. Come il "click per muoverti" di BG3.
//
// La generazione dell'arena e la validazione del movimento sono funzioni PURE e testabili; il
// resto sono agganci sottili alle API esistenti (Canvas 07, TokenPhysics 08, FSM 19, HUD 23).
(function () {
  "use strict";

  var INTERVALLO_MS = 300;

  function canvas() { return window.UltimateVTTCanvas || null; }
  function physics() { return window.UltimateVTTTokenPhysics || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }
  function combat() { return window.UltimateVTTCombat || null; }
  function gameState() { return window.UltimateVTTGameState || null; }
  function isMasterOrSolo() { return !window.UltimateVTTSync || window.UltimateVTTSync.isMaster(); }

  function annuncia(m) {
    if (window.UltimateVTTCoreGameplay && typeof window.UltimateVTTCoreGameplay.appendChatMessage === "function") {
      try { window.UltimateVTTCoreGameplay.appendChatMessage("system", m); return; } catch (e) { /* ignora */ }
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
  }

  // ---------------------------------------------------------------------------
  // TEMI DEI LUOGHI (data-driven): come si presenta l'arena a seconda del POI di Ventimiglia.
  // terreno: palette del canvas (dungeon/cavern/forest); ostacolo: nome narrativo delle coperture.
  // ---------------------------------------------------------------------------
  var TEMI_LUOGO = {
    "Teatro Romano":          { terreno: "dungeon", ostacolo: "colonne spezzate" },
    "Città Alta":             { terreno: "dungeon", ostacolo: "muretti dei vicoli" },
    "Cattedrale Assunta":     { terreno: "dungeon", ostacolo: "banchi di pietra" },
    "Forte dell'Annunziata":  { terreno: "dungeon", ostacolo: "bastioni" },
    "Porto Turistico":        { terreno: "cavern",  ostacolo: "casse e cime" },
    "Lungomare":              { terreno: "cavern",  ostacolo: "scogli" },
    "Balzi Rossi":            { terreno: "cavern",  ostacolo: "speroni di roccia" },
    "Giardini Hanbury":       { terreno: "forest",  ostacolo: "siepi e tronchi" },
    "Capo Mortola":           { terreno: "forest",  ostacolo: "macchia mediterranea" },
    "default":                { terreno: "dungeon", ostacolo: "coperture" }
  };

  function temaPerLuogo(nome) { return TEMI_LUOGO[nome] || TEMI_LUOGO["default"]; }

  // ---------------------------------------------------------------------------
  // GENERAZIONE PURA dell'arena. rng: funzione 0..1 iniettabile (nei test: deterministica).
  // Ritorna { ostacoli: [{x,y}], sopraelevata: {x,y,raggio,livello} } SENZA toccare il gioco.
  // Gli ostacoli si tengono ad almeno 2 celle dalle posizioni occupate (nessun token murato).
  // ---------------------------------------------------------------------------
  function generaArena(opts) {
    opts = opts || {};
    var rng = typeof opts.rng === "function" ? opts.rng : Math.random;
    var centroX = intero(opts.centroX, 16), centroY = intero(opts.centroY, 12);
    var raggioArena = intero(opts.raggioArena, 9);
    var nOstacoli = intero(opts.ostacoli, 10);
    var occupate = opts.occupate || [];
    var colonne = intero(opts.colonne, 32), righe = intero(opts.righe, 24);

    function libera(x, y) {
      if (x < 1 || y < 1 || x >= colonne - 1 || y >= righe - 1) { return false; }
      return !occupate.some(function (c) { return Math.max(Math.abs(c.cellX - x), Math.abs(c.cellY - y)) <= 2; });
    }

    // Ostacoli: piccoli gruppi da 1-2 celle sparsi nell'anello dell'arena (mai sul centro esatto).
    var ostacoli = [], tentativi = 0;
    while (ostacoli.length < nOstacoli && tentativi++ < nOstacoli * 20) {
      var ang = rng() * Math.PI * 2;
      var dist = 2 + rng() * raggioArena;
      var x = Math.round(centroX + Math.cos(ang) * dist);
      var y = Math.round(centroY + Math.sin(ang) * dist);
      if (!libera(x, y)) { continue; }
      if (ostacoli.some(function (o) { return o.x === x && o.y === y; })) { continue; }
      ostacoli.push({ x: x, y: y });
      // ~metà delle volte l'ostacolo si allunga di una cella (copertura da 2).
      if (rng() < 0.5) {
        var dx = rng() < 0.5 ? 1 : 0, dy = dx === 1 ? 0 : 1;
        if (libera(x + dx, y + dy) && !ostacoli.some(function (o) { return o.x === x + dx && o.y === y + dy; })) {
          ostacoli.push({ x: x + dx, y: y + dy });
        }
      }
    }

    // Zona sopraelevata: un punto nell'anello, lontano dalle posizioni occupate, raggio 2.
    var sopraelevata = null, giri = 0;
    while (!sopraelevata && giri++ < 40) {
      var a2 = rng() * Math.PI * 2;
      var d2 = 3 + rng() * (raggioArena - 2);
      var hx = Math.round(centroX + Math.cos(a2) * d2);
      var hy = Math.round(centroY + Math.sin(a2) * d2);
      if (libera(hx, hy)) { sopraelevata = { x: hx, y: hy, raggio: 2, livello: 1 }; }
    }

    return { ostacoli: ostacoli, sopraelevata: sopraelevata };
  }

  // ---------------------------------------------------------------------------
  // VALIDAZIONE PURA del movimento scelto col click (per il pulsante "Sposta"):
  //   esitoMovimento(da, a, residuoMetri, metriPerCella, bloccata) ->
  //     { ok, costoMetri, motivo }
  // Distanza in celle = Chebyshev (come tutto il motore); costo = celle * metriPerCella.
  // ---------------------------------------------------------------------------
  function esitoMovimento(da, a, residuoMetri, metriPerCella, bloccata) {
    if (!da || !a) { return { ok: false, costoMetri: 0, motivo: "posizione sconosciuta" }; }
    var celle = Math.max(Math.abs(a.cellX - da.cellX), Math.abs(a.cellY - da.cellY));
    if (celle === 0) { return { ok: false, costoMetri: 0, motivo: "sei già lì" }; }
    var costo = celle * (metriPerCella > 0 ? metriPerCella : 1.5);
    if (typeof bloccata === "function" && bloccata(a.cellX, a.cellY)) {
      return { ok: false, costoMetri: costo, motivo: "cella bloccata (ostacolo)" };
    }
    if (isFinite(residuoMetri) && costo > residuoMetri + 0.001) {
      return { ok: false, costoMetri: costo, motivo: "troppo lontano (" + costo.toFixed(1) + " m, ne restano " + Number(residuoMetri).toFixed(1) + ")" };
    }
    return { ok: true, costoMetri: costo, motivo: "" };
  }

  // ---------------------------------------------------------------------------
  // COSTRUZIONE dell'arena nel gioco reale (a inizio combattimento, GM-autorevole).
  // ---------------------------------------------------------------------------
  var arenaCostruita = false;

  function luogoCorrente() {
    var S = gameState();
    if (S) {
      var loc = S.get("party.location");
      if (loc && loc.name) { return loc.name; }
    }
    return "Ventimiglia";
  }

  function celleOccupateDaToken() {
    var P = physics();
    try { return (P.getState().tokens || []).map(function (t) { return { cellX: t.cellX, cellY: t.cellY }; }); }
    catch (e) { return []; }
  }

  function cellaPg() {
    var P = physics();
    try {
      var pc = (P.getState().tokens || []).filter(function (t) { return t.id === "token-pc"; })[0];
      return pc ? { cellX: pc.cellX, cellY: pc.cellY } : { cellX: 16, cellY: 12 };
    } catch (e) { return { cellX: 16, cellY: 12 }; }
  }

  function costruisciArena() {
    if (!isMasterOrSolo()) { return; }
    var CV = canvas();
    var luogo = luogoCorrente();
    var tema = temaPerLuogo(luogo);
    var centro = cellaPg();

    var stato = null;
    try { stato = CV && CV.getState ? CV.getState() : null; } catch (e) { stato = null; }
    var colonne = stato ? stato.columns : 32, righe = stato ? stato.rows : 24;

    var arena = generaArena({
      centroX: centro.cellX, centroY: centro.cellY,
      colonne: colonne, righe: righe,
      occupate: celleOccupateDaToken(),
      ostacoli: 10, raggioArena: 9
    });

    // 1) Ostacoli come celle "wall": bloccano movimento e linea di manovra (il motore le rispetta gia').
    if (CV && typeof CV.setTerrainAt === "function") {
      arena.ostacoli.forEach(function (o) { CV.setTerrainAt(o.x, o.y, "wall"); });
    }
    // 2) Highground via modulo 28 (vantaggio dall'alto gia' attivo nel motore).
    try {
      if (arena.sopraelevata && window.UltimateVTTElevation && window.UltimateVTTElevation.impostaElevazioneArea) {
        window.UltimateVTTElevation.impostaElevazioneArea(arena.sopraelevata.x, arena.sopraelevata.y, arena.sopraelevata.raggio, arena.sopraelevata.livello);
      }
    } catch (e) { /* modulo opzionale */ }
    // 3) Palette del terreno a tema col luogo.
    var stage = document.querySelector(".stage");
    if (stage) {
      stage.classList.remove("filter-dungeon", "filter-forest", "filter-cavern");
      stage.classList.add("filter-" + (tema.terreno === "forest" ? "forest" : tema.terreno === "cavern" ? "cavern" : "dungeon"));
    }
    // 4) Insegna del luogo.
    mostraInsegna("⚔️ " + luogo + " — " + tema.ostacolo + " e punti sopraelevati in campo");
    annuncia("🏟 Il combattimento si svolge presso " + luogo + ": sfrutta " + tema.ostacolo + " e l'altura per il vantaggio!");

    arenaCostruita = true;
  }

  function rimuoviArena() {
    // A fine scontro si toglie solo l'insegna: ostacoli/quota restano come "cicatrici" della scena
    // (rigenerabili con il pulsante Rigenera della mappa), il tema resta ambientato.
    var insegna = document.getElementById("arenaLuogoBanner");
    if (insegna) { insegna.hidden = true; }
    arenaCostruita = false;
  }

  function mostraInsegna(testo) {
    var insegna = document.getElementById("arenaLuogoBanner");
    if (!insegna) {
      insegna = document.createElement("div");
      insegna.id = "arenaLuogoBanner";
      document.body.appendChild(insegna);
    }
    insegna.textContent = testo;
    insegna.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // PULSANTE "👣 Sposta": modalita' movimento col click, come BG3.
  // ---------------------------------------------------------------------------
  var modalitaMovimento = false;

  function tokenDelPg() {
    var f = fsm();
    if (f && typeof f.combattenteAToken === "function") {
      try { var t = f.combattenteAToken("pc-local"); if (t) { return t; } } catch (e) { /* fallback */ }
    }
    return "token-pc";
  }

  function attivaModalitaMovimento(attiva) {
    modalitaMovimento = typeof attiva === "boolean" ? attiva : !modalitaMovimento;
    var btn = document.getElementById("bg3MoveButton");
    if (btn) { btn.classList.toggle("active", modalitaMovimento); }
    var stage = document.querySelector(".stage");
    if (stage) { stage.classList.toggle("move-mode", modalitaMovimento); }
    if (modalitaMovimento) { annuncia("👣 Scegli sulla griglia la cella dove muoverti (movimento del turno)."); }
  }

  function gestisciClickMovimento(ev) {
    if (!modalitaMovimento) { return; }
    var C = combat(), CV = canvas(), P = physics(), F = fsm();
    var st = null;
    try { st = C.getState(); } catch (e) { st = null; }
    if (!st || !st.active) { attivaModalitaMovimento(false); return; }

    // Solo nel turno di un PG.
    var corrente = st.combatants[st.currentTurnIndex];
    if (!corrente || corrente.kind !== "pc") { return; }

    var cella = null;
    try { cella = CV.screenToCell(ev.clientX, ev.clientY); } catch (e) { cella = null; }
    if (!cella) { return; }

    var tokenId = tokenDelPg();
    var da = null;
    try {
      var tok = (P.getState().tokens || []).filter(function (t) { return t.id === tokenId; })[0];
      if (tok) { da = { cellX: tok.cellX, cellY: tok.cellY }; }
    } catch (e) { da = null; }

    var residuo = Infinity, metriPerCella = 1.5;
    try { if (F && typeof F.movimentoResiduo === "function") { residuo = F.movimentoResiduo(tokenId); } } catch (e) { /* niente budget */ }
    try { var cs = CV.getState(); if (cs && cs.cellMeters) { metriPerCella = cs.cellMeters; } } catch (e) { /* default */ }

    var bloccata = function (x, y) { try { return CV.isTerrainBlocking(x, y); } catch (e) { return false; } };
    var esito = esitoMovimento(da, { cellX: cella.cellX, cellY: cella.cellY }, residuo, metriPerCella, bloccata);
    if (!esito.ok) { annuncia("👣 Movimento non possibile: " + esito.motivo + "."); return; }

    var mosso = false;
    try { mosso = P.moveTokenToCell(tokenId, cella.cellX, cella.cellY, true); } catch (e) { mosso = false; }
    if (mosso) {
      try { if (F && typeof F.spendiMovimento === "function") { F.spendiMovimento(tokenId, esito.costoMetri); } } catch (e) { /* best effort */ }
      annuncia("👣 Ti sposti (" + esito.costoMetri.toFixed(1) + " m).");
      attivaModalitaMovimento(false);
    } else {
      annuncia("👣 La cella scelta non è raggiungibile.");
    }
  }

  var bottoneIniettato = false;
  function iniettaBottoneSposta() {
    if (bottoneIniettato || !document.body) { return; }
    var tray = document.querySelector(".bg3-actions");
    if (!tray) { return; }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "bg3MoveButton";
    btn.className = "bg3-btn move";
    btn.textContent = "👣 Sposta";
    btn.title = "Scegli sulla griglia dove muoverti (usa il movimento del turno)";
    btn.addEventListener("click", function () { attivaModalitaMovimento(); });
    var endBtn = null;
    for (var i = 0; i < tray.children.length; i += 1) {
      if (/Termina turno/.test(tray.children[i].textContent || "")) { endBtn = tray.children[i]; break; }
    }
    if (endBtn) { tray.insertBefore(btn, endBtn); } else { tray.appendChild(btn); }

    var vtt = document.getElementById("vttCanvas");
    if (vtt) { vtt.addEventListener("click", gestisciClickMovimento); }
    bottoneIniettato = true;
  }

  // ---------------------------------------------------------------------------
  // Ciclo: costruisce l'arena sulla transizione combattimento off -> on, la smonta a fine scontro.
  // ---------------------------------------------------------------------------
  var eraAttivo = false;
  function tick() {
    iniettaBottoneSposta();
    var C = combat();
    if (!C || typeof C.getState !== "function") { return; }
    var st = null;
    try { st = C.getState(); } catch (e) { return; }
    var attivo = Boolean(st && st.active);
    if (attivo && !eraAttivo) { try { costruisciArena(); } catch (e) { /* arena best-effort */ } }
    if (!attivo && eraAttivo) { rimuoviArena(); attivaModalitaMovimento(false); }
    eraAttivo = attivo;
  }

  var timer = null;
  function inizializza() {
    if (!window.document) { return; }
    if (!timer) { timer = window.setInterval(tick, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(40, { arenaTattica: true }); } catch (e) { /* best-effort */ }
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog("Modulo 40 caricato: arena tattica (ostacoli, altura, luogo) + movimento col click."); } catch (e) { /* ignora */ }
    }
  }

  window.UltimateVTTArena = {
    // logica pura (testabile)
    generaArena: generaArena,
    esitoMovimento: esitoMovimento,
    temaPerLuogo: temaPerLuogo,
    TEMI_LUOGO: TEMI_LUOGO,
    // integrazione
    costruisciArena: costruisciArena,
    attivaModalitaMovimento: attivaModalitaMovimento,
    movimentoAttivo: function () { return modalitaMovimento; },
    _tick: tick,
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } }
  };

  function intero(v, def) { var n = parseInt(v, 10); return isFinite(n) ? n : def; }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 40 JS: ARENA TATTICA ---
