// Test degli attacchi di opportunita' / reazioni (modulo 24): la logica decisionale pura
// (attacchiOpportunita) e la risoluzione runtime (applica danno, consuma la reazione) con le
// primitive del combattimento stubbate.
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
carica("js/24-bg3-reactions.js");

const R = window.UltimateVTTReactions;
R.fermaSampler(); // niente polling automatico durante il test
check("UltimateVTTReactions esposto", !!R);

// Combattenti di riferimento (1 PG, 2 nemici).
const combattenti = [
  { id: "pc-local", kind: "pc", defeated: false },
  { id: "npc-1", kind: "npc", defeated: false },
  { id: "npc-2", kind: "npc", defeated: false }
];
const sempreDisponibile = () => true;

console.log("\n[Logica pura: quando scatta l'attacco di opportunita']");
// PG in (5,5) con nemico adiacente in (5,6); il PG fugge in (5,8): il nemico reagisce.
let r = R.attacchiOpportunita({
  moverId: "pc-local", partenza: { cellX: 5, cellY: 5 }, arrivo: { cellX: 5, cellY: 8 },
  combattenti: combattenti, posizioni: { "npc-1": { cellX: 5, cellY: 6 }, "npc-2": { cellX: 1, cellY: 1 } },
  reazioneDisponibile: sempreDisponibile
});
check("nemico adiacente alla partenza e lontano dall'arrivo -> reagisce", r.length === 1 && r[0] === "npc-1");
check("nemico lontano (mai in portata) -> non reagisce", r.indexOf("npc-2") === -1);

// Il PG resta in portata (si sposta in una cella ancora adiacente): nessun attacco di opportunita'.
r = R.attacchiOpportunita({
  moverId: "pc-local", partenza: { cellX: 5, cellY: 5 }, arrivo: { cellX: 6, cellY: 6 },
  combattenti: combattenti, posizioni: { "npc-1": { cellX: 5, cellY: 6 } },
  reazioneDisponibile: sempreDisponibile
});
check("se resta in portata (cella ancora adiacente) -> nessuna reazione", r.length === 0);

// Movimento nullo (stessa cella) -> niente.
r = R.attacchiOpportunita({
  moverId: "pc-local", partenza: { cellX: 5, cellY: 5 }, arrivo: { cellX: 5, cellY: 5 },
  combattenti: combattenti, posizioni: { "npc-1": { cellX: 5, cellY: 6 } }, reazioneDisponibile: sempreDisponibile
});
check("movimento nullo -> nessuna reazione", r.length === 0);

// Stessa fazione: un PG che si allontana da un altro PG non provoca attacchi.
r = R.attacchiOpportunita({
  moverId: "pc-local", partenza: { cellX: 5, cellY: 5 }, arrivo: { cellX: 5, cellY: 8 },
  combattenti: [{ id: "pc-local", kind: "pc", defeated: false }, { id: "pc-2", kind: "pc", defeated: false }],
  posizioni: { "pc-2": { cellX: 5, cellY: 6 } }, reazioneDisponibile: sempreDisponibile
});
check("stessa fazione -> nessun attacco di opportunita'", r.length === 0);

// Nemico senza reazione disponibile -> non reagisce.
r = R.attacchiOpportunita({
  moverId: "pc-local", partenza: { cellX: 5, cellY: 5 }, arrivo: { cellX: 5, cellY: 8 },
  combattenti: combattenti, posizioni: { "npc-1": { cellX: 5, cellY: 6 } },
  reazioneDisponibile: () => false
});
check("nemico senza reazione disponibile -> non reagisce", r.length === 0);

// Nemico sconfitto -> non reagisce.
r = R.attacchiOpportunita({
  moverId: "pc-local", partenza: { cellX: 5, cellY: 5 }, arrivo: { cellX: 5, cellY: 8 },
  combattenti: [{ id: "pc-local", kind: "pc", defeated: false }, { id: "npc-1", kind: "npc", defeated: true }],
  posizioni: { "npc-1": { cellX: 5, cellY: 6 } }, reazioneDisponibile: sempreDisponibile
});
check("nemico sconfitto -> non reagisce", r.length === 0);

// Due nemici entrambi adiacenti e poi lontani -> entrambi reagiscono.
r = R.attacchiOpportunita({
  moverId: "pc-local", partenza: { cellX: 5, cellY: 5 }, arrivo: { cellX: 5, cellY: 9 },
  combattenti: combattenti, posizioni: { "npc-1": { cellX: 5, cellY: 6 }, "npc-2": { cellX: 6, cellY: 5 } },
  reazioneDisponibile: sempreDisponibile
});
check("due nemici minaccianti -> entrambi reagiscono", r.length === 2);

console.log("\n[Geometria portata]");
check("celle adiacenti in diagonale sono in portata", R.inPortata({ cellX: 1, cellY: 1 }, { cellX: 2, cellY: 2 }) === true);
check("celle a distanza 2 NON sono in portata", R.inPortata({ cellX: 1, cellY: 1 }, { cellX: 3, cellY: 1 }) === false);

console.log("\n[Runtime: risoluzione, danno e consumo della reazione]");
// Stub delle primitive del combattimento. Tiro deterministico alto -> colpo garantito.
let dannoApplicato = [];
let combatState = {
  active: true, round: 1,
  combatants: [
    { id: "pc-local", kind: "pc", name: "Eroe", armorClass: 14, attackBonus: 5, damageFormula: "1d8+3", hitPoints: 20, maxHitPoints: 20, defeated: false },
    { id: "npc-1", kind: "npc", name: "Goblin", armorClass: 13, attackBonus: 5, damageFormula: "1d6+2", hitPoints: 7, maxHitPoints: 7, defeated: false }
  ]
};
window.UltimateVTTCombat = {
  getState: () => JSON.parse(JSON.stringify(combatState)),
  rollD20WithMode: () => ({ chosen: 15, rolls: [15], naturalOne: false, naturalTwenty: false }),
  rollDamageFormula: () => ({ total: 6 }),
  applyDamageToCombatant: (id, amount) => { dannoApplicato.push({ id, amount }); return true; }
};
// Token: PG e nemico adiacenti (nemico in 5,6).
window.UltimateVTTTokenPhysics = {
  getState: () => ({ dragTokenId: null, tokens: [
    { id: "token-pc", cellX: 5, cellY: 5 }, { id: "token-npc-1", cellX: 5, cellY: 6 }
  ] })
};
// Reazione del PG via action economy (modulo 05): qui non serve, il reattore e' un PNG.
let reactionSpesa = 0;
window.UltimateVTTInventory = { getState: () => ({ actionEconomy: { reaction: true } }), spendActionResource: () => { reactionSpesa++; } };

// Il PG fugge da (5,5) a (5,8): il Goblin in (5,6) effettua un attacco di opportunita'.
R._valutaMovimento("token-pc", { cellX: 5, cellY: 5 }, { cellX: 5, cellY: 8 });
check("l'attacco di opportunita' del PNG applica danno al PG in fuga", dannoApplicato.length === 1 && dannoApplicato[0].id === "pc-local" && dannoApplicato[0].amount === 6);
check("dopo aver reagito, la reazione del PNG e' consumata", R.reazioneDisponibile("npc-1") === false);

// Un secondo movimento non deve far reagire di nuovo lo stesso PNG (reazione gia' spesa).
dannoApplicato = [];
R._valutaMovimento("token-pc", { cellX: 5, cellY: 5 }, { cellX: 5, cellY: 8 });
check("il PNG non reagisce due volte nello stesso round", dannoApplicato.length === 0);

// Caso inverso: il nemico fugge e il PG (reazione disponibile) reagisce consumandola dal modulo 05.
dannoApplicato = [];
window.UltimateVTTTokenPhysics = {
  getState: () => ({ dragTokenId: null, tokens: [
    { id: "token-pc", cellX: 5, cellY: 5 }, { id: "token-npc-1", cellX: 5, cellY: 6 }
  ] })
};
R._valutaMovimento("token-npc-1", { cellX: 5, cellY: 6 }, { cellX: 9, cellY: 6 });
check("il PG reagisce alla fuga del nemico (danno applicato al PNG)", dannoApplicato.length === 1 && dannoApplicato[0].id === "npc-1");
check("la reazione del PG e' consumata via action economy (modulo 05)", reactionSpesa === 1);

R.fermaSampler();
console.log("\nRisultato core-bg3-reactions: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
