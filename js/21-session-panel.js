// --- INIZIO MODULO 21 JS: PANNELLO DI SESSIONE MULTIPLAYER (UI Fase 3) ---
// Pannello flottante per gestire la sessione real-time senza usare la console:
//   - URL del relay, nome/identita' del giocatore, ruolo (Master / Giocatore)
//   - selezione dei token posseduti (autodichiarazione: il relay valida i movimenti su questi)
//   - Connetti / Disconnetti con stato di connessione live
//   - stato del turno (dalla FSM, modulo 19) e lista partecipanti (RosterEvent, dal relay)
//
// Si aggancia solo a UltimateVTTSync / UltimateVTTCombatFSM / UltimateVTTTokenPhysics gia' presenti;
// se manca il DOM o il Sync Manager, il modulo resta inerte. Niente impatto sul single-player.
(function () {
  "use strict";

  var URL_DEFAULT = "ws://localhost:4600";
  var CHIAVE_STORAGE = "vtt-sessione";

  var rif = {};            // riferimenti agli elementi del pannello
  var aperto = false;
  var costruito = false;

  function sync() { return window.UltimateVTTSync || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }
  function tokenPhysics() { return window.UltimateVTTTokenPhysics || null; }

  function log(m) {
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Persistenza leggera delle preferenze (URL, identita', ruolo, token)
  // ---------------------------------------------------------------------------
  function caricaPrefs() {
    var def = {
      url: URL_DEFAULT, idGiocatore: "giocatore-" + Math.random().toString(36).slice(2, 6),
      ruolo: "gm", token: [], authToken: "", gmToken: ""
    };
    try {
      var raw = window.localStorage && window.localStorage.getItem(CHIAVE_STORAGE);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === "object") {
          if (typeof p.url === "string" && p.url) { def.url = p.url; }
          if (typeof p.idGiocatore === "string" && p.idGiocatore) { def.idGiocatore = p.idGiocatore; }
          if (p.ruolo === "gm" || p.ruolo === "player") { def.ruolo = p.ruolo; }
          if (Array.isArray(p.token)) { def.token = p.token.map(String); }
          if (typeof p.authToken === "string") { def.authToken = p.authToken; }
          if (typeof p.gmToken === "string") { def.gmToken = p.gmToken; }
        }
      }
    } catch (e) { /* preferenze assenti */ }
    return def;
  }

  function salvaPrefs(p) {
    try { if (window.localStorage) { window.localStorage.setItem(CHIAVE_STORAGE, JSON.stringify(p)); } } catch (e) { /* ignora */ }
  }

  // ---------------------------------------------------------------------------
  // Costruzione del DOM
  // ---------------------------------------------------------------------------
  function el(tag, cls, testo) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (testo != null) { n.textContent = testo; }
    return n;
  }

  function costruisci() {
    if (costruito || !document.body) { return; }
    var prefs = caricaPrefs();

    // Bottone di apertura
    var toggle = el("button", "vtt-sess-toggle", "");
    toggle.type = "button";
    toggle.title = "Sessione multiplayer";
    var dot = el("span", "vtt-sess-dot");
    toggle.appendChild(dot);
    toggle.appendChild(document.createTextNode("🌐 SESSIONE"));
    toggle.addEventListener("click", function () { mostra(!aperto); });

    // Pannello
    var panel = el("section", "vtt-sess-panel");
    panel.hidden = true;

    var head = el("div", "vtt-sess-head");
    head.appendChild(el("h3", null, "Sessione multiplayer"));
    var chiudi = el("button", "vtt-sess-close", "✕");
    chiudi.type = "button";
    chiudi.addEventListener("click", function () { mostra(false); });
    head.appendChild(chiudi);
    panel.appendChild(head);

    var body = el("div", "vtt-sess-body");

    // Stato connessione
    var status = el("div", "vtt-sess-status");
    var sdot = el("span", "vtt-sess-dot");
    var stext = el("span", "vtt-sess-status-text", "Offline (single-player)");
    var ssub = el("span", "vtt-sess-status-sub", "");
    status.appendChild(sdot); status.appendChild(stext); status.appendChild(ssub);
    body.appendChild(status);

    // Stato turno (FSM)
    var turn = el("div", "vtt-sess-turn", "Fuori combattimento");
    body.appendChild(turn);

    // URL relay
    var fUrl = el("div", "vtt-sess-field");
    fUrl.appendChild(el("label", null, "URL del relay"));
    var inUrl = el("input"); inUrl.type = "text"; inUrl.value = prefs.url; inUrl.placeholder = URL_DEFAULT;
    fUrl.appendChild(inUrl);
    body.appendChild(fUrl);

    // Identita'
    var fId = el("div", "vtt-sess-field");
    fId.appendChild(el("label", null, "Il tuo nome / identità"));
    var inId = el("input"); inId.type = "text"; inId.value = prefs.idGiocatore; inId.placeholder = "es. anna";
    fId.appendChild(inId);
    body.appendChild(fId);

    // Token di sessione (facoltativo: solo se il relay richiede AUTH_TOKEN)
    var fAuth = el("div", "vtt-sess-field");
    fAuth.appendChild(el("label", null, "Token sessione (se richiesto)"));
    var inAuth = el("input"); inAuth.type = "password"; inAuth.value = prefs.authToken; inAuth.placeholder = "facoltativo";
    fAuth.appendChild(inAuth);
    body.appendChild(fAuth);

    // Ruolo
    var fRuolo = el("div", "vtt-sess-field");
    fRuolo.appendChild(el("label", null, "Ruolo"));
    var selRuolo = el("select");
    var optGm = el("option", null, "Master (autorità totale)"); optGm.value = "gm";
    var optPl = el("option", null, "Giocatore (solo i propri token)"); optPl.value = "player";
    selRuolo.appendChild(optGm); selRuolo.appendChild(optPl);
    selRuolo.value = prefs.ruolo;
    fRuolo.appendChild(selRuolo);
    body.appendChild(fRuolo);

    // Token Master (facoltativo: solo per il ruolo Master se il relay richiede GM_TOKEN)
    var fGm = el("div", "vtt-sess-field");
    fGm.appendChild(el("label", null, "Token Master (se richiesto)"));
    var inGm = el("input"); inGm.type = "password"; inGm.value = prefs.gmToken; inGm.placeholder = "facoltativo";
    fGm.appendChild(inGm);
    body.appendChild(fGm);

    // Token posseduti (solo per il giocatore)
    var fOwn = el("div", "vtt-sess-field");
    fOwn.appendChild(el("label", null, "Token posseduti"));
    var owners = el("div", "vtt-sess-owners");
    fOwn.appendChild(owners);
    body.appendChild(fOwn);

    // Azioni
    var actions = el("div", "vtt-sess-actions");
    var btnConn = el("button", "vtt-sess-btn", "Connetti"); btnConn.type = "button";
    var btnDisc = el("button", "vtt-sess-btn secondary", "Disconnetti"); btnDisc.type = "button";
    actions.appendChild(btnConn); actions.appendChild(btnDisc);
    body.appendChild(actions);

    // Lista partecipanti
    var roster = el("div", "vtt-sess-roster");
    roster.appendChild(el("div", "vtt-sess-roster-title", "Partecipanti"));
    var rosterList = el("div", "vtt-sess-roster-body");
    rosterList.appendChild(el("div", "vtt-sess-roster-empty", "Nessuno: non connesso."));
    roster.appendChild(rosterList);
    body.appendChild(roster);

    panel.appendChild(body);
    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    rif = {
      toggle: toggle, panel: panel, sdot: sdot, stext: stext, ssub: ssub, turn: turn,
      inUrl: inUrl, inId: inId, inAuth: inAuth, selRuolo: selRuolo, fGm: fGm, inGm: inGm,
      fOwn: fOwn, owners: owners, btnConn: btnConn, btnDisc: btnDisc, rosterList: rosterList
    };

    // Eventi UI
    selRuolo.addEventListener("change", function () { aggiornaVisibilitaOwners(); salvaCorrente(); });
    inUrl.addEventListener("change", salvaCorrente);
    inId.addEventListener("change", salvaCorrente);
    inAuth.addEventListener("change", salvaCorrente);
    inGm.addEventListener("change", salvaCorrente);
    btnConn.addEventListener("click", connetti);
    btnDisc.addEventListener("click", disconnetti);

    costruito = true;
    aggiornaVisibilitaOwners();
    aggiornaStato();
    aggiornaTurno();
  }

  // ---------------------------------------------------------------------------
  // Selezione token posseduti
  // ---------------------------------------------------------------------------
  function popolaOwners() {
    if (!rif.owners) { return; }
    var prefs = caricaPrefs();
    var possedutiPref = {};
    prefs.token.forEach(function (id) { possedutiPref[id] = true; });

    var tp = tokenPhysics();
    var tokens = [];
    if (tp && typeof tp.getState === "function") {
      try { var st = tp.getState(); tokens = (st && Array.isArray(st.tokens)) ? st.tokens : []; } catch (e) { tokens = []; }
    }

    rif.owners.innerHTML = "";
    if (!tokens.length) {
      rif.owners.appendChild(el("div", "vtt-sess-owners-empty", "Nessun token sulla mappa."));
      return;
    }
    tokens.forEach(function (t) {
      var riga = el("label", "vtt-sess-owner");
      var cb = el("input"); cb.type = "checkbox"; cb.value = t.id;
      cb.checked = !!possedutiPref[t.id];
      cb.addEventListener("change", salvaCorrente);
      riga.appendChild(cb);
      riga.appendChild(el("span", null, (t.name || t.id) + "  ·  " + t.id));
      rif.owners.appendChild(riga);
    });
  }

  function tokenSelezionati() {
    if (!rif.owners) { return []; }
    return Array.prototype.slice.call(rif.owners.querySelectorAll("input[type=checkbox]"))
      .filter(function (cb) { return cb.checked; })
      .map(function (cb) { return cb.value; });
  }

  function aggiornaVisibilitaOwners() {
    if (!rif.fOwn) { return; }
    var player = rif.selRuolo.value === "player";
    rif.fOwn.style.display = player ? "" : "none";
    if (rif.fGm) { rif.fGm.style.display = player ? "none" : ""; } // token Master solo per il GM
    if (player) { popolaOwners(); }
  }

  function salvaCorrente() {
    if (!costruito) { return; }
    salvaPrefs({
      url: rif.inUrl.value.trim() || URL_DEFAULT,
      idGiocatore: rif.inId.value.trim() || ("giocatore-" + Math.random().toString(36).slice(2, 6)),
      ruolo: rif.selRuolo.value,
      token: tokenSelezionati(),
      authToken: rif.inAuth.value,
      gmToken: rif.inGm.value
    });
  }

  // ---------------------------------------------------------------------------
  // Connessione / disconnessione
  // ---------------------------------------------------------------------------
  function connetti() {
    var s = sync();
    if (!s) { log("Sync Manager non disponibile."); return; }
    var url = rif.inUrl.value.trim() || URL_DEFAULT;
    var id = rif.inId.value.trim() || ("giocatore-" + Math.random().toString(36).slice(2, 6));
    var ruolo = rif.selRuolo.value === "player" ? s.Ruolo.GIOCATORE : s.Ruolo.MASTER;
    var token = ruolo === s.Ruolo.GIOCATORE ? tokenSelezionati() : null; // il Master possiede tutto
    var authToken = rif.inAuth.value.trim();
    var gmToken = rif.inGm.value.trim();
    salvaCorrente();
    s.connetti(url, {
      ruolo: ruolo, idGiocatore: id, tokenPosseduti: token,
      token: authToken, gmToken: ruolo === s.Ruolo.MASTER ? gmToken : ""
    });
    log("Connessione al relay " + url + " come " + (ruolo === s.Ruolo.MASTER ? "Master" : "Giocatore") + " (" + id + ").");
    aggiornaStato();
  }

  function disconnetti() {
    var s = sync();
    if (!s) { return; }
    s.disconnetti();
    log("Disconnesso dalla sessione.");
    svuotaRoster();
    aggiornaStato();
  }

  // ---------------------------------------------------------------------------
  // Aggiornamento viste (stato, turno, roster)
  // ---------------------------------------------------------------------------
  function aggiornaStato() {
    if (!costruito) { return; }
    var s = sync();
    var st = s && typeof s.statoConnessione === "function" ? s.statoConnessione() : { abilitato: false, connesso: false };
    var online = !!st.connesso;
    var attesa = st.abilitato && !st.connesso;

    rif.sdot.parentNode.classList.toggle("online", online);
    rif.toggle.classList.toggle("online", online);

    if (online) {
      rif.stext.textContent = "Connesso";
      rif.ssub.textContent = (st.ruolo === "gm" ? "Master" : "Giocatore") +
        (st.inCoda ? " · " + st.inCoda + " in coda" : "") +
        (st.inAttesaConferma ? " · " + st.inAttesaConferma + " in attesa" : "");
    } else if (attesa) {
      rif.stext.textContent = "Riconnessione…";
      rif.ssub.textContent = "tentativo " + (st.tentativiRiconnessione || 0);
    } else {
      rif.stext.textContent = "Offline (single-player)";
      rif.ssub.textContent = "";
    }

    rif.btnConn.disabled = online;
    rif.btnDisc.disabled = !st.abilitato;
    rif.inUrl.disabled = st.abilitato;
    rif.inId.disabled = st.abilitato;
    rif.inAuth.disabled = st.abilitato;
    rif.inGm.disabled = st.abilitato;
    rif.selRuolo.disabled = st.abilitato;
  }

  // Mostra l'esito dell'autenticazione comunicato dal relay (token errato / declassamento).
  function mostraAuth(detail) {
    if (!costruito || !detail || detail.ok) { return; }
    rif.stext.textContent = detail.fatale ? "Accesso negato" : "Declassato a giocatore";
    rif.ssub.textContent = detail.motivo || "";
    if (detail.fatale) { rif.toggle.classList.remove("online"); }
  }

  var NOMI_STATO = {
    OutOfCombat: "Fuori combattimento",
    RollingInitiative: "Tiro iniziativa",
    CombatActive: "Combattimento attivo",
    CombatPaused: "In pausa (Master)"
  };

  function aggiornaTurno(snap) {
    if (!costruito || !rif.turn) { return; }
    var f = fsm();
    if (!snap && f && typeof f.getStato === "function") { try { snap = f.getStato(); } catch (e) { snap = null; } }
    if (!snap) { rif.turn.textContent = "Fuori combattimento"; return; }
    var nome = NOMI_STATO[snap.nome] || snap.nome;
    rif.turn.innerHTML = "";
    rif.turn.appendChild(document.createTextNode(nome));
    if (snap.nome === "CombatActive" || snap.nome === "CombatPaused") {
      var tok = snap.tokenDiTurno || snap.turnoId || "—";
      var b = document.createElement("b");
      b.textContent = " · Turno: " + tok + " · Round " + (snap.round || 0);
      rif.turn.appendChild(b);
    }
  }

  function svuotaRoster() {
    if (!rif.rosterList) { return; }
    rif.rosterList.innerHTML = "";
    rif.rosterList.appendChild(el("div", "vtt-sess-roster-empty", "Nessuno: non connesso."));
  }

  function aggiornaRoster(evento) {
    if (!costruito || !rif.rosterList) { return; }
    var lista = evento && evento.payload && Array.isArray(evento.payload.partecipanti) ? evento.payload.partecipanti : [];
    rif.rosterList.innerHTML = "";
    if (!lista.length) { svuotaRoster(); return; }

    var s = sync();
    var ioId = s && s.statoConnessione ? s.statoConnessione().idGiocatore : null;

    lista.forEach(function (p) {
      var riga = el("div", "vtt-sess-peer" + (p.attore === ioId ? " me" : ""));
      var badge = el("span", "vtt-sess-badge " + (p.ruolo === "gm" ? "gm" : "player"), p.ruolo === "gm" ? "GM" : "PG");
      riga.appendChild(badge);
      riga.appendChild(el("span", "vtt-sess-name", p.attore + (p.attore === ioId ? " (tu)" : "")));
      var posseduti = Array.isArray(p.tokenPosseduti) ? p.tokenPosseduti : [];
      var tokenTxt = p.ruolo === "gm" ? "tutti i token" : (posseduti.length ? posseduti.join(", ") : "nessun token");
      riga.appendChild(el("span", "vtt-sess-tokens", tokenTxt));
      rif.rosterList.appendChild(riga);
    });
  }

  // ---------------------------------------------------------------------------
  // Apertura / chiusura
  // ---------------------------------------------------------------------------
  function mostra(v) {
    aperto = !!v;
    if (rif.panel) { rif.panel.hidden = !aperto; }
    if (aperto) {
      popolaOwners();      // i token possono essere cambiati dall'ultima apertura
      aggiornaVisibilitaOwners();
      aggiornaStato();
      aggiornaTurno();
    }
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  function inizializza() {
    if (!window.document || !document.body) { return; }
    costruisci();

    // Stato connessione live.
    window.addEventListener("vtt-sync", aggiornaStato);
    // Esito autenticazione (token sessione / token Master).
    window.addEventListener("vtt-auth", function (e) { mostraAuth(e && e.detail); });
    // Stato della FSM (turno corrente).
    window.addEventListener("vtt-combat-fsm", function (e) { aggiornaTurno(e && e.detail); });
    // Roster dei partecipanti dal relay.
    var s = sync();
    if (s && typeof s.inAscolto === "function" && s.TipiEvento) {
      s.inAscolto(s.TipiEvento.ROSTER, aggiornaRoster);
    }

    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(21, { sessionPanel: true, ui: true }); } catch (e) { /* best-effort */ }
    }
    log("Modulo 21 caricato: pannello di sessione multiplayer.");
  }

  // API pubblica minimale (apri/chiudi da codice o da altri pulsanti).
  window.UltimateVTTSessionPanel = {
    apri: function () { mostra(true); },
    chiudi: function () { mostra(false); },
    toggle: function () { mostra(!aperto); },
    aggiornaStato: aggiornaStato,
    aggiornaTurno: aggiornaTurno
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 21 JS: PANNELLO DI SESSIONE MULTIPLAYER ---
