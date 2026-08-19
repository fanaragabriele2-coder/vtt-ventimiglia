// Test del diario di campagna a lungo termine (modulo 32): condensazione pura del digest di
// combattimento, wrapping non invasivo di setUltimoRiepilogoCombattimento/appendChatMessage
// (filtro sui soli level-up) e di VentimigliaMap.goTo/VTTCampagna.goToPlace, tutti convogliati
// verso UltimateVTTCoreGameplay.appendDiarioCampagna.
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
carica("js/32-campaign-memory.js");

const M = window.UltimateVTTCampaignMemory;
M.fermaSampler();
check("UltimateVTTCampaignMemory esposto", !!M);

console.log("\n[Logica pura: condensaDigestCombattimento]");
const digestEsempio = "📋 RIEPILOGO DEL COMBATTIMENTO APPENA CONCLUSO:\nEsito: vittoria del party dopo 3 round; sconfitti: Goblin.\n- Eroe vs Goblin: colpito.\nStato finale del party: Eroe 14/20 HP.";
check("estrae ed etichetta la riga dell'esito", M.condensaDigestCombattimento(digestEsempio) === "⚔️ Combattimento concluso — vittoria del party dopo 3 round; sconfitti: Goblin.");
check("un digest senza riga 'Esito:' ricade su un testo generico", M.condensaDigestCombattimento("testo qualsiasi") === "⚔️ Un combattimento si è concluso.");
check("un digest vuoto/assente produce stringa vuota (nessuna voce da aggiungere)", M.condensaDigestCombattimento("") === "" && M.condensaDigestCombattimento(undefined) === "");

console.log("\n[Wrapping non invasivo: alimenta UltimateVTTCoreGameplay.appendDiarioCampagna]");
let voci = [];
window.UltimateVTTCoreGameplay = {
  appendChatMessage: (speaker, testo) => {},
  setUltimoRiepilogoCombattimento: (testo) => {},
  appendDiarioCampagna: (testo) => { voci.push(testo); }
};
M._tick(); // avvolge le funzioni sopra

console.log("\n[Canale 1: setUltimoRiepilogoCombattimento -> digest condensato nel diario]");
window.UltimateVTTCoreGameplay.setUltimoRiepilogoCombattimento(digestEsempio);
check("la chiamata originale resta intercettabile (il wrap non la sostituisce silenziosamente)", voci.length === 1);
check("il diario riceve il digest condensato, non quello completo", voci[0] === "⚔️ Combattimento concluso — vittoria del party dopo 3 round; sconfitti: Goblin.");

console.log("\n[Canale 2: appendChatMessage -> SOLO i messaggi di level-up entrano nel diario]");
voci = [];
window.UltimateVTTCoreGameplay.appendChatMessage("system", "⭐ LIVELLO 3! Eroe sale di livello: +6 HP max, competenza +1.");
check("un messaggio di level-up entra nel diario (senza l'emoji duplicata)", voci.length === 1 && voci[0] === "🌟 LIVELLO 3! Eroe sale di livello: +6 HP max, competenza +1.");
window.UltimateVTTCoreGameplay.appendChatMessage("system", "✨ +50 XP — sconfitto Goblin (Eroe).");
window.UltimateVTTCoreGameplay.appendChatMessage("player", "Attacco ancora!");
window.UltimateVTTCoreGameplay.appendChatMessage("system", "⭐ non e' davvero un level-up ma non inizia esattamente cosi'"); // non matcha il prefisso esatto? verifichiamo sotto
check("un messaggio 'system' generico NON entra nel diario (gia' bufferizzato altrove dal modulo 29)", voci.length === 1);

console.log("\n[Canale 3: VentimigliaMap.goTo -> spostamento registrato nel diario]");
voci = [];
let chiamateGoTo = 0;
window.VentimigliaMap = { goTo: function (nome) { chiamateGoTo++; } };
M._tick(); // avvolge goTo
window.VentimigliaMap.goTo("Porto Turistico");
check("VentimigliaMap.goTo resta chiamabile normalmente (side-effect originale preservato)", chiamateGoTo === 1);
check("lo spostamento entra nel diario col nome del luogo", voci.length === 1 && voci[0] === "🧭 Il gruppo si sposta verso Porto Turistico.");

console.log("\n[Canale 3bis: VTTCampagna.goToPlace -> stesso comportamento, usa il valore di ritorno se e' una stringa]");
voci = [];
window.VTTCampagna = { goToPlace: function (nome) { return nome === "città alta" ? "Città Alta" : null; } };
M._tick(); // avvolge goToPlace
window.VTTCampagna.goToPlace("città alta"); // la funzione reale fa match fuzzy e ritorna la forma canonica
check("lo spostamento via Campagna usa il nome canonico restituito dalla funzione originale (non l'input grezzo)", voci.length === 1 && voci[0] === "🧭 Il gruppo si sposta verso Città Alta.");

voci = [];
window.VTTCampagna.goToPlace("luogo inesistente"); // ritorna null: nessun match, nessuna voce
check("un luogo non risolto (ritorno null) non produce una voce nel diario", voci.length === 0);

console.log("\n[Wrapping idempotente: un secondo tick non avvolge due volte le stesse funzioni]");
voci = [];
M._tick();
M._tick();
window.VentimigliaMap.goTo("Stazione FS");
check("dopo piu' tick, goTo produce UNA sola voce (non e' stata avvolta piu' volte)", voci.length === 1);

M.fermaSampler();
console.log("\nRisultato core-campaign-memory: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
