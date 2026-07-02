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

    // --- Modulo Campagna (esplorazione fullscreen di Ventimiglia): #campOverlay e i suoi pulsanti
    // (Sprint, Esamina, Combatti, invia messaggio, "← VTT") sono definiti nell'HTML DOPO lo script
    // che li collega — su una pagina reale, wireActionButtons() veniva chiamata una sola volta,
    // troppo presto, quando quegli elementi non esistevano ancora: TUTTI i pulsanti restavano senza
    // alcuna azione collegata, per sempre. Verifica diretta sulla pagina reale (non un mock DOM, che
    // non riprodurrebbe l'ordine di parsing dell'HTML che causa il bug). ---
    await gm.evaluate(() => { if (window.VTTCampagna) { window.VTTCampagna.activate(); } });
    await gm.waitForSelector("#campOverlay.camp-active", { timeout: 6000 });
    check("Campagna: la schermata di esplorazione si apre", true);
    await gm.click("#campBackBtn");
    await gm.waitForFunction(() =>
      !document.getElementById("campOverlay").classList.contains("camp-active"), null, { timeout: 6000 });
    check("Campagna: il pulsante '← VTT' chiude davvero la schermata (non restava senza azione collegata)", true);

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

    // Ripristina la mappatura di default: l'override sopra (token-npc-2 -> pc-local) ha gia'
    // dimostrato la sincronizzazione GM->giocatore, ma se lasciato attivo rompe l'euristica
    // token<->combattente per npc-2 nei test successivi (HUD, Spingi), che assumono la mappa
    // di default. Il reset e' anch'esso GM-autorevole e si propaga allo stesso modo.
    await gm.evaluate(() => window.UltimateVTTCombatFSM && window.UltimateVTTCombatFSM.impostaMappaCompleta({}));
    // La riga 0 (pc-local) ricade sull'euristica di default, che risolve a "token-pc" (non vuota,
    // perche' quel token esiste davvero): e' questo il segnale che l'override e' stato rimosso.
    await pl.waitForFunction(() => {
      const sel = document.querySelector(".vtt-sess-map-row select");
      return sel && sel.value === "token-pc";
    }, null, { timeout: 6000 });
    check("mappatura ripristinata al default dopo il test (evita di contaminare i test successivi)", true);

    // --- HUD di combattimento stile BG3: compare a combattimento attivo, con la % di colpire ---
    const hudPrima = await gm.evaluate(() => { const h = document.querySelector(".bg3-hud"); return h ? h.hidden : null; });
    check("BG3 HUD: nascosta fuori dal combattimento", hudPrima === true);
    // Il tracker parte SOLO col PG (nessun nemico predefinito): il Master fa comparire i nemici,
    // il che avvia anche il combattimento (VTTSpawn.spawn -> addNpc + startCombat) e collega ogni
    // token al suo combattente (mappatura esplicita), cosi' HUD, Spingi e IA li ritrovano.
    await gm.evaluate(() => window.VTTSpawn && window.VTTSpawn.spawn([{ name: "Goblin", count: 2 }]));
    // Ferma il campionamento dell'IA dei nemici (modulo 33) su questa pagina: ha una sua suite
    // dedicata, e qui i test seguenti (Spingi, mappatura) muovono i token a mano — l'IA che agisce
    // in autonomia sul turno di un PNG li contaminerebbe. La si riattiva manualmente piu' avanti,
    // con un controllo dedicato, chiamando _tick() in modo deterministico.
    await gm.evaluate(() => window.UltimateVTTEnemyAI && window.UltimateVTTEnemyAI.fermaSampler());
    await gm.waitForFunction(() => { const h = document.querySelector(".bg3-hud"); return h && h.hidden === false; }, null, { timeout: 6000 });
    check("BG3 HUD: visibile dopo l'inizio del combattimento", true);
    const nCard = await gm.evaluate(() => document.querySelectorAll(".bg3-init-card").length);
    check("BG3 HUD: barra iniziativa con una card per combattente", nCard >= 2);
    // L'iniziativa e' casuale: seleziona un bersaglio diverso dall'attaccante di turno, cosi' la
    // percentuale e' sempre calcolabile (non si mostra una % "contro se stessi").
    await gm.evaluate(() => {
      const st = window.UltimateVTTCombat.getState();
      const cur = st.combatants[st.currentTurnIndex];
      const other = st.combatants.find(c => c.id !== cur.id && !c.defeated);
      const sel = document.getElementById("moduleFiveTargetSelect");
      if (sel && other) {
        if (![].some.call(sel.options, o => o.value === other.id)) {
          const o = document.createElement("option"); o.value = other.id; o.textContent = other.id; sel.appendChild(o);
        }
        sel.value = other.id;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await gm.waitForFunction(() => { const e = document.querySelector(".bg3-hit-pct"); return e && /\d+%/.test(e.textContent); }, null, { timeout: 6000 });
    const pct = await gm.evaluate(() => document.querySelector(".bg3-hit-pct").textContent);
    check("BG3 HUD: mostra la percentuale di colpire sul bersaglio (" + pct + ")", /\d+%/.test(pct));
    const dmg = await gm.evaluate(() => { const e = document.querySelector(".bg3-dmg"); return e ? e.textContent : ""; });
    check("BG3 HUD: mostra l'anteprima del danno previsto (" + dmg + ")", /~\d+\s*danni/.test(dmg));
    const hasEnd = await gm.evaluate(() => Array.prototype.some.call(document.querySelectorAll(".bg3-btn"), b => /Termina turno/.test(b.textContent)));
    check("BG3 HUD: presente il pulsante 'Termina turno'", hasEnd === true);
    await gm.waitForSelector("#bg3ShoveButton", { timeout: 6000 });
    check("BG3 HUD: il modulo 26 inietta il pulsante 'Spingi'", true);
    const primaCella = await gm.evaluate(() => {
      const st = window.UltimateVTTCombat.getState();
      const cur = st.combatants[st.currentTurnIndex];
      const sel = document.getElementById("moduleFiveTargetSelect");
      const other = st.combatants.find(c => c.id !== cur.id && !c.defeated);
      if (sel && other) { sel.value = other.id; sel.dispatchEvent(new Event("change", { bubbles: true })); }
      const tp = window.UltimateVTTTokenPhysics.getState();
      const cellaBersaglio = tp.tokens.find(t => window.UltimateVTTCombatFSM.tokenACombattente(t.id) === other.id);
      return cellaBersaglio ? { cellX: cellaBersaglio.cellX, cellY: cellaBersaglio.cellY } : null;
    });
    check("BG3 HUD: bersaglio selezionato per il test di Spingi", !!primaCella);
    await gm.click("#bg3ShoveButton");
    await sleep(300); // la risoluzione di spingi() e' sincrona ma lascia respirare il rendering
    const esitoSpinta = await gm.evaluate(() => {
      const st = window.UltimateVTTCombat.getState();
      const cur = st.combatants[st.currentTurnIndex];
      const other = st.combatants.find(c => c.id !== cur.id && !c.defeated);
      const tp = window.UltimateVTTTokenPhysics.getState();
      const t = tp.tokens.find(tk => window.UltimateVTTCombatFSM.tokenACombattente(tk.id) === other.id);
      return t ? { cellX: t.cellX, cellY: t.cellY } : null;
    });
    check("BG3 HUD: Spingi si risolve senza errori di pagina (esito leggibile)", !!esitoSpinta);

    // --- Sincronizzazione multiplayer di Spingi: il Master spinge, il Giocatore vede il token
    // muoversi sul suo schermo (verifica il fix del guard isMasterOrSolo + emissione dell'evento).
    // La prova contrapposta resta genuinamente casuale: si ritenta invece di manipolare
    // rollD20WithMode, che e' condivisa col modulo 24 (reazioni) e non va falsata globalmente. ---
    const setup = await gm.evaluate(() => {
      const st = window.UltimateVTTCombat.getState();
      const cur = st.combatants[st.currentTurnIndex];
      const nemico = st.combatants.find(c => c.kind !== cur.kind && !c.defeated);
      if (!nemico) return { ok: false };
      const tokAttaccante = window.UltimateVTTCombatFSM.combattenteAToken(cur.id);
      const tokBersaglio = window.UltimateVTTCombatFSM.combattenteAToken(nemico.id);
      const sel = document.getElementById("moduleFiveTargetSelect");
      if (sel) { sel.value = nemico.id; sel.dispatchEvent(new Event("change", { bubbles: true })); }
      let esito = null;
      for (let i = 0; i < 10 && (!esito || !esito.successo); i++) {
        // Riposiziona adiacenti (attaccante in (10,10), bersaglio in (11,10)) prima di ogni tentativo.
        window.UltimateVTTTokenPhysics.moveTokenToCell(tokAttaccante, 10, 10, false);
        window.UltimateVTTTokenPhysics.moveTokenToCell(tokBersaglio, 11, 10, false);
        esito = window.UltimateVTTShove.spingi();
      }
      return { ok: true, tokBersaglio: tokBersaglio, successo: Boolean(esito && esito.successo) };
    });
    check("sync Spingi: la prova contrapposta riesce entro pochi tentativi", setup.ok === true && setup.successo === true);

    // Il Giocatore deve vedere il token del bersaglio arrivare alla cella (12,10) (spinto di 1 oltre),
    // ricevuto via TokenMovedEvent attraverso il relay reale, non via stato condiviso in-process.
    await pl.waitForFunction((tokId) => {
      const tp = window.UltimateVTTTokenPhysics.getState();
      const t = tp.tokens.find(tk => tk.id === tokId);
      return t && t.cellX === 12 && t.cellY === 10;
    }, setup.tokBersaglio, { timeout: 6000 });
    check("sync Spingi: il Giocatore riceve la spinta del Master via rete (token a 12,10)", true);

    // --- Superfici (modulo 27): il Master ne crea una via comando IA (createSurface), il
    // Giocatore la riceve via rete (SurfaceCreatedEvent) e il tick del danno risolve solo sul Master. ---
    const supSetup = await gm.evaluate(() => {
      if (!window.UltimateVTTAIBridge || !window.UltimateVTTSurfaces) { return { ok: false }; }
      const esito = window.UltimateVTTAIBridge.executeCommand({ command: "createSurface", type: "fuoco", cellX: 30, cellY: 30, radius: 1, rounds: 5 });
      return { ok: Boolean(esito && esito.ok) };
    });
    check("Superfici: comando IA createSurface eseguito dal Master", supSetup.ok === true);
    await pl.waitForFunction(() =>
      window.UltimateVTTSurfaces && window.UltimateVTTSurfaces.elencoAttivo().some(s => s.cellX === 30 && s.cellY === 30 && s.tipo === "fuoco"),
      null, { timeout: 6000 });
    check("Superfici: il Giocatore riceve la superficie del Master via rete", true);
    const raggioRicevuto = await pl.evaluate(() => {
      const s = window.UltimateVTTSurfaces.elencoAttivo().find(x => x.cellX === 30 && x.cellY === 30);
      return s ? s.raggio : null;
    });
    check("Superfici: i dati ricevuti dal Giocatore sono corretti (raggio 1)", raggioRicevuto === 1);

    // --- Elevazione (modulo 28): il Master ne dipinge un'area via comando IA (setElevation), il
    // Giocatore la riceve via rete (ElevationSetEvent). Verifica anche la lettura live sul GM. ---
    const elevSetup = await gm.evaluate(() => {
      if (!window.UltimateVTTAIBridge || !window.UltimateVTTElevation) { return { ok: false }; }
      const esito = window.UltimateVTTAIBridge.executeCommand({ command: "setElevation", cellX: 40, cellY: 40, radius: 1, level: 2 });
      return { ok: Boolean(esito && esito.ok) };
    });
    check("Elevazione: comando IA setElevation eseguito dal Master", elevSetup.ok === true);
    await pl.waitForFunction(() => window.UltimateVTTElevation && window.UltimateVTTElevation.quotaDi(40, 40) === 2, null, { timeout: 6000 });
    check("Elevazione: il Giocatore riceve la quota del Master via rete", true);
    const quotaAdiacente = await pl.evaluate(() => window.UltimateVTTElevation.quotaDi(41, 40));
    check("Elevazione: l'area dipinta (raggio 1) e' sincronizzata per intero", quotaAdiacente === 2);

    // --- Condizioni di stato (modulo 30): il Master ne applica una via comando IA (applyCondition),
    // il Giocatore la riceve via rete (ConditionSetEvent), poi il Master la rimuove (clearCondition)
    // e la rimozione si propaga a sua volta (ConditionClearedEvent). ---
    const condBersaglio = await gm.evaluate(() => {
      const st = window.UltimateVTTCombat.getState();
      const nemico = st.combatants.find(c => c.kind === "npc" && !c.defeated);
      return nemico ? nemico.id : null;
    });
    check("Condizioni: trovato un bersaglio nemico per il test", !!condBersaglio);
    const condSetup = await gm.evaluate((id) => {
      if (!window.UltimateVTTAIBridge || !window.UltimateVTTConditions) { return { ok: false }; }
      const esito = window.UltimateVTTAIBridge.executeCommand({ command: "applyCondition", targetId: id, condition: "prono", rounds: 3 });
      return { ok: Boolean(esito && esito.ok) };
    }, condBersaglio);
    check("Condizioni: comando IA applyCondition eseguito dal Master", condSetup.ok === true);
    await pl.waitForFunction((id) => window.UltimateVTTConditions && window.UltimateVTTConditions.haCondizione(id, "prono"), condBersaglio, { timeout: 6000 });
    check("Condizioni: il Giocatore riceve la condizione del Master via rete", true);

    const condRimozione = await gm.evaluate((id) => {
      const esito = window.UltimateVTTAIBridge.executeCommand({ command: "clearCondition", targetId: id, condition: "prono" });
      return { ok: Boolean(esito && esito.ok) };
    }, condBersaglio);
    check("Condizioni: comando IA clearCondition eseguito dal Master", condRimozione.ok === true);
    await pl.waitForFunction((id) => window.UltimateVTTConditions && !window.UltimateVTTConditions.haCondizione(id, "prono"), condBersaglio, { timeout: 6000 });
    check("Condizioni: la rimozione si propaga al Giocatore via rete", true);

    // --- IA dei nemici (modulo 33): al turno di un PNG, sul Master, il nemico agisce da solo. Con
    // il campionamento fermato all'inizio, si invoca _tick() in modo deterministico: si porta il
    // turno su un PNG vivo, si registrano gli HP del PG, si esegue un tick e si verifica che il
    // nemico abbia agito (il turno e' avanzato; e/o il PG ha subito danni se il nemico era a portata). ---
    const aiEsito = await gm.evaluate(() => {
      const C = window.UltimateVTTCombat;
      // Avvicina un goblin al PG cosi' l'attacco e' a portata, e porta il turno a quel goblin.
      const st = C.getState();
      const goblin = st.combatants.find(c => c.kind === "npc" && !c.defeated);
      if (!goblin) { return { ok: false }; }
      const tokGob = window.UltimateVTTCombatFSM.combattenteAToken(goblin.id);
      const tokPg = window.UltimateVTTCombatFSM.combattenteAToken("pc-local");
      const tp = window.UltimateVTTTokenPhysics.getState();
      const pgTok = tp.tokens.find(t => t.id === tokPg);
      if (pgTok && tokGob) { window.UltimateVTTTokenPhysics.moveTokenToCell(tokGob, pgTok.cellX + 1, pgTok.cellY, false); }
      // Ruota il turno finche' tocca a quel goblin.
      let guard = 0;
      while (guard++ < 12) { const s = C.getState(); if (s.combatants[s.currentTurnIndex] && s.combatants[s.currentTurnIndex].id === goblin.id) break; C.nextTurn(); }
      const roundPrima = C.getState().round;
      const idxPrima = C.getState().currentTurnIndex;
      // Un tick reale dell'IA: il goblin deve agire e concludere il turno.
      window.UltimateVTTEnemyAI._tick();
      const dopo = C.getState();
      return { ok: true, avanzato: (dopo.currentTurnIndex !== idxPrima) || (dopo.round !== roundPrima) };
    });
    check("IA nemici: al turno di un PNG il nemico agisce e conclude il turno (turno avanzato)", aiEsito.ok === true && aiEsito.avanzato === true);

    await gm.evaluate(() => window.UltimateVTTCombat && window.UltimateVTTCombat.endCombat());
    await gm.waitForFunction(() => { const h = document.querySelector(".bg3-hud"); return h && h.hidden === true; }, null, { timeout: 6000 });
    check("BG3 HUD: torna nascosta a fine combattimento", true);

    // --- Memoria di combattimento per il Master IA (modulo 29): a fine scontro il riepilogo deve
    // raggiungere davvero il canale della memoria del Master IA nell'app reale (js/12), non solo
    // nei test isolati in Node. ---
    await gm.waitForFunction(() =>
      window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.getUltimoRiepilogoCombattimento() !== "",
      null, { timeout: 6000 });
    const riepilogoReale = await gm.evaluate(() => window.UltimateVTTCoreGameplay.getUltimoRiepilogoCombattimento());
    check("Memoria Master IA: il riepilogo di fine combattimento raggiunge davvero js/12", /RIEPILOGO DEL COMBATTIMENTO/.test(riepilogoReale));
    check("Memoria Master IA: il riepilogo riporta un esito riconoscibile", /vittoria del party|sconfitta del party|combattimento interrotto/.test(riepilogoReale));

    // Disconnessione del giocatore -> il roster del GM torna a 1.
    await pl.click(".vtt-sess-btn:has-text('Disconnetti')");
    await gm.waitForFunction(() =>
      document.querySelectorAll(".vtt-sess-peer").length === 1, null, { timeout: 6000 });
    check("GM roster: dopo disconnessione del Giocatore torna a 1", true);

    // --- Ponte chat->combattimento (modulo 34): se il Master IA narra uno scontro SENZA emettere
    // il campo JSON "spawn" (caso reale osservato: "Goblin 1: 5/5 HP * Goblin 2..." con Combat: off),
    // il combat system deve attivarsi comunque, con i nemici giusti. Eseguito per ULTIMO: lo spawn
    // fa avanzare i contatori degli id di combattenti/token, e farlo prima della connessione del
    // Giocatore desincronizzerebbe gli id generati sulle due pagine (i test di rete assumono che
    // entrambe partano dagli stessi contatori). ---
    const primaDelPonte = await gm.evaluate(() => window.UltimateVTTCombat.getState().combatants.filter(c => c.kind === "npc").length);
    await gm.evaluate(() =>
      window.UltimateVTTCoreGameplay.appendChatMessage("master", "Un'imboscata! Tre goblin sbucano dai vicoli e vi attaccano: tirate l'iniziativa!"));
    await gm.waitForFunction(() => window.UltimateVTTCombat.getState().active === true, null, { timeout: 4000 });
    const dopoIlPonte = await gm.evaluate(() => window.UltimateVTTCombat.getState().combatants.filter(c => c.kind === "npc").length);
    check("Ponte chat→combattimento: la narrazione del Master attiva il combat system con 3 goblin", dopoIlPonte - primaDelPonte === 3);

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
