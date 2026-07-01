// --- INIZIO MODULO 18 JS: SYNC MANAGER, EVENTI WEBSOCKET, RUOLI E ROLLBACK ---
// Fase 1 dell'architettura real-time: livello di rete.
//
// Responsabilita':
//  - Dispatcher di eventi su WebSocket con riconnessione automatica (backoff esponenziale).
//  - Autorizzazione per ruolo: MASTER (GM) puo' mutare iniziativa / nebbia / qualsiasi token;
//    GIOCATORE puo' muovere solo i token che possiede.
//  - Stato locale predittivo con rollback: ogni evento emesso e' applicato subito in locale e
//    annullato se il server (relay) lo rifiuta.
//  - Coda offline: gli eventi prodotti senza connessione vengono accodati e inviati al ripristino.
//  - Eventi tipizzati: TokenMossoEvent, TurnoTerminatoEvent, CombattimentoIniziatoEvent.
//
// In modalita' single-device (nessuna connessione) il modulo resta DISABILITATO: emetti() diventa
// un no-op silenzioso perche' l'azione e' gia' stata applicata in locale. Cosi' il gioco offline
// non subisce alcun overhead ne' alcun blocco.
(function () {
  "use strict";

  // Costanti di configurazione del livello di rete.
  var RICONNESSIONE_BASE_MS = 1000;     // ritardo iniziale di riconnessione
  var RICONNESSIONE_MAX_MS = 30000;     // tetto del backoff esponenziale
  var OUTBOX_MAX = 500;                  // dimensione massima della coda offline
  var HEARTBEAT_MS = 20000;             // intervallo di ping per tenere viva la socket
  var PENDING_TTL_MS = 8000;            // dopo questo tempo un evento non confermato fa rollback

  // Ruoli di gioco.
  var Ruolo = { MASTER: "gm", GIOCATORE: "player" };

  // Tipi di evento del protocollo. I primi tre sono i deliverable richiesti.
  var TipiEvento = {
    TOKEN_MOSSO: "TokenMovedEvent",
    TURNO_TERMINATO: "TurnEndedEvent",
    COMBATTIMENTO_INIZIATO: "CombatStartedEvent",
    // Eventi di gioco GM-autorevoli (instradati dal modulo 22).
    HP_AGGIORNATO: "CombatantHpEvent",
    NEMICO_GENERATO: "EnemySpawnedEvent",
    MAPPA_TOKEN: "TokenMappingEvent",
    SUPERFICIE_CREATA: "SurfaceCreatedEvent",
    ELEVAZIONE_IMPOSTATA: "ElevationSetEvent",
    CONDIZIONE_IMPOSTATA: "ConditionSetEvent",
    CONDIZIONE_RIMOSSA: "ConditionClearedEvent",
    // Eventi di servizio.
    CONTROLLO_COMBATTIMENTO: "CombatControlEvent",
    NEBBIA_RIVELATA: "FogRevealedEvent",
    SYNC_STATO: "StateSyncEvent",
    RICHIESTA_SYNC: "StateSyncRequest",
    ROSTER: "RosterEvent",
    AUTH: "AuthEvent",
    ACK: "AckEvent",
    RIFIUTO: "RejectEvent"
  };

  // Stato interno del modulo.
  var config = {
    ruolo: Ruolo.MASTER,        // default: host single-device = Master con autorita' totale
    idGiocatore: "host",        // identificativo dell'attore locale
    tokenPosseduti: null,       // null = possiede tutto (tipico del Master); altrimenti array di id
    token: null,                // token di sessione (se il relay richiede AUTH_TOKEN)
    gmToken: null,              // token per assumere il ruolo Master (se il relay richiede GM_TOKEN)
    url: null
  };

  var socket = null;
  var connesso = false;
  var abilitato = false;        // true solo dopo connetti(): in single-player resta false
  var vuoleConnessione = false; // intento dell'utente: serve a decidere se riconnettere
  var tentativiRiconnessione = 0;
  var timerRiconnessione = null;
  var timerHeartbeat = null;

  var seqLocale = 0;            // contatore monotono per la sequenza degli eventi locali
  var outbox = [];             // eventi in attesa di invio (offline o socket non pronta)
  var pending = {};            // seq -> { evento, undo, ts } per il rollback predittivo
  var handlers = {};           // tipoEvento -> array di callback inbound
  var applicandoRemoto = false; // guard: true mentre applichiamo un evento ricevuto (evita ri-emissione)

  // ---------------------------------------------------------------------------
  // Utilita' generiche
  // ---------------------------------------------------------------------------
  function log(messaggio) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(messaggio); } catch (e) { /* log best-effort */ }
    }
    if (window.console && typeof console.debug === "function") {
      console.debug("[VTT-Sync] " + messaggio);
    }
  }

  function ora() { return Date.now(); }

  function clonaProfondo(valore) {
    try { return JSON.parse(JSON.stringify(valore)); } catch (e) { return valore; }
  }

  // Notifica osservatori UI dello stato di connessione tramite CustomEvent.
  function notificaStato() {
    var dettaglio = statoConnessione();
    if (typeof window.CustomEvent === "function") {
      try { window.dispatchEvent(new CustomEvent("vtt-sync", { detail: dettaglio })); } catch (e) { /* ignora */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Factory degli eventi tipizzati (serializzazione coerente del payload)
  // ---------------------------------------------------------------------------
  function creaEvento(tipo, payload) {
    return {
      tipo: tipo,
      seq: 0,                  // assegnato in emetti()
      ts: 0,                   // assegnato in emetti()
      attore: config.idGiocatore,
      ruolo: config.ruolo,
      payload: payload || {}
    };
  }

  function creaEventoTokenMosso(tokenId, cellaX, cellaY, opzioni) {
    opzioni = opzioni || {};
    return creaEvento(TipiEvento.TOKEN_MOSSO, {
      tokenId: String(tokenId),
      cellaX: Math.trunc(cellaX),
      cellaY: Math.trunc(cellaY),
      anteprima: Boolean(opzioni.anteprima),          // true durante il drag (10Hz), false al rilascio
      cellaPrecedenteX: opzioni.cellaPrecedenteX,
      cellaPrecedenteY: opzioni.cellaPrecedenteY,
      metri: typeof opzioni.metri === "number" ? opzioni.metri : null
    });
  }

  function creaEventoTurnoTerminato(daCombattenteId, aCombattenteId, round) {
    return creaEvento(TipiEvento.TURNO_TERMINATO, {
      da: daCombattenteId != null ? String(daCombattenteId) : null,
      a: aCombattenteId != null ? String(aCombattenteId) : null,
      round: Math.trunc(round || 0)
    });
  }

  function creaEventoCombattimentoIniziato(attivo, turnoCorrenteId, combattenti) {
    return creaEvento(TipiEvento.COMBATTIMENTO_INIZIATO, {
      attivo: Boolean(attivo),
      turnoCorrenteId: turnoCorrenteId != null ? String(turnoCorrenteId) : null,
      // Ordine di iniziativa + id: serve ai client per allineare l'ordine dei turni.
      combattenti: Array.isArray(combattenti) ? clonaProfondo(combattenti) : []
    });
  }

  // ---------------------------------------------------------------------------
  // Autorizzazione per ruolo
  // ---------------------------------------------------------------------------
  function isMaster() { return config.ruolo === Ruolo.MASTER; }

  function possiede(tokenId) {
    if (isMaster()) { return true; }                 // il Master possiede tutto
    if (!config.tokenPosseduti) { return false; }    // giocatore senza token assegnati
    return config.tokenPosseduti.indexOf(String(tokenId)) !== -1;
  }

  // Verifica se l'attore con un certo ruolo puo' emettere/applicare l'evento.
  function autorizzato(evento, ruoloAttore, possiedeFn) {
    if (!evento || !evento.tipo) { return false; }
    switch (evento.tipo) {
      case TipiEvento.TOKEN_MOSSO:
        // Il giocatore puo' muovere solo i propri token; il Master qualsiasi token.
        return ruoloAttore === Ruolo.MASTER || possiedeFn(evento.payload.tokenId);
      case TipiEvento.TURNO_TERMINATO:
      case TipiEvento.COMBATTIMENTO_INIZIATO:
      case TipiEvento.CONTROLLO_COMBATTIMENTO:
      case TipiEvento.NEBBIA_RIVELATA:
      case TipiEvento.HP_AGGIORNATO:
      case TipiEvento.NEMICO_GENERATO:
      case TipiEvento.MAPPA_TOKEN:
      case TipiEvento.SUPERFICIE_CREATA:
      case TipiEvento.ELEVAZIONE_IMPOSTATA:
      case TipiEvento.CONDIZIONE_IMPOSTATA:
      case TipiEvento.CONDIZIONE_RIMOSSA:
      case TipiEvento.SYNC_STATO:
        // Mutazioni dell'autorita': solo il Master.
        return ruoloAttore === Ruolo.MASTER;
      default:
        return true; // eventi di servizio (ack, richieste) sempre ammessi
    }
  }

  // ---------------------------------------------------------------------------
  // Gestione coda / invio / rollback predittivo
  // ---------------------------------------------------------------------------
  // Presentazione al relay: ruolo, identita' e token posseduti (base dell'autorizzazione lato server).
  function inviaHello() {
    var hello = {
      tipo: "hello",
      attore: config.idGiocatore,
      ruolo: config.ruolo,
      tokenPosseduti: Array.isArray(config.tokenPosseduti) ? config.tokenPosseduti : [],
      ts: ora()
    };
    if (config.token) { hello.token = config.token; }       // gate d'accesso (AUTH_TOKEN del relay)
    if (config.gmToken) { hello.gmToken = config.gmToken; }  // sblocco ruolo Master (GM_TOKEN del relay)
    return inviaRaw(hello);
  }

  function inviaRaw(oggetto) {
    if (!socket || socket.readyState !== 1 /* OPEN */) { return false; }
    try {
      socket.send(JSON.stringify(oggetto));
      return true;
    } catch (e) {
      log("Invio fallito: " + (e && e.message ? e.message : e));
      return false;
    }
  }

  function accoda(evento) {
    if (outbox.length >= OUTBOX_MAX) {
      outbox.shift(); // scarta il piu' vecchio per non crescere all'infinito
      log("Coda offline piena: scartato l'evento piu' vecchio.");
    }
    outbox.push(evento);
  }

  function svuotaOutbox() {
    if (!outbox.length) { return; }
    var residui = [];
    for (var i = 0; i < outbox.length; i += 1) {
      if (!inviaRaw(outbox[i])) { residui.push(outbox[i]); }
    }
    outbox = residui;
    if (outbox.length === 0) { log("Coda offline svuotata."); }
  }

  function inviaOAccoda(evento) {
    if (!inviaRaw(evento)) { accoda(evento); }
  }

  function registraPending(evento, undoFn) {
    if (typeof undoFn !== "function") { return; }
    pending[evento.seq] = { evento: evento, undo: undoFn, ts: ora() };
  }

  function confermaPending(seq) {
    if (pending[seq]) { delete pending[seq]; }
  }

  function rollbackPending(seq, motivo) {
    var voce = pending[seq];
    if (!voce) { return; }
    delete pending[seq];
    log("Rollback evento seq=" + seq + (motivo ? " (" + motivo + ")" : ""));
    applicandoRemoto = true; // l'undo non deve a sua volta ri-emettere
    try { voce.undo(voce.evento); } catch (e) { log("Undo fallito: " + (e && e.message)); }
    finally { applicandoRemoto = false; }
  }

  // Annulla gli eventi predittivi rimasti senza conferma oltre il TTL (es. relay sparito).
  function scadiPending() {
    var limite = ora() - PENDING_TTL_MS;
    Object.keys(pending).forEach(function (seq) {
      if (pending[seq].ts < limite) { rollbackPending(seq, "timeout conferma"); }
    });
  }

  // ---------------------------------------------------------------------------
  // Dispatch degli eventi inbound verso i moduli sottoscritti
  // ---------------------------------------------------------------------------
  function inAscolto(tipo, handler) {
    if (!handlers[tipo]) { handlers[tipo] = []; }
    if (handlers[tipo].indexOf(handler) === -1) { handlers[tipo].push(handler); }
  }

  function rimuoviAscolto(tipo, handler) {
    if (!handlers[tipo]) { return; }
    handlers[tipo] = handlers[tipo].filter(function (h) { return h !== handler; });
  }

  function dispatchInbound(evento) {
    var lista = handlers[evento.tipo] || [];
    applicandoRemoto = true;
    try {
      lista.forEach(function (h) {
        try { h(evento); } catch (e) { log("Handler inbound errore (" + evento.tipo + "): " + (e && e.message)); }
      });
    } finally {
      applicandoRemoto = false;
    }
  }

  // Esito dell'autenticazione comunicato dal relay (token di sessione / token Master).
  function gestisciAuth(msg) {
    if (msg.ok === false) {
      if (msg.fatale) {
        log("Autenticazione rifiutata dal relay: " + (msg.motivo || "") + " — riconnessione interrotta.");
        vuoleConnessione = false; // niente martellamento del relay con credenziali errate
        if (timerRiconnessione) { clearTimeout(timerRiconnessione); timerRiconnessione = null; }
      } else {
        log("Relay: " + (msg.motivo || "ruolo declassato a giocatore."));
        config.ruolo = Ruolo.GIOCATORE; // allinea il ruolo locale al declassamento del relay
      }
      notificaStato();
    }
    if (typeof window.CustomEvent === "function") {
      try {
        window.dispatchEvent(new CustomEvent("vtt-auth", {
          detail: { ok: msg.ok !== false, fatale: Boolean(msg.fatale), motivo: msg.motivo || "" }
        }));
      } catch (e) { /* ignora */ }
    }
  }

  // Applica un messaggio ricevuto dalla socket (o iniettato manualmente nei test).
  function applicaInbound(raw) {
    var msg;
    if (typeof raw === "string") {
      try { msg = JSON.parse(raw); } catch (e) { log("Messaggio non valido (JSON): " + (e && e.message)); return; }
    } else {
      msg = raw;
    }
    if (!msg || typeof msg !== "object" || !msg.tipo) { return; }

    // Eventi di servizio.
    if (msg.tipo === TipiEvento.ACK) { confermaPending(msg.seq); return; }
    if (msg.tipo === TipiEvento.RIFIUTO) { rollbackPending(msg.seq, msg.motivo); return; }
    if (msg.tipo === TipiEvento.RICHIESTA_SYNC) { rispondiConSync(); return; }
    if (msg.tipo === TipiEvento.AUTH) { gestisciAuth(msg); return; }

    // Eco del nostro stesso evento (il relay rimanda i nostri eventi): vale come ACK.
    if (msg.attore && msg.attore === config.idGiocatore) {
      confermaPending(msg.seq);
      return;
    }

    // Eventi altrui: verifica che il ruolo dichiarato sia coerente con cio' che richiede.
    if (!autorizzato(msg, msg.ruolo, function () { return true; })) {
      log("Evento inbound non autorizzato ignorato: " + msg.tipo + " da ruolo " + msg.ruolo);
      return;
    }
    dispatchInbound(msg);
  }

  // ---------------------------------------------------------------------------
  // Sincronizzazione completa dello stato (snapshot) per resync alla riconnessione
  // ---------------------------------------------------------------------------
  function costruisciSnapshot() {
    var snap = {};
    try { if (window.UltimateVTTState) { snap.stato = window.UltimateVTTState.serialize(); } } catch (e) { /* ignora */ }
    try { if (window.UltimateVTTCombat) { snap.combattimento = window.UltimateVTTCombat.getState(); } } catch (e) { /* ignora */ }
    try { if (window.UltimateVTTTokenPhysics) { snap.token = window.UltimateVTTTokenPhysics.getState(); } } catch (e) { /* ignora */ }
    // Stato autorevole della macchina a stati (turno corrente, round, pausa, budget): serve a
    // chi entra a partita in corso per allineare i turni esattamente a quelli del Master.
    try { if (window.UltimateVTTCombatFSM && window.UltimateVTTCombatFSM.getStato) { snap.combattimentoFsm = window.UltimateVTTCombatFSM.getStato(); } } catch (e) { /* ignora */ }
    return snap;
  }

  // ---------------------------------------------------------------------------
  // Idratazione (Fase 2 multiplayer): applica uno snapshot autorevole ricevuto dal Master.
  // Solo i client NON-Master si idratano; il Master e' la fonte e si ignora.
  // ---------------------------------------------------------------------------
  function applicaSnapshot(snap) {
    if (!snap || typeof snap !== "object") { return; }
    if (isMaster()) { return; } // il Master e' la fonte autorevole

    // 1) Stato del PG (risorse, statistiche, ...): il modulo 04 espone hydrate().
    try {
      if (snap.stato && window.UltimateVTTState && typeof window.UltimateVTTState.hydrate === "function") {
        window.UltimateVTTState.hydrate(snap.stato);
      }
    } catch (e) { log("Hydration stato fallita: " + (e && e.message)); }

    // 2) Posizioni dei token condivisi (riposiziona per id quelli presenti localmente).
    try { applicaTokenSnapshot(snap.token); } catch (e) { log("Hydration token fallita: " + (e && e.message)); }

    // 3) Combattimento + turni: delega alla macchina a stati (modulo 19).
    try {
      if (window.UltimateVTTCombatFSM && typeof window.UltimateVTTCombatFSM.applicaSnapshot === "function") {
        window.UltimateVTTCombatFSM.applicaSnapshot(snap);
      }
    } catch (e) { log("Hydration FSM fallita: " + (e && e.message)); }

    log("Stato sincronizzato dal Master: hydration completata.");
  }

  // Riposiziona i token presenti in entrambe le parti (match per id). I token del Master non
  // presenti localmente non sono ricreabili con lo stesso id (addToken genera id propri): vengono
  // solo contati e segnalati, senza creare duplicati.
  function applicaTokenSnapshot(snapToken) {
    if (!snapToken || !Array.isArray(snapToken.tokens) || !window.UltimateVTTTokenPhysics) { return; }
    var tp = window.UltimateVTTTokenPhysics;
    var statoLocale = (typeof tp.getState === "function") ? tp.getState() : null;
    var locali = statoLocale && Array.isArray(statoLocale.tokens) ? statoLocale.tokens : [];
    var idLocali = {};
    locali.forEach(function (t) { if (t && t.id != null) { idLocali[t.id] = true; } });

    var nonTrovati = 0;
    snapToken.tokens.forEach(function (t) {
      if (!t || t.id == null) { return; }
      if (idLocali[t.id] && typeof tp.moveTokenToCell === "function") {
        tp.moveTokenToCell(t.id, t.cellX, t.cellY, false);
      } else if (!idLocali[t.id]) {
        nonTrovati += 1;
      }
    });
    if (nonTrovati > 0) {
      log("Hydration token: " + nonTrovati + " token del Master non presenti localmente (id non riproducibili).");
    }
  }

  function rispondiConSync() {
    if (!isMaster()) { return; } // solo il Master e' fonte autorevole dello stato
    var evento = creaEvento(TipiEvento.SYNC_STATO, costruisciSnapshot());
    evento.seq = ++seqLocale;
    evento.ts = ora();
    inviaOAccoda(evento);
  }

  // ---------------------------------------------------------------------------
  // Ciclo di vita della WebSocket con riconnessione robusta
  // ---------------------------------------------------------------------------
  function pulisciSocket() {
    if (timerHeartbeat) { clearInterval(timerHeartbeat); timerHeartbeat = null; }
    if (socket) {
      try {
        socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
        if (socket.readyState === 0 || socket.readyState === 1) { socket.close(); }
      } catch (e) { /* ignora */ }
    }
    socket = null;
    connesso = false;
  }

  function pianificaRiconnessione() {
    if (!vuoleConnessione) { return; }
    if (timerRiconnessione) { return; }
    var ritardo = Math.min(RICONNESSIONE_BASE_MS * Math.pow(2, tentativiRiconnessione), RICONNESSIONE_MAX_MS);
    tentativiRiconnessione += 1;
    log("Riconnessione tra " + Math.round(ritardo / 1000) + "s (tentativo " + tentativiRiconnessione + ").");
    timerRiconnessione = setTimeout(function () {
      timerRiconnessione = null;
      apriSocket();
    }, ritardo);
  }

  function apriSocket() {
    if (!config.url) { return; }
    if (typeof window.WebSocket !== "function") {
      log("WebSocket non supportato dal browser: modalita' offline.");
      return;
    }
    pulisciSocket();
    var ws;
    try {
      ws = new WebSocket(config.url);
    } catch (e) {
      log("Apertura WebSocket fallita: " + (e && e.message));
      pianificaRiconnessione();
      return;
    }
    socket = ws;

    ws.onopen = function () {
      connesso = true;
      tentativiRiconnessione = 0;
      log("Connesso al relay: " + config.url);
      // Presentazione: comunica ruolo, identita' E i token posseduti (il relay valida i movimenti su questi).
      inviaHello();
      // Chiede uno snapshot autorevole e svuota la coda offline.
      inviaRaw({ tipo: TipiEvento.RICHIESTA_SYNC, attore: config.idGiocatore, ruolo: config.ruolo });
      svuotaOutbox();
      avviaHeartbeat();
      notificaStato();
    };

    ws.onmessage = function (ev) { applicaInbound(ev.data); };

    ws.onerror = function () { log("Errore sulla WebSocket."); };

    ws.onclose = function () {
      connesso = false;
      if (timerHeartbeat) { clearInterval(timerHeartbeat); timerHeartbeat = null; }
      notificaStato();
      if (vuoleConnessione) {
        log("Connessione caduta: tentativo di riconnessione.");
        pianificaRiconnessione();
      }
    };
  }

  function avviaHeartbeat() {
    if (timerHeartbeat) { clearInterval(timerHeartbeat); }
    timerHeartbeat = setInterval(function () {
      scadiPending();
      if (!inviaRaw({ tipo: "ping", attore: config.idGiocatore, ts: ora() })) {
        // socket non pronta: il ciclo di riconnessione se ne occupa
      }
    }, HEARTBEAT_MS);
  }

  // ---------------------------------------------------------------------------
  // API pubblica
  // ---------------------------------------------------------------------------
  function configura(opzioni) {
    opzioni = opzioni || {};
    if (opzioni.ruolo === Ruolo.MASTER || opzioni.ruolo === Ruolo.GIOCATORE) { config.ruolo = opzioni.ruolo; }
    if (typeof opzioni.idGiocatore === "string" && opzioni.idGiocatore) { config.idGiocatore = opzioni.idGiocatore; }
    if (Array.isArray(opzioni.tokenPosseduti)) { config.tokenPosseduti = opzioni.tokenPosseduti.map(String); }
    if (opzioni.tokenPosseduti === null) { config.tokenPosseduti = null; }
    if (typeof opzioni.token === "string") { config.token = opzioni.token || null; }
    if (typeof opzioni.gmToken === "string") { config.gmToken = opzioni.gmToken || null; }
    notificaStato();
    return clonaProfondo(config);
  }

  function impostaRuolo(ruolo) {
    if (ruolo === Ruolo.MASTER || ruolo === Ruolo.GIOCATORE) { config.ruolo = ruolo; notificaStato(); }
  }

  function impostaPossesso(tokenIds) {
    config.tokenPosseduti = Array.isArray(tokenIds) ? tokenIds.map(String) : null;
    if (connesso) { inviaHello(); } // ri-annuncia al relay il possesso aggiornato
    notificaStato();
  }

  function connetti(url, opzioni) {
    if (opzioni) { configura(opzioni); }
    if (typeof url === "string" && url) { config.url = url; }
    if (!config.url) { log("connetti(): URL del relay mancante."); return false; }
    vuoleConnessione = true;
    abilitato = true;
    tentativiRiconnessione = 0;
    apriSocket();
    return true;
  }

  function disconnetti() {
    vuoleConnessione = false;
    abilitato = false;
    if (timerRiconnessione) { clearTimeout(timerRiconnessione); timerRiconnessione = null; }
    pulisciSocket();
    notificaStato();
  }

  // Emette un evento: lo completa con i metadati, controlla l'autorita', lo applica in modo
  // predittivo (gia' fatto a monte da chi chiama) e lo invia o accoda. Ritorna false se rifiutato.
  function emetti(evento, undoFn) {
    if (!evento || !evento.tipo) { return false; }
    evento.seq = ++seqLocale;
    evento.ts = ora();
    evento.attore = config.idGiocatore;
    evento.ruolo = config.ruolo;

    if (!autorizzato(evento, config.ruolo, possiede)) {
      log("Azione non autorizzata per il ruolo " + config.ruolo + ": " + evento.tipo);
      // Annulla subito l'effetto locale predittivo: chi chiama ha fornito l'undo.
      if (typeof undoFn === "function") {
        applicandoRemoto = true;
        try { undoFn(evento); } catch (e) { /* ignora */ } finally { applicandoRemoto = false; }
      }
      return false;
    }

    if (!abilitato) { return true; } // single-player: nessuna rete, effetto gia' applicato in locale

    registraPending(evento, undoFn);
    inviaOAccoda(evento);
    return true;
  }

  function statoConnessione() {
    return {
      abilitato: abilitato,
      connesso: connesso,
      ruolo: config.ruolo,
      idGiocatore: config.idGiocatore,
      url: config.url,
      inCoda: outbox.length,
      inAttesaConferma: Object.keys(pending).length,
      tentativiRiconnessione: tentativiRiconnessione
    };
  }

  function staApplicandoRemoto() { return applicandoRemoto; }

  window.UltimateVTTSync = {
    Ruolo: Ruolo,
    TipiEvento: TipiEvento,
    // factory eventi
    creaEvento: creaEvento,
    creaEventoTokenMosso: creaEventoTokenMosso,
    creaEventoTurnoTerminato: creaEventoTurnoTerminato,
    creaEventoCombattimentoIniziato: creaEventoCombattimentoIniziato,
    // configurazione / ruoli
    configura: configura,
    impostaRuolo: impostaRuolo,
    impostaPossesso: impostaPossesso,
    possiede: possiede,
    isMaster: isMaster,
    // rete
    connetti: connetti,
    disconnetti: disconnetti,
    statoConnessione: statoConnessione,
    // emissione / sottoscrizione
    emetti: emetti,
    inAscolto: inAscolto,
    rimuoviAscolto: rimuoviAscolto,
    applicaInbound: applicaInbound,
    applicaSnapshot: applicaSnapshot,
    costruisciSnapshot: costruisciSnapshot,
    staApplicandoRemoto: staApplicandoRemoto,
    autorizzato: autorizzato
  };

  // Idratazione automatica: ogni StateSyncEvent autorevole ricevuto dal Master viene applicato.
  inAscolto(TipiEvento.SYNC_STATO, function (evento) { applicaSnapshot(evento.payload); });

  if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
    try {
      window.UltimateVTT.registerModule(18, {
        syncManager: true,
        ruoli: [Ruolo.MASTER, Ruolo.GIOCATORE],
        eventi: Object.keys(TipiEvento).length,
        riconnessione: true,
        rollback: true
      });
    } catch (e) { /* registrazione best-effort */ }
  }

  log("Modulo 18 caricato: Sync Manager (WebSocket, ruoli, rollback predittivo).");
})();
// --- FINE MODULO 18 JS: SYNC MANAGER, EVENTI WEBSOCKET, RUOLI E ROLLBACK ---
