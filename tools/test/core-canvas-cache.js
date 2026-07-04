// Test della cache offscreen del canvas (modulo 07, Task 3 — performance): carica il VERO js/07
// con un context 2d "registrante" che conta le operazioni di disegno, e verifica che:
//  - il primo frame ridisegna terreno+nebbia nelle cache offscreen;
//  - i frame successivi NON rifanno quel lavoro (solo blit drawImage sul canvas principale);
//  - le invalidazioni (setTerrainAt, revealCircle/fillFog, rigenerazione) ridisegnano SOLO il
//    layer interessato, una volta sola.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Context 2d registrante: conta fillRect/drawImage per distinguere "ridisegno pieno" da "blit". ----
function creaContextRegistrante(etichetta) {
  return {
    _etichetta: etichetta,
    conta: { fillRect: 0, drawImage: 0, clearRect: 0, stroke: 0 },
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "", textBaseline: "",
    fillRect() { this.conta.fillRect += 1; },
    drawImage() { this.conta.drawImage += 1; },
    clearRect() { this.conta.clearRect += 1; },
    stroke() { this.conta.stroke += 1; },
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {},
    translate() {}, scale() {}, setTransform() {}, setLineDash() {}, fillText() {}, strokeRect() {},
    measureText: () => ({ width: 0 }),
    createRadialGradient() { return { addColorStop() {} }; }
  };
}

function nuovoCanvasStub(nome) {
  const ctx = creaContextRegistrante(nome);
  return {
    _nome: nome, width: 0, height: 0, _ctx: ctx,
    getContext() { return ctx; },
    getBoundingClientRect() { return { width: 800, height: 600, top: 0, left: 0 }; },
    addEventListener() {}, removeEventListener() {},
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }
  };
}

function nuovoElemento(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(), id: "", textContent: "", value: "", checked: false,
    style: {}, children: [], options: [],
    appendChild(f) { this.children.push(f); return f; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setAttribute() {}, getAttribute() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }
  };
}

const canvasPrincipale = nuovoCanvasStub("principale");
const canvasOffscreenCreati = [];

global.window = global;
global.addEventListener = function () {};
global.removeEventListener = function () {};
global.innerWidth = 1024;
global.innerHeight = 768;
global.devicePixelRatio = 1;
global.requestAnimationFrame = (cb) => { cb(); return 0; };
global.cancelAnimationFrame = () => {};
global.document = {
  readyState: "complete",
  addEventListener() {}, removeEventListener() {},
  getElementById(id) { return id === "vttCanvas" ? canvasPrincipale : nuovoElemento("div"); },
  querySelector() { return nuovoElemento("div"); },
  querySelectorAll() { return []; },
  createElement(tag) {
    if (String(tag).toLowerCase() === "canvas") {
      const c = nuovoCanvasStub("offscreen-" + canvasOffscreenCreati.length);
      canvasOffscreenCreati.push(c);
      return c;
    }
    return nuovoElemento(tag);
  },
  body: nuovoElemento("body")
};
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }

console.log("Caricamento del VERO js/07 (canvas rendering)...");
carica("js/07-6-canvas-rendering-griglie-mappa.js");
const CV = window.UltimateVTTCanvas;
check("UltimateVTTCanvas esposto", !!CV);
check("getRenderStats esposto", typeof CV.getRenderStats === "function");

function ctxTerreno() { return canvasOffscreenCreati.length ? canvasOffscreenCreati[canvasOffscreenCreati.length - 2]._ctx : null; }
function ctxNebbia() { return canvasOffscreenCreati.length ? canvasOffscreenCreati[canvasOffscreenCreati.length - 1]._ctx : null; }

console.log("\n[Primo frame: le cache offscreen vengono costruite UNA volta]");
CV.renderCanvasNow();
const stats1 = CV.getRenderStats();
check("dopo il primo frame: 1 ridisegno terreno e 1 ridisegno nebbia", stats1.terrainRedraws === 1 && stats1.fogRedraws === 1);
check("il terreno e' stato disegnato sull'OFFSCREEN (768+ fillRect), non sul canvas principale",
  ctxTerreno() && ctxTerreno().conta.fillRect >= 32 * 24);
const fillRectPrincipaleDopoPrimo = canvasPrincipale._ctx.conta.fillRect;
check("sul canvas principale solo lo sfondo (pochi fillRect), il resto arriva in blit", fillRectPrincipaleDopoPrimo <= 3);
check("il canvas principale ha ricevuto i blit (drawImage >= 2: terreno+nebbia)", canvasPrincipale._ctx.conta.drawImage >= 2);

console.log("\n[Frame successivi: SOLO blit, zero ridisegni pieni]");
const fillTerrenoPrima = ctxTerreno().conta.fillRect;
for (let i = 0; i < 10; i++) { CV.renderCanvasNow(); }
const stats2 = CV.getRenderStats();
check("10 frame in piu': frames cresce ma terrainRedraws resta 1", stats2.frames === stats1.frames + 10 && stats2.terrainRedraws === 1);
check("nessun nuovo fillRect sull'offscreen del terreno (cache riusata)", ctxTerreno().conta.fillRect === fillTerrenoPrima);
check("fogRedraws resta 1 (nebbia non toccata)", stats2.fogRedraws === 1);

console.log("\n[Invalidazione mirata: un ostacolo ridisegna SOLO il terreno]");
CV.setTerrainAt(5, 5, "wall"); // l'arena tattica piazza cosi' gli ostacoli
const stats3 = CV.getRenderStats();
check("setTerrainAt -> +1 ridisegno terreno, nebbia INTATTA", stats3.terrainRedraws === 2 && stats3.fogRedraws === 1);

console.log("\n[Invalidazione mirata: la nebbia ridisegna SOLO la nebbia]");
// La mappa parte tutta RIVELATA (scelta di design del modulo 07): rivelare celle gia' visibili
// non cambia nulla, e quindi — correttamente — NON deve invalidare niente (zero lavoro sprecato).
const nebbiaPrima = CV.getRenderStats().fogRedraws;
CV.revealCircle(10, 10, 3);
check("revealCircle su celle GIA' rivelate -> nessun ridisegno (no-op riconosciuto)", CV.getRenderStats().fogRedraws === nebbiaPrima);
CV.fillFog(true); // ora tutto buio: e' un cambiamento vero
const stats4 = CV.getRenderStats();
check("fillFog(true) -> +1 ridisegno nebbia, terreno INTATTO", stats4.fogRedraws === nebbiaPrima + 1 && stats4.terrainRedraws === 2);
CV.revealCircle(10, 10, 3); // adesso rivela celle DAVVERO buie
const stats5 = CV.getRenderStats();
check("revealCircle su celle buie -> +1 ridisegno nebbia soltanto", stats5.fogRedraws === nebbiaPrima + 2 && stats5.terrainRedraws === 2);

console.log("\n[Rigenerazione mappa: terreno E nebbia si ridisegnano]");
const primaRigenera = CV.getRenderStats();
CV.regenerateMap();
const stats6 = CV.getRenderStats();
check("regenerateMap ridisegna il terreno", stats6.terrainRedraws === primaRigenera.terrainRedraws + 1);
check("regenerateMap ridisegna anche la nebbia (fillFog+revealCircle interni)", stats6.fogRedraws > primaRigenera.fogRedraws);

console.log("\n[Dopo tutte le invalidazioni, il regime torna a solo-blit]");
const framePrima = CV.getRenderStats().frames;
const terrenoPrima = CV.getRenderStats().terrainRedraws;
for (let i = 0; i < 5; i++) { CV.renderCanvasNow(); }
const stats7 = CV.getRenderStats();
check("5 frame extra: nessun nuovo ridisegno pieno", stats7.frames === framePrima + 5 && stats7.terrainRedraws === terrenoPrima);

console.log("\nRisultato core-canvas-cache: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
