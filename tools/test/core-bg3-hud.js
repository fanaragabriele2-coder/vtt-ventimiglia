// Test della HUD di combattimento stile BG3 (modulo 23): la matematica della probabilita' di
// colpire (5e, con vantaggio/svantaggio, 20/1 naturale) e la costruzione/visibilita' della HUD.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }
function quasi(a, b) { return Math.abs(a - b) < 1e-9; }

// ---- Mini-DOM con classList/style/hidden/innerHTML, sufficiente per il modulo 23 ----
const registro = [];
function nuovoElemento(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(), id: "", _class: "", textContent: "", hidden: false,
    style: {}, children: [], listeners: {}, attributes: {}, options: [], value: "",
    appendChild(figlio) { this.children.push(figlio); figlio.parentNode = this; if (this.tagName === "SELECT") { this.options.push(figlio); } return figlio; },
    addEventListener(tipo, fn) { (this.listeners[tipo] = this.listeners[tipo] || []).push(fn); },
    dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach(function (fn) { fn(ev); }); return true; },
    setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k]; },
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  Object.defineProperty(el, "className", { get() { return this._class; }, set(v) { this._class = String(v); } });
  Object.defineProperty(el, "classList", {
    get() {
      const self = this;
      return {
        add(c) { const s = self._class.split(/\s+/).filter(Boolean); if (s.indexOf(c) === -1) { s.push(c); } self._class = s.join(" "); },
        remove(c) { self._class = self._class.split(/\s+/).filter(function (x) { return x && x !== c; }).join(" "); },
        contains(c) { return self._class.split(/\s+/).indexOf(c) !== -1; },
        toggle(c, on) { if (on === undefined) { on = !this.contains(c); } if (on) { this.add(c); } else { this.remove(c); } return on; }
      };
    }
  });
  Object.defineProperty(el, "innerHTML", { get() { return ""; }, set(v) { if (v === "") { this.children = []; this.options = []; } } });
  registro.push(el);
  return el;
}
function cercaClasse(sub) { return registro.filter(function (e) { return (" " + e._class + " ").indexOf(" " + sub + " ") !== -1; }); }

const corpo = nuovoElemento("body");
global.window = global;
global.document = {
  readyState: "complete", addEventListener() {}, createElement: nuovoElemento,
  createTextNode(t) { return { nodeType: 3, textContent: String(t) }; },
  getElementById(id) { for (let i = 0; i < registro.length; i++) { if (registro[i].id === id) { return registro[i]; } } return null; },
  createEvent() { return { initEvent() {} }; }, body: corpo
};
global.Event = function (type) { this.type = type; };
global.addEventListener = function () {}; // window.addEventListener (window === global nel test)
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

// Stato di combattimento finto, pilotabile dal test.
let combat = { active: false, round: 0, currentTurnIndex: -1, rollMode: "normal", selectedTargetId: "npc-1",
  lastRoll: { detail: "" },
  combatants: [
    { id: "pc-local", kind: "pc", name: "Eroe", armorClass: 15, attackBonus: 5, hitPoints: 20, maxHitPoints: 20, initiative: 17, defeated: false },
    { id: "npc-1", kind: "npc", name: "Goblin", armorClass: 15, attackBonus: 4, hitPoints: 7, maxHitPoints: 7, initiative: 12, defeated: false }
  ] };
let rollModeImpostata = null;
window.UltimateVTTCombat = {
  getState: () => JSON.parse(JSON.stringify(combat)),
  setRollMode: (m) => { rollModeImpostata = m; combat.rollMode = m; },
  resolveAttack: () => { combat.lastRoll.detail = "Eroe vs Goblin: colpito."; return { hit: true }; },
  nextTurn: () => { combat.currentTurnIndex = (combat.currentTurnIndex + 1) % combat.combatants.length; }
};

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/23-bg3-combat-hud.js");

const H = window.UltimateVTTBG3HUD;
check("UltimateVTTBG3HUD esposto", !!H);

console.log("\n[Probabilita' di colpire — d20 singolo]");
check("+5 vs CA 15 = 55% (servono 10+ piu' il 20 naturale)", quasi(H.probColpireDado(5, 15), 0.55));
check("+0 vs CA 10 = 55%", quasi(H.probColpireDado(0, 10), 0.55));
check("CA bassissima: solo l'1 naturale manca -> 95%", quasi(H.probColpireDado(5, 5), 0.95));
check("CA altissima: solo il 20 naturale colpisce -> 5%", quasi(H.probColpireDado(0, 25), 0.05));
check("serve esattamente 20 (CA-bonus=20): 5% (solo nat 20)", quasi(H.probColpireDado(0, 20), 0.10) === false && quasi(H.probColpireDado(0, 20), 0.05));
check("la probabilita' e' monotona: piu' CA => non aumenta", H.probColpireDado(5, 16) <= H.probColpireDado(5, 15));

console.log("\n[Vantaggio / Svantaggio]");
check("vantaggio su 55% = 1-(0.45)^2 ≈ 79.75%", quasi(H.probColpire(5, 15, "advantage"), 1 - 0.45 * 0.45));
check("svantaggio su 55% = 0.55^2 = 30.25%", quasi(H.probColpire(5, 15, "disadvantage"), 0.55 * 0.55));
check("normale = singolo dado", quasi(H.probColpire(5, 15, "normal"), 0.55));
check("vantaggio non peggiora mai la probabilita'", H.probColpire(3, 18, "advantage") >= H.probColpire(3, 18, "normal"));
check("svantaggio non migliora mai la probabilita'", H.probColpire(3, 12, "disadvantage") <= H.probColpire(3, 12, "normal"));

console.log("\n[Percentuale arrotondata]");
check("percento(0.7975) = 80", H.percento(0.7975) === 80);
check("percento(0.3025) = 30", H.percento(0.3025) === 30);
check("percento(0.05) = 5", H.percento(0.05) === 5);

console.log("\n[HUD: visibilita' e rendering]");
const hud = cercaClasse("bg3-hud")[0];
check("la HUD viene costruita nel DOM", !!hud);
H.render();
check("la HUD e' NASCOSTA fuori dal combattimento", hud.hidden === true);

combat.active = true; combat.round = 1; combat.currentTurnIndex = 0; // turno del PG, bersaglio npc-1
H.render();
check("la HUD e' VISIBILE a combattimento attivo", hud.hidden === false);

const hitPct = cercaClasse("bg3-hit-pct")[0];
check("il pannello mostra la percentuale di colpire del PG sul bersaglio (55%)", hitPct && hitPct.textContent === "55%");

combat.rollMode = "advantage";
H.render();
check("con vantaggio la percentuale mostrata sale (80%)", hitPct.textContent === "80%");

// Barra iniziativa: una card per combattente. Si contano i figli VIVI del contenitore
// (il registro globale del mini-DOM accumula le card di ogni render: non e' affidabile contarlo).
const initBar = cercaClasse("bg3-initiative")[0];
const cards = initBar.children;
check("la barra iniziativa ha una card per combattente", cards.length === 2);
check("la card del turno corrente e' evidenziata", cards.some(function (c) { return c.classList.contains("is-turn"); }));

// Click su un nemico nella barra => imposta il bersaglio via il select del combat.
const sel = nuovoElemento("select"); sel.id = "moduleFiveTargetSelect";
const cardNemico = cards.find(function (c) { return c.classList.contains("is-enemy"); });
let targetCambiato = null;
sel.addEventListener("change", function () { targetCambiato = sel.value; });
(cardNemico.listeners.click || []).forEach(function (fn) { fn(); });
check("click sulla card nemico imposta il bersaglio nel select del combat", targetCambiato === "npc-1");

// Termina turno => chiama nextTurn del combat (nessuna FSM in questo test).
const prima = combat.currentTurnIndex;
const btnEnd = cercaClasse("bg3-btn").find(function (b) { return b.textContent === "Termina turno"; });
(btnEnd.listeners.click || []).forEach(function (fn) { fn(); });
check("Termina turno avanza il combattimento (nextTurn)", combat.currentTurnIndex !== prima);

H.fermaAggiornamento();
console.log("\nRisultato core-bg3-hud: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
