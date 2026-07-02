// --- INIZIO MODULO 30 JS: CONDIZIONI DI STATO (prono/stordito/avvelenato, stile BG3) ---
// I moduli 26 (Spingi) e 27 (Superfici) segnalavano esplicitamente questa lacuna nei loro commenti:
// "il gioco non ha ancora un sistema di condizioni/stati". Questo modulo la colma con un sotto-
// insieme volutamente ristretto delle condizioni 5e piu' riconoscibili in combattimento:
//  - PRONO: chi lo subisce viene colpito con vantaggio; i SUOI attacchi hanno svantaggio (qui
//    semplificato senza la distinzione mischia/gittata della regola completa: fuori ambito, come
//    la linea di vista per il modulo 28).
//  - STORDITO: chi lo subisce viene colpito con vantaggio.
//  - AVVELENATO: chi lo subisce ha svantaggio sui propri attacchi.
// Ogni condizione ha una durata in round (sul round SINCRONIZZATO della FSM, stesso pattern del
// modulo 27) e scade automaticamente. Progettato GM-autorevole fin da subito (stesso approccio dei
// moduli 27/28): solo il Master applica/rimuove una condizione (evento di rete, propagato agli
// altri client); la LETTURA per calcolare vantaggio/svantaggio e' invece sicura su ogni client,
// perche' non muta nulla — usa solo dati gia' sincronizzati.
//
// Non modifica nessun modulo esistente: usa le primitive di UltimateVTTCombat (nomi dei
// combattenti) e UltimateVTTCombatFSM (round sincronizzato). Il modulo 23 (HUD) lo consulta se
// presente, componendolo con fiancheggiamento (25) ed elevazione (28) secondo le regole di
// sovrapposizione 5e; funziona comunque anche da solo, senza HUD.
(function () {
  "use strict";

  var INTERVALLO_MS = 300;

  var Tipi = { PRONO: "prono", STORDITO: "stordito", AVVELENATO: "avvelenato" };
  var DURATA_DEFAULT = { prono: 1, stordito: 1, avvelenato: 3 };
  var ICONE = { prono: "🩹", stordito: "💫", avvelenato: "☠️" };
  var ETICHETTE = { prono: "Prono", stordito: "Stordito", avvelenato: "Avvelenato" };
  var NARRAZIONE_APPLICATA = { prono: "cade prono", stordito: "è stordito", avvelenato: "è avvelenato" };
  var NARRAZIONE_RIMOSSA = { prono: "si rialza", stordito: "non è più stordito", avvelenato: "non è più avvelenato" };

  function combat() { return window.UltimateVTTCombat || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }
  function sync() { return window.UltimateVTTSync || null; }

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

  function isMasterOrSolo() { return !window.UltimateVTTSync || window.UltimateVTTSync.isMaster(); }

  // ---------------------------------------------------------------------------
  // Stato locale: combattenteId -> { chiave: { durataRound, appliedAlRound } }
  // ---------------------------------------------------------------------------
  var condizioni = {};

  function roundCorrente() {
    var f = fsm();
    if (f && typeof f.getStato === "function") {
      try { var s = f.getStato(); if (typeof s.round === "number") { return s.round; } } catch (e) { /* fallback sotto */ }
    }
    var c = combat();
    if (c && typeof c.getState === "function") {
      try { return c.getState().round || 0; } catch (e) { /* ignora */ }
    }
    return 0;
  }

  function nomeCombattente(combattenteId) {
    var C = combat();
    if (!C || typeof C.getState !== "function") { return combattenteId; }
    try {
      var st = C.getState();
      var c = (st.combatants || []).find(function (x) { return x.id === combattenteId; });
      return c ? (c.name || combattenteId) : combattenteId;
    } catch (e) { return combattenteId; }
  }

  // ---------------------------------------------------------------------------
  // FUNZIONI PURE (testabili)
  // ---------------------------------------------------------------------------
  function eScaduta(cond, roundAttuale) { return (roundAttuale - cond.appliedAlRound) >= cond.durataRound; }
  function durataDefault(chiave) { return DURATA_DEFAULT[chiave] || 1; }

  // Effetto sul tiro per colpire di un attacco tra un attaccante e un bersaglio, dati gli elenchi di
  // condizioni attive di entrambi. Prono/stordito sul bersaglio danno vantaggio all'attaccante;
  // prono/avvelenato sull'attaccante gli danno svantaggio sul proprio attacco.
  function effettoSuAttaccoDaCondizioni(chiaviAttaccante, chiaviBersaglio) {
    chiaviAttaccante = chiaviAttaccante || [];
    chiaviBersaglio = chiaviBersaglio || [];
    var vantaggio = chiaviBersaglio.indexOf(Tipi.PRONO) !== -1 || chiaviBersaglio.indexOf(Tipi.STORDITO) !== -1;
    var svantaggio = chiaviAttaccante.indexOf(Tipi.PRONO) !== -1 || chiaviAttaccante.indexOf(Tipi.AVVELENATO) !== -1;
    return { vantaggio: vantaggio, svantaggio: svantaggio };
  }

  // ---------------------------------------------------------------------------
  // Lettura (sicura su ogni client: legge soltanto, non muta nulla)
  // ---------------------------------------------------------------------------
  function chiaviAttive(combattenteId, roundAttuale) {
    var mappa = condizioni[combattenteId];
    if (!mappa) { return []; }
    return Object.keys(mappa).filter(function (chiave) { return !eScaduta(mappa[chiave], roundAttuale); });
  }

  function haCondizione(combattenteId, chiave) {
    var mappa = condizioni[combattenteId];
    return Boolean(mappa && mappa[chiave] && !eScaduta(mappa[chiave], roundCorrente()));
  }

  function condizioniDi(combattenteId) {
    var r = roundCorrente();
    var mappa = condizioni[combattenteId];
    if (!mappa) { return []; }
    return chiaviAttive(combattenteId, r).map(function (chiave) {
      return { chiave: chiave, scadeAlRound: mappa[chiave].appliedAlRound + mappa[chiave].durataRound };
    });
  }

  function valutaCondizioni(attaccanteId, bersaglioId) {
    var r = roundCorrente();
    var chiaviAtt = chiaviAttive(attaccanteId, r);
    var chiaviBer = chiaviAttive(bersaglioId, r);
    var effetto = effettoSuAttaccoDaCondizioni(chiaviAtt, chiaviBer);
    return {
      vantaggio: effetto.vantaggio, svantaggio: effetto.svantaggio,
      condizioniAttaccante: chiaviAtt, condizioniBersaglio: chiaviBer
    };
  }

  // ---------------------------------------------------------------------------
  // Applicazione/rimozione (GM-autorevole) + applicazione inbound (identica sui client non-Master)
  // ---------------------------------------------------------------------------
  function applicaCondizioneLocale(combattenteId, chiave, durataRound, appliedAlRound) {
    if (!condizioni[combattenteId]) { condizioni[combattenteId] = {}; }
    condizioni[combattenteId][chiave] = {
      durataRound: Math.max(1, Math.trunc(durataRound) || durataDefault(chiave)),
      appliedAlRound: typeof appliedAlRound === "number" ? appliedAlRound : roundCorrente()
    };
    return condizioni[combattenteId][chiave];
  }

  function applicaCondizione(combattenteId, chiave, durataRound) {
    if (!ETICHETTE[chiave]) {
      return { ok: false, message: "Condizione sconosciuta: " + chiave + "." };
    }
    if (!isMasterOrSolo()) {
      var msgSoloMaster = "Solo il Master può applicare condizioni in una sessione multiplayer.";
      annuncia((ICONE[chiave] || "❔") + " " + msgSoloMaster);
      return { ok: false, message: msgSoloMaster };
    }
    var applicata = applicaCondizioneLocale(combattenteId, chiave, durataRound);
    annuncia(ICONE[chiave] + " " + nomeCombattente(combattenteId) + " " +
      (NARRAZIONE_APPLICATA[chiave] || ("subisce la condizione " + chiave)) + " (" + applicata.durataRound + " round).");

    var S = sync();
    if (S && typeof S.emetti === "function" && typeof S.creaEvento === "function" && S.TipiEvento) {
      try {
        S.emetti(S.creaEvento(S.TipiEvento.CONDIZIONE_IMPOSTATA, {
          combattenteId: combattenteId, chiave: chiave,
          durataRound: applicata.durataRound, appliedAlRound: applicata.appliedAlRound
        }));
      } catch (e) { /* la condizione resta comunque valida in locale */ }
    }
    return { ok: true, combattenteId: combattenteId, chiave: chiave, durataRound: applicata.durataRound };
  }

  function rimuoviCondizioneLocale(combattenteId, chiave) {
    if (condizioni[combattenteId]) { delete condizioni[combattenteId][chiave]; }
  }

  function rimuoviCondizione(combattenteId, chiave) {
    if (!isMasterOrSolo()) {
      var msgSoloMaster = "Solo il Master può rimuovere condizioni in una sessione multiplayer.";
      annuncia("✨ " + msgSoloMaster);
      return { ok: false, message: msgSoloMaster };
    }
    var presente = Boolean(condizioni[combattenteId] && condizioni[combattenteId][chiave]);
    rimuoviCondizioneLocale(combattenteId, chiave);
    if (presente) {
      annuncia("✨ " + nomeCombattente(combattenteId) + " " +
        (NARRAZIONE_RIMOSSA[chiave] || ("non ha più la condizione " + chiave)) + ".");
    }

    var S = sync();
    if (S && typeof S.emetti === "function" && typeof S.creaEvento === "function" && S.TipiEvento) {
      try { S.emetti(S.creaEvento(S.TipiEvento.CONDIZIONE_RIMOSSA, { combattenteId: combattenteId, chiave: chiave })); }
      catch (e) { /* la rimozione resta comunque valida in locale */ }
    }
    return { ok: true, combattenteId: combattenteId, chiave: chiave, rimossa: presente };
  }

  function gestisciCondizioneImpostataInbound(evento) {
    var p = evento.payload || {};
    if (!p.combattenteId || !p.chiave) { return; }
    applicaCondizioneLocale(p.combattenteId, p.chiave, p.durataRound, p.appliedAlRound);
  }

  function gestisciCondizioneRimossaInbound(evento) {
    var p = evento.payload || {};
    if (!p.combattenteId || !p.chiave) { return; }
    rimuoviCondizioneLocale(p.combattenteId, p.chiave);
  }

  // ---------------------------------------------------------------------------
  // Scadenza automatica: sicura su ogni client (decisione puramente basata sul round sincronizzato
  // della FSM, nessuna mutazione di stato condiviso, nessun evento di rete necessario) — stesso
  // pattern di pulisciScadute() nel modulo 27.
  // ---------------------------------------------------------------------------
  function pulisciScadute() {
    var r = roundCorrente();
    Object.keys(condizioni).forEach(function (combattenteId) {
      var mappa = condizioni[combattenteId];
      Object.keys(mappa).forEach(function (chiave) {
        if (eScaduta(mappa[chiave], r)) {
          delete mappa[chiave];
          annuncia(ICONE[chiave] + " " + nomeCombattente(combattenteId) + " " +
            (NARRAZIONE_RIMOSSA[chiave] || ("non ha più la condizione " + chiave)) + " (scaduta).");
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  var timer = null;

  function inizializza() {
    if (!window.document) { return; }
    var s = sync();
    if (s && typeof s.inAscolto === "function" && s.TipiEvento) {
      s.inAscolto(s.TipiEvento.CONDIZIONE_IMPOSTATA, gestisciCondizioneImpostataInbound);
      s.inAscolto(s.TipiEvento.CONDIZIONE_RIMOSSA, gestisciCondizioneRimossaInbound);
    }
    if (!timer) { timer = window.setInterval(pulisciScadute, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(30, { conditions: true, prone: true, stunned: true, poisoned: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 30 caricato: condizioni di stato (prono/stordito/avvelenato, stile BG3).");
  }

  window.UltimateVTTConditions = {
    Tipi: Tipi,
    Icone: ICONE,
    Etichette: ETICHETTE,
    // comandi
    applicaCondizione: applicaCondizione,
    rimuoviCondizione: rimuoviCondizione,
    // logica pura (testabile)
    eScaduta: eScaduta,
    durataDefault: durataDefault,
    effettoSuAttaccoDaCondizioni: effettoSuAttaccoDaCondizioni,
    // lettura live (consultata dal modulo 23)
    haCondizione: haCondizione,
    condizioniDi: condizioniDi,
    valutaCondizioni: valutaCondizioni,
    // controllo
    isMasterOrSolo: isMasterOrSolo,
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } },
    // utile ai test
    _tick: function () { pulisciScadute(); },
    _reset: function () { condizioni = {}; },
    _gestisciInboundImpostata: gestisciCondizioneImpostataInbound,
    _gestisciInboundRimossa: gestisciCondizioneRimossaInbound
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 30 JS: CONDIZIONI DI STATO ---
