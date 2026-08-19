// --- INIZIO MODULO 36 JS: GLOBAL GAME STATE (store osservabile unico) ---
// VINCOLO NEGATIVO 1 della specifica "Lead Game Designer": Chat, Inventario e Mappe NON devono
// tenere stato in variabili indipendenti e in contrasto tra loro, ma iscriversi a un unico
// GlobalGameState (in Flutter sarebbe Provider/Riverpod/BLoC; qui e' l'equivalente vanilla: un
// piccolo store con get/set/subscribe + un event bus). I moduli restano disaccoppiati — non si
// conoscono tra loro — e comunicano solo tramite questo stato condiviso e i suoi eventi.
//
// Chi scrive: l'Encounter Balancer (37) pubblica l'ultimo scontro bilanciato; il ponte chat->mappa
// (39) pubblica la posizione corrente del party (POI di Ventimiglia). Chi legge/ascolta: le due
// mappe (tattica e overworld) e la HUD reagiscono agli stessi eventi, senza copie divergenti.
(function () {
  "use strict";

  // Stato canonico: l'unica copia di verita' condivisa. Chiavi a namespace ("party.location",
  // "encounter.last", ...) cosi' sistemi diversi non si pestano i piedi.
  var stato = {
    "party.location": null,      // { name, lat, lng } — dove si trova il party sulla overworld
    "encounter.last": null,      // ultimo risultato dell'Encounter Balancer (cr, budget, lista)
    "combat.active": false       // specchio comodo dello stato di combattimento
  };

  var iscritti = {};             // evento -> [callback]
  var prossimoId = 1;

  function emetti(evento, payload) {
    var lista = iscritti[evento];
    if (!lista) { return; }
    // Copia difensiva: un handler che si disiscrive durante l'emissione non deve rompere il giro.
    lista.slice().forEach(function (v) {
      try { v.cb(payload, evento); } catch (e) { /* un ascoltatore rotto non blocca gli altri */ }
    });
  }

  // get(chiave): lettura; senza chiave ritorna uno snapshot copiato di tutto lo stato.
  function get(chiave) {
    if (chiave == null) {
      var copia = {};
      Object.keys(stato).forEach(function (k) { copia[k] = stato[k]; });
      return copia;
    }
    return stato[chiave];
  }

  // set(chiave, valore): scrive e notifica SOLO se il valore e' davvero cambiato (evita giri a
  // vuoto e loop tra sistemi che si riascoltano). Emette due eventi: uno specifico per la chiave
  // ("change:party.location") e uno generico ("change") con { chiave, valore, precedente }.
  function set(chiave, valore) {
    var precedente = stato[chiave];
    if (precedente === valore) { return false; }
    stato[chiave] = valore;
    emetti("change:" + chiave, { chiave: chiave, valore: valore, precedente: precedente });
    emetti("change", { chiave: chiave, valore: valore, precedente: precedente });
    return true;
  }

  // subscribe(evento, cb) -> funzione di disiscrizione. Eventi utili:
  //   "change:<chiave>"  cambio di una chiave specifica
  //   "change"           qualunque cambio
  //   nomi liberi        bus generico (es. "encounter:balanced", "party:moved")
  function subscribe(evento, cb) {
    if (typeof cb !== "function") { return function () {}; }
    var id = prossimoId++;
    (iscritti[evento] = iscritti[evento] || []).push({ id: id, cb: cb });
    return function unsubscribe() {
      var lista = iscritti[evento];
      if (!lista) { return; }
      iscritti[evento] = lista.filter(function (v) { return v.id !== id; });
    };
  }

  // publish(evento, payload): bus generico per notifiche che non sono un semplice cambio-chiave
  // (es. "encounter:balanced"). I moduli lo usano per reagire allo stesso evento in modo coerente.
  function publish(evento, payload) { emetti(evento, payload); }

  window.UltimateVTTGameState = {
    get: get,
    set: set,
    subscribe: subscribe,
    publish: publish,
    // solo per i test: azzera stato e iscritti
    _reset: function () { stato = { "party.location": null, "encounter.last": null, "combat.active": false }; iscritti = {}; prossimoId = 1; }
  };

  if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
    try { window.UltimateVTT.registerModule(36, { globalGameState: true }); } catch (e) { /* best-effort */ }
  }
  if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
    try { window.UltimateVTT.appendSystemLog("Modulo 36 caricato: Global Game State (store osservabile unico)."); } catch (e) { /* ignora */ }
  }
})();
// --- FINE MODULO 36 JS: GLOBAL GAME STATE ---
