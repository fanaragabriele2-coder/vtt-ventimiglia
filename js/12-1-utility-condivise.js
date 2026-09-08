/*
 * Utility condivise dei moduli 12-x (escape HTML per i testi del giocatore).
 *
 * Estratto da 12-patch-touch-events-per-mobile.js, che conteneva sette moduli
 * indipendenti in un unico file da 3600 righe, sotto un nome che ne descriveva
 * solo uno. L'ordine di caricamento e' quello originale: i file 12-1 … 12-8
 * vanno inclusi in sequenza in index.html.
 */
    // --- UTILITY CONDIVISE DEI MODULI DI QUESTO FILE ---
    // Ogni blocco qui sotto e' una IIFE separata: le funzioni comuni vanno
    // esposte su window.UltimateVTT*, come fanno gli altri moduli del progetto.
    (function initUltimateVTTUtils() {
      "use strict";
      var utils = window.UltimateVTTUtils || (window.UltimateVTTUtils = {});

      // Neutralizza i caratteri HTML nei testi scritti dal giocatore (nomi PG,
      // messaggi) prima di inserirli con innerHTML: senza, un personaggio
      // chiamato "Aldrico <il Grande>" perde meta' nome, perche' il browser
      // interpreta "<il" come l'inizio di un tag.
      utils.escapeHtml = function (value) {
        return String(value == null ? "" : value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      };
    })();

