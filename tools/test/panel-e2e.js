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

    // --- Layout cinematografico (modulo 35): mappa protagonista al centro, chat del Master
    // padrona della colonna destra, strumenti tecnici in un cassetto chiuso di default. ---
    const layoutIniziale = await gm.evaluate(() => {
      const drawer = document.getElementById("mapToolsDrawer");
      const label = document.querySelector(".stage-label");
      const body = document.querySelector(".side-panel.right .panel-body");
      const primo = body ? body.firstElementChild : null;
      const titolo = document.querySelector(".side-panel.right .panel-title");
      return {
        drawerChiuso: drawer ? window.getComputedStyle(drawer).display === "none" : null,
        labelNascosta: label ? window.getComputedStyle(label).display === "none" : null,
        chatInCima: Boolean(primo && primo.classList.contains("master-chat-panel")),
        diagChiusa: (function () { const d = document.getElementById("diagnosticsDrawer"); return d ? d.open === false : null; })(),
        titoloDestra: titolo ? titolo.textContent.trim() : ""
      };
    });
    check("Layout: gli strumenti del Master partono CHIUSI (niente pannello sopra la mappa)", layoutIniziale.drawerChiuso === true);
    check("Layout: nessuna etichetta diagnostica sopra la mappa", layoutIniziale.labelNascosta === true);
    check("Layout: la chat del Master e' il PRIMO elemento della colonna destra", layoutIniziale.chatInCima === true);
    check("Layout: la diagnostica sta in un cassetto richiudibile, chiuso di default", layoutIniziale.diagChiusa === true);
    check("Layout: la colonna destra si intitola 'Chat Master'", layoutIniziale.titoloDestra === "Chat Master");

    // --- Audio/voce non bloccante (modulo 09/13, Task 4): sulla pagina REALE (Web Speech API vera,
    // non un finto), tre chiamate ravvicinate a speakMaster() (come farebbe lo streaming del Task 1,
    // frase per frase) si ACCODANO senza cancel() distruttivo. Non si attende onstart/onend reali
    // (in Chromium headless il motore TTS puo' non avere un backend audio e non emetterli mai): si
    // verifica solo lo stato SINCRONO subito dopo ogni chiamata, che non dipende da quell'evento. ---
    const codaVoceReale = await gm.evaluate(() => {
      const A = window.UltimateVTTAudioVoice;
      if (!A) { return null; }
      A.stopVoice(); // stato pulito, non contaminato da eventuali chiamate precedenti
      const dopo1 = { parla: A.isSpeaking(), coda: A.getVoiceQueueLength() };
      A.speakMaster("Le ombre si allungano sulla piazza.");
      const dopo2 = { parla: A.isSpeaking(), coda: A.getVoiceQueueLength() };
      A.speakMaster("Un fruscio tra le colonne.");
      const dopo3 = { parla: A.isSpeaking(), coda: A.getVoiceQueueLength() };
      A.speakMaster("Qualcosa si muove nell'ombra.");
      const dopo4 = { parla: A.isSpeaking(), coda: A.getVoiceQueueLength() };
      A.stopVoice();
      const dopoStop = { parla: A.isSpeaking(), coda: A.getVoiceQueueLength() };
      return { dopo1, dopo2, dopo3, dopo4, dopoStop };
    });
    check("Voce Master: prima battuta parte subito (coda vuota, in corso)", !!codaVoceReale && codaVoceReale.dopo2.parla === true && codaVoceReale.dopo2.coda === 0);
    check("Voce Master: seconda battuta ravvicinata si ACCODA (niente cancel distruttivo)", !!codaVoceReale && codaVoceReale.dopo3.coda === 1);
    check("Voce Master: terza battuta ravvicinata si accoda a sua volta", !!codaVoceReale && codaVoceReale.dopo4.coda === 2);
    check("Voce Master: stopVoice() svuota la coda e ferma la lettura", !!codaVoceReale && codaVoceReale.dopoStop.parla === false && codaVoceReale.dopoStop.coda === 0);

    // I suoni procedurali (impatto/doom/dadi, con e senza riverbero) non devono generare errori
    // di pagina sul vero AudioContext del browser (la forma del grafo e' gia' provata dalla suite
    // unit con nodi finti; qui interessa solo che non rompano nulla su un contesto audio reale).
    const suoniOk = await gm.evaluate(() => {
      try {
        window.UltimateVTTAudioVoice.playImpact();
        window.UltimateVTTAudioVoice.playDoom();
        window.UltimateVTTAudioVoice.playDiceClatter();
        return true;
      } catch (e) { return false; }
    });
    check("Audio procedurale: impatto/doom/dadi (con e senza riverbero) suonano senza errori sul vero AudioContext", suoniOk === true);

    // --- Tastiera virtuale (Task 5): quando l'area visibile si accorcia (tastiera aperta),
    // js/12 scrive --vvh e accende body.keyboard-aperta, e il CSS accorcia #app a quell'altezza.
    // In headless non si puo' aprire una tastiera vera: si pilota l'API esposta con altezze finte
    // e si misura l'ALTEZZA REALE CALCOLATA di #app (il layout deve ricalcolarsi davvero). ---
    const esitoTastiera = await gm.evaluate(() => {
      const V = window.UltimateVTTViewport;
      if (!V) { return null; }
      V.applica(window.innerHeight, 400);
      const conTastiera = {
        classe: document.body.classList.contains("keyboard-aperta"),
        vvh: getComputedStyle(document.documentElement).getPropertyValue("--vvh").trim(),
        altezzaApp: Math.round(document.getElementById("app").getBoundingClientRect().height)
      };
      V.applica(window.innerHeight, window.innerHeight);
      const dopoChiusura = {
        classe: document.body.classList.contains("keyboard-aperta"),
        altezzaApp: Math.round(document.getElementById("app").getBoundingClientRect().height)
      };
      return { conTastiera: conTastiera, dopoChiusura: dopoChiusura };
    });
    check("Tastiera virtuale: classe accesa e --vvh con l'altezza visibile (400px)",
      !!esitoTastiera && esitoTastiera.conTastiera.classe === true && esitoTastiera.conTastiera.vvh === "400px");
    check("Tastiera virtuale: #app si accorcia DAVVERO a 400px (la flexbox si ricalcola, niente input sotto la tastiera)",
      !!esitoTastiera && esitoTastiera.conTastiera.altezzaApp === 400);
    check("Tastiera virtuale: alla chiusura #app torna a schermo pieno e la classe si spegne",
      !!esitoTastiera && esitoTastiera.dopoChiusura.classe === false && esitoTastiera.dopoChiusura.altezzaApp > 400);

    // --- Net outbox (modulo 42, "Supabase-ready"): una raffica di danni sulla pagina REALE
    // produce UN delta coalizzato con gli HP finali, non un payload per ogni tick dello slider. ---
    const outboxPrima = await gm.evaluate(() => window.UltimateVTTNetOutbox.getOutbox().length);
    await gm.evaluate(() => {
      for (let i = 0; i < 12; i++) { window.UltimateVTTState.applyDamage(1); }
    });
    await gm.waitForFunction((prima) => {
      const p = window.UltimateVTTNetOutbox.getUltimoPayload();
      return window.UltimateVTTNetOutbox.getOutbox().length > prima && p && p.delta && p.delta.pg;
    }, outboxPrima, { timeout: 4000 });
    const esitoOutbox = await gm.evaluate((prima) => {
      const box = window.UltimateVTTNetOutbox.getOutbox();
      const p = window.UltimateVTTNetOutbox.getUltimoPayload();
      window.UltimateVTTState.heal(999); // ripristina gli HP per i test successivi
      return { nuovi: box.length - prima, hp: p.delta.pg.hp.current, v: p.v };
    }, outboxPrima);
    check("Net outbox: 12 danni a raffica -> UN solo delta coalizzato (non 12)", esitoOutbox.nuovi === 1);
    check("Net outbox: il payload e' versionato e porta gli HP finali", esitoOutbox.v === 1 && typeof esitoOutbox.hp === "number");

    // --- Canvas con cache offscreen (modulo 07, Task 3): a regime i frame sono solo blit — i
    // ridisegni PIENI del terreno restano fermi anche forzando piu' render consecutivi. ---
    const esitoCache = await gm.evaluate(() => {
      const prima = window.UltimateVTTCanvas.getRenderStats();
      for (let i = 0; i < 8; i++) { window.UltimateVTTCanvas.renderCanvasNow(); }
      const dopo = window.UltimateVTTCanvas.getRenderStats();
      return { framesCresciuti: dopo.frames - prima.frames, terrenoExtra: dopo.terrainRedraws - prima.terrainRedraws, nebbiaExtra: dopo.fogRedraws - prima.fogRedraws };
    });
    check("Canvas: 8 frame forzati -> zero ridisegni pieni di terreno/nebbia (cache a regime)",
      esitoCache.framesCresciuti === 8 && esitoCache.terrenoExtra === 0 && esitoCache.nebbiaExtra === 0);

    // --- Transizione canvas <-> mappa reale Ventimiglia (Task 3b): niente conflitti di
    // pointer-events. Con la mappa reale attiva, il cassetto Strumenti resta CLICCABILE
    // (prima la stage-overlay veniva spenta in blocco e il cassetto era visibile ma morto). ---
    await gm.evaluate(() => window.VentimigliaMap.activate());
    await gm.waitForFunction(() => document.querySelector(".stage").classList.contains("ventimiglia-attiva"), null, { timeout: 4000 });
    const conflitti = await gm.evaluate(() => {
      const stage = document.querySelector(".stage");
      const overlay = document.querySelector(".stage-overlay");
      const drawer = document.getElementById("mapToolsDrawer");
      return {
        vignettaSpenta: window.getComputedStyle(stage, "::after").display === "none",
        overlayPassante: window.getComputedStyle(overlay).pointerEvents === "none",
        cassettoCliccabile: window.getComputedStyle(drawer).pointerEvents === "auto",
        mappaVisibile: document.getElementById("ventimigliaMapDiv").style.display === "block"
      };
    });
    check("Ventimiglia attiva: overlay passante ai click MA cassetto Strumenti ancora cliccabile",
      conflitti.overlayPassante === true && conflitti.cassettoCliccabile === true);
    check("Ventimiglia attiva: vignetta spenta e mappa reale visibile",
      conflitti.vignettaSpenta === true && conflitti.mappaVisibile === true);
    await gm.evaluate(() => window.VentimigliaMap.deactivate());
    await gm.waitForFunction(() => !document.querySelector(".stage").classList.contains("ventimiglia-attiva"), null, { timeout: 4000 });
    check("Tornati al canvas tattico: la classe di transizione viene rimossa", true);

    await gm.click("#mapToolsToggleBtn");
    await gm.waitForFunction(() => {
      const d = document.getElementById("mapToolsDrawer");
      return d && window.getComputedStyle(d).display !== "none";
    }, null, { timeout: 4000 });
    check("Layout: 🛠 STRUMENTI apre il cassetto degli strumenti", true);
    await gm.click("#mapToolsCloseBtn");
    await gm.waitForFunction(() => {
      const d = document.getElementById("mapToolsDrawer");
      return d && window.getComputedStyle(d).display === "none";
    }, null, { timeout: 4000 });
    check("Layout: la ✕ richiude il cassetto (la mappa torna libera)", true);

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

    // --- Party multi-token: a combattimento attivo OGNI membro del roster hotseat ha il SUO
    // token alleato sulla griglia (fix "nel party siamo in 2 ma vedo solo un player"), e il token
    // principale mostra il nome REALE del PG attivo, non piu' "Eroe Locale". ---
    const esitoPartyToken = await gm.evaluate(() => {
      const tokens = window.UltimateVTTTokenPhysics.getState().tokens;
      const alleati = tokens.filter((t) => t.kind === "pc" && t.id !== "token-pc");
      const principale = tokens.find((t) => t.id === "token-pc");
      const nomeAttivo = window.UltimateVTTState.getState().identity.name;
      const combattentiParty = window.UltimateVTTCombat.getState().combatants.filter((c) => c.kind === "pc" && c.id !== "pc-local");
      const tuttiMappati = combattentiParty.every((c) => {
        const tokId = window.UltimateVTTCombatFSM.combattenteAToken(c.id);
        return tokId && tokens.some((t) => t.id === tokId);
      });
      return { alleati: alleati.length, membri: combattentiParty.length, nomePrincipale: principale ? principale.name : "", nomeAttivo: nomeAttivo, tuttiMappati: tuttiMappati };
    });
    check("Party: ogni membro del roster ha il suo token alleato sulla griglia (" + esitoPartyToken.alleati + " per " + esitoPartyToken.membri + " membri)",
      esitoPartyToken.membri >= 1 && esitoPartyToken.alleati >= esitoPartyToken.membri);
    check("Party: ogni combattente pc-party e' collegato a un token esistente (FSM)", esitoPartyToken.tuttiMappati === true);
    check("Party: il token principale mostra il nome del PG attivo (" + esitoPartyToken.nomePrincipale + ")",
      esitoPartyToken.nomePrincipale === esitoPartyToken.nomeAttivo && esitoPartyToken.nomePrincipale !== "Eroe Locale");
    // Una SOLA striscia d'iniziativa: con la barra BG3 presente, la vecchia #initiativeStrip
    // (modulo 06) deve restare spenta anche a combattimento attivo — prima comparivano entrambe,
    // sovrapposte, a dire la stessa cosa.
    const stripLegacy = await gm.evaluate(() => {
      const s = document.getElementById("initiativeStrip");
      return s ? { visibile: s.classList.contains("is-visible"), righe: s.children.length } : null;
    });
    check("Una sola barra iniziativa: la vecchia initiative strip resta spenta in combattimento", stripLegacy !== null && stripLegacy.visibile === false && stripLegacy.righe === 0);
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

    // --- Anti-clutter (Task 5), misure REALI a combattimento attivo: hit-box dei pulsanti
    // azione >= 44px e barre HP/movimento che animano su transform (scaleX), non su width. ---
    const esitoAntiClutter = await gm.evaluate(() => {
      const btn = document.querySelector(".bg3-btn");
      const rectBtn = btn ? btn.getBoundingClientRect() : null;
      const fill = document.querySelector(".bg3-init-hpfill");
      const movFill = document.querySelector(".bg3-move-fill");
      return {
        altezzaBtn: rectBtn ? rectBtn.height : 0,
        larghezzaBtn: rectBtn ? rectBtn.width : 0,
        transizioneFill: fill ? getComputedStyle(fill).transitionProperty : "",
        trasformataFill: fill ? fill.style.transform : "",
        larghezzaInlineFill: fill ? fill.style.width : "residua",
        transizioneMov: movFill ? getComputedStyle(movFill).transitionProperty : ""
      };
    });
    check("Anti-clutter: i pulsanti azione BG3 misurano almeno 44x44px reali (" + Math.round(esitoAntiClutter.altezzaBtn) + "px)",
      esitoAntiClutter.altezzaBtn >= 44 && esitoAntiClutter.larghezzaBtn >= 44);
    check("Anti-clutter: la barra HP anima su transform con scaleX inline (niente width -> niente reflow)",
      /transform/.test(esitoAntiClutter.transizioneFill) && /scaleX/.test(esitoAntiClutter.trasformataFill) && esitoAntiClutter.larghezzaInlineFill === "");
    check("Anti-clutter: la barra movimento anima su transform",
      /transform/.test(esitoAntiClutter.transizioneMov));

    // --- Arena tattica (modulo 40) + menu azioni (modulo 38): a combattimento attivo la scena e'
    // strategica (insegna del luogo, pulsante Sposta per il movimento col click) e la barra azioni
    // offre il menu dinamico delle Azioni Bonus. ---
    await gm.waitForFunction(() => {
      const b = document.getElementById("arenaLuogoBanner");
      return b && !b.hidden && b.textContent.length > 3;
    }, null, { timeout: 6000 });
    check("Arena: l'insegna del LUOGO del combattimento compare sopra la scena", true);
    await gm.waitForSelector("#bg3MoveButton", { timeout: 6000 });
    check("Arena: il pulsante '👣 Sposta' (movimento col click) e' nella barra azioni", true);
    await gm.waitForSelector("#bg3BonusButton", { timeout: 6000 });
    check("Azioni: il pulsante '⚡ Bonus' (menu dinamico) e' nella barra azioni", true);
    const spostaFunziona = await gm.evaluate(() => {
      // La modalita' movimento si attiva/disattiva senza errori (il click sulla cella e' provato
      // dalla suite unit del modulo 40; qui si verifica il collegamento reale del pulsante).
      document.getElementById("bg3MoveButton").click();
      const attivo = window.UltimateVTTArena.movimentoAttivo();
      window.UltimateVTTArena.attivaModalitaMovimento(false);
      return attivo === true && window.UltimateVTTArena.movimentoAttivo() === false;
    });
    check("Arena: 'Sposta' attiva e disattiva la modalita' movimento", spostaFunziona === true);
    const primaCella = await gm.evaluate(() => {
      const st = window.UltimateVTTCombat.getState();
      const cur = st.combatants[st.currentTurnIndex];
      const sel = document.getElementById("moduleFiveTargetSelect");
      // Il bersaglio della Spinta deve essere un PNG (ha un token sulla griglia); un membro del
      // party hotseat ("pc-party-*") non ha token e la cella non sarebbe risolvibile.
      const other = st.combatants.find(c => c.kind === "npc" && !c.defeated);
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
      // Come sopra: il bersaglio deve essere un PNG (ha sempre un token). Un membro del party
      // hotseat ("pc-party-*") non ne ha uno — se "other" ne pescasse uno per caso (dipende
      // dall'ordine d'iniziativa, casuale), la cella risulterebbe irrisolvibile per un motivo
      // estraneo alla Spinta stessa, con un fallimento intermittente del test.
      const other = st.combatants.find(c => c.kind === "npc" && !c.defeated);
      const tp = window.UltimateVTTTokenPhysics.getState();
      const t = other && tp.tokens.find(tk => window.UltimateVTTCombatFSM.tokenACombattente(tk.id) === other.id);
      return t ? { cellX: t.cellX, cellY: t.cellY } : null;
    });
    check("BG3 HUD: Spingi si risolve senza errori di pagina (esito leggibile)", !!esitoSpinta);

    // --- Sincronizzazione multiplayer di Spingi: il Master spinge, il Giocatore vede il token
    // muoversi sul suo schermo (verifica il fix del guard isMasterOrSolo + emissione dell'evento).
    // La prova contrapposta resta genuinamente casuale: si ritenta invece di manipolare
    // rollD20WithMode, che e' condivisa col modulo 24 (reazioni) e non va falsata globalmente. ---
    const setup = await gm.evaluate(() => {
      // Ruota il turno fino a pc-local: e' l'unico PG con un token sulla griglia (i membri
      // "pc-party-*" del roster hotseat non hanno token), e la Spinta richiede le posizioni.
      let guardiaTurno = 0;
      while (guardiaTurno++ < 20) {
        const s = window.UltimateVTTCombat.getState();
        const c = s.combatants[s.currentTurnIndex];
        if (c && c.id === "pc-local") break;
        window.UltimateVTTCombat.nextTurn();
      }
      const st = window.UltimateVTTCombat.getState();
      const cur = st.combatants[st.currentTurnIndex];
      const nemico = st.combatants.find(c => c.kind === "npc" && !c.defeated);
      if (!nemico || !cur || cur.id !== "pc-local") return { ok: false };
      const tokAttaccante = window.UltimateVTTCombatFSM.combattenteAToken(cur.id);
      const tokBersaglio = window.UltimateVTTCombatFSM.combattenteAToken(nemico.id);
      const sel = document.getElementById("moduleFiveTargetSelect");
      if (sel) { sel.value = nemico.id; sel.dispatchEvent(new Event("change", { bubbles: true })); }
      // L'arena tattica (modulo 40) puo' aver piazzato ostacoli casuali: libera le celle usate da
      // questo test deterministico (attaccante, bersaglio e destinazione della spinta).
      if (window.UltimateVTTCanvas && window.UltimateVTTCanvas.setTerrainAt) {
        [[10, 10], [11, 10], [12, 10]].forEach(c => window.UltimateVTTCanvas.setTerrainAt(c[0], c[1], "stone"));
      }
      // La prova contrapposta resta genuinamente casuale, ma col PG di default (Atletica +2) contro
      // il goblin (+4) i 10 tentativi originali fallivano tutti in ~1 run su 160: flake raro ma
      // reale, visto piu' volte. Forza temporaneamente alta (+5) e piu' tentativi rendono la
      // probabilita' di fallimento totale trascurabile (~1e-8) SENZA falsare rollD20WithMode,
      // che resta condivisa col modulo 24 (reazioni).
      const forzaOriginale = window.UltimateVTTState.getState().abilities.str.score;
      window.UltimateVTTState.setAbilityScore("str", 20);
      let esito = null;
      for (let i = 0; i < 25 && (!esito || !esito.successo); i++) {
        // La Spinta di un PG spende l'Azione Bonus: tra un tentativo e l'altro il pool va
        // ripristinato (in gioco lo fa il cambio turno), altrimenti dal 2° tentativo e' rifiutata.
        if (window.UltimateVTTInventory && window.UltimateVTTInventory.resetTurn) window.UltimateVTTInventory.resetTurn();
        // Riposiziona adiacenti (attaccante in (10,10), bersaglio in (11,10)) prima di ogni tentativo.
        window.UltimateVTTTokenPhysics.moveTokenToCell(tokAttaccante, 10, 10, false);
        window.UltimateVTTTokenPhysics.moveTokenToCell(tokBersaglio, 11, 10, false);
        esito = window.UltimateVTTShove.spingi();
      }
      window.UltimateVTTState.setAbilityScore("str", forzaOriginale);
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
    // turno su un PNG vivo e si esegue un tick. L'attacco ora usa l'HUD dadi ANIMATA (stessa del
    // giocatore, cosi' si vede quanti danni fa il nemico): il turno del PNG avanza solo a fine
    // animazione, in modo asincrono, quindi si attende con waitForFunction invece di leggere lo
    // stato subito dopo _tick(). ---
    const aiSetup = await gm.evaluate(() => {
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
      // Un tick reale dell'IA: il goblin deve iniziare ad agire (attacco animato in corso).
      window.UltimateVTTEnemyAI._tick();
      return { ok: true, roundPrima, idxPrima };
    });
    check("IA nemici: setup del turno del PNG riuscito", aiSetup.ok === true);

    await gm.waitForFunction(() => {
      const hud = document.getElementById("attackPhaseHud");
      return hud && hud.classList.contains("is-visible");
    }, null, { timeout: 4000 });
    check("IA nemici: l'attacco del PNG mostra l'HUD dadi animata (si vedono i danni che infligge)", true);

    await gm.waitForFunction(([roundPrima, idxPrima]) => {
      const s = window.UltimateVTTCombat.getState();
      return s.currentTurnIndex !== idxPrima || s.round !== roundPrima;
    }, [aiSetup.roundPrima, aiSetup.idxPrima], { timeout: 6000 });
    check("IA nemici: a fine animazione il turno del PNG avanza davvero (nextTurn via onComplete)", true);

    const hudChiusa = await gm.evaluate(() => {
      const hud = document.getElementById("attackPhaseHud");
      return !hud || !hud.classList.contains("is-visible");
    });
    check("IA nemici: l'HUD dadi si richiude da sola a fine animazione", hudChiusa === true);

    // --- VITTORIA AUTOMATICA: uccidi tutti i nemici e verifica che lo scontro finisca DA SOLO
    // (prima serviva premere "End" a mano e la chat del Master restava in pausa per sempre). ---
    await gm.evaluate(() => {
      const C = window.UltimateVTTCombat;
      C.getState().combatants.filter(c => c.kind === "npc" && !c.defeated).forEach(n => C.applyDamageToCombatant(n.id, 9999));
    });
    await gm.waitForFunction(() => window.UltimateVTTCombat.getState().active === false, null, { timeout: 6000 });
    check("VITTORIA: uccisi tutti i nemici, il combattimento termina DA SOLO", true);
    const vittoriaInChat = await gm.evaluate(() => /VITTORIA/i.test(document.getElementById("masterChatLog").textContent));
    check("VITTORIA: l'annuncio arriva nella chat del Master (che si riattiva)", vittoriaInChat === true);
    await gm.waitForFunction(() => { const h = document.querySelector(".bg3-hud"); return h && h.hidden === true; }, null, { timeout: 6000 });
    check("BG3 HUD: torna nascosta a fine combattimento", true);

    // --- PNG caduti: i token dei nemici uccisi SPARISCONO dalla griglia (fix "i nemici quando
    // vengono uccisi devono sparire dalla mappa"), sul Master subito e sul Giocatore via rete
    // (CombatantHpEvent -> applyDamageToCombatant -> stessa transizione di sconfitta). ---
    const tokenNemiciGm = await gm.evaluate(() =>
      window.UltimateVTTTokenPhysics.getState().tokens.filter((t) => t.kind === "npc" && /^token-extra-/.test(t.id)).length);
    check("PNG caduti: sul Master non resta NESSUN token dei nemici uccisi", tokenNemiciGm === 0);
    await pl.waitForFunction(() =>
      window.UltimateVTTTokenPhysics.getState().tokens.filter((t) => t.kind === "npc" && /^token-extra-/.test(t.id)).length === 0,
      null, { timeout: 6000 });
    check("PNG caduti: anche sul Giocatore i token dei nemici uccisi spariscono (via rete)", true);
    // Chiudi eventuali popup di bottino aperti dalle uccisioni (per non coprire i passi successivi).
    await gm.evaluate(() => {
      for (let i = 0; i < 8; i++) { const b = document.getElementById("lpTake"); if (b) b.click(); else break; }
    });

    // --- Memoria di combattimento per il Master IA (modulo 29): a fine scontro il riepilogo deve
    // raggiungere davvero il canale della memoria del Master IA nell'app reale (js/12), non solo
    // nei test isolati in Node. ---
    await gm.waitForFunction(() =>
      window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.getUltimoRiepilogoCombattimento() !== "",
      null, { timeout: 6000 });
    const riepilogoReale = await gm.evaluate(() => window.UltimateVTTCoreGameplay.getUltimoRiepilogoCombattimento());
    check("Memoria Master IA: il riepilogo di fine combattimento raggiunge davvero js/12", /RIEPILOGO DEL COMBATTIMENTO/.test(riepilogoReale));
    check("Memoria Master IA: il riepilogo riporta un esito riconoscibile", /vittoria del party|sconfitta del party|combattimento interrotto/.test(riepilogoReale));

    // Le uccisioni della vittoria fanno comparire i popup di bottino ANCHE sul Giocatore (il suo
    // js/15 rileva le stesse sconfitte via rete): vanno chiusi o intercettano i click successivi.
    // La coda ne mostra uno alla volta: si chiudono finche' non ne restano.
    for (let giro = 0; giro < 10; giro++) {
      const ancoraAperto = await pl.evaluate(() => {
        const pop = document.getElementById("vttLootPop");
        if (!pop || !pop.classList.contains("show")) return false;
        const b = document.getElementById("lpTake") || document.getElementById("lpLeave");
        if (b) b.click();
        return true;
      });
      if (!ancoraAperto) break;
      await sleep(150);
    }

    // Disconnessione del giocatore -> il roster del GM torna a 1. Click via JS: la coda dei popup
    // di bottino puo' mostrarne uno NUOVO in qualsiasi momento (asincrona) e un click "fisico" di
    // Playwright verrebbe intercettato dall'overlay; qui interessa il flusso di disconnessione,
    // non la cliccabilita' visiva del pulsante (coperta dai passi precedenti sul pannello).
    await pl.evaluate(() => {
      const btn = Array.from(document.querySelectorAll(".vtt-sess-btn")).find(b => /Disconnetti/.test(b.textContent));
      if (btn) btn.click();
    });
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
