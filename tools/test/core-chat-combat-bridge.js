// Test del ponte chat Master -> combat system (modulo 34): rilevamento puro dei nemici annunciati
// nella narrazione (nomi del bestiario + parole di combattimento, conteggi da elenchi numerati /
// numeri in cifra o parola), guardie (combattimento gia' attivo, client non-Master, testo senza
// scontro), e integrazione via il wrap di appendChatMessage con elaborazione ritardata (_flush).
// Include il caso REALE osservato in partita: il Master narra "Goblin 1: 5/5 HP * Goblin 2..."
// senza campo JSON spawn, e il combat system deve attivarsi comunque con 4 goblin.
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

// Stub minimi PRIMA del caricamento (il wrap di appendChatMessage avviene all'inizializzazione).
let combatAttivo = false;
window.UltimateVTTCombat = { getState: () => ({ active: combatAttivo }) };
let spawnChiamati = [];
window.VTTSpawn = { spawn: (lista) => { spawnChiamati.push(lista); combatAttivo = true; return lista.map(e => e.name); } };
let messaggi = [];
window.UltimateVTTCoreGameplay = { appendChatMessage: (speaker, testo) => { messaggi.push({ speaker, testo }); } };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/34-chat-combat-bridge.js");

const B = window.UltimateVTTChatCombatBridge;
B.fermaSampler();
check("UltimateVTTChatCombatBridge esposto", !!B);

console.log("\n[Rilevamento puro: rilevaNemiciDaTesto]");
check("scontro esplicito con numero in parola ('tre goblin vi attaccano')", (function () {
  const l = B.rilevaNemiciDaTesto("All'improvviso tre goblin sbucano dai vicoli e vi attaccano!");
  return l && l.length === 1 && l[0].name === "Goblin" && l[0].count === 3;
})());
check("caso REALE dal gameplay: elenco numerato 'Goblin 1..4' con HP inventati -> 4 goblin", (function () {
  const testo = "Il combattimento è iniziato! I Goblin sono pronti a scatenare un attacco contro di voi. " +
    "La situazione è la seguente: * Baz: 12/12 HP * Fanny: 9/9 HP * Goblin 1: 5/5 HP * Goblin 2: 5/5 HP * Goblin 3: 5/5 HP * Goblin 4: 5/5 HP È il turno di Baz.";
  const l = B.rilevaNemiciDaTesto(testo);
  return l && l.length === 1 && l[0].name === "Goblin" && l[0].count === 4;
})());
check("piu' creature insieme ('due banditi e un orco vi assalgono')", (function () {
  const l = B.rilevaNemiciDaTesto("Due banditi e un orco vi assalgono dall'ombra!");
  const banditi = l && l.find(e => e.name === "Bandito");
  const orco = l && l.find(e => e.name === "Orco");
  return banditi && banditi.count === 2 && orco && orco.count === 1;
})());
check("numero in cifra ('4 scheletri emergono... iniziativa')", (function () {
  const l = B.rilevaNemiciDaTesto("4 scheletri emergono dalle tombe. Tirate l'iniziativa!");
  return l && l[0].name === "Scheletro" && l[0].count === 4;
})());
check("menzione singola senza numero -> count 1 ('un agguato: uno zombie...')", (function () {
  const l = B.rilevaNemiciDaTesto("È un agguato! Uno zombie barcolla verso di voi.");
  return l && l[0].name === "Zombie" && l[0].count === 1;
})());
check("'hobgoblin' NON viene contato anche come 'goblin' (word boundary)", (function () {
  const l = B.rilevaNemiciDaTesto("Un hobgoblin vi attacca!");
  return l && l.length === 1 && l[0].name === "Hobgoblin" && l[0].count === 1;
})());
check("menzione pacifica senza parole di scontro -> null (nessun falso positivo)", B.rilevaNemiciDaTesto("Un goblin mercante vi saluta cordialmente e vi offre della frutta.") === null);
check("parole di scontro ma nessuna creatura nota -> null", B.rilevaNemiciDaTesto("Il combattimento tra le due fazioni infuria in lontananza.") === null);
check("testo vuoto/assente -> null, non lancia", B.rilevaNemiciDaTesto("") === null && B.rilevaNemiciDaTesto(null) === null);
check("il conteggio e' capato a 8 ('venti goblin' via elenco numerato 'Goblin 20')", (function () {
  const l = B.rilevaNemiciDaTesto("Vi attaccano! Goblin 20 guida l'orda.");
  return l && l[0].count === 8;
})());

console.log("\n[Elaborazione con guardie: _processaTesto]");
combatAttivo = false; spawnChiamati = [];
check("a combattimento spento, un annuncio di scontro fa comparire i nemici", (function () {
  const ok = B._processaTesto("Tre goblin vi attaccano!");
  return ok === true && spawnChiamati.length === 1 && spawnChiamati[0][0].count === 3;
})());
check("a combattimento GIA' attivo non fa nulla (lo spawn JSON ha gia' fatto tutto)", (function () {
  combatAttivo = true; spawnChiamati = [];
  const ok = B._processaTesto("Tre goblin vi attaccano!");
  return ok === false && spawnChiamati.length === 0;
})());
check("su un client giocatore (non Master) non fa nulla", (function () {
  combatAttivo = false; spawnChiamati = [];
  window.UltimateVTTSync = { isMaster: () => false };
  const ok = B._processaTesto("Tre goblin vi attaccano!");
  window.UltimateVTTSync = undefined;
  return ok === false && spawnChiamati.length === 0;
})());

console.log("\n[Integrazione: il wrap di appendChatMessage intercetta SOLO il Master]");
combatAttivo = false; spawnChiamati = [];
window.UltimateVTTCoreGameplay.appendChatMessage("master", "Un'imboscata! Due lupi balzano fuori dal buio!");
check("il messaggio del Master arriva comunque in chat (il wrap non lo blocca)", messaggi.some(m => /lupi balzano/.test(m.testo)));
check("prima del ritardo, lo spawn non e' ancora avvenuto (lascia passare l'eventuale spawn JSON)", spawnChiamati.length === 0);
B._flush();
check("dopo il flush, i 2 lupi sono comparsi e il combattimento e' partito", spawnChiamati.length === 1 && spawnChiamati[0][0].name === "Lupo" && spawnChiamati[0][0].count === 2);

combatAttivo = false; spawnChiamati = [];
window.UltimateVTTCoreGameplay.appendChatMessage("system", "Tre goblin vi attaccano!"); // speaker sbagliato
window.UltimateVTTCoreGameplay.appendChatMessage("player", "Attacco i goblin!");        // il giocatore non evoca nemici
B._flush();
check("messaggi 'system' e 'player' NON attivano il ponte (solo 'master')", spawnChiamati.length === 0);

console.log("\n[Doppio percorso: se lo spawn JSON e' arrivato prima, il ponte non duplica]");
combatAttivo = false; spawnChiamati = [];
window.UltimateVTTCoreGameplay.appendChatMessage("master", "Quattro goblin vi accerchiano: battaglia!");
// Simula handleAIMovement che nel frattempo processa il campo JSON "spawn" (combatte gia').
window.VTTSpawn.spawn([{ name: "Goblin", count: 4 }]); // combatAttivo -> true
const spawnDiretti = spawnChiamati.length;
B._flush();
check("il ponte vede il combattimento gia' attivo e NON fa un secondo spawn", spawnChiamati.length === spawnDiretti);

console.log("\nRisultato core-chat-combat-bridge: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
