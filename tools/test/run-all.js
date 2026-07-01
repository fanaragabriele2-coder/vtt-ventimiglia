// Runner di tutte le suite di test del livello real-time (Fasi 1-3 + hardening).
// Esegue ogni suite come processo separato e aggrega gli esiti dai codici d'uscita.
//
//   node tools/test/run-all.js
//
// Le suite "node-only" non hanno dipendenze. Il pannello E2E usa playwright-core +
// Chromium se presenti, altrimenti si auto-salta (exit 0) senza far fallire la suite.
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");

const suite = [
  // Moduli core (1-17): nessuna dipendenza dal livello multiplayer.
  ["Core: state manager PG (modulo 04)", "core-state.js"],
  ["Core: action economy / inventario (modulo 05)", "core-inventory.js"],
  ["Core: combat tracker / dadi / danni (modulo 06)", "core-combat.js"],
  ["Core: XP & loot / level-up (modulo 15)", "core-progression.js"],
  ["Core: backup scaricabile / ripristino (modulo 11)", "core-backup.js"],
  ["Core: HUD combattimento BG3 / probabilita' di colpire (modulo 23)", "core-bg3-hud.js"],
  ["Core: attacchi di opportunita' / reazioni BG3 (modulo 24)", "core-bg3-reactions.js"],
  // Livello multiplayer real-time (Fasi 1-3 + hardening).
  ["Smoke moduli 18/19/20", "smoke.js"],
  ["Sync turni / hydration / interpolazione", "sync.js"],
  ["Relay E2E (autorizzazione, broadcast)", "relay-e2e.js"],
  ["Relay hardening (auth, GM token, rate-limit, validazione)", "relay-hardening.js"],
  ["Relay resilience (errori di processo gestiti)", "relay-resilience.js"],
  ["Routing di rete sistemi di gioco (HP, nebbia, spawn)", "game-events.js"],
  ["Mappatura esplicita token<->combattente", "mapping.js"],
  ["Pannello di sessione E2E (browser, opzionale)", "panel-e2e.js"]
];

let falliti = 0;
suite.forEach(function (voce) {
  const nome = voce[0], file = voce[1];
  console.log("\n========================================");
  console.log("==== " + nome);
  console.log("==== (" + file + ")");
  console.log("========================================");
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit" });
  if (r.status !== 0) { falliti += 1; console.log(">> SUITE FALLITA: " + nome); }
});

console.log("\n========================================");
if (falliti === 0) { console.log("RISULTATO COMPLESSIVO: tutte le suite OK ✓"); }
else { console.log("RISULTATO COMPLESSIVO: " + falliti + " suite FALLITE ✗"); }
console.log("========================================");
process.exit(falliti === 0 ? 0 : 1);
