// Test del menu Azione Bonus dinamico (modulo 38): generazione PURA delle opzioni da classe, razza
// e inventario (Regola 2), e loro esecuzione (spesa risorsa, pozione consumata dall'inventario,
// attacco con arma secondaria). Niente stringhe/statistiche hardcodate: le capacità vengono dai
// cataloghi dati.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

global.window = global;
global.document = { readyState: "complete", addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, createElement() { return { style: {}, classList: { add() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} }; }, body: { appendChild() {} } };
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };
window.setInterval = function () { return 0; };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/38-action-menu.js");

const AM = window.UltimateVTTActionMenu;
AM.fermaAggiornamento();
check("UltimateVTTActionMenu esposto", !!AM);

console.log("\n[Generazione pura: opzioni da CLASSE]");
const optGuerriero = AM.opzioniAzioneBonus({ className: "Guerriero", ancestry: "Umano", level: 3, consumabili: [], armaSecondaria: null });
check("il Guerriero riceve 'Recupero Energie' come azione bonus di classe", optGuerriero.some(o => o.id === "second-wind" && o.fonte === "classe"));
const optLadro = AM.opzioniAzioneBonus({ className: "Ladro", ancestry: "Umano", level: 3, consumabili: [], armaSecondaria: null });
check("il Ladro riceve 'Azione Scaltra' (movimento) e NON 'Recupero Energie'", optLadro.some(o => o.id === "cunning-action") && !optLadro.some(o => o.id === "second-wind"));

console.log("\n[Generazione pura: opzioni da RAZZA]");
const optMezzorco = AM.opzioniAzioneBonus({ className: "Mago", ancestry: "Mezzorco", level: 3, consumabili: [], armaSecondaria: null });
check("il Mezzorco riceve una capacità razziale ('Tenacia Feroce')", optMezzorco.some(o => o.id === "relentless" && o.fonte === "razza"));
check("un Mago Mezzorco ha SIA la capacità di classe SIA quella di razza", optMezzorco.some(o => o.fonte === "classe") && optMezzorco.some(o => o.fonte === "razza"));

console.log("\n[Generazione pura: opzioni da INVENTARIO]");
const optZaino = AM.opzioniAzioneBonus({
  className: "Guerriero", ancestry: "Umano", level: 2,
  consumabili: [{ inventoryId: "inv-1", name: "Pozione di Cura", healing: "2d4+2" }],
  armaSecondaria: { name: "Pugnale", damage: "1d4" }
});
check("una pozione curativa nell'inventario genera 'Bevi Pozione di Cura'", optZaino.some(o => o.effetto === "pozione" && o.inventoryId === "inv-1"));
check("un'arma secondaria equipaggiata genera l'attacco bonus", optZaino.some(o => o.effetto === "attaccoSecondario" && /Pugnale/.test(o.etichetta)));
check("senza pozioni né arma secondaria, quelle opzioni NON compaiono", (function () {
  const o = AM.opzioniAzioneBonus({ className: "Guerriero", ancestry: "Umano", level: 2, consumabili: [], armaSecondaria: null });
  return !o.some(x => x.effetto === "pozione") && !o.some(x => x.effetto === "attaccoSecondario");
})());

console.log("\n[Data-driven: i cataloghi sono la fonte, niente hardcode nella logica]");
check("aggiungere una classe al catalogo la rende subito disponibile", (function () {
  AM.CAPACITA_CLASSE["paladino"] = [{ id: "divine-smite-bonus", etichetta: "Punizione", kind: "bonusAction", effetto: "annuncio", descrizione: "test" }];
  const o = AM.opzioniAzioneBonus({ className: "Paladino", ancestry: "Umano", level: 5, consumabili: [], armaSecondaria: null });
  delete AM.CAPACITA_CLASSE["paladino"];
  return o.some(x => x.id === "divine-smite-bonus");
})());

// ---- Esecuzione con stub del gioco ----
console.log("\n[Esecuzione: spesa risorsa + effetti reali]");
let economia = { action: true, bonusAction: true, reaction: true };
let inventario = [{ inventoryId: "inv-1", catalogId: "healingPotion", quantity: 2 }];
let curato = 0, scartato = [];
window.UltimateVTTInventory = {
  itemCatalog: [{ id: "healingPotion", name: "Pozione di Cura", type: "consumable", healing: "2d4+2" }, { id: "dagger", name: "Pugnale", type: "weapon", damage: "1d4" }],
  getState: () => ({ actionEconomy: Object.assign({}, economia), inventory: inventario.map(e => Object.assign({}, e)), equipmentSlots: { offHand: null } }),
  spendActionResource: (k) => { if (!economia[k]) return false; economia[k] = false; return true; },
  dropInventoryItem: (id) => { const e = inventario.find(x => x.inventoryId === id); if (!e) return false; if (e.quantity > 1) e.quantity -= 1; else inventario = inventario.filter(x => x.inventoryId !== id); scartato.push(id); return true; }
};
window.UltimateVTTState = { heal: (n) => { curato += n; }, getState: () => ({ identity: { className: "Guerriero", ancestry: "Umano", level: 4 }, abilities: { wis: { score: 14 } } }) };
window.UltimateVTTCombat = { rollDamageFormula: () => ({ total: 6 }), getState: () => ({ selectedTargetId: "npc-1", combatants: [] }) };

const esitoPozione = AM.esegui({ id: "usa-inv-1", etichetta: "Bevi Pozione di Cura", kind: "bonusAction", fonte: "inventario", effetto: "pozione", inventoryId: "inv-1", formula: "2d4+2" });
check("usare la pozione riesce", esitoPozione === true);
check("la pozione spende l'Azione Bonus", economia.bonusAction === false);
check("la pozione cura HP", curato > 0);
check("la pozione viene consumata dall'inventario (dropInventoryItem chiamato)", scartato.indexOf("inv-1") >= 0);

console.log("\n[Esecuzione: risorsa esaurita -> l'azione bonus è bloccata]");
const esitoBloccato = AM.esegui({ id: "second-wind", etichetta: "Recupero Energie", kind: "bonusAction", fonte: "classe", effetto: "curaSe", formula: "1d10", scalaLivello: true });
check("con la Bonus già spesa, una seconda azione bonus viene rifiutata", esitoBloccato === false);

console.log("\n[Esecuzione: capacità di classe che cura (Recupero Energie)]");
economia.bonusAction = true; curato = 0;
const esitoSecondWind = AM.esegui({ id: "second-wind", etichetta: "Recupero Energie", kind: "bonusAction", fonte: "classe", effetto: "curaSe", formula: "1d10", scalaLivello: true });
check("Recupero Energie riesce e cura (formula + livello)", esitoSecondWind === true && curato > 0);

console.log("\n[contestoCorrente legge classe/razza e inventario reali]");
window.UltimateVTTInventory.getState = () => ({ actionEconomy: { bonusAction: true }, inventory: [{ inventoryId: "inv-9", catalogId: "healingPotion", quantity: 1 }], equipmentSlots: { offHand: "inv-off" } });
window.UltimateVTTInventory.getState = () => ({ actionEconomy: { bonusAction: true }, inventory: [{ inventoryId: "inv-9", catalogId: "healingPotion", quantity: 1 }, { inventoryId: "inv-off", catalogId: "dagger", quantity: 1, equippedSlot: "offHand" }], equipmentSlots: { offHand: "inv-off" } });
const ctx = AM.contestoCorrente();
check("contestoCorrente ricava className/ancestry dallo state manager", ctx.className === "Guerriero" && ctx.ancestry === "Umano");
check("contestoCorrente raccoglie i consumabili curativi dall'inventario", ctx.consumabili.some(c => c.inventoryId === "inv-9"));
check("contestoCorrente riconosce l'arma secondaria equipaggiata", ctx.armaSecondaria && /Pugnale/.test(ctx.armaSecondaria.name));

console.log("\nRisultato core-action-menu: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
