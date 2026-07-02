// Test dello spawn nemici (modulo 16): guardia anti-duplicati (a combattimento GIA' attivo lo
// spawn viene ignorato — era la causa delle ondate di goblin duplicati: il Master IA ripeteva il
// campo "spawn" in ogni risposta sullo scontro in corso), annuncio raggruppato ("3× Goblin"),
// avvio del combattimento DOPO l'aggiunta dei nemici e mappatura esplicita token<->combattente.
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

// ---- Stub del combat tracker, dei token e della FSM ----
let combatAttivo = false;
let npcAggiunti = [];
let startChiamati = 0;
let prossimoNpc = 1;
window.UltimateVTTCombat = {
  npcCatalog: [
    { id: "goblin", name: "Goblin", armorClass: 15, hitPoints: 7, initiativeBonus: 2, attackBonus: 4, damageFormula: "1d6+2" },
    { id: "orc", name: "Orco", armorClass: 13, hitPoints: 15, initiativeBonus: 1, attackBonus: 5, damageFormula: "1d12+3" }
  ],
  getState: () => ({ active: combatAttivo }),
  addNpc: (cid) => { const c = { id: "npc-" + (prossimoNpc++), kind: "npc", catalogId: cid }; npcAggiunti.push(c); return c; },
  startCombat: () => { startChiamati++; combatAttivo = true; }
};
let tokenAggiunti = [];
let prossimoToken = 1;
window.UltimateVTTTokenPhysics = {
  getState: () => ({ tokens: [{ id: "token-pc", cellX: 16, cellY: 12 }] }),
  addToken: (name, x, y) => { const t = { id: "token-extra-" + (prossimoToken++), name, cellX: x, cellY: y }; tokenAggiunti.push(t); return t; }
};
let mappature = [];
window.UltimateVTTCombatFSM = { impostaMappaToken: (tok, comb) => { mappature.push([tok, comb]); } };
let messaggi = [];
window.UltimateVTTCoreGameplay = { appendChatMessage: (speaker, testo) => { messaggi.push({ speaker, testo }); } };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/16-enemy-spawn.js");

const S = window.VTTSpawn;
check("VTTSpawn esposto", !!S && typeof S.spawn === "function");

console.log("\n[Spawn a combattimento spento: aggiunge, mappa, avvia e annuncia raggruppato]");
combatAttivo = false;
const esito = S.spawn([{ name: "Goblin", count: 3 }, { name: "Orco", count: 1 }]);
check("crea 4 combattenti (3 goblin + 1 orco)", npcAggiunti.length === 4);
check("crea 4 token corrispondenti", tokenAggiunti.length === 4);
check("registra la mappatura esplicita token<->combattente per OGNI nemico", mappature.length === 4 && mappature.every(m => /^token-extra-/.test(m[0]) && /^npc-/.test(m[1])));
check("avvia il combattimento (startCombat) DOPO aver aggiunto i nemici", startChiamati === 1 && combatAttivo === true);
check("l'annuncio in chat e' raggruppato ('3× Goblin, 1× Orco'), senza nomi ripetuti", (function () {
  const m = messaggi.find(x => /Nemici comparsi/.test(x.testo));
  return m && /3× Goblin/.test(m.testo) && /1× Orco/.test(m.testo) && !/Goblin, Goblin/.test(m.testo);
})());
check("spawn ritorna i nomi dei nemici comparsi", Array.isArray(esito) && esito.length === 4);

console.log("\n[Guardia anti-duplicati: a combattimento GIA' attivo lo spawn viene ignorato]");
const npcPrima = npcAggiunti.length, tokenPrima = tokenAggiunti.length, msgPrima = messaggi.length;
const esitoBloccato = S.spawn([{ name: "Goblin", count: 8 }]); // il Master IA che ripete "spawn" a meta' scontro
check("nessun nuovo combattente aggiunto", npcAggiunti.length === npcPrima);
check("nessun nuovo token aggiunto", tokenAggiunti.length === tokenPrima);
check("nessun nuovo annuncio in chat", messaggi.length === msgPrima);
check("lo spawn bloccato non ritorna nomi", esitoBloccato === undefined);

console.log("\n[A scontro finito, un nuovo spawn torna a funzionare (nuovo combattimento)]");
combatAttivo = false;
S.spawn([{ name: "Orco", count: 2 }]);
check("dopo la fine del combattimento un nuovo spawn aggiunge di nuovo nemici", npcAggiunti.length === npcPrima + 2);
check("e riavvia il combattimento", startChiamati === 2 && combatAttivo === true);

console.log("\nRisultato core-enemy-spawn: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
