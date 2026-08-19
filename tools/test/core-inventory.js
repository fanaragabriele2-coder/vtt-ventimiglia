// Test del modulo 05 (action economy, inventario, equipaggiamento) sopra il modulo 04 REALE
// (richiede UltimateVTTState): azione/bonus/reazione una volta a turno, budget movimento,
// equip/unequip e calcolo CA, peso/capacita' di trasporto, consumabili.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

global.window = global;
global.document = { readyState: "complete", addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } };
global.localStorage = (function () { var s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; })();
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/04-3-state-manager-pg-statistiche.js");
carica("js/05-4-action-economy-inventario-equipaggiamento.js");

const S = window.UltimateVTTState;
const I = window.UltimateVTTInventory;
check("UltimateVTTInventory esposto", !!I);

console.log("\n[Action economy: una risorsa per turno]");
check("azione disponibile all'inizio", I.getState().actionEconomy.action === true);
check("prima spesa dell'azione riesce", I.spendActionResource("action") === true);
check("seconda spesa nello stesso turno fallisce", I.spendActionResource("action") === false);
check("bonusAction e reaction sono indipendenti dall'azione", I.spendActionResource("bonusAction") === true && I.spendActionResource("reaction") === true);
I.resetTurn();
check("resetTurn ripristina azione/bonus/reazione", I.getState().actionEconomy.action === true && I.getState().actionEconomy.bonusAction === true);
check("resetTurn azzera il movimento usato", I.getState().actionEconomy.movementMetersUsed === 0);

console.log("\n[Budget di movimento]");
S.setSpeedMeters(9);
I.resetTurn();
I.spendActionResource("movement"); // +3
I.spendActionResource("movement"); // +3 = 6
const dopoDue = I.getState().actionEconomy.movementMetersUsed;
check("ogni spendActionResource('movement') aggiunge 3 m (2x = 6)", dopoDue === 6);
I.spendActionResource("movement"); // +3 = 9 (al limite)
I.spendActionResource("movement"); // tenta +3 ma deve clampare a 9 (velocita')
check("il movimento speso non supera la velocita' (clamp a 9m)", I.getState().actionEconomy.movementMetersUsed === 9);

console.log("\n[Equipaggiamento e Classe Armatura]");
// Il PG di default ha Des 12 (mod +1, vedi abilitySpread[0] in createCharacterState): si legge
// dinamicamente per non assumere un valore fisso che dipende dal personaggio di default.
const dexMod = S.calculateAbilityModifier(S.getState().abilities.dex.score);
check("CA di default = armatura cuoio(11) + mod Des + scudo(+2)", I.calculateEquipmentArmorClass() === 11 + dexMod + 2);
const inv = I.addInventoryItem("chainMail", 1);
check("addInventoryItem crea una voce inventario", !!inv && inv.catalogId === "chainMail");
I.equipItem(inv.inventoryId, "armor");
check("equip sostituisce l'armatura nello slot 'armor'", I.getState().equipmentSlots.armor === inv.inventoryId);
check("la vecchia armatura risulta non equipaggiata", (function () {
  const vecchia = I.getState().inventory.find(e => e.catalogId === "leatherArmor");
  return vecchia && vecchia.equippedSlot === null;
})());
// chainMail ha dexCap 0: il mod Des e' clampato a min(dexMod, 0), qualunque sia il suo valore.
check("CA aggiornata con chainMail(16, dexCap 0) + scudo(+2)", I.calculateEquipmentArmorClass() === 16 + Math.min(dexMod, 0) + 2);
check("setArmorClass dello state e' sincronizzata automaticamente", S.getState().resources.armorClass === I.calculateEquipmentArmorClass());

I.unequipItem(inv.inventoryId);
check("dopo unequip lo slot armor torna vuoto", I.getState().equipmentSlots.armor === null);
check("CA torna a 10 + mod Des + scudo(+2) senza armatura", I.calculateEquipmentArmorClass() === 10 + dexMod + 2);

console.log("\n[Peso e capacita' di trasporto]");
const pesoIniziale = I.calculateTotalWeightKg();
check("il peso totale e' positivo con l'equipaggiamento di default", pesoIniziale > 0);
S.setAbilityScore("str", 10);
check("capacita' di trasporto = forza * 15 lb in kg (10*15*0.453592)", Math.abs(I.calculateCarryCapacityKg() - 10 * 15 * 0.453592) < 0.001);

console.log("\n[Oggetti impilabili e consumabili]");
const d1 = I.addInventoryItem("dagger", 1);
const d2 = I.addInventoryItem("dagger", 2);
check("oggetti stackable si accumulano nella stessa voce", d1.inventoryId === d2.inventoryId && d2.quantity === 3);
check("addInventoryItem con id sconosciuto ritorna null", I.addInventoryItem("oggetto-inesistente", 1) === null);

I.addInventoryItem("healingPotion", 1); // si accumula sulla voce "inv-potion" gia' presente (quantity 2+1=3)
const pozione = I.getState().inventory.find(e => e.catalogId === "healingPotion");
const quantitaPrima = pozione.quantity;
S.setMaxHp(30);
S.setCurrentHp(1);
I.resetTurn();
const usata = I.useInventoryItem(pozione.inventoryId);
check("useInventoryItem su un consumabile cura il PG", usata === true && S.getState().resources.hp.current > 1);
check("useInventoryItem consuma l'azione (consumabile = costo azione)", I.getState().actionEconomy.action === false);
const dopoUso = I.getState().inventory.find(e => e.catalogId === "healingPotion");
check("la pozione usata scala la quantita' nello stack (-1)", dopoUso && dopoUso.quantity === quantitaPrima - 1);

console.log("\n[Riposo]");
I.spendActionResource("bonusAction");
I.shortRest();
check("shortRest ripristina l'action economy", I.getState().actionEconomy.bonusAction === true);
S.setCurrentHp(1);
I.longRest();
check("longRest ripristina l'action economy", I.getState().actionEconomy.action === true);

console.log("\nRisultato core-inventory: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
