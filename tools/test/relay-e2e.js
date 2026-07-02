// E2E del relay: avvia il relay in-process e ci collega un client WebSocket grezzo.
"use strict";
const net = require("net");
const crypto = require("crypto");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

process.env.PORT = "4699";
require(path.join(ROOT, "server", "relay.js")); // avvia server.listen(4699)

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

function frameMascherato(testo) {
  const payload = Buffer.from(testo, "utf8");
  const lung = payload.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (lung < 126) { header = Buffer.from([0x81, 0x80 | lung]); }
  else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(lung, 2); }
  const masked = Buffer.alloc(lung);
  for (let i = 0; i < lung; i++) { masked[i] = payload[i] ^ mask[i % 4]; }
  return Buffer.concat([header, mask, masked]);
}

// Decoder minimale dei frame server (non mascherati).
function creaDecoder(onMsg) {
  let buf = Buffer.alloc(0);
  return function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f; let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      if (opcode === 0x1) { onMsg(payload.toString("utf8")); }
    }
  };
}

setTimeout(function () {
  const sock = net.connect(4699, "127.0.0.1", function () {
    const key = crypto.randomBytes(16).toString("base64");
    sock.write(
      "GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      "Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n"
    );
  });

  let handshakeFatto = false;
  const ricevuti = [];
  const decoder = creaDecoder(function (testo) {
    try { ricevuti.push(JSON.parse(testo)); } catch (e) {}
  });

  sock.on("data", function (chunk) {
    if (!handshakeFatto) {
      const s = chunk.toString("utf8");
      const fine = s.indexOf("\r\n\r\n");
      if (s.indexOf("101") !== -1 && fine !== -1) {
        handshakeFatto = true;
        check("handshake 101 ricevuto", true);
        check("header Sec-WebSocket-Accept presente", /sec-websocket-accept/i.test(s));
        // hello come giocatore proprietario di token-pc
        sock.write(frameMascherato(JSON.stringify({ tipo: "hello", ruolo: "player", attore: "p1", tokenPosseduti: ["token-pc"] })));
        // evento GM-only -> atteso RejectEvent
        sock.write(frameMascherato(JSON.stringify({ tipo: "TurnEndedEvent", seq: 7, attore: "p1", ruolo: "player", payload: {} })));
        // movimento di token posseduto -> atteso broadcast (eco)
        sock.write(frameMascherato(JSON.stringify({ tipo: "TokenMovedEvent", seq: 8, attore: "p1", ruolo: "player", payload: { tokenId: "token-pc", cellaX: 3, cellaY: 4 } })));
        const resto = chunk.slice(Buffer.byteLength(s.slice(0, fine + 4)));
        if (resto.length) { decoder(resto); }
      }
      return;
    }
    decoder(chunk);
  });

  setTimeout(function () {
    const reject = ricevuti.find(m => m.tipo === "RejectEvent" && m.seq === 7);
    check("RejectEvent per evento GM-only di un giocatore", !!reject);
    check("RejectEvent ha un motivo", !!(reject && reject.motivo));
    const eco = ricevuti.find(m => m.tipo === "TokenMovedEvent" && m.seq === 8);
    check("broadcast (eco) del TokenMoved posseduto", !!eco);
    check("eco contiene la cella corretta", !!(eco && eco.payload && eco.payload.cellaX === 3));
    console.log("\nRisultato relay E2E: " + passati + " passati, " + falliti + " falliti.");
    try { sock.destroy(); } catch (e) {}
    process.exit(falliti === 0 ? 0 : 1);
  }, 400);
}, 200);
