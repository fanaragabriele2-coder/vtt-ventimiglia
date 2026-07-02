// Test dell'azione Spingi (modulo 26): prova contrapposta (Atletica vs Atletica/Acrobazia),
// geometria della spinta, euristiche dei modificatori PNG, e runtime completo (comando "spingi").
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Stub DOM minimale: solo cio' che serve per l'iniezione del pulsante ----
const registro = [];
function nuovoElemento(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(), id: "", _class: "", textContent: "",
    children: [], listeners: {},
    appendChild(f) { this.children.push(f); return f; },
    insertBefore(nuovo, rif) { const i = this.children.indexOf(rif); if (i === -1) { this.children.push(nuovo); } else { this.children.splice(i, 0, nuovo); } return nuovo; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  };
  Object.defineProperty(el, "className", { get() { return this._class; }, set(v) { this._class = String(v); } });
  registro.push(el);
  return el;
}
const trayAzioni = nuovoElemento("div"); trayAzioni.className = "bg3-actions";
const btnEnd = nuovoElemento("button"); btnEnd.textContent = "Termina turno";
trayAzioni.appendChild(btnEnd);

global.window = global;
global.document = {
  readyState: "complete", addEventListener() {}, createElement: nuovoElemento,
  querySelector(sel) { return sel === ".bg3-actions" ? trayAzioni : null; },
  body: {}
};
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/26-bg3-shove.js");

const H = window.UltimateVTTShove;
H.fermaAggiornamento();
check("UltimateVTTShove esposto", !!H);

console.log("\n[Prova contrapposta — esitoSpinta]");
check("attaccante supera nettamente -> successo", H.esitoSpinta({ attaccanteMod: 5, bersaglioMod: 0, tiroAttaccante: 15, tiroBersaglio: 10 }).successo === true);
check("bersaglio supera -> fallimento", H.esitoSpinta({ attaccanteMod: 0, bersaglioMod: 5, tiroAttaccante: 10, tiroBersaglio: 15 }).successo === false);
check("parita' -> vince il bersaglio (nessun successo)", H.esitoSpinta({ attaccanteMod: 3, bersaglioMod: 0, tiroAttaccante: 10, tiroBersaglio: 13 }).successo === false);
check("i totali sono calcolati correttamente", (function () {
  const e = H.esitoSpinta({ attaccanteMod: 4, bersaglioMod: 2, tiroAttaccante: 12, tiroBersaglio: 8 });
  return e.totaleAttaccante === 16 && e.totaleBersaglio === 10;
})());

console.log("\n[Geometria della spinta]");
check("spinta verso est: il bersaglio arretra di una cella nella stessa direzione", (function () {
  const c = H.celleSpinta({ cellX: 5, cellY: 5 }, { cellX: 6, cellY: 5 });
  return c.cellX === 7 && c.cellY === 5;
})());
check("spinta in diagonale: entrambi gli assi avanzano", (function () {
  const c = H.celleSpinta({ cellX: 5, cellY: 5 }, { cellX: 6, cellY: 6 });
  return c.cellX === 7 && c.cellY === 7;
})());
check("fuori portata di mischia (distanza 2) -> nessuna spinta possibile", H.celleSpinta({ cellX: 5, cellY: 5 }, { cellX: 7, cellY: 5 }) === null);
check("celle mancanti -> nessuna spinta possibile", H.celleSpinta(null, { cellX: 6, cellY: 5 }) === null);

console.log("\n[Euristiche PNG (nessun punteggio di caratteristica nel catalogo)]");
check("proxy Atletica = attackBonus del PNG", H.modificatoreAtleticaProxy({ attackBonus: 4 }) === 4);
check("proxy Acrobazia = initiativeBonus del PNG", H.modificatoreAcrobaziaProxy({ initiativeBonus: 2 }) === 2);
check("proxy con campi mancanti -> 0 (non lancia)", H.modificatoreAtleticaProxy({}) === 0);

console.log("\n[Iniezione del pulsante nella HUD]");
const shoveBtn = trayAzioni.children.find(function (c) { return c.id === "bg3ShoveButton"; });
check("il pulsante 'Spingi' e' stato iniettato nella barra azioni", !!shoveBtn && shoveBtn.textContent === "Spingi");
check("il pulsante 'Spingi' e' inserito PRIMA di 'Termina turno'", trayAzioni.children.indexOf(shoveBtn) < trayAzioni.children.indexOf(btnEnd));

console.log("\n[Runtime: comando spingi() con primitive stubbate]");
let combatState = {
  active: true, round: 1, currentTurnIndex: 0, selectedTargetId: "npc-1",
  combatants: [
    { id: "pc-local", kind: "pc", name: "Eroe", attackBonus: 5, initiativeBonus: 1, defeated: false },
    { id: "npc-1", kind: "npc", name: "Goblin", attackBonus: -1, initiativeBonus: -1, defeated: false }
  ]
};
let tiriInStack = [18, 4]; // attaccante alto, bersaglio basso: successo garantito
window.UltimateVTTCombat = {
  getState: () => JSON.parse(JSON.stringify(combatState)),
  rollD20WithMode: () => ({ chosen: tiriInStack.length ? tiriInStack.shift() : 10 })
};
let mosseApplicate = [];
window.UltimateVTTTokenPhysics = {
  getState: () => ({ tokens: [
    { id: "token-pc", cellX: 5, cellY: 5 }, { id: "token-npc-1", cellX: 6, cellY: 5 }
  ] }),
  moveTokenToCell: (id, cx, cy) => { mosseApplicate.push({ id, cx, cy }); return true; }
};

let r = H.spingi();
check("spinta riuscita: ok:true, successo:true", r.ok === true && r.successo === true);
check("il token del bersaglio viene spostato di una cella oltre", mosseApplicate.length === 1 && mosseApplicate[0].id === "token-npc-1" && mosseApplicate[0].cx === 7 && mosseApplicate[0].cy === 5);

// Spinta fallita: tiri invertiti.
mosseApplicate = [];
tiriInStack = [2, 18];
r = H.spingi();
check("spinta fallita: ok:true, successo:false", r.ok === true && r.successo === false);
check("nessun movimento applicato in caso di fallimento", mosseApplicate.length === 0);

// Nessun combattimento attivo -> errore gestito, non lancia.
combatState.active = false;
r = H.spingi();
check("senza combattimento attivo -> ok:false (non lancia)", r.ok === false);

// Bersaglio fuori portata -> errore gestito.
combatState.active = true;
window.UltimateVTTTokenPhysics.getState = () => ({ tokens: [
  { id: "token-pc", cellX: 0, cellY: 0 }, { id: "token-npc-1", cellX: 10, cellY: 10 }
] });
r = H.spingi();
check("bersaglio fuori portata -> ok:false (non lancia)", r.ok === false);

console.log("\n[Multiplayer: solo il Master risolve la spinta]");
// La chiamata diretta a moveTokenToCell non passa dal livello cinematico di rete: da un client
// giocatore resterebbe visibile solo sul suo schermo. Va quindi rifiutata, non risolta in locale.
window.UltimateVTTTokenPhysics.getState = () => ({ tokens: [
  { id: "token-pc", cellX: 5, cellY: 5 }, { id: "token-npc-1", cellX: 6, cellY: 5 }
] });
mosseApplicate = [];
tiriInStack = [18, 4]; // successo garantito, se venisse risolta
window.UltimateVTTSync = { isMaster: () => false }; // client GIOCATORE (non Master)
check("isMasterOrSolo() e' false su un client giocatore", H.isMasterOrSolo() === false);
r = H.spingi();
check("client giocatore: spingi() e' rifiutata (ok:false)", r.ok === false);
check("il messaggio indica che serve il Master", /Master/.test(r.message));
check("nessun movimento applicato quando rifiutata", mosseApplicate.length === 0);

console.log("\n[Multiplayer: il Master propaga la spinta con un TokenMovedEvent]");
let eventiEmessi = [];
window.UltimateVTTSync = {
  isMaster: () => true,
  creaEventoTokenMosso: (tokenId, cellX, cellY, opzioni) => ({ tipo: "TokenMovedEvent", payload: { tokenId, cellX, cellY, opzioni } }),
  emetti: (evento, undo) => { eventiEmessi.push(evento); return true; }
};
mosseApplicate = [];
tiriInStack = [18, 4];
r = H.spingi();
check("sul client Master la spinta si risolve normalmente", r.ok === true && r.successo === true);
check("il Master emette un TokenMovedEvent per propagare la spinta agli altri client", eventiEmessi.length === 1 && eventiEmessi[0].tipo === "TokenMovedEvent");
check("l'evento porta la cella di destinazione corretta", eventiEmessi[0].payload.tokenId === "token-npc-1" && eventiEmessi[0].payload.cellX === 7 && eventiEmessi[0].payload.cellY === 5);

console.log("\n[Single-player: nessun Sync presente, nessun tentativo di emissione (non lancia)]");
delete window.UltimateVTTSync;
mosseApplicate = [];
tiriInStack = [18, 4];
r = H.spingi();
check("senza alcun modulo Sync la spinta si risolve comunque (single-player)", r.ok === true && r.successo === true && mosseApplicate.length === 1);

console.log("\nRisultato core-bg3-shove: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
