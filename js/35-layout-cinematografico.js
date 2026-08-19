// --- INIZIO MODULO 35 JS: LAYOUT CINEMATOGRAFICO (cassetto strumenti del Master) ---
// Il pannellone tecnico sopra la mappa (controlli mappa/nebbia, token, dadi fisici, audio,
// AI bridge e salvataggi) copriva stabilmente la scena centrale. Con il CSS del modulo 35
// diventa un cassetto laterale CHIUSO di default: questo modulo collega il pulsante
// "🛠 STRUMENTI" della topbar (apre/chiude) e la ✕ interna (chiude). Nessun controllo e'
// stato rimosso: stessi id, stesse funzioni, solo fuori dalla visuale finche' non servono.
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  function cassetto() { return el("mapToolsDrawer"); }

  function impostaAperto(valore) {
    var d = cassetto();
    if (!d) { return false; }
    var aperto = typeof valore === "boolean" ? valore : !d.classList.contains("is-open");
    d.classList.toggle("is-open", aperto);
    var toggle = el("mapToolsToggleBtn");
    if (toggle) { toggle.setAttribute("aria-expanded", aperto ? "true" : "false"); }
    return aperto;
  }

  // Stesso pattern retry-finche'-esiste dei moduli Campagna: se il DOM del cassetto non e'
  // ancora stato parsato quando questo script gira, si riprova poco dopo invece di fallire
  // in silenzio una volta sola (era la causa dei "pulsanti che non fanno niente").
  function collega() {
    var toggle = el("mapToolsToggleBtn");
    var chiudi = el("mapToolsCloseBtn");
    if (!toggle || !cassetto()) {
      window.setTimeout(collega, 200);
      return;
    }
    toggle.addEventListener("click", function () { impostaAperto(); });
    if (chiudi) { chiudi.addEventListener("click", function () { impostaAperto(false); }); }
  }

  // La topbar puo' andare a capo su schermi stretti: gli elementi fissati "sotto la topbar"
  // (barra iniziativa BG3) leggono l'altezza REALE da questa variabile CSS, non da un numero
  // fisso che su due righe li farebbe sovrapporre ai pulsanti.
  function misuraTopbar() {
    var topbar = document.querySelector(".topbar");
    if (!topbar) { return; }
    var h = Math.ceil(topbar.getBoundingClientRect().height) || 58;
    document.documentElement.style.setProperty("--topbar-real-height", h + "px");
  }

  function osservaTopbar() {
    misuraTopbar();
    window.addEventListener("resize", misuraTopbar);
    if (typeof window.ResizeObserver === "function") {
      var topbar = document.querySelector(".topbar");
      if (topbar) { new ResizeObserver(misuraTopbar).observe(topbar); }
    }
  }

  function inizializza() {
    collega();
    osservaTopbar();
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(35, { cassettoStrumenti: true }); } catch (e) { /* best-effort */ }
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog("Modulo 35 caricato: strumenti del Master in cassetto laterale (chiuso di default)."); } catch (e) { /* ignora */ }
    }
  }

  window.UltimateVTTLayout = {
    apriStrumenti: function () { return impostaAperto(true); },
    chiudiStrumenti: function () { return impostaAperto(false); },
    strumentiAperti: function () { var d = cassetto(); return Boolean(d && d.classList.contains("is-open")); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 35 JS: LAYOUT CINEMATOGRAFICO ---
