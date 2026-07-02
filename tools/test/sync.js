// Test mirato: #1 turni autorevoli inbound (lato giocatore) + #2 hydration mid-game + #5 interpolazione.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(nome, cond) {
  if (cond) { passati++; console.log("  OK  " + nome); }
  else { falliti++; console.log("  FAIL " + nome); }
}

// ---- Stub browser ----
global.window = global;
global.document = { readyState: "complete", addEventListener() {} };
global.CustomEvent = function (t, o) { this.type = t; this.detail = o && o.detail; };
global.requestAnimationFrame = function (cb) { return setTimeout(cb, 0); };
global.WebSocket = function () { this.readyState = 0; this.send = () => {}; this.close = () => {}; };

// ---- Stub sottosistemi VTT ----
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

// Stato del PG con hydrate() reale (verifichiamo che venga chiamato e applicato).
let pgState = { resources: { speedMeters: 9, hp: 10 } };
window.UltimateVTTState = {
  getState: () => JSON.parse(JSON.stringify(pgState)),
  serialize: () => JSON.parse(JSON.stringify(pgState)),
  hydrate: (s) => { pgState = JSON.parse(JSON.stringify(typeof s === "string" ? JSON.parse(s) : s)); }
};

// Combat locale (per il giocatore resta inattivo: la FSM e' autorevole via eventi).
let combat = { active: false, round: 0, currentTurnIndex: -1,
  combatants: [ { id: "pc-local", name: "Eroe", initiative: 0 }, { id: "npc-1", name: "Goblin", initiative: 0 } ] };
window.UltimateVTTCombat = {
  getState: () => JSON.parse(JSON.stringify(combat)),
  startCombat() { combat.active = true; combat.round = 1; combat.currentTurnIndex = 0; },
  endCombat() { combat.active = false; combat.round = 0; combat.currentTurnIndex = -1; },
  nextTurn() { if (!combat.active) { this.startCombat(); return; }
    combat.currentTurnIndex = (combat.currentTurnIndex + 1) % combat.combatants.length;
    if (combat.currentTurnIndex === 0) combat.round += 1; }
};

// Token locali (set di default condiviso). moveTokenToCell aggiorna le celle e registra animated.
let token = { snapToGrid: true, selectedTokenId: "token-pc", dragTokenId: null, dragStartCell: null,
  tokens: [
    { id: "token-pc", name: "Eroe", cellX: 16, cellY: 12, x: 0, y: 0, hidden: false },
    { id: "token-npc-1", name: "Goblin", cellX: 20, cellY: 12, x: 0, y: 0, hidden: false }
  ] };
let ultimoMove = null;
window.UltimateVTTTokenPhysics = {
  getState: () => JSON.parse(JSON.stringify(token)),
  moveTokenToCell(id, cx, cy, animated) {
    ultimoMove = { id: id, cx: cx, cy: cy, animated: animated };
    const t = token.tokens.find(t => t.id === id); if (t) { t.cellX = cx; t.cellY = cy; } return !!t;
  }
};
window.UltimateVTTCanvas = {
  getGridMetrics: () => ({ gridSize: 48, cellMeters: 1.5, columns: 40, rows: 30, scale: 1, offsetX: 0, offsetY: 0 }),
  cellToWorldCenter: (cx, cy) => ({ x: cx * 48 + 24, y: cy * 48 + 24 }),
  worldToScreen: (wx, wy) => ({ x: wx, y: wy }),
  screenToCell: (x, y) => ({ cellX: Math.floor(x / 48), cellY: Math.floor(y / 48) }),
  addWorldRenderer: () => {}, removeWorldRenderer: () => {}, requestRender: () => {}
};
window.UltimateVTTInventory = { resetTurn() {}, spendActionResource() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/18-sync-manager.js");
carica("js/19-combat-state-machine.js");
carica("js/20-token-kinematics-network.js");

const S = window.UltimateVTTSync;
const F = window.UltimateVTTCombatFSM;
const K = window.UltimateVTTKinematics;

// === Configura il client come GIOCATORE che possiede solo token-pc ===
S.configura({ ruolo: S.Ruolo.GIOCATORE, idGiocatore: "anna", tokenPosseduti: ["token-pc"] });

console.log("\n[#1] Turni autorevoli — eventi inbound dal Master");
check("stato iniziale FuoriCombattimento", F.getStato().nome === F.Stati.FUORI);

// Il Master inizia il combattimento: il giocatore lo riceve e allinea i turni.
S.applicaInbound({
  tipo: S.TipiEvento.COMBATTIMENTO_INIZIATO, attore: "master", ruolo: S.Ruolo.MASTER, seq: 1,
  payload: { attivo: true, turnoCorrenteId: "npc-1", round: 1,
    combattenti: [ { id: "npc-1", name: "Goblin", initiative: 18 }, { id: "pc-local", name: "Eroe", initiative: 7 } ] }
});
check("dopo CombatStarted inbound: stato ATTIVO", F.getStato().nome === F.Stati.ATTIVO);
check("turno corrente dettato dal Master = npc-1", F.getStato().turnoId === "npc-1");
check("round dettato dal Master = 1", F.getStato().round === 1);
check("NON e' il turno del PG (token-pc)", F.eIlTurnoDi("token-pc") === false);
check("il giocatore NON puo' muovere fuori turno", F.puoMuovereOra("token-pc") === false);
check("budget costruito dall'ordine autorevole (pc-local 9m)", F.movimentoResiduo("token-pc") === 9);

// Il Master termina il turno del Goblin: ora tocca al PG.
S.applicaInbound({
  tipo: S.TipiEvento.TURNO_TERMINATO, attore: "master", ruolo: S.Ruolo.MASTER, seq: 2,
  payload: { da: "npc-1", a: "pc-local", round: 1 }
});
check("dopo TurnEnded inbound: turno = pc-local", F.getStato().turnoId === "pc-local");
check("ora E' il turno del PG", F.eIlTurnoDi("token-pc") === true);
check("ora il giocatore PUO' muovere il proprio token", F.puoMuovereOra("token-pc") === true);

// Evento non autorizzato (giocatore che finge un TurnEnded) deve essere ignorato in inbound.
const turnoPrima = F.getStato().turnoId;
S.applicaInbound({
  tipo: S.TipiEvento.TURNO_TERMINATO, attore: "intruso", ruolo: S.Ruolo.GIOCATORE, seq: 99,
  payload: { da: "pc-local", a: "npc-1", round: 5 }
});
check("TurnEnded da un giocatore (non Master) ignorato in inbound", F.getStato().turnoId === turnoPrima);

console.log("\n[#2] Hydration mid-game — StateSyncEvent");
// Reset locale: simula un client appena entrato, disallineato dal Master.
token.tokens.forEach(t => { t.cellX = 0; t.cellY = 0; });
pgState = { resources: { speedMeters: 9, hp: 3 } };

// Snapshot autorevole inviato dal Master (stato PG, posizioni token, combattimento + FSM).
const snapshot = {
  stato: { resources: { speedMeters: 9, hp: 27 } },
  token: { tokens: [
    { id: "token-pc", cellX: 5, cellY: 8 },
    { id: "token-npc-1", cellX: 11, cellY: 9 },
    { id: "token-extra-7", cellX: 30, cellY: 30 } // non presente localmente: va solo segnalato
  ] },
  combattimento: { active: true, round: 2, currentTurnIndex: 0,
    combatants: [ { id: "pc-local", name: "Eroe", initiative: 15 }, { id: "npc-1", name: "Goblin", initiative: 9 } ] },
  combattimentoFsm: { nome: F.Stati.ATTIVO, turnoId: "pc-local", round: 2, gmOverride: false,
    budget: { "pc-local": { velocita: 9, usato: 3 }, "npc-1": { velocita: 9, usato: 0 } } }
};
S.applicaInbound({ tipo: S.TipiEvento.SYNC_STATO, attore: "master", ruolo: S.Ruolo.MASTER, seq: 3, payload: snapshot });

check("hydration: stato PG idratato (hp 27)", window.UltimateVTTState.getState().resources.hp === 27);
const tpc = token.tokens.find(t => t.id === "token-pc");
const tnpc = token.tokens.find(t => t.id === "token-npc-1");
check("hydration: token-pc riposizionato a (5,8)", tpc.cellX === 5 && tpc.cellY === 8);
check("hydration: token-npc-1 riposizionato a (11,9)", tnpc.cellX === 11 && tnpc.cellY === 9);
check("hydration: FSM ATTIVO con turno pc-local", F.getStato().nome === F.Stati.ATTIVO && F.getStato().turnoId === "pc-local");
check("hydration: round allineato a 2", F.getStato().round === 2);
check("hydration: budget speso ripristinato (residuo pc-local = 6m)", F.movimentoResiduo("token-pc") === 6);

// Hydration con il Master come ruolo: deve essere un no-op (la fonte non si auto-idrata).
S.configura({ ruolo: S.Ruolo.MASTER, idGiocatore: "gm" });
const hpPrima = window.UltimateVTTState.getState().resources.hp;
S.applicaSnapshot({ stato: { resources: { speedMeters: 9, hp: 1 } } });
check("hydration ignorata quando il ruolo locale e' Master", window.UltimateVTTState.getState().resources.hp === hpPrima);

console.log("\n[#5] Interpolazione movimenti remoti");
// Un TokenMovedEvent di anteprima ricevuto da un altro client deve essere applicato ANIMATO
// (animated=true) per scivolare fluido invece di teletrasportarsi.
ultimoMove = null;
S.applicaInbound({
  tipo: S.TipiEvento.TOKEN_MOSSO, attore: "master", ruolo: S.Ruolo.MASTER, seq: 4,
  payload: { tokenId: "token-npc-1", cellaX: 14, cellaY: 7, anteprima: true }
});
check("inbound TokenMoved (anteprima) applicato", ultimoMove && ultimoMove.id === "token-npc-1");
check("movimento remoto di anteprima e' ANIMATO (interpolato)", ultimoMove && ultimoMove.animated === true);
ultimoMove = null;
S.applicaInbound({
  tipo: S.TipiEvento.TOKEN_MOSSO, attore: "master", ruolo: S.Ruolo.MASTER, seq: 5,
  payload: { tokenId: "token-npc-1", cellaX: 15, cellaY: 7, anteprima: false }
});
check("movimento remoto finale e' ANIMATO (assestamento fluido)", ultimoMove && ultimoMove.animated === true);

K.fermaSampler();
console.log("\nRisultato: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
