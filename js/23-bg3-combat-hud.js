// --- INIZIO MODULO 23 JS: HUD DI COMBATTIMENTO STILE BALDUR'S GATE 3 ---
// Mette in scena la meccanica 5e gia' esistente (modulo 06 combat, modulo 19 FSM/budget,
// modulo 05 action economy) con un'interfaccia in stile BG3, SENZA modificare quei moduli:
//
//  - Barra dell'ordine d'iniziativa in alto (turno corrente evidenziato; click su un nemico = bersaglio).
//  - Anteprima della PROBABILITA' DI COLPIRE il bersaglio (la "70%" di BG3), con vantaggio/svantaggio.
//  - Economia delle azioni del turno (azione / bonus / reazione) + barra del movimento residuo.
//  - Selettore modalita' di tiro (Normale / Vantaggio / Svantaggio) e pulsanti Attacca / Termina turno.
//
// Si aggancia solo a window.UltimateVTT* gia' presenti. La HUD compare solo a combattimento attivo,
// quindi non disturba l'esplorazione. Aggiornamento per polling leggero con diff (come gia' fa il
// modulo XP), perche' il modulo combat non emette eventi.
(function () {
  "use strict";

  var INTERVALLO_MS = 250;

  function combat() { return window.UltimateVTTCombat || null; }
  function fsm() { return window.UltimateVTTCombatFSM || null; }
  function inventory() { return window.UltimateVTTInventory || null; }

  function statoCombat() {
    var c = combat();
    if (!c || typeof c.getState !== "function") { return null; }
    try { return c.getState(); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------------------
  // Matematica della probabilita' di colpire (D&D 5e, come BG3) — funzioni pure e testabili.
  // Tiro per colpire: d20 + bonusAttacco >= CA. Il 20 naturale colpisce sempre, l'1 manca sempre.
  // ---------------------------------------------------------------------------
  function probColpireDado(bonusAttacco, ca) {
    var colpi = 0;
    for (var r = 1; r <= 20; r += 1) {
      if (r === 20) { colpi += 1; continue; }       // 20 naturale: colpo automatico
      if (r === 1) { continue; }                     // 1 naturale: mancato automatico
      if (r + bonusAttacco >= ca) { colpi += 1; }
    }
    return colpi / 20;
  }

  // Applica vantaggio (2d20 si prende il piu' alto) o svantaggio (il piu' basso) alla probabilita'.
  function probColpire(bonusAttacco, ca, modalita) {
    var p = probColpireDado(bonusAttacco, ca);
    if (modalita === "advantage") { return 1 - (1 - p) * (1 - p); }
    if (modalita === "disadvantage") { return p * p; }
    return p;
  }

  function percento(p) { return Math.round(p * 100); }

  // Danno medio atteso di una formula tipo "2d6+3": media di XdY = X*(Y+1)/2, piu' i modificatori
  // fissi, con i segni. Serve all'anteprima del danno (come BG3 mostra accanto alla % di colpire).
  function dannoMedio(formula) {
    var norm = String(formula || "").replace(/\s+/g, "").toLowerCase();
    var termini = norm.match(/[+-]?[^+-]+/g) || [];
    var media = 0;
    termini.forEach(function (t) {
      var dado = t.match(/^([+-]?)(\d*)d(\d+)$/);
      var fisso = t.match(/^([+-]?\d+)$/);
      if (dado) {
        var segno = dado[1] === "-" ? -1 : 1;
        var conta = parseInt(dado[2] || "1", 10);
        var facce = parseInt(dado[3], 10);
        if (conta > 0 && facce > 0) { media += segno * conta * (facce + 1) / 2; }
      } else if (fisso) {
        media += parseInt(fisso[1], 10);
      }
    });
    return Math.max(0, Math.round(media));
  }

  // ---------------------------------------------------------------------------
  // Costruzione del DOM (una volta sola)
  // ---------------------------------------------------------------------------
  var rif = {};
  var costruito = false;
  var ultimaFirma = "";

  function el(tag, cls, testo) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (testo != null) { n.textContent = testo; }
    return n;
  }

  function costruisci() {
    if (costruito || !document.body) { return; }

    var hud = el("div", "bg3-hud");
    hud.hidden = true;

    var initiative = el("div", "bg3-initiative");
    hud.appendChild(initiative);

    var feed = el("div", "bg3-feed");
    feed.hidden = true;
    hud.appendChild(feed);

    var tray = el("div", "bg3-tray");

    // Blocco turno / economia azioni
    var bAzioni = el("div", "bg3-block");
    bAzioni.appendChild(el("div", "bg3-block-label", "Turno"));
    var pips = el("div", "bg3-pips");
    var pipAzione = pipElemento("azione", "Azione");
    var pipBonus = pipElemento("bonus", "Bonus");
    var pipReazione = pipElemento("reazione", "Reazione");
    pips.appendChild(pipAzione.root); pips.appendChild(pipBonus.root); pips.appendChild(pipReazione.root);
    bAzioni.appendChild(pips);
    tray.appendChild(bAzioni);

    // Blocco movimento
    var bMov = el("div", "bg3-block");
    bMov.appendChild(el("div", "bg3-block-label", "Movimento"));
    var movVal = el("div", "bg3-move-val", "–");
    bMov.appendChild(movVal);
    var movTrack = el("div", "bg3-move-track");
    var movFill = el("div", "bg3-move-fill");
    movTrack.appendChild(movFill);
    bMov.appendChild(movTrack);
    tray.appendChild(bMov);

    // Blocco bersaglio + percentuale di colpire
    var bTarget = el("div", "bg3-block bg3-target");
    bTarget.appendChild(el("div", "bg3-block-label", "Bersaglio"));
    var targetName = el("div", "bg3-target-name", "");
    bTarget.appendChild(targetName);
    var flankBadge = el("div", "bg3-flank-badge", "🗡 Fiancheggiato");
    flankBadge.hidden = true;
    bTarget.appendChild(flankBadge);
    var elevBadge = el("div", "bg3-elev-badge", "");
    elevBadge.hidden = true;
    bTarget.appendChild(elevBadge);
    var hitRow = el("div", "bg3-hit");
    var hitPct = el("span", "bg3-hit-pct", "–");
    var hitMode = el("span", "bg3-hit-mode", "");
    hitRow.appendChild(hitPct); hitRow.appendChild(hitMode);
    bTarget.appendChild(hitRow);
    var dmgLine = el("div", "bg3-dmg", "");
    bTarget.appendChild(dmgLine);
    tray.appendChild(bTarget);

    // Blocco modalita' di tiro
    var bModi = el("div", "bg3-block");
    bModi.appendChild(el("div", "bg3-block-label", "Tiro"));
    var modi = el("div", "bg3-modes");
    var mNorm = modeBtn("normal", "Normale");
    var mAdv = modeBtn("advantage", "Vantaggio");
    var mDis = modeBtn("disadvantage", "Svantaggio");
    modi.appendChild(mNorm); modi.appendChild(mAdv); modi.appendChild(mDis);
    bModi.appendChild(modi);
    tray.appendChild(bModi);

    // Blocco azioni principali
    var bBtns = el("div", "bg3-block bg3-actions");
    var btnAttacca = el("button", "bg3-btn attack", "Attacca");
    btnAttacca.type = "button";
    btnAttacca.addEventListener("click", azioneAttacca);
    var btnEnd = el("button", "bg3-btn endturn", "Termina turno");
    btnEnd.type = "button";
    btnEnd.addEventListener("click", azioneTerminaTurno);
    bBtns.appendChild(btnAttacca); bBtns.appendChild(btnEnd);
    tray.appendChild(bBtns);

    hud.appendChild(tray);
    document.body.appendChild(hud);

    rif = {
      hud: hud, initiative: initiative, feed: feed,
      pipAzione: pipAzione, pipBonus: pipBonus, pipReazione: pipReazione,
      movVal: movVal, movFill: movFill,
      targetName: targetName, flankBadge: flankBadge, elevBadge: elevBadge, hitPct: hitPct, hitMode: hitMode, dmgLine: dmgLine, targetBlock: bTarget,
      modi: { normal: mNorm, advantage: mAdv, disadvantage: mDis },
      btnAttacca: btnAttacca, btnEnd: btnEnd
    };
    costruito = true;
  }

  function pipElemento(chiave, etichetta) {
    var root = el("span", "bg3-pip " + chiave);
    var dot = el("span", "dot");
    root.appendChild(dot);
    root.appendChild(document.createTextNode(etichetta));
    return { root: root, chiave: chiave };
  }

  function modeBtn(modalita, etichetta) {
    var b = el("button", "bg3-mode-btn", etichetta);
    b.type = "button";
    b.setAttribute("data-roll-mode", modalita);
    b.addEventListener("click", function () {
      var c = combat();
      if (c && typeof c.setRollMode === "function") { try { c.setRollMode(modalita); } catch (e) { /* ignora */ } }
      render(true);
    });
    return b;
  }

  // ---------------------------------------------------------------------------
  // Azioni
  // ---------------------------------------------------------------------------
  function selezionaTarget(combatantId) {
    var sel = document.getElementById("moduleFiveTargetSelect");
    if (sel) {
      var presente = Array.prototype.some.call(sel.options, function (o) { return o.value === combatantId; });
      if (!presente) { var o = document.createElement("option"); o.value = combatantId; o.textContent = combatantId; sel.appendChild(o); }
      sel.value = combatantId;
      try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {
        // Vecchi browser: costruzione manuale dell'evento.
        var ev = document.createEvent("HTMLEvents"); ev.initEvent("change", true, false); sel.dispatchEvent(ev);
      }
    }
    render(true);
  }

  function azioneAttacca() {
    var c = combat();
    if (!c || typeof c.resolveAttack !== "function") { return; }
    try { c.resolveAttack(); } catch (e) { /* ignora */ }
    render(true);
  }

  function azioneTerminaTurno() {
    var f = fsm();
    if (f && typeof f.terminaTurno === "function") { try { f.terminaTurno(); render(true); return; } catch (e) { /* fallback sotto */ } }
    var c = combat();
    if (c && typeof c.nextTurn === "function") { try { c.nextTurn(); } catch (e) { /* ignora */ } }
    render(true);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function combattenteCorrente(st) {
    if (!st || !Array.isArray(st.combatants)) { return null; }
    if (st.currentTurnIndex < 0 || st.currentTurnIndex >= st.combatants.length) { return null; }
    return st.combatants[st.currentTurnIndex];
  }

  function firma(st) {
    if (!st) { return "off"; }
    var inv = inventory();
    var ae = null;
    try { ae = inv && inv.getState ? inv.getState().actionEconomy : null; } catch (e) { ae = null; }
    var hp = (st.combatants || []).map(function (c) { return c.id + ":" + c.hitPoints + (c.defeated ? "x" : ""); }).join(",");
    return [
      st.active, st.round, st.currentTurnIndex, st.selectedTargetId, st.rollMode,
      hp, st.lastRoll && st.lastRoll.detail,
      ae ? [ae.action, ae.bonusAction, ae.reaction, ae.movementMetersUsed].join("/") : "-"
    ].join("|");
  }

  function render(forza) {
    if (!costruito) { return; }
    var st = statoCombat();

    // Visibilita': solo a combattimento attivo.
    var attivo = Boolean(st && st.active);
    rif.hud.hidden = !attivo;
    if (!attivo) { ultimaFirma = "off"; return; }

    if (!forza) {
      var f = firma(st);
      if (f === ultimaFirma) { return; }
      ultimaFirma = f;
    } else {
      ultimaFirma = firma(st);
    }

    var corrente = combattenteCorrente(st);
    var bersaglio = trovaCombattente(st, st.selectedTargetId);

    renderIniziativa(st, corrente, bersaglio);
    renderTurnoEMovimento(st, corrente);
    renderBersaglioEColpo(st, corrente, bersaglio);
    renderModalita(st);
    renderFeed(st);

    // Stato pulsanti.
    var puoAttaccare = Boolean(corrente && bersaglio && !bersaglio.defeated && bersaglio.id !== corrente.id);
    rif.btnAttacca.disabled = !puoAttaccare;
  }

  function trovaCombattente(st, id) {
    if (!st || !Array.isArray(st.combatants)) { return null; }
    for (var i = 0; i < st.combatants.length; i += 1) { if (st.combatants[i].id === id) { return st.combatants[i]; } }
    return null;
  }

  function renderIniziativa(st, corrente, bersaglio) {
    var cont = rif.initiative;
    cont.innerHTML = "";
    (st.combatants || []).forEach(function (c) {
      var card = el("div", "bg3-init-card " + (c.kind === "pc" ? "is-pc" : "is-enemy"));
      if (corrente && c.id === corrente.id) { card.classList.add("is-turn"); }
      if (bersaglio && c.id === bersaglio.id) { card.classList.add("is-target"); }
      if (c.defeated || c.hitPoints <= 0) { card.classList.add("is-down"); }

      card.appendChild(el("span", "bg3-init-name", c.name || c.id));
      if (typeof c.initiative === "number" && c.initiative > 0) { card.appendChild(el("span", "bg3-init-init", String(c.initiative))); }

      var track = el("div", "bg3-init-hptrack");
      var fill = el("div", "bg3-init-hpfill");
      var max = c.maxHitPoints || c.hitPoints || 1;
      fill.style.width = Math.max(0, Math.min(100, Math.round((c.hitPoints / max) * 100))) + "%";
      track.appendChild(fill);
      card.appendChild(track);
      card.appendChild(el("span", "bg3-init-hptext", Math.max(0, c.hitPoints) + " / " + max));

      if (c.kind !== "pc") {
        card.addEventListener("click", function () { selezionaTarget(c.id); });
      }
      cont.appendChild(card);
    });
  }

  function renderTurnoEMovimento(st, corrente) {
    var ePc = Boolean(corrente && corrente.kind === "pc");
    var inv = inventory();
    var ae = null;
    try { ae = inv && inv.getState ? inv.getState().actionEconomy : null; } catch (e) { ae = null; }

    // I pip dell'economia azioni hanno senso per il PG locale; per i nemici si spengono.
    accendiPip(rif.pipAzione, ePc && ae ? ae.action : false);
    accendiPip(rif.pipBonus, ePc && ae ? ae.bonusAction : false);
    accendiPip(rif.pipReazione, ePc && ae ? ae.reaction : false);

    // Movimento residuo dal budget della FSM (per il token del combattente di turno).
    var f = fsm();
    var residuo = null, velocita = null;
    if (f && corrente && typeof f.combattenteAToken === "function") {
      var token = f.combattenteAToken(corrente.id);
      if (token && typeof f.movimentoResiduo === "function") {
        var r = f.movimentoResiduo(token);
        if (isFinite(r)) {
          residuo = r;
          try {
            var snap = f.getStato();
            var b = snap && snap.budget && snap.budget[corrente.id];
            if (b && typeof b.velocita === "number") { velocita = b.velocita; }
          } catch (e) { /* ignora */ }
        }
      }
    }
    if (residuo != null) {
      var vel = velocita || residuo;
      rif.movVal.textContent = Math.round(residuo) + " / " + Math.round(vel) + " m";
      rif.movFill.style.width = Math.max(0, Math.min(100, vel ? Math.round((residuo / vel) * 100) : 0)) + "%";
    } else {
      rif.movVal.textContent = "–";
      rif.movFill.style.width = "0%";
    }
  }

  function accendiPip(pip, acceso) {
    if (acceso) { pip.root.classList.add("on"); } else { pip.root.classList.remove("on"); }
  }

  // Consulta il modulo 25 (se caricato) per sapere se il bersaglio e' fiancheggiato dall'attaccante
  // di turno: in tal caso il tiro ha vantaggio (regola 5e opzionale, sempre attiva in BG3). Se il
  // modulo non e' presente, nessun effetto (fallback).
  function fiancheggiamento(attaccanteId, bersaglioId) {
    var F = window.UltimateVTTFlanking;
    if (!F || typeof F.valutaFiancheggiamento !== "function") { return { fiancheggiato: false, alleatoId: null }; }
    try { return F.valutaFiancheggiamento(attaccanteId, bersaglioId) || { fiancheggiato: false, alleatoId: null }; }
    catch (e) { return { fiancheggiato: false, alleatoId: null }; }
  }

  // Consulta il modulo 28 (se caricato) per sapere se l'attaccante e' su un terreno piu' alto o piu'
  // basso di quello del bersaglio: "advantage"/"disadvantage"/"normal". Se il modulo non e' presente,
  // nessun effetto (fallback "normal").
  function elevazione(attaccanteId, bersaglioId) {
    var E = window.UltimateVTTElevation;
    if (!E || typeof E.valutaElevazione !== "function") { return "normal"; }
    try { return E.valutaElevazione(attaccanteId, bersaglioId) || "normal"; }
    catch (e) { return "normal"; }
  }

  // Compone TUTTE le fonti di vantaggio/svantaggio disponibili (fiancheggiamento + elevazione, e la
  // scelta manuale del giocatore) secondo la regola 5e: se c'e' almeno una fonte di ciascun segno,
  // si annullano (torna "normale"). Usa il modulo 28 come combinatore se presente (stessa logica),
  // altrimenti la replica qui in locale come fallback minimale.
  function componiModalitaEffettiva(modalitaScelta, fiancheggiato, esitoElevazione) {
    var E = window.UltimateVTTElevation;
    var haVantaggioExtra = Boolean(fiancheggiato) || esitoElevazione === "advantage";
    var haSvantaggioExtra = esitoElevazione === "disadvantage";
    if (E && typeof E.componiModalita === "function") {
      try { return E.componiModalita(modalitaScelta, haVantaggioExtra, haSvantaggioExtra); } catch (e) { /* fallback sotto */ }
    }
    var vantaggio = haVantaggioExtra || modalitaScelta === "advantage";
    var svantaggio = haSvantaggioExtra || modalitaScelta === "disadvantage";
    if (vantaggio && svantaggio) { return "normal"; }
    if (vantaggio) { return "advantage"; }
    if (svantaggio) { return "disadvantage"; }
    return "normal";
  }

  function renderBersaglioEColpo(st, corrente, bersaglio) {
    if (!corrente || !bersaglio || bersaglio.id === corrente.id || bersaglio.defeated) {
      rif.targetName.textContent = bersaglio ? (bersaglio.name || bersaglio.id) : "";
      rif.targetName.className = "bg3-target-name";
      if (!bersaglio) { rif.targetName.textContent = "Nessun bersaglio"; rif.targetName.className = "bg3-target-empty"; }
      rif.flankBadge.hidden = true;
      rif.elevBadge.hidden = true;
      rif.hitPct.textContent = "–";
      rif.hitPct.className = "bg3-hit-pct";
      rif.hitMode.textContent = "";
      rif.dmgLine.textContent = "";
      return;
    }
    rif.targetName.className = "bg3-target-name";
    rif.targetName.textContent = (bersaglio.name || bersaglio.id) + "  " + Math.max(0, bersaglio.hitPoints) + "/" + (bersaglio.maxHitPoints || bersaglio.hitPoints);

    var fl = fiancheggiamento(corrente.id, bersaglio.id);
    rif.flankBadge.hidden = !fl.fiancheggiato;

    var esitoElev = elevazione(corrente.id, bersaglio.id);
    rif.elevBadge.hidden = esitoElev === "normal";
    if (esitoElev === "advantage") { rif.elevBadge.textContent = "⛰ Terreno sopraelevato"; rif.elevBadge.className = "bg3-elev-badge high"; }
    else if (esitoElev === "disadvantage") { rif.elevBadge.textContent = "⬇ Svantaggio di quota"; rif.elevBadge.className = "bg3-elev-badge low"; }

    var bonus = typeof corrente.attackBonus === "number" ? corrente.attackBonus : 0;
    var ca = typeof bersaglio.armorClass === "number" ? bersaglio.armorClass : 10;
    var modalitaScelta = st.rollMode || "normal";
    var modalitaEff = componiModalitaEffettiva(modalitaScelta, fl.fiancheggiato, esitoElev);
    var p = probColpire(bonus, ca, modalitaEff);
    var pct = percento(p);
    rif.hitPct.textContent = pct + "%";
    rif.hitPct.className = "bg3-hit-pct" + (pct <= 35 ? " low" : pct >= 70 ? " high" : "");
    var modeText = modalitaEff === "advantage" ? "vantaggio" : modalitaEff === "disadvantage" ? "svantaggio" : "";
    var fonti = [];
    if (fl.fiancheggiato) { fonti.push("fiancheggiamento"); }
    if (esitoElev === "advantage") { fonti.push("terreno"); }
    if (esitoElev === "disadvantage") { fonti.push("svantaggio di quota"); }
    rif.hitMode.textContent = (modeText ? modeText + (fonti.length ? " (" + fonti.join(", ") + ")" : "") + " · " : "") + "+" + bonus + " vs CA " + ca;

    // Anteprima del danno previsto (media della formula del combattente di turno).
    var formula = corrente.damageFormula || "";
    var media = dannoMedio(formula);
    rif.dmgLine.textContent = formula ? ("~" + media + " danni (" + formula + ")") : "";
  }

  function renderModalita(st) {
    var m = st.rollMode || "normal";
    ["normal", "advantage", "disadvantage"].forEach(function (k) {
      if (rif.modi[k]) {
        if (k === m) { rif.modi[k].classList.add("active"); } else { rif.modi[k].classList.remove("active"); }
      }
    });
  }

  function renderFeed(st) {
    var testo = st.lastRoll && st.lastRoll.detail ? String(st.lastRoll.detail) : "";
    if (testo && st.active) { rif.feed.hidden = false; rif.feed.textContent = testo; }
    else { rif.feed.hidden = true; }
  }

  // ---------------------------------------------------------------------------
  // Avvio
  // ---------------------------------------------------------------------------
  var timer = null;
  function inizializza() {
    if (!window.document || !document.body) { return; }
    costruisci();
    window.addEventListener("vtt-combat-fsm", function () { render(true); });
    if (!timer) { timer = window.setInterval(function () { render(false); }, INTERVALLO_MS); }
    render(true);
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(23, { bg3CombatHud: true, hitChance: true, initiativeBar: true }); } catch (e) { /* best-effort */ }
    }
  }

  window.UltimateVTTBG3HUD = {
    // funzioni pure (testabili)
    probColpireDado: probColpireDado,
    probColpire: probColpire,
    percento: percento,
    dannoMedio: dannoMedio,
    // controllo
    render: function () { render(true); },
    fermaAggiornamento: function () { if (timer) { clearInterval(timer); timer = null; } }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 23 JS: HUD DI COMBATTIMENTO STILE BALDUR'S GATE 3 ---
