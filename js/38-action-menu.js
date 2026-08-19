// --- INIZIO MODULO 38 JS: ACTION / BONUS ACTION MENU DINAMICO ---
// REGOLA 2 della specifica "Lead Game Designer": il PG ha 1 Azione e 1 Azione Bonus per turno, ma
// le OPZIONI di Azione Bonus non sono fisse — vengono istanziate dinamicamente valutando la CLASSE,
// la RAZZA e l'INVENTARIO del personaggio attivo. Una pozione bevuta viene rimossa dall'inventario;
// un'arma secondaria equipaggiata abilita un attacco bonus; una capacità di classe (es. Recupero
// Energie del Guerriero) cura o potenzia.
//
// VINCOLO NEGATIVO 2: niente statistiche/etichette hardcodate sparse nella logica — capacità di
// classe e razza stanno in cataloghi dati (CAPACITA_CLASSE / CAPACITA_RAZZA), così leveling, loot e
// nuovi archetipi restano scalabili aggiungendo voci al catalogo, non codice.
//
// La generazione delle opzioni è una funzione PURA e testabile; la UI (una griglia che si apre dal
// pulsante "⚡ Bonus" nella barra azioni della HUD BG3) e l'esecuzione (spesa risorsa + effetto)
// sono agganci sottili, come fa il modulo 26 (Spingi) per la Spinta.
(function () {
  "use strict";

  var INTERVALLO_MS = 300;

  // ---------------------------------------------------------------------------
  // CATALOGHI DATI (data-driven). effetto: come si risolve; kind: risorsa spesa.
  // ---------------------------------------------------------------------------
  var CAPACITA_CLASSE = {
    "guerriero": [
      { id: "second-wind", etichetta: "Recupero Energie", kind: "bonusAction", effetto: "curaSe", formula: "1d10", scalaLivello: true,
        descrizione: "Recuperi 1d10 + livello HP." }
    ],
    "barbaro": [
      { id: "rage", etichetta: "Ira", kind: "bonusAction", effetto: "annuncio",
        descrizione: "Entri in Ira: vantaggio su prove/TS di Forza, resistenza ai danni." }
    ],
    "ladro": [
      { id: "cunning-action", etichetta: "Azione Scaltra (Scatto)", kind: "bonusAction", effetto: "movimento",
        descrizione: "Scatto/Disimpegno/Nascondersi come azione bonus." }
    ],
    "ranger": [
      { id: "hunters-mark", etichetta: "Marchio del Cacciatore", kind: "bonusAction", effetto: "annuncio",
        descrizione: "Marchi un bersaglio: danni extra sui tuoi colpi." }
    ],
    "mago": [
      { id: "misty-step", etichetta: "Passo Nebbioso", kind: "bonusAction", effetto: "movimento",
        descrizione: "Ti teletrasporti per un breve tratto (movimento extra)." }
    ],
    "chierico": [
      { id: "healing-word", etichetta: "Parola Guaritrice", kind: "bonusAction", effetto: "curaSe", formula: "1d4", scalaLivello: false,
        descrizione: "Curi 1d4 + mod. a distanza." }
    ]
  };

  var CAPACITA_RAZZA = {
    "mezzorco": [
      { id: "relentless", etichetta: "Tenacia Feroce", kind: "bonusAction", effetto: "annuncio",
        descrizione: "La tua ferocia ti tiene in piedi: pronto a resistere." }
    ],
    "elfo": [
      { id: "trance-focus", etichetta: "Concentrazione Elfica", kind: "bonusAction", effetto: "annuncio",
        descrizione: "Ti concentri con lucidità elfica sul prossimo colpo." }
    ],
    "halfling": [
      { id: "lucky-nudge", etichetta: "Fortuna Halfling", kind: "bonusAction", effetto: "annuncio",
        descrizione: "Sposti la fortuna a tuo favore." }
    ]
  };

  // ---------------------------------------------------------------------------
  // GENERAZIONE DINAMICA (funzione pura): dato un contesto normalizzato, produce le opzioni di
  // Azione Bonus disponibili ORA. Nessun effetto collaterale, così è testabile in isolamento.
  //   ctx = {
  //     className, ancestry,           // stringhe (es. "Guerriero", "Elfo")
  //     level,                          // livello del PG (per le formule che scalano)
  //     consumabili: [{ inventoryId, name, healing }],   // pozioni & simili nell'inventario
  //     armaSecondaria: { name, damage } | null          // arma equipaggiata in mano secondaria
  //   }
  // ---------------------------------------------------------------------------
  function opzioniAzioneBonus(ctx) {
    ctx = ctx || {};
    var out = [];

    // 1) Capacità di CLASSE
    var cls = normalizza(ctx.className);
    (CAPACITA_CLASSE[cls] || []).forEach(function (cap) {
      out.push(vociDaCapacita(cap, "classe"));
    });

    // 2) Capacità di RAZZA
    var raz = normalizza(ctx.ancestry);
    (CAPACITA_RAZZA[raz] || []).forEach(function (cap) {
      out.push(vociDaCapacita(cap, "razza"));
    });

    // 3) INVENTARIO — consumabili curativi: "Bevi <nome>" (bonus action, rimosso dopo l'uso)
    (ctx.consumabili || []).forEach(function (c) {
      if (!c || !c.healing) { return; }
      out.push({
        id: "usa-" + c.inventoryId,
        etichetta: "Bevi " + c.name,
        kind: "bonusAction",
        fonte: "inventario",
        effetto: "pozione",
        descrizione: "Cura " + c.healing + " HP. L'oggetto viene consumato.",
        inventoryId: c.inventoryId,
        formula: c.healing
      });
    });

    // 3b) INVENTARIO — arma secondaria equipaggiata: attacco bonus (combattimento con due armi)
    if (ctx.armaSecondaria && ctx.armaSecondaria.name) {
      out.push({
        id: "offhand-attack",
        etichetta: "Colpo con " + ctx.armaSecondaria.name,
        kind: "bonusAction",
        fonte: "inventario",
        effetto: "attaccoSecondario",
        descrizione: "Attacco bonus con l'arma secondaria (" + (ctx.armaSecondaria.damage || "1d4") + ").",
        danno: ctx.armaSecondaria.damage || "1d4"
      });
    }

    return out;
  }

  function vociDaCapacita(cap, fonte) {
    return {
      id: cap.id,
      etichetta: cap.etichetta,
      kind: cap.kind || "bonusAction",
      fonte: fonte,
      effetto: cap.effetto,
      descrizione: cap.descrizione || "",
      formula: cap.formula || null,
      scalaLivello: Boolean(cap.scalaLivello)
    };
  }

  function normalizza(s) { return String(s || "").toLowerCase().trim(); }

  // ---------------------------------------------------------------------------
  // Lettura del contesto REALE dal gioco (state manager 04, inventario 05).
  // ---------------------------------------------------------------------------
  function contestoCorrente() {
    var identity = {}, level = 1;
    try {
      var s = window.UltimateVTTState.getState();
      identity = s.identity || {};
      level = intero(identity.level, 1);
    } catch (e) { /* fallback vuoto */ }

    var consumabili = [], armaSecondaria = null;
    var inv = window.UltimateVTTInventory;
    if (inv && inv.getState) {
      try {
        var st = inv.getState();
        var catalogo = inv.itemCatalog || [];
        var perId = {};
        catalogo.forEach(function (c) { perId[c.id] = c; });

        (st.inventory || []).forEach(function (entry) {
          var cat = perId[entry.catalogId];
          if (cat && cat.type === "consumable" && cat.healing) {
            consumabili.push({ inventoryId: entry.inventoryId, name: cat.name, healing: cat.healing });
          }
        });

        var offId = st.equipmentSlots && st.equipmentSlots.offHand;
        if (offId) {
          var offEntry = (st.inventory || []).filter(function (e) { return e.inventoryId === offId; })[0]
            || (st.inventory || []).filter(function (e) { return e.equippedSlot === "offHand"; })[0];
          var offCat = offEntry ? perId[offEntry.catalogId] : null;
          if (offCat && offCat.type === "weapon" && offCat.damage) {
            armaSecondaria = { name: offCat.name, damage: offCat.damage };
          }
        }
      } catch (e) { /* inventario opzionale */ }
    }

    return {
      className: identity.className || "",
      ancestry: identity.ancestry || "",
      level: level,
      consumabili: consumabili,
      armaSecondaria: armaSecondaria
    };
  }

  // ---------------------------------------------------------------------------
  // ESECUZIONE di un'opzione: spende la risorsa (Azione Bonus) e applica l'effetto. Ritorna true
  // se eseguita. Se la risorsa non è disponibile, non fa nulla (il pulsante è già disabilitato).
  // ---------------------------------------------------------------------------
  function esegui(opzione) {
    if (!opzione) { return false; }
    var inv = window.UltimateVTTInventory;

    // Spesa risorsa (Regola 2: 1 Azione Bonus per turno).
    if (inv && inv.spendActionResource) {
      var speso = false;
      try { speso = inv.spendActionResource(opzione.kind || "bonusAction") === true; } catch (e) { speso = false; }
      if (!speso) { annuncia("Azione Bonus già spesa in questo turno."); return false; }
    }

    switch (opzione.effetto) {
      case "pozione":       return effettoPozione(opzione);
      case "curaSe":        return effettoCuraSe(opzione);
      case "attaccoSecondario": return effettoAttaccoSecondario(opzione);
      case "movimento":     return effettoMovimento(opzione);
      case "annuncio":
      default:              annuncia("✦ " + opzione.etichetta + (opzione.descrizione ? " — " + opzione.descrizione : "")); return true;
    }
  }

  function effettoPozione(opzione) {
    var guarigione = tira(opzione.formula || "2d4+2");
    try { window.UltimateVTTState.heal(guarigione); } catch (e) { /* ignora */ }
    // Consuma UNA unità dell'oggetto (Regola 2: dopo l'uso, rimosso dall'inventario).
    try { if (window.UltimateVTTInventory && opzione.inventoryId) { window.UltimateVTTInventory.dropInventoryItem(opzione.inventoryId); } } catch (e) { /* ignora */ }
    annuncia("🧪 " + opzione.etichetta + ": cura " + guarigione + " HP. Oggetto consumato.");
    return true;
  }

  function effettoCuraSe(opzione) {
    var bonus = opzione.scalaLivello ? livelloAttivo() : modificatoreCaratteristicaPrincipale();
    var guarigione = tira(opzione.formula || "1d4") + bonus;
    try { window.UltimateVTTState.heal(guarigione); } catch (e) { /* ignora */ }
    annuncia("✚ " + opzione.etichetta + ": recuperi " + guarigione + " HP.");
    return true;
  }

  function effettoAttaccoSecondario(opzione) {
    var C = window.UltimateVTTCombat;
    var st = C && C.getState ? C.getState() : null;
    var bersaglio = st ? st.selectedTargetId : null;
    if (!C || !bersaglio) { annuncia("⚔️ Nessun bersaglio per l'attacco secondario."); return true; }
    // Attacco bonus con l'arma secondaria contro il bersaglio corrente. Usa la risoluzione animata
    // tra due combattenti (mostra i dadi) se disponibile, così l'attacco bonus è visibile come gli
    // altri; l'attaccante è il PG locale ("pc-local").
    try {
      if (typeof C.resolveAttackAnimatoTra === "function") { C.resolveAttackAnimatoTra("pc-local", bersaglio, "normal"); }
      else if (typeof C.resolveAttack === "function") { C.resolveAttack(); }
    } catch (e) { /* ignora */ }
    annuncia("⚔️ " + opzione.etichetta + " (attacco bonus).");
    return true;
  }

  function effettoMovimento(opzione) {
    // Movimento extra (Scatto/Passo Nebbioso): se la FSM espone un modo per rigenerare il budget di
    // movimento del turno lo usa, altrimenti si limita ad annunciare (l'effetto tattico è narrato).
    var f = window.UltimateVTTCombatFSM;
    try {
      if (f && typeof f.concediMovimentoExtra === "function") { f.concediMovimentoExtra("pc-local"); }
    } catch (e) { /* opzionale */ }
    annuncia("💨 " + opzione.etichetta + ": guadagni movimento extra.");
    return true;
  }

  // ---------------------------------------------------------------------------
  // Utility di supporto agli effetti
  // ---------------------------------------------------------------------------
  function tira(formula) {
    // Preferisci il roller del motore combat (coerente col resto del gioco); fallback locale.
    var C = window.UltimateVTTCombat;
    if (C && typeof C.rollDamageFormula === "function") {
      try { var r = C.rollDamageFormula(formula, false); if (r && typeof r.total === "number") { return r.total; } } catch (e) { /* fallback */ }
    }
    return tiraLocale(formula);
  }
  function tiraLocale(formula) {
    var norm = String(formula || "1d4").replace(/\s+/g, "").toLowerCase();
    var tot = 0;
    (norm.match(/[+-]?[^+-]+/g) || []).forEach(function (t) {
      var d = t.match(/^([+-]?)(\d*)d(\d+)$/);
      var f = t.match(/^([+-]?\d+)$/);
      if (d) {
        var seg = d[1] === "-" ? -1 : 1, n = parseInt(d[2] || "1", 10), facce = parseInt(d[3], 10);
        for (var i = 0; i < n; i++) { tot += seg * (1 + Math.floor(Math.random() * facce)); }
      } else if (f) { tot += parseInt(f[1], 10); }
    });
    return Math.max(1, tot);
  }
  function livelloAttivo() { try { return intero(window.UltimateVTTState.getState().identity.level, 1); } catch (e) { return 1; } }
  function modificatoreCaratteristicaPrincipale() {
    try {
      var s = window.UltimateVTTState.getState();
      var wis = s.abilities && s.abilities.wis ? s.abilities.wis.score : 10;
      return Math.floor((wis - 10) / 2);
    } catch (e) { return 0; }
  }
  function intero(v, def) { var n = parseInt(v, 10); return isFinite(n) ? n : def; }

  function annuncia(m) {
    if (window.UltimateVTTCoreGameplay && typeof window.UltimateVTTCoreGameplay.appendChatMessage === "function") {
      try { window.UltimateVTTCoreGameplay.appendChatMessage("system", m); return; } catch (e) { /* ignora */ }
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog(m); } catch (e) { /* ignora */ }
    }
  }

  // ---------------------------------------------------------------------------
  // UI: pulsante "⚡ Bonus" nella barra azioni della HUD BG3 + griglia a comparsa delle opzioni.
  // ---------------------------------------------------------------------------
  var iniettato = false;
  var popup = null;

  function bonusDisponibile() {
    var inv = window.UltimateVTTInventory;
    try { var ae = inv && inv.getState ? inv.getState().actionEconomy : null; return ae ? Boolean(ae.bonusAction) : true; }
    catch (e) { return true; }
  }
  function turnoDelPg() {
    var C = window.UltimateVTTCombat;
    try {
      var st = C.getState();
      var cur = st.combatants[st.currentTurnIndex];
      return Boolean(cur && cur.kind === "pc");
    } catch (e) { return false; }
  }

  function chiudiPopup() { if (popup) { popup.remove(); popup = null; } }

  function apriPopup(ancora) {
    chiudiPopup();
    var opzioni = opzioniAzioneBonus(contestoCorrente());
    popup = document.createElement("div");
    popup.className = "bg3-bonus-menu";
    if (!opzioni.length) {
      popup.appendChild(nodo("div", "bg3-bonus-empty", "Nessuna azione bonus disponibile."));
    } else {
      opzioni.forEach(function (o) {
        var card = nodo("button", "bg3-bonus-item fonte-" + o.fonte, null);
        card.type = "button";
        card.appendChild(nodo("span", "bg3-bonus-label", o.etichetta));
        card.appendChild(nodo("span", "bg3-bonus-src", etichettaFonte(o.fonte)));
        if (o.descrizione) { card.appendChild(nodo("span", "bg3-bonus-desc", o.descrizione)); }
        card.addEventListener("click", function () { esegui(o); chiudiPopup(); });
        popup.appendChild(card);
      });
    }
    document.body.appendChild(popup);
    // Posiziona sopra il pulsante che l'ha aperto.
    var r = ancora.getBoundingClientRect();
    popup.style.left = Math.round(r.left) + "px";
    popup.style.bottom = Math.round(window.innerHeight - r.top + 8) + "px";
  }

  function etichettaFonte(f) { return f === "classe" ? "Classe" : f === "razza" ? "Razza" : "Zaino"; }
  function nodo(tag, cls, testo) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (testo != null) { n.textContent = testo; } return n; }

  function iniettaBottone() {
    if (iniettato || !document.body) { return; }
    var tray = document.querySelector(".bg3-actions");
    if (!tray) { return; } // HUD non ancora costruita: ritenta al prossimo tick
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "bg3BonusButton";
    btn.className = "bg3-btn bonus-menu";
    btn.textContent = "⚡ Bonus";
    btn.title = "Scegli un'azione bonus (dipende da classe, razza e inventario)";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (popup) { chiudiPopup(); return; }
      apriPopup(btn);
    });
    // Chiudi il popup cliccando altrove.
    document.addEventListener("click", function (ev) {
      if (popup && ev.target !== btn && !popup.contains(ev.target)) { chiudiPopup(); }
    });
    var endBtn = null;
    for (var i = 0; i < tray.children.length; i += 1) {
      if (/Termina turno/.test(tray.children[i].textContent || "")) { endBtn = tray.children[i]; break; }
    }
    if (endBtn) { tray.insertBefore(btn, endBtn); } else { tray.appendChild(btn); }
    iniettato = true;
  }

  function aggiornaStatoBottone() {
    var btn = document.getElementById("bg3BonusButton");
    if (!btn) { return; }
    var attivabile = turnoDelPg() && bonusDisponibile();
    btn.disabled = !attivabile;
    if (!attivabile && popup) { chiudiPopup(); }
  }

  var timer = null;
  function inizializza() {
    if (!window.document) { return; }
    iniettaBottone();
    if (!timer) { timer = window.setInterval(function () { iniettaBottone(); aggiornaStatoBottone(); }, INTERVALLO_MS); }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(38, { actionMenu: true }); } catch (e) { /* best-effort */ }
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog("Modulo 38 caricato: menu Azione Bonus dinamico (classe/razza/inventario)."); } catch (e) { /* ignora */ }
    }
  }

  window.UltimateVTTActionMenu = {
    // logica pura (testabile)
    opzioniAzioneBonus: opzioniAzioneBonus,
    // lettura del gioco reale + esecuzione
    contestoCorrente: contestoCorrente,
    esegui: esegui,
    // cataloghi (esposti per estensione/loot; niente hardcode nella logica)
    CAPACITA_CLASSE: CAPACITA_CLASSE,
    CAPACITA_RAZZA: CAPACITA_RAZZA,
    // controllo (utile ai test)
    fermaAggiornamento: function () { if (timer) { clearInterval(timer); timer = null; } }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 38 JS: ACTION / BONUS ACTION MENU DINAMICO ---
