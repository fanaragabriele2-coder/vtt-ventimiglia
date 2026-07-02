// Test di resilienza del relay (#1 degli "essenziali"): verifica che un errore di processo
// reale (porta gia' in uso) sia gestito con un messaggio chiaro e un'uscita pulita, invece di
// uno stack trace non gestito o un hang. Verifica anche che il relay resti operativo per i
// client gia' connessi mentre un secondo processo fallisce ad avviarsi sulla stessa porta.
"use strict";
const path = require("path");
const net = require("net");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 4744;

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function avvia(env) {
  const p = spawn("node", ["server/relay.js"], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) }, env || {}),
    stdio: ["ignore", "pipe", "pipe"]
  });
  p.out = "";
  p.stdout.on("data", (d) => { p.out += d.toString(); });
  p.stderr.on("data", (d) => { p.out += d.toString(); });
  return p;
}

function handshakeOk() {
  return new Promise(function (resolve) {
    const sock = net.connect(PORT, "127.0.0.1", function () {
      const key = crypto.randomBytes(16).toString("base64");
      sock.write("GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
        "Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n");
    });
    let risolto = false;
    sock.on("data", function (chunk) {
      if (!risolto && chunk.toString("utf8").indexOf("101") !== -1) { risolto = true; sock.destroy(); resolve(true); }
    });
    sock.on("error", function () { if (!risolto) { risolto = true; resolve(false); } });
    setTimeout(function () { if (!risolto) { risolto = true; sock.destroy(); resolve(false); } }, 1500);
  });
}

(async () => {
  let codice = 1;
  const primario = avvia({});
  await sleep(700);
  try {
    check("relay primario: handshake riuscito (operativo)", await handshakeOk());

    // Secondo processo sulla STESSA porta: deve fallire con EADDRINUSE gestito, non con un crash.
    const secondario = avvia({});
    const uscita = await new Promise(function (resolve) {
      secondario.on("exit", function (code) { resolve(code); });
      setTimeout(function () { resolve(null); }, 3000); // timeout di sicurezza: non deve restare appeso
    });

    check("secondo processo termina (non resta appeso)", uscita !== null);
    check("secondo processo esce con codice 1 (errore gestito, non crash)", uscita === 1);
    check("messaggio EADDRINUSE chiaro nei log (non uno stack trace grezzo)",
      /porta\s+4744\s+e'\s+gia'\s+in\s+uso/i.test(secondario.out));
    check("nessuno stack trace 'throw' non gestito nei log del secondo processo",
      !/internal\/process\/promises|Unhandled 'error' event/.test(secondario.out));

    // Il relay primario deve essere rimasto vivo e operativo dopo il conflitto sul secondo.
    check("relay primario ancora operativo dopo il conflitto di porta", await handshakeOk());

    codice = falliti === 0 ? 0 : 1;
  } catch (e) {
    console.log("  ECCEZIONE: " + (e && e.message));
  } finally {
    try { primario.kill(); } catch (e) {}
  }
  console.log("\nRisultato relay resilience: " + passati + " passati, " + falliti + " falliti.");
  process.exit(codice);
})();
