// Test delle superfici (modulo 27): geometria pura, scadenza basata sul round SINCRONIZZATO
// (quello della FSM, non quello locale di UltimateVTTCombat — la stessa distinzione che ha
// causato il desync corretto nei moduli 24/26), creazione GM-autorevole con propagazione di rete,
// applicazione inbound, e tick del danno (una sola volta per round, solo sul Master).
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
// una sola volta, durante inizializza(). Cattura il callback per poterlo invocare direttamente nei
// test (verifica reale del disegno, non solo che l'inizializzazione non lanci).
let rendererCatturato = null;
window.UltimateVTTCanvas = {
  addWorldRenderer: (fn) => { rendererCatturato = fn; },
  getGridMetrics: () => ({ gridSize: 48, cellMeters: 1.5 }),
  cellToWorldCenter: (cx, cy) => ({ x: cx * 48 + 24, y: cy * 48 + 24 }),
  requestRender: () => {}
};

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/27-bg3-surfaces.js");

const S = window.UltimateVTTSurfaces;
S.fermaSampler();
check("UltimateVTTSurfaces esposto", !!S);
check("Tipi espone fuoco e veleno", S.Tipi.FUOCO === "fuoco" && S.Tipi.VELENO === "veleno");

console.log("\n[Geometria pura: eDentro]");
check("cella al centro e' dentro (raggio 0)", S.eDentro({ cellX: 5, cellY: 5, raggio: 0 }, { cellX: 5, cellY: 5 }) === true);
check("cella adiacente e' dentro (raggio 1)", S.eDentro({ cellX: 5, cellY: 5, raggio: 1 }, { cellX: 6, cellY: 6 }) === true);
check("cella al limite esatto e' dentro (raggio 2)", S.eDentro({ cellX: 5, cellY: 5, raggio: 2 }, { cellX: 7, cellY: 5 }) === true);
check("cella appena fuori raggio e' fuori", S.eDentro({ cellX: 5, cellY: 5, raggio: 1 }, { cellX: 7, cellY: 5 }) === false);

console.log("\n[Scadenza pura: eScaduta]");
check("appena creata (stesso round) non e' scaduta", S.eScaduta({ creataAlRound: 3, durataRound: 3 }, 3) === false);
check("un round prima della scadenza non e' scaduta", S.eScaduta({ creataAlRound: 3, durataRound: 3 }, 5) === false);
check("esattamente ai round di durata e' scaduta", S.eScaduta({ creataAlRound: 3, durataRound: 3 }, 6) === true);
check("oltre la durata resta scaduta", S.eScaduta({ creataAlRound: 3, durataRound: 3 }, 9) === true);

console.log("\n[Formula danno e durata di default]");
check("formula fuoco = 1d4", S.formulaDanno("fuoco") === "1d4");
check("formula veleno = 1d4", S.formulaDanno("veleno") === "1d4");
check("tipo sconosciuto ricade su 1d4", S.formulaDanno("gelo") === "1d4");
check("durata di default fuoco = 3 round", S.durataDefault("fuoco") === 3);
check("durata di default veleno = 2 round", S.durataDefault("veleno") === 2);

// ---- Stub minimi di combattimento/token/FSM per i test runtime ----
let combatState = { active: true, round: 1,
  combatants: [
    { id: "pc-local", kind: "pc", name: "Eroe", hitPoints: 20, maxHitPoints: 20, defeated: false },
    { id: "npc-1", kind: "npc", name: "Goblin", hitPoints: 7, maxHitPoints: 7, defeated: false }
  ] };
let fsmRound = 1;
let dannoApplicato = [];
window.UltimateVTTCombat = {
  getState: () => JSON.parse(JSON.stringify(combatState)),
  rollDamageFormula: () => ({ total: 3 }),
  applyDamageToCombatant: (id, amount) => { dannoApplicato.push({ id, amount }); return true; }
};
window.UltimateVTTCombatFSM = { getStato: () => ({ round: fsmRound }) };
window.UltimateVTTTokenPhysics = { getState: () => ({ tokens: [
  { id: "token-pc", cellX: 5, cellY: 5 }, { id: "token-npc-1", cellX: 20, cellY: 20 }
] }) };

console.log("\n[Il round di riferimento e' quello della FSM, non quello locale del combat]");
// combatState.round resta 1 (locale, potenzialmente non sincronizzato sui client giocatore);
// fsmRound=7 e' quello davvero sincronizzato: una superficie creata "ora" deve usare 7, non 1.
S._reset();
fsmRound = 7;
const creata = S.creaSuperficie("fuoco", 5, 5, 0, 3);
check("creaSuperficie usa il round della FSM (7), non quello locale del combat (1)", creata.superficie.creataAlRound === 7);

console.log("\n[Creazione GM-autorevole + propagazione di rete]");
S._reset();
fsmRound = 1;
let eventiEmessi = [];
window.UltimateVTTSync = {
  isMaster: () => true,
  TipiEvento: { SUPERFICIE_CREATA: "SurfaceCreatedEvent" },
  creaEvento: (tipo, payload) => ({ tipo, payload }),
  emetti: (evento) => { eventiEmessi.push(evento); return true; }
};
check("isMasterOrSolo() e' true sul client Master", S.isMasterOrSolo() === true);
const r1 = S.creaSuperficie("fuoco", 8, 8, 1, 3);
check("il Master crea la superficie con successo", r1.ok === true);
check("il Master emette un SurfaceCreatedEvent", eventiEmessi.length === 1 && eventiEmessi[0].tipo === "SurfaceCreatedEvent");
check("l'evento porta i dati corretti", eventiEmessi[0].payload.tipo === "fuoco" && eventiEmessi[0].payload.cellX === 8 && eventiEmessi[0].payload.raggio === 1);
check("elencoAttivo la include", S.elencoAttivo().some(s => s.cellX === 8 && s.cellY === 8));

console.log("\n[Client giocatore: creazione rifiutata]");
window.UltimateVTTSync = { isMaster: () => false };
check("isMasterOrSolo() e' false su un client giocatore", S.isMasterOrSolo() === false);
const r2 = S.creaSuperficie("veleno", 1, 1, 1, 2);
check("client giocatore: creaSuperficie rifiutata (ok:false)", r2.ok === false);
check("il messaggio indica che serve il Master", /Master/.test(r2.message));
check("nessuna superficie aggiunta quando rifiutata", !S.elencoAttivo().some(s => s.cellX === 1 && s.cellY === 1));

console.log("\n[Applicazione inbound (client non-Master che riceve l'evento del Master)]");
S._reset();
// Round locale del client che riceve (5) diverso da quello di creazione del Master (4, dal payload),
// ma la superficie e' ancora attiva a entrambi (durata 2): non e' ancora scaduta al round 5.
fsmRound = 5;
const eventoInbound = { tipo: "SurfaceCreatedEvent",
  payload: { id: "sup-remoto-1", tipo: "veleno", cellX: 12, cellY: 12, raggio: 2, durataRound: 2, creataAlRound: 4 } };
S._gestisciInbound(eventoInbound);
check("l'inbound aggiunge la superficie con i dati esatti dell'evento", S.elencoAttivo().some(s => s.id === "sup-remoto-1" && s.cellX === 12 && s.cellY === 12 && s.tipo === "veleno" && s.raggio === 2));
check("usa il round di creazione DEL MASTER (4) dal payload, non quello locale (5): evita che client con latenze diverse calcolino scadenze diverse",
  S.elencoAttivo().find(s => s.id === "sup-remoto-1").creataAlRound === 4);

// Un secondo inbound con lo STESSO id (es. rimbalzo del relay) non deve duplicare la superficie.
S._gestisciInbound(eventoInbound);
check("un evento inbound duplicato (stesso id) non crea una seconda superficie", S.elencoAttivo().filter(s => s.id === "sup-remoto-1").length === 1);

// Payload malformato (senza tipo/coordinate): ignorato silenziosamente, non lancia.
const contoPrima = S.elencoAttivo().length;
S._gestisciInbound({ tipo: "SurfaceCreatedEvent", payload: {} });
check("un payload malformato viene ignorato (non lancia, non crea nulla)", S.elencoAttivo().length === contoPrima);

console.log("\n[Tick del danno: una volta per round, solo sul Master]");
S._reset();
combatState = { active: true, round: 1,
  combatants: [
    { id: "pc-local", kind: "pc", name: "Eroe", hitPoints: 20, maxHitPoints: 20, defeated: false },
    { id: "npc-1", kind: "npc", name: "Goblin", hitPoints: 7, maxHitPoints: 7, defeated: false }
  ] };
window.UltimateVTTTokenPhysics = { getState: () => ({ tokens: [
  { id: "token-pc", cellX: 5, cellY: 5 }, { id: "token-npc-1", cellX: 20, cellY: 20 } // Goblin lontano: non colpito
] }) };
fsmRound = 1;
dannoApplicato = [];
window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: () => ({}), emetti: () => true };
S.creaSuperficie("fuoco", 5, 5, 0, 3); // il PG e' esattamente al centro

S._tick();
check("il PG in una superficie di fuoco subisce danno al primo tick", dannoApplicato.length === 1 && dannoApplicato[0].id === "pc-local" && dannoApplicato[0].amount === 3);
check("il Goblin lontano non e' colpito", !dannoApplicato.some(d => d.id === "npc-1"));

dannoApplicato = [];
S._tick();
check("nessun altro danno nello STESSO round (evita di applicarlo piu' volte a tick)", dannoApplicato.length === 0);

fsmRound = 2; // nuovo round
dannoApplicato = [];
S._tick();
check("al round successivo il danno si applica di nuovo", dannoApplicato.length === 1 && dannoApplicato[0].id === "pc-local");

console.log("\n[Il tick del danno NON risolve su un client giocatore]");
S._reset();
fsmRound = 1;
dannoApplicato = [];
window.UltimateVTTSync = { isMaster: () => false };
S.creaSuperficie("fuoco", 5, 5, 0, 3); // rifiutata (non-Master): nessuna superficie creata
window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: () => ({}), emetti: () => true };
S.creaSuperficie("fuoco", 5, 5, 0, 3); // ora creata come Master, per popolare la scena
window.UltimateVTTSync = { isMaster: () => false }; // torna client giocatore
dannoApplicato = [];
S._tick();
check("un client giocatore non applica danno (solo il Master lo fa)", dannoApplicato.length === 0);

console.log("\n[Scadenza automatica dopo la durata]");
S._reset();
fsmRound = 1;
window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: () => ({}), emetti: () => true };
S.creaSuperficie("veleno", 9, 9, 0, 2); // dura 2 round: creata al round 1, scade al round 3
check("subito dopo la creazione e' nell'elenco attivo", S.elencoAttivo().length === 1);
fsmRound = 2;
S._tick();
check("al round 2 (dentro la durata) e' ancora attiva", S.elencoAttivo().length === 1);
fsmRound = 3;
S._tick();
check("al round 3 (durata esaurita) e' stata rimossa", S.elencoAttivo().length === 0);

console.log("\n[Overlay canvas: il modulo si registra e disegna davvero]");
check("il modulo ha registrato il proprio renderer su UltimateVTTCanvas.addWorldRenderer", typeof rendererCatturato === "function");

// Contesto 2D finto che registra le chiamate di disegno.
function ctx2dFinto() {
  const chiamate = [];
  return {
    chiamate,
    save() { chiamate.push("save"); }, restore() { chiamate.push("restore"); },
    beginPath() { chiamate.push("beginPath"); }, arc() { chiamate.push("arc"); },
    fill() { chiamate.push("fill"); }, stroke() { chiamate.push("stroke"); },
    setLineDash() {}, fillStyle: "", strokeStyle: "", lineWidth: 0
  };
}

S._reset();
let ctxVuoto = ctx2dFinto();
check("senza superfici attive non disegna nulla (nessuna chiamata arc/fill)", (function () {
  rendererCatturato({ context: ctxVuoto, mapState: { viewport: { scale: 1 } } });
  return ctxVuoto.chiamate.length === 0;
})());

fsmRound = 1;
window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: () => ({}), emetti: () => true };
S.creaSuperficie("fuoco", 5, 5, 1, 3);
let ctxConSuperficie = ctx2dFinto();
rendererCatturato({ context: ctxConSuperficie, mapState: { viewport: { scale: 1 } } });
check("con una superficie attiva disegna un cerchio (arc + fill + stroke)",
  ctxConSuperficie.chiamate.includes("arc") && ctxConSuperficie.chiamate.includes("fill") && ctxConSuperficie.chiamate.includes("stroke"));
check("il disegno non lancia senza un context valido (rendererContext.context assente)", (function () {
  try { rendererCatturato({}); return true; } catch (e) { return false; }
})());

S.fermaSampler();
console.log("\nRisultato core-bg3-surfaces: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
