/*
 * relay.js — Relay WebSocket autorevole per il VTT (Fase 1, lato server).
 *
 * Scopo: fare da fonte di verita' per la sincronizzazione real-time e da confine di fiducia
 * per l'autorizzazione dei ruoli. NON dipende da pacchetti esterni: implementa il minimo
 * indispensabile del protocollo WebSocket (RFC 6455) su 'http' + 'crypto' nativi.
 *
 * Regole di autorita' (rispecchiano UltimateVTTSync.autorizzato lato client):
 *   - Eventi GM-only (TurnEnded, CombatStarted, CombatControl, FogRevealed, StateSync):
 *       accettati SOLO da una connessione con ruolo "gm".
 *   - TokenMoved da un giocatore: accettato solo se il token e' tra quelli posseduti
 *       (dichiarati nel messaggio "hello").
 *   - Eventi accettati: ritrasmessi a tutti i client (incluso il mittente, la cui eco vale da ACK).
 *   - Eventi rifiutati: al solo mittente viene inviato { tipo: "RejectEvent", seq, motivo }.
 *
 * Uso:  node server/relay.js            (porta 4600 di default)
 *       PORT=5000 node server/relay.js
 */
"use strict";

const http = require("http");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT, 10) || 4600;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"; // costante di handshake RFC 6455

// Tipi di evento che solo il Master puo' originare.
const SOLO_MASTER = {
  TurnEndedEvent: true,
  CombatStartedEvent: true,
  CombatControlEvent: true,
  FogRevealedEvent: true,
  StateSyncEvent: true
};

let prossimoId = 1;
const client = new Map(); // id -> { socket, ruolo, attore, tokenPosseduti:Set, buffer:Buffer, vivo }

// ---------------------------------------------------------------------------
// Server HTTP + upgrade a WebSocket
// ---------------------------------------------------------------------------
const server = http.createServer(function (req, res) {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("VTT relay attivo. Connettiti via WebSocket su ws://<host>:" + PORT + "/");
});

server.on("upgrade", function (req, socket) {
  const chiave = req.headers["sec-websocket-key"];
  if (!chiave) { socket.destroy(); return; }

  const accept = crypto.createHash("sha1").update(chiave + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );

  const id = prossimoId++;
  const info = { socket: socket, ruolo: "player", attore: "anon-" + id, tokenPosseduti: new Set(), buffer: Buffer.alloc(0), vivo: true };
  client.set(id, info);
  log("Client #" + id + " connesso (" + client.size + " totali).");

  socket.on("data", function (chunk) {
    info.buffer = Buffer.concat([info.buffer, chunk]);
    consumaFrame(id);
  });
  socket.on("close", function () { chiudiClient(id); });
  socket.on("error", function () { chiudiClient(id); });
});

// ---------------------------------------------------------------------------
// Decodifica dei frame WebSocket dal buffer accumulato
// ---------------------------------------------------------------------------
function consumaFrame(id) {
  const info = client.get(id);
  if (!info) { return; }

  while (info.buffer.length >= 2) {
    const buf = info.buffer;
    const primo = buf[0];
    const secondo = buf[1];
    const fin = (primo & 0x80) !== 0;
    const opcode = primo & 0x0f;
    const mascherato = (secondo & 0x80) !== 0;
    let lunghezza = secondo & 0x7f;
    let offset = 2;

    if (lunghezza === 126) {
      if (buf.length < offset + 2) { return; }
      lunghezza = buf.readUInt16BE(offset);
      offset += 2;
    } else if (lunghezza === 127) {
      if (buf.length < offset + 8) { return; }
      // Ignora i 32 bit alti (payload realistici < 4GB) per restare in Number sicuro.
      const alto = buf.readUInt32BE(offset);
      const basso = buf.readUInt32BE(offset + 4);
      lunghezza = alto * 0x100000000 + basso;
      offset += 8;
    }

    let chiaveMaschera = null;
    if (mascherato) {
      if (buf.length < offset + 4) { return; }
      chiaveMaschera = buf.slice(offset, offset + 4);
      offset += 4;
    }

    if (buf.length < offset + lunghezza) { return; } // frame incompleto: attende altri dati

    let payload = buf.slice(offset, offset + lunghezza);
    if (mascherato && chiaveMaschera) {
      const smascherato = Buffer.alloc(lunghezza);
      for (let i = 0; i < lunghezza; i += 1) { smascherato[i] = payload[i] ^ chiaveMaschera[i % 4]; }
      payload = smascherato;
    }

    // Avanza il buffer oltre il frame consumato.
    info.buffer = buf.slice(offset + lunghezza);

    if (opcode === 0x8) { chiudiClient(id); return; }                 // close
    else if (opcode === 0x9) { inviaFrame(info.socket, payload, 0xA); } // ping -> pong
    else if (opcode === 0xA) { /* pong: ignora */ }
    else if (opcode === 0x1 && fin) { gestisciMessaggio(id, payload.toString("utf8")); }
    // I frame frammentati (fin=false) non sono attesi per i piccoli JSON: ignorati.
  }
}

// ---------------------------------------------------------------------------
// Codifica e invio di un frame di testo (server -> client, non mascherato)
// ---------------------------------------------------------------------------
function inviaFrame(socket, dati, opcode) {
  if (!socket || socket.destroyed) { return; }
  opcode = opcode || 0x1;
  const payload = Buffer.isBuffer(dati) ? dati : Buffer.from(String(dati), "utf8");
  const lung = payload.length;
  let intestazione;

  if (lung < 126) {
    intestazione = Buffer.from([0x80 | opcode, lung]);
  } else if (lung < 65536) {
    intestazione = Buffer.alloc(4);
    intestazione[0] = 0x80 | opcode;
    intestazione[1] = 126;
    intestazione.writeUInt16BE(lung, 2);
  } else {
    intestazione = Buffer.alloc(10);
    intestazione[0] = 0x80 | opcode;
    intestazione[1] = 127;
    intestazione.writeUInt32BE(Math.floor(lung / 0x100000000), 2);
    intestazione.writeUInt32BE(lung >>> 0, 6);
  }

  try { socket.write(Buffer.concat([intestazione, payload])); } catch (e) { /* socket morta */ }
}

function inviaJson(socket, oggetto) { inviaFrame(socket, JSON.stringify(oggetto), 0x1); }

// ---------------------------------------------------------------------------
// Logica applicativa: hello, autorizzazione, broadcast
// ---------------------------------------------------------------------------
function gestisciMessaggio(id, testo) {
  const info = client.get(id);
  if (!info) { return; }

  let msg;
  try { msg = JSON.parse(testo); } catch (e) { return; }
  if (!msg || typeof msg !== "object" || !msg.tipo) { return; }

  // Presentazione del client: registra ruolo, identita' e token posseduti.
  if (msg.tipo === "hello") {
    info.ruolo = msg.ruolo === "gm" ? "gm" : "player";
    if (typeof msg.attore === "string" && msg.attore) { info.attore = msg.attore; }
    info.tokenPosseduti = new Set(Array.isArray(msg.tokenPosseduti) ? msg.tokenPosseduti.map(String) : []);
    log("Client #" + id + " e' '" + info.attore + "' con ruolo " + info.ruolo + ".");
    return;
  }

  if (msg.tipo === "ping") { inviaJson(info.socket, { tipo: "pong", ts: Date.now() }); return; }

  // Richiesta di sync completo: inoltrala ai Master, che risponderanno con StateSyncEvent.
  if (msg.tipo === "StateSyncRequest") {
    inoltraAiMaster(msg);
    return;
  }

  // Controllo di autorita'.
  const motivo = motivoRifiuto(info, msg);
  if (motivo) {
    log("RIFIUTO #" + id + " (" + info.ruolo + ") evento " + msg.tipo + ": " + motivo);
    inviaJson(info.socket, { tipo: "RejectEvent", seq: msg.seq, motivo: motivo });
    return;
  }

  // Accettato: ritrasmetti a tutti (l'eco al mittente vale da ACK lato client).
  broadcast(msg);
}

// Restituisce la stringa motivo se l'evento va rifiutato, altrimenti null.
function motivoRifiuto(info, msg) {
  if (SOLO_MASTER[msg.tipo]) {
    return info.ruolo === "gm" ? null : "Evento riservato al Master.";
  }
  if (msg.tipo === "TokenMovedEvent") {
    if (info.ruolo === "gm") { return null; }
    const tokenId = msg.payload && msg.payload.tokenId;
    if (tokenId && info.tokenPosseduti.has(String(tokenId))) { return null; }
    return "Il giocatore non possiede il token " + tokenId + ".";
  }
  return null; // altri eventi: ammessi
}

function broadcast(msg) {
  const dati = JSON.stringify(msg);
  client.forEach(function (info) {
    if (info.vivo) { inviaFrame(info.socket, dati, 0x1); }
  });
}

function inoltraAiMaster(msg) {
  const dati = JSON.stringify(msg);
  client.forEach(function (info) {
    if (info.vivo && info.ruolo === "gm") { inviaFrame(info.socket, dati, 0x1); }
  });
}

function chiudiClient(id) {
  const info = client.get(id);
  if (!info) { return; }
  info.vivo = false;
  try { info.socket.destroy(); } catch (e) { /* ignora */ }
  client.delete(id);
  log("Client #" + id + " disconnesso (" + client.size + " rimasti).");
}

function log(messaggio) {
  console.log("[" + new Date().toISOString() + "] " + messaggio);
}

server.listen(PORT, function () {
  log("VTT relay WebSocket in ascolto su ws://localhost:" + PORT + "/");
});
