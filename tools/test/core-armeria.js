// Test dell'Armeria (modulo 41): tabelle di rarita', drop scalati sulla forza del nemico (rng
// deterministica), pool per rarita' e registrazione nel catalogo dell'inventario (modulo 05).
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
window.setInterval = function () { return 0; };

// Stub del modulo 05: registra il catalogo ricevuto.
let registrati = null;
window.UltimateVTTInventory = { registerCatalogItems: (items) => { registrati = items; return items.length; } };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/41-armeria-rarita.js");

const A = window.UltimateVTTArmeria;
check("UltimateVTTArmeria esposto", !!A);

console.log("\n[Registrazione nel catalogo dell'inventario]");
check("il catalogo dell'armeria viene registrato nel modulo 05", Array.isArray(registrati) && registrati.length === A.CATALOGO.length);
check("il catalogo contiene armi, armature, amuleti e consumabili", (function () {
  const tipi = {};
  A.CATALOGO.forEach(o => { tipi[o.type] = 1; });
  return tipi.weapon && tipi.armor && tipi.neck && tipi.consumable;
})());
check("ogni oggetto ha una rarita' valida e un'abilita'/proprieta'", A.CATALOGO.every(o => A.RARITA[o.rarity] && (o.ability || o.properties)));
check("tutte e 4 le rarita' sono definite con colore e bonus", ["comune", "rara", "epica", "leggendaria"].every(r => A.RARITA[r] && A.RARITA[r].colore));

console.log("\n[Rarita' scalata sulla forza del nemico (rng deterministica)]");
// Con lo stesso tiro (0.05), un gregario da 25 XP da' una rarita' bassa, un boss da 900 XP una alta.
check("tiro 0.05: nemico debole (25 XP) -> non leggendaria", A.rollRarita(25, () => 0.05) !== "leggendaria");
check("tiro 0.05: boss fortissimo (900 XP) -> epica o leggendaria", (function () {
  const r = A.rollRarita(900, () => 0.05);
  return r === "leggendaria" || r === "epica";
})());
check("tiro alto (0.95) -> comune anche contro un boss", A.rollRarita(900, () => 0.95) === "comune");
check("la probabilita' di drop cresce con la forza del nemico", A.probabilitaDrop(400) > A.probabilitaDrop(25));

console.log("\n[Drop dei nemici: piu' forti = oggetti migliori]");
check("nemico debole con tiro sfortunato -> nessun drop dall'armeria", A.rollDropNemico(25, () => 0.99).length === 0);
check("drop garantito con tiri favorevoli -> almeno 1 oggetto non comune", (function () {
  const seq = [0.01, 0.02, 0.3, 0.99]; let i = 0;
  const out = A.rollDropNemico(100, () => seq[i++ % seq.length]);
  return out.length >= 1 && A.raritaDi(out[0]) !== "comune";
})());
check("un boss (450 XP) puo' lasciare DUE oggetti", (function () {
  const seq = [0.01, 0.01, 0.2, 0.05, 0.01, 0.4]; let i = 0;
  const out = A.rollDropNemico(450, () => seq[i++ % seq.length]);
  return out.length === 2;
})());
check("gli id droppati esistono tutti nel catalogo", (function () {
  const seq = [0.01, 0.02, 0.3, 0.05, 0.01, 0.6]; let i = 0;
  const out = A.rollDropNemico(450, () => seq[i++ % seq.length]);
  return out.every(id => A.CATALOGO.some(o => o.id === id));
})());

console.log("\n[Pool per rarita' e colori]");
check("esistono armi leggendarie nel pool", A.oggettiPerRarita("leggendaria").some(o => o.type === "weapon"));
check("coloreRarita restituisce il colore della tabella", A.coloreRarita("epica") === A.RARITA.epica.colore);
check("raritaDi risolve un id del catalogo", A.raritaDi("l-rovina-goblin") === "leggendaria");
check("raritaDi su id sconosciuto -> null", A.raritaDi("non-esiste") === null);

console.log("\nRisultato core-armeria: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
