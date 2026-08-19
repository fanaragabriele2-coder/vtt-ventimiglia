// Test della mappatura esplicita token<->combattente (modulo 19): override, emissione GM,
// applicazione inbound senza eco, presenza nello stato/snapshot e idratazione.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Stub browser ----
global.window = global;
global.document = { readyState: "complete", addEventListener() {} };
global.CustomEvent = function (t, o) { this.type = t; this.detail = o && o.detail; };
global.requestAnimationFrame = function (cb) { return setTimeout(cb, 0); };

let inviati = [];
global.WebSocket = function (url) {
  this.url = url; this.readyState = 1;
  this.send = (s) => { try { inviati.push(JSON.parse(s)); } catch (e) {} };
  this.close = () => { this.readyState = 3; };
  const self = this;
  setTimeout(() => { if (self.onopen) self.onopen(); }, 0);
};

window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };
let combat = { active: false, round: 0, currentTurnIndex: -1,
  combatants: [ { id: "pc-local", name: "Eroe" }, { id: "npc-1", name: "Goblin" }, { id: "npc-2", name: "Bandito" } ] };
window.UltimateVTTCombat = {
  getState: () => JSON.parse(JSON.stringify(combat)),
  startCombat() {}, endCombat() {}, nextTurn() {}
};
window.UltimateVTTTokenPhysics = {
  getState: () => ({ tokens: [ { id: "token-pc" }, { id: "token-npc-1" }, { id: "token-extra-5" } ] }),
  moveTokenToCell() { return true; }
};
window.UltimateVTTCanvas = { requestRender() {}, addWorldRenderer() {}, getGridMetrics: () => ({ gridSize: 48, cellMeters: 1.5 }) };
window.UltimateVTTState = { getState: () => ({ resources: { speedMeters: 9 } }), serialize: () => ({}) };
window.UltimateVTTInventory = { resetTurn() {}, spendActionResource() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/18-sync-manager.js");
carica("js/19-combat-state-machine.js");

const S = window.UltimateVTTSync;
const F = window.UltimateVTTCombatFSM;

console.log("\n[Euristica di default]");
check("tokenACombattente(token-pc) = pc-local", F.tokenACombattente("token-pc") === "pc-local");
check("combattenteAToken(npc-1) = token-npc-1", F.combattenteAToken("npc-1") === "token-npc-1");
check("token-extra-5 non mappato di default", F.tokenACombattente("token-extra-5") === null);

console.log("\n[Override esplicito]");
F.impostaMappaToken("token-extra-5", "npc-2");
check("override: tokenACombattente(token-extra-5) = npc-2", F.tokenACombattente("token-extra-5") === "npc-2");
check("override: combattenteAToken(npc-2) = token-extra-5", F.combattenteAToken("npc-2") === "token-extra-5");
check("getMappa contiene l'override", F.getMappa()["token-extra-5"] === "npc-2");
check("getStato().mappaToken contiene l'override", F.getStato().mappaToken["token-extra-5"] === "npc-2");

console.log("\n[Autorizzazione GM-only]");
check("MAPPA_TOKEN negato ai giocatori", S.autorizzato(S.creaEvento(S.TipiEvento.MAPPA_TOKEN, {}), S.Ruolo.GIOCATORE, () => true) === false);
check("MAPPA_TOKEN consentito al Master", S.autorizzato(S.creaEvento(S.TipiEvento.MAPPA_TOKEN, {}), S.Ruolo.MASTER, () => true) === true);

console.log("\n[Emissione lato Master]");
S.configura({ ruolo: S.Ruolo.MASTER, idGiocatore: "gm" });
S.connetti("ws://test", { ruolo: S.Ruolo.MASTER, idGiocatore: "gm" });
inviati = [];
F.impostaMappaToken("token-pc", "npc-1"); // riassegna
const ev = inviati.find(m => m.tipo === "TokenMappingEvent");
check("impostaMappaToken emette TokenMappingEvent", !!ev);
check("l'evento porta la mappa completa", !!(ev && ev.payload && ev.payload.mappa && ev.payload.mappa["token-pc"] === "npc-1"));

console.log("\n[impostaMappaCompleta]");
inviati = [];
F.impostaMappaCompleta({ "token-extra-5": "npc-1" });
check("impostaMappaCompleta sostituisce gli override", F.tokenACombattente("token-extra-5") === "npc-1" && !F.getMappa()["token-pc"]);
check("impostaMappaCompleta emette un evento", !!inviati.find(m => m.tipo === "TokenMappingEvent"));

console.log("\n[Applicazione inbound, senza eco]");
S.disconnetti();
S.configura({ ruolo: S.Ruolo.GIOCATORE, idGiocatore: "anna" });
S.connetti("ws://test", { ruolo: S.Ruolo.GIOCATORE, idGiocatore: "anna" });
inviati = [];
S.applicaInbound({ tipo: S.TipiEvento.MAPPA_TOKEN, attore: "gm", ruolo: S.Ruolo.MASTER, seq: 1,
  payload: { mappa: { "token-extra-5": "npc-2", "token-pc": "pc-local" } } });
check("inbound: mappa applicata (token-extra-5 -> npc-2)", F.tokenACombattente("token-extra-5") === "npc-2");
check("inbound: nessuna ri-emissione", !inviati.find(m => m.tipo === "TokenMappingEvent"));

// Evento falsificato da un giocatore: ignorato.
F.impostaMappaCompleta({}); // reset (da giocatore non emette)
S.applicaInbound({ tipo: S.TipiEvento.MAPPA_TOKEN, attore: "intruso", ruolo: S.Ruolo.GIOCATORE, seq: 9,
  payload: { mappa: { "token-pc": "npc-2" } } });
check("inbound da giocatore (non Master) ignorato", F.tokenACombattente("token-pc") === "pc-local");

console.log("\n[Hydration]");
F.impostaMappaCompleta({});
S.applicaInbound({ tipo: S.TipiEvento.SYNC_STATO, attore: "gm", ruolo: S.Ruolo.MASTER, seq: 2,
  payload: { combattimentoFsm: { nome: F.Stati.FUORI, mappaToken: { "token-extra-5": "npc-2" } } } });
check("hydration: mappaToken dallo snapshot applicata", F.tokenACombattente("token-extra-5") === "npc-2");

S.disconnetti();
console.log("\nRisultato mapping: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
