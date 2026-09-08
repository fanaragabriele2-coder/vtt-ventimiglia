/*
 * Core gameplay: chat col Master, blocco dadi, hotseat del party.
 *
 * Estratto da 12-patch-touch-events-per-mobile.js, che conteneva sette moduli
 * indipendenti in un unico file da 3600 righe, sotto un nome che ne descriveva
 * solo uno. L'ordine di caricamento e' quello originale: i file 12-1 … 12-8
 * vanno inclusi in sequenza in index.html.
 */
    // --- INIZIO CORE GAMEPLAY LOOP: CHAT MASTER, DICE LOCK, PARTY HOTSEAT ---
    (function initializeCoreGameplayLoop() {
      "use strict";

      const supportedDice = [4, 6, 8, 10, 12, 20];
      const diceLockState = {
        locked: true,
        requestedDie: null,
        stat: ""
      };
      const localMasterModelStorageKey = "ultimate-vtt-local-master-model";
      const localMasterModels = [
        {
          key: "classic",
          label: "CLASSICO",
          status: "Classico",
          requestReplies: {
            Forza: "Il Master misura la resistenza davanti a te. Puoi provarci, ma serve forza controllata.",
            Destrezza: "Il Master stringe il ritmo della scena: il gesto richiede mano ferma e tempismo.",
            Saggezza: "Il Master abbassa la voce. I dettagli ci sono, ma devi coglierli prima che svaniscano.",
            Carisma: "Il Master osserva la reazione dell'interlocutore. Le parole giuste possono cambiare tutto.",
            Intelligenza: "Il Master ti lascia un istante per collegare indizi, memoria e logica.",
            Attacco: "Il Master mette la scena sotto pressione. E' il momento di colpire."
          },
          roomReply: "Il Master descrive l'ambiente: aria fredda, legno vecchio e un silenzio che sembra aspettare una scelta precisa.",
          questionReply: "Il Master risponde con cautela: puoi ottenere di piu agendo, osservando o facendo una domanda piu precisa.",
          defaultReply: "Il Master annuisce e porta avanti la scena. La situazione resta tesa, ma hai spazio per dichiarare la prossima azione."
        },
        {
          key: "dark",
          label: "DARK",
          status: "Dark",
          requestReplies: {
            Forza: "Il Master lascia che il legno gemi sotto le tue mani. Se vuoi forzarlo, la stanza sapra che sei qui.",
            Destrezza: "Il Master segue il movimento delle tue dita. Un errore piccolo bastera a far scattare qualcosa.",
            Saggezza: "Il Master ti concede un dettaglio nel buio. Devi afferrarlo prima che il silenzio lo inghiotta.",
            Carisma: "Il Master studia gli occhi di chi hai davanti. C'e paura, ma anche sospetto.",
            Intelligenza: "Il Master mostra simboli consumati e logica spezzata. Serve lucidita.",
            Attacco: "Il Master fa calare la tensione come una lama. Se attacchi, fallo adesso."
          },
          roomReply: "Il Master incupisce la scena: l'aria sa di polvere umida, e qualcosa oltre la soglia respira piano.",
          questionReply: "Il Master non concede certezze. Ogni risposta sembra avere un costo.",
          defaultReply: "Il Master lascia la frase sospesa. Il buio resta in ascolto della tua prossima scelta."
        },
        {
          key: "tactical",
          label: "TATTICO",
          status: "Tattico",
          requestReplies: {
            Forza: "Il Master valuta leva, peso e rumore. La prova dira se apri la via senza perdere controllo.",
            Destrezza: "Il Master evidenzia rischio e precisione: serve un gesto pulito, non solo velocita.",
            Saggezza: "Il Master ti chiede lettura del campo: tracce, suoni e priorita immediate.",
            Carisma: "Il Master pesa vantaggio e pressione sociale. La posta e convincere senza scoprirti.",
            Intelligenza: "Il Master mette gli indizi sul tavolo. Serve collegarli in fretta.",
            Attacco: "Il Master valuta distanza, copertura e bersaglio. Tira per risolvere l'azione."
          },
          roomReply: "Il Master chiarisce la situazione: una porta, copertura limitata, rumori oltre il passaggio e pochi secondi per decidere.",
          questionReply: "Il Master ti restituisce i dati utili: posizione, rischio e possibile prossimo passo.",
          defaultReply: "Il Master aggiorna la scena e attende una scelta concreta: muovere, osservare, parlare o agire."
        },
        {
          key: "cinematic",
          label: "CINEMA",
          status: "Cinema",
          requestReplies: {
            Forza: "Il Master avvicina la camera alle tue mani. Il mondo trattiene il fiato mentre spingi.",
            Destrezza: "Il Master rallenta il momento: dita, respiro, metallo, un battito troppo forte.",
            Saggezza: "Il Master stringe l'inquadratura sui dettagli. Uno solo puo cambiare la scena.",
            Carisma: "Il Master lascia spazio alla tua voce. Ora contano tono, pausa e sguardo.",
            Intelligenza: "Il Master monta gli indizi come frammenti rapidi. Devi vedere il disegno intero.",
            Attacco: "Il Master taglia sul movimento dell'arma. La scena esplode nel tiro."
          },
          roomReply: "Il Master apre la scena con un taglio largo: polvere nell'aria, luce obliqua, una porta che sembra piu antica del corridoio.",
          questionReply: "Il Master risponde come una ripresa lenta: il dettaglio importante e li, appena fuori fuoco.",
          defaultReply: "Il Master lascia correre la scena per un respiro, poi riporta l'attenzione su di te."
        }
      ];
      const ollamaMasterConfig = {
        tagsEndpoint: "http://127.0.0.1:11434/api/tags",
        endpoint: "http://127.0.0.1:11434/api/chat",
        model: "mistral-nemo:12b",
        pingTimeoutMs: 2500,
        timeoutMs: 45000
      };

      let partyData = [];
      let activePartyIndex = 0;
      let syncingPartyState = false;
      let diceLockRenderTimer = 0;
      let activeLocalMasterModelIndex = 0;
      const ollamaMasterState = {
        enabled: false,
        busy: false,
        lastError: ""
      };

      const groqMasterStorageKey = "ultimate-vtt-groq-api-key";
      const groqMasterConfig = {
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama-3.3-70b-versatile",
        timeoutMs: 30000
      };
      const groqMasterState = {
        enabled: false,
        busy: false,
        apiKey: "",
        lastError: ""
      };
      const groqChatHistory = [];
      const GROQ_HISTORY_LIMIT = 16;

      function getElement(id) {
        return document.getElementById(id);
      }

      function getAll(selector) {
        return Array.prototype.slice.call(document.querySelectorAll(selector));
      }

      function cloneData(value) {
        return JSON.parse(JSON.stringify(value));
      }

      function clearNode(node) {
        while (node && node.firstChild) {
          node.removeChild(node.firstChild);
        }
      }

      function clampNumber(value, minValue, maxValue, fallbackValue) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          return fallbackValue;
        }
        return Math.max(minValue, Math.min(maxValue, Math.trunc(numericValue)));
      }

      function appendSystemLog(message) {
        if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
          window.UltimateVTT.appendSystemLog(message);
        }
      }

      function setText(id, value) {
        const element = getElement(id);
        if (element) {
          element.textContent = String(value);
        }
      }

      function normalizePrompt(text) {
        return String(text || "").toLowerCase();
      }

      function getActiveLocalMasterModel() {
        return localMasterModels[activeLocalMasterModelIndex] || localMasterModels[0];
      }

      function readLocalMasterModelIndex() {
        try {
          const savedKey = window.localStorage.getItem(localMasterModelStorageKey);
          const savedIndex = localMasterModels.findIndex(function findSavedModel(model) {
            return model.key === savedKey;
          });
          return savedIndex >= 0 ? savedIndex : 0;
        } catch (error) {
          return 0;
        }
      }

      function writeLocalMasterModel(model) {
        try {
          window.localStorage.setItem(localMasterModelStorageKey, model.key);
        } catch (error) {
          // Storage can be unavailable in restricted WebViews.
        }
      }

      function renderLocalMasterModel(announce) {
        const model = getActiveLocalMasterModel();
        const button = getElement("localMasterModelButton");

        if (button) {
          button.textContent = "MODELLO: " + model.label;
          button.title = "Modello locale Master: " + model.status;
          button.classList.add("is-cycling");
          window.setTimeout(function clearModelPulse() {
            button.classList.remove("is-cycling");
          }, 420);
        }

        if (diceLockState.locked && !ollamaMasterState.enabled) {
          setText("masterChatStatus", model.status);
        }

        if (announce) {
          appendMasterChatMessage("system", "Modello locale Master: " + model.status + ".");
          appendSystemLog("Modello locale Master cambiato: " + model.status + ".");
        }
      }

      function cycleLocalMasterModel() {
        activeLocalMasterModelIndex = (activeLocalMasterModelIndex + 1) % localMasterModels.length;
        writeLocalMasterModel(getActiveLocalMasterModel());
        renderLocalMasterModel(true);
      }

      function renderOllamaMasterState() {
        const button = getElement("ollamaMasterButton");

        if (!button) {
          return;
        }

        button.classList.toggle("is-active", ollamaMasterState.enabled && !ollamaMasterState.lastError);
        button.classList.toggle("is-error", Boolean(ollamaMasterState.lastError));

        if (ollamaMasterState.busy) {
          button.textContent = "OLLAMA: ...";
          button.title = "Ollama Master sta rispondendo con " + ollamaMasterConfig.model;
          if (diceLockState.locked) {
            setText("masterChatStatus", "Ollama...");
          }
        } else if (ollamaMasterState.lastError) {
          button.textContent = "OLLAMA: ERRORE";
          button.title = ollamaMasterState.lastError;
          if (diceLockState.locked) {
            setText("masterChatStatus", "Offline");
          }
        } else if (ollamaMasterState.enabled) {
          button.textContent = "OLLAMA: MISTRAL";
          button.title = "Master Ollama attivo: " + ollamaMasterConfig.model;
          if (diceLockState.locked) {
            setText("masterChatStatus", "Ollama");
          }
        } else {
          button.textContent = "OLLAMA: OFF";
          button.title = "Usa Ollama locale come Master";
          if (diceLockState.locked) {
            setText("masterChatStatus", getActiveLocalMasterModel().status);
          }
        }
      }

      function getIdleMasterStatus() {
        if (ollamaMasterState.busy) {
          return "Ollama...";
        }
        if (ollamaMasterState.enabled && !ollamaMasterState.lastError) {
          return "Ollama";
        }
        if (ollamaMasterState.lastError) {
          return "Offline";
        }
        return getActiveLocalMasterModel().status;
      }

      function setOllamaMasterError(message) {
        ollamaMasterState.lastError = message;
        renderOllamaMasterState();
      }

      function toggleOllamaMaster() {
        ollamaMasterState.enabled = !ollamaMasterState.enabled;
        ollamaMasterState.lastError = "";
        if (ollamaMasterState.enabled && groqMasterState.enabled) {
          groqMasterState.enabled = false;
          renderGroqMasterState();
        }
        renderOllamaMasterState();
        appendMasterChatMessage("system", ollamaMasterState.enabled
          ? "Master Ollama attivo: " + ollamaMasterConfig.model + "."
          : "Master Ollama disattivato. Torno al Master offline.");
      }

      function stripThinkingBlocks(text) {
        return String(text || "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .trim();
      }

      function extractJsonObject(text) {
        const cleaned = stripThinkingBlocks(text).replace(/```json|```/gi, "").trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");

        if (start < 0 || end <= start) {
          return null;
        }

        try {
          return JSON.parse(cleaned.slice(start, end + 1));
        } catch (error) {
          return null;
        }
      }

      function buildOllamaSystemPrompt(localSuggestion) {
        const activeName = getElement("characterIdentityPill") ? getElement("characterIdentityPill").textContent.trim() : "Player";
        const suggestionText = localSuggestion
          ? "Il giocatore sta tentando un'azione che richiede una prova di " + localSuggestion.stat + " (D20)."
          : "";

        return [
          "Sei il Master di un gioco di ruolo fantasy in italiano, stile Baldur's Gate 3.",
          "Rispondi sempre in italiano con 1-3 frasi narrative, in prima persona come Master.",
          "Giocatore attivo: " + activeName + ".",
          suggestionText,
          "Se riesci, rispondi con JSON valido: {\"reply\":\"testo narrativo\",\"roll\":null} oppure {\"reply\":\"testo narrativo\",\"roll\":{\"die\":20,\"stat\":\"Forza\"}}.",
          "Aggiungi \"teleportCity\":\"nome_luogo\" al JSON se il PG viaggia in citta. Aggiungi \"moveToken\":\"flee\" se fugge in modo tattico.",
          "Se non riesci col JSON, scrivi solo il testo narrativo della risposta, senza nient'altro.",
          "Usa il campo roll solo quando l'azione del giocatore ha un rischio reale. Stat consentite: Forza, Destrezza, Costituzione, Intelligenza, Saggezza, Carisma, Attacco."
        ].filter(Boolean).join("\n");
      }

      async function pingOllamaServer() {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(function abortOllamaPing() {
          controller.abort();
        }, ollamaMasterConfig.pingTimeoutMs);

        try {
          const response = await fetch(ollamaMasterConfig.tagsEndpoint, {
            method: "GET",
            signal: controller.signal
          });

          if (!response.ok) {
            throw new Error("Ollama tags HTTP " + response.status);
          }
        } finally {
          window.clearTimeout(timeoutId);
        }
      }

      async function fetchOllamaMasterReply(playerText, localSuggestion) {
        await pingOllamaServer();

        const controller = new AbortController();
        const timeoutId = window.setTimeout(function abortOllamaRequest() {
          controller.abort();
        }, ollamaMasterConfig.timeoutMs);

        try {
          const response = await fetch(ollamaMasterConfig.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: ollamaMasterConfig.model,
              stream: false,
              messages: [
                {
                  role: "system",
                  content: buildOllamaSystemPrompt(localSuggestion)
                },
                {
                  role: "user",
                  content: playerText
                }
              ],
              options: {
                temperature: 0.72,
                top_p: 0.9,
                num_ctx: 2048,
                num_predict: 180
              }
            })
          });

          if (!response.ok) {
            throw new Error("Ollama HTTP " + response.status);
          }

          const data = await response.json();
          const content = data && data.message && data.message.content ? data.message.content : "";
          const cleaned = stripThinkingBlocks(content);
          const parsed = extractJsonObject(cleaned);
          const fallbackReply = cleaned || createGuidedMasterReply(playerText, localSuggestion);

          // Se il modello non ha risposto in JSON, usa il testo grezzo come risposta narrativa
          if (!parsed || typeof parsed.reply !== "string") {
            return {
              reply: fallbackReply,
              roll: localSuggestion || null
            };
          }

          return {
            reply: parsed.reply,
            teleportCity: parsed.teleportCity || null,
            moveToken: parsed.moveToken || null,
            roll: parsed.roll && normalizeDie(parsed.roll.die)
              ? {
                die: normalizeDie(parsed.roll.die),
                stat: String(parsed.roll.stat || (localSuggestion && localSuggestion.stat) || "")
              }
              : (localSuggestion || null)
          };
        } finally {
          window.clearTimeout(timeoutId);
        }
      }

      function renderGroqMasterState() {
        const button = getElement("groqMasterButton");
        if (!button) { return; }
        button.classList.toggle("is-active", groqMasterState.enabled && !groqMasterState.lastError);
        button.classList.toggle("is-error", Boolean(groqMasterState.lastError));
        if (groqMasterState.busy) {
          button.textContent = "GROQ: ...";
          button.title = "Groq sta rispondendo...";
        } else if (groqMasterState.lastError) {
          button.textContent = "GROQ: ERRORE";
          button.title = groqMasterState.lastError;
        } else if (groqMasterState.enabled) {
          button.textContent = "GROQ: ON";
          button.title = "Groq AI attivo (" + groqMasterConfig.model + ")";
        } else {
          button.textContent = "GROQ: OFF";
          button.title = "Usa Groq AI come Master (API key gratuita su console.groq.com)";
        }
      }

      function readGroqApiKey() {
        try { return window.localStorage.getItem(groqMasterStorageKey) || ""; } catch (e) { return ""; }
      }

      function writeGroqApiKey(key) {
        try { window.localStorage.setItem(groqMasterStorageKey, key); } catch (e) {}
      }

      function toggleGroqMaster() {
        if (groqMasterState.enabled) {
          groqMasterState.enabled = false;
          groqMasterState.lastError = "";
          groqChatHistory.length = 0;
          renderGroqMasterState();
          appendMasterChatMessage("system", "Groq AI disattivato. Storia resettata.");
          return;
        }
        groqMasterState.apiKey = readGroqApiKey();
        if (!groqMasterState.apiKey) {
          var key = window.prompt("Inserisci la tua Groq API key gratuita (ottienila su console.groq.com):");
          if (!key || !key.trim()) {
            appendMasterChatMessage("system", "Groq non attivato: API key non inserita.");
            return;
          }
          groqMasterState.apiKey = key.trim();
          writeGroqApiKey(groqMasterState.apiKey);
        }
        if (ollamaMasterState.enabled) {
          ollamaMasterState.enabled = false;
          renderOllamaMasterState();
        }
        groqMasterState.enabled = true;
        groqMasterState.lastError = "";
        renderGroqMasterState();
        appendMasterChatMessage("system", "Groq AI attivo come Master.");
        appendSystemLog("Groq AI Master attivato.");
        
        // Benvenuto: il Master conosce gia le schede del party, niente presentazioni
        triggerPartyWelcome();
      }

      // Costruisce il riassunto testuale delle schede di TUTTI i PG del party,
      // così il Master conosce nomi, caratteristiche, armi, abilita e incantesimi.
      function buildPartySheetContext() {
        var party = window.partyData || [];
        if (!party.length) return "Nessun personaggio nel party.";
        var activeId = null;
        try { activeId = window.UltimateVTTState.getState().identity.id; } catch (e) {}
        var ABIL = [["str","FOR"],["dex","DES"],["con","COS"],["int","INT"],["wis","SAG"],["cha","CAR"]];
        var skillDefs = (window.UltimateVTTState && window.UltimateVTTState.skillDefinitions) || [];
        var itemCat = (window.UltimateVTTInventory && window.UltimateVTTInventory.itemCatalog) || [];
        var spellCat = (window.UltimateVTTInventory && window.UltimateVTTInventory.spellCatalog) || [];
        function itemInfo(id){ for (var i=0;i<itemCat.length;i++){ if (itemCat[i].id===id) return itemCat[i]; } return null; }
        function spellName(id){ for (var i=0;i<spellCat.length;i++){ if (spellCat[i].id===id) return spellCat[i].name; } return id; }
        function mod(v){ var m=Math.floor((v-10)/2); return (m>=0?"+":"")+m; }
        var reg = (window.VTTCharacters && window.VTTCharacters.byId) || {};
        var lines = [];
        party.forEach(function(m){
          if (!m || !m.identity) return;
          var id = m.identity.id;
          var prog = reg[id] && reg[id].progression;
          var build = reg[id] && reg[id].build;
          var lvl = (prog && prog.level) || m.identity.level || 1;
          var ab = m.abilities || {};
          var abilStr = ABIL.map(function(a){ var sc=(ab[a[0]]&&ab[a[0]].score)||10; return a[1]+" "+sc+"("+mod(sc)+")"; }).join(", ");
          var hp = (m.resources&&m.resources.hp)?(m.resources.hp.current+"/"+m.resources.hp.max):"?";
          var ac = (m.resources&&m.resources.armorClass!=null)?m.resources.armorClass:"?";
          var spd = (m.resources&&m.resources.speedMeters!=null)?m.resources.speedMeters:"?";
          var prof = m.proficiencyBonus||2;
          var saves = ABIL.filter(function(a){ return ab[a[0]]&&ab[a[0]].savingThrowProficient; }).map(function(a){return a[1];});
          var skills = (m.skills)?Object.keys(m.skills).filter(function(k){return m.skills[k].proficient;}).map(function(k){ var d=skillDefs.filter(function(x){return x.key===k;})[0]; return d?d.label:k; }):[];
          var equip = [];
          if (build && build.equip){ build.equip.forEach(function(it){ var info=itemInfo(it.c); if(info){ equip.push(info.name + (info.damage?(" ["+info.damage+"]"):"") + (it.slot?" (equipaggiato)":(it.q>1?(" x"+it.q):""))); } }); }
          var spells = (build && build.spellcaster && build.spells) ? build.spells.map(spellName) : [];
          lines.push(
            "- " + m.identity.name + " — " + (m.identity.ancestry||"?") + " " + (m.identity.className||"?") + ", Liv " + lvl + (id===activeId?" (PG attivo)":"") + "\n" +
            "  Caratteristiche: " + abilStr + "\n" +
            "  HP " + hp + " | CA " + ac + " | Velocita " + spd + "m | Competenza +" + prof +
            (saves.length?("\n  Tiri salvezza competenti: " + saves.join(", ")):"") +
            (skills.length?("\n  Abilita competenti: " + skills.join(", ")):"") +
            (equip.length?("\n  Equipaggiamento e armi: " + equip.join("; ")):"") +
            (spells.length?("\n  Incantesimi: " + spells.join(", ")):"")
          );
        });
        return lines.join("\n");
      }

      function buildGroqSystemPrompt(localSuggestion) {
        const nameEl = getElement("characterIdentityPill");
        const hpEl = getElement("moduleTwoHpInput");
        const maxHpEl = getElement("moduleThreeMaxHpInput");
        const acEl = getElement("moduleTwoAcInput");
        const activeName = nameEl ? nameEl.textContent.trim() : "Avventuriero";
        const hp = hpEl ? hpEl.value : "10";
        const maxHp = maxHpEl ? maxHpEl.value : "10";
        const ac = acEl ? acEl.value : "10";
        const diceHint = localSuggestion
          ? "IMPORTANTE: Il giocatore sta tentando un'azione rischiosa su " + localSuggestion.stat + ". Includi obbligatoriamente il campo roll nel JSON."
          : "Decidi tu se serve un dado. Usa roll solo se c'e rischio reale di fallimento.";
        return [
          "Sei un Dungeon Master esperto di D&D 5e che conduce una sessione in italiano.",
          "",
          "REGOLE FONDAMENTALI:",
          "- Porta sempre avanti la storia con nuovi eventi, rivelazioni o pericoli",
          "- Dai descrizioni vivide e sensoriali dell'ambiente (suoni, odori, luci)",
          "- Reagi in modo concreto alle azioni del giocatore: mostra le conseguenze",
          "- Introduci PNG, dialoghi, scelte morali, sorprese narrative",
          "- NON ripetere le stesse situazioni: ogni risposta deve cambiare qualcosa",
          "- Scrivi 3-5 frasi complete, come un vero narratore fantasy",
          "- Rimani sempre nel personaggio del Master",
          "- CONOSCI GIA i personaggi del party e le loro schede complete: chiamali per NOME e tieni sempre conto di caratteristiche, modificatori, abilita, armi, equipaggiamento e incantesimi qui sotto. NON chiedere ai giocatori di presentarsi o descrivere i loro PG.",
          "- Quando proponi una prova, scegli la caratteristica/abilita coerente con la scheda del personaggio; in combattimento ricorda armi e modificatori del PG.",
          "",
          "SCHEDE DEI PERSONAGGI DEL PARTY (gia note):",
          buildPartySheetContext(),
          "",
          diceHint,
          "",
          "FORMATO RISPOSTA - Rispondi SEMPRE e SOLO con JSON valido, senza testo fuori:",
          "{\"reply\":\"testo narrativo completo di 3-5 frasi\",\"roll\":null}",
          "oppure se serve un dado:",
          "{\"reply\":\"testo narrativo\",\"roll\":{\"die\":20,\"stat\":\"Forza\"}}",
          "SPOSTAMENTO SULLA MAPPA: quando il party si reca o arriva in un luogo preciso di Ventimiglia, aggiungi al JSON \"moveTo\":\"nome esatto del luogo\". Il token del PG si spostera' in QUEL punto della mappa reale. Usa SOLO questi luoghi: " + ((window.VTTCampagna && window.VTTCampagna.places) ? window.VTTCampagna.places().join(", ") : "Stazione FS, Citta Alta, Porto Turistico, Forte dell'Annunziata") + ".",
          "Aggiungi \"moveToken\":\"flee\" se il PG fugge in modo tattico.",
          "QUANDO COMPAIONO NEMICI: aggiungi al JSON \"spawn\":[{\"name\":\"Goblin\",\"count\":2}] elencando i nemici che appaiono nella scena. I nemici compariranno sulla mappa vicino al party e nel tracker di combattimento.",
          "Bestiario disponibile per spawn: Goblin, Bandito, Scheletro, Lupo, Orco, Cultista, Zombie, Hobgoblin.",
          "Stat valide: Forza, Destrezza, Costituzione, Intelligenza, Saggezza, Carisma, Attacco"
        ].join("\n");
      }

      async function fetchGroqMasterReply(playerText, localSuggestion) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(function () { controller.abort(); }, groqMasterConfig.timeoutMs);
        const messages = [{ role: "system", content: buildGroqSystemPrompt(localSuggestion) }]
          .concat(groqChatHistory.slice(-GROQ_HISTORY_LIMIT))
          .concat([{ role: "user", content: playerText }]);
        try {
          const response = await fetch(groqMasterConfig.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + groqMasterState.apiKey },
            signal: controller.signal,
            body: JSON.stringify({
              model: groqMasterConfig.model,
              stream: false,
              temperature: 0.85,
              max_tokens: 500,
              messages: messages
            })
          });
          if (!response.ok) {
            if (response.status === 401) { throw new Error("API key Groq non valida. Clicca GROQ: OFF e riattiva per reinserirla."); }
            throw new Error("Groq HTTP " + response.status);
          }
          const data = await response.json();
          const content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
          const cleaned = stripThinkingBlocks(content);
          const parsed = extractJsonObject(cleaned);
          const fallbackReply = cleaned || createGuidedMasterReply(playerText, localSuggestion);
          var reply, roll, teleportCity, moveToken, spawn, moveTo;
          if (!parsed || typeof parsed.reply !== "string") {
            reply = fallbackReply;
            roll = localSuggestion || null;
          } else {
            reply = parsed.reply;
            teleportCity = parsed.teleportCity;
            moveTo = parsed.moveTo || parsed.location || null;
            moveToken = parsed.moveToken;
            spawn = parsed.spawn || parsed.enemies || null;
            roll = parsed.roll && normalizeDie(parsed.roll.die)
              ? { die: normalizeDie(parsed.roll.die), stat: String(parsed.roll.stat || (localSuggestion && localSuggestion.stat) || "") }
              : (localSuggestion || null);
          }
          groqChatHistory.push({ role: "user", content: playerText });
          groqChatHistory.push({ role: "assistant", content: reply });
          return { reply: reply, roll: roll, teleportCity: teleportCity, moveTo: moveTo, moveToken: moveToken, spawn: spawn };
        } finally {
          window.clearTimeout(timeoutId);
        }
      }

      function initializeGroqMaster() {
        const button = getElement("groqMasterButton");
        // La chiave NON e' hardcoded (sarebbe un segreto in chiaro): si legge da
        // localStorage; se assente, l'utente la inserisce col pulsante GROQ (prompt).
        groqMasterState.apiKey = readGroqApiKey();
        if (groqMasterState.apiKey) {
          groqMasterState.enabled = true;
        }
        if (button) { button.addEventListener("click", toggleGroqMaster); }
        renderGroqMasterState();
        if (groqMasterState.enabled) {
          window.setTimeout(function () {
            appendMasterChatMessage("system", "🤖 Master IA Groq attivo (" + groqMasterConfig.model + "). Crea il party dal menu per iniziare.");
            // Il benvenuto vero parte da startAdventure (quando il party e creato),
            // cosi il Master conosce gia le schede e non chiede presentazioni.
          }, 800);
        }
      }

      function scrollToElement(element) {
        if (!element || !element.scrollIntoView) {
          return;
        }

        element.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }

      function scrollToMap() {
        scrollToElement(document.querySelector(".stage"));
      }

      function scrollToChat() {
        scrollToElement(document.querySelector(".master-chat-panel"));
      }

      function scrollToDice() {
        scrollToElement(document.querySelector(".bottom-hud"));
      }

      function getPrimaryDieButton(sides) {
        return getElement("rollD" + sides + "Button") || document.querySelector(".dice-physics-button[data-physics-die='" + sides + "']");
      }

      function highlightRequestedDie(sides) {
        const button = getPrimaryDieButton(sides);

        if (!button) {
          return;
        }

        getAll(".dice-roll-pulse").forEach(function clearPulse(element) {
          element.classList.remove("dice-roll-pulse");
        });

        scrollToDice();
        window.setTimeout(function focusDieButton() {
          button.classList.add("dice-roll-pulse");
          if (button.focus) {
            try {
              button.focus({ preventScroll: true });
            } catch (error) {
              button.focus();
            }
          }
        }, 260);
      }

      function inferMasterRollRequest(text) {
        const prompt = normalizePrompt(text);
        const rules = [
          { stat: "Destrezza", pattern: /(scassin|serratur|trappol|disinnesc|furtiv|nascond|sgattaiol|rub|borseggi)/ },
          { stat: "Forza", pattern: /(apro|apri|aprire|sfond|sping|sollev|romp|forzo|forzare|butto giu)/ },
          { stat: "Destrezza", pattern: /(salto|saltare|arrampic|equilibr|acroba|schivo)/ },
          { stat: "Saggezza", pattern: /(cerco|cercare|osservo|ispezion|ascolt|percez|tracce|seguo le tracce)/ },
          { stat: "Attacco", pattern: /(attacc|colpisc|tiro una freccia|lancio il pugnale|casto|lancio un incantesimo)/ },
          { stat: "Carisma", pattern: /(convinc|persuad|ingann|intimid|parlo|negoz|tratto)/ },
          { stat: "Intelligenza", pattern: /(ricordo|studio|arcano|magia|runa|storia|indago)/ }
        ];
        const match = rules.find(function findMatchingRule(rule) {
          return rule.pattern.test(prompt);
        });

        if (!match) {
          return null;
        }

        return {
          die: 20,
          stat: match.stat
        };
      }

      function createGuidedMasterReply(text, request) {
        const prompt = normalizePrompt(text);
        const model = getActiveLocalMasterModel();

        if (request) {
          return model.requestReplies[request.stat] || model.defaultReply;
        }

        if (/porta|soglia|stanza|corridoio/.test(prompt)) {
          return model.roomReply;
        }

        if (/chi|cosa|dove|perche|come/.test(prompt)) {
          return model.questionReply;
        }

        return model.defaultReply;
      }

      function appendMasterChatMessage(speaker, text) {
        const log = getElement("masterChatLog");

        if (!log || !text) {
          return;
        }

        const normalizedSpeaker = speaker === "player" || speaker === "system" ? speaker : "master";
        const speakerLabels = {
          master: "Master",
          player: "Tu",
          system: "Sistema"
        };
        const message = document.createElement("div");
        const label = document.createElement("span");
        const body = document.createElement("p");

        message.className = "master-chat-message " + normalizedSpeaker;
        label.className = "master-chat-speaker";
        label.textContent = speakerLabels[normalizedSpeaker];
        body.textContent = String(text);

        message.appendChild(label);
        message.appendChild(body);
        log.appendChild(message);
        log.scrollTop = log.scrollHeight;

        if (normalizedSpeaker === "master" && window.UltimateVTTAudioVoice && typeof window.UltimateVTTAudioVoice.speakMaster === "function") {
          if (window.autoSpeechEnabled !== false) window.UltimateVTTAudioVoice.speakMaster(text);
        }
      }

      function normalizeDie(value) {
        const normalizedValue = String(value || "").toLowerCase().replace("d", "");
        const die = Number(normalizedValue);
        return supportedDice.indexOf(die) >= 0 ? die : 0;
      }

      function parseMasterDiceCommand(text) {
        let payload = null;
        const rawText = String(text || "").trim();
        const jsonText = rawText.indexOf("/master ") === 0 ? rawText.slice(8).trim() : rawText;

        try {
          payload = JSON.parse(jsonText);
        } catch (error) {
          return null;
        }

        const action = String(payload.azione || payload.action || payload.command || "").toLowerCase();
        const die = normalizeDie(payload.dado || payload.die || payload.dice || payload.unlock_dice);
        const isRollCommand = action === "tira" || action === "roll" || Boolean(payload.unlock_dice);

        if (!isRollCommand || !die) {
          return null;
        }

        return {
          die: die,
          stat: String(payload.stat || payload.abilita || payload.ability || "")
        };
      }

      function renderDiceLockState() {
        const diceButtons = getAll(".dice-button[data-die], .dice-physics-button[data-physics-die]");
        const setButton = getElement("diceThrowSetButton");
        const statusText = diceLockState.locked ? "Dadi: bloccati" : "Dadi: tira D" + diceLockState.requestedDie;

        document.body.classList.toggle("dice-locked", diceLockState.locked);

        diceButtons.forEach(function updateDiceButton(button) {
          const sides = normalizeDie(button.getAttribute("data-die") || button.getAttribute("data-physics-die"));
          const unlocked = !diceLockState.locked && sides === diceLockState.requestedDie;

          button.disabled = !unlocked;
          button.classList.toggle("dice-unlocked", unlocked);
          if (!unlocked) {
            button.classList.remove("dice-roll-pulse");
          }
          button.setAttribute("aria-disabled", unlocked ? "false" : "true");
          button.title = unlocked ? "Tira ora D" + sides : "Dado bloccato: attendi il Master";
        });

        if (setButton) {
          setButton.disabled = true;
          setButton.title = "Set dadi bloccato dal Master";
        }

        setText("diceModePill", statusText);
        setText("dicePhysicsStatus", diceLockState.locked ? "Locked" : "D" + diceLockState.requestedDie + " Open");
        setText("masterChatStatus", diceLockState.locked ? getIdleMasterStatus() : "D" + diceLockState.requestedDie);
      }

      function requestDiceRoll(die, stat) {
        diceLockState.locked = false;
        diceLockState.requestedDie = die;
        diceLockState.stat = stat || "";
        if (diceLockRenderTimer) {
          window.clearInterval(diceLockRenderTimer);
          diceLockRenderTimer = 0;
        }
        renderDiceLockState();
        appendMasterChatMessage("system", "Prova richiesta: tira D" + die + (stat ? " su " + stat : "") + ".");
        appendSystemLog("Master IA ha sbloccato D" + die + ".");
        highlightRequestedDie(die);
      }

      function reinforceLockedDiceUi() {
        let ticksRemaining = 36;

        if (diceLockRenderTimer) {
          window.clearInterval(diceLockRenderTimer);
        }

        diceLockRenderTimer = window.setInterval(function tickLockedDiceUi() {
          if (!diceLockState.locked || ticksRemaining <= 0) {
            window.clearInterval(diceLockRenderTimer);
            diceLockRenderTimer = 0;
            return;
          }

          renderDiceLockState();
          ticksRemaining -= 1;
        }, 150);
      }

      function unlockDiceFromMaster(text) {
        const command = parseMasterDiceCommand(text);

        appendMasterChatMessage("master", text);

        if (!command) {
          return false;
        }

        requestDiceRoll(command.die, command.stat);
        return true;
      }

      function lockDiceAfterRoll(sides, result) {
        appendMasterChatMessage("system", "Risultato D" + sides + ": " + result + ".");
        diceLockState.locked = true;
        diceLockState.requestedDie = null;
        diceLockState.stat = "";
        renderDiceLockState();
        reinforceLockedDiceUi();

        if (groqMasterState.enabled || ollamaMasterState.enabled) {
          const rollMessage = "Ho tirato il dado e ho ottenuto " + result + " sul D" + sides + ".";
          handlePlayerPrompt(rollMessage, true);
        }
      }

      function handleDiceClickCapture(event) {
        const button = event.target.closest(".dice-button[data-die], .dice-physics-button[data-physics-die]");

        if (!button) {
          return;
        }

        const sides = normalizeDie(button.getAttribute("data-die") || button.getAttribute("data-physics-die"));
        const canRoll = !diceLockState.locked && sides === diceLockState.requestedDie;

        event.preventDefault();
        event.stopImmediatePropagation();

        if (!canRoll) {
          return;
        }

        const result = window.UltimateVTTDice3D && window.UltimateVTTDice3D.launchDie
          ? window.UltimateVTTDice3D.launchDie(sides)
          : Math.floor(Math.random() * sides) + 1;

        lockDiceAfterRoll(sides, result);
        scrollToChat();
      }

      function handleAIMovement(reply) {
        if (!reply) return;
        var place = reply.moveTo || reply.teleportCity;
        if (place) {
          if (window.VTTCampagna && window.VTTCampagna.goToPlace) {
            var moved = window.VTTCampagna.goToPlace(place);
            if (!moved && window.VTTCampagna.activate) window.VTTCampagna.activate();
          } else if (window.VTTCampagna && window.VTTCampagna.activate) {
            window.VTTCampagna.activate();
          }
          if (window.VentimigliaMap && window.VentimigliaMap.goTo) window.VentimigliaMap.goTo(place);
        }
        if (reply.moveToken === "flee") {
          if (window.UltimateVTTTokenPhysics && window.UltimateVTTTokenPhysics.moveTokenToCell) {
             window.UltimateVTTTokenPhysics.moveTokenToCell("token-pc", 1, 1, true);
          }
        }
        if (reply.spawn && window.VTTSpawn && window.VTTSpawn.spawn) {
          try { window.VTTSpawn.spawn(reply.spawn); } catch (e) {}
        }
      }

      // Rileva un intento di movimento del giocatore verso un luogo noto.
      // Usa alias semantici, trigger intent ampi e il fuzzy-match di findPlace.
      // Ritorna il nome canonico del POI, oppure null.
      var PLACE_ALIASES = {
        "stazione":    "Stazione FS",
        "treni":       "Stazione FS",
        "treno":       "Stazione FS",
        "porto":       "Porto Turistico",
        "banchina":    "Porto Turistico",
        "molo":        "Porto Turistico",
        "forte":       "Forte dell'Annunziata",
        "fortezza":    "Forte dell'Annunziata",
        "annunziata":  "Forte dell'Annunziata",
        "giardini":    "Giardini Hanbury",
        "hanbury":     "Giardini Hanbury",
        "balzi":       "Balzi Rossi",
        "grotte":      "Balzi Rossi",
        "cattedrale":  "Cattedrale Assunta",
        "duomo":       "Cattedrale Assunta",
        "chiesa":      "Cattedrale Assunta",
        "michiele":    "Cattedrale S.Michele",
        "michele":     "Cattedrale S.Michele",
        "teatro":      "Teatro Romano",
        "romano":      "Teatro Romano",
        "rovine":      "Teatro Romano",
        "piazza":      "Piazza Repubblica",
        "municipio":   "Municipio",
        "comune":      "Municipio",
        "biblioteca":  "Biblioteca",
        "mercato":     "Mercato Settimanale",
        "ospedale":    "Ospedale",
        "orologio":    "Torre dell'Orologio",
        "torre":       "Torre dell'Orologio",
        "roya":        "Ponte sul Roya",
        "ponte":       "Ponte sul Roya",
        "lungomare":   "Lungomare",
        "spiaggia":    "Lungomare",
        "confine":     "Confine Italia-FR",
        "frontiera":   "Confine Italia-FR",
        "dogana":      "Confine Italia-FR",
        "mortola":     "Capo Mortola",
        "capo":        "Capo Mortola",
        "foce":        "Foce del Roya",
        "città alta":  "Città Alta",
        "citta alta":  "Città Alta",
        "borgo":       "Città Alta",
        "collina":     "Città Alta",
        "canarda":     "Porta Canarda",
        "lamboglia":   "Porta Nino Lamboglia",
        "battisti":    "Piazza C. Battisti"
      };

      var MOVE_INTENT_RE = /\b(andiamo|andate|andare|andiamo a|ci dirigiamo|dirigiamo|dirigetevi|dirigiti|raggiung|rechiam|rechiamoci|fino a|verso|entriam|entriamo|arriviamo|arrivate|spostiam|spostiamoci|ci muoviam|ci muoviamo|portac|portateci|torniam|torniamo|vado|vai a|vado a|usciamo|usciamo da|saliamo|scendiamo|camminiamo|attraversiam|attraversiamo|passiamo per|andiamo verso|ci rechiamo)\b/;

      function inferMoveFromText(text) {
        if (!text || !window.VTTCampagna || !window.VTTCampagna.places) return null;
        var t = String(text).toLowerCase().replace(/[''`]/g, " ");

        if (!MOVE_INTENT_RE.test(t)) return null;

        // 1. Alias semantici: controlla ogni alias contro il testo del giocatore
        var aliasKeys = Object.keys(PLACE_ALIASES);
        var aliasMatch = null, aliasMatchLen = 0;
        for (var i = 0; i < aliasKeys.length; i++) {
          var key = aliasKeys[i];
          if (t.indexOf(key) >= 0 && key.length > aliasMatchLen) {
            aliasMatch = PLACE_ALIASES[key];
            aliasMatchLen = key.length;
          }
        }
        if (aliasMatch) return aliasMatch;

        // 2. Match diretto sul nome completo del POI (longest match wins)
        var places = window.VTTCampagna.places();
        var match = null, matchLen = 0;
        places.forEach(function(name) {
          var n = name.toLowerCase().replace(/[''`]/g, " ");
          if (t.indexOf(n) >= 0 && n.length > matchLen) { match = name; matchLen = n.length; }
        });
        if (match) return match;

        // 3. Match per parole chiave (>3 char) dei nomi POI, ordinato per lunghezza
        var candidates = [];
        places.forEach(function(name) {
          var words = name.toLowerCase().split(/[\s.']+/).filter(function(w) { return w.length > 3; });
          var score = 0;
          words.forEach(function(w) { if (t.indexOf(w) >= 0) score += w.length; });
          if (score > 0) candidates.push({ name: name, score: score });
        });
        if (candidates.length > 0) {
          candidates.sort(function(a, b) { return b.score - a.score; });
          return candidates[0].name;
        }

        return null;
      }

      async function handlePlayerPrompt(text, isAutoRoll) {
        const request = isAutoRoll ? null : inferMasterRollRequest(text);

        if (!isAutoRoll) {
          appendMasterChatMessage("player", text);
          var movePlace = inferMoveFromText(text);
          if (movePlace && window.VTTCampagna && window.VTTCampagna.goToPlace) {
            try {
              window.VTTCampagna.goToPlace(movePlace);
              // Feedback leggero in chat solo se siamo in modalità campagna attiva
              if (window.VTTCampagna.isActive && window.VTTCampagna.isActive()) {
                appendMasterChatMessage("system", "📍 Token spostato → " + movePlace);
              }
            } catch (e) {}
          }
        }

        if (groqMasterState.enabled) {
          groqMasterState.busy = true;
          groqMasterState.lastError = "";
          renderGroqMasterState();
          try {
            const groqReply = await fetchGroqMasterReply(text, request);
            appendMasterChatMessage("master", groqReply.reply);
            appendSystemLog("🤖 Groq ha risposto.");
            if (groqReply.roll) { requestDiceRoll(groqReply.roll.die, groqReply.roll.stat); }
            handleAIMovement(groqReply);
          } catch (error) {
            const message = error && error.name === "AbortError"
              ? "Groq non ha risposto in tempo. Riprova."
              : (error.message || "Groq non raggiungibile. Controlla la connessione internet.");
            groqMasterState.lastError = message;
            renderGroqMasterState();
            appendMasterChatMessage("system", "⚠️ " + message + " — rispondo offline.");
            appendSystemLog("⚠️ Groq ERRORE: " + message);
            appendMasterChatMessage("master", createGuidedMasterReply(text, request));
            if (request) { requestDiceRoll(request.die, request.stat); }
          } finally {
            groqMasterState.busy = false;
            renderGroqMasterState();
          }
          return;
        }

        if (ollamaMasterState.enabled) {
          ollamaMasterState.busy = true;
          ollamaMasterState.lastError = "";
          renderOllamaMasterState();

          try {
            const ollamaReply = await fetchOllamaMasterReply(text, request);
            appendMasterChatMessage("master", ollamaReply.reply);

            if (ollamaReply.roll) {
              requestDiceRoll(ollamaReply.roll.die, ollamaReply.roll.stat);
            }
            handleAIMovement(ollamaReply);
          } catch (error) {
            const message = error && error.name === "AbortError"
              ? "Ollama non ha risposto in tempo. Avvia Ollama o usa un modello piu piccolo."
              : "Ollama non raggiungibile. Avvia Ollama e scarica: ollama pull " + ollamaMasterConfig.model;
            setOllamaMasterError(message);
            appendMasterChatMessage("system", message + " Uso il Master offline per questa risposta.");
            appendMasterChatMessage("master", createGuidedMasterReply(text, request));

            if (request) {
              requestDiceRoll(request.die, request.stat);
            }
          } finally {
            ollamaMasterState.busy = false;
            renderOllamaMasterState();
          }

          return;
        }

        appendMasterChatMessage("master", createGuidedMasterReply(text, request));

        if (request) {
          requestDiceRoll(request.die, request.stat);
        }
      }

      function initializeMasterChat() {
        const form = getElement("masterChatForm");
        const input = getElement("masterChatInput");

        if (!form || !input) {
          return;
        }

        form.addEventListener("submit", async function handleMasterChatSubmit(event) {
          const rawText = input.value.trim();
          const commandText = rawText.indexOf("/master ") === 0 ? rawText.slice(8).trim() : rawText;
          const command = parseMasterDiceCommand(rawText);

          event.preventDefault();

          if (!rawText) {
            return;
          }

          if (command) {
            unlockDiceFromMaster(commandText);
          } else {
            await handlePlayerPrompt(rawText);
          }

          input.value = "";
          input.focus();
        });

        window.UltimateVTTMasterChat = {
          appendMessage: appendMasterChatMessage,
          receiveMasterMessage: unlockDiceFromMaster,
          parseDiceCommand: parseMasterDiceCommand,
          getDiceLockState: function getDiceLockState() {
            return cloneData(diceLockState);
          }
        };
      }

      function createPartyMember(id, name, variantIndex) {
        const baseState = window.UltimateVTTState && window.UltimateVTTState.getState
          ? window.UltimateVTTState.getState()
          : {};
        const member = cloneData(baseState);
        const variant = variantIndex % 3;
        const spreads = [
          { str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 },
          { str: 8, dex: 16, con: 12, int: 13, wis: 10, cha: 11 },
          { str: 10, dex: 12, con: 12, int: 15, wis: 13, cha: 10 }
        ];
        const classes = ["Guerriero", "Ladro", "Mago"];
        const hitPoints = [16, 12, 10];
        const armorClasses = [16, 14, 12];

        member.identity = member.identity || {};
        member.abilities = member.abilities || {};
        member.resources = member.resources || {};
        member.resources.hp = member.resources.hp || {};

        member.identity.id = id;
        member.identity.name = name;
        member.identity.className = classes[variant];
        member.identity.ancestry = member.identity.ancestry || "Umano";
        member.identity.level = member.identity.level || 1;
        member.resources.hp.max = hitPoints[variant];
        member.resources.hp.current = hitPoints[variant];
        member.resources.hp.temporary = 0;
        member.resources.armorClass = armorClasses[variant];

        Object.keys(spreads[variant]).forEach(function assignAbilityScore(key) {
          member.abilities[key] = member.abilities[key] || {};
          member.abilities[key].score = spreads[variant][key];
          member.abilities[key].savingThrowProficient = Boolean(member.abilities[key].savingThrowProficient);
        });

        return member;
      }

      function renderPartyControls() {
        const selects = [getElement("headerPartySelect"), getElement("partyMemberSelect")].filter(Boolean);
        const roster = getElement("partyRoster");

        selects.forEach(function renderSelect(select) {
          clearNode(select);
          partyData.forEach(function appendOption(member, index) {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = member.identity.name;
            select.appendChild(option);
          });
          select.value = String(activePartyIndex);
        });

        setText("partyCountPill", partyData.length + " PG");

        if (roster) {
          clearNode(roster);
          partyData.forEach(function appendRosterChip(member, index) {
            const chip = document.createElement("button");
            chip.className = "party-chip" + (index === activePartyIndex ? " active" : "");
            chip.type = "button";
            chip.textContent = member.identity.name;
            chip.addEventListener("click", function handleRosterClick() {
              switchPartyMember(index);
            });
            roster.appendChild(chip);
          });
        }
      }

      function saveActivePartyState() {
        if (!window.UltimateVTTState || !window.UltimateVTTState.getState || !partyData[activePartyIndex]) {
          return;
        }

        partyData[activePartyIndex] = window.UltimateVTTState.getState();
        window.partyData = partyData;
      }

      function switchPartyMember(index, skipSave) {
        const nextIndex = clampNumber(index, 0, partyData.length - 1, activePartyIndex);

        if (!partyData[nextIndex] || !window.UltimateVTTState || !window.UltimateVTTState.hydrate) {
          return;
        }

        if (!skipSave) {
          saveActivePartyState();
        }
        activePartyIndex = nextIndex;
        syncingPartyState = true;
        window.UltimateVTTState.hydrate(partyData[activePartyIndex]);
        partyData[activePartyIndex] = window.UltimateVTTState.getState();
        syncingPartyState = false;
        renderPartyControls();
        appendSystemLog("Hotseat: personaggio attivo " + partyData[activePartyIndex].identity.name + ".");
        
        const turnPill = getElement("activeTurnPill");
        if (turnPill) {
          turnPill.textContent = "TURNO: " + partyData[activePartyIndex].identity.name.toUpperCase();
        }
      }

      function addPartyMember() {
        const input = getElement("partyNameInput");
        const index = partyData.length;
        const name = input && input.value.trim() ? input.value.trim() : "Player " + (index + 1);
        const member = createPartyMember("player-" + (index + 1), name, index);

        partyData.push(member);

        if (input) {
          input.value = "";
        }

        switchPartyMember(index);
      }

      function passTurn() {
        if (partyData.length <= 1) return;
        const nextIndex = (activePartyIndex + 1) % partyData.length;
        switchPartyMember(nextIndex);
        
        const activeName = partyData[nextIndex].identity.name;
        appendMasterChatMessage("system", "⏳ È il turno di " + activeName + ".");
        appendSystemLog("Turno passato a " + activeName + ".");
        
        if (groqMasterState.enabled) {
          groqChatHistory.push({ 
            role: "system", 
            content: "NOTIFICA DI SISTEMA: Il turno è appena passato al giocatore " + activeName + ". Nella tua prossima risposta, rivolgiti direttamente a " + activeName + " e chiedigli cosa fa." 
          });
        }
      }

      function bindPartyControls() {
        const selects = [getElement("headerPartySelect"), getElement("partyMemberSelect")].filter(Boolean);
        const addButton = getElement("partyAddPlayerButton");
        const input = getElement("partyNameInput");
        const passTurnBtn = getElement("passTurnButton");

        selects.forEach(function bindSelect(select) {
          select.addEventListener("change", function handlePartySelectChange() {
            switchPartyMember(select.value);
          });
        });

        if (addButton) {
          addButton.addEventListener("click", addPartyMember);
        }

        if (passTurnBtn) {
          passTurnBtn.addEventListener("click", passTurn);
        }

        if (input) {
          input.addEventListener("keydown", function handlePartyNameKeydown(event) {
            if (event.key === "Enter") {
              event.preventDefault();
              addPartyMember();
            }
          });
        }
      }

      function initializePartyHotseat() {
        if (!window.UltimateVTTState || !window.UltimateVTTState.getState || !window.UltimateVTTState.hydrate) {
          return;
        }

        partyData = [
          createPartyMember("player-1", "Player 1", 0),
          createPartyMember("player-2", "Player 2", 1),
          createPartyMember("player-3", "Player 3", 2)
        ];
        window.partyData = partyData;
        activePartyIndex = 0;
        bindPartyControls();
        switchPartyMember(0, true);

        window.UltimateVTTState.subscribe(function syncActiveMember(snapshot) {
          if (syncingPartyState || !partyData[activePartyIndex]) {
            return;
          }
          partyData[activePartyIndex] = cloneData(snapshot);
          window.partyData = partyData;
          renderPartyControls();
        });
      }

      function initializeConsoleModeLabel() {
        const button = getElement("rogAllyModeButton");
        if (button) {
          button.textContent = document.body.classList.contains("mode-ally") ? "CONSOLE ON" : "MODALITA CONSOLE";
          button.title = document.body.classList.contains("mode-ally") ? "Disattiva Modalita Console" : "Attiva Modalita Console";
        }
      }

      function initializeDiceLockSystem() {
        document.addEventListener("click", handleDiceClickCapture, true);
        renderDiceLockState();
      }

      function initializeScrollShortcuts() {
        const mapButton = getElement("scrollMapButton");
        const chatButton = getElement("scrollChatButton");
        const diceButton = getElement("scrollDiceButton");

        if (mapButton) {
          mapButton.addEventListener("click", scrollToMap);
        }

        if (chatButton) {
          chatButton.addEventListener("click", scrollToChat);
        }

        if (diceButton) {
          diceButton.addEventListener("click", scrollToDice);
        }
      }

      function initializeLocalMasterModel() {
        const button = getElement("localMasterModelButton");

        activeLocalMasterModelIndex = readLocalMasterModelIndex();

        if (button) {
          button.addEventListener("click", cycleLocalMasterModel);
        }

        renderLocalMasterModel(false);
      }

      function initializeOllamaMaster() {
        const button = getElement("ollamaMasterButton");

        if (button) {
          button.addEventListener("click", toggleOllamaMaster);
        }

        renderOllamaMasterState();
      }

      initializeMasterChat();
      initializeLocalMasterModel();
      initializeOllamaMaster();
      initializeGroqMaster();
      initializeDiceLockSystem();
      initializePartyHotseat();
      initializeConsoleModeLabel();
      initializeScrollShortcuts();

      var WELCOME_DIRECTIVE = "DIRETTIVA DI SISTEMA: I personaggi del party sono GIA stati creati e conosci gia le loro schede complete (nomi, razze, classi, caratteristiche, armi, abilita, incantesimi). Dai il benvenuto con tono epico chiamando OGNI personaggio per NOME con la sua razza e classe, poi avvia SUBITO l'avventura dark fantasy a Ventimiglia con una scena d'apertura concreta. NON chiedere ai giocatori di presentarsi ne di descrivere i loro personaggi: li conosci gia.";
      function triggerPartyWelcome() {
        try { if (typeof groqChatHistory !== "undefined" && groqChatHistory && groqChatHistory.length) groqChatHistory.length = 0; } catch (e) {}
        handlePlayerPrompt(WELCOME_DIRECTIVE, true);
      }

      window.UltimateVTTCoreGameplay = {
        appendChatMessage: appendMasterChatMessage,
        triggerPartyWelcome: triggerPartyWelcome,
        getPartySheetContext: buildPartySheetContext,
        receiveMasterMessage: unlockDiceFromMaster,
        inferMasterRollRequest: inferMasterRollRequest,
        cycleLocalMasterModel: cycleLocalMasterModel,
        getActiveLocalMasterModel: function getActiveLocalMasterModelSnapshot() {
          return cloneData(getActiveLocalMasterModel());
        },
        getOllamaMasterConfig: function getOllamaMasterConfig() {
          return cloneData(ollamaMasterConfig);
        },
        getOllamaMasterState: function getOllamaMasterState() {
          return cloneData(ollamaMasterState);
        },
        switchPartyMember: switchPartyMember,
        addPartyMember: addPartyMember,
        getPartyData: function getPartyData() {
          return cloneData(partyData);
        },
        getDiceLockState: function getDiceLockState() {
          return cloneData(diceLockState);
        }
      };

      appendSystemLog("Core Gameplay Loop caricato: chat Master, dice lock e hotseat party.");
    })();
    // --- FINE CORE GAMEPLAY LOOP: CHAT MASTER, DICE LOCK, PARTY HOTSEAT ---
