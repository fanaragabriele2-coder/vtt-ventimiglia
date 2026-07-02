// Smoke test: carica i moduli 18/19/20 con stub del browser e dei sottosistemi VTT.
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
global.window = global;          // window.X === global.X
global.document = { readyState: "complete", addEventListener() {} };
global.CustomEvent = function (t, o) { this.type = t; this.detail = o && o.detail; };
global.requestAnimationFrame = function (cb) { return setTimeout(cb, 0); };
global.WebSocket = function () { this.readyState = 0; this.send = () => {}; this.close = () => {}; };

// ---- Stub sottosistemi VTT ----
const moduliRegistrati = {};
window.UltimateVTT = {
  appendSystemLog() {},
  registerModule(n, info) { moduliRegistrati[n] = info; }
};

// Stato combattimento finto
let combat = { active: false, round: 0, currentTurnIndex: -1,
  combatants: [ { id: "pc-local", name: "Eroe", initiative: 0 }, { id: "npc-1", name: "Goblin", initiative: 0 } ] };
window.UltimateVTTCombat = {
  getState: () => JSON.parse(JSON.stringify(combat)),
  startCombat() { combat.active = true; combat.round = 1; combat.currentTurnIndex = 0; },
  endCombat() { combat.active = false; combat.round = 0; combat.currentTurnIndex = -1; },
  nextTurn() {
    if (!combat.active) { this.startCombat(); return; }
    combat.currentTurnIndex = (combat.currentTurnIndex + 1) % combat.combatants.length;
    if (combat.currentTurnIndex === 0) { combat.round += 1; }
  }
};

// Stato token finto
let token = { snapToGrid: true, selectedTokenId: "token-pc", dragTokenId: null, dragStartCell: null,
  tokens: [ { id: "token-pc", name: "Eroe", cellX: 16, cellY: 12, x: 16 * 48 + 24, y: 12 * 48 + 24, hidden: false } ] };
window.UltimateVTTTokenPhysics = {
  getState: () => JSON.parse(JSON.stringify(token)),
  moveTokenToCell(id, cx, cy) {
    const t = token.tokens.find(t => t.id === id);
    if (t) { t.cellX = cx; t.cellY = cy; t.x = cx * 48 + 24; t.y = cy * 48 + 24; }
    return true;
  }
};

let renderers = [];
window.UltimateVTTCanvas = {
  getGridMetrics: () => ({ gridSize: 48, cellMeters: 1.5, columns: 40, rows: 30, scale: 1, offsetX: 0, offsetY: 0 }),
  cellToWorldCenter: (cx, cy) => ({ x: cx * 48 + 24, y: cy * 48 + 24 }),
  worldToScreen: (wx, wy) => ({ x: wx, y: wy }),
  screenToCell: (x, y) => ({ cellX: Math.floor(x / 48), cellY: Math.floor(y / 48) }),
  addWorldRenderer: (r) => renderers.push(r),
  removeWorldRenderer: () => {},
  requestRender: () => {}
};
window.UltimateVTTState = {
  getState: () => ({ resources: { speedMeters: 9 } }),
  serialize: () => ({ resources: { speedMeters: 9 } })
};
let apReset = 0, apSpese = 0;
window.UltimateVTTInventory = { resetTurn() { apReset++; }, spendActionResource() { apSpese++; } };

// ---- Carica i moduli ----
function carica(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
  vm.runInThisContext(code, { filename: rel });
}
console.log("Caricamento moduli...");
try {
  carica("js/18-sync-manager.js");
  carica("js/19-combat-state-machine.js");
  carica("js/20-token-kinematics-network.js");
  check("moduli caricati senza eccezioni", true);
} catch (e) { check("moduli caricati senza eccezioni", false); console.error(e); }

console.log("\n[18] Sync Manager");
const S = window.UltimateVTTSync;
check("UltimateVTTSync esposto", !!S);
check("registerModule(18) chiamato", !!moduliRegistrati[18]);
// Autorita': Master
S.configura({ ruolo: S.Ruolo.MASTER, idGiocatore: "gm1" });
check("Master autorizzato a TurnEnded", S.autorizzato(S.creaEventoTurnoTerminato("pc-local", "npc-1", 1), S.Ruolo.MASTER, () => true));
// Autorita': giocatore
S.configura({ ruolo: S.Ruolo.GIOCATORE, idGiocatore: "p1", tokenPosseduti: ["token-pc"] });
check("Giocatore possiede token-pc", S.possiede("token-pc"));
check("Giocatore NON possiede token-npc-1", !S.possiede("token-npc-1"));
check("Giocatore NON autorizzato a TurnEnded", !S.autorizzato(S.creaEventoTurnoTerminato("pc-local","npc-1",1), S.Ruolo.GIOCATORE, S.possiede));
check("Giocatore autorizzato a muovere token posseduto", S.autorizzato(S.creaEventoTokenMosso("token-pc",1,1), S.Ruolo.GIOCATORE, S.possiede));
// Emit offline = no-op che ritorna true; emit non autorizzato esegue undo
let undoChiamato = false;
const ok = S.emetti(S.creaEventoTurnoTerminato("pc-local","npc-1",1), () => { undoChiamato = true; });
check("emit non autorizzato ritorna false", ok === false);
check("emit non autorizzato esegue undo (rollback)", undoChiamato === true);
check("statoConnessione abilitato=false in offline", S.statoConnessione().abilitato === false);

console.log("\n[20] Kinematics / coordinate");
const K = window.UltimateVTTKinematics;
check("UltimateVTTKinematics esposto", !!K);
const selftest = K.runCoordinateSelfTest();
check("self-test coordinate tutto OK", selftest.ok === true);
check("worldToCell(centro 5,3) === 5,3", (function(){ const c=K.cellToWorldCenter(5,3); const r=K.worldToCell(c.x,c.y); return r.cellX===5&&r.cellY===3; })());
const clamp = K.clampPercorso({cellX:0,cellY:0}, {cellX:10,cellY:0}, 9); // 9m / 1.5 = 6 celle
check("clampPercorso limita a 6 celle (9m)", clamp.cellX === 6 && clamp.cellY === 0);

console.log("\n[19] Combat FSM / action economy");
const F = window.UltimateVTTCombatFSM;
check("UltimateVTTCombatFSM esposto", !!F);
check("stato iniziale FuoriCombattimento", F.getStato().nome === F.Stati.FUORI);
// In single-player Sync e' MASTER per default? Abbiamo impostato GIOCATORE sopra; reimposto MASTER.
S.configura({ ruolo: S.Ruolo.MASTER, idGiocatore: "gm1", tokenPosseduti: null });
F.iniziaCombattimento();
check("dopo inizia: stato CombatActive", F.getStato().nome === F.Stati.ATTIVO);
check("turno corrente = pc-local", F.getStato().turnoId === "pc-local");
check("budget pc-local = 9m residui", F.movimentoResiduo("token-pc") === 9);
const speso = F.spendiMovimento("token-pc", 3);
check("spendiMovimento(3) scala il residuo a 6", speso === 3 && F.movimentoResiduo("token-pc") === 6);
check("AP esistente aggiornata (spendActionResource chiamato)", apSpese >= 1);
F.terminaTurno();
check("dopo terminaTurno: turno = npc-1", F.getStato().turnoId === "npc-1");
F.terminaCombattimento();
check("dopo termina: FuoriCombattimento", F.getStato().nome === F.Stati.FUORI);

// Pulizia interval del sampler per non bloccare il processo
K.fermaSampler();

console.log("\nRisultato: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
