// Test del modulo 06 (combat tracker) sopra il modulo 04 REALE: tiro d20 con vantaggio/svantaggio,
// parsing formule di danno, raddoppio dei dadi (non del bonus fisso) sui critici, applicazione
// danno/cura ai combattenti (PG instradato sullo state manager, PNG con HP locali clampati).
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

global.window = global;
global.document = {
  readyState: "complete", addEventListener() {}, getElementById() { return null; },
  querySelector() { return null; }, querySelectorAll() { return []; }
};
global.localStorage = (function () { var s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; })();
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/04-3-state-manager-pg-statistiche.js");
carica("js/06-patch-due-fasi-colpire-danni.js");

const S = window.UltimateVTTState;
const C = window.UltimateVTTCombat;
check("UltimateVTTCombat esposto", !!C);

// Math.random deterministico per i test sui dadi: una coda di valori predefiniti.
const originale = Math.random;
function conSequenza(valori, fn) {
  let i = 0;
  Math.random = () => valori[i++ % valori.length];
  try { return fn(); } finally { Math.random = originale; }
}

console.log("\n[Tiro d20: normale, vantaggio, svantaggio]");
// Math.random()=0.5 -> floor(0.5*20)+1 = 11; 0.9 -> 19; 0.0 -> 1.
check("normale: un solo tiro", conSequenza([0.5, 0.99], () => C.rollD20WithMode("normal").rolls.length) === 1);
check("vantaggio: prende il piu' alto dei due (11 vs 19 -> 19)", conSequenza([0.5, 0.9], () => C.rollD20WithMode("advantage").chosen) === 19);
check("svantaggio: prende il piu' basso dei due (11 vs 19 -> 11)", conSequenza([0.5, 0.9], () => C.rollD20WithMode("disadvantage").chosen) === 11);
check("1 naturale rilevato correttamente", conSequenza([0, 0], () => C.rollD20WithMode("normal").naturalOne) === true);
check("20 naturale rilevato correttamente", conSequenza([0.999, 0.999], () => C.rollD20WithMode("normal").naturalTwenty) === true);

console.log("\n[Parsing formula di danno]");
check("'2d6+3' -> due termini (dadi + fisso)", C.parseDamageFormula("2d6+3").length === 2);
check("'2d6+3': termine dadi corretto (segno+, 2 dadi, 6 facce)", (function () {
  const t = C.parseDamageFormula("2d6+3")[0];
  return t.type === "dice" && t.sign === 1 && t.count === 2 && t.sides === 6;
})());
check("'1d8-1': il modificatore fisso e' negativo", (function () {
  const t = C.parseDamageFormula("1d8-1").find(x => x.type === "flat");
  return t && t.value === -1;
})());
check("formula vuota/non valida ricade su 1d4", (function () {
  const t = C.parseDamageFormula("???")[0];
  return t.type === "dice" && t.count === 1 && t.sides === 4;
})());
check("formula solo fissa '5' produce un termine flat", (function () {
  const terms = C.parseDamageFormula("5");
  return terms.length === 1 && terms[0].type === "flat" && terms[0].value === 5;
})());

console.log("\n[Tiro danno e raddoppio sui critici]");
// Con Math.random()=0 ogni dado vale 1 (floor(0*sides)+1=1). 2d6+3 normale = 2*1+3 = 5.
check("2d6+3 normale = somma dadi(2) + fisso(3) = 5", conSequenza([0], () => C.rollDamageFormula("2d6+3", false).total) === 5);
// Sul critico SOLO i dadi raddoppiano (4 dadi invece di 2), il fisso resta uguale: 4*1+3 = 7.
check("2d6+3 critico raddoppia SOLO i dadi (4*1+3=7, non il fisso)", conSequenza([0], () => C.rollDamageFormula("2d6+3", true).total) === 7);
check("il totale del danno non e' mai negativo (clamp a 0)", conSequenza([0], () => {
  // Formula tutta negativa: i dadi sottratti possono portare il totale sotto zero.
  return C.rollDamageFormula("-3d6", false).total;
}) === 0);

console.log("\n[Il tracker parte SOLO con il PG: nessun nemico finche' non viene evocato]");
check("all'avvio c'e' esattamente 1 combattente (il PG), nessun PNG predefinito", (function () {
  const cs = C.getState();
  return cs.combatants.length === 1 && cs.combatants[0].kind === "pc";
})());
check("nessun bersaglio selezionato di default (non c'e' piu' 'npc-1' fantasma)", C.getState().selectedTargetId == null);

console.log("\n[Applicazione danno/cura ai combattenti]");
// Il PNG ora va creato esplicitamente (come farebbe VTTSpawn.spawn tramite addNpc).
const npcCreato = C.addNpc("goblin");
check("addNpc('goblin') crea un PNG dal bestiario", !!npcCreato && npcCreato.kind === "npc");
const stato = C.getState();
const pcId = stato.combatants.find(c => c.kind === "pc").id;
const npcId = stato.combatants.find(c => c.kind === "npc").id;

S.setMaxHp(20); S.setCurrentHp(20);
check("danno al PG instrada su UltimateVTTState (HP scalati li')", (function () {
  C.applyDamageToCombatant(pcId, 6);
  return S.getState().resources.hp.current === 14;
})());

const npcHpIniziali = C.getState().combatants.find(c => c.id === npcId).hitPoints;
C.applyDamageToCombatant(npcId, 999);
const npcDopo = C.getState().combatants.find(c => c.id === npcId);
check("danno eccessivo a un PNG clampa gli HP a 0 (non negativi)", npcDopo.hitPoints === 0);
check("un PNG a 0 HP risulta sconfitto (defeated:true)", npcDopo.defeated === true);

C.healCombatant(npcId, 999);
const npcCurato = C.getState().combatants.find(c => c.id === npcId);
check("la cura di un PNG non supera i suoi HP massimi", npcCurato.hitPoints === npcCurato.maxHitPoints);
check("applyDamageToCombatant su un id inesistente ritorna false (non lancia)", C.applyDamageToCombatant("non-esiste", 5) === false);

// ============================================================================
// REGOLE DI STATO DEL COMBATTIMENTO (action economy, distanze, multi-party, KO/TPK)
// ============================================================================

// Stub controllabile dell'action economy (modulo 05) e delle posizioni (FSM + token).
let economia = { action: true, bonusAction: true, reaction: true, movementMetersUsed: 0 };
window.UltimateVTTInventory = {
  itemCatalog: [{ id: "shortbow", name: "Arco corto" }, { id: "longsword", name: "Spada lunga" }],
  getState: () => ({ actionEconomy: Object.assign({}, economia), equipmentSlots: { mainHand: armaEquipaggiata }, inventory: inventarioPg }),
  spendActionResource: (k) => { if (k === "movement") return true; if (!economia[k]) return false; economia[k] = false; return true; },
  resetTurn: () => { economia = { action: true, bonusAction: true, reaction: true, movementMetersUsed: 0 }; }
};
let armaEquipaggiata = null;
let inventarioPg = [];
let celleToken = { "token-pc": { x: 0, y: 0 }, "token-gob": { x: 1, y: 0 } };
window.UltimateVTTCombatFSM = { combattenteAToken: (id) => (id === "pc-local" ? "token-pc" : (id === npcId ? "token-gob" : null)) };
window.UltimateVTTTokenPhysics = { getState: () => ({ tokens: Object.keys(celleToken).map(id => ({ id, cellX: celleToken[id].x, cellY: celleToken[id].y })) }) };

console.log("\n[Regola 4: distanza sulla griglia e portata dell'arma]");
check("distanzaCelle usa la metrica di Chebyshev (diagonale compresa)", (function () {
  celleToken["token-gob"] = { x: 3, y: 2 };
  return C.distanzaCelle("pc-local", npcId) === 3;
})());
check("portata in mischia = 1 cella (nessuna arma a distanza equipaggiata)", C.portataArma({ kind: "pc" }) === 1);
check("con un arco in mano principale la portata sale a 12 celle", (function () {
  armaEquipaggiata = "inv-bow"; inventarioPg = [{ inventoryId: "inv-bow", catalogId: "shortbow" }];
  const r = C.portataArma({ kind: "pc" });
  armaEquipaggiata = null; inventarioPg = [];
  return r === 12;
})());
check("i PNG del bestiario hanno portata di mischia (1)", C.portataArma({ kind: "npc" }) === 1);

console.log("\n[Armeria: il bonus di rarita' dell'arma (+N) conta a colpire e nei danni]");
check("un'arma '+2' equipaggiata alza il tiro per colpire e la formula danni del PG", (function () {
  window.UltimateVTTInventory.itemCatalog.push({ id: "spada-magica", name: "Spada Magica", damage: "1d8+2" });
  // Aspettative calcolate dai modificatori REALI del PG nello state manager.
  const st = S.getState();
  const mod = (v) => Math.floor((v - 10) / 2);
  const atkMod = Math.max(mod(st.abilities.str.score), mod(st.abilities.dex.score));
  const prof = st.proficiencyBonus;
  armaEquipaggiata = "inv-magic"; inventarioPg = [{ inventoryId: "inv-magic", catalogId: "spada-magica" }];
  C.rollAllInitiative(); // forza la sincronizzazione del PG dallo state manager + inventario
  const pc = C.getState().combatants.find(c => c.id === "pc-local");
  armaEquipaggiata = null; inventarioPg = [];
  const flatAtteso = atkMod + 2;
  return pc.damageFormula === ("1d8+" + flatAtteso) && pc.attackBonus === prof + atkMod + 2;
})());

console.log("\n[Regola 1: l'attacco del PG spende l'Azione — niente attacchi infiniti]");
// Bersaglio DUREVOLE per i test d'attacco: uno zombie (22 HP) sopravvive al primo colpo — con la
// nuova regola di vittoria, uccidere l'unico nemico chiuderebbe subito lo scontro a metà test.
const zombieTest = C.addNpc("zombie");
window.UltimateVTTCombatFSM = { combattenteAToken: (id) => (id === "pc-local" ? "token-pc" : (id === zombieTest.id ? "token-gob" : null)) };
// Porta il turno al PG (nextTurn resetta l'economia a ogni cambio, come in gioco).
C.startCombat();
let guardia = 0;
while (guardia++ < 10) { const st = C.getState(); if (st.combatants[st.currentTurnIndex] && st.combatants[st.currentTurnIndex].id === "pc-local") break; C.nextTurn(); }
C.getState(); // lo zombie e' il bersaglio selezionato (addNpc lo seleziona da solo)
celleToken["token-gob"] = { x: 1, y: 0 }; // bersaglio adiacente
economia.action = true;
const primoAttacco = conSequenza([0.9, 0.5], () => C.resolveAttack());
check("il primo attacco del turno viene eseguito", primoAttacco !== null);
check("l'attacco ha consumato l'Azione", economia.action === false);
const secondoAttacco = C.resolveAttack();
check("il secondo attacco NELLO STESSO turno viene bloccato", secondoAttacco === null);
check("il blocco spiega che l'Azione e' gia' stata spesa", /Azione già spesa/.test(C.getState().lastEvent));

console.log("\n[Regola 4 applicata: attacco in mischia bloccato fuori portata, senza consumare l'Azione]");
economia.action = true;
celleToken["token-gob"] = { x: 6, y: 0 }; // 6 celle: fuori portata mischia
const attaccoLontano = C.resolveAttack();
check("l'attacco in mischia a 6 celle viene interrotto", attaccoLontano === null);
check("il messaggio riporta distanza e portata", /Fuori portata/.test(C.getState().lastEvent));
check("un attacco impossibile NON consuma l'Azione", economia.action === true);
check("con posizioni ignote (nessun token) l'attacco non viene bloccato dalla distanza", (function () {
  const vecchia = celleToken; celleToken = {};
  const r = conSequenza([0.9, 0.5], () => C.resolveAttack());
  celleToken = vecchia;
  return r !== null;
})());

console.log("\n[Regola 2: TUTTO il party entra in combattimento e tira l'iniziativa]");
C.endCombat();
const basePg = JSON.parse(S.serialize());
basePg.identity.id = "player-1"; basePg.identity.name = "Aria";
S.hydrate(basePg);
window.partyData = [
  JSON.parse(S.serialize()), // il membro ATTIVO (player-1) -> rappresentato da pc-local
  { identity: { id: "player-2", name: "Ligeia" }, proficiencyBonus: 2,
    abilities: { dex: { score: 14 }, str: { score: 10 } },
    resources: { hp: { current: 9, max: 9 }, armorClass: 13 } },
  { identity: { id: "player-3", name: "Doran" }, proficiencyBonus: 2,
    abilities: { dex: { score: 10 }, str: { score: 16 } },
    resources: { hp: { current: 12, max: 12 }, armorClass: 16 } }
];
window.partyData[0].identity.id = "player-1";
C.startCombat();
const inCampo = C.getState().combatants;
check("il membro attivo e' in campo come pc-local", inCampo.some(c => c.id === "pc-local"));
check("Ligeia (player-2) e' in campo come combattente distinto", inCampo.some(c => c.id === "pc-party-player-2" && c.kind === "pc"));
check("Doran (player-3) e' in campo come combattente distinto", inCampo.some(c => c.id === "pc-party-player-3"));
check("il membro attivo NON e' duplicato (nessun pc-party-player-1)", !inCampo.some(c => c.id === "pc-party-player-1"));
check("le statistiche derivano dalla scheda (Ligeia: CA 13, attacco +4 da DES)", (function () {
  const l = inCampo.find(c => c.id === "pc-party-player-2");
  return l.armorClass === 13 && l.attackBonus === 4 && l.hitPoints === 9;
})());
check("TUTTI i PG hanno tirato l'iniziativa (nessuno resta a 0)", inCampo.filter(c => c.kind === "pc").every(c => c.initiative >= 1));

console.log("\n[Regola 5: danni ai membri del party, incoscienza, rialzo e TPK]");
C.applyDamageToCombatant("pc-party-player-2", 4);
check("il danno a Ligeia scala i SUOI HP nel tracker (9-4=5)", C.getState().combatants.find(c => c.id === "pc-party-player-2").hitPoints === 5);
check("il danno persiste nel roster hotseat (window.partyData)", window.partyData[1].resources.hp.current === 5);
C.applyDamageToCombatant("pc-party-player-2", 99);
check("a 0 HP il PG cade INCOSCIENTE (non 'sconfitto' come un PNG)", /INCOSCIENTE/.test(C.getState().lastEvent));
check("il combattimento continua finche' resta almeno un PG in piedi", C.getState().active === true);
check("reviveCombatant rialza Ligeia con 1 HP e la toglie dall'incoscienza", (function () {
  const ok = C.reviveCombatant("pc-party-player-2", 1);
  const l = C.getState().combatants.find(c => c.id === "pc-party-player-2");
  return ok === true && l.hitPoints === 1 && l.defeated === false && window.partyData[1].resources.hp.current === 1;
})());
check("reviveCombatant NON funziona sui PNG (i mostri sconfitti restano sconfitti)", C.reviveCombatant(npcId, 5) === false);

// TPK: tutti i PG a terra contemporaneamente -> resetCombat() chiude subito lo scontro.
C.applyDamageToCombatant("pc-party-player-2", 99);
C.applyDamageToCombatant("pc-party-player-3", 99);
check("con altri PG ancora in piedi (pc-local) il combattimento e' ancora attivo", C.getState().active === true);
C.applyDamageToCombatant("pc-local", 9999);
check("quando ANCHE l'ultimo PG cade, scatta il TPK: resetCombat chiude il combattimento", C.getState().active === false);

console.log("\n[Dopo il TPK: risveglio del party, niente stati 'zombie' a 0 HP]");
check("dopo il TPK il PG locale si risveglia con gli HP pieni (niente vivo-ma-a-0-HP)", (function () {
  const st = window.UltimateVTTState.getState();
  return st.resources.hp.current === st.resources.hp.max;
})());
check("anche i membri del party si risvegliano (HP pieni nel roster hotseat)", (function () {
  return window.partyData[1].resources.hp.current === window.partyData[1].resources.hp.max &&
         window.partyData[2].resources.hp.current === window.partyData[2].resources.hp.max;
})());
check("nel tracker nessun PG resta 'defeated' dopo il risveglio", C.getState().combatants.every(c => c.kind !== "pc" || c.defeated === false));

console.log("\n[Riavvio del combattimento: mai automatico, mai in stato rotto]");
check("nextTurn a combattimento spento NON riavvia lo scontro", (function () {
  C.nextTurn();
  return C.getState().active === false;
})());
check("startCombat con TUTTI i PG incoscienti viene rifiutato", (function () {
  // Riporta a terra tutto il party a combattimento spento (nessun TPK-trigger: combat inattivo).
  window.UltimateVTTState.applyDamage(9999);
  window.partyData[1].resources.hp.current = 0;
  window.partyData[2].resources.hp.current = 0;
  C.startCombat();
  const rifiutato = C.getState().active === false && /incoscienti/i.test(C.getState().lastEvent);
  return rifiutato;
})());
check("dopo una vera rianimazione startCombat riparte normalmente", (function () {
  C.reviveCombatant("pc-local", 5);
  C.startCombat();
  const st = C.getState();
  const ok = st.active === true && st.round === 1;
  C.endCombat();
  return ok;
})());

console.log("\n[VITTORIA: uccisi tutti i nemici, lo scontro finisce DA SOLO]");
C.reviveCombatant("pc-local", 20);
C.startCombat();
check("scenario: combattimento attivo con nemici in campo", C.getState().active === true && C.getState().combatants.some(c => c.kind === "npc" && !c.defeated));
let annunciVittoria = [];
window.UltimateVTTCoreGameplay = { appendChatMessage: (sp, t) => { annunciVittoria.push(t); } };
// Uccidi TUTTI i PNG uno a uno: alla morte dell'ultimo il combattimento deve chiudersi da solo.
C.getState().combatants.filter(c => c.kind === "npc").forEach(n => C.applyDamageToCombatant(n.id, 9999));
check("alla morte dell'ULTIMO nemico il combattimento termina automaticamente", C.getState().active === false);
check("tutti i PNG risultano sconfitti", C.getState().combatants.filter(c => c.kind === "npc").every(c => c.defeated));
check("la vittoria viene annunciata in chat (e la chat del Master riparte)", annunciVittoria.some(t => /VITTORIA/i.test(t)));
check("un danno a un PG fuori combattimento NON genera falsi annunci di vittoria", (function () {
  annunciVittoria = [];
  C.applyDamageToCombatant("pc-local", 1);
  return !annunciVittoria.some(t => /VITTORIA/i.test(t));
})());
window.UltimateVTTCoreGameplay = undefined;

window.partyData = undefined;
console.log("\nRisultato core-combat: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
