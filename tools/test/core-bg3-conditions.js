// Test delle condizioni di stato (modulo 30): logica pura (effetto su un attacco, scadenza),
// applicazione/rimozione GM-autorevole con propagazione di rete, applicazione inbound, scadenza
// automatica basata sul round SINCRONIZZATO (quello della FSM, stesso pattern del modulo 27), e
// lettura live (consultata dal modulo 23 per comporre vantaggio/svantaggio).
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
carica("js/30-bg3-conditions.js");

const CN = window.UltimateVTTConditions;
CN.fermaSampler();
check("UltimateVTTConditions esposto", !!CN);
check("Tipi espone prono/stordito/avvelenato", CN.Tipi.PRONO === "prono" && CN.Tipi.STORDITO === "stordito" && CN.Tipi.AVVELENATO === "avvelenato");
check("Icone ed Etichette coprono le tre condizioni", ["prono", "stordito", "avvelenato"].every(k => CN.Icone[k] && CN.Etichette[k]));

console.log("\n[Logica pura: effettoSuAttaccoDaCondizioni]");
check("bersaglio prono -> vantaggio per l'attaccante", CN.effettoSuAttaccoDaCondizioni([], ["prono"]).vantaggio === true);
check("bersaglio stordito -> vantaggio per l'attaccante", CN.effettoSuAttaccoDaCondizioni([], ["stordito"]).vantaggio === true);
check("bersaglio senza condizioni -> nessun vantaggio", CN.effettoSuAttaccoDaCondizioni([], []).vantaggio === false);
check("attaccante prono -> svantaggio sul proprio attacco", CN.effettoSuAttaccoDaCondizioni(["prono"], []).svantaggio === true);
check("attaccante avvelenato -> svantaggio sul proprio attacco", CN.effettoSuAttaccoDaCondizioni(["avvelenato"], []).svantaggio === true);
check("attaccante senza condizioni -> nessuno svantaggio", CN.effettoSuAttaccoDaCondizioni([], []).svantaggio === false);
check("bersaglio avvelenato NON da' vantaggio (solo prono/stordito lo danno)", CN.effettoSuAttaccoDaCondizioni([], ["avvelenato"]).vantaggio === false);
check("attaccante stordito NON e' penalizzato sui propri attacchi (solo prono/avvelenato lo sono)", CN.effettoSuAttaccoDaCondizioni(["stordito"], []).svantaggio === false);
check("entrambe le fonti insieme (bersaglio prono + attaccante avvelenato)", (function () {
  const r = CN.effettoSuAttaccoDaCondizioni(["avvelenato"], ["prono"]);
  return r.vantaggio === true && r.svantaggio === true;
})());

console.log("\n[Scadenza pura: eScaduta]");
check("appena applicata (stesso round) non e' scaduta", CN.eScaduta({ appliedAlRound: 3, durataRound: 1 }, 3) === false);
check("esattamente ai round di durata e' scaduta", CN.eScaduta({ appliedAlRound: 3, durataRound: 1 }, 4) === true);
check("oltre la durata resta scaduta", CN.eScaduta({ appliedAlRound: 3, durataRound: 2 }, 9) === true);

console.log("\n[Durata di default]");
check("durata di default prono = 1 round", CN.durataDefault("prono") === 1);
check("durata di default stordito = 1 round", CN.durataDefault("stordito") === 1);
check("durata di default avvelenato = 3 round", CN.durataDefault("avvelenato") === 3);
check("chiave sconosciuta ricade su 1 round", CN.durataDefault("gelo") === 1);

// ---- Stub minimi di combattimento/FSM per i test runtime ----
let fsmRound = 1;
window.UltimateVTTCombat = { getState: () => ({
  combatants: [
    { id: "pc-local", name: "Eroe" },
    { id: "npc-1", name: "Goblin" }
  ]
}) };
window.UltimateVTTCombatFSM = { getStato: () => ({ round: fsmRound }) };

console.log("\n[Il round di riferimento e' quello della FSM]");
CN._reset();
fsmRound = 7;
window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: (t, p) => ({ tipo: t, payload: p }), emetti: () => true };
const applicataAlRoundFsm = CN.applicaCondizione("npc-1", "prono", 2);
check("applicaCondizione usa il round della FSM (7)", applicataAlRoundFsm.durataRound === 2 && CN.condizioniDi("npc-1")[0].scadeAlRound === 9);

console.log("\n[Applicazione GM-autorevole + propagazione di rete]");
CN._reset();
fsmRound = 1;
let eventiEmessi = [];
window.UltimateVTTSync = {
  isMaster: () => true,
  TipiEvento: { CONDIZIONE_IMPOSTATA: "ConditionSetEvent", CONDIZIONE_RIMOSSA: "ConditionClearedEvent" },
  creaEvento: (tipo, payload) => ({ tipo, payload }),
  emetti: (evento) => { eventiEmessi.push(evento); return true; }
};
check("isMasterOrSolo() e' true sul client Master", CN.isMasterOrSolo() === true);
const r1 = CN.applicaCondizione("npc-1", "avvelenato", 3);
check("il Master applica la condizione con successo", r1.ok === true);
check("haCondizione la conferma attiva", CN.haCondizione("npc-1", "avvelenato") === true);
check("il Master emette un ConditionSetEvent", eventiEmessi.length === 1 && eventiEmessi[0].tipo === "ConditionSetEvent");
check("l'evento porta i dati corretti", eventiEmessi[0].payload.combattenteId === "npc-1" && eventiEmessi[0].payload.chiave === "avvelenato" && eventiEmessi[0].payload.durataRound === 3);

console.log("\n[Condizione sconosciuta: rifiutata senza toccare la rete]");
eventiEmessi = [];
const rSconosciuta = CN.applicaCondizione("npc-1", "invisibile", 1);
check("una chiave non supportata ritorna ok:false", rSconosciuta.ok === false);
check("nessun evento emesso per una condizione sconosciuta", eventiEmessi.length === 0);

console.log("\n[Rimozione GM-autorevole + propagazione di rete]");
eventiEmessi = [];
const r2 = CN.rimuoviCondizione("npc-1", "avvelenato");
check("il Master rimuove la condizione con successo", r2.ok === true && r2.rimossa === true);
check("haCondizione ora e' false", CN.haCondizione("npc-1", "avvelenato") === false);
check("il Master emette un ConditionClearedEvent", eventiEmessi.length === 1 && eventiEmessi[0].tipo === "ConditionClearedEvent");
check("rimuovere una condizione assente non lancia (rimossa:false)", CN.rimuoviCondizione("npc-1", "prono").rimossa === false);

console.log("\n[Client giocatore: applicazione e rimozione rifiutate]");
CN._reset();
window.UltimateVTTSync = { isMaster: () => false };
check("isMasterOrSolo() e' false su un client giocatore", CN.isMasterOrSolo() === false);
const rifiutata = CN.applicaCondizione("npc-1", "prono", 1);
check("client giocatore: applicaCondizione rifiutata (ok:false)", rifiutata.ok === false);
check("il messaggio indica che serve il Master", /Master/.test(rifiutata.message));
check("nessuna condizione applicata quando rifiutata", CN.haCondizione("npc-1", "prono") === false);
const rimozioneRifiutata = CN.rimuoviCondizione("npc-1", "prono");
check("client giocatore: rimuoviCondizione rifiutata (ok:false)", rimozioneRifiutata.ok === false);

console.log("\n[Applicazione inbound (client non-Master che riceve l'evento del Master)]");
CN._reset();
fsmRound = 5;
const eventoInbound = { tipo: "ConditionSetEvent", payload: { combattenteId: "pc-local", chiave: "stordito", durataRound: 2, appliedAlRound: 4 } };
CN._gestisciInboundImpostata(eventoInbound);
check("l'inbound applica la condizione ricevuta", CN.haCondizione("pc-local", "stordito") === true);
check("usa il round di applicazione DEL MASTER (4) dal payload, non quello locale (5)", CN.condizioniDi("pc-local")[0].scadeAlRound === 6);
check("un payload malformato (senza chiave) viene ignorato", (function () {
  CN._gestisciInboundImpostata({ tipo: "ConditionSetEvent", payload: { combattenteId: "pc-local" } });
  return CN.condizioniDi("pc-local").length === 1; // invariato
})());

const eventoRimozioneInbound = { tipo: "ConditionClearedEvent", payload: { combattenteId: "pc-local", chiave: "stordito" } };
CN._gestisciInboundRimossa(eventoRimozioneInbound);
check("l'inbound di rimozione applica la rimozione ricevuta", CN.haCondizione("pc-local", "stordito") === false);

console.log("\n[Scadenza automatica dopo la durata (round sincronizzato della FSM)]");
CN._reset();
fsmRound = 1;
window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: () => ({}), emetti: () => true };
CN.applicaCondizione("npc-1", "avvelenato", 2); // dura 2 round: applicata al round 1, scade al round 3
check("subito dopo l'applicazione e' attiva", CN.haCondizione("npc-1", "avvelenato") === true);
fsmRound = 2;
CN._tick();
check("al round 2 (dentro la durata) e' ancora attiva", CN.haCondizione("npc-1", "avvelenato") === true);
fsmRound = 3;
CN._tick();
check("al round 3 (durata esaurita) e' stata rimossa", CN.haCondizione("npc-1", "avvelenato") === false);
check("condizioniDi non la elenca piu'", CN.condizioniDi("npc-1").length === 0);

console.log("\n[Lettura live: valutaCondizioni, consultata dal modulo 23]");
CN._reset();
fsmRound = 1;
window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: () => ({}), emetti: () => true };
CN.applicaCondizione("npc-1", "prono", 5);
const valutazione = CN.valutaCondizioni("pc-local", "npc-1");
check("l'attaccante ha vantaggio contro un bersaglio prono", valutazione.vantaggio === true);
check("l'attaccante (senza condizioni proprie) non ha svantaggio", valutazione.svantaggio === false);
check("condizioniBersaglio elenca 'prono'", valutazione.condizioniBersaglio.includes("prono"));
check("condizioniAttaccante e' vuoto", valutazione.condizioniAttaccante.length === 0);
const valutazioneInversa = CN.valutaCondizioni("npc-1", "pc-local");
check("simmetricamente, l'attaccante prono ha svantaggio sul proprio attacco", valutazioneInversa.svantaggio === true);

console.log("\n[condizioniDi: usata dal modulo 23 per le icone sulla barra iniziativa]");
CN._reset();
window.UltimateVTTSync = { isMaster: () => true, TipiEvento: {}, creaEvento: () => ({}), emetti: () => true };
check("nessuna condizione -> elenco vuoto", CN.condizioniDi("npc-1").length === 0);
CN.applicaCondizione("npc-1", "prono", 1);
CN.applicaCondizione("npc-1", "avvelenato", 3);
check("due condizioni applicate -> entrambe elencate", CN.condizioniDi("npc-1").length === 2);
check("le chiavi elencate sono corrette", CN.condizioniDi("npc-1").map(x => x.chiave).sort().join(",") === "avvelenato,prono");

CN.fermaSampler();
console.log("\nRisultato core-bg3-conditions: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
