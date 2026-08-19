// --- INIZIO MODULO 32 JS: DIARIO DI CAMPAGNA A LUNGO TERMINE PER IL MASTER IA ---
// Il modulo 29 risolve la memoria di UN combattimento (riepilogo iniettato a fine scontro), ma la
// cronologia inviata a Groq resta comunque una finestra scorrevole di 16 messaggi: dopo ORE di
// gioco (molti combattimenti, molti spostamenti, molti scambi) gli eventi piu' vecchi escono dalla
// finestra e il Master puo' "dimenticarli" — esattamente il problema che questo modulo risolve,
// accumulando gli eventi chiave dell'INTERA sessione in un diario persistente e capato, iniettato
// nel prompt di sistema di ENTRAMBI Groq e Ollama tramite le funzioni esposte da js/12
// (UltimateVTTCoreGameplay.appendDiarioCampagna/getDiarioCampagna).
//
// Cattura tre canali, tutti per wrapping non invasivo (nessun modulo esistente viene modificato):
//  1) UltimateVTTCoreGameplay.setUltimoRiepilogoCombattimento: chiamata dal modulo 29 esattamente
//     una volta a fine combattimento col riepilogo completo; qui se ne estrae solo la riga
//     dell'esito (condensata), per non duplicare l'intero digest granulare nel diario.
//  2) UltimateVTTCoreGameplay.appendChatMessage: filtra SOLO i messaggi "system" di level-up
//     (modulo 15, prefisso "⭐ LIVELLO"), ignorando tutto il resto (gia' bufferizzato altrove dal
//     modulo 29 durante il combattimento, non serve duplicarlo qui).
//  3) window.VentimigliaMap.goTo / window.VTTCampagna.goToPlace: ogni spostamento verso un luogo
//     reale di Ventimiglia diventa una voce del diario, cosi' il Master ricorda dove si trova/e'
//     stato il party anche dopo ore, non solo nell'ultimo scambio.
(function () {
  "use strict";

  var INTERVALLO_MS = 500;

  function coreGameplay() { return window.UltimateVTTCoreGameplay || null; }
  function log(m) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
  }

  function aggiungiVoce(testo) {
    var CG = coreGameplay();
    if (CG && typeof CG.appendDiarioCampagna === "function") {
      try { CG.appendDiarioCampagna(testo); } catch (e) { /* ignora */ }
    }
  }

  // ---------------------------------------------------------------------------
  // FUNZIONE PURA (testabile): condensa il digest multi-riga del modulo 29 a una sola riga per il
  // diario (che deve restare compatto anche dopo decine di combattimenti in una sessione lunga).
  // ---------------------------------------------------------------------------
  function condensaDigestCombattimento(testo) {
    testo = String(testo || "");
    if (!testo) { return ""; }
    var m = /^Esito:\s*(.+)$/m.exec(testo);
    return m ? ("⚔️ Combattimento concluso — " + m[1]) : "⚔️ Un combattimento si è concluso.";
  }

  // ---------------------------------------------------------------------------
  // Wrapping (idempotente) delle funzioni ponte esposte da js/12.
  // ---------------------------------------------------------------------------
  var wrappingRiepilogoFatto = false;
  function avvolgiRiepilogoCombattimento() {
    var CG = coreGameplay();
    if (!CG || wrappingRiepilogoFatto || typeof CG.setUltimoRiepilogoCombattimento !== "function") { return; }
    var originale = CG.setUltimoRiepilogoCombattimento;
    CG.setUltimoRiepilogoCombattimento = function (testo) {
      var r = originale.apply(this, arguments);
      var condensato = condensaDigestCombattimento(testo);
      if (condensato) { aggiungiVoce(condensato); }
      return r;
    };
    wrappingRiepilogoFatto = true;
  }

  var wrappingChatFatto = false;
  function avvolgiAppendChatMessage() {
    var CG = coreGameplay();
    if (!CG || wrappingChatFatto || typeof CG.appendChatMessage !== "function") { return; }
    var originale = CG.appendChatMessage;
    CG.appendChatMessage = function (speaker, testo) {
      var r = originale.apply(this, arguments);
      if (speaker === "system" && typeof testo === "string" && /^⭐ LIVELLO/.test(testo)) {
        aggiungiVoce("🌟 " + testo.replace(/^⭐\s*/, ""));
      }
      return r;
    };
    wrappingChatFatto = true;
  }

  // window.VTTCampagna.goToPlace segnala esplicitamente un luogo non risolto tornando null: in tal
  // caso NON si deve loggare comunque il testo digitato (potrebbe essere un nome sbagliato/a caso).
  // window.VentimigliaMap.goTo invece non ritorna mai nulla (ne' in successo ne' in fallimento):
  // per quella, in assenza di un segnale migliore, si usa l'argomento passato come approssimazione.
  function estraiNomeLuogo(argomenti, risultato) {
    if (typeof risultato === "string" && risultato) { return risultato; }
    if (risultato === null) { return null; }
    if (argomenti && typeof argomenti[0] === "string" && argomenti[0]) { return argomenti[0]; }
    return null;
  }

  // Nessun flag "fatto una volta sola" qui: VentimigliaMap e VTTCampagna possono diventare
  // disponibili in momenti diversi (js/12 e' enorme e inizializza i suoi moduli interni in
  // sequenza), quindi ogni bersaglio si riprova indipendentemente a ogni tick finche' non e'
  // avvolto — l'idempotenza e' garantita dal marcatore _diarioAvvolta su ciascuna funzione, non da
  // uno stato globale del modulo (un bug precedente con un flag unico saltava per sempre il secondo
  // bersaglio se il primo veniva avvolto prima che l'altro esistesse ancora).
  function avvolgiSpostamenti() {
    var VM = window.VentimigliaMap;
    if (VM && typeof VM.goTo === "function" && !VM.goTo._diarioAvvolta) {
      var goToOriginale = VM.goTo;
      var goToAvvolta = function () {
        var r = goToOriginale.apply(this, arguments);
        var nome = estraiNomeLuogo(arguments, r);
        if (nome) { aggiungiVoce("🧭 Il gruppo si sposta verso " + nome + "."); }
        return r;
      };
      goToAvvolta._diarioAvvolta = true;
      VM.goTo = goToAvvolta;
    }

    var CAMP = window.VTTCampagna;
    if (CAMP && typeof CAMP.goToPlace === "function" && !CAMP.goToPlace._diarioAvvolta) {
      var goToPlaceOriginale = CAMP.goToPlace;
      var goToPlaceAvvolta = function () {
        var r = goToPlaceOriginale.apply(this, arguments);
        var nome = estraiNomeLuogo(arguments, r);
        if (nome) { aggiungiVoce("🧭 Il gruppo si sposta verso " + nome + "."); }
        return r;
      };
      goToPlaceAvvolta._diarioAvvolta = true;
      CAMP.goToPlace = goToPlaceAvvolta;
    }
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  var timer = null;
  function tick() {
    avvolgiRiepilogoCombattimento();
    avvolgiAppendChatMessage();
    avvolgiSpostamenti();
  }

  function inizializza() {
    if (!window.document) { return; }
    tick();
    if (!timer) { timer = window.setInterval(tick, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(32, { campaignMemory: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 32 caricato: diario di campagna a lungo termine per il Master IA.");
  }

  window.UltimateVTTCampaignMemory = {
    // logica pura (testabile)
    condensaDigestCombattimento: condensaDigestCombattimento,
    // controllo
    fermaSampler: function () { if (timer) { clearInterval(timer); timer = null; } },
    // utile ai test: esegue un ciclo di wrapping reale. Nessun _reset(): il wrapping e' permanente
    // per design (non deve mai avvolgere due volte la stessa funzione), i test che necessitano di
    // un wrap fresco ricaricano il modulo con vm (stesso pattern del modulo 29).
    _tick: function () { tick(); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 32 JS: DIARIO DI CAMPAGNA A LUNGO TERMINE ---
