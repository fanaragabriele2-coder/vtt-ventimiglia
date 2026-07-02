// Test dell'IA dei nemici (modulo 33): geometria pura dell'avvicinamento, scelta del bersaglio piu'
// vicino, e ciclo di vita completo del turno di un PNG (si avvicina -> attacca quando adiacente ->
// conclude il turno), oltre ai casi limite (nessun PG vivo, solo il Master pilota i nemici).
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

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/33-enemy-ai.js");

const AI = window.UltimateVTTEnemyAI;
AI.fermaSampler();
check("UltimateVTTEnemyAI esposto", !!AI);

console.log("\n[Geometria pura: chebyshev]");
check("distanza in linea retta", AI.chebyshev({ cellX: 0, cellY: 0 }, { cellX: 3, cellY: 0 }) === 3);
check("distanza diagonale (Chebyshev: max delle due)", AI.chebyshev({ cellX: 0, cellY: 0 }, { cellX: 3, cellY: 2 }) === 3);

console.log("\n[Geometria pura: cellaVersoBersaglio]");
check("gia' adiacente -> null (niente movimento)", AI.cellaVersoBersaglio({ cellX: 5, cellY: 5 }, { cellX: 6, cellY: 5 }, 6) === null);
check("si ferma su una cella ADIACENTE al bersaglio se raggiungibile (non ci finisce sopra)", (function () {
  const d = AI.cellaVersoBersaglio({ cellX: 0, cellY: 0 }, { cellX: 4, cellY: 0 }, 6);
  return d.cellX === 3 && d.cellY === 0; // 4-1 = adiacente
})());
check("con portata limitata avanza solo di 'portata' celle (non raggiunge)", (function () {
  const d = AI.cellaVersoBersaglio({ cellX: 0, cellY: 0 }, { cellX: 10, cellY: 0 }, 3);
  return d.cellX === 3 && d.cellY === 0; // avanza di 3
})());
check("avvicinamento diagonale (riduce entrambe le coordinate)", (function () {
  const d = AI.cellaVersoBersaglio({ cellX: 0, cellY: 0 }, { cellX: 5, cellY: 5 }, 6);
  return d.cellX === 4 && d.cellY === 4; // adiacente in diagonale
})());

// ---- Stub di combattimento / token / FSM per i test runtime ----
let combatState, dannoApplicato, attacchiRisolti, turniAvanzati;
function resetStato() {
  combatState = {
    active: true, round: 1, currentTurnIndex: 1,
    combatants: [
      { id: "pc-local", kind: "pc", name: "Eroe", hitPoints: 20, maxHitPoints: 20, armorClass: 12, defeated: false },
      { id: "npc-1", kind: "npc", name: "Goblin", hitPoints: 7, maxHitPoints: 7, attackBonus: 4, damageFormula: "1d6+2", defeated: false }
    ]
  };
  dannoApplicato = []; attacchiRisolti = []; turniAvanzati = 0;
}
resetStato();
let tokens = [
  { id: "token-pc", cellX: 10, cellY: 10 },
  { id: "token-npc-1", cellX: 16, cellY: 10 } // Goblin lontano 6 celle dal PG
];
window.UltimateVTTTokenPhysics = {
  getState: () => ({ tokens: JSON.parse(JSON.stringify(tokens)) }),
  moveTokenToCell: (id, x, y) => { const t = tokens.find(k => k.id === id); if (t) { t.cellX = x; t.cellY = y; return true; } return false; }
};
window.UltimateVTTCombat = {
  getState: () => JSON.parse(JSON.stringify(combatState)),
  resolveAttackBetween: (attId, tgtId) => { attacchiRisolti.push({ attId, tgtId }); return { hit: true }; },
  nextTurn: () => { turniAvanzati++; combatState.currentTurnIndex = (combatState.currentTurnIndex + 1) % combatState.combatants.length; }
};
window.UltimateVTTCombatFSM = {
  combattenteAToken: (id) => (id === "pc-local" ? "token-pc" : id === "npc-1" ? "token-npc-1" : null)
};
window.UltimateVTTSync = undefined; // solitaria: isMasterOrSolo() true

console.log("\n[bersaglioPiuVicino]");
check("sceglie l'unico PG vivo come bersaglio", AI.bersaglioPiuVicino(combatState, "npc-1").id === "pc-local");
check("nessun PG vivo -> null", (function () {
  const s = { combatants: [{ id: "pc-local", kind: "pc", defeated: true, hitPoints: 0 }, { id: "npc-1", kind: "npc", defeated: false, hitPoints: 7 }] };
  return AI.bersaglioPiuVicino(s, "npc-1") === null;
})());

console.log("\n[Ciclo di vita del turno nemico: si avvicina, poi attacca, poi conclude]");
resetStato();
tokens = [{ id: "token-pc", cellX: 10, cellY: 10 }, { id: "token-npc-1", cellX: 16, cellY: 10 }];
AI._reset();
// Turno del Goblin (indice 1), lontano 6 celle: al primo tick si avvicina e attacca (6-1=5<=portata 6),
// finendo adiacente, quindi attacca nello stesso turno.
AI._tick();
check("il Goblin si e' mosso verso il PG", tokens.find(t => t.id === "token-npc-1").cellX === 11);
check("essendo arrivato adiacente, ha attaccato il PG nello stesso turno", attacchiRisolti.length === 1 && attacchiRisolti[0].attId === "npc-1" && attacchiRisolti[0].tgtId === "pc-local");
check("dopo aver agito, il turno e' stato concluso (nextTurn)", turniAvanzati === 1);

console.log("\n[Un solo tick = una sola azione: non agisce due volte sullo stesso turno]");
resetStato();
tokens = [{ id: "token-pc", cellX: 10, cellY: 10 }, { id: "token-npc-1", cellX: 16, cellY: 10 }];
AI._reset();
AI._tick();
const attacchiDopoUnTick = attacchiRisolti.length;
// currentTurnIndex e' tornato a 0 (PG) dopo nextTurn: un secondo tick NON deve far agire nessuno.
AI._tick();
check("un secondo tick (turno del PG) non produce nuove azioni nemiche", attacchiRisolti.length === attacchiDopoUnTick);

console.log("\n[Nemico troppo lontano per raggiungere: si muove ma non attacca, e conclude il turno]");
resetStato();
tokens = [{ id: "token-pc", cellX: 10, cellY: 10 }, { id: "token-npc-1", cellX: 25, cellY: 10 }]; // 15 celle: fuori portata
AI._reset();
AI._tick();
check("il Goblin si e' avvicinato di 6 celle (portata), senza raggiungere", tokens.find(t => t.id === "token-npc-1").cellX === 19);
check("essendo ancora lontano, NON ha attaccato", attacchiRisolti.length === 0);
check("ha comunque concluso il turno", turniAvanzati === 1);

console.log("\n[Turno del PG: l'IA non fa nulla]");
resetStato();
combatState.currentTurnIndex = 0; // turno del PG
AI._reset();
AI._tick();
check("durante il turno del PG l'IA non attacca ne' avanza il turno", attacchiRisolti.length === 0 && turniAvanzati === 0);

console.log("\n[Combattimento non attivo: l'IA non fa nulla]");
resetStato();
combatState.active = false;
AI._reset();
AI._tick();
check("a combattimento spento l'IA non agisce", attacchiRisolti.length === 0 && turniAvanzati === 0);

console.log("\n[PG a terra: l'IA non manda i turni a vuoto all'infinito]");
resetStato();
combatState.combatants[0].defeated = true; combatState.combatants[0].hitPoints = 0;
AI._reset();
AI._tick();
check("senza PG vivo il turno del nemico NON viene fatto avanzare (decide il Master)", turniAvanzati === 0 && attacchiRisolti.length === 0);

console.log("\n[Solo il Master/solitaria pilota i nemici]");
resetStato();
window.UltimateVTTSync = { isMaster: () => false }; // client giocatore
AI._reset();
AI._tick();
check("un client giocatore (non Master) non fa agire i nemici", attacchiRisolti.length === 0 && turniAvanzati === 0);
window.UltimateVTTSync = undefined;

AI.fermaSampler();
console.log("\nRisultato core-enemy-ai: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
