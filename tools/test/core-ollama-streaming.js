// Test del Task 1 "AI Bridge" (architettura Split-Rig: Ollama gira su un PC remoto in LAN con GPU
// dedicata, il client resta leggero): endpoint configurabile, separazione narrazione/dati per lo
// streaming parola-per-parola, e iniezione del contesto reale del party nel prompt di sistema di
// Ollama (prima presente solo per Groq). Carica il VERO js/12 (non un mock).
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Stub DOM/browser minimale ma permissivo, CON listener funzionanti (serve per poter
// cliccare davvero il pulsante OLLAMA come farebbe l'utente, non solo chiamare l'API interna). ----
function nuovoElemento(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(), id: "", className: "", textContent: "", value: "",
    style: {}, dataset: {}, children: [], options: [], disabled: false, checked: false, hidden: false,
    parentNode: null, _listeners: {},
    appendChild(f) { f.parentNode = this; this.children.push(f); return f; },
    insertBefore(n) { n.parentNode = this; this.children.push(n); return n; },
    removeChild(n) { this.children = this.children.filter((c) => c !== n); return n; },
    remove() { if (this.parentNode) { this.parentNode.removeChild(this); } },
    addEventListener(evento, cb) { (this._listeners[evento] = this._listeners[evento] || []).push(cb); },
    removeEventListener() {},
    dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach((cb) => cb(ev)); return true; },
    click() { (this._listeners.click || []).forEach((cb) => cb({ type: "click", preventDefault() {} })); },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); },
      toggle(c, v) { if (v === false) { this._set.delete(c); } else { this._set.add(c); } },
      contains(c) { return this._set.has(c); }
    },
    focus() {},
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

// Elementi "con nome" che il codice reale cerca per id: un registro condiviso cosi' lo stesso
// nodo (es. il pulsante OLLAMA, o il log della chat) e' sempre lo STESSO oggetto quando richiesto
// piu' volte, permettendo di collegare un listener e poi davvero invocarlo con .click().
const elementiPerId = {};
function elementoPerId(id) {
  if (!elementiPerId[id]) { elementiPerId[id] = nuovoElemento("div"); elementiPerId[id].id = id; }
  return elementiPerId[id];
}

global.document = {
  readyState: "complete",
  addEventListener() {}, removeEventListener() {},
  getElementById: elementoPerId,
  querySelector() { return nuovoElemento("div"); },
  querySelectorAll() { return []; },
  createElement: nuovoElemento,
  createTextNode(t) { return { textContent: String(t) }; },
  body: nuovoElemento("body"),
  head: nuovoElemento("head"),
  documentElement: nuovoElemento("html")
};

let localStorageDati = {};
global.localStorage = {
  getItem: (k) => (k in localStorageDati ? localStorageDati[k] : null),
  setItem: (k, v) => { localStorageDati[k] = String(v); },
  removeItem: (k) => { delete localStorageDati[k]; }
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = () => {};
global.speechSynthesis = { speak() {}, cancel() {}, getVoices() { return []; } };
global.SpeechSynthesisUtterance = function () {};
global.AbortController = function () { this.signal = {}; this.abort = () => {}; };
global.CustomEvent = function (t, o) { this.type = t; this.detail = o && o.detail; };
window.UltimateVTT = { appendSystemLog() {}, registerModule() {}, runSelfDiagnostics: () => null, version: "test" };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }

console.log("Caricamento del VERO js/12...");
carica("js/12-patch-touch-events-per-mobile.js");
check("js/12 si carica senza eccezioni", true);
const CG = window.UltimateVTTCoreGameplay;
check("UltimateVTTCoreGameplay esposto", !!CG);

// ---------------------------------------------------------------------------
// Funzioni pure: separazione narrazione/dati e visibilita' durante lo streaming.
// ---------------------------------------------------------------------------
console.log("\n[Funzioni pure: separaNarrazioneEDati]");
check("separa narrazione e dati quando il separatore e' presente", (function () {
  const r = CG.separaNarrazioneEDati("Le ombre si muovono.\n<<DATI>>\n{\"roll\":{\"die\":20,\"stat\":\"Forza\"}}");
  return r.narrazione === "Le ombre si muovono." && r.dati && r.dati.roll && r.dati.roll.die === 20;
})());
check("senza dati di gioco, il separatore semplicemente non compare (dati null)", (function () {
  const r = CG.separaNarrazioneEDati("Il corridoio prosegue nel buio.");
  return r.narrazione === "Il corridoio prosegue nel buio." && r.dati === null;
})());
check("fallback al vecchio formato JSON unico (compatibilita' con prompt precedenti)", (function () {
  const r = CG.separaNarrazioneEDati('{"reply":"Un vecchio messaggio.","roll":null}');
  return r.narrazione === "Un vecchio messaggio." && r.dati && r.dati.reply === "Un vecchio messaggio.";
})());
check("testo completamente vuoto non lancia eccezioni", (function () {
  try { CG.separaNarrazioneEDati(""); CG.separaNarrazioneEDati(undefined); return true; } catch (e) { return false; }
})());

console.log("\n[Funzioni pure: testoVisibileDuranteStreaming]");
check("prima del separatore, mostra tutto l'accumulato (e' prosa sicura)", CG.testoVisibileDuranteStreaming("Le ombre si m") === "Le ombre si m");
check("una volta comparso il separatore, la bolla si CONGELA (niente JSON grezzo mostrato)", CG.testoVisibileDuranteStreaming("Le ombre si muovono.\n<<DATI>>\n{\"spawn") === "Le ombre si muovono.\n");

console.log("\n[Funzioni pure: estraiContenutoRigaOllama (parsing NDJSON riga per riga)]");
check("estrae il delta da una riga NDJSON valida", CG.estraiContenutoRigaOllama('{"message":{"content":"ciao"},"done":false}') === "ciao");
check("riga vuota/spezzata -> stringa vuota (non lancia)", CG.estraiContenutoRigaOllama("") === "" && CG.estraiContenutoRigaOllama('{"message":{"con') === "");
check("riga finale (done:true, content vuoto) -> stringa vuota", CG.estraiContenutoRigaOllama('{"done":true,"message":{"content":""}}') === "");

// ---------------------------------------------------------------------------
// Host configurabile (architettura Split-Rig): persistito, usato per costruire gli endpoint.
// ---------------------------------------------------------------------------
console.log("\n[Endpoint Ollama configurabile (Split-Rig: server su un PC remoto in LAN)]");
check("di default punta a 127.0.0.1:11434 (compatibilita' con Ollama locale)", CG.getOllamaHost() === "127.0.0.1:11434");
check("getOllamaMasterConfig risolve tagsEndpoint/endpoint dall'host corrente", (function () {
  const cfg = CG.getOllamaMasterConfig();
  return cfg.endpoint === "http://127.0.0.1:11434/api/chat" && cfg.tagsEndpoint === "http://127.0.0.1:11434/api/tags";
})());
CG.setOllamaHost("192.168.1.50:11434");
check("setOllamaHost aggiorna l'host persistito", CG.getOllamaHost() === "192.168.1.50:11434");
check("i nuovi endpoint puntano al PC remoto sulla LAN, non piu' a 127.0.0.1", (function () {
  const cfg = CG.getOllamaMasterConfig();
  return cfg.endpoint === "http://192.168.1.50:11434/api/chat" && cfg.tagsEndpoint === "http://192.168.1.50:11434/api/tags";
})());
check("un host con schema esplicito (http://...) viene rispettato cosi' com'e'", (function () {
  CG.setOllamaHost("http://mio-server.local:9999");
  const cfg = CG.getOllamaMasterConfig();
  const ok = cfg.endpoint === "http://mio-server.local:9999/api/chat";
  CG.setOllamaHost("192.168.1.50:11434"); // ripristina per i test successivi
  return ok;
})());

// ---------------------------------------------------------------------------
// End-to-end REALE: attiva Ollama cliccando il VERO pulsante (come farebbe l'utente), poi
// simula lo streaming NDJSON via fetch stubato, verifica la bolla di chat e il contesto del party.
// ---------------------------------------------------------------------------
console.log("\n[End-to-end: attivazione reale + streaming su fetch stubato + contesto del party]");

window.partyData = [
  { identity: { id: "p1", name: "Fanny", className: "Guerriero", ancestry: "Umano", level: 3 },
    abilities: { str: { score: 16 }, dex: { score: 14 }, con: { score: 15 }, int: { score: 9 }, wis: { score: 13 }, cha: { score: 11 } },
    resources: { hp: { current: 22, max: 28 }, armorClass: 17, speedMeters: 9 }, proficiencyBonus: 2 }
];
window.UltimateVTTState = {
  getState: () => ({ identity: { id: "p1", name: "Fanny", level: 3 }, resources: { hp: { current: 22, max: 28 } }, abilities: {} }),
  calculateAbilityModifier: (v) => Math.floor((v - 10) / 2)
};

// Il modulo 34 (ponte chat->combattimento) verifica, tramite VTTSpawn/UltimateVTTCombat, che il
// campo "spawn" estratto dai <<DATI>> di Ollama arrivi davvero a far comparire i nemici — prova
// che l'intera catena (streaming -> parsing -> gioco) funziona, non solo il parsing isolato.
let spawnChiamati = [];
let combattimentoAttivo = false;
window.UltimateVTTCombat = { getState: () => ({ active: combattimentoAttivo }) };
window.VTTSpawn = { spawn: (lista) => { spawnChiamati.push(lista); combattimentoAttivo = true; return lista.map((e) => e.name); } };
window.UltimateVTTSync = undefined;

let promptSistemaCatturato = "";
const righeNdjsonInviate = [
  '{"message":{"content":"Le "},"done":false}',
  '{"message":{"content":"ombre "},"done":false}',
  '{"message":{"content":"si muovono.\\n"},"done":false}',
  '{"message":{"content":"<<DATI>>\\n"},"done":false}',
  '{"message":{"content":"{\\"spawn\\":[{\\"name\\":\\"Goblin\\",\\"count\\":2}]}"},"done":false}',
  '{"message":{"content":""},"done":true}'
];

function creaBodyStreamStub(righe) {
  let indice = 0;
  return {
    getReader() {
      return {
        read() {
          if (indice >= righe.length) { return Promise.resolve({ done: true, value: undefined }); }
          const testo = righe[indice] + "\n";
          indice += 1;
          return Promise.resolve({ done: false, value: Buffer.from(testo, "utf8") });
        }
      };
    }
  };
}

global.fetch = function (url, opts) {
  if (/\/api\/tags$/.test(String(url))) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }
  if (/\/api\/chat$/.test(String(url))) {
    if (opts && opts.body) {
      try {
        const payload = JSON.parse(opts.body);
        const sysMsg = (payload.messages || []).find((m) => m.role === "system");
        if (sysMsg) { promptSistemaCatturato = sysMsg.content; }
      } catch (e) { /* ignora */ }
    }
    return Promise.resolve({ ok: true, body: creaBodyStreamStub(righeNdjsonInviate) });
  }
  return Promise.reject(new Error("URL non atteso nel test: " + url));
};

(async function principale() {
  // Attivazione REALE: click sul vero pulsante OLLAMA, esattamente come nell'interfaccia.
  document.getElementById("ollamaMasterButton").click();
  const statoDopoClick = CG.getOllamaMasterState();
  check("il click sul pulsante OLLAMA attiva davvero il Master Ollama", statoDopoClick.enabled === true);

  carica("js/34-chat-combat-bridge.js");
  check("il modulo 34 si carica sopra il vero js/12 senza eccezioni", !!window.UltimateVTTChatCombatBridge);

  // Innesca una risposta del Master (via il benvenuto del party, che chiama handlePlayerPrompt
  // internamente): esercita il ramo Ollama REALE con streaming, non un mock isolato.
  CG.triggerPartyWelcome();
  await new Promise((r) => setTimeout(r, 50));
  window.UltimateVTTChatCombatBridge._flush();

  check("il prompt di sistema inviato a Ollama include ORA il contesto reale del party (HP/CA)",
    /Fanny/.test(promptSistemaCatturato) && /HP 22\/28/.test(promptSistemaCatturato) && /CA 17/.test(promptSistemaCatturato));
  check("il prompt chiede il formato a due parti (narrazione + separatore <<DATI>>)",
    promptSistemaCatturato.indexOf("<<DATI>>") >= 0);

  const log = document.getElementById("masterChatLog");
  const bollaFinale = log.children[log.children.length - 1];
  const corpoBolla = bollaFinale && bollaFinale.children.find((c) => c.tagName === "P");
  check("la bolla finale in chat mostra SOLO la narrazione pulita (niente <<DATI>> o JSON grezzo)",
    !!corpoBolla && corpoBolla.textContent.trim() === "Le ombre si muovono." && corpoBolla.textContent.indexOf("<<DATI>>") < 0);
  check("la bolla non e' piu' marcata 'in streaming' a risposta conclusa",
    !bollaFinale.classList.contains("is-streaming"));
  check("lo spawn REALE e' scattato dal campo 'spawn' estratto dallo streaming (2 Goblin)",
    spawnChiamati.length === 1 && spawnChiamati[0][0].name === "Goblin" && spawnChiamati[0][0].count === 2);
  check("il combattimento risulta attivo dopo la risposta in streaming del Master",
    window.UltimateVTTCombat.getState().active === true);

  window.UltimateVTTChatCombatBridge.fermaSampler();
  console.log("\nRisultato core-ollama-streaming: " + passati + " passati, " + falliti + " falliti.");
  process.exit(falliti === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ECCEZIONE:", e && e.stack || e);
  process.exit(1);
});
