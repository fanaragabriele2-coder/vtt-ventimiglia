// Test del fiancheggiamento (modulo 25): geometria pura (direzione, lati/angoli opposti),
// ricerca dell'alleato fiancheggiante, regola di sovrapposizione 5e con vantaggio/svantaggio,
// e lettura dello stato live (combattimento + posizioni token).
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

global.window = global;
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/25-bg3-flanking.js");

const F = window.UltimateVTTFlanking;
check("UltimateVTTFlanking esposto", !!F);

console.log("\n[Direzione tra celle adiacenti]");
check("direzione verso est (dx:1,dy:0)", (function () { const d = F.direzioneVerso({ cellX: 5, cellY: 5 }, { cellX: 6, cellY: 5 }); return d.dx === 1 && d.dy === 0; })());
check("direzione verso nord-ovest (dx:-1,dy:-1)", (function () { const d = F.direzioneVerso({ cellX: 5, cellY: 5 }, { cellX: 4, cellY: 4 }); return d.dx === -1 && d.dy === -1; })());
check("celle non adiacenti (distanza 2) -> direzione nulla", F.direzioneVerso({ cellX: 5, cellY: 5 }, { cellX: 7, cellY: 5 }) === null);
check("stessa cella -> direzione nulla", F.direzioneVerso({ cellX: 5, cellY: 5 }, { cellX: 5, cellY: 5 }) === null);

console.log("\n[Fiancheggiamento: lati e angoli opposti]");
const bersaglio = { cellX: 5, cellY: 5 };
check("lati opposti (est/ovest) fiancheggiano", F.staFiancheggiando(bersaglio, { cellX: 6, cellY: 5 }, { cellX: 4, cellY: 5 }) === true);
check("lati opposti (nord/sud) fiancheggiano", F.staFiancheggiando(bersaglio, { cellX: 5, cellY: 4 }, { cellX: 5, cellY: 6 }) === true);
check("angoli opposti (NE/SO) fiancheggiano", F.staFiancheggiando(bersaglio, { cellX: 6, cellY: 4 }, { cellX: 4, cellY: 6 }) === true);
check("stesso lato NON fiancheggia (entrambi a est)", F.staFiancheggiando(bersaglio, { cellX: 6, cellY: 5 }, { cellX: 6, cellY: 4 }) === false);
check("lati adiacenti ma non opposti (est + nord) NON fiancheggiano", F.staFiancheggiando(bersaglio, { cellX: 6, cellY: 5 }, { cellX: 5, cellY: 4 }) === false);
check("una delle due celle non adiacente -> non fiancheggia", F.staFiancheggiando(bersaglio, { cellX: 6, cellY: 5 }, { cellX: 2, cellY: 5 }) === false);

console.log("\n[Ricerca dell'alleato fiancheggiante]");
const combattenti = [
  { id: "pc-1", kind: "pc", defeated: false },
  { id: "pc-2", kind: "pc", defeated: false },
  { id: "npc-1", kind: "npc", defeated: false }
];
let posizioni = {
  "npc-1": { cellX: 5, cellY: 5 },
  "pc-1": { cellX: 6, cellY: 5 },  // est del bersaglio
  "pc-2": { cellX: 4, cellY: 5 }   // ovest del bersaglio: lato opposto a pc-1
};
check("pc-1 e pc-2 su lati opposti -> pc-2 e' l'alleato fiancheggiante di pc-1",
  F.trovaAlleatoFiancheggiante({ attaccanteId: "pc-1", bersaglioId: "npc-1", combattenti, posizioni }) === "pc-2");
check("simmetrico: pc-1 e' l'alleato fiancheggiante di pc-2", F.trovaAlleatoFiancheggiante({ attaccanteId: "pc-2", bersaglioId: "npc-1", combattenti, posizioni }) === "pc-1");

const posizioni2 = Object.assign({}, posizioni, { "pc-2": { cellX: 6, cellY: 4 } }); // stesso lato/vicino, non opposto
check("alleato NON su lato opposto -> nessun fiancheggiamento", F.trovaAlleatoFiancheggiante({ attaccanteId: "pc-1", bersaglioId: "npc-1", combattenti, posizioni: posizioni2 }) === null);

const posizioniLontano = { "npc-1": { cellX: 5, cellY: 5 }, "pc-1": { cellX: 6, cellY: 5 }, "pc-2": { cellX: 0, cellY: 0 } };
check("alleato troppo lontano dal bersaglio -> nessun fiancheggiamento", F.trovaAlleatoFiancheggiante({ attaccanteId: "pc-1", bersaglioId: "npc-1", combattenti, posizioni: posizioniLontano }) === null);

const combSconfitto = [{ id: "pc-1", kind: "pc", defeated: false }, { id: "pc-2", kind: "pc", defeated: true }, { id: "npc-1", kind: "npc", defeated: false }];
check("alleato sconfitto non conta come fiancheggiante", F.trovaAlleatoFiancheggiante({ attaccanteId: "pc-1", bersaglioId: "npc-1", combattenti: combSconfitto, posizioni }) === null);

const combNemicoOpposto = [{ id: "pc-1", kind: "pc", defeated: false }, { id: "npc-2", kind: "npc", defeated: false }, { id: "npc-1", kind: "npc", defeated: false }];
check("un nemico del bersaglio (non alleato dell'attaccante) non conta", F.trovaAlleatoFiancheggiante({ attaccanteId: "pc-1", bersaglioId: "npc-1", combattenti: combNemicoOpposto, posizioni: Object.assign({}, posizioni, { "npc-2": posizioni["pc-2"] }) }) === null);

check("l'attaccante deve essere adiacente al bersaglio (mischia)", F.trovaAlleatoFiancheggiante({
  attaccanteId: "pc-1", bersaglioId: "npc-1", combattenti,
  posizioni: Object.assign({}, posizioni, { "pc-1": { cellX: 0, cellY: 0 } })
}) === null);

console.log("\n[Regola di sovrapposizione 5e]");
check("fiancheggiamento + normale -> vantaggio", F.modalitaEffettiva("normal", true) === "advantage");
check("fiancheggiamento + gia' vantaggio -> resta vantaggio", F.modalitaEffettiva("advantage", true) === "advantage");
check("fiancheggiamento + svantaggio -> si annullano, torna normale", F.modalitaEffettiva("disadvantage", true) === "normal");
check("nessun fiancheggiamento -> modalita' scelta invariata (normale)", F.modalitaEffettiva("normal", false) === "normal");
check("nessun fiancheggiamento -> modalita' scelta invariata (svantaggio)", F.modalitaEffettiva("disadvantage", false) === "disadvantage");

console.log("\n[Lettura dello stato live: valutaFiancheggiamento]");
window.UltimateVTTCombat = { getState: () => ({ combatants: combattenti }) };
window.UltimateVTTTokenPhysics = { getState: () => ({ tokens: [
  { id: "token-pc", cellX: 6, cellY: 5 },       // pc-1
  { id: "token-npc-a", cellX: 4, cellY: 5 },     // mappato manualmente a pc-2 sotto
  { id: "token-npc-1", cellX: 5, cellY: 5 }      // npc-1
] }) };
window.UltimateVTTCombatFSM = {
  tokenACombattente: (t) => t === "token-pc" ? "pc-1" : t === "token-npc-a" ? "pc-2" : t === "token-npc-1" ? "npc-1" : null,
  combattenteAToken: (c) => c === "pc-1" ? "token-pc" : c === "pc-2" ? "token-npc-a" : c === "npc-1" ? "token-npc-1" : null
};
const esito = F.valutaFiancheggiamento("pc-1", "npc-1");
check("valutaFiancheggiamento legge lo stato live e rileva il fiancheggiamento", esito.fiancheggiato === true && esito.alleatoId === "pc-2");

window.UltimateVTTCombat = { getState: () => ({ combatants: [{ id: "pc-1", kind: "pc", defeated: false }, { id: "npc-1", kind: "npc", defeated: false }] }) };
const esitoNessuno = F.valutaFiancheggiamento("pc-1", "npc-1");
check("valutaFiancheggiamento senza alleati -> fiancheggiato:false", esitoNessuno.fiancheggiato === false && esitoNessuno.alleatoId === null);

console.log("\nRisultato core-bg3-flanking: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
