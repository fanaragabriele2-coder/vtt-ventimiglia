// Test del routing di rete dei sistemi di gioco (modulo 22): HP/danni, nebbia, spawn.
// Verifica emissione lato Master, applicazione inbound (senza ri-emissione) e autorizzazione GM-only.
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

// WebSocket che cattura i messaggi inviati e si apre subito.
let inviati = [];
global.WebSocket = function (url) {
  this.url = url; this.readyState = 1; // OPEN
  this.send = (s) => { try { inviati.push(JSON.parse(s)); } catch (e) {} };
  this.close = () => { this.readyState = 3; };
  const self = this;
  setTimeout(() => { if (self.onopen) self.onopen(); }, 0);
};

window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

// ---- Stub dei sottosistemi con spie ----
let dmg = [], heal = [];
window.UltimateVTTCombat = {
  npcCatalog: [{ id: "goblin", name: "Goblin" }],
  getState: () => ({ active: true, combatants: [{ id: "npc-1", name: "Goblin", hitPoints: 7 }] }),
  startCombat() {}, addNpc() {},
  applyDamageToCombatant(id, amount) { dmg.push({ id, amount }); return true; },
  healCombatant(id, amount) { heal.push({ id, amount }); return true; }
};
let fog = [];
window.UltimateVTTCanvas = {
  revealCircle(x, y, r) { fog.push({ tipo: "rivela", x, y, r }); },
  hideCircle(x, y, r) { fog.push({ tipo: "nascondi", x, y, r }); },
  fillFog(hidden) { fog.push({ tipo: "riempi", hidden }); }
};
let spawnChiamate = [];
window.VTTSpawn = { spawn(list) { spawnChiamate.push(list); return ["Goblin"]; }, idFor() { return "goblin"; } };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/18-sync-manager.js");
carica("js/22-network-game-events.js");

const S = window.UltimateVTTSync;
const NE = window.UltimateVTTNetEvents;
check("UltimateVTTNetEvents esposto", !!NE);
check("nuovi TipiEvento presenti", S.TipiEvento.HP_AGGIORNATO === "CombatantHpEvent" && S.TipiEvento.NEMICO_GENERATO === "EnemySpawnedEvent");

console.log("\n[Autorizzazione] eventi GM-only");
check("HP e' GM-only (player NON autorizzato)",
  S.autorizzato(S.creaEvento(S.TipiEvento.HP_AGGIORNATO, {}), S.Ruolo.GIOCATORE, () => true) === false);
check("Spawn e' GM-only (player NON autorizzato)",
  S.autorizzato(S.creaEvento(S.TipiEvento.NEMICO_GENERATO, {}), S.Ruolo.GIOCATORE, () => true) === false);
check("Nebbia e' GM-only (player NON autorizzato)",
  S.autorizzato(S.creaEvento(S.TipiEvento.NEBBIA_RIVELATA, {}), S.Ruolo.GIOCATORE, () => true) === false);
check("HP autorizzato per il Master",
  S.autorizzato(S.creaEvento(S.TipiEvento.HP_AGGIORNATO, {}), S.Ruolo.MASTER, () => true) === true);

console.log("\n[Emissione lato Master] le azioni locali producono eventi di rete");
S.connetti("ws://test", { ruolo: S.Ruolo.MASTER, idGiocatore: "gm" });
inviati = [];
window.UltimateVTTCombat.applyDamageToCombatant("npc-1", 5);
const evDanno = inviati.find(m => m.tipo === "CombatantHpEvent");
check("danno locale -> CombatantHpEvent emesso", !!evDanno && evDanno.payload.azione === "danno" && evDanno.payload.id === "npc-1" && evDanno.payload.amount === 5);
check("danno applicato anche in locale", dmg.length === 1);

inviati = [];
window.UltimateVTTCanvas.revealCircle(18, 12, 4);
check("rivela nebbia (raggio>=1) -> FogRevealedEvent emesso", !!inviati.find(m => m.tipo === "FogRevealedEvent" && m.payload.azione === "rivela"));
inviati = [];
window.UltimateVTTCanvas.revealCircle(3, 3, 0); // raggio 0: idratazione interna, NON instradare
check("rivela a raggio 0 NON emette (anti-flood idratazione)", !inviati.find(m => m.tipo === "FogRevealedEvent"));

inviati = [];
window.VTTSpawn.spawn([{ name: "goblin", count: 2 }]);
const evSpawn = inviati.find(m => m.tipo === "EnemySpawnedEvent");
check("spawn locale -> EnemySpawnedEvent emesso con la lista", !!evSpawn && Array.isArray(evSpawn.payload.list) && evSpawn.payload.list[0].count === 2);

console.log("\n[Applicazione inbound] dal Master, senza ri-emissione");
// Reset spie e passa a un client giocatore che riceve dal Master.
dmg = []; heal = []; fog = []; spawnChiamate = [];
S.disconnetti();
S.configura({ ruolo: S.Ruolo.GIOCATORE, idGiocatore: "anna" });
S.connetti("ws://test", { ruolo: S.Ruolo.GIOCATORE, idGiocatore: "anna" });
inviati = [];

S.applicaInbound({ tipo: S.TipiEvento.HP_AGGIORNATO, attore: "gm", ruolo: S.Ruolo.MASTER, seq: 1, payload: { azione: "danno", id: "npc-1", amount: 6 } });
check("HP inbound applicato (applyDamageToCombatant chiamato)", dmg.length === 1 && dmg[0].id === "npc-1" && dmg[0].amount === 6);

S.applicaInbound({ tipo: S.TipiEvento.HP_AGGIORNATO, attore: "gm", ruolo: S.Ruolo.MASTER, seq: 2, payload: { azione: "cura", id: "npc-1", amount: 3 } });
check("HP inbound (cura) applicato (healCombatant chiamato)", heal.length === 1 && heal[0].amount === 3);

S.applicaInbound({ tipo: S.TipiEvento.NEBBIA_RIVELATA, attore: "gm", ruolo: S.Ruolo.MASTER, seq: 3, payload: { azione: "rivela", cellX: 5, cellY: 6, radius: 3 } });
check("Nebbia inbound applicata (revealCircle chiamato)", fog.length === 1 && fog[0].tipo === "rivela" && fog[0].x === 5);

S.applicaInbound({ tipo: S.TipiEvento.NEMICO_GENERATO, attore: "gm", ruolo: S.Ruolo.MASTER, seq: 4, payload: { list: [{ name: "goblin", count: 1 }] } });
check("Spawn inbound applicato (VTTSpawn.spawn chiamato)", spawnChiamate.length === 1);

check("nessuna ri-emissione durante l'applicazione inbound", inviati.filter(m => /CombatantHpEvent|FogRevealedEvent|EnemySpawnedEvent/.test(m.tipo)).length === 0);

// Evento GM-only falsificato da un giocatore: ignorato in inbound.
dmg = [];
S.applicaInbound({ tipo: S.TipiEvento.HP_AGGIORNATO, attore: "intruso", ruolo: S.Ruolo.GIOCATORE, seq: 9, payload: { azione: "danno", id: "npc-1", amount: 99 } });
check("HP inbound da un giocatore (non Master) ignorato", dmg.length === 0);

S.disconnetti();
console.log("\nRisultato game-events: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
