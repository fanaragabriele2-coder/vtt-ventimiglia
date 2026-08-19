// Test del cambio automatico alla griglia tattica a inizio combattimento (modulo 31): rileva la
// transizione "combattimento assente -> attivo" e forza deactivate() sulle altre due superfici
// (mappa reale di Ventimiglia e Campagna fullscreen), senza ri-attivare a ogni tick e senza
// lanciare se quelle superfici non sono presenti.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

global.window = global;
global.document = { readyState: "complete", addEventListener() {} };
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/31-combat-view-autoswitch.js");

const M = window.UltimateVTTCombatViewSwitch;
M.fermaSampler();
check("UltimateVTTCombatViewSwitch esposto", !!M);
check("nessuna commutazione all'avvio", M.numeroCommutazioni() === 0);

console.log("\n[Nessuna superficie da commutare: non lancia]");
let combatState = { active: false };
window.UltimateVTTCombat = { getState: () => combatState };
check("un tick senza combattimento attivo non lancia e non commuta", (function () {
  M._tick();
  return M.numeroCommutazioni() === 0;
})());

console.log("\n[Transizione a combattimento attivo: forza il ritorno alla griglia]");
let chiamateVentimiglia = 0, chiamateCampagna = 0;
window.VentimigliaMap = { deactivate: () => { chiamateVentimiglia++; } };
window.VTTCampagna = { deactivate: () => { chiamateCampagna++; } };
combatState = { active: true };
M._tick();
check("VentimigliaMap.deactivate() viene chiamata alla transizione", chiamateVentimiglia === 1);
check("VTTCampagna.deactivate() viene chiamata alla transizione", chiamateCampagna === 1);
check("numeroCommutazioni incrementa di 1", M.numeroCommutazioni() === 1);

console.log("\n[Tick successivi con combattimento ancora attivo: nessuna ri-commutazione]");
M._tick();
M._tick();
check("nessuna chiamata aggiuntiva finche' il combattimento resta attivo", chiamateVentimiglia === 1 && chiamateCampagna === 1);
check("numeroCommutazioni resta 1", M.numeroCommutazioni() === 1);

console.log("\n[Fine e nuovo inizio del combattimento: si riarma e commuta di nuovo]");
combatState = { active: false };
M._tick();
combatState = { active: true };
M._tick();
check("una nuova transizione attivo->inattivo->attivo ricommuta", chiamateVentimiglia === 2 && chiamateCampagna === 2);
check("numeroCommutazioni sale a 2", M.numeroCommutazioni() === 2);

console.log("\n[Superfici assenti: nessuna eccezione]");
delete window.VentimigliaMap;
delete window.VTTCampagna;
combatState = { active: false };
M._tick();
combatState = { active: true };
check("senza VentimigliaMap/VTTCampagna presenti, la transizione non lancia comunque", (function () {
  try { M._tick(); return true; } catch (e) { return false; }
})());
check("numeroCommutazioni continua a salire anche senza superfici da commutare", M.numeroCommutazioni() === 3);

console.log("\n[UltimateVTTCombat assente o che lancia: nessuna eccezione]");
delete window.UltimateVTTCombat;
check("senza UltimateVTTCombat il tick non lancia", (function () { try { M._tick(); return true; } catch (e) { return false; } })());
window.UltimateVTTCombat = { getState: () => { throw new Error("boom"); } };
check("con getState() che lancia, il tick non propaga l'eccezione", (function () { try { M._tick(); return true; } catch (e) { return false; } })());

M.fermaSampler();
console.log("\nRisultato core-combat-view-autoswitch: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
