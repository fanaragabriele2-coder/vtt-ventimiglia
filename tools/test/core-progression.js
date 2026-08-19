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
    // querySelector su un ELEMENTO (non su document): usato dal modulo per trovare bottoni dentro un
    // popup costruito via innerHTML (una stringa in questo mock, mai davvero fatta a pezzi in nodi
    // figli) — un miss qui e' quindi normale, non un segnale di markup mancante: si ritorna un
    // elemento fittizio invece di null per non far esplodere addEventListener sui bottoni del popup.
    querySelector(sel) { return cercaIn(this, sel) || nuovoElemento("div"); },
    setAttribute() {}
  };
  el.classList = {
    add(c) { if ((" " + el.className + " ").indexOf(" " + c + " ") === -1) { el.className = (el.className + " " + c).trim(); } },
    remove(c) { el.className = el.className.split(/\s+/).filter(function (x) { return x && x !== c; }).join(" "); },
    contains(c) { return (" " + el.className + " ").indexOf(" " + c + " ") !== -1; }
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

console.log("\n[Logica pura: attaccanteDelBersaglio — estrae chi ha sferrato il colpo da lastRoll.title]");
check("estrae l'attaccante quando il titolo termina con ' vs NomeBersaglio'",
  P.attaccanteDelBersaglio({ title: "Aria vs Goblin" }, "Goblin") === "Aria");
check("nomi con spazi nell'attaccante funzionano (si taglia solo il suffisso noto)",
  P.attaccanteDelBersaglio({ title: "Ligeia la Ladra vs Scheletro 2" }, "Scheletro 2") === "Ligeia la Ladra");
check("bersaglio diverso da quello nel titolo -> null (nessuna attribuzione errata)",
  P.attaccanteDelBersaglio({ title: "Aria vs Goblin" }, "Scheletro") === null);
check("lastRoll assente o senza title -> null, non lancia", P.attaccanteDelBersaglio(null, "Goblin") === null && P.attaccanteDelBersaglio({}, "Goblin") === null);
check("titolo che e' SOLO il suffisso (nessun nome attaccante) -> null", P.attaccanteDelBersaglio({ title: " vs Goblin" }, "Goblin") === null);

console.log("\n[Logica pura: trovaMembroPerNome — risolve il NOME nel roster hotseat, non nel tracker di combattimento]");
// Il tracker di combattimento (js/06) ha un solo slot PG con id fisso "pc-local": usarlo come chiave
// di progressione sarebbe un id fantasma su cui nessuna scheda/barra XP e' mai mostrata. Per questo
// la risoluzione avviene su window.partyData (roster hotseat), l'unico posto dove nome e id-di-
// progressione reale (es. "player-2") coesistono.
window.partyData = [
  { identity: { id: "player-1", name: "Aria" } },
  { identity: { id: "player-2", name: "Ligeia" } }
];
check("trova il vero id di progressione per nome esatto", P.trovaMembroPerNome("Aria") === "player-1");
check("nome non presente nel roster -> null", P.trovaMembroPerNome("Fantasma") === null);
check("nome assente/vuoto -> null, non lancia", P.trovaMembroPerNome(null) === null && P.trovaMembroPerNome("") === null);
window.partyData = undefined;
check("senza window.partyData (fuori hotseat) -> null, non lancia", P.trovaMembroPerNome("Aria") === null);

console.log("\n[Attribuzione dell'uccisione al vero autore del colpo, non a chi e' attivo in hotseat]");
S.hydrate(S.serialize());
const idAttivoOra = S.getState().identity.id;
window.partyData = [
  S.getState(), // il PG attivo ora (es. mostrato in hotseat mentre un ALTRO membro ha appena ucciso)
  { identity: { id: "player-2", name: "Ligeia", level: 1 }, resources: { hp: { max: 10, current: 10 } } }
];
const progAttivoPrima = P.getProg(idAttivoOra).xp;
const progUccisorePrima = P.getProg("player-2").xp;
P._onEnemyDefeated({ name: "Goblin", maxHitPoints: 7 }, "player-2"); // killerId esplicito: il modulo 15 lo userebbe se lo ricava da lastRoll.title
check("l'XP va al vero uccisore (player-2), non a chi e' attivo ora", P.getProg("player-2").xp === progUccisorePrima + 50);
check("il PG attualmente attivo NON riceve XP per un'uccisione non sua", P.getProg(idAttivoOra).xp === progAttivoPrima);

console.log("\n[Senza un killerId risolvibile, ricade sul comportamento precedente (chi e' attivo ora)]");
const progAttivoPrima2 = P.getProg(idAttivoOra).xp;
P._onEnemyDefeated({ name: "Scheletro", maxHitPoints: 13 }); // nessun killerId (es. lastRoll.title non risolvibile)
check("senza killerId, l'XP va a chi e' attivo ora (comportamento di fallback preesistente)", P.getProg(idAttivoOra).xp === progAttivoPrima2 + 50);

console.log("\n[Integrazione reale end-to-end: _pollCombat rileva l'uccisione e attribuisce l'XP al vero uccisore]");
S.hydrate(S.serialize());
window.partyData = [S.getState(), { identity: { id: "player-2", name: "Ligeia", level: 1 }, resources: { hp: { max: 10, current: 10 } } }];
// Il tracker di combattimento (mock minimale, solo cio' che pollCombat legge): il colpo e' stato
// sferrato da "Ligeia" (lastRoll.title), ma chi e' ATTIVO ORA nel roster/scheda e' un altro membro.
let goblinVivo = { id: "pc-local", kind: "pc", name: "Ligeia", hitPoints: 10, defeated: false };
let bersaglioNpc = { id: "npc-1", kind: "npc", name: "Goblin", hitPoints: 7, defeated: false };
window.UltimateVTTCombat = { getState: () => ({ combatants: [goblinVivo, bersaglioNpc], lastRoll: { title: "", detail: "" } }) };
P._pollCombat(); // primo giro con il Goblin ancora vivo: inizializza deadSet, nessuna XP
const progLigeiaPrimaPoll = P.getProg("player-2").xp;
const progAttivoPrimaPoll = P.getProg(idAttivoOra).xp;

// Il Goblin viene sconfitto: la transizione vivo->morto, con l'attacco narrato a nome di Ligeia.
bersaglioNpc = { id: "npc-1", kind: "npc", name: "Goblin", hitPoints: 0, defeated: true };
window.UltimateVTTCombat.getState = () => ({ combatants: [goblinVivo, bersaglioNpc], lastRoll: { title: "Ligeia vs Goblin", detail: "colpito" } });
P._pollCombat();
check("il PG attualmente attivo non riceve XP per un'uccisione fatta da un altro membro del party", P.getProg(idAttivoOra).xp === progAttivoPrimaPoll);
check("il vero uccisore (Ligeia, risolto dal roster hotseat via lastRoll.title) riceve l'XP end-to-end", P.getProg("player-2").xp === progLigeiaPrimaPoll + 50);

console.log("\nRisultato core-progression: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
