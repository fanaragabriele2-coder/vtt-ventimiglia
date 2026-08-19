// Test del ponte chat -> mappa Ventimiglia (modulo 39): riconoscimento PURO dei POI nella narrazione
// del Master (Regola 3), gating sul contesto di ARRIVO, idempotenza rispetto alla posizione corrente,
// e integrazione (wrap di appendChatMessage -> spostamento + Global Game State).
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

global.window = global;
global.document = { readyState: "complete", addEventListener() {} };
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };
window.setInterval = function () { return 0; };
window.setTimeout = function (fn) { return 0; }; // i test pilotano il flush a mano
window.clearTimeout = function () {};
window.clearInterval = function () {};

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/36-global-game-state.js");
carica("js/39-chat-map-sync.js");

const MS = window.UltimateVTTMapSync;
check("UltimateVTTMapSync esposto", !!MS);

const POI = [
  "Lungomare", "Stazione FS", "Porto Turistico", "Forte dell'Annunziata",
  "Giardini Hanbury", "Teatro Romano", "Municipio", "Città Alta", "Cattedrale Assunta"
];

console.log("\n[Regola 3: riconoscimento del POI nella narrazione del Master]");
check("'Arrivate alla Passeggiata' -> Lungomare (via alias)", MS.rilevaLuogo("Dopo una lunga camminata, arrivate alla Passeggiata.", POI) === "Lungomare");
check("'Giungete al Forte dell'Annunziata' -> Forte dell'Annunziata (nome completo)", MS.rilevaLuogo("Giungete al Forte dell'Annunziata mentre cala la sera.", POI) === "Forte dell'Annunziata");
check("'Entrate nella stazione dei treni' -> Stazione FS (alias)", MS.rilevaLuogo("Entrate nella stazione dei treni.", POI) === "Stazione FS");
check("'Raggiungete i Giardini Hanbury' -> Giardini Hanbury (parola chiave)", MS.rilevaLuogo("Raggiungete infine i Giardini Hanbury.", POI) === "Giardini Hanbury");

console.log("\n[Gating: serve un contesto di ARRIVO, non una menzione qualsiasi]");
check("una menzione senza arrivo NON teletrasporta ('si vede il porto in lontananza')", MS.rilevaLuogo("Da qui si vede il porto in lontananza.", POI) === null);
check("con richiediArrivo:false anche la sola menzione trova il POI (utile ai test di match)", MS.rilevaLuogo("Da qui si vede il porto in lontananza.", POI, { richiediArrivo: false }) === "Porto Turistico");
check("testo senza alcun POI -> null", MS.rilevaLuogo("Arrivate in un luogo sconosciuto e silenzioso.", POI) === null);

console.log("\n[Match più lungo vince: 'Città Alta' non confuso con altro]");
check("'Salite fino alla Città Alta' -> Città Alta", MS.rilevaLuogo("Salite fino alla Città Alta tra i vicoli.", POI) === "Città Alta");

// ---- Integrazione: wrap chat -> spostamento + Global Game State ----
console.log("\n[Integrazione: la narrazione del Master sposta il party e aggiorna lo stato unico]");
let goToChiamate = [];
window.VTTCampagna = { places: () => POI.slice(), goToPlace: (n) => { goToChiamate.push(n); return n; } };
window.VentimigliaMap = { goTo: (n) => { goToChiamate.push("map:" + n); } };
window.UltimateVTTCombat = { getState: () => ({ active: false }) };
window.UltimateVTTSync = undefined; // solitaria: isMasterOrSolo true

let eventiMoved = [];
window.UltimateVTTGameState.subscribe("party:moved", (p) => eventiMoved.push(p));

// Simula il core gameplay con appendChatMessage, poi lascia che il modulo lo avvolga.
let chatLog = [];
window.UltimateVTTCoreGameplay = { appendChatMessage: (speaker, testo) => { chatLog.push({ speaker, testo }); return true; } };
// Ri-inizializza il wrap ora che il core gameplay esiste.
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "js/39-chat-map-sync.js"), "utf8"), { filename: "js/39 (re-wrap)" });
const MS2 = window.UltimateVTTMapSync;

window.UltimateVTTCoreGameplay.appendChatMessage("master", "Dopo il viaggio, arrivate alla Passeggiata: il mare è calmo.");
MS2._flush(); // esegue il processamento ritardato
check("il messaggio originale è comunque stato registrato in chat", chatLog.some(m => /Passeggiata/.test(m.testo)));
check("VTTCampagna.goToPlace è stato chiamato col POI giusto (Lungomare)", goToChiamate.indexOf("Lungomare") >= 0);
check("anche la mappa reale Ventimiglia è stata spostata", goToChiamate.indexOf("map:Lungomare") >= 0);
check("il Global Game State registra la posizione del party", (function () {
  const loc = window.UltimateVTTGameState.get("party.location");
  return loc && loc.name === "Lungomare";
})());
check("viene pubblicato l'evento 'party:moved' con il POI", eventiMoved.some(e => e.name === "Lungomare" && e.fonte === "chat-master"));

console.log("\n[Idempotenza: se il party è già lì, non rifa il movimento]");
goToChiamate = [];
window.UltimateVTTCoreGameplay.appendChatMessage("master", "Restate ancora un poco: siete al Lungomare.");
MS2._flush();
check("un secondo arrivo allo STESSO POI non richiama goToPlace", goToChiamate.indexOf("Lungomare") < 0);

console.log("\n[Un messaggio del giocatore non innesca lo spostamento automatico]");
goToChiamate = [];
window.UltimateVTTCoreGameplay.appendChatMessage("player", "Arrivate al Teatro Romano!");
MS2._flush();
check("solo la voce 'master' pilota lo spostamento (non 'player')", goToChiamate.length === 0);

console.log("\n[Durante il combattimento non si esplora]");
goToChiamate = [];
window.UltimateVTTCombat = { getState: () => ({ active: true }) };
window.UltimateVTTCoreGameplay.appendChatMessage("master", "Giungete al Teatro Romano tra le rovine.");
MS2._flush();
check("a combattimento attivo la narrazione non sposta il party", goToChiamate.length === 0);

console.log("\nRisultato core-chat-map-sync: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
