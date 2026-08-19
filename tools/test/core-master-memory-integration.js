// Test di integrazione: carica il VERO js/12 (non uno stub) insieme al VERO modulo 29, per
// verificare che il ponte verso la memoria del Master IA (notifyMasterMemory / setUltimoRiepilogo
// Combattimento, aggiunti a js/12 in questa modifica) funzioni davvero dentro il modulo di
// produzione, non solo contro un mock. Il vero fetch verso Groq/Ollama non viene esercitato (serve
// una API key + rete): si verifica il canale persistente (getUltimoRiepilogoCombattimento), che e'
// l'anello della catena raggiungibile senza rete e che alimenta anche il prompt di sistema di
// Ollama (stateless) oltre alla cronologia di Groq.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Stub DOM/browser minimale ma permissivo: js/12 e' un modulo enorme (3580 righe) con molte
// dipendenze DOM difensive (getElementById -> null gestito ovunque); un elemento finto generico
// evita di dover mappare ogni id specifico. ----
function nuovoElemento(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(), id: "", className: "", textContent: "", value: "",
    style: {}, dataset: {}, children: [], options: [], disabled: false, checked: false, hidden: false,
    appendChild(f) { this.children.push(f); return f; },
    insertBefore(n) { this.children.push(n); return n; },
    removeChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    focus() {}, click() {},
    getContext() {
      return {
        measureText: () => ({ width: 0 }), fillRect() {}, clearRect() {}, save() {}, restore() {},
        beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, drawImage() {},
        translate() {}, scale() {}, setLineDash() {}, fillText() {}, strokeRect() {},
        createRadialGradient() { return { addColorStop() {} }; }
      };
    },
    getBoundingClientRect() { return { width: 100, height: 100, top: 0, left: 0 }; }
  };
}

global.window = global;
global.addEventListener = function () {};
global.removeEventListener = function () {};
global.dispatchEvent = function () { return true; };
global.innerWidth = 1024;
global.innerHeight = 768;
Object.defineProperty(global, "navigator", { value: { userAgent: "test", vibrate() {}, mediaDevices: {} }, writable: true, configurable: true });
global.document = {
  readyState: "complete",
  addEventListener() {}, removeEventListener() {},
  getElementById() { return nuovoElemento("div"); },
  querySelector() { return nuovoElemento("div"); },
  querySelectorAll() { return []; },
  createElement: nuovoElemento,
  createTextNode(t) { return { textContent: String(t) }; },
  body: nuovoElemento("body"),
  head: nuovoElemento("head"),
  documentElement: nuovoElemento("html")
};
global.localStorage = (function () { var s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } }; })();
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = () => {};
global.fetch = () => Promise.reject(new Error("nessuna rete nei test"));
global.speechSynthesis = { speak() {}, cancel() {}, getVoices() { return []; } };
global.SpeechSynthesisUtterance = function () {};
global.AbortController = function () { this.signal = {}; this.abort = () => {}; };
global.CustomEvent = function (t, o) { this.type = t; this.detail = o && o.detail; };
window.UltimateVTT = { appendSystemLog() {}, registerModule() {}, runSelfDiagnostics: () => null, version: "test" };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }

console.log("Caricamento del VERO js/12 (Core Gameplay Loop, Master IA)...");
carica("js/12-patch-touch-events-per-mobile.js");
check("js/12 si carica senza eccezioni con uno stub DOM permissivo", true);

const CG = window.UltimateVTTCoreGameplay;
check("UltimateVTTCoreGameplay esposto dal vero js/12", !!CG);
check("notifyMasterMemory e' una funzione reale (non un mock)", typeof CG.notifyMasterMemory === "function");
check("setUltimoRiepilogoCombattimento e' una funzione reale", typeof CG.setUltimoRiepilogoCombattimento === "function");
check("getUltimoRiepilogoCombattimento e' una funzione reale", typeof CG.getUltimoRiepilogoCombattimento === "function");

console.log("\n[Canale persistente: setUltimoRiepilogoCombattimento / getUltimoRiepilogoCombattimento]");
check("all'avvio il riepilogo e' vuoto", CG.getUltimoRiepilogoCombattimento() === "");
const digestDiProva = "📋 RIEPILOGO DEL COMBATTIMENTO APPENA CONCLUSO:\nEsito: vittoria del party dopo 3 round.";
CG.setUltimoRiepilogoCombattimento(digestDiProva);
check("il riepilogo impostato viene restituito identico (round-trip)", CG.getUltimoRiepilogoCombattimento() === digestDiProva);

console.log("\n[notifyMasterMemory non lancia mai (ne' con Groq disabilitato ne' senza cronologia attiva)]");
check("notifyMasterMemory non lancia con Groq disabilitato (default in assenza di API key)", (function () {
  try { CG.notifyMasterMemory("Test di un evento di combattimento."); return true; } catch (e) { return false; }
})());
check("notifyMasterMemory non lancia con testo vuoto/assente", (function () {
  try { CG.notifyMasterMemory(""); CG.notifyMasterMemory(undefined); return true; } catch (e) { return false; }
})());

console.log("\n[Integrazione reale: il modulo 29 alimenta js/12 attraverso il ponte pubblico]");
window.UltimateVTTCombat = { getState: () => ({
  active: false, round: 0, lastEvent: "",
  combatants: [{ id: "pc-local", kind: "pc", name: "Eroe", hitPoints: 20, maxHitPoints: 20, defeated: false }]
}) };
carica("js/29-combat-memory.js");
const M = window.UltimateVTTCombatMemory;
check("il modulo 29 si carica sopra il vero js/12 senza eccezioni", !!M);

// Simula un piccolo combattimento e verifica che il riepilogo arrivi DAVVERO nel canale persistente
// del vero js/12 (non in un mock): prova che il "ponte" funziona end-to-end nel modulo di produzione.
let stato = { active: true, round: 1, lastEvent: "Combattimento iniziato.",
  combatants: [
    { id: "pc-local", kind: "pc", name: "Eroe", hitPoints: 20, maxHitPoints: 20, defeated: false },
    { id: "npc-1", kind: "npc", name: "Scheletro", hitPoints: 13, maxHitPoints: 13, defeated: false }
  ] };
window.UltimateVTTCombat = { getState: () => JSON.parse(JSON.stringify(stato)) };
M._tick(); // avvio
stato.lastEvent = "Eroe vs Scheletro: colpito. Danni: 8.";
stato.combatants[1].hitPoints = 5;
M._tick();
stato.lastEvent = "Eroe vs Scheletro: colpito. Danni: 5.";
stato.combatants[1].hitPoints = 0;
stato.combatants[1].defeated = true;
M._tick();
stato.active = false; stato.round = 0; stato.lastEvent = "Combattimento terminato.";
M._tick();

const riepilogoFinale = CG.getUltimoRiepilogoCombattimento();
check("dopo un combattimento reale, il riepilogo nel VERO js/12 e' stato aggiornato (non e' piu' quello di prova)", riepilogoFinale !== digestDiProva);
check("il nuovo riepilogo riporta la vittoria del party", /vittoria del party/.test(riepilogoFinale));
check("il nuovo riepilogo menziona lo Scheletro sconfitto", /Scheletro/.test(riepilogoFinale) && /sconfitt/i.test(riepilogoFinale));

console.log("\n[Diario di campagna a lungo termine (modulo 32): il ponte funziona nel vero js/12]");
check("appendDiarioCampagna e' una funzione reale (non un mock)", typeof CG.appendDiarioCampagna === "function");
check("getDiarioCampagna e' una funzione reale", typeof CG.getDiarioCampagna === "function");
check("all'avvio il diario e' vuoto", CG.getDiarioCampagna().length === 0);

carica("js/32-campaign-memory.js");
const CM = window.UltimateVTTCampaignMemory;
check("il modulo 32 si carica sopra il vero js/12 senza eccezioni", !!CM);
CM._tick(); // avvolge setUltimoRiepilogoCombattimento/appendChatMessage sul vero js/12

// Il combattimento simulato sopra ha gia' chiamato CG.setUltimoRiepilogoCombattimento (via modulo 29):
// dato che il wrap del modulo 32 e' avvenuto DOPO, quella chiamata non e' stata intercettata (corretto:
// rispecchia l'ordine reale di caricamento in index.html, 29 prima di 32). Se ne simula una nuova.
CG.setUltimoRiepilogoCombattimento("Esito: vittoria del party dopo 5 round; sconfitti: Bandito.\nAltri dettagli qui.");
check("il diario riceve una voce condensata dopo un nuovo riepilogo di combattimento", CG.getDiarioCampagna().some(v => /vittoria del party dopo 5 round/.test(v)));

CG.appendChatMessage("system", "⭐ LIVELLO 2! Eroe sale di livello: +8 HP max, competenza +1.");
check("il diario riceve una voce dopo un level-up reale", CG.getDiarioCampagna().some(v => /LIVELLO 2/.test(v)));

M.fermaSampler();
console.log("\nRisultato core-master-memory-integration: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
