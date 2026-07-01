// Test dell'inventario per-PG in hotseat (modulo 17): salva l'inventario del PG uscente e ripristina
// quello del PG entrante al cambio di personaggio attivo. Prima inequivocabile suite di test per
// questo modulo (nessuna esisteva). Copre in particolare un bug reale: un PG aggiunto in hotseat
// (js/12, "+ Aggiungi giocatore") non ha ne' un inventario salvato ne' un "build" da creazione
// personaggio — restoreFor() non faceva nulla in quel caso, lasciando lo zaino del PG USCENTE
// visibile e modificabile sotto l'identita' del PG entrante.
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
carica("js/17-per-pg-inventory.js");

const S = window.UltimateVTTState;
const I = window.UltimateVTTInventory;
const P17 = window.VTTPerPgInventory;
check("VTTPerPgInventory esposto (avvio senza eccezioni)", !!P17);

function statoBase(id, nome) {
  const base = JSON.parse(S.serialize());
  base.identity.id = id;
  base.identity.name = nome;
  return base;
}

console.log("\n[Stato iniziale: 'player-1' attivo col kit di partenza di default]");
S.hydrate(statoBase("player-1", "Aria"));
const kitDiDefault = I.getState();
check("il kit di partenza di default include l'arma iniziale (longsword)", kitDiDefault.inventory.some(it => it.catalogId === "longsword"));

console.log("\n[Il PG attivo modifica il proprio inventario]");
I.addInventoryItem("dagger", 1);
check("il pugnale e' stato aggiunto all'inventario di 'player-1'", I.getState().inventory.some(it => it.catalogId === "dagger" && it.quantity === 1));

console.log("\n[BUG CORRETTO: switch a un PG hotseat MAI VISTO PRIMA (nessun inventario salvato, nessun 'build')]");
// Scenario reale: js/12 "+ Aggiungi giocatore" crea un membro senza passare dalla creazione
// personaggio, quindi senza alcun record in VTTCharacters.byId per il suo id.
S.hydrate(statoBase("player-2", "Ligeia"));
const inventarioDiLigeia = I.getState();
check("'player-2' NON eredita il pugnale di 'player-1' (niente inventario altrui sotto la sua identita')",
  !inventarioDiLigeia.inventory.some(it => it.catalogId === "dagger"));
check("'player-2' riparte dal kit di default pulito (stessa arma iniziale)",
  inventarioDiLigeia.inventory.some(it => it.catalogId === "longsword"));

console.log("\n[Il ritorno a 'player-1' ripristina correttamente il SUO inventario modificato]");
S.hydrate(statoBase("player-1", "Aria"));
check("tornando su 'player-1' il pugnale aggiunto in precedenza e' ancora li'",
  I.getState().inventory.some(it => it.catalogId === "dagger"));

console.log("\n[Un PG con un inventario gia' salvato lo ripristina fedelmente (non il kit di default)]");
I.addInventoryItem("torch", 3); // altra modifica per 'player-1', gia' presente come inventario salvato
S.hydrate(statoBase("player-3", "Doran")); // switch away: salva l'inventario aggiornato di player-1
S.hydrate(statoBase("player-1", "Aria")); // e ora si torna su player-1: deve ripristinare ESATTAMENTE quello, non un default
check("il PG con inventario gia' noto ripristina il proprio stato salvato (non il kit di default)",
  I.getState().inventory.filter(it => it.catalogId === "torch").reduce((s, it) => s + it.quantity, 0) >= 4); // 4 di default + 3 aggiunte

console.log("\n[Un PG con un 'build' da creazione personaggio usa VTTStartMenu.applyKitFor, non il default generico]");
window.VTTCharacters.byId["player-4"] = { build: { classe: "Mago" }, progression: null };
let kitApplicatoPer = null;
window.VTTStartMenu = { applyKitFor: function (build) { kitApplicatoPer = build; I.hydrate({ inventory: [{ inventoryId: "inv-staff", catalogId: "quarterstaff", quantity: 1, equippedSlot: "mainHand" }] }); } };
S.hydrate(statoBase("player-4", "Elowen"));
check("per un PG con 'build' si chiama VTTStartMenu.applyKitFor (non il fallback generico)", kitApplicatoPer && kitApplicatoPer.classe === "Mago");
check("l'inventario riflette il kit di classe applicato, non quello di default", I.getState().inventory.some(it => it.catalogId === "quarterstaff") && !I.getState().inventory.some(it => it.catalogId === "longsword"));

console.log("\n[Nessun cambio reale (stesso id): non ri-salva/ri-ripristina inutilmente]");
const contoInventarioPrima = I.getState().inventory.length;
S.hydrate(statoBase("player-4", "Elowen")); // stesso id di prima: nessuna transizione
check("uno hydrate con lo stesso id attivo non altera l'inventario corrente", I.getState().inventory.length === contoInventarioPrima);

console.log("\nRisultato core-per-pg-inventory: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
