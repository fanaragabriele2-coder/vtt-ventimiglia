// Test del modulo 04 (state manager PG): modificatori, saving throw, abilita, clamp HP,
// assorbimento HP temporanei, dadi vita, serialize/hydrate. Carica il modulo REALE (non uno stub):
// e' il cuore matematico del gioco e finora non aveva nessuna copertura automatica.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

global.window = global;
global.document = { readyState: "complete", addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } };
global.localStorage = (function () { var s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } }; })();
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/04-3-state-manager-pg-statistiche.js");

const S = window.UltimateVTTState;
check("UltimateVTTState esposto", !!S);

console.log("\n[Modificatori]");
check("modificatore di 10 = 0", S.calculateAbilityModifier(10) === 0);
check("modificatore di 14 = +2", S.calculateAbilityModifier(14) === 2);
check("modificatore di 8 = -1", S.calculateAbilityModifier(8) === -1);
check("modificatore di 9 arrotonda per difetto a -1 (non a 0)", S.calculateAbilityModifier(9) === -1);
check("formatModifier(3) = '+3'", S.formatModifier(3) === "+3");
check("formatModifier(-2) = '-2'", S.formatModifier(-2) === "-2");
check("formatModifier(0) = '+0'", S.formatModifier(0) === "+0");

console.log("\n[Saving throw e abilita]");
S.setAbilityScore("dex", 16); // mod +3
check("setAbilityScore aggiorna lo score", S.getState().abilities.dex.score === 16);
check("saving throw senza competenza = solo il modificatore (+3)", S.calculateSavingThrowModifier("dex") === 3);
S.setProficiencyBonus(2);
S.setSavingThrowProficiency("dex", true);
check("saving throw CON competenza = mod + bonus competenza (+3+2=5)", S.calculateSavingThrowModifier("dex") === 5);

S.setAbilityScore("wis", 14); // mod +2
S.setSkillProficiency("perception", true);
check("skill con competenza semplice = mod + bonus (2+2=4)", S.calculateSkillModifier("perception") === 4);
S.setSkillExpertise("perception", true);
check("expertise raddoppia il bonus di competenza (2+4=6)", S.calculateSkillModifier("perception") === 6);
check("passiva = 10 + modificatore skill (10+6=16)", S.calculatePassiveSkill("perception") === 16);
S.setSkillProficiency("perception", false);
check("togliere la competenza toglie anche l'expertise (regola D&D)", S.getState().skills.perception.expertise === false);

console.log("\n[HP: danno, cura, HP temporanei, clamp]");
S.setMaxHp(20);
S.setCurrentHp(20);
S.setTemporaryHp(5);
const r1 = S.applyDamage(8);
check("il danno consuma prima gli HP temporanei", r1.absorbedByTemporaryHp === 5);
check("il resto del danno va sugli HP correnti (8-5=3)", r1.appliedToCurrentHp === 3 && r1.currentHp === 17);
check("gli HP temporanei sono azzerati dopo l'assorbimento", S.getState().resources.hp.temporary === 0);

const r2 = S.applyDamage(999);
check("il danno non puo' portare gli HP sotto zero", r2.currentHp === 0);

S.heal(999);
check("la cura non supera il massimo HP", S.getState().resources.hp.current === 20);

S.setMaxHp(10);
check("ridurre il massimo HP clampa anche gli HP correnti", S.getState().resources.hp.current === 10);

console.log("\n[Dadi Vita]");
S.setHitDiceFormula("2d10");
check("formula Dadi Vita valida applicata", S.getState().resources.hitDice.formula === "2d10" && S.getState().resources.hitDice.total === 2);
check("formula non valida e' rifiutata (ritorna false)", S.setHitDiceFormula("xx") === false);
S.setCurrentHp(1);
const spent = S.spendHitDie();
check("spendHitDie restituisce spent:true quando disponibile", spent.spent === true);
check("spendHitDie cura almeno 1 HP (minimo garantito)", spent.healing >= 1);
check("spendHitDie decrementa i Dadi Vita rimanenti", S.getState().resources.hitDice.remaining === 0);
S.setHitDiceRemaining(0);
const noDice = S.spendHitDie();
check("spendHitDie senza dadi rimanenti restituisce spent:false", noDice.spent === false);

console.log("\n[Serialize / Hydrate]");
const snapStr = S.serialize();
check("serialize() restituisce una stringa JSON (non un oggetto)", typeof snapStr === "string");
const snapObj = JSON.parse(snapStr);
const hpAtteso = snapObj.resources.hp.current;
S.setCurrentHp(1);
check("hydrate(stringa) ripristina lo stato serializzato (HP)", (function () {
  S.hydrate(snapStr);
  return S.getState().resources.hp.current === hpAtteso;
})());
check("hydrate(oggetto) funziona altrettanto (accetta entrambe le forme)", (function () {
  S.setCurrentHp(1);
  S.hydrate(snapObj);
  return S.getState().resources.hp.current === hpAtteso;
})());
check("hydrate rifiuta dati incompleti (ritorna false, non lancia)", S.hydrate({ abilities: {} }) === false);

console.log("\nRisultato core-state: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
