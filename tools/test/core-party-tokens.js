// Test dei due fix segnalati dall'utente giocando in hotseat (party di 2):
//  1) "nel party siamo in 2 ma nella mappa vedo solo un player" — a inizio combattimento OGNI
//     membro del roster (pc-party-<id>) deve avere il SUO token alleato sulla griglia, collegato
//     alla FSM (impostaMappaToken), e il token principale deve mostrare il NOME del PG attivo;
//  2) "i nemici quando vengono uccisi devono sparire dalla mappa" — il colpo che uccide un PNG
//     ne rimuove il token dalla griglia (il combattente resta nel tracker come defeated, per
//     XP/loot/riepilogo del Master), e la mappatura FSM viene ripulita.
// Carica i VERI js/04 (state), js/06 (combat), js/08 (token physics), js/18+js/19 (sync+FSM):
// solo il canvas e' stubbato (qui si testa il coordinamento fra moduli, non il rendering).
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Stub browser (pattern di core-combat.js + mapping.js) ----
function nuovoElemento() {
  return {
    textContent: "", value: "", checked: false, children: [], options: [],
    style: { setProperty() {} },
    appendChild(f) { this.children.push(f); return f; }, removeChild() {}, firstChild: null,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }
  };
}
global.window = global;
global.document = {
  readyState: "complete", addEventListener() {},
  getElementById() { return nuovoElemento(); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement: nuovoElemento
};
global.localStorage = (function () { var s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; })();
global.CustomEvent = function (t, o) { this.type = t; this.detail = o && o.detail; };
global.requestAnimationFrame = function () { return 0; };
global.WebSocket = function () { this.readyState = 3; this.send = () => {}; this.close = () => {}; };
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

// Canvas stubbato: griglia 40x30, nessun terreno bloccante (il posizionamento dei token alleati
// evita le celle occupate — qui interessa QUELLO, non il disegno).
window.UltimateVTTCanvas = {
  requestRender() {}, addWorldRenderer() {},
  getGridMetrics: () => ({ gridSize: 48, cellMeters: 1.5, columns: 40, rows: 30 }),
  cellToWorldCenter: (cx, cy) => ({ x: cx * 48 + 24, y: cy * 48 + 24 }),
  isTerrainBlocking: () => false
};

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/04-3-state-manager-pg-statistiche.js");
carica("js/06-patch-due-fasi-colpire-danni.js");
carica("js/08-7-token-physics-drag-drop.js");
carica("js/18-sync-manager.js");
carica("js/19-combat-state-machine.js");

const S = window.UltimateVTTState;
const C = window.UltimateVTTCombat;
const TP = window.UltimateVTTTokenPhysics;
const FSM = window.UltimateVTTCombatFSM;
check("moduli reali caricati (state, combat, token, FSM)", !!S && !!C && !!TP && !!FSM);

function tokens() { return TP.getState().tokens; }
function tokenPerNome(nome) { return tokens().find((t) => t.name === nome) || null; }

// ---- Party hotseat di 2: fanny (attiva) + baz (roster) ----
// hydrate rifiuta stati parziali: si parte dallo stato reale serializzato cambiando solo l'identita'.
function cambiaIdentita(id, nome) {
  const pieno = JSON.parse(S.serialize());
  pieno.identity.id = id;
  pieno.identity.name = nome;
  return S.hydrate(pieno);
}
check("setup: identita' attiva impostata a fanny", cambiaIdentita("id-fanny", "fanny") === true);
window.partyData = [
  { identity: { id: "id-fanny", name: "fanny" } }, // attiva: rappresentata da pc-local/token-pc
  {
    identity: { id: "id-baz", name: "baz" },
    abilities: { str: { score: 12 }, dex: { score: 14 } },
    resources: { armorClass: 13, hp: { max: 8, current: 8 } },
    proficiencyBonus: 2
  }
];

// endCombat() rimanda la pulizia delle mappature orfane al tick successivo (apposta: evita che la
// TokenMappingEvent di pulizia scavalchi via rete l'evento HP dell'uccisione che l'ha causata —
// vedi il commento su endCombat in js/06). Qui serve solo per lasciarla girare prima di asserire.
function tick() { return new Promise((r) => setTimeout(r, 0)); }

(async function principale() {

console.log("\n[1) Ogni membro del party ha il suo token sulla griglia]");
C.addNpc("goblin");
C.startCombat();

check("il combattimento e' attivo con 2 PG + 1 PNG", (function () {
  const cs = C.getState();
  return cs.active === true &&
    cs.combatants.filter((c) => c.kind === "pc").length === 2 &&
    cs.combatants.filter((c) => c.kind === "npc").length === 1;
})());
check("il token principale mostra il NOME del PG attivo (fanny, non 'Eroe Locale')", (function () {
  const t = tokens().find((x) => x.id === "token-pc");
  return t && t.name === "fanny";
})());
const tokenBaz = tokenPerNome("baz");
check("esiste un token alleato per baz (kind 'pc', non un nemico)", !!tokenBaz && tokenBaz.kind === "pc" && tokenBaz.id !== "token-pc");
check("il token di baz e' ACCANTO al PG attivo (cella adiacente libera)", (function () {
  if (!tokenBaz) { return false; }
  const pc = tokens().find((x) => x.id === "token-pc");
  return Math.abs(tokenBaz.cellX - pc.cellX) <= 2 && Math.abs(tokenBaz.cellY - pc.cellY) <= 2 &&
    !(tokenBaz.cellX === pc.cellX && tokenBaz.cellY === pc.cellY);
})());
check("il token di baz e' collegato alla FSM (combattenteAToken risolve)", (function () {
  return tokenBaz && FSM.combattenteAToken("pc-party-id-baz") === tokenBaz.id;
})());
C.endCombat();
await tick();
check("un secondo startCombat NON duplica il token di baz", (function () {
  C.startCombat();
  return tokens().filter((t) => t.name === "baz").length === 1;
})());

console.log("\n[2) Il colpo che uccide un PNG ne rimuove il token dalla griglia]");
// Il PNG viene creato e collegato come farebbe VTTSpawn.spawn (token-extra-N + mappatura esplicita).
const goblin = C.getState().combatants.find((c) => c.kind === "npc");
const tokGoblin = TP.addToken("Goblin", 20, 12, "#8f1d18");
FSM.impostaMappaToken(tokGoblin.id, goblin.id);
check("setup: il goblin ha il suo token mappato sulla griglia", FSM.combattenteAToken(goblin.id) === tokGoblin.id);

C.applyDamageToCombatant(goblin.id, 2); // danno NON letale
check("un danno non letale NON rimuove il token", tokens().some((t) => t.id === tokGoblin.id));

C.applyDamageToCombatant(goblin.id, 9999); // colpo letale
check("il colpo letale rimuove il token del goblin dalla griglia", !tokens().some((t) => t.id === tokGoblin.id));
// Era l'ultimo nemico: la vittoria chiude il combattimento da sola. La pulizia della mappatura
// orfana e' rimandata al tick successivo (vedi commento su endCombat in js/06): qui si attende
// quel tick prima di verificarla, esattamente come accadrebbe nel browser.
await tick();
check("a fine combattimento la mappatura FSM del token rimosso e' ripulita", FSM.getMappa()[tokGoblin.id] === undefined);
check("il goblin resta nel tracker come sconfitto (per XP/loot/riepilogo)", (function () {
  const g = C.getState().combatants.find((c) => c.id === goblin.id);
  return g && g.defeated === true && g.hitPoints === 0;
})());
check("altro danno sul PNG gia' caduto non lancia errori", C.applyDamageToCombatant(goblin.id, 5) === true);
check("il token del PG NON viene mai rimosso da un KO (i PG cadono incoscienti, non spariscono)", (function () {
  // Manda a 0 gli HP di baz: e' un PG, il suo token deve restare (puo' essere rianimato).
  C.startCombat();
  C.applyDamageToCombatant("pc-party-id-baz", 9999);
  return tokens().some((t) => t.name === "baz");
})());

console.log("\n[3) Cambio di scheda attiva: niente token doppi]");
// Ora baz diventa il PG ATTIVO (hotseat switch): token-pc deve rappresentare baz, il suo vecchio
// token da membro va rimosso, e fanny (ora "l'altra") deve ricevere il proprio token alleato.
C.endCombat();
await tick();
check("setup: identita' attiva impostata a baz", cambiaIdentita("id-baz", "baz") === true);
window.partyData = [
  { identity: { id: "id-baz", name: "baz" } },
  {
    identity: { id: "id-fanny", name: "fanny" },
    abilities: { str: { score: 16 }, dex: { score: 14 } },
    resources: { armorClass: 14, hp: { max: 12, current: 12 } },
    proficiencyBonus: 2
  }
];
C.startCombat();
check("dopo lo switch il token principale si chiama baz", (function () {
  const t = tokens().find((x) => x.id === "token-pc");
  return t && t.name === "baz";
})());
check("il VECCHIO token alleato di baz e' stato rimosso (niente doppione)", (function () {
  return tokens().filter((t) => t.name === "baz").length === 1; // solo token-pc
})());
check("fanny (ora non attiva) ha il suo token alleato", (function () {
  const t = tokenPerNome("fanny");
  return !!t && t.kind === "pc" && t.id !== "token-pc";
})());
check("nel tracker non c'e' un combattente doppione del PG attivo (pc-party-id-baz sparito)", (function () {
  return !C.getState().combatants.some((c) => c.id === "pc-party-id-baz");
})());

console.log("\nRisultato core-party-tokens: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);

})().catch((e) => {
  console.error("ECCEZIONE:", e && e.stack || e);
  process.exit(1);
});
