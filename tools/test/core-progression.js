// Test del modulo 15 (XP & loot) sopra il modulo 04 REALE: assegnazione XP, salto di piu'
// livelli in un colpo solo (il caso piu' a rischio di bug), guadagno HP/competenza al level-up,
// completeQuest con XP di default. Richiede un mini-DOM (il modulo costruisce la barra XP nel DOM
// all'avvio): si usa un registro piatto di elementi finti, sufficiente per le query usate dal modulo.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Mini-DOM: registro piatto di elementi finti, sufficiente per createElement/getElementById/
// querySelector/appendChild usati dal modulo (niente vero layout, solo le API che il codice chiama).
const registro = [];
function nuovoElemento(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(), id: "", className: "", innerHTML: "", textContent: "",
    style: {}, children: [], listeners: {},
    appendChild(figlio) { this.children.push(figlio); figlio.parentNode = this; return figlio; },
    addEventListener(tipo, fn) { (this.listeners[tipo] = this.listeners[tipo] || []).push(fn); },
    querySelector(sel) { return cercaIn(this, sel); },
    setAttribute() {}
  };
  registro.push(el);
  return el;
}
function corrisponde(el, sel) {
  if (sel[0] === "#") { return el.id === sel.slice(1); }
  if (sel[0] === ".") { return (" " + el.className + " ").indexOf(" " + sel.slice(1) + " ") !== -1; }
  return el.tagName === sel.toUpperCase();
}
function cercaIn(radice, sel) {
  // Ricerca semplificata: nel registro piatto (copre i casi usati dal modulo, non e' un vero CSS engine).
  for (let i = 0; i < registro.length; i++) { if (corrisponde(registro[i], sel)) { return registro[i]; } }
  return null;
}

const corpo = nuovoElemento("body");
const testa = nuovoElemento("head");
global.window = global;
global.document = {
  readyState: "complete",
  addEventListener() {},
  createElement: nuovoElemento,
  getElementById(id) { return cercaIn(null, "#" + id); },
  querySelector(sel) { return cercaIn(null, sel); },
  head: testa, body: corpo
};
global.MutationObserver = function () { this.observe = () => {}; };
global.localStorage = (function () { var s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; })();
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };
window.UltimateVTTInventory = { itemCatalog: [], addInventoryItem() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/04-3-state-manager-pg-statistiche.js");
carica("js/15-xp-loot-system.js");

const S = window.UltimateVTTState;
const P = window.VTTProgression;
check("VTTProgression esposto (avvio senza eccezioni)", !!P);

console.log("\n[Guadagno XP entro un livello]");
S.hydrate(S.serialize()); // riparte da uno stato pulito
let prog = P.getProg(S.getState().identity.id);
check("livello iniziale = 1", prog.level === 1);
P.gainXp(100, "test");
prog = P.getProg(S.getState().identity.id);
check("l'XP guadagnata si accumula (100)", prog.xp === 100);
check("100 XP non bastano per salire di livello (soglia 300)", prog.level === 1);

console.log("\n[Salto di piu' livelli in un colpo solo — caso a rischio]");
const hpMaxPrima = S.getState().resources.hp.max;
const profPrima = S.getState().proficiencyBonus;
// 6500 XP supera DIRETTAMENTE le soglie dei livelli 2,3,4,5 (arrivando esattamente al livello 5).
P.gainXp(6500 - 100, "balzo di livello");
prog = P.getProg(S.getState().identity.id);
check("il personaggio arriva al livello corretto (5), non si ferma al primo superato", prog.level === 5);
check("il bonus di competenza riflette il livello finale (5 -> +3)", S.getState().proficiencyBonus === 3);
check("gli HP massimi sono aumentati (somma del guadagno di OGNI livello attraversato)", S.getState().resources.hp.max > hpMaxPrima);
check("dopo il level-up gli HP correnti sono al massimo (cura implicita)", S.getState().resources.hp.current === S.getState().resources.hp.max);

console.log("\n[completeQuest]");
const xpPrima = P.getProg(S.getState().identity.id).xp;
P.completeQuest("Prova senza importo esplicito");
check("completeQuest senza importo assegna 100 XP di default", P.getProg(S.getState().identity.id).xp === xpPrima + 100);

console.log("\n[getProg per personaggi non attivi]");
const progAltro = P.getProg("npc-mai-visto-prima");
check("getProg per un id sconosciuto non lancia e parte da livello 1", progAltro.level === 1 && progAltro.xp === 0);

console.log("\nRisultato core-progression: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
