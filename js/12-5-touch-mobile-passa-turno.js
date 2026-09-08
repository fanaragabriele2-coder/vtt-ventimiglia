/*
 * Patch per il touch su mobile e passaggio del turno.
 *
 * Estratto da 12-patch-touch-events-per-mobile.js, che conteneva sette moduli
 * indipendenti in un unico file da 3600 righe, sotto un nome che ne descriveva
 * solo uno. L'ordine di caricamento e' quello originale: i file 12-1 … 12-8
 * vanno inclusi in sequenza in index.html.
 */

    // --- PATCH: AUTO MOBILE MODE + PASS-TURN HUD ---
    (function patchMobileAndPassTurn() {
      /* Auto-attivazione modalità console su schermi < 860px */
      if (window.innerWidth < 860) {
        document.body.classList.add("ally-mode");
        var btn = document.getElementById("rogAllyModeButton");
        if (btn) { btn.setAttribute("aria-pressed", "true"); btn.textContent = "MODALITÀ DESKTOP"; }
      }
      window.addEventListener("resize", function () {
        if (window.innerWidth < 860) {
          document.body.classList.add("ally-mode");
        }
      });

      /* Bottone "Passa Turno" nella barra in-page (scheda sinistra) */
      var passTurnBtn = document.getElementById("passTurnButton");
      if (passTurnBtn) {
        passTurnBtn.addEventListener("click", function () {
          if (window.UltimateVTTCombat && window.UltimateVTTCombat.nextTurn) {
            window.UltimateVTTCombat.nextTurn();
          }
        });
      }

      /* Prova abilità dalla chat del Master (es. "prova percezione CD 14") */
      var chatForm = document.getElementById("masterChatForm");
      if (chatForm) {
        chatForm.addEventListener("submit", function (e) {
          var input = document.getElementById("masterChatInput");
          if (!input) return;
          var text = input.value.toLowerCase();
          /* se contiene "prova" e un'abilità, tira un d20 rapido e mostra HUD */
          var abilities = { percezione:5, furtività:2, atletica:4, persuasione:5, arcano:3, medicina:4, inganno:3, storia:2 };
          var found = null;
          Object.keys(abilities).forEach(function (k) { if (text.indexOf(k) !== -1) found = k; });
          var cdMatch = text.match(/cd\s*(\d+)/);
          if (found) {
            e.preventDefault();
            var roll = Math.floor(Math.random() * 20) + 1;
            var bonus = abilities[found];
            var total = roll + bonus;
            var cd = cdMatch ? parseInt(cdMatch[1], 10) : 0;
            var risultato = cd ? (total >= cd ? "RIUSCITA" : "FALLITA") : "";
            var msg = "Prova " + found + ": d20(" + roll + ")+" + bonus + "=" + total + (cd ? " vs CD " + cd + " → " + risultato : "");
            /* aggiungi al log chat */
            var log = document.getElementById("masterChatLog");
            if (log) {
              var div = document.createElement("div");
              div.className = "master-chat-message system";
              div.innerHTML = '<span class="master-chat-speaker">Sistema</span><p>' + window.UltimateVTTUtils.escapeHtml(msg) + '</p>';
              log.appendChild(div);
              log.scrollTop = log.scrollHeight;
            }
            /* mostra nel system log */
            if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
              window.UltimateVTT.appendSystemLog(msg);
            }
            input.value = "";
            return;
          }
        }, true); /* capture per intercettare prima degli altri handler */
      }
    })();
    // --- FINE PATCH MOBILE ---
