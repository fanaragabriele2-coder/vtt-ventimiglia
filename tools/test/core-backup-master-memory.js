// Test di integrazione: la memoria del Master IA (cronologia Groq + riepilogo dell'ultimo
// combattimento, aggiunte al vero js/12 come getState()/hydrate() su UltimateVTTCoreGameplay)
// deve sopravvivere a un ciclo di backup scaricabile / ripristino (vero js/11), non solo restare
// viva nella scheda del browser: altrimenti ricaricare la pagina o importare un salvataggio
// azzererebbe la memoria appena costruita dal modulo 29, vanificando la "ripartenza coerente".
// Carica i VERI js/11 e js/12 (non stub), riusando lo stub DOM permissivo gia' validato da
// core-master-memory-integration.js.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

function nuovoElemento(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(), id: "", className: "", textContent: "", value: "",
    href: "", download: "", clicked: false,
    style: { setProperty() {}, removeProperty() {} }, dataset: {}, children: [], options: [], disabled: false, checked: false, hidden: false,
    appendChild(f) { this.children.push(f); return f; },
    insertBefore(n) { this.children.push(n); return n; },
    removeChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    focus() {}, click() { this.clicked = true; },
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

const linkCreati = [];
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
  createElement(tag) { const el = nuovoElemento(tag); if (tag === "a") { linkCreati.push(el); } return el; },
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
global.Blob = function (parts, opts) { this.parts = parts; this.type = opts && opts.type; };
global.URL = { createObjectURL() { return "blob:fake/" + Math.random().toString(36).slice(2); }, revokeObjectURL() {} };
global.FileReader = function () {
  const self = this;
  this.readAsText = function (file) {
    setTimeout(function () {
      if (file && file.__erroreLettura) { if (self.onerror) { self.onerror(); } return; }
      self.result = (file && file.__content) || "";
      if (self.onload) { self.onload(); }
    }, 0);
  };
};
window.UltimateVTT = { appendSystemLog() {}, registerModule() {}, runSelfDiagnostics: () => null, version: "test" };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }

console.log("Caricamento dei VERI js/04, js/11 e js/12...");
carica("js/04-3-state-manager-pg-statistiche.js");
carica("js/11-10-ai-bridge-json-parser.js");
carica("js/12-patch-touch-events-per-mobile.js");

const B = window.UltimateVTTAIBridge;
const CG = window.UltimateVTTCoreGameplay;
check("js/11 e js/12 si caricano insieme senza eccezioni", !!B && !!CG);
check("UltimateVTTCoreGameplay espone getState/hydrate", typeof CG.getState === "function" && typeof CG.hydrate === "function");

console.log("\n[Popolamento diretto della memoria del Master IA (bypassando il gate di Groq abilitato)]");
CG.hydrate({
  groqChatHistory: [
    { role: "user", content: "Attacco lo scheletro." },
    { role: "assistant", content: "Il colpo affonda nell'osso: lo scheletro crolla." }
  ],
  ultimoRiepilogoCombattimento: "📋 RIEPILOGO DEL COMBATTIMENTO APPENA CONCLUSO:\nEsito: vittoria del party dopo 2 round.\nSconfitti: Scheletro.",
  diarioDiCampagna: ["⚔️ Combattimento concluso — vittoria del party dopo 2 round.", "🧭 Il gruppo si sposta verso Porto Turistico."]
});
check("la cronologia impostata via hydrate e' visibile via getState", CG.getState().groqChatHistory.length === 2);
check("il riepilogo impostato via hydrate e' visibile via getUltimoRiepilogoCombattimento", /vittoria del party dopo 2 round/.test(CG.getUltimoRiepilogoCombattimento()));
check("il diario impostato via hydrate e' visibile via getDiarioCampagna", CG.getDiarioCampagna().length === 2);

console.log("\n[Export su file: lo snapshot include la memoria del Master IA]");
const esportato = B.exportSnapshotToFile();
check("exportSnapshotToFile ritorna ok:true", esportato.ok === true);
check("lo snapshot esportato include coreGameplayState", !!esportato.snapshot.coreGameplayState);
check("lo snapshot esportato include la cronologia Groq completa", esportato.snapshot.coreGameplayState.groqChatHistory.length === 2);
check("lo snapshot esportato include il riepilogo dell'ultimo combattimento", /vittoria del party dopo 2 round/.test(esportato.snapshot.coreGameplayState.ultimoRiepilogoCombattimento));
check("lo snapshot esportato include il diario di campagna completo", esportato.snapshot.coreGameplayState.diarioDiCampagna.length === 2);

console.log("\n[Import da file: la memoria del Master IA viene ripristinata dopo essere stata azzerata]");
// Simula un "ricaricamento della pagina": la memoria viene azzerata (nuovo stato in-memory).
CG.hydrate({ groqChatHistory: [], ultimoRiepilogoCombattimento: "", diarioDiCampagna: [] });
check("la memoria e' stata azzerata prima dell'import", CG.getState().groqChatHistory.length === 0 && CG.getUltimoRiepilogoCombattimento() === "" && CG.getDiarioCampagna().length === 0);

const contenutoValido = JSON.stringify(esportato.snapshot);
B.importSnapshotFromFile({ __content: contenutoValido }).then(function (risultato) {
  check("import da file valido ritorna ok:true", risultato.ok === true);
  check("il risultato dell'import segnala il ripristino della memoria del Master IA", risultato.restored.coreGameplay === true);
  check("dopo l'import la cronologia Groq e' di nuovo presente (2 voci)", CG.getState().groqChatHistory.length === 2);
  check("dopo l'import il riepilogo dell'ultimo combattimento e' di nuovo presente", /vittoria del party dopo 2 round/.test(CG.getUltimoRiepilogoCombattimento()));
  check("dopo l'import il contenuto della cronologia e' fedele all'originale", CG.getState().groqChatHistory[1].content === "Il colpo affonda nell'osso: lo scheletro crolla.");
  check("dopo l'import il diario di campagna e' di nuovo presente (2 voci, fedeli)", CG.getDiarioCampagna().length === 2 && CG.getDiarioCampagna()[1] === "🧭 Il gruppo si sposta verso Porto Turistico.");

  console.log("\n[Import di uno snapshot senza memoria del Master IA (retrocompatibilita')]");
  const snapshotSenzaMemoria = Object.assign({}, esportato.snapshot);
  delete snapshotSenzaMemoria.coreGameplayState;
  return B.importSnapshotFromFile({ __content: JSON.stringify(snapshotSenzaMemoria) });
}).then(function (risultato) {
  check("import di un backup vecchio (senza coreGameplayState) non lancia e ritorna ok:true", risultato.ok === true);
  check("in assenza di coreGameplayState nello snapshot, il ripristino di coreGameplay e' false", risultato.restored.coreGameplay === false);

  console.log("\nRisultato core-backup-master-memory: " + passati + " passati, " + falliti + " falliti.");
  process.exit(falliti === 0 ? 0 : 1);
}).catch(function (e) {
  falliti += 1;
  console.log("  ECCEZIONE non gestita: " + (e && e.message));
  console.log("\nRisultato core-backup-master-memory: " + passati + " passati, " + falliti + " falliti.");
  process.exit(1);
});
