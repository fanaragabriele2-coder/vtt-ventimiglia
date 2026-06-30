// E2E nel browser reale del pannello di sessione (modulo 21):
// avvia relay + dev-server, apre 2 schede (Master e Giocatore), connette dal pannello,
// verifica stato "Connesso" e che il roster mostri entrambi i partecipanti con i ruoli giusti.
//
// OPZIONALE: richiede playwright-core (npm i -D playwright-core) e un Chromium.
// Se mancano, il test si AUTO-SALTA con exit 0 (non fa fallire la suite/CI).
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT_RELAY = "4623";
const PORT_WEB = "4599";
const URL_WEB = "http://localhost:" + PORT_WEB + "/";
const URL_RELAY = "ws://localhost:" + PORT_RELAY + "/";

let chromium;
try { chromium = require("playwright-core").chromium; }
catch (e) {
  console.log("SKIP pannello E2E: playwright-core non installato (npm i -D playwright-core).");
  process.exit(0);
}

// Individua un eseguibile Chromium: prima quello noto a playwright, poi le cartelle pw-browsers.
function trovaBrowser() {
  try { const p = chromium.executablePath(); if (p && fs.existsSync(p)) { return p; } } catch (e) { /* ignora */ }
  const candidati = [];
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    if (fs.existsSync(base)) {
      fs.readdirSync(base).forEach(function (d) {
        if (/^chromium-/.test(d)) { candidati.push(path.join(base, d, "chrome-linux", "chrome")); }
      });
    }
  } catch (e) { /* ignora */ }
  for (let i = 0; i < candidati.length; i++) { if (fs.existsSync(candidati[i])) { return candidati[i]; } }
  return null;
}

const EXEC = trovaBrowser();
if (!EXEC) { console.log("SKIP pannello E2E: nessun Chromium trovato."); process.exit(0); }

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function avvia(cmd, args, env) {
  const p = spawn(cmd, args, { cwd: ROOT, env: Object.assign({}, process.env, env || {}), stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.on("data", () => {}); p.stderr.on("data", () => {});
  return p;
}

async function preparaPagina(page) {
  await page.goto(URL_WEB, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".vtt-sess-toggle", { timeout: 8000 });
  // Rimuove il modale del menu iniziale (simula "partita avviata"): altrimenti intercetta i click.
  await page.evaluate(() => { const o = document.getElementById("vttStartOverlay"); if (o) { o.remove(); } });
}

async function connettiDaPannello(page, { url, ruolo, id, token }) {
  await page.click(".vtt-sess-toggle");
  await page.waitForSelector(".vtt-sess-panel:not([hidden])", { timeout: 5000 });
  await page.locator(".vtt-sess-field").nth(0).locator("input").fill(url);  // campo URL
  await page.locator(".vtt-sess-field").nth(1).locator("input").fill(id);   // campo identita'
  await page.selectOption(".vtt-sess-field select", ruolo);
  if (ruolo === "player" && token) {
    await page.check(".vtt-sess-owners input[value=\"" + token + "\"]");
  }
  await page.click(".vtt-sess-btn:has-text('Connetti')");
}

(async () => {
  const relay = avvia("node", ["server/relay.js"], { PORT: PORT_RELAY });
  const web = avvia("node", ["dev-server.js"], {});
  await sleep(900);

  const browser = await chromium.launch({ executablePath: EXEC, headless: true, args: ["--no-sandbox"] });
  let codice = 1;
  try {
    const ctxGm = await browser.newContext();
    const gm = await ctxGm.newPage();
    gm.on("pageerror", e => console.log("  [gm pageerror] " + e.message));
    await preparaPagina(gm);
    check("pannello: bottone di apertura presente", true);

    await connettiDaPannello(gm, { url: URL_RELAY, ruolo: "gm", id: "test-gm" });
    await gm.waitForFunction(() =>
      /Connesso/.test(document.querySelector(".vtt-sess-status-text").textContent), null, { timeout: 6000 });
    check("GM: stato diventa 'Connesso'", true);
    check("GM: badge online attivo", await gm.locator(".vtt-sess-toggle.online").count() === 1);

    // Seconda scheda: Giocatore che possiede token-pc.
    const ctxPl = await browser.newContext();
    const pl = await ctxPl.newPage();
    pl.on("pageerror", e => console.log("  [pl pageerror] " + e.message));
    await preparaPagina(pl);
    await connettiDaPannello(pl, { url: URL_RELAY, ruolo: "player", id: "anna", token: "token-pc" });
    await pl.waitForFunction(() =>
      /Connesso/.test(document.querySelector(".vtt-sess-status-text").textContent), null, { timeout: 6000 });
    check("Giocatore: stato diventa 'Connesso'", true);

    // Il roster del GM deve elencare 2 partecipanti, con i ruoli corretti.
    await gm.waitForFunction(() =>
      document.querySelectorAll(".vtt-sess-peer").length >= 2, null, { timeout: 6000 });
    const peers = await gm.evaluate(() =>
      Array.prototype.map.call(document.querySelectorAll(".vtt-sess-peer"), el => ({
        nome: el.querySelector(".vtt-sess-name").textContent,
        ruolo: el.querySelector(".vtt-sess-badge").textContent,
        token: el.querySelector(".vtt-sess-tokens").textContent
      }))
    );
    check("GM roster: 2 partecipanti", peers.length === 2);
    check("GM roster: c'e' un Master 'test-gm'", peers.some(p => p.ruolo === "GM" && /test-gm/.test(p.nome)));
    check("GM roster: c'e' un Giocatore 'anna'", peers.some(p => p.ruolo === "PG" && /anna/.test(p.nome)));
    check("GM roster: il Master possiede 'tutti i token'", peers.some(p => p.ruolo === "GM" && /tutti i token/.test(p.token)));
    check("GM roster: il Giocatore possiede 'token-pc'", peers.some(p => p.ruolo === "PG" && /token-pc/.test(p.token)));
    check("GM roster: marca se stesso con '(tu)'", peers.some(p => /\(tu\)/.test(p.nome)));

    // Il giocatore vede anche lui 2 partecipanti.
    const nPl = await pl.evaluate(() => document.querySelectorAll(".vtt-sess-peer").length);
    check("Giocatore roster: vede 2 partecipanti", nPl === 2);

    // --- Mappatura token<->combattente sincronizzata (GM modifica, giocatore riceve) ---
    const nRigheGm = await gm.evaluate(() => document.querySelectorAll(".vtt-sess-map-row").length);
    check("GM: sezione mappatura con righe per i combattenti", nRigheGm >= 1);
    const selGmAbil = await gm.evaluate(() => !document.querySelector(".vtt-sess-map-row select").disabled);
    check("GM: i select della mappatura sono abilitati", selGmAbil === true);
    const selPlDisab = await pl.evaluate(() => document.querySelector(".vtt-sess-map-row select").disabled);
    check("Giocatore: i select della mappatura sono in sola lettura", selPlDisab === true);

    // Il GM assegna 'token-npc-2' al primo combattente (pc-local).
    await gm.locator(".vtt-sess-map-row").nth(0).locator("select").selectOption("token-npc-2");
    // Il giocatore riceve la mappatura via TokenMappingEvent e la riflette.
    await pl.waitForFunction(() =>
      document.querySelector(".vtt-sess-map-row select").value === "token-npc-2", null, { timeout: 6000 });
    check("Giocatore: mappatura del Master ricevuta e riflessa (token-npc-2)", true);

    // Disconnessione del giocatore -> il roster del GM torna a 1.
    await pl.click(".vtt-sess-btn:has-text('Disconnetti')");
    await gm.waitForFunction(() =>
      document.querySelectorAll(".vtt-sess-peer").length === 1, null, { timeout: 6000 });
    check("GM roster: dopo disconnessione del Giocatore torna a 1", true);

    codice = falliti === 0 ? 0 : 1;
  } catch (e) {
    console.log("  ECCEZIONE: " + (e && e.message));
    codice = 1;
  } finally {
    await browser.close();
    try { relay.kill(); } catch (e) {}
    try { web.kill(); } catch (e) {}
  }

  console.log("\nRisultato pannello E2E: " + passati + " passati, " + falliti + " falliti.");
  process.exit(codice);
})();
