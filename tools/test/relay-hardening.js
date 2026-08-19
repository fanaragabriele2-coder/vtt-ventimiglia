// Test di hardening del relay (#4): avvia il relay come processo con AUTH_TOKEN + GM_TOKEN,
// poi apre client WebSocket grezzi per verificare auth, declassamento GM, rate-limit e validazione.
"use strict";
const net = require("net");
const crypto = require("crypto");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 4733;
const AUTH = "segreto-sessione";
const GMT = "segreto-master";

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function frameMascherato(testo) {
  const payload = Buffer.from(testo, "utf8");
  const lung = payload.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (lung < 126) { header = Buffer.from([0x81, 0x80 | lung]); }
  else if (lung < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(lung, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeUInt32BE(Math.floor(lung / 0x100000000), 2); header.writeUInt32BE(lung >>> 0, 6); }
  const masked = Buffer.alloc(lung);
  for (let i = 0; i < lung; i++) { masked[i] = payload[i] ^ mask[i % 4]; }
  return Buffer.concat([header, mask, masked]);
}

function creaDecoder(onMsg) {
  let buf = Buffer.alloc(0);
  return function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(6); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      if (opcode === 0x1) { onMsg(payload.toString("utf8")); }
      else if (opcode === 0x8) { onMsg("__CLOSE__"); }
    }
  };
}

// Apre un client WS grezzo; risolve quando l'handshake e' completo.
function creaClient() {
  return new Promise(function (resolve) {
    const sock = net.connect(PORT, "127.0.0.1", function () {
      const key = crypto.randomBytes(16).toString("base64");
      sock.write("GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
        "Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n");
    });
    const cli = { sock: sock, ricevuti: [], chiuso: false, invia: (o) => { try { sock.write(frameMascherato(JSON.stringify(o))); } catch (e) {} } };
    let handshake = false;
    const decoder = creaDecoder(function (t) {
      if (t === "__CLOSE__") { cli.chiuso = true; return; }
      try { cli.ricevuti.push(JSON.parse(t)); } catch (e) {}
    });
    sock.on("data", function (chunk) {
      if (!handshake) {
        const s = chunk.toString("utf8");
        const fine = s.indexOf("\r\n\r\n");
        if (s.indexOf("101") !== -1 && fine !== -1) {
          handshake = true;
          const resto = chunk.slice(Buffer.byteLength(s.slice(0, fine + 4)));
          if (resto.length) decoder(resto);
          resolve(cli);
        }
        return;
      }
      decoder(chunk);
    });
    sock.on("close", function () { cli.chiuso = true; });
    sock.on("error", function () { cli.chiuso = true; });
  });
}

(async () => {
  const relay = spawn("node", ["server/relay.js"], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), AUTH_TOKEN: AUTH, GM_TOKEN: GMT }),
    stdio: ["ignore", "ignore", "ignore"]
  });
  await sleep(700);
  let codice = 1;
  try {
    // 1) hello senza token -> AuthEvent fatale + chiusura.
    const c1 = await creaClient();
    c1.invia({ tipo: "hello", ruolo: "player", attore: "x", tokenPosseduti: ["token-pc"] });
    await sleep(250);
    const auth1 = c1.ricevuti.find(m => m.tipo === "AuthEvent" && m.ok === false);
    check("hello senza AUTH_TOKEN -> AuthEvent ok:false", !!auth1);
    check("AuthEvent e' fatale", !!(auth1 && auth1.fatale === true));
    check("connessione chiusa dopo auth fallita", c1.chiuso === true);

    // 2) auth ok ma ruolo gm senza GM_TOKEN -> declassamento (non fatale) + evento GM-only rifiutato.
    const c2 = await creaClient();
    c2.invia({ tipo: "hello", ruolo: "gm", attore: "fintoGm", token: AUTH }); // manca gmToken
    await sleep(200);
    c2.invia({ tipo: "TurnEndedEvent", seq: 10, payload: {} });
    await sleep(250);
    const auth2 = c2.ricevuti.find(m => m.tipo === "AuthEvent" && m.ok === false);
    check("gm senza GM_TOKEN -> AuthEvent declassamento", !!auth2);
    check("declassamento NON fatale", !!(auth2 && auth2.fatale === false));
    check("non chiuso (resta come giocatore)", c2.chiuso === false);
    check("evento GM-only rifiutato dopo declassamento", !!c2.ricevuti.find(m => m.tipo === "RejectEvent" && m.seq === 10));

    // 3) auth ok + GM_TOKEN corretto -> Master vero: evento GM-only accettato (eco broadcast).
    const c3 = await creaClient();
    c3.invia({ tipo: "hello", ruolo: "gm", attore: "veroGm", token: AUTH, gmToken: GMT });
    await sleep(200);
    c3.invia({ tipo: "TurnEndedEvent", seq: 11, payload: { a: "npc-1" } });
    await sleep(250);
    check("gm con GM_TOKEN -> evento GM-only accettato (eco)", !!c3.ricevuti.find(m => m.tipo === "TurnEndedEvent" && m.seq === 11));
    check("nessun rifiuto per il Master autenticato", !c3.ricevuti.find(m => m.tipo === "RejectEvent" && m.seq === 11));

    // 4) Rate limiting: raffica di 200 TokenMoved -> molti scartati, ma connessione viva.
    const c4 = await creaClient();
    c4.invia({ tipo: "hello", ruolo: "player", attore: "spam", token: AUTH, tokenPosseduti: ["token-pc"] });
    await sleep(150);
    for (let i = 0; i < 200; i++) {
      c4.invia({ tipo: "TokenMovedEvent", seq: 1000 + i, payload: { tokenId: "token-pc", cellaX: i % 30, cellaY: 1 } });
    }
    await sleep(400);
    const echi = c4.ricevuti.filter(m => m.tipo === "TokenMovedEvent" && m.seq >= 1000).length;
    check("rate-limit: parte della raffica passa (eco > 0)", echi > 0);
    check("rate-limit: raffica throttlata (eco < 200)", echi < 200);
    check("rate-limit: connessione ancora viva dopo la raffica", c4.chiuso === false);

    // 5) Validazione dimensione: messaggio enorme oltre il limite -> ignorato (nessuna eco), vivo.
    const c5 = await creaClient();
    c5.invia({ tipo: "hello", ruolo: "player", attore: "big", token: AUTH, tokenPosseduti: ["token-pc"] });
    await sleep(150);
    const enorme = "x".repeat(250000); // > MAX_MSG_CHARS (200KB), < MAX_FRAME (256KB)
    c5.invia({ tipo: "TokenMovedEvent", seq: 7777, payload: { tokenId: "token-pc", cellaX: 1, cellaY: 1, nota: enorme } });
    await sleep(300);
    check("messaggio sovradimensionato ignorato (nessuna eco)", !c5.ricevuti.find(m => m.tipo === "TokenMovedEvent" && m.seq === 7777));
    check("connessione viva dopo messaggio sovradimensionato", c5.chiuso === false);

    codice = falliti === 0 ? 0 : 1;
  } catch (e) {
    console.log("  ECCEZIONE: " + (e && e.message));
  } finally {
    try { relay.kill(); } catch (e) {}
  }
  console.log("\nRisultato relay hardening: " + passati + " passati, " + falliti + " falliti.");
  process.exit(codice);
})();
