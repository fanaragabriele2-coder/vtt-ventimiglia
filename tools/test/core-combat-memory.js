// Test della memoria di combattimento per il Master IA (modulo 29): logica pura (esito, digest),
// ciclo di vita completo (avvio -> eventi -> sconfitte -> fine -> riepilogo iniettato nella memoria
// dell'IA), cattura degli eventi via due percorsi indipendenti (lastEvent + wrap di
// appendChatMessage), rete di sicurezza sulle sconfitte, e troncamento del digest.
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
carica("js/29-combat-memory.js");

const M = window.UltimateVTTCombatMemory;
M.fermaSampler();
check("UltimateVTTCombatMemory esposto", !!M);

console.log("\n[Logica pura: costruisciEsito]");
check("tutti i PNG sconfitti, party vivo -> vittoria", M.costruisciEsito([
  { kind: "pc", defeated: false }, { kind: "npc", defeated: true }, { kind: "npc", defeated: true }
]) === "vittoria del party");
check("tutti i PG sconfitti -> sconfitta", M.costruisciEsito([
  { kind: "pc", defeated: true }, { kind: "npc", defeated: false }
]) === "sconfitta del party");
check("nessuno completamente sconfitto -> interrotto", M.costruisciEsito([
  { kind: "pc", defeated: false }, { kind: "npc", defeated: false }
]) === "combattimento interrotto");

console.log("\n[Logica pura: costruisciDigest]");
const digestBase = M.costruisciDigest({ round: 3, combatants: [
  { kind: "pc", name: "Eroe", hitPoints: 14, maxHitPoints: 20, defeated: false },
  { kind: "npc", name: "Goblin", hitPoints: 0, maxHitPoints: 7, defeated: true }
] });
check("il digest contiene l'esito e il numero di round", /vittoria del party dopo 3 round/.test(digestBase));
check("il digest elenca i nomi dei sconfitti", /sconfitti: Goblin/.test(digestBase));
check("il digest riporta lo stato finale del party (HP)", /Eroe 14\/20 HP/.test(digestBase));

console.log("\n[Ciclo di vita completo con eventi + sconfitte + XP/oro]");
let combatState = { active: false, round: 0, lastEvent: "", combatants: [] };
window.UltimateVTTCombat = { getState: () => JSON.parse(JSON.stringify(combatState)) };
let progressione = { xp: 100, gold: 5, level: 1 };
window.UltimateVTTState = { getState: () => ({ identity: { id: "pc-local" } }) };
window.VTTProgression = { getProg: (id) => (id === "pc-local" ? JSON.parse(JSON.stringify(progressione)) : { xp: 0, gold: 0, level: 1 }) };
let messaggiSystemInviati = [];
let memoriaNotificata = [];
let riepilogoImpostato = null;
window.UltimateVTTCoreGameplay = {
  appendChatMessage: (speaker, testo) => { if (speaker === "system") { messaggiSystemInviati.push(testo); } },
  notifyMasterMemory: (testo) => { memoriaNotificata.push(testo); },
  setUltimoRiepilogoCombattimento: (testo) => { riepilogoImpostato = testo; }
};

// Ricarica il modulo per far si' che avvolga QUESTA istanza di UltimateVTTCoreGameplay
// (il wrapping di appendChatMessage avviene una sola volta, all'inizializzazione).
carica("js/29-combat-memory.js");
const M2 = window.UltimateVTTCombatMemory;

// 1) Combattimento inizia.
combatState = { active: true, round: 1, lastEvent: "Combattimento iniziato.",
  combatants: [
    { id: "pc-local", kind: "pc", name: "Eroe", hitPoints: 20, maxHitPoints: 20, defeated: false },
    { id: "npc-1", kind: "npc", name: "Goblin", hitPoints: 7, maxHitPoints: 7, defeated: false }
  ] };
M2._tick();
check("all'avvio il combattimento risulta tracciato come attivo", M2.combattimentoAttivo() === true);
check("il messaggio placeholder 'Combattimento iniziato.' NON entra nel buffer", M2.bufferCorrente().length === 0);

// 2) Un attacco (narrato in lastEvent, come farebbero sia il tracker classico sia la HUD BG3).
combatState.lastEvent = "Eroe vs Goblin: d20 15+5=20 vs CA 15: colpito. Danni: 6.";
M2._tick();
check("un nuovo lastEvent viene catturato nel buffer", M2.bufferCorrente().includes("Eroe vs Goblin: d20 15+5=20 vs CA 15: colpito. Danni: 6."));

// 3) Un evento gia' narrato da un altro modulo (es. loot/XP), catturato via il wrap di appendChatMessage.
window.UltimateVTTCoreGameplay.appendChatMessage("system", "✨ +50 XP — sconfitto Goblin (Eroe).");
check("un messaggio 'system' postato da altri moduli viene bufferizzato", M2.bufferCorrente().some(l => /\+50 XP/.test(l)));
window.UltimateVTTCoreGameplay.appendChatMessage("player", "Attacco ancora!"); // non e' "system": ignorato
check("un messaggio NON 'system' non entra nel buffer", !M2.bufferCorrente().some(l => /Attacco ancora/.test(l)));

// 4) Il Goblin viene sconfitto SENZA che lastEvent lo dica esplicitamente (rete di sicurezza).
combatState.combatants[1].hitPoints = 0;
combatState.combatants[1].defeated = true;
combatState.lastEvent = "Eroe vs Goblin: d20 15+5=20 vs CA 15: colpito. Danni: 6."; // testo IDENTICO: non ri-bufferizzato da qui
M2._tick();
check("la sconfitta e' rilevata anche senza un lastEvent dedicato (confronto di stato)", M2.bufferCorrente().some(l => /☠ Goblin è stato sconfitto/.test(l)));

// 5) Guadagno XP/oro durante il combattimento.
progressione = { xp: 150, gold: 20, level: 1 };

// 6) Il combattimento termina.
combatState.active = false; combatState.round = 0; combatState.lastEvent = "Combattimento terminato.";
M2._tick();
check("dopo la fine, il combattimento non risulta piu' tracciato come attivo", M2.combattimentoAttivo() === false);
check("il riepilogo e' stato notificato alla memoria dell'IA (Groq)", memoriaNotificata.length === 1);
check("il riepilogo e' stato reso persistente (Ollama + prompt di sistema)", riepilogoImpostato != null && riepilogoImpostato === memoriaNotificata[0]);
check("il riepilogo riporta la vittoria e il round corretto (3° round=1, l'ultimo attivo)", /vittoria del party dopo 1 round/.test(riepilogoImpostato));
check("il riepilogo include l'attacco narrato", /colpito\. Danni: 6/.test(riepilogoImpostato));
check("il riepilogo include l'evento di loot/XP catturato dal wrap", /\+50 XP/.test(riepilogoImpostato));
check("il riepilogo include la sconfitta rilevata dalla rete di sicurezza", /☠ Goblin è stato sconfitto/.test(riepilogoImpostato));
check("il riepilogo include il guadagno di XP/oro (delta rispetto all'inizio)", /\+50 XP.*\+15 oro|\+15 oro.*\+50 XP/.test(riepilogoImpostato) || /Guadagni:.*\+50 XP/.test(riepilogoImpostato));
check("un riepilogo 'per l'utente' e' stato postato anche in chat", messaggiSystemInviati.some(m => /Combattimento concluso/.test(m)));

console.log("\n[Non tracciamento fuori combattimento]");
messaggiSystemInviati = [];
window.UltimateVTTCoreGameplay.appendChatMessage("system", "Un evento fuori da qualunque scontro.");
M2._tick(); // active=false, combattimentoAttivo gia' false: nessuna transizione, nessun nuovo riepilogo
check("un messaggio 'system' fuori combattimento non viene bufferizzato per un futuro riepilogo", !M2.bufferCorrente().some(l => /fuori da qualunque scontro/.test(l)));

console.log("\n[Troncamento del digest per combattimenti molto lunghi]");
M2._reset();
combatState = { active: true, round: 1, lastEvent: "",
  combatants: [{ id: "pc-local", kind: "pc", name: "Eroe", hitPoints: 20, maxHitPoints: 20, defeated: false },
               { id: "npc-1", kind: "npc", name: "Goblin", hitPoints: 7, maxHitPoints: 7, defeated: true }] };
M2._tick();
for (let i = 0; i < 20; i++) {
  window.UltimateVTTCoreGameplay.appendChatMessage("system", "Evento numero " + i + ".");
}
combatState.active = false;
memoriaNotificata = [];
M2._tick();
const righeEventiNelDigest = (memoriaNotificata[0].match(/^- /gm) || []).length;
check("il digest tronca gli eventi a un numero massimo gestibile (<=14)", righeEventiNelDigest <= 14);
check("il digest segnala la troncatura quando gli eventi superano il limite", /omessi per brevita/.test(memoriaNotificata[0]));
check("gli ultimi eventi (i piu' recenti/decisivi) sono quelli mantenuti", /Evento numero 19\./.test(memoriaNotificata[0]));

M2.fermaSampler();
console.log("\nRisultato core-combat-memory: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
