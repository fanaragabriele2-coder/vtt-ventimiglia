// Test del Task 5 (UI/UX anti-clutter):
//  1) tastiera virtuale — carica il VERO js/12 con un visualViewport finto e verifica che
//     l'apertura della tastiera (altezza visibile che crolla) scriva --vvh e accenda la classe
//     body.keyboard-aperta, e che la chiusura la spenga (e' la classe+variabile che le regole
//     CSS usano per accorciare #app e gli overlay all'area visibile);
//  2) barre di riempimento — guardia di regressione sui sorgenti: le barre HP/movimento/XP
//     devono animare via transform:scaleX (compositing, GPU) e NON via width (reflow del
//     layout a ogni frame della transizione);
//  3) hit-box — guardia di regressione: i pulsanti dell'interfaccia di combattimento hanno
//     una hit-box minima di 44px (standard touch), anche nelle liste ally-mode.
// Le verifiche COMPORTAMENTALI su una pagina reale (stili calcolati, transform effettivo)
// stanno in panel-e2e.js; qui le guardie statiche impediscono regressioni silenziose in CI.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }
function sorgente(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

// ---- Stub DOM permissivo (stesso pattern di core-chat-emission-bridge.js), ma con classList
// e style.setProperty FUNZIONANTI su body/documentElement: sono l'output osservabile del test. ----
function classListVera() {
  const classi = new Set();
  return {
    add(...n) { n.forEach((x) => classi.add(x)); },
    remove(...n) { n.forEach((x) => classi.delete(x)); },
    toggle(nome, forza) {
      const attiva = arguments.length > 1 ? Boolean(forza) : !classi.has(nome);
      if (attiva) { classi.add(nome); } else { classi.delete(nome); }
      return attiva;
    },
    contains(nome) { return classi.has(nome); }
  };
}
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

const corpo = nuovoElemento("body");
corpo.classList = classListVera();
const radice = nuovoElemento("html");
const variabiliCss = {};
radice.style.setProperty = function (nome, valore) { variabiliCss[nome] = valore; };

global.document = {
  readyState: "complete",
  addEventListener() {}, removeEventListener() {},
  getElementById() { return nuovoElemento("div"); },
  querySelector() { return nuovoElemento("div"); },
  querySelectorAll() { return []; },
  createElement: nuovoElemento,
  createTextNode(t) { return { textContent: String(t) }; },
  body: corpo,
  head: nuovoElemento("head"),
  documentElement: radice,
  activeElement: null
};

// visualViewport finto, PRESENTE prima del caricamento di js/12: il modulo vi registra il
// listener di resize, che questo test pilota a mano cambiando l'altezza.
const ascoltatoriViewport = [];
global.visualViewport = {
  height: 768,
  addEventListener(tipo, fn) { if (tipo === "resize") { ascoltatoriViewport.push(fn); } }
};

global.localStorage = (function () {
  var s = {};
  return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } };
})();
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = () => {};
global.speechSynthesis = { speak() {}, cancel() {}, getVoices() { return []; } };
global.SpeechSynthesisUtterance = function () {};
global.AbortController = function () { this.signal = {}; this.abort = () => {}; };
global.CustomEvent = function (t, o) { this.type = t; this.detail = o && o.detail; };
global.fetch = function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
window.UltimateVTT = { appendSystemLog() {}, registerModule() {}, runSelfDiagnostics: () => null, version: "test" };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }

console.log("Caricamento del VERO js/12 (con visualViewport finto)...");
carica("js/12-patch-touch-events-per-mobile.js");

// ---------------------------------------------------------------------------
console.log("\n[Tastiera virtuale: --vvh + body.keyboard-aperta pilotati da visualViewport]");
const V = window.UltimateVTTViewport;
check("UltimateVTTViewport esposto dal vero js/12", !!V);
check("il listener di resize e' registrato sul visualViewport", ascoltatoriViewport.length >= 1);

check("logica pura: barra URL che si ritrae (differenza piccola) NON e' la tastiera", V.tastieraAperta(800, 790) === false);
check("logica pura: meta' schermo occupata dalla tastiera viene riconosciuta", V.tastieraAperta(800, 450) === true);

V.applica(800, 420);
check("tastiera aperta: --vvh riporta l'altezza VISIBILE (420px)", variabiliCss["--vvh"] === "420px");
check("tastiera aperta: body ha la classe keyboard-aperta", corpo.classList.contains("keyboard-aperta") === true);

V.applica(800, 800);
check("tastiera chiusa: la classe si spegne", corpo.classList.contains("keyboard-aperta") === false);
check("tastiera chiusa: --vvh torna all'altezza piena", variabiliCss["--vvh"] === "800px");

// Il percorso REALE dell'evento: cambia l'altezza del visualViewport finto e scatena il resize.
global.innerHeight = 768;
global.visualViewport.height = 300;
ascoltatoriViewport.forEach((fn) => fn());
check("evento resize reale: tastiera rilevata via visualViewport (classe accesa)", corpo.classList.contains("keyboard-aperta") === true);
global.visualViewport.height = 768;
ascoltatoriViewport.forEach((fn) => fn());
check("evento resize reale: tastiera richiusa (classe spenta)", corpo.classList.contains("keyboard-aperta") === false);

const css12 = sorgente("css/01-2-css-avanzato-modali-status.css");
check("il CSS usa davvero la classe/variabile (body.keyboard-aperta #app con var(--vvh))",
  /body\.keyboard-aperta #app[\s\S]{0,120}var\(--vvh/.test(css12));
check("anche gli overlay a schermo intero (#campOverlay, #mobileHub) si adattano", /body\.keyboard-aperta #campOverlay/.test(css12) && /body\.keyboard-aperta #mobileHub/.test(css12));

// ---------------------------------------------------------------------------
console.log("\n[Barre di riempimento: transform:scaleX (compositing), MAI transition su width]");
const css06 = sorgente("css/06-bg3-combat-hud.css");
const css02 = sorgente("css/02-indicatore-caricamento-mappa.css");
const css03 = sorgente("css/03-overlay-principale.css");
const js23 = sorgente("js/23-bg3-combat-hud.js");
const js15 = sorgente("js/15-xp-loot-system.js");
const js12 = sorgente("js/12-patch-touch-events-per-mobile.js");

check("nessuna 'transition: width' residua nei CSS delle barre (06/02/03)",
  !/transition:\s*width/.test(css06) && !/transition:\s*width/.test(css02) && !/transition:\s*width/.test(css03));
check("barra HP iniziativa BG3: transizione su transform", /\.bg3-init-hpfill\s*\{[^}]*transition:\s*transform/.test(css06));
check("barra movimento BG3: transizione su transform", /\.bg3-move-fill\s*\{[^}]*transition:\s*transform/.test(css06));
check("js/23 imposta scaleX, non width, sulle barre", /movFill\.style\.transform\s*=\s*"scaleX/.test(js23) && !/movFill\.style\.width/.test(js23) && /fill\.style\.transform\s*=\s*"scaleX/.test(js23));
check("js/12 imposta scaleX sulle barre HP di hub e campagna", /hubPgHpFill"\)\.style\.transform="scaleX/.test(js12) && /campPgHpFill"\)\.style\.transform = "scaleX/.test(js12) && !/hubPgHpFill"\)\.style\.width/.test(js12));
check("js/15 (barra XP): transition su transform e setter scaleX", /transition:transform \.4s/.test(js15) && /f\.style\.transform = "scaleX/.test(js15) && !/f\.style\.width/.test(js15));

// ---------------------------------------------------------------------------
console.log("\n[Hit-box: minimo 44px per l'interfaccia di combattimento]");
check(".bg3-btn (Attacca/Spingi/Sposta/Bonus/Termina) ha min 44x44", /\.bg3-btn\s*\{[^}]*min-width:\s*44px;\s*min-height:\s*44px/.test(css06));
check(".bg3-mode-btn ha l'alone ::after che estende il tocco a ~44px", /\.bg3-mode-btn::after\s*\{[^}]*top:\s*-13px;\s*bottom:\s*-13px/.test(css06));
check(".combat-row-button / .roll-mode-button a 44px", /\.combat-row-button\s*\{[^}]*min-height:\s*44px/.test(css12) && /\.roll-mode-button\s*\{[^}]*min-height:\s*44px/.test(css12));
check(".inventory-action-button / .spell-action-button / .resource-action-button a 44px",
  /\.inventory-action-button,\s*\n\s*\.spell-action-button\s*\{[^}]*min-height:\s*44px/.test(css12) && /\.resource-action-button\s*\{[^}]*min-height:\s*44px/.test(css12));
check("le liste ally-mode includono ora anche i pulsanti BG3 e delle righe di combattimento",
  /body\.mode-ally \.bg3-btn/.test(css12) && /body\.ally-mode \.bg3-btn/.test(css12) &&
  /body\.mode-ally \.combat-row-button/.test(css12) && /body\.ally-mode \.roll-mode-button/.test(css12));

console.log("\nRisultato core-ui-anticlutter: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
