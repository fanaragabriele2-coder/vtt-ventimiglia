// Test dell'arena tattica (modulo 40): generazione PURA di ostacoli e zona sopraelevata (con rng
// deterministica), temi per luogo, e validazione del movimento col click (budget, ostacoli, costi).
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

global.window = global;
global.document = { readyState: "complete", addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, createElement() { return { style: {}, classList: { add() {}, toggle() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} }; }, body: { appendChild() {} } };
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };
window.setInterval = function () { return 0; };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/40-arena-tattica.js");

const A = window.UltimateVTTArena;
A.fermaSampler();
check("UltimateVTTArena esposto", !!A);

// rng deterministica: sequenza ciclica
function rngSeq(valori) { let i = 0; return () => valori[i++ % valori.length]; }

console.log("\n[Generazione arena: ostacoli e altura, senza murare i token]");
const occupate = [{ cellX: 16, cellY: 12 }, { cellX: 21, cellY: 12 }];
const arena = A.generaArena({
  centroX: 16, centroY: 12, colonne: 32, righe: 24,
  occupate: occupate, ostacoli: 8, raggioArena: 8,
  rng: rngSeq([0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4, 0.6, 0.15, 0.85, 0.35])
});
check("genera un numero ragionevole di ostacoli (>=4)", arena.ostacoli.length >= 4);
check("nessun ostacolo entro 2 celle dai token (nessuno murato)", arena.ostacoli.every(o =>
  occupate.every(c => Math.max(Math.abs(c.cellX - o.x), Math.abs(c.cellY - o.y)) > 2)));
check("nessun ostacolo sul bordo estremo della griglia", arena.ostacoli.every(o => o.x >= 1 && o.y >= 1 && o.x < 31 && o.y < 23));
check("esiste una zona sopraelevata con raggio e livello", !!arena.sopraelevata && arena.sopraelevata.raggio >= 1 && arena.sopraelevata.livello >= 1);
check("nessun ostacolo duplicato sulla stessa cella", (function () {
  const visti = {};
  return arena.ostacoli.every(o => { const k = o.x + "," + o.y; if (visti[k]) return false; visti[k] = 1; return true; });
})());

console.log("\n[Temi per luogo (data-driven)]");
check("Teatro Romano -> tema dungeon con colonne", A.temaPerLuogo("Teatro Romano").terreno === "dungeon");
check("Giardini Hanbury -> tema foresta", A.temaPerLuogo("Giardini Hanbury").terreno === "forest");
check("luogo sconosciuto -> tema di default", A.temaPerLuogo("Posto Inventato").terreno === "dungeon");

console.log("\n[Movimento col click: budget, ostacoli, costi]");
const nessunBlocco = () => false;
const okVicino = A.esitoMovimento({ cellX: 5, cellY: 5 }, { cellX: 8, cellY: 5 }, 9, 1.5, nessunBlocco);
check("3 celle con 9 m residui -> ok, costo 4.5 m", okVicino.ok === true && Math.abs(okVicino.costoMetri - 4.5) < 0.01);
const diagonale = A.esitoMovimento({ cellX: 5, cellY: 5 }, { cellX: 8, cellY: 8 }, 9, 1.5, nessunBlocco);
check("la diagonale usa Chebyshev (3 celle, non 6)", diagonale.ok === true && Math.abs(diagonale.costoMetri - 4.5) < 0.01);
const lontano = A.esitoMovimento({ cellX: 5, cellY: 5 }, { cellX: 20, cellY: 5 }, 9, 1.5, nessunBlocco);
check("15 celle con 9 m residui -> rifiutato ('troppo lontano')", lontano.ok === false && /troppo lontano/.test(lontano.motivo));
const bloccato = A.esitoMovimento({ cellX: 5, cellY: 5 }, { cellX: 6, cellY: 5 }, 9, 1.5, () => true);
check("cella con ostacolo -> rifiutata", bloccato.ok === false && /bloccata/.test(bloccato.motivo));
const fermo = A.esitoMovimento({ cellX: 5, cellY: 5 }, { cellX: 5, cellY: 5 }, 9, 1.5, nessunBlocco);
check("stessa cella -> rifiutato ('sei già lì')", fermo.ok === false);
const senzaBudget = A.esitoMovimento({ cellX: 5, cellY: 5 }, { cellX: 7, cellY: 5 }, Infinity, 1.5, nessunBlocco);
check("senza budget noto (Infinity) il movimento non viene limitato", senzaBudget.ok === true);

console.log("\nRisultato core-arena-tattica: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
