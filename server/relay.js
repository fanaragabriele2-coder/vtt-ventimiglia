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
const fs = require("fs");

const PORT = parseInt(process.env.PORT, 10) || 4600;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"; // costante di handshake RFC 6455

// --- Hardening / produzione (tutto opzionale, attivato da variabili d'ambiente) -------------
// TLS_CERT + TLS_KEY  -> server WSS (TLS). In loro assenza resta WS in chiaro (sviluppo).
// AUTH_TOKEN          -> richiesto a TUTTI i client (nel messaggio hello) per accedere.
// GM_TOKEN            -> richiesto per assumere il ruolo "gm"; senza, la richiesta gm e' declassata.
const TLS_CERT = process.env.TLS_CERT || null;
const TLS_KEY = process.env.TLS_KEY || null;
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;
const GM_TOKEN = process.env.GM_TOKEN || null;

// Limiti anti-abuso.
const MAX_FRAME = 256 * 1024;     // dimensione massima di un singolo frame WebSocket
const MAX_BUFFER = 1024 * 1024;   // buffer massimo accumulato per client (frame incompleti)
const MAX_MSG_CHARS = 200 * 1024; // lunghezza massima del testo JSON di un messaggio
const RATE_CAPACITY = 80;         // secchio a gettoni: capacita' massima
const RATE_REFILL = 40;           // gettoni ricaricati al secondo
const RATE_SCARTI_MAX = 300;      // oltre questi messaggi scartati di fila, il client viene chiuso

// Tipi di evento che solo il Master puo' originare.
const SOLO_MASTER = {
  TurnEndedEvent: true,
  CombatStartedEvent: true,
  CombatControlEvent: true,
  FogRevealedEvent: true,
  CombatantHpEvent: true,
  EnemySpawnedEvent: true,
  TokenMappingEvent: true,
  SurfaceCreatedEvent: true,
  ElevationSetEvent: true,
  ConditionSetEvent: true,
  ConditionClearedEvent: true,
  StateSyncEvent: true
};

let prossimoId = 1;
const client = new Map(); // id -> { socket, ruolo, attore, tokenPosseduti:Set, buffer, vivo, autenticato, rate, scartati }

// Rete di sicurezza: un frame malformato o un bug in un singolo handler non deve abbattere
// l'intero processo (e con esso la sessione di TUTTI i client connessi). Si logga e si continua.
process.on("uncaughtException", function (err) {
  log("ECCEZIONE NON GESTITA (il relay resta attivo): " + (err && err.stack ? err.stack : err));
});
process.on("unhandledRejection", function (motivo) {
  log("PROMISE RIFIUTATA NON GESTITA (il relay resta attivo): " + motivo);
});

// ---------------------------------------------------------------------------
// Server HTTP/HTTPS + upgrade a WebSocket
// ---------------------------------------------------------------------------
const usaTls = Boolean(TLS_CERT && TLS_KEY);
const SCHEMA = usaTls ? "wss" : "ws";

function gestoreHttp(req, res) {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("VTT relay attivo. Connettiti via WebSocket su " + SCHEMA + "://<host>:" + PORT + "/");
}

let server;
if (usaTls) {
  const https = require("https");
  server = https.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, gestoreHttp);
} else {
  server = http.createServer(gestoreHttp);
}

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
  const info = {
    socket: socket, ruolo: "player", attore: "anon-" + id, tokenPosseduti: new Set(),
    buffer: Buffer.alloc(0), vivo: true,
    autenticato: !AUTH_TOKEN,                                  // senza AUTH_TOKEN tutti sono autorizzati
    rate: { gettoni: RATE_CAPACITY, ts: Date.now() }, scartati: 0
  };
  client.set(id, info);
  log("Client #" + id + " connesso (" + client.size + " totali).");

  socket.on("data", function (chunk) {
    info.buffer = Buffer.concat([info.buffer, chunk]);
    consumaFrame(id);
  });
  socket.on("close", function () { chiudiClient(id); });
  socket.on("error", function () { chiudiClient(id); });

  trasmettiRoster(); // notifica a tutti l'elenco aggiornato dei partecipanti
});

// ---------------------------------------------------------------------------
// Decodifica dei frame WebSocket dal buffer accumulato
// ---------------------------------------------------------------------------
function consumaFrame(id) {
  const info = client.get(id);
  if (!info) { return; }

  // Protezione memoria: un buffer che cresce senza completare un frame e' un abuso.
  if (info.buffer.length > MAX_BUFFER) {
    log("Client #" + id + ": buffer oltre il limite (" + info.buffer.length + " byte), chiusura.");
    chiudiClient(id);
    return;
  }

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

    // Tetto sulla dimensione del singolo frame: oltre, si chiude il client (anti-abuso).
    if (lunghezza > MAX_FRAME) {
      log("Client #" + id + ": frame oltre il limite (" + lunghezza + " byte), chiusura.");
      chiudiClient(id);
      return;
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
// Token bucket per-client: limita la frequenza dei messaggi. Ritorna true se il messaggio passa.
function consentitoDalRate(info) {
  const adesso = Date.now();
  const trascorsi = (adesso - info.rate.ts) / 1000;
  info.rate.ts = adesso;
  info.rate.gettoni = Math.min(RATE_CAPACITY, info.rate.gettoni + trascorsi * RATE_REFILL);
  if (info.rate.gettoni >= 1) { info.rate.gettoni -= 1; info.scartati = 0; return true; }
  info.scartati += 1;
  return false;
}

function gestisciMessaggio(id, testo) {
  const info = client.get(id);
  if (!info) { return; }

  // Validazione dimensione del testo (anti-abuso, prima del parse).
  if (typeof testo !== "string" || testo.length > MAX_MSG_CHARS) {
    log("Client #" + id + ": messaggio troppo grande (" + (testo ? testo.length : 0) + " char), ignorato.");
    return;
  }

  // Rate limiting: troppi messaggi -> scartati; abuso prolungato -> chiusura.
  if (!consentitoDalRate(info)) {
    if (info.scartati >= RATE_SCARTI_MAX) {
      log("Client #" + id + ": rate limit superato a lungo (" + info.scartati + " scarti), chiusura.");
      chiudiClient(id);
    }
    return;
  }

  let msg;
  try { msg = JSON.parse(testo); } catch (e) { return; }
  // Validazione strutturale di base.
  if (!msg || typeof msg !== "object" || typeof msg.tipo !== "string") { return; }
  if (msg.payload != null && typeof msg.payload !== "object") { return; }

  // Presentazione del client: registra ruolo, identita', token posseduti e verifica i token d'accesso.
  if (msg.tipo === "hello") {
    // Gate d'accesso: se e' richiesto un AUTH_TOKEN, deve combaciare, altrimenti connessione chiusa.
    if (AUTH_TOKEN && msg.token !== AUTH_TOKEN) {
      log("Client #" + id + ": AUTH_TOKEN non valido, connessione rifiutata.");
      inviaJson(info.socket, { tipo: "AuthEvent", ok: false, fatale: true, motivo: "Token di sessione non valido." });
      chiudiClient(id);
      return;
    }
    info.autenticato = true;

    let ruoloRichiesto = msg.ruolo === "gm" ? "gm" : "player";
    // Per assumere il ruolo Master serve il GM_TOKEN (se configurato): altrimenti declassamento.
    if (ruoloRichiesto === "gm" && GM_TOKEN && msg.gmToken !== GM_TOKEN) {
      ruoloRichiesto = "player";
      log("Client #" + id + ": GM_TOKEN non valido, ruolo declassato a giocatore.");
      inviaJson(info.socket, { tipo: "AuthEvent", ok: false, fatale: false, motivo: "Token Master non valido: ruolo giocatore." });
    }
    info.ruolo = ruoloRichiesto;
    if (typeof msg.attore === "string" && msg.attore) { info.attore = msg.attore; }
    info.tokenPosseduti = new Set(Array.isArray(msg.tokenPosseduti) ? msg.tokenPosseduti.map(String) : []);
    log("Client #" + id + " e' '" + info.attore + "' con ruolo " + info.ruolo + ".");
    trasmettiRoster(); // ruolo/identita'/possessi aggiornati: rinfresca il roster
    return;
  }

  if (msg.tipo === "ping") { inviaJson(info.socket, { tipo: "pong", ts: Date.now() }); return; }

  // Oltre l'hello, ogni messaggio richiede un client autenticato.
  if (!info.autenticato) {
    inviaJson(info.socket, { tipo: "RejectEvent", seq: msg.seq, motivo: "Non autenticato." });
    return;
  }

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

// Elenco dei partecipanti correnti, inviato a tutti come RosterEvent (alimenta il pannello di sessione).
function trasmettiRoster() {
  const partecipanti = [];
  client.forEach(function (info) {
    if (!info.vivo) { return; }
    partecipanti.push({
      attore: info.attore,
      ruolo: info.ruolo,
      tokenPosseduti: Array.from(info.tokenPosseduti)
    });
  });
  broadcast({ tipo: "RosterEvent", attore: "server", ruolo: "gm", ts: Date.now(), payload: { partecipanti: partecipanti } });
}

function chiudiClient(id) {
  const info = client.get(id);
  if (!info) { return; }
  info.vivo = false;
  try { info.socket.destroy(); } catch (e) { /* ignora */ }
  client.delete(id);
  log("Client #" + id + " disconnesso (" + client.size + " rimasti).");
  trasmettiRoster(); // aggiorna il roster dopo l'uscita
}

function log(messaggio) {
  console.log("[" + new Date().toISOString() + "] " + messaggio);
}

server.on("error", function (err) {
  if (err && err.code === "EADDRINUSE") {
    log("ERRORE: la porta " + PORT + " e' gia' in uso. Avvia con PORT=<altra porta> node server/relay.js.");
    process.exit(1);
  }
  log("ERRORE del server HTTP/WebSocket: " + (err && err.stack ? err.stack : err));
  process.exit(1);
});

server.listen(PORT, function () {
  log("VTT relay WebSocket in ascolto su " + SCHEMA + "://localhost:" + PORT + "/");
  log("Sicurezza: TLS=" + (usaTls ? "on" : "off") +
      ", AUTH_TOKEN=" + (AUTH_TOKEN ? "richiesto" : "off") +
      ", GM_TOKEN=" + (GM_TOKEN ? "richiesto" : "off") + ".");
});
