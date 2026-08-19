// Test del menu iniziale / creazione personaggio (modulo 14): copre un bug reale segnalato
// dall'utente — creare N personaggi con "AGGIUNGI AL PARTY" e poi cliccare "INIZIA L'AVVENTURA"
// aggiungeva SEMPRE un (N+1)-esimo personaggio "fantasma", costruito da qualunque razza/classe/nome
// fosse rimasta nel form al momento del click, anche se l'utente non l'aveva mai esplicitamente
// aggiunto. Prima suite di test per questo modulo (nessuna esisteva).
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Mini-DOM: registro piatto di elementi finti (stesso pattern di core-bg3-hud.js) ----
const registro = [];
function nuovoElemento(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(), id: "", _class: "", textContent: "", value: "",
    style: {}, children: [], listeners: {}, disabled: false, title: "",
    appendChild(figlio) { this.children.push(figlio); figlio.parentNode = this; return figlio; },
    insertBefore(figlio) { this.children.unshift(figlio); figlio.parentNode = this; return figlio; },
    addEventListener(tipo, fn) { (this.listeners[tipo] = this.listeners[tipo] || []).push(fn); },
    querySelector(sel) { return cercaIn(sel); },
    querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; }
  };
  Object.defineProperty(el, "className", { get() { return this._class; }, set(v) { this._class = String(v); } });
  Object.defineProperty(el, "classList", {
    get() {
      const self = this;
      return {
        add(c) { const s = self._class.split(/\s+/).filter(Boolean); if (s.indexOf(c) === -1) { s.push(c); } self._class = s.join(" "); },
        remove(c) { self._class = self._class.split(/\s+/).filter(function (x) { return x && x !== c; }).join(" "); },
        contains(c) { return self._class.split(/\s+/).indexOf(c) !== -1; }
      };
    }
  });
  // innerHTML in questo modulo e' usato SOLO per etichette di testo semplice (bottoni/etichette,
  // niente markup annidato) o per svuotare un contenitore (""): approssimato copiando il valore
  // anche in textContent, cosi' i test possono trovare i bottoni cercando il loro testo.
  Object.defineProperty(el, "innerHTML", {
    get() { return this.textContent; },
    set(v) { if (v === "") { this.children = []; } this.textContent = v; }
  });
  registro.push(el);
  return el;
}
function corrisponde(el, sel) {
  if (sel[0] === "#") { return el.id === sel.slice(1); }
  if (sel[0] === ".") { return (" " + el._class + " ").indexOf(" " + sel.slice(1) + " ") !== -1; }
  return el.tagName === sel.toUpperCase();
}
function cercaIn(sel) {
  for (let i = 0; i < registro.length; i++) { if (corrisponde(registro[i], sel)) { return registro[i]; } }
  return null;
}
function tuttiConClasse(cls) { return registro.filter(function (e) { return (" " + e._class + " ").indexOf(" " + cls + " ") !== -1; }); }

const overlay = nuovoElemento("div"); overlay.id = "vttStartOverlay";
const card = nuovoElemento("div"); card.id = "vsmCard";
const topbarRight = nuovoElemento("div"); topbarRight.className = "topbar-right";

global.window = global;
global.document = {
  readyState: "complete",
  addEventListener() {},
  getElementById(id) { return cercaIn("#" + id); },
  querySelector(sel) { return cercaIn(sel); },
  createElement: nuovoElemento,
  body: nuovoElemento("body")
};
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };
window.UltimateVTTState = { getState: () => ({ identity: {}, abilities: {}, skills: {}, resources: {} }) };
window.UltimateVTTInventory = {
  itemCatalog: [],
  getState: () => ({ inventory: [] }),
  addInventoryItem: () => null, dropInventoryItem: () => false, equipItem: () => {}
};

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/14-start-menu-creazione-personaggio.js");

const SM = window.VTTStartMenu;
check("VTTStartMenu esposto (avvio senza eccezioni)", !!SM);

// Naviga dalla home alla schermata di creazione (equivalente a cliccare "NUOVA PARTITA").
function vaiACreazione() {
  const btnNuova = tuttiConClasse("vsm-btn").find(function (b) { return /NUOVA PARTITA/.test(b.textContent); });
  check("bottone 'NUOVA PARTITA' presente nella home", !!btnNuova);
  btnNuova.onclick();
}

function bottoneCreazione(testoRegex) {
  return registro.filter(function (b) { return b.tagName === "BUTTON" && testoRegex.test(b.textContent); }).pop();
}

console.log("\n[BUG CORRETTO: 2 PG aggiunti esplicitamente -> il party parte con ESATTAMENTE 2, non 3]");
window.partyData = undefined;
SM.open();
vaiACreazione();

document.getElementById("vsmName").value = "Aria";
bottoneCreazione(/AGGIUNGI AL PARTY/).onclick(); // 1° PG aggiunto esplicitamente

document.getElementById("vsmName").value = "Ligeia";
bottoneCreazione(/AGGIUNGI AL PARTY/).onclick(); // 2° PG aggiunto esplicitamente

// A questo punto il form mostra ancora valori residui (razza/classe correnti, nome suggerito a
// caso): prima della correzione, cliccare "INIZIA L'AVVENTURA" costruiva ANCHE questo come 3° PG.
bottoneCreazione(/INIZIA L'AVVENTURA/).onclick();

check("il party creato ha ESATTAMENTE 2 membri (i due aggiunti, nessun terzo fantasma)", window.partyData && window.partyData.length === 2);
check("i due membri sono davvero Aria e Ligeia (non un terzo nome a caso)",
  window.partyData && window.partyData.map(m => m.identity.name).sort().join(",") === "Aria,Ligeia");

console.log("\n[Percorso solo: nessun 'AGGIUNGI AL PARTY' cliccato, solo form + 'INIZIA L'AVVENTURA' -> 1 PG (comportamento invariato)]");
window.partyData = undefined;
SM.open();
vaiACreazione();
document.getElementById("vsmName").value = "Doran";
bottoneCreazione(/INIZIA L'AVVENTURA/).onclick();
check("con un solo form compilato (nessun 'aggiungi') il party parte con 1 PG", window.partyData && window.partyData.length === 1);
check("il PG e' quello del form ('Doran')", window.partyData && window.partyData[0].identity.name === "Doran");

console.log("\n[Un solo PG aggiunto esplicitamente -> il party parte con 1, non 2]");
window.partyData = undefined;
SM.open();
vaiACreazione();
document.getElementById("vsmName").value = "Elowen";
bottoneCreazione(/AGGIUNGI AL PARTY/).onclick();
bottoneCreazione(/INIZIA L'AVVENTURA/).onclick();
check("un solo PG esplicitamente aggiunto -> il party parte con ESATTAMENTE 1 (non 2)", window.partyData && window.partyData.length === 1);
check("il PG e' quello aggiunto ('Elowen')", window.partyData && window.partyData[0].identity.name === "Elowen");

console.log("\nRisultato core-start-menu: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
