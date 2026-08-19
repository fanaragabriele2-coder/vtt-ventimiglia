// Test del terreno sopraelevato (modulo 28): geometria pura (differenza di quota, vantaggio/
// svantaggio), composizione con altre fonti (regola di sovrapposizione 5e generalizzata), pittura
// GM-autorevole di un'area con propagazione di rete, applicazione inbound, lettura live, overlay.
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

// UltimateVTTCanvas DEVE esistere PRIMA del caricamento del modulo: addWorldRenderer viene chiamato
// una sola volta, durante inizializza(). Cattura il callback per un test reale del disegno.
let rendererCatturato = null;
window.UltimateVTTCanvas = {
  addWorldRenderer: (fn) => { rendererCatturato = fn; },
  getGridMetrics: () => ({ gridSize: 48, cellMeters: 1.5 }),
  cellToWorldCenter: (cx, cy) => ({ x: cx * 48 + 24, y: cy * 48 + 24 }),
  requestRender: () => {}
};

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/28-bg3-elevation.js");

const E = window.UltimateVTTElevation;
check("UltimateVTTElevation esposto", !!E);

console.log("\n[Geometria pura: differenza e vantaggio/svantaggio]");
check("differenzaElevazione(3,1) = 2", E.differenzaElevazione(3, 1) === 2);
check("differenzaElevazione(1,3) = -2", E.differenzaElevazione(1, 3) === -2);
check("attaccante piu' in alto -> advantage", E.vantaggioPerElevazione(2, 0) === "advantage");
check("attaccante piu' in basso -> disadvantage", E.vantaggioPerElevazione(0, 2) === "disadvantage");
check("stessa quota -> normal", E.vantaggioPerElevazione(1, 1) === "normal");
check("anche una differenza minima (1 livello) conta", E.vantaggioPerElevazione(1, 0) === "advantage");

console.log("\n[Composizione con altre fonti — regola di sovrapposizione 5e]");
check("nessuna fonte extra -> modalita' scelta invariata (normale)", E.componiModalita("normal", false, false) === "normal");
check("nessuna fonte extra -> modalita' scelta invariata (svantaggio)", E.componiModalita("disadvantage", false, false) === "disadvantage");
check("solo vantaggio extra -> vantaggio", E.componiModalita("normal", true, false) === "advantage");
check("solo svantaggio extra -> svantaggio", E.componiModalita("normal", false, true) === "disadvantage");
check("vantaggio extra + svantaggio extra -> si annullano (normale)", E.componiModalita("normal", true, true) === "normal");
check("scelta vantaggio + svantaggio extra -> si annullano (normale)", E.componiModalita("advantage", false, true) === "normal");
check("scelta svantaggio + vantaggio extra -> si annullano (normale)", E.componiModalita("disadvantage", true, false) === "normal");
check("scelta vantaggio + vantaggio extra -> resta vantaggio (non raddoppia)", E.componiModalita("advantage", true, false) === "advantage");

console.log("\n[quotaDi: default e lettura]");
check("una cella mai dipinta ha quota 0", E.quotaDi(5, 5) === 0);

console.log("\n[Pittura GM-autorevole di un'area + propagazione di rete]");
let eventiEmessi = [];
window.UltimateVTTSync = {
  isMaster: () => true,
  TipiEvento: { ELEVAZIONE_IMPOSTATA: "ElevationSetEvent" },
  creaEvento: (tipo, payload) => ({ tipo, payload }),
  emetti: (evento) => { eventiEmessi.push(evento); return true; }
};
check("isMasterOrSolo() e' true sul client Master", E.isMasterOrSolo() === true);
const esito = E.impostaElevazioneArea(10, 10, 1, 2);
check("il Master imposta la quota con successo", esito.ok === true);
check("il centro dell'area ha la quota impostata", E.quotaDi(10, 10) === 2);
check("una cella adiacente (raggio 1) ha la stessa quota", E.quotaDi(11, 10) === 2 && E.quotaDi(9, 9) === 2);
check("una cella fuori raggio resta a quota 0", E.quotaDi(12, 10) === 0);
check("il Master emette un ElevationSetEvent", eventiEmessi.length === 1 && eventiEmessi[0].tipo === "ElevationSetEvent");
check("l'evento porta i dati corretti", eventiEmessi[0].payload.cellX === 10 && eventiEmessi[0].payload.raggio === 1 && eventiEmessi[0].payload.livello === 2);

console.log("\n[Livello 0 rimuove la cella dalla mappa (pulizia dello stato sparso)]");
E.impostaElevazioneArea(10, 10, 1, 0);
check("dopo aver dipinto quota 0, la cella torna a quota 0 (default)", E.quotaDi(10, 10) === 0);

console.log("\n[Client giocatore: pittura rifiutata]");
window.UltimateVTTSync = { isMaster: () => false };
check("isMasterOrSolo() e' false su un client giocatore", E.isMasterOrSolo() === false);
const rifiutato = E.impostaElevazioneArea(3, 3, 1, 2);
check("client giocatore: impostaElevazioneArea rifiutata (ok:false)", rifiutato.ok === false);
check("il messaggio indica che serve il Master", /Master/.test(rifiutato.message));
check("nessuna quota impostata quando rifiutata", E.quotaDi(3, 3) === 0);

console.log("\n[Applicazione inbound (client non-Master che riceve l'evento del Master)]");
E._reset();
const eventoInbound = { tipo: "ElevationSetEvent", payload: { cellX: 20, cellY: 20, raggio: 0, livello: -1 } };
E._gestisciInbound(eventoInbound);
check("l'inbound applica la quota ricevuta", E.quotaDi(20, 20) === -1);
check("un payload malformato (senza coordinate) viene ignorato", (function () {
  E._gestisciInbound({ tipo: "ElevationSetEvent", payload: {} });
  return E.quotaDi(20, 20) === -1; // invariato
})());

console.log("\n[Lettura live: valutaElevazione]");
E._reset();
window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: () => ({}), emetti: () => true };
E.impostaElevazioneArea(5, 5, 0, 2);  // solo la cella (5,5) e' a quota +2
E.impostaElevazioneArea(8, 8, 0, -1); // solo la cella (8,8) e' a quota -1
window.UltimateVTTCombat = { getState: () => ({ combatants: [
  { id: "pc-local", kind: "pc" }, { id: "npc-1", kind: "npc" }
] }) };
window.UltimateVTTTokenPhysics = { getState: () => ({ tokens: [
  { id: "token-pc", cellX: 5, cellY: 5 }, { id: "token-npc-1", cellX: 8, cellY: 8 }
] }) };
check("l'attaccante sul rilievo (+2) ha vantaggio sul bersaglio in basso (-1)", E.valutaElevazione("pc-local", "npc-1") === "advantage");
check("simmetricamente, l'attaccante in basso ha svantaggio sul bersaglio in rilievo", E.valutaElevazione("npc-1", "pc-local") === "disadvantage");
check("senza posizioni note (token assenti) ritorna 'normal', non lancia", (function () {
  window.UltimateVTTTokenPhysics = { getState: () => ({ tokens: [] }) };
  return E.valutaElevazione("pc-local", "npc-1") === "normal";
})());

console.log("\n[Overlay canvas: il modulo si registra e disegna davvero]");
check("il modulo ha registrato il proprio renderer su UltimateVTTCanvas.addWorldRenderer", typeof rendererCatturato === "function");

function ctx2dFinto() {
  const chiamate = [];
  return {
    chiamate,
    save() { chiamate.push("save"); }, restore() { chiamate.push("restore"); },
    strokeRect() { chiamate.push("strokeRect"); }, fillText() { chiamate.push("fillText"); },
    fillStyle: "", strokeStyle: "", lineWidth: 0, font: "", textAlign: "", textBaseline: ""
  };
}

E._reset();
let ctxVuoto = ctx2dFinto();
rendererCatturato({ context: ctxVuoto });
check("senza quote impostate non disegna nulla", ctxVuoto.chiamate.length === 0);

window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: () => ({}), emetti: () => true };
E.impostaElevazioneArea(1, 1, 0, 3);
let ctxConQuota = ctx2dFinto();
rendererCatturato({ context: ctxConQuota });
check("con una quota impostata disegna il riquadro e il numero (strokeRect + fillText)",
  ctxConQuota.chiamate.includes("strokeRect") && ctxConQuota.chiamate.includes("fillText"));
check("il disegno non lancia senza un context valido", (function () {
  try { rendererCatturato({}); return true; } catch (e) { return false; }
})());

console.log("\nRisultato core-bg3-elevation: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
