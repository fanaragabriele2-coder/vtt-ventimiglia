// Test del modulo 06 (combat tracker) sopra il modulo 04 REALE: tiro d20 con vantaggio/svantaggio,
// parsing formule di danno, raddoppio dei dadi (non del bonus fisso) sui critici, applicazione
// danno/cura ai combattenti (PG instradato sullo state manager, PNG con HP locali clampati).
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

global.window = global;
global.document = {
  readyState: "complete", addEventListener() {}, getElementById() { return null; },
  querySelector() { return null; }, querySelectorAll() { return []; }
};
global.localStorage = (function () { var s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; })();
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/04-3-state-manager-pg-statistiche.js");
carica("js/06-patch-due-fasi-colpire-danni.js");

const S = window.UltimateVTTState;
const C = window.UltimateVTTCombat;
check("UltimateVTTCombat esposto", !!C);

// Math.random deterministico per i test sui dadi: una coda di valori predefiniti.
const originale = Math.random;
function conSequenza(valori, fn) {
  let i = 0;
  Math.random = () => valori[i++ % valori.length];
  try { return fn(); } finally { Math.random = originale; }
}

console.log("\n[Tiro d20: normale, vantaggio, svantaggio]");
// Math.random()=0.5 -> floor(0.5*20)+1 = 11; 0.9 -> 19; 0.0 -> 1.
check("normale: un solo tiro", conSequenza([0.5, 0.99], () => C.rollD20WithMode("normal").rolls.length) === 1);
check("vantaggio: prende il piu' alto dei due (11 vs 19 -> 19)", conSequenza([0.5, 0.9], () => C.rollD20WithMode("advantage").chosen) === 19);
check("svantaggio: prende il piu' basso dei due (11 vs 19 -> 11)", conSequenza([0.5, 0.9], () => C.rollD20WithMode("disadvantage").chosen) === 11);
check("1 naturale rilevato correttamente", conSequenza([0, 0], () => C.rollD20WithMode("normal").naturalOne) === true);
check("20 naturale rilevato correttamente", conSequenza([0.999, 0.999], () => C.rollD20WithMode("normal").naturalTwenty) === true);

console.log("\n[Parsing formula di danno]");
check("'2d6+3' -> due termini (dadi + fisso)", C.parseDamageFormula("2d6+3").length === 2);
check("'2d6+3': termine dadi corretto (segno+, 2 dadi, 6 facce)", (function () {
  const t = C.parseDamageFormula("2d6+3")[0];
  return t.type === "dice" && t.sign === 1 && t.count === 2 && t.sides === 6;
})());
check("'1d8-1': il modificatore fisso e' negativo", (function () {
  const t = C.parseDamageFormula("1d8-1").find(x => x.type === "flat");
  return t && t.value === -1;
})());
check("formula vuota/non valida ricade su 1d4", (function () {
  const t = C.parseDamageFormula("???")[0];
  return t.type === "dice" && t.count === 1 && t.sides === 4;
})());
check("formula solo fissa '5' produce un termine flat", (function () {
  const terms = C.parseDamageFormula("5");
  return terms.length === 1 && terms[0].type === "flat" && terms[0].value === 5;
})());

console.log("\n[Tiro danno e raddoppio sui critici]");
// Con Math.random()=0 ogni dado vale 1 (floor(0*sides)+1=1). 2d6+3 normale = 2*1+3 = 5.
check("2d6+3 normale = somma dadi(2) + fisso(3) = 5", conSequenza([0], () => C.rollDamageFormula("2d6+3", false).total) === 5);
// Sul critico SOLO i dadi raddoppiano (4 dadi invece di 2), il fisso resta uguale: 4*1+3 = 7.
check("2d6+3 critico raddoppia SOLO i dadi (4*1+3=7, non il fisso)", conSequenza([0], () => C.rollDamageFormula("2d6+3", true).total) === 7);
check("il totale del danno non e' mai negativo (clamp a 0)", conSequenza([0], () => {
  // Formula tutta negativa: i dadi sottratti possono portare il totale sotto zero.
  return C.rollDamageFormula("-3d6", false).total;
}) === 0);

console.log("\n[Applicazione danno/cura ai combattenti]");
const stato = C.getState();
const pcId = stato.combatants.find(c => c.kind === "pc").id;
const npcId = stato.combatants.find(c => c.kind === "npc").id;

S.setMaxHp(20); S.setCurrentHp(20);
check("danno al PG instrada su UltimateVTTState (HP scalati li')", (function () {
  C.applyDamageToCombatant(pcId, 6);
  return S.getState().resources.hp.current === 14;
})());

const npcHpIniziali = C.getState().combatants.find(c => c.id === npcId).hitPoints;
C.applyDamageToCombatant(npcId, 999);
const npcDopo = C.getState().combatants.find(c => c.id === npcId);
check("danno eccessivo a un PNG clampa gli HP a 0 (non negativi)", npcDopo.hitPoints === 0);
check("un PNG a 0 HP risulta sconfitto (defeated:true)", npcDopo.defeated === true);

C.healCombatant(npcId, 999);
const npcCurato = C.getState().combatants.find(c => c.id === npcId);
check("la cura di un PNG non supera i suoi HP massimi", npcCurato.hitPoints === npcCurato.maxHitPoints);
check("applyDamageToCombatant su un id inesistente ritorna false (non lancia)", C.applyDamageToCombatant("non-esiste", 5) === false);

console.log("\nRisultato core-combat: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
