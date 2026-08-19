// Test del Net Outbox (modulo 42, Task 2 "Supabase-ready"): diff puro tra snapshot, coalescer
// (debounce con tetto massimo di attesa) con timer FINTI, payload JSON puliti, outbox limitato e
// integrazione reale con lo state manager (una raffica di cambi HP -> UN payload, non 20).
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
window.clearInterval = function () {};

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }

// Fonti stubbate PRIMA del caricamento: il modulo si aggancia a queste.
let statoPg = { identity: { id: "p1", name: "Fanny", className: "Guerriero", level: 3 }, resources: { hp: { current: 22, max: 28, temporary: 0 }, armorClass: 17, speedMeters: 9 }, proficiencyBonus: 2 };
let iscrittiStato = [];
window.UltimateVTTState = {
  getState: () => JSON.parse(JSON.stringify(statoPg)),
  subscribe: (fn) => { iscrittiStato.push(fn); }
};
let tokens = [{ id: "token-pc", name: "Fanny", cellX: 10, cellY: 12, hidden: false }];
window.UltimateVTTTokenPhysics = { getState: () => ({ tokens: JSON.parse(JSON.stringify(tokens)) }) };
window.UltimateVTTCombat = { getState: () => ({ active: false, round: 0 }) };

carica("js/36-global-game-state.js");
carica("js/42-net-outbox.js");
const N = window.UltimateVTTNetOutbox;
N.fermaSampler();
check("UltimateVTTNetOutbox esposto", !!N);

// ---------------------------------------------------------------------------
console.log("\n[Diff puro tra snapshot: solo le sezioni cambiate, null se identici]");
const snapA = { pg: { hp: { current: 22 } }, tokens: [{ id: "t", cellX: 1, cellY: 1 }], combat: { active: false }, location: null };
const snapB = JSON.parse(JSON.stringify(snapA));
check("snapshot identici -> nessun delta (zero traffico)", N.diffSnapshot(snapA, snapB) === null);
snapB.pg.hp.current = 15;
const d1 = N.diffSnapshot(snapA, snapB);
check("cambia solo HP -> delta con la SOLA sezione pg", d1 && d1.sezioni.length === 1 && d1.sezioni[0] === "pg" && d1.delta.pg.hp.current === 15);
snapB.tokens[0].cellX = 5;
const d2 = N.diffSnapshot(snapA, snapB);
check("cambiano pg e tokens -> due sezioni nel delta", d2 && d2.sezioni.indexOf("pg") >= 0 && d2.sezioni.indexOf("tokens") >= 0);
check("base assente (primo avvio) trattata come vuota, non lancia", (function () {
  try { return N.diffSnapshot(null, snapB) !== null; } catch (e) { return false; }
})());

// ---------------------------------------------------------------------------
console.log("\n[Coalescer con timer FINTI: raffiche -> poche emissioni]");
// Orologio e timer controllati a mano: nessuna attesa reale nei test.
function creaTimerFinti() {
  let tempo = 0; let prossimoId = 1; let programmati = {};
  return {
    now: () => tempo,
    setTimeout: (fn, ms) => { const id = prossimoId++; programmati[id] = { fn, quando: tempo + ms }; return id; },
    clearTimeout: (id) => { delete programmati[id]; },
    avanza(ms) {
      tempo += ms;
      Object.keys(programmati).forEach((id) => {
        if (programmati[id] && programmati[id].quando <= tempo) { const f = programmati[id].fn; delete programmati[id]; f(); }
      });
    }
  };
}

let emissioni = [];
let clock = creaTimerFinti();
let co = N.creaCoalescer((motivi) => emissioni.push(motivi), { debounceMs: 250, maxWaitMs: 1000, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, now: clock.now });

// Raffica: 20 segnalazioni in 200ms (slider HP trascinato) -> nessuna emissione durante la raffica.
for (let i = 0; i < 20; i++) { co.segna("pg:hp"); clock.avanza(10); }
check("durante la raffica (200ms di trascinamento) nessuna emissione", emissioni.length === 0);
clock.avanza(250); // quiete: il debounce scatta
check("alla quiete arriva UNA sola emissione per 20 cambi", emissioni.length === 1);
check("l'emissione porta i motivi coalizzati", emissioni[0].indexOf("pg:hp") >= 0);

// Flusso CONTINUO senza quiete: il tetto massimo (1s) forza comunque emissioni regolari.
emissioni = [];
for (let i = 0; i < 50; i++) { co.segna("tokens"); clock.avanza(100); } // 5 secondi di trascinamento continuo
clock.avanza(300); // quiete finale
check("5s di cambi continui -> ~5 emissioni (throttle a ~1/s), non 50 e non 0", emissioni.length >= 4 && emissioni.length <= 7);

// ---------------------------------------------------------------------------
console.log("\n[Payload pulito e versionato]");
const payload = N.costruisciPayload(["pg:hp", "tokens"], { sezioni: ["pg"], delta: { pg: { hp: { current: 9 } } } }, 12345);
check("payload versionato (v:1) con tipo e timestamp", payload.v === 1 && payload.tipo === "vtt/delta-stato" && payload.ts === 12345);
check("payload serializzabile in JSON pulito (round-trip identico)", (function () {
  const rt = JSON.parse(JSON.stringify(payload));
  return rt.delta.pg.hp.current === 9 && rt.motivi.length === 2;
})());

// ---------------------------------------------------------------------------
console.log("\n[Integrazione reale: raffica di danni HP -> un solo payload nell'outbox]");
N._resetBase();
check("lo state manager e' stato agganciato (subscribe chiamato)", iscrittiStato.length === 1);

let ricevutiDalTransport = [];
N.setTransport((p) => ricevutiDalTransport.push(p));

// 15 cambi HP a raffica (come uno slider): il subscriber segna, il flush manuale simula la quiete.
for (let i = 0; i < 15; i++) {
  statoPg.resources.hp.current = 22 - i;
  iscrittiStato[0]("hpCurrent");
}
N._flushOra();
check("15 cambi HP -> UN solo payload emesso", N.getOutbox().length === 1);
const p1 = N.getUltimoPayload();
check("il payload contiene la sezione pg con gli HP FINALI (8/28), non i valori intermedi", p1 && p1.delta.pg && p1.delta.pg.hp.current === 8);
check("il transport registrato (futuro Supabase) ha ricevuto lo stesso payload", ricevutiDalTransport.length === 1 && ricevutiDalTransport[0] === p1);

console.log("\n[Nessun cambio reale -> nessun traffico]");
N._segna("pg:rumore");
N._flushOra(); // segnalato ma lo snapshot e' identico all'ultimo inviato
check("una segnalazione senza VERO cambiamento di stato non produce payload", N.getOutbox().length === 1);

console.log("\n[Il bus condiviso (modulo 36) riceve l'evento net:delta]");
let eventiBus = [];
window.UltimateVTTGameState.subscribe("net:delta", (p) => eventiBus.push(p));
statoPg.resources.hp.current = 28;
iscrittiStato[0]("heal");
N._flushOra();
check("l'evento net:delta arriva sul Global Game State", eventiBus.length === 1 && eventiBus[0].delta.pg.hp.current === 28);

console.log("\n[Outbox limitato + drain per il futuro worker Supabase]");
for (let i = 0; i < 60; i++) {
  statoPg.resources.hp.current = (i % 27) + 1;
  iscrittiStato[0]("hpCurrent");
  N._flushOra();
}
check("l'outbox non supera il tetto (50): i piu' vecchi vengono scartati", N.getOutbox().length <= 50);
const drenati = N.drain();
check("drain() svuota l'outbox restituendo i payload accumulati", drenati.length > 0 && N.getOutbox().length === 0);

console.log("\n[Un transport rotto non blocca il gioco]");
N.setTransport(() => { throw new Error("rete giu'"); });
statoPg.resources.hp.current = 5;
iscrittiStato[0]("hpCurrent");
check("l'emissione con transport che lancia NON propaga l'eccezione", (function () {
  try { N._flushOra(); return true; } catch (e) { return false; }
})());
check("il payload e' comunque finito nell'outbox (recuperabile col drain)", N.getOutbox().length === 1);

console.log("\nRisultato core-net-outbox: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
