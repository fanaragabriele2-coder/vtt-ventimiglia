// Test dell'Encounter Balancer (modulo 37): matematica pura del budget di minaccia e ridimensiona-
// mento della lista di spawn in base al party reale (numero, livello, HP correnti). Verifica il caso
// che ha originato la richiesta ("PG solitario circondato da 10 goblin") e l'anti-TPK dopo scontri
// duri (HP bassi -> nemici più leggeri).
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
carica("js/36-global-game-state.js");
carica("js/37-encounter-balancer.js");

const B = window.UltimateVTTEncounterBalancer;
check("UltimateVTTEncounterBalancer esposto", !!B);

// Bestiario minimale (stesso formato del modulo 06).
const bestiario = [
  { id: "goblin", name: "Goblin", armorClass: 15, hitPoints: 7, initiativeBonus: 2, attackBonus: 4, damageFormula: "1d6+2", challenge: "1/4" },
  { id: "orc", name: "Orco", armorClass: 13, hitPoints: 15, initiativeBonus: 1, attackBonus: 5, damageFormula: "1d12+3", challenge: "1/2" }
];

console.log("\n[Potenza del PG: cresce col livello, cala con gli HP]");
const pgPieno = B.potenzaPg({ level: 3, hpMax: 30, hpCur: 30 });
const pgFerito = B.potenzaPg({ level: 3, hpMax: 30, hpCur: 6 });
check("un PG a piena vita vale più di uno stesso PG quasi morto", pgPieno > pgFerito);
check("un PG di livello alto vale più di uno di livello basso", B.potenzaPg({ level: 6, hpMax: 50, hpCur: 50 }) > B.potenzaPg({ level: 1, hpMax: 10, hpCur: 10 }));

console.log("\n[Potenza del party: somma i vivi, ignora chi è a terra]");
const party3 = [
  { level: 3, hpMax: 30, hpCur: 30 },
  { level: 3, hpMax: 28, hpCur: 28 },
  { level: 3, hpMax: 26, hpCur: 26 }
];
check("un party di 3 vale più di un singolo PG", B.potenzaPartito(party3) > B.potenzaPg(party3[0]));
check("un membro a 0 HP non aggiunge budget", (function () {
  const conMorto = party3.concat([{ level: 3, hpMax: 30, hpCur: 0 }]);
  return B.potenzaPartito(conMorto) === B.potenzaPartito(party3);
})());

console.log("\n[Regola 1: niente PG solitario circondato da 10 goblin]");
const soloDebole = [{ level: 1, hpMax: 10, hpCur: 10 }];
const rich10 = B.bilancia([{ name: "Goblin", count: 10 }], soloDebole, { bestiario: bestiario });
check("i 10 goblin richiesti vengono ridotti drasticamente", rich10.nemiciTotali < 10);
check("contro un PG di lv1 restano pochissimi nemici (<=3)", rich10.nemiciTotali <= 3);
check("almeno 1 nemico compare comunque (niente scontro vuoto)", rich10.nemiciTotali >= 1);
check("il risultato riporta budget e potenza calcolati", typeof rich10.budget === "number" && typeof rich10.potenza === "number");

console.log("\n[Party numeroso e forte: lo scontro NON viene svuotato]");
const partyForte = [
  { level: 5, hpMax: 50, hpCur: 50 }, { level: 5, hpMax: 48, hpCur: 48 },
  { level: 5, hpMax: 46, hpCur: 46 }, { level: 5, hpMax: 44, hpCur: 44 }
];
const richForte = B.bilancia([{ name: "Goblin", count: 6 }], partyForte, { bestiario: bestiario });
check("contro un party forte i 6 goblin restano numerosi", richForte.nemiciTotali >= 5);
check("il tetto scala col numero di PG (fino a ~3 per PG vivo)", richForte.nemiciTotali <= 12);

console.log("\n[Anti-TPK: dopo uno scontro duro (HP bassi) i nemici sono più leggeri]");
const partyPieno = [{ level: 4, hpMax: 40, hpCur: 40 }, { level: 4, hpMax: 38, hpCur: 38 }];
const partyMezzoMorto = [{ level: 4, hpMax: 40, hpCur: 5 }, { level: 4, hpMax: 38, hpCur: 4 }];
const bilPieno = B.bilancia([{ name: "Orco", count: 4 }], partyPieno, { bestiario: bestiario });
const bilFerito = B.bilancia([{ name: "Orco", count: 4 }], partyMezzoMorto, { bestiario: bestiario });
const minaccia = (b) => b.nemiciTotali * b.statScale;
check("a HP bassi la minaccia complessiva schierata è minore che a HP pieni", minaccia(bilFerito) < minaccia(bilPieno));

console.log("\n[Scala delle statistiche: override coerenti per lo spawn]");
const richScala = B.bilancia([{ name: "Goblin", count: 1 }], partyForte, { bestiario: bestiario });
check("con party forte e pochi nemici, i nemici vengono rinforzati (statScale > 1)", richScala.statScale > 1);
check("il rinforzo produce override di HP maggiorati", (function () {
  const g = richScala.lista.find(t => /goblin/i.test(t.name));
  return g && g.overrides && g.overrides.hitPoints > 7; // 7 = HP base del goblin
})());
const richIndebolito = B.bilancia([{ name: "Goblin", count: 3 }], soloDebole, { bestiario: bestiario });
check("con PG debole i nemici sopravvissuti vengono indeboliti (statScale < 1) o ridotti al minimo", richIndebolito.statScale <= 1);

console.log("\n[Pubblicazione sul Global Game State (fonte unica)]");
window.partyData = [
  { identity: { id: "p1", level: 2 }, resources: { hp: { max: 20, current: 20 } } },
  { identity: { id: "p2", level: 2 }, resources: { hp: { max: 18, current: 18 } } }
];
window.UltimateVTTCombat = { npcCatalog: bestiario };
let eventoRicevuto = null;
window.UltimateVTTGameState.subscribe("encounter:balanced", (payload) => { eventoRicevuto = payload; });
const perGioco = B.bilanciaPerGioco([{ name: "Goblin", count: 8 }]);
check("bilanciaPerGioco legge il party reale (window.partyData) e restituisce una lista", Array.isArray(perGioco.lista) && perGioco.lista.length >= 1);
check("il risultato è pubblicato sul Global Game State (encounter.last)", window.UltimateVTTGameState.get("encounter.last") === perGioco);
check("gli ascoltatori dell'evento 'encounter:balanced' vengono notificati", eventoRicevuto === perGioco);
window.partyData = undefined;

console.log("\nRisultato core-encounter-balancer: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
