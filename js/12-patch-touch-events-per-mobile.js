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
      // Modello scelto per stare comodo in ~6GB di VRAM (es. laptop con GPU mobile RTX 4050): un
      // 12B come mistral-nemo in Q4 richiede piu' di 6GB solo per i pesi e sforerebbe, costringendo
      // Ollama a scaricare parte del modello su CPU (molto piu' lento). llama3.1:8b in Q4 sta
      // intorno ai 5GB e lascia margine per il resto del rendering (canvas, dadi 3D) sulla stessa GPU.
      const ollamaMasterConfig = {
        tagsEndpoint: "http://127.0.0.1:11434/api/tags",
        endpoint: "http://127.0.0.1:11434/api/chat",
        model: "llama3.1:8b",
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
      // Resta VUOTA nel sorgente del repository (nessun segreto in chiaro nel codice condiviso su
      // GitHub): usata solo come fallback quando localStorage non ha ancora una chiave salvata, cosi'
      // una copia locale/personale del file (mai committata) puo' avere una chiave pre-impostata
      // senza dover toccare il meccanismo di attivazione/salvataggio, che resta identico.
      const DEFAULT_GROQ_API_KEY = "";
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
      // Riepilogo dell'ultimo combattimento concluso (impostato dal modulo 29, "memoria di
      // combattimento"): persiste oltre la finestra scorrevole di groqChatHistory (16 messaggi),
      // cosi' il Master non lo "dimentica" dopo qualche scambio, e viene incluso anche nel prompt
      // di Ollama, che altrimenti e' del tutto stateless (nessuna cronologia tra una chiamata e l'altra).
      let ultimoRiepilogoCombattimento = "";

      // Diario di campagna a lungo termine (alimentato dal modulo 32, "memoria di campagna"): a
      // differenza di ultimoRiepilogoCombattimento (un solo scontro, sovrascritto), qui si accumulano
      // eventi chiave dell'INTERA sessione (combattimenti, spostamenti tra luoghi di Ventimiglia,
      // level-up) — cosi' il Master resta coerente anche dopo ore di gioco, quando la cronologia
      // scorrevole di Groq (16 messaggi) ha gia' fatto uscire scambi di molto tempo prima. Capato a
      // un numero massimo di voci per non far esplodere il prompt (soprattutto verso Ollama locale,
      // dove un prompt enorme rallenta molto su una GPU da laptop).
      let diarioDiCampagna = [];
      const DIARIO_CAMPAGNA_MAX_VOCI = 50;
      function pushDiarioCampagna(testo) {
        if (!testo) { return; }
        diarioDiCampagna.push(String(testo));
        if (diarioDiCampagna.length > DIARIO_CAMPAGNA_MAX_VOCI) {
          diarioDiCampagna = diarioDiCampagna.slice(-DIARIO_CAMPAGNA_MAX_VOCI);
        }
      }

      // Inietta un evento nella memoria REALE dell'IA (non solo nella chat visibile): stesso
      // pattern gia' usato da passTurn() per la notifica di cambio turno, generalizzato per essere
      // richiamabile da qualunque modulo tramite window.UltimateVTTCoreGameplay.notifyMasterMemory.
      function pushSystemMemoria(text) {
        if (groqMasterState.enabled && text) {
          groqChatHistory.push({ role: "system", content: String(text) });
        }
      }
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
          diarioDiCampagna.length
            ? "DIARIO DI CAMPAGNA (eventi chiave di questa sessione, in ordine cronologico, tienine conto anche se lontani nella conversazione): " + diarioDiCampagna.join(" | ")
            : "",
          ultimoRiepilogoCombattimento
            ? "RIEPILOGO DELL'ULTIMO COMBATTIMENTO (tienine conto, non ignorarlo): " + ultimoRiepilogoCombattimento.replace(/\n/g, " ")
            : "",
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
        // Se una build personale ha una chiave incorporata (DEFAULT_GROQ_API_KEY non vuota), quella
        // ha SEMPRE la precedenza su localStorage: altrimenti una chiave vecchia/revocata salvata in
        // precedenza dal browser continuerebbe a essere usata anche dopo aver aggiornato il file con
        // una chiave nuova, e il Master resterebbe rotto (401) senza un motivo apparente. Nel
        // repository DEFAULT_GROQ_API_KEY e' vuota, quindi vale il comportamento normale (localStorage).
        if (DEFAULT_GROQ_API_KEY) { return DEFAULT_GROQ_API_KEY; }
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
          diarioDiCampagna.length
            ? "DIARIO DI CAMPAGNA (eventi chiave dell'INTERA sessione, in ordine cronologico — tienine conto per restare coerente anche dopo molti scambi, non solo con gli ultimi messaggi):\n" + diarioDiCampagna.map(function (voce) { return "- " + voce; }).join("\n")
            : "",
          "",
          ultimoRiepilogoCombattimento
            ? "RIEPILOGO DELL'ULTIMO COMBATTIMENTO (tienine conto, non ignorarlo, non chiedere cosa e' successo):\n" + ultimoRiepilogoCombattimento
            : "",
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
        },
        // Iniettano un evento nella memoria REALE dell'IA (groqChatHistory), non solo nella chat
        // visibile: usati dal modulo 29 (memoria di combattimento) per notificare al Master IA
        // cosa e' successo in battaglia, cosi' puo' riprendere la narrazione in modo coerente.
        notifyMasterMemory: pushSystemMemoria,
        setUltimoRiepilogoCombattimento: function setUltimoRiepilogoCombattimento(testo) {
          ultimoRiepilogoCombattimento = String(testo || "");
        },
        getUltimoRiepilogoCombattimento: function getUltimoRiepilogoCombattimentoSnapshot() {
          return ultimoRiepilogoCombattimento;
        },
        // Diario di campagna a lungo termine (usato dal modulo 32, "memoria di campagna"): eventi
        // chiave dell'intera sessione (combattimenti, spostamenti, level-up), cosi' il Master resta
        // coerente anche dopo ore di gioco e molti scambi, oltre la finestra scorrevole di Groq.
        appendDiarioCampagna: pushDiarioCampagna,
        getDiarioCampagna: function getDiarioCampagnaSnapshot() {
          return diarioDiCampagna.slice();
        },
        // Permettono al modulo di backup (js/11) di salvare/ripristinare la memoria del Master IA
        // (cronologia Groq, riepilogo dell'ultimo combattimento, diario di campagna) insieme al
        // resto della partita: senza questo, ricaricare la pagina o importare un backup
        // azzererebbe la memoria costruita dai moduli 29/32, vanificando la "ripartenza coerente".
        getState: function getState() {
          return {
            groqChatHistory: cloneData(groqChatHistory),
            ultimoRiepilogoCombattimento: ultimoRiepilogoCombattimento,
            diarioDiCampagna: diarioDiCampagna.slice()
          };
        },
        hydrate: function hydrate(snapshot) {
          if (!snapshot) {
            return false;
          }
          if (Array.isArray(snapshot.groqChatHistory)) {
            groqChatHistory.length = 0;
            snapshot.groqChatHistory.forEach(function pushEntry(entry) {
              if (entry && typeof entry.role === "string" && typeof entry.content === "string") {
                groqChatHistory.push({ role: entry.role, content: entry.content });
              }
            });
          }
          if (typeof snapshot.ultimoRiepilogoCombattimento === "string") {
            ultimoRiepilogoCombattimento = snapshot.ultimoRiepilogoCombattimento;
          }
          if (Array.isArray(snapshot.diarioDiCampagna)) {
            diarioDiCampagna = snapshot.diarioDiCampagna
              .filter(function (voce) { return typeof voce === "string"; })
              .slice(-DIARIO_CAMPAGNA_MAX_VOCI);
          }
          return true;
        }
      };

      appendSystemLog("Core Gameplay Loop caricato: chat Master, dice lock e hotseat party.");
    })();
    // --- FINE CORE GAMEPLAY LOOP: CHAT MASTER, DICE LOCK, PARTY HOTSEAT ---

    // --- INIZIO MODULO 6 & 7: CANVAS MAPPA E FOG OF WAR HOTSEAT ---
    (function initCanvasModule() {
      const canvas = document.getElementById("vttCanvas");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      
      let gridSize = 48;
      let cameraX = 0;
      let cameraY = 0;
      let isDragging = false;
      let draggedTokenIndex = -1;
      let dragOffsetX = 0;
      let dragOffsetY = 0;

      // PATCH 3: Muri e collisioni
      let walls = [
        // Muri esterni stanza principale
        { x1: 400, y1: 200, x2: 800, y2: 200 },
        { x1: 800, y1: 200, x2: 800, y2: 300 }, // porta nord corridoio
        { x1: 800, y1: 400, x2: 800, y2: 500 }, // porta sud corridoio
        { x1: 800, y1: 500, x2: 400, y2: 500 },
        { x1: 400, y1: 500, x2: 400, y2: 200 },
        // Colonna interna
        { x1: 550, y1: 300, x2: 650, y2: 300 },
        { x1: 650, y1: 300, x2: 650, y2: 350 },
        // Corridoio
        { x1: 800, y1: 300, x2: 1100, y2: 300 },
        { x1: 800, y1: 400, x2: 1100, y2: 400 },
        // Bordo canvas per bloccare raggi infiniti
        { x1: 0, y1: 0, x2: 1280, y2: 0 },
        { x1: 1280, y1: 0, x2: 1280, y2: 720 },
        { x1: 1280, y1: 720, x2: 0, y2: 720 },
        { x1: 0, y1: 720, x2: 0, y2: 0 }
      ];

      function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        let det = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (det === 0) return false;
        let t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / det;
        let u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / det;
        return (t > 0 && t < 1 && u > 0 && u < 1);
      }

      function checkWallCollision(oldX, oldY, newX, newY) {
        for (let i = 0; i < walls.length; i++) {
          let w = walls[i];
          // Evitiamo le collisioni con i bordi del canvas
          if (w.x1 === 0 && w.y1 === 0 && w.x2 === 1280) continue; 
          if (segmentsIntersect(oldX, oldY, newX, newY, w.x1, w.y1, w.x2, w.y2)) {
            return true;
          }
        }
        return false;
      }

      function getRayIntersection(ray, segment) {
        const r_px = ray.a.x; const r_py = ray.a.y;
        const r_dx = ray.b.x - ray.a.x; const r_dy = ray.b.y - ray.a.y;
        const s_px = segment.x1; const s_py = segment.y1;
        const s_dx = segment.x2 - segment.x1; const s_dy = segment.y2 - segment.y1;
        
        const T2 = r_dx * s_dy - r_dy * s_dx;
        if (T2 === 0) return null;
        
        const T1 = (s_px - r_px) * s_dy - (s_py - r_py) * s_dx;
        const u = (s_px - r_px) * r_dy - (s_py - r_py) * r_dx;
        const t1 = T1 / T2;
        const t2 = u / T2;
        
        if (t1 > 0 && t2 >= 0 && t2 <= 1) {
          return { x: r_px + r_dx * t1, y: r_py + r_dy * t1, param: t1 };
        }
        return null;
      }

      function getSightPolygon(ox, oy) {
        let points = [];
        walls.forEach(w => { points.push({x: w.x1, y: w.y1}); points.push({x: w.x2, y: w.y2}); });
        
        let uniqueAngles = [];
        points.forEach(p => {
          let angle = Math.atan2(p.y - oy, p.x - ox);
          uniqueAngles.push(angle - 0.0001);
          uniqueAngles.push(angle);
          uniqueAngles.push(angle + 0.0001);
        });
        
        let intersects = [];
        uniqueAngles.forEach(angle => {
          let ray = { a: {x: ox, y: oy}, b: {x: ox + Math.cos(angle), y: oy + Math.sin(angle)} };
          let closest = null;
          walls.forEach(w => {
            let int = getRayIntersection(ray, w);
            if (!int) return;
            if (!closest || int.param < closest.param) closest = int;
          });
          if (closest) {
            closest.angle = angle;
            intersects.push(closest);
          }
        });
        
        intersects.sort((a, b) => a.angle - b.angle);
        return intersects;
      }

      function initTokenPositions() {
        if (!window.partyData) return;
        window.partyData.forEach(function (p, i) {
          if (p.x === undefined) p.x = 600 + (i * 48);
          if (p.y === undefined) p.y = 350;
        });
      }

      function drawGrid() {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = cameraX % gridSize; x < canvas.width; x += gridSize) {
          ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
        }
        for (let y = cameraY % gridSize; y < canvas.height; y += gridSize) {
          ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
        }
        ctx.stroke();
      }

      function drawWalls() {
        ctx.strokeStyle = "#4aa1b3";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        walls.forEach(w => {
          if (w.x1 === 0 || w.y1 === 0 || w.x2 === 1280 || w.y2 === 720) return;
          ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2);
        });
        ctx.stroke();
      }

      function drawTokens() {
        if (!window.partyData) return;
        window.partyData.forEach(function (p, i) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, gridSize / 2.2, 0, Math.PI * 2);
          ctx.fillStyle = i === window.activePartyIndex ? "#5bb7c8" : "#333";
          ctx.fill();
          
          ctx.strokeStyle = i === window.activePartyIndex ? "#fff" : "#666";
          ctx.lineWidth = i === window.activePartyIndex ? 3 : 2;
          ctx.stroke();
          
          ctx.fillStyle = "#fff";
          ctx.font = "14px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const shortName = p.identity && p.identity.name ? p.identity.name.substring(0, 3).toUpperCase() : "PG";
          ctx.fillText(shortName, p.x, p.y);
        });
      }

      function drawFogOfWar() {
        if (!window.partyData || window.activePartyIndex === undefined) return;
        const activeToken = window.partyData[window.activePartyIndex];
        if (!activeToken) return;
        
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.globalCompositeOperation = "destination-out";
        
        const poly = getSightPolygon(activeToken.x, activeToken.y);
        if (poly.length > 0) {
          ctx.beginPath();
          ctx.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
          ctx.closePath();
          
          const visionRadius = gridSize * 8;
          const gradient = ctx.createRadialGradient(activeToken.x, activeToken.y, 0, activeToken.x, activeToken.y, visionRadius);
          gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
          gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.9)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
          
          ctx.fillStyle = gradient;
          ctx.fill();
        }
        
        ctx.restore();
      }

      function renderCanvas() {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        drawGrid();
        drawWalls();
        drawTokens();
        drawFogOfWar();
        
        requestAnimationFrame(renderCanvas);
      }

      // Interazioni Mouse
      canvas.addEventListener("mousedown", function(e) {
        if (!window.partyData) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        
        draggedTokenIndex = window.partyData.findIndex(function(p) {
          const dx = mx - p.x; const dy = my - p.y;
          return Math.sqrt(dx*dx + dy*dy) < gridSize / 2;
        });

        if (draggedTokenIndex !== -1) {
          isDragging = true;
          dragOffsetX = mx - window.partyData[draggedTokenIndex].x;
          dragOffsetY = my - window.partyData[draggedTokenIndex].y;
          
          if (draggedTokenIndex !== window.activePartyIndex && window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.switchPartyMember) {
             window.UltimateVTTCoreGameplay.switchPartyMember(draggedTokenIndex);
          }
        }
      });

      canvas.addEventListener("mousemove", function(e) {
        if (!isDragging || draggedTokenIndex === -1 || !window.partyData) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        
        let newX = mx - dragOffsetX;
        let newY = my - dragOffsetY;
        let p = window.partyData[draggedTokenIndex];
        
        // Verifica collisioni prima di muovere
        if (!checkWallCollision(p.x, p.y, newX, newY)) {
          p.x = newX;
          p.y = newY;
        }
      });

      canvas.addEventListener("mouseup", function() {
        if (!isDragging || !window.partyData) return;
        isDragging = false;
        
        if (draggedTokenIndex !== -1) {
          const p = window.partyData[draggedTokenIndex];
          // Prova a snappare, ma solo se non ci porta oltre un muro
          let snapX = Math.round(p.x / gridSize) * gridSize;
          let snapY = Math.round(p.y / gridSize) * gridSize;
          if (!checkWallCollision(p.x, p.y, snapX, snapY)) {
            p.x = snapX; p.y = snapY;
          }
        }
        draggedTokenIndex = -1;
      });
      
      canvas.addEventListener("mouseleave", function() {
        isDragging = false;
        draggedTokenIndex = -1;
      });

      /* ---- PATCH: TOUCH EVENTS per mobile (drag token su touchscreen) ---- */
      function getTouchPos(e) {
        var rect = canvas.getBoundingClientRect();
        var t = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null);
        if (!t) return { clientX: 0, clientY: 0 };
        return { clientX: t.clientX, clientY: t.clientY };
      }
      canvas.addEventListener("touchstart", function(e) {
        e.preventDefault();
        var pos = getTouchPos(e);
        canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: pos.clientX, clientY: pos.clientY, bubbles: true }));
      }, { passive: false });
      canvas.addEventListener("touchmove", function(e) {
        e.preventDefault();
        var pos = getTouchPos(e);
        canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: pos.clientX, clientY: pos.clientY, bubbles: true }));
      }, { passive: false });
      canvas.addEventListener("touchend", function(e) {
        e.preventDefault();
        var pos = getTouchPos(e);
        canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: pos.clientX, clientY: pos.clientY, bubbles: true }));
      }, { passive: false });
      /* ---- FINE PATCH TOUCH EVENTS ---- */

      const centerBtn = document.getElementById("tokenCenterButton");
      if (centerBtn) {
        centerBtn.addEventListener("click", function() {
          if (window.partyData && window.partyData[window.activePartyIndex]) {
             window.partyData[window.activePartyIndex].x = 600;
             window.partyData[window.activePartyIndex].y = 350;
          }
        });
      }

      window.setTimeout(initTokenPositions, 1000);
      const statusLabel = document.getElementById("stageStatusLabel");
      if (statusLabel) statusLabel.textContent = "Canvas e Nebbia di Guerra interattivi (Raycasting)";
      
      renderCanvas();
    })();
    // --- FINE MODULO 6 & 7: CANVAS MAPPA E FOG OF WAR HOTSEAT ---

    // --- INIZIO MODULO 9: WEB AUDIO API PROCEDURALE E FILTRI VISIVI (PATCH 4) ---
    (function initAudioModule() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      let ctx = null;
      let masterGain = null;
      let droneOsc = null;
      let droneGain = null;
      
      const volumeSlider = document.getElementById("audioVolumeSlider");
      const muteCheck = document.getElementById("audioMuteCheckbox");
      const ambienceCheck = document.getElementById("audioAmbienceCheckbox");
      const statusSpan = document.getElementById("audioVoiceStatus");
      
      function initCtx() {
        if (!ctx) {
          ctx = new AudioContext();
          masterGain = ctx.createGain();
          masterGain.connect(ctx.destination);
          updateVolume();
        }
        if (ctx.state === "suspended") ctx.resume();
      }
      
      function updateVolume() {
        if (!masterGain) return;
        if (muteCheck && muteCheck.checked) {
          masterGain.gain.value = 0;
        } else {
          const vol = volumeSlider ? volumeSlider.value / 100 : 0.5;
          masterGain.gain.value = vol;
        }
      }
      
      if (volumeSlider) volumeSlider.addEventListener("input", updateVolume);
      if (muteCheck) muteCheck.addEventListener("change", updateVolume);
      
      // DRONE AMBIENTALE
      function toggleDrone() {
        initCtx();
        if (ambienceCheck && ambienceCheck.checked) {
          if (!droneOsc) {
            droneOsc = ctx.createOscillator();
            droneOsc.type = "sine";
            droneOsc.frequency.value = 45; // Sub-bass
            
            const lfo = ctx.createOscillator();
            lfo.type = "sine";
            lfo.frequency.value = 0.2;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 5;
            lfo.connect(lfoGain);
            lfoGain.connect(droneOsc.frequency);
            lfo.start();
            
            droneGain = ctx.createGain();
            droneGain.gain.value = 0.3;
            droneOsc.connect(droneGain);
            droneGain.connect(masterGain);
            droneOsc.start();
          }
          if (statusSpan) statusSpan.textContent = "Ambience ON";
        } else {
          if (droneOsc) {
            droneOsc.stop();
            droneOsc.disconnect();
            droneGain.disconnect();
            droneOsc = null;
            droneGain = null;
          }
          if (statusSpan) statusSpan.textContent = "Silent";
        }
      }
      
      if (ambienceCheck) ambienceCheck.addEventListener("change", toggleDrone);
      
      // SOUND CUES PROCEDURALI
      function playNoise(duration, vol) {
        initCtx();
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1000;
        
        const env = ctx.createGain();
        env.gain.setValueAtTime(vol, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        
        noise.connect(filter);
        filter.connect(env);
        env.connect(masterGain);
        noise.start();
      }
      
      function playSineSweep(startFreq, endFreq, duration, vol) {
        initCtx();
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);
        
        const env = ctx.createGain();
        env.gain.setValueAtTime(vol, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        
        osc.connect(env);
        env.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      }
      
      function playHit() {
        initCtx();
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
        
        const env = ctx.createGain();
        env.gain.setValueAtTime(1, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        
        osc.connect(env);
        env.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
      
      function playDoom() {
        initCtx();
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(200, ctx.currentTime);
        filter.frequency.linearRampToValueAtTime(50, ctx.currentTime + 3);
        
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.2);
        env.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);
        
        osc.connect(filter);
        filter.connect(env);
        env.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + 3);
      }
      
      document.querySelectorAll(".audio-control-button[data-audio-cue]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const cue = btn.getAttribute("data-audio-cue");
          if (cue === "dice") playNoise(0.4, 0.5);
          else if (cue === "hit") playHit();
          else if (cue === "spell") playSineSweep(800, 2000, 0.8, 0.4);
          else if (cue === "doom") playDoom();
        });
      });
      
      // MAP TERRAIN FILTERS (Visuali)
      const terrainSelect = document.getElementById("mapTerrainSelect");
      const stage = document.querySelector(".stage");
      if (terrainSelect && stage) {
        terrainSelect.addEventListener("change", function() {
          stage.classList.remove("filter-dungeon", "filter-forest", "filter-cavern");
          if (terrainSelect.value) {
            stage.classList.add("filter-" + terrainSelect.value);
            if (window.UltimateVTTSystemLog && window.UltimateVTTSystemLog.append) {
              window.UltimateVTTSystemLog.append("Terreno modificato: " + terrainSelect.value);
            }
          }
        });
        // Init default
        stage.classList.add("filter-" + terrainSelect.value);
      }

      const logSys = document.getElementById("diagnosticSummaryPill");
      if(logSys) logSys.textContent = "Audio e Filtri pronti.";
    })();
    // --- FINE MODULO 9: WEB AUDIO API PROCEDURALE E FILTRI VISIVI (PATCH 4) ---

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
              div.innerHTML = '<span class="master-chat-speaker">Sistema</span><p>' + msg + '</p>';
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

    // =====================================================================
    // MODULO VENTIMIGLIA — Mappa OSM reale giocabile di Ventimiglia (IM)
    // Leaflet.js + OpenStreetMap, token draggabili, POI, griglia VTT,
    // righello distanze, pannello info, filtro dark fantasy
    // =====================================================================
    (function initVentimigliaModule() {
      "use strict";

      var vMap = null;          // istanza Leaflet
      var vtMarkers = [];       // marker token Leaflet
      var vtMeasure = { active: false, startLL: null, line: null, label: null };
      var vtGridLayer = null;
      var vtLoaded = false;
      var vtActive = false;

      var VENTIMIGLIA_CENTER = [43.7870, 7.6075];
      var VENTIMIGLIA_ZOOM = 15;

      /* ---- Punti di interesse storici, militari, civili ---- */
      var POIS = [
        // CENTRO STORICO
        { name:"Città Alta",        lat:43.7879, lng:7.6059, icon:"🏰", cat:"storico" },
        { name:"Cattedrale Assunta",lat:43.7877, lng:7.6055, icon:"⛪", cat:"storico" },
        { name:"Porta Canarda",     lat:43.7882, lng:7.6063, icon:"🚪", cat:"storico" },
        { name:"Porta Nino Lamboglia",lat:43.7875,lng:7.6051,icon:"🚪",cat:"storico" },
        { name:"Teatro Romano",     lat:43.7874, lng:7.6048, icon:"🏛️", cat:"storico" },
        { name:"Cattedrale S.Michele",lat:43.7871,lng:7.6048,icon:"⛪",cat:"storico" },
        // CIVILE / COMMERCIALE
        { name:"Piazza Repubblica", lat:43.7868, lng:7.6074, icon:"🏛️", cat:"civile" },
        { name:"Piazza C. Battisti",lat:43.7863, lng:7.6091, icon:"🏛️", cat:"civile" },
        { name:"Mercato Settimanale",lat:43.7856,lng:7.6088, icon:"🛒", cat:"civile" },
        { name:"Ospedale",          lat:43.7901, lng:7.6095, icon:"🏥", cat:"civile" },
        { name:"Biblioteca",        lat:43.7865, lng:7.6069, icon:"📚", cat:"civile" },
        { name:"Municipio",         lat:43.7866, lng:7.6072, icon:"🏢", cat:"civile" },
        // TRASPORTI
        { name:"Stazione FS",       lat:43.7861, lng:7.6107, icon:"🚂", cat:"trasporti" },
        { name:"Porto Turistico",   lat:43.7836, lng:7.6052, icon:"⚓", cat:"trasporti" },
        { name:"Confine Italia-FR", lat:43.7889, lng:7.6369, icon:"🛂", cat:"trasporti" },
        { name:"Ponte sul Roya",    lat:43.7862, lng:7.6043, icon:"🌉", cat:"trasporti" },
        // NATURA / COSTA
        { name:"Lungomare",         lat:43.7842, lng:7.6072, icon:"🏖️", cat:"natura" },
        { name:"Balzi Rossi",       lat:43.7914, lng:7.5990, icon:"🪨", cat:"natura" },
        { name:"Giardini Hanbury",  lat:43.7928, lng:7.5975, icon:"🌿", cat:"natura" },
        { name:"Capo Mortola",      lat:43.7916, lng:7.5963, icon:"🏔️", cat:"natura" },
        { name:"Foce del Roya",     lat:43.7835, lng:7.6038, icon:"🌊", cat:"natura" },
        // MILITARE / DIFESA
        { name:"Forte dell'Annunziata",lat:43.7888,lng:7.6044,icon:"⚔️",cat:"militare"},
        { name:"Torre dell'Orologio",  lat:43.7878,lng:7.6060,icon:"⏰",cat:"militare"},
      ];

      var CAT_COLORS = {
        storico:"#c89b3c", civile:"#5bb7c8", trasporti:"#d8c7a3",
        natura:"#5d9f45", militare:"#c9362b"
      };

      var TOKEN_COLORS = ["#5bb7c8","#c9362b","#c89b3c","#5d9f45","#7b59c4","#e0792f"];

      /* posizioni iniziali dei token vicino alla stazione */
      var DEFAULT_LATLNGS = [
        [43.7863, 7.6107],[43.7859, 7.6110],[43.7866, 7.6104],
        [43.7860, 7.6113],[43.7857, 7.6108],[43.7870, 7.6101],
      ];

      /* -------- Leaflet loader dinamico -------- */
      function loadLeaflet(cb) {
        if (window.L) { cb(); return; }
        var css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);
        var scr = document.createElement("script");
        scr.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        scr.onload = cb;
        scr.onerror = function() { alert("Connessione internet necessaria per caricare la mappa di Ventimiglia."); };
        document.head.appendChild(scr);
      }

      /* -------- Costruzione mappa -------- */
      function buildMap() {
        var div = document.getElementById("ventimigliaMapDiv");
        if (!div || vMap) return;

        vMap = window.L.map(div, {
          center: VENTIMIGLIA_CENTER,
          zoom: VENTIMIGLIA_ZOOM,
          zoomControl: false,
          attributionControl: false
        });

        /* Tile layer OSM con filtro dark-fantasy */
        var tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        var tiles = window.L.tileLayer(tileUrl, { maxZoom: 19 });
        tiles.addTo(vMap);

        /* Filtro CSS per stile dark-fantasy */
        setTimeout(function() {
          var pane = div.querySelector(".leaflet-tile-pane");
          if (pane) pane.style.cssText = "filter:brightness(.72) saturate(.75) contrast(1.15) sepia(.18);";
        }, 400);

        /* Attribution compatta */
        window.L.control.attribution({ prefix: false })
          .addAttribution('<a href="https://www.openstreetmap.org/copyright" style="color:#c89b3c">© OSM</a>')
          .addTo(vMap);

        /* Zoom controls personalizzati (destra) */
        window.L.control.zoom({ position: "bottomright" }).addTo(vMap);

        /* Titolo mappa */
        var titleCtrl = window.L.control({ position: "topleft" });
        titleCtrl.onAdd = function() {
          var d = window.L.DomUtil.create("div");
          d.innerHTML = '<div style="background:rgba(9,7,6,.88);border:1px solid rgba(200,155,60,.6);border-radius:8px;padding:7px 12px;font-family:Georgia,serif;font-size:14px;color:#c89b3c;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.5)">⚔️ Ventimiglia — Mappa Tattica</div>';
          return d;
        };
        titleCtrl.addTo(vMap);

        /* Legenda POI */
        var legendCtrl = window.L.control({ position: "topright" });
        legendCtrl.onAdd = function() {
          var d = window.L.DomUtil.create("div");
          d.innerHTML = Object.keys(CAT_COLORS).map(function(k) {
            return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">' +
              '<span style="width:10px;height:10px;border-radius:50%;background:'+CAT_COLORS[k]+';display:inline-block;flex:none"></span>' +
              '<span style="font-size:10px;color:#d8c7a3;text-transform:capitalize">'+k+'</span></div>';
          }).join("");
          d.style.cssText = "background:rgba(9,7,6,.84);border:1px solid rgba(200,155,60,.4);border-radius:8px;padding:7px 10px;font-family:Georgia,serif;pointer-events:none";
          return d;
        };
        legendCtrl.addTo(vMap);

        /* Righello distanze */
        window.L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(vMap);

        /* Toolbar (pannello in alto a sinistra sotto il titolo) */
        buildToolbar();

        /* POI */
        addPOIs();

        /* Token party */
        addTokenMarkers();

        /* Griglia VTT sovrapposta (celle da 30m ≈ 1 quadretto D&D) */
        buildVttGrid();

        /* Click mappa per misurare distanza */
        vMap.on("click", function(e) {
          if (!vtMeasure.active) return;
          if (!vtMeasure.startLL) {
            vtMeasure.startLL = e.latlng;
          } else {
            var d = vMap.distance(vtMeasure.startLL, e.latlng);
            var cells = Math.round(d / 1.5);
            var ft = Math.round(d * 3.28084);
            if (vtMeasure.line) vMap.removeLayer(vtMeasure.line);
            vtMeasure.line = window.L.polyline([vtMeasure.startLL, e.latlng],
              { color:"#c89b3c", weight:2, dashArray:"6,4", opacity:.9 }).addTo(vMap);
            showInfo("📏 Distanza: " + Math.round(d) + "m | " + ft + " ft | " + cells + " quadretti VTT");
            vtMeasure.startLL = null;
          }
        });

        /* Aggiorna token su move/zoom */
        vMap.on("moveend zoomend", function() {
          /* i marker Leaflet si aggiornano da soli */
        });

        vtLoaded = true;
      }

      /* -------- POI markers -------- */
      function addPOIs() {
        POIS.forEach(function(poi) {
          var color = CAT_COLORS[poi.cat] || "#c89b3c";
          var icon = window.L.divIcon({
            html: '<div style="display:flex;align-items:center;gap:4px;background:rgba(9,7,6,.88);' +
                  'border:1px solid '+color+';border-radius:7px;padding:2px 7px 2px 4px;' +
                  'white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.55);cursor:default">' +
                  '<span style="font-size:13px">'+poi.icon+'</span>' +
                  '<span style="font-size:11px;color:'+color+';font-family:Georgia,serif;font-weight:700">'+poi.name+'</span>' +
                  '</div>',
            className: "",
            iconAnchor: [0, 0]
          });
          window.L.marker([poi.lat, poi.lng], { icon: icon, interactive: true })
            .on("click", function() { showInfo(poi.icon + " " + poi.name + " — " + poi.cat.charAt(0).toUpperCase()+poi.cat.slice(1)); })
            .addTo(vMap);
        });
      }

      /* -------- Token markers -------- */
      function makeTokenIcon(color, label, hp, maxHp) {
        var hpPct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round(hp/maxHp*100))) : 100;
        var barColor = hpPct > 50 ? "#5d9f45" : hpPct > 25 ? "#c89b3c" : "#c9362b";
        return window.L.divIcon({
          html: '<div style="position:relative;width:40px">' +
                '<div style="width:40px;height:40px;border-radius:50%;background:'+color+';' +
                'border:2.5px solid rgba(255,255,255,.75);display:flex;align-items:center;' +
                'justify-content:center;font-weight:700;font-size:17px;color:#fff;' +
                'box-shadow:0 2px 10px rgba(0,0,0,.65),0 0 0 1.5px rgba(0,0,0,.4);' +
                'cursor:grab;font-family:Georgia,serif">'+label+'</div>' +
                '<div style="position:absolute;bottom:-6px;left:0;right:0;height:5px;background:#1a1510;border-radius:4px;overflow:hidden">' +
                '<div style="height:100%;width:'+hpPct+'%;background:'+barColor+'"></div></div>' +
                '</div>',
          className: "",
          iconSize: [40, 46],
          iconAnchor: [20, 20]
        });
      }

      function addTokenMarkers() {
        vtMarkers.forEach(function(m) { vMap.removeLayer(m); });
        vtMarkers = [];
        var party = window.partyData || [];
        var count = Math.max(party.length, 3);

        for (var i = 0; i < count; i++) {
          var token = party[i] || {};
          var color = TOKEN_COLORS[i % TOKEN_COLORS.length];
          var name = token.name || ("T" + (i + 1));
          var hp = token.hp !== undefined ? token.hp : 10;
          var maxHp = token.maxHp !== undefined ? token.maxHp : 10;
          var ll = DEFAULT_LATLNGS[i] || [
            VENTIMIGLIA_CENTER[0] + (Math.random() - .5) * 0.002,
            VENTIMIGLIA_CENTER[1] + (Math.random() - .5) * 0.002
          ];

          (function(idx, nm, col, h, mh) {
            var mk = window.L.marker(ll, {
              icon: makeTokenIcon(col, nm[0].toUpperCase(), h, mh),
              draggable: true,
              zIndexOffset: 500 + idx
            });
            mk.on("dragend", function() {
              var pos = mk.getLatLng();
              showInfo("📍 " + nm + " → " + pos.lat.toFixed(5) + ", " + pos.lng.toFixed(5));
            });
            mk.on("click", function() {
              if (window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.switchPartyMember) {
                window.UltimateVTTCoreGameplay.switchPartyMember(idx);
              }
              showInfo("⭐ " + nm + " selezionato | " + h + "/" + mh + " HP");
            });
            mk.addTo(vMap);
            vtMarkers.push(mk);
          })(i, name, color, hp, maxHp);
        }
      }

      /* -------- Griglia VTT (quadretti da ~30m reali, 1 cella = 1.5m) -------- */
      function buildVttGrid() {
        if (vtGridLayer) { vMap.removeLayer(vtGridLayer); vtGridLayer = null; }
        /* griglia usando canvas overlay personalizzato */
        vtGridLayer = window.L.canvas({ padding: 0.5 });
        /* wrapper leggero: non usiamo un vero canvas renderer,
           ma un semplice SVG layer di linee sottili */
        var cellMeters = 1.5; /* 1 quadretto D&D = 1.5m */
        var lines = [];
        var bounds = [
          [43.770, 7.590],
          [43.800, 7.650]
        ];
        /* crea linee orizontali e verticali ogni ~1.5m in lat/lng */
        var latStep = cellMeters / 111320;
        var lngStep = cellMeters / (111320 * Math.cos(43.787 * Math.PI / 180));
        /* limitiamo a una griglia 200×200 per performance */
        for (var lat = bounds[0][0]; lat <= bounds[1][0]; lat += latStep * 20) {
          lines.push([[lat, bounds[0][1]], [lat, bounds[1][1]]]);
        }
        for (var lng = bounds[0][1]; lng <= bounds[1][1]; lng += lngStep * 20) {
          lines.push([[bounds[0][0], lng], [bounds[1][0], lng]]);
        }
        vtGridLayer = window.L.polyline(lines, {
          color: "rgba(200,155,60,0.18)", weight: 0.7, interactive: false
        }).addTo(vMap);
      }

      /* -------- Toolbar sovrapposta -------- */
      function buildToolbar() {
        var ctrl = window.L.control({ position: "bottomleft" });
        ctrl.onAdd = function() {
          var d = window.L.DomUtil.create("div");
          d.style.cssText = "display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px";
          var btns = [
            ["📏 Misura", function() {
              vtMeasure.active = !vtMeasure.active;
              vtMeasure.startLL = null;
              showInfo(vtMeasure.active ? "Clicca punto A, poi punto B per misurare" : "Misura disattivata");
            }],
            ["🔄 Token", function() {
              addTokenMarkers();
              showInfo("Token aggiornati dal party");
            }],
            ["🏠 Centro", function() {
              vMap.setView(VENTIMIGLIA_CENTER, VENTIMIGLIA_ZOOM);
            }],
            ["🏰 Alta", function() {
              vMap.setView([43.7878, 7.6058], 17);
            }],
            ["⚓ Porto", function() {
              vMap.setView([43.7836, 7.6052], 17);
            }],
            ["🚂 Staz.", function() {
              vMap.setView([43.7861, 7.6107], 17);
            }],
            ["🛂 Confine", function() {
              vMap.setView([43.7889, 7.6369], 16);
            }],
            ["🪨 Balzi", function() {
              vMap.setView([43.7914, 7.5990], 16);
            }],
          ];
          btns.forEach(function(pair) {
            var b = document.createElement("button");
            b.textContent = pair[0];
            b.type = "button";
            b.style.cssText = "background:rgba(9,7,6,.9);border:1px solid rgba(200,155,60,.6);color:#d8c7a3;" +
              "border-radius:7px;padding:5px 9px;font-size:12px;font-family:Georgia,serif;cursor:pointer;" +
              "white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.5)";
            b.addEventListener("click", function(e) {
              window.L.DomEvent.stopPropagation(e);
              pair[1]();
            });
            d.appendChild(b);
          });
          return d;
        };
        ctrl.addTo(vMap);
      }

      /* -------- Info bar -------- */
      function showInfo(msg) {
        var el = document.getElementById("vtTokenInfo");
        if (!el) return;
        el.textContent = msg;
        el.style.display = "block";
        clearTimeout(showInfo._t);
        showInfo._t = setTimeout(function() { el.style.display = "none"; }, 3000);
      }

      /* -------- Toggle -------- */
      function activate() {
        var mapDiv = document.getElementById("ventimigliaMapDiv");
        var vttC = document.getElementById("vttCanvas");
        var diceC = document.getElementById("diceCanvas");
        var overlay = document.querySelector(".stage-overlay");
        var btn = document.getElementById("ventimigliaToggleBtn");

        if (!mapDiv) return;
        mapDiv.style.display = "block";
        if (vttC) vttC.style.display = "none";
        if (diceC) diceC.style.display = "none";
        if (overlay) overlay.style.pointerEvents = "none";
        if (btn) { btn.textContent = "🗺 DUNGEON"; btn.style.borderColor = "rgba(200,155,60,.72)"; }

        vtActive = true;

        if (!vtLoaded) {
          loadLeaflet(function() {
            buildMap();
            setTimeout(function() { vMap && vMap.invalidateSize(); }, 200);
          });
        } else {
          vMap && vMap.invalidateSize();
          addTokenMarkers();
        }
      }

      function deactivate() {
        var mapDiv = document.getElementById("ventimigliaMapDiv");
        var vttC = document.getElementById("vttCanvas");
        var diceC = document.getElementById("diceCanvas");
        var overlay = document.querySelector(".stage-overlay");
        var btn = document.getElementById("ventimigliaToggleBtn");
        var info = document.getElementById("vtTokenInfo");

        if (mapDiv) mapDiv.style.display = "none";
        if (vttC) vttC.style.display = "";
        if (diceC) diceC.style.display = "";
        if (overlay) overlay.style.pointerEvents = "";
        if (btn) { btn.textContent = "🏔 VENTIMIGLIA"; btn.style.borderColor = "rgba(93,159,69,.72)"; }
        if (info) info.style.display = "none";
        vtActive = false;
      }

      function toggle() {
        if (vtActive) deactivate(); else activate();
      }

      /* -------- Wiring pulsante -------- */
      function wireButton() {
        var btn = document.getElementById("ventimigliaToggleBtn");
        if (btn) { btn.addEventListener("click", toggle); return; }
        setTimeout(wireButton, 200);
      }
      wireButton();

      /* -------- Esporta API globale -------- */
      window.VentimigliaMap = {
        activate: activate,
        deactivate: deactivate,
        toggle: toggle,
        goTo: function(name) {
          var poi = POIS.find(function(p) { return p.name.toLowerCase().indexOf(name.toLowerCase()) !== -1; });
          if (poi && vMap) { vMap.setView([poi.lat, poi.lng], 17); showInfo(poi.icon+" "+poi.name); }
        },
        refreshTokens: addTokenMarkers
      };

      /* ---- Shortcut chat: "vai a [luogo]" -------- */
      document.addEventListener("DOMContentLoaded", function() {
        var chatForm = document.getElementById("masterChatForm");
        if (!chatForm) return;
        chatForm.addEventListener("submit", function(e) {
          var input = document.getElementById("masterChatInput");
          if (!input) return;
          var txt = input.value.toLowerCase();
          if ((txt.indexOf("vai a") !== -1 || txt.indexOf("porta a") !== -1) && vtActive) {
            POIS.forEach(function(poi) {
              if (txt.indexOf(poi.name.toLowerCase()) !== -1) {
                vMap && vMap.setView([poi.lat, poi.lng], 17);
                showInfo("→ " + poi.icon + " " + poi.name);
              }
            });
          }
        }, true);
      });
    })();
    // === FINE MODULO VENTIMIGLIA ===

    // =====================================================================
    // MODULO MOBILE HUB — Layout unificato: mappa · chat · scheda · combat
    // =====================================================================
    (function initMobileHub() {
      "use strict";

      var hub = { map: null, mapReady: false, activeTab: "chat", syncTimer: null, chatMirrorTimer: null };

      var GROQ_LS   = "ultimate-vtt-groq-api-key";
      var GROQ_URL  = "https://api.groq.com/openai/v1/chat/completions";
      var GROQ_MOD  = "llama-3.3-70b-versatile";
      var CAMP_CENTER = [43.7870, 7.6075];
      var STAT_LABELS = { str:"FOR", dex:"DES", con:"COS", int:"INT", wis:"SAG", cha:"CAR",
                          strength:"FOR", dexterity:"DES", constitution:"COS",
                          intelligence:"INT", wisdom:"SAG", charisma:"CAR" };
      function mmod(v) { var n=parseInt(v,10)||10; return Math.floor((n-10)/2); }
      function sgn(n) { return (n>=0?"+":"")+n; }
      function el(id) { return document.getElementById(id); }
      function clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }

      /* ── Attiva / disattiva hub ── */
      function openHub() {
        document.body.classList.add("hub-active");
        renderSync();
        initHubMap();
        hub.syncTimer = setInterval(renderSync, 1200);
        hub.chatMirrorTimer = setInterval(mirrorChat, 800);
      }
      function closeHub() {
        document.body.classList.remove("hub-active");
        clearInterval(hub.syncTimer);
        clearInterval(hub.chatMirrorTimer);
      }

      /* ── Tab switching ── */
      function switchTab(name) {
        hub.activeTab = name;
        document.querySelectorAll(".hub-tab").forEach(function(b) { b.classList.toggle("is-active", b.dataset.panel===name); });
        document.querySelectorAll(".hub-panel").forEach(function(p) { p.classList.remove("is-active"); });
        var panel = el("hubPanel"+(name.charAt(0).toUpperCase()+name.slice(1)));
        if (panel) panel.classList.add("is-active");
        /* nav bar */
        document.querySelectorAll(".hub-nav-btn[data-nav]").forEach(function(b) { b.classList.toggle("is-active", b.dataset.nav===name); });
        /* lazy-render */
        if (name==="pg") renderPgPanel();
        if (name==="combat") renderCombatPanel();
        if (name==="map") {
          if (hub.map) setTimeout(function() { hub.map.invalidateSize({animate:false}); }, 120);
        }
      }

      /* ── Sync status bar ── */
      function renderSync() {
        var party = window.partyData || [];
        var v = window.vttReadPg(party[0], 0);
        var name = v.name;
        var hp = v.hp;
        var maxHp = v.maxHp;
        var color = v.color;
        var hpPct = maxHp>0 ? clamp(hp/maxHp*100,0,100) : 0;
        var hpColor = hpPct>50?"#5d9f45":hpPct>25?"#c89b3c":"#c9362b";

        if (el("hubPgColor")) { el("hubPgColor").textContent=name[0]||"E"; el("hubPgColor").style.background=color; }
        if (el("hubPgNameTxt")) el("hubPgNameTxt").textContent=name;
        if (el("hubPgHpFill")) { el("hubPgHpFill").style.width=hpPct+"%"; el("hubPgHpFill").style.background=hpColor; }
        if (el("hubPgHpNum")) el("hubPgHpNum").textContent=hp+"/"+maxHp;

        /* round combat */
        var cs = window.UltimateVTTCombat ? window.UltimateVTTCombat.getState() : null;
        var round = cs && cs.active ? cs.round : "—";
        if (el("hubRoundNum")) el("hubRoundNum").textContent=round;

        /* zona (da campaign module se attivo) */
        var zone = (window.VTTCampagna && window._hubZone) ? window._hubZone : "Ventimiglia";
        if (el("hubZoneTxt")) el("hubZoneTxt").textContent=zone;

        /* aggiorna marker PG sulla mappa hub */
        if (hub.pgMarker) {
          hub.pgMarker.setIcon(makePgIcon(color, name[0].toUpperCase(), hp, maxHp, name));
        }

        /* refresh pannello attivo */
        if (hub.activeTab==="combat") renderCombatPanel();
        if (hub.activeTab==="pg") {
          /* solo se il pannello è già renderizzato */
          syncPgHpBars();
        }
      }

      /* ── MAPPA HUB ── */
      function loadLeaflet(cb) {
        if (window.L) { cb(); return; }
        var css=document.createElement("link"); css.rel="stylesheet";
        css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
        var scr=document.createElement("script"); scr.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        scr.onload=cb; document.head.appendChild(scr);
      }

      function makePgIcon(color, initial, hp, maxHp, name) {
        var pct = maxHp>0 ? clamp(Math.round(hp/maxHp*100),0,100) : 100;
        var bc = pct>50?"#5d9f45":pct>25?"#c89b3c":"#c9362b";
        var label = name ? '<div style="margin-top:7px;max-width:108px;padding:1px 7px;border-radius:5px;background:rgba(9,7,6,.9);border:1px solid rgba(200,155,60,.55);color:#f0d472;font:700 10px/1.15 Georgia,serif;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px rgba(0,0,0,.6)">'+name+'</div>' : '';
        return window.L.divIcon({
          html: '<div style="display:flex;flex-direction:column;align-items:center;width:110px">' +
                '<div style="position:relative;width:36px">' +
                '<div style="width:36px;height:36px;border-radius:50%;background:'+color+';'+
                'border:2.5px solid rgba(255,255,255,.75);display:flex;align-items:center;justify-content:center;'+
                'font-weight:700;font-size:16px;color:#fff;box-shadow:0 0 0 2px rgba(200,155,60,.7),0 2px 10px rgba(0,0,0,.6);'+
                'font-family:Georgia,serif">'+initial+'</div>'+
                '<div style="position:absolute;bottom:-5px;left:0;right:0;height:4px;background:#1a1510;border-radius:3px;overflow:hidden">'+
                '<div style="height:100%;width:'+pct+'%;background:'+bc+'"></div></div></div>'+
                label +
                '</div>',
          className:"", iconSize:[110, name?60:42], iconAnchor:[55,18]
        });
      }

      function initHubMap() {
        var div = el("hubMapDiv"); if (!div) return;
        if (!window.L) { setTimeout(initHubMap, 300); return; }
        if (hub.map) { hub.map.invalidateSize({animate:false}); return; }
        var v = window.vttReadPg(window.partyData && window.partyData[0], 0);
        var color = v.color, name = v.name;
        /* Forza dimensioni pixel prima di L.map() */
        var wrap = el("hubMapWrap");
        var wW = wrap ? wrap.offsetWidth  : window.innerWidth;
        var wH = wrap ? wrap.offsetHeight : Math.round(window.innerHeight*0.38);
        div.style.width = wW+"px"; div.style.height = wH+"px";
        hub.map = window.L.map(div, { center:CAMP_CENTER, zoom:16, zoomControl:true, attributionControl:false, tap:true, tapTolerance:15 });
        var tl = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, crossOrigin:true });
        tl.on("tileload", function() { var ld=el("hubMapLoading"); if(ld) ld.classList.add("tiles-loaded"); });
        tl.addTo(hub.map);
        setTimeout(function() {
          var tp = div.querySelector(".leaflet-tile-pane");
          if (tp) tp.style.cssText="filter:brightness(.68) saturate(.7) contrast(1.2) sepia(.22);";
        }, 700);
        /* Ripristina CSS */
        setTimeout(function() { div.style.width=""; div.style.height=""; hub.map&&hub.map.invalidateSize({animate:false}); }, 250);
        hub.map.zoomControl.setPosition("bottomright");
        hub.pgMarker = window.L.marker(CAMP_CENTER, {
          icon: makePgIcon(color, name[0]||"E", v.hp, v.maxHp, name),
          interactive: false, zIndexOffset:1000
        }).addTo(hub.map);
        var POIS=[[43.7879,7.6059],[43.7877,7.6055],[43.7868,7.6074],[43.7861,7.6107],[43.7836,7.6052],[43.7842,7.6072],[43.7914,7.5990],[43.7888,7.6044]];
        POIS.forEach(function(ll) {
          window.L.circleMarker(ll,{radius:4,color:"rgba(200,155,60,.8)",fillColor:"rgba(200,155,60,.6)",fillOpacity:1,weight:1,interactive:false}).addTo(hub.map);
        });
        hub.mapReady=true;
        var doR=function(){hub.map&&hub.map.invalidateSize({animate:false});};
        setTimeout(doR,150); setTimeout(doR,500); setTimeout(doR,1000);
        setInterval(function() {
          if (!hub.mapReady||!hub.map) return;
          var vc = window.VTTCampagna;
          if (vc && vc._state && vc._state.pgPos) {
            var pos=vc._state.pgPos;
            hub.pgMarker.setLatLng([pos.lat,pos.lng]);
            hub.map.panTo([pos.lat,pos.lng],{animate:false});
          }
        }, 1000);
      }

      /* ── CHAT: mirror dal masterChatLog ── */
      var lastChatCount = 0;
      function mirrorChat() {
        var src = el("masterChatLog"); if (!src) return;
        var msgs = src.querySelectorAll(".master-chat-message");
        if (msgs.length===lastChatCount) return;
        lastChatCount = msgs.length;
        var log = el("hubChatLog"); if (!log) return;
        log.innerHTML="";
        var recent = Array.prototype.slice.call(msgs).slice(-20);
        recent.forEach(function(m) {
          var speaker = m.querySelector(".master-chat-speaker");
          var txt = m.querySelector("p");
          if (!speaker || !txt) return;
          var spk = speaker.textContent.trim();
          var isUser = m.classList.contains("user") || spk==="Tu";
          var isSys  = m.classList.contains("system") || spk==="Sistema";
          var row = document.createElement("div"); row.className="hub-msg";
          var av  = document.createElement("div"); av.className="hub-msg-av";
          av.textContent = isUser?"⭐":isSys?"⚙":"🧙";
          var body= document.createElement("div"); body.className="hub-msg-body";
          var who = document.createElement("div"); who.className="hub-msg-who"; who.textContent=spk;
          var bub = document.createElement("div");
          bub.className="hub-msg-txt"+(isUser?" pg":isSys?" sys":"");
          bub.textContent=txt.textContent;
          body.appendChild(who); body.appendChild(bub);
          row.appendChild(av); row.appendChild(body); log.appendChild(row);
        });
        log.scrollTop=log.scrollHeight;
      }

      /* Invio messaggio (usa il sistema chat esistente) */
      function sendHubChat() {
        var inp=el("hubChatInputField"); if(!inp) return;
        var txt=inp.value.trim(); if(!txt) return;
        inp.value="";
        var realInput=el("masterChatInput"); var realForm=el("masterChatForm");
        if(realInput && realForm) {
          realInput.value=txt;
          realForm.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
          return;
        }
        /* fallback: Groq diretto */
        var key=""; try{key=localStorage.getItem(GROQ_LS)||"";}catch(e){}
        if (!key) { addHubMsg("Sistema","(Configura GROQ nella topbar per le risposte del DM)","sys"); return; }
        addHubMsg("Tu",txt,"pg");
        addHubMsg("DM","…","dm");
        fetch(GROQ_URL,{ method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
          body:JSON.stringify({model:GROQ_MOD,max_tokens:150,messages:[
            {role:"system",content:"Sei il DM di una campagna D&D 5e a Ventimiglia, dark fantasy. Rispondi in italiano, 2-3 frasi."},
            {role:"user",content:txt}
          ]})
        }).then(function(r){return r.json();}).then(function(d){
          var log=el("hubChatLog"); if(!log) return;
          var last=log.lastElementChild;
          var reply=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
          if(last){var b=last.querySelector(".hub-msg-txt");if(b)b.textContent=reply||"…";}
        }).catch(function(){});
      }
      function addHubMsg(who,txt,type) {
        var log=el("hubChatLog"); if(!log) return;
        var row=document.createElement("div"); row.className="hub-msg";
        var av=document.createElement("div"); av.className="hub-msg-av";
        av.textContent=type==="pg"?"⭐":type==="sys"?"⚙":"🧙";
        var body=document.createElement("div"); body.className="hub-msg-body";
        var wh=document.createElement("div"); wh.className="hub-msg-who"; wh.textContent=who;
        var bub=document.createElement("div"); bub.className="hub-msg-txt"+(type==="pg"?" pg":type==="sys"?" sys":"");
        bub.textContent=txt;
        body.appendChild(wh); body.appendChild(bub); row.appendChild(av); row.appendChild(body); log.appendChild(row);
        log.scrollTop=log.scrollHeight;
      }

      /* ── SCHEDA PG ── */
      function renderPgPanel() {
        var party=window.partyData||[]; if(!party.length){if(el("hubPgContent"))el("hubPgContent").innerHTML='<p style="color:var(--gold);padding:16px">Nessun personaggio creato.</p>';return;}
        /* Selezione PG */
        var sel=el("hubPgSelect"); if(sel){
          sel.innerHTML=party.map(function(pg,i){
            var c=["#5bb7c8","#c89b3c","#5d9f45","#7b59c4"][i%4];
            return '<button class="hub-pg-btn'+(i===0?" is-active":"")+'" data-idx="'+i+'">'+
                   '<span class="hub-pg-btn-dot" style="background:'+c+'"></span>'+
                   (pg.name||"PG"+(i+1))+'</button>';
          }).join("");
          sel.querySelectorAll(".hub-pg-btn").forEach(function(b){
            b.addEventListener("click",function(){
              sel.querySelectorAll(".hub-pg-btn").forEach(function(x){x.classList.remove("is-active");});
              b.classList.add("is-active");
              renderPgContent(parseInt(b.dataset.idx,10));
            });
          });
        }
        renderPgContent(0);
      }
      function renderPgContent(idx) {
        var party=window.partyData||[]; var pg=party[idx]; if(!pg) return;
        var cont=el("hubPgContent"); if(!cont) return;
        var V=window.vttReadPg(pg, idx);
        var hp=V.hp, maxHp=V.maxHp;
        var hpPct=maxHp>0?clamp(hp/maxHp*100,0,100):0;
        var hpC=hpPct>50?"#5d9f45":hpPct>25?"#c89b3c":"#c9362b";
        var stats=["str","dex","con","int","wis","cha"];
        var statsHtml=stats.map(function(k){
          var v=V.abil[k];
          return '<div class="hub-stat"><span class="hub-stat-label">'+(STAT_LABELS[k]||k.toUpperCase())+'</span>'+
                 '<span class="hub-stat-val">'+v+'</span><span class="hub-stat-mod">'+sgn(mmod(v))+'</span></div>';
        }).join("");
        cont.innerHTML=
          '<div class="hub-hp-block">'+
            '<div class="hub-hp-top"><span class="hub-hp-name">'+V.name+'</span>'+
            '<span class="hub-hp-vals">❤️ '+hp+'/'+maxHp+' &nbsp;🛡 '+(V.ac!=null?V.ac:'—')+'</span></div>'+
            '<div class="hub-hp-bar-full"><div class="hub-hp-bar-fill" style="width:'+hpPct+'%;background:'+hpC+'"></div></div>'+
          '</div>'+
          '<div class="hub-section-title">Caratteristiche</div>'+
          '<div class="hub-stats-grid">'+statsHtml+'</div>'+
          '<div class="hub-section-title">Azioni rapide</div>'+
          '<div class="hub-quick-actions">'+
            '<button class="hub-qa-btn dmg" id="hqDmg'+idx+'">⚔️ Attacca</button>'+
            '<button class="hub-qa-btn" id="hqHeal'+idx+'">💊 Cura (+1d6)</button>'+
            '<button class="hub-qa-btn" id="hqProva'+idx+'">🎲 Prova</button>'+
          '</div>';
        var dmgB=cont.querySelector("#hqDmg"+idx);
        var healB=cont.querySelector("#hqHeal"+idx);
        var provB=cont.querySelector("#hqProva"+idx);
        if(dmgB) dmgB.addEventListener("click",function(){switchTab("combat");});
        if(healB) healB.addEventListener("click",function(){
          var r=Math.floor(Math.random()*6)+1;
          var cur=window.vttReadPg(pg, idx); var nh=clamp(cur.hp+r,0,cur.maxHp); window.vttWritePgHp(pg, nh);
          addHubMsg("Sistema","💊 "+cur.name+" cura "+r+" PF → "+nh+"/"+cur.maxHp,"sys");
          renderSync();
          renderPgContent(idx);
        });
        if(provB) provB.addEventListener("click",function(){showProvaDialog(pg);});
      }
      function syncPgHpBars() { /* aggiorna solo le barre senza re-render completo */ }

      /* Dialog prova abilità rapida */
      function showProvaDialog(pg) {
        var abil=[["FOR","str"],["DES","dex"],["COS","con"],["INT","int"],["SAG","wis"],["CAR","cha"]];
        var chosen=abil[Math.floor(Math.random()*6)];
        var stat=pg[chosen[1]]||10, bonus=mmod(stat), roll=Math.floor(Math.random()*20)+1, tot=roll+bonus;
        addHubMsg("Sistema","🎲 Prova di "+chosen[0]+": d20("+roll+")"+sgn(bonus)+" = "+tot,"sys");
        addHubMsg("DM",tot>=15?"Un successo notevole! Prosegui con fiducia.":tot>=10?"Ce la fai, ma a caro prezzo.":"Fallisci. Le conseguenze si fanno sentire.","dm");
      }

      /* ── COMBAT PANEL ── */
      function renderCombatPanel() {
        var cont=el("hubCombatContent"); if(!cont) return;
        var cs=window.UltimateVTTCombat?window.UltimateVTTCombat.getState():null;
        if(!cs||!cs.active){
          cont.innerHTML=
            '<p style="color:var(--gold);font-family:Georgia,serif;padding:8px 0 12px">Nessun combattimento attivo.</p>'+
            '<div class="hub-combat-actions">'+
              '<button class="hub-ca-btn full primary" id="hcRoll">⚔️ Tira Iniziativa</button>'+
            '</div>';
          var rb=cont.querySelector("#hcRoll");
          if(rb) rb.addEventListener("click",function(){
            var b=el("moduleFiveRollInitiativeButton"); if(b){b.click(); setTimeout(renderCombatPanel,400);}
          });
          return;
        }
        var cur=cs.combatants[cs.currentTurnIndex]||{};
        var dotColor=cur.kind==="pc"?"#5bb7c8":"#c9362b";
        var initHtml=cs.combatants.map(function(c,i){
          var isCur=i===cs.currentTurnIndex, isDead=c.defeated||c.hitPoints<=0;
          var dc=c.kind==="pc"?"#5bb7c8":"#c9362b";
          var hpPct=c.maxHitPoints>0?clamp(c.hitPoints/c.maxHitPoints*100,0,100):0;
          return '<div class="hub-init-row'+(isCur?" is-current":"")+(!isDead?"":' is-dead')+'">'+
                 '<div class="hub-init-dot" style="background:'+dc+'">'+c.name[0]+'</div>'+
                 '<span class="hub-init-name">'+c.name+'</span>'+
                 '<span class="hub-init-init">'+c.initiative+'</span>'+
                 '<span class="hub-init-hp">❤️'+c.hitPoints+'</span>'+
                 '</div>';
        }).join("");

        /* Build target options */
        var enemies=cs.combatants.filter(function(c){return c.kind!=="pc"&&!c.defeated&&c.hitPoints>0;});
        var tgtHtml=enemies.map(function(e){return '<option value="'+e.id+'">'+e.name+' ('+e.hitPoints+' HP)</option>';}).join("");

        cont.innerHTML=
          '<div class="hub-turn-banner">'+
            '<div class="hub-turn-dot" style="background:'+dotColor+'">'+cur.name[0]+'</div>'+
            '<div class="hub-turn-info"><div class="hub-turn-name">'+cur.name+'</div>'+
            '<div class="hub-turn-sub">Round '+cs.round+' &nbsp;·&nbsp; '+(cur.hitPoints||0)+'/'+(cur.maxHitPoints||0)+' HP &nbsp;·&nbsp; Init '+cur.initiative+'</div>'+
            '</div></div>'+
          '<div class="hub-section-title">Ordine iniziativa</div>'+
          '<div class="hub-init-list">'+initHtml+'</div>'+
          (tgtHtml?'<div class="hub-section-title">Bersaglio</div>'+
            '<select id="hubTgtSel" class="hub-target-sel" style="width:100%;background:rgba(20,16,10,.8);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:#d8c7a3;margin-bottom:6px;font-family:inherit;">'+tgtHtml+'</select>':'')+
          '<div class="hub-combat-actions">'+
            '<button class="hub-ca-btn primary" id="hcAtk">⚔️ Attacca</button>'+
            '<button class="hub-ca-btn" id="hcNext">▶ Prossimo</button>'+
            '<button class="hub-ca-btn danger" id="hcEnd">⛔ Fine Combat.</button>'+
          '</div>';

        cont.querySelector("#hcAtk")&&cont.querySelector("#hcAtk").addEventListener("click",function(){
          /* sincronizza target */
          var sel=cont.querySelector("#hubTgtSel");
          if(sel){var mainSel=el("moduleFiveTargetSelect");if(mainSel){mainSel.value=sel.value;}}
          /* click sul pulsante originale che triggera resolveAttackStep1 */
          var btn=el("moduleFiveAttackButton"); if(btn) btn.click();
        });
        cont.querySelector("#hcNext")&&cont.querySelector("#hcNext").addEventListener("click",function(){
          if(window.UltimateVTTCombat) window.UltimateVTTCombat.nextTurn();
          setTimeout(renderCombatPanel,300);
        });
        cont.querySelector("#hcEnd")&&cont.querySelector("#hcEnd").addEventListener("click",function(){
          if(window.UltimateVTTCombat) window.UltimateVTTCombat.endCombat();
          setTimeout(renderCombatPanel,300);
        });
      }

      /* ── WIRING ── */
      function wire() {
        /* Back button */
        var back=el("hubBackBtn"); if(back) back.addEventListener("click",function(){closeHub();});
        if(el("hubNavVTT")) el("hubNavVTT").addEventListener("click",function(){closeHub();});

        /* Tab strip */
        document.querySelectorAll(".hub-tab[data-panel]").forEach(function(b){
          b.addEventListener("click",function(){ switchTab(b.dataset.panel); });
        });
        /* Bottom nav */
        document.querySelectorAll(".hub-nav-btn[data-nav]").forEach(function(b){
          b.addEventListener("click",function(){
            if(b.dataset.nav==="map"){ switchTab("chat"); /* mostra mappa espansa */ if(hub.map) setTimeout(function(){hub.map.invalidateSize({animate:false});},50); return; }
            switchTab(b.dataset.nav);
          });
        });

        /* Chat send */
        var sf=el("hubChatSendBtn"); if(sf) sf.addEventListener("click",sendHubChat);
        var ci=el("hubChatInputField"); if(ci) ci.addEventListener("keydown",function(e){ if(e.key==="Enter"){e.preventDefault();sendHubChat();} });

        /* Launch campagna */
        var cl=el("hubCampLaunch"); if(cl) cl.addEventListener("click",function(){
          if(window.VTTCampagna) window.VTTCampagna.activate();
        });

        /* Bottone Hub nel topbar VTT (aggiunto dinamicamente) */
        setTimeout(addHubButton, 400);
      }

      function addHubButton() {
        if (el("hubLaunchBtn")) return; /* già aggiunto */
        var ref = el("campLaunchBtn");
        if (!ref) { setTimeout(addHubButton, 300); return; }
        var btn = document.createElement("button");
        btn.id = "hubLaunchBtn";
        btn.className = "hud-button";
        btn.type = "button";
        btn.title = "Apri Hub Mobile (mappa + chat + scheda)";
        btn.style.cssText = "min-width:80px;border-color:rgba(200,155,60,.7);background:linear-gradient(180deg,rgba(60,42,8,.8),rgba(25,17,3,.9));color:#f0d472;font-weight:700;";
        btn.textContent = "📱 HUB";
        btn.addEventListener("click", openHub);
        ref.parentNode.insertBefore(btn, ref.nextSibling);
      }

      /* ── Auto-attivazione su mobile ── */
      function autoCheck() {
        if (window.innerWidth < 780 && !document.body.classList.contains("hub-active")) {
          openHub();
        }
      }

      document.addEventListener("DOMContentLoaded", function() {
        wire();
        /* piccolo delay per far caricare tutto prima di aprire l'hub */
        setTimeout(autoCheck, 600);
      });
      window.addEventListener("load", function() { if (window.innerWidth<780) openHub(); });

      /* ── Esporta per uso esterno ── */
      window.MobileHub = { open: openHub, close: closeHub, switchTab: switchTab };

    })();
    // === FINE MODULO MOBILE HUB ===

    // =====================================================================
    // MODULO CAMPAGNA — Esplorazione fullscreen di Ventimiglia
    // Joystick virtuale · PG si muove sulla mappa OSM reale · DM via Groq
    // Rilevamento zone POI · Nemici · Chat DM integrata
    // =====================================================================
    (function initCampagnaModule() {
      "use strict";

      /* ---- Costanti ---- */
      var CAMP_CENTER   = [43.7870, 7.6075];
      var CAMP_ZOOM     = 17;
      var JOY_RADIUS    = 33;   // px — max spostamento knob
      var SPEED_WALK    = 0.00018; // gradi/s a joystick pieno (≈20 m/s mappa)
      var SPEED_RUN     = 0.00052;
      var ZONE_RADIUS   = 60;   // metri — raggio trigger POI
      var GROQ_KEY_LS   = "ultimate-vtt-groq-api-key";
      var GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
      var GROQ_MODEL    = "llama-3.3-70b-versatile";

      /* ---- Narrazione DM per ogni POI ---- */
      var NARRATIONS = {
        "Città Alta":
          "🏰 Vi trovate di fronte alle mura medievali della Città Alta. I vicoli stretti odorano di pietra antica e leggende dimenticate. Qualcosa veglia tra queste pietre da secoli.",
        "Cattedrale Assunta":
          "⛪ La cattedrale si erge possente contro il cielo. Vetrate policrome filtrano la luce in raggi color sangue e oro. Una pace innaturale avvolge il luogo — o forse è paura.",
        "Porta Canarda":
          "🚪 Il portale di pietra calcarea è inciso con simboli che precedono Roma stessa. Passarci attraverso regala un brivido alla nuca — come attraversare il velo tra i mondi.",
        "Porta Nino Lamboglia":
          "🚪 Questa porta segna il confine tra la città viva e quella dei ricordi. Il vento sussurra nomi di coloro che non sono mai tornati.",
        "Teatro Romano":
          "🏛️ I resti del teatro romano affiorano tra l'erba come ossa di un gigante. Le gradinate vuote sembrano attendere un pubblico che non verrà mai più.",
        "Cattedrale S.Michele":
          "⛪ La cattedrale romanica di San Michele veglia sulla città bassa. Le sue pietre nere assorbono la luce come occhi di un antico guardiano.",
        "Piazza Repubblica":
          "🏛️ La piazza pulsa di vita. Mercanti, faccendieri e viaggiatori si mescolano tra i banchi. Occhi curiosi — e qualcuno di ostile — vi seguono tra la folla.",
        "Piazza C. Battisti":
          "🏛️ Una piazza più piccola, meno frequentata. Un vecchio siede su una panca e vi fissa come se vi riconoscesse da un sogno. Quando gli parlate, sorride e tace.",
        "Mercato Settimanale":
          "🛒 Il mercato del venerdì è un caos di colori e odori. Tra spezie esotiche e tessuti intrecciati si vendono cose che non dovrebbero essere in vendita. Attenzione alle tasche.",
        "Ospedale":
          "🏥 L'odore di erbe medicinali e qualcosa di più acre vi accoglie. I curatori sembrano troppo stanchi per rispondere alle domande. Qualcuno è stato portato qui di notte, mormorono.",
        "Biblioteca":
          "📚 Scaffali che toccano il soffitto custodiscono mappe, codici e pergamene polverose. Alcune mappe mostrano Ventimiglia come non esiste più — o forse come sarà.",
        "Municipio":
          "🏢 L'edificio del potere locale emana un'aria di segreti amministrativi. Gli impiegati vi scrutano con sospetto. Cosa volete da qui?",
        "Stazione FS":
          "🚂 La stazione è un crocevia di destini. I binari spariscono nel buio dei tunnel come serpenti di ferro. Un treno è fermo da tre giorni — nessuno sa perché.",
        "Porto Turistico":
          "⚓ Il porto odora di sale, catrame e avventura passata. Le barche cigolano come spiriti inquieti. Un marinaio tatuato vi osserva senza nascondere la diffidenza.",
        "Confine Italia-FR":
          "🛂 La frontiera separa due mondi. Di notte si vedono luci strane sul lato francese. I doganieri giurano che certi viaggiatori non arrivano mai dall'altra parte.",
        "Ponte sul Roya":
          "🌉 Il ponte sul Roya trema leggermente anche senza vento. Sotto, le acque scure scorrono veloci verso il mare. Qualcosa si muove nella corrente.",
        "Lungomare":
          "🏖️ Il mare apre un orizzonte infinito. Le onde si frangono ritmicamente come il respiro di un gigante addormentato. In lontananza, una sagoma che non dovrebbe esserci.",
        "Balzi Rossi":
          "🪨 Le grotte rossastre custodiscono memorie di centomila anni. I segni sulle pareti — non disegni rupestri, ma qualcosa di diverso — brillano debolmente nell'ombra.",
        "Giardini Hanbury":
          "🌿 Piante di ogni angolo del mondo crescono in questo giardino impossibile. Alcuni rami si muovono in assenza di vento. La bellezza qui nasconde qualcosa di selvatico.",
        "Capo Mortola":
          "🏔️ La scogliera precipita sul mare con indifferenza millenaria. Da qui si vede Monaco brillare come un gioiello — o una trappola. Il vento urla nomi sconosciuti.",
        "Foce del Roya":
          "🌊 Dove il fiume incontra il mare, le acque si mescolano in mulinelli scuri. Questo luogo ha visto annegare segreti. Qualcosa di metallico luccica sul fondo.",
        "Forte dell'Annunziata":
          "⚔️ Le mura del forte sono ancora solide, costruite per resistere ai secoli. Dentro, ombre che non appartengono all'ora del giorno si muovono tra le crepe. Non siete soli.",
        "Torre dell'Orologio":
          "⏰ L'orologio segna sempre la stessa ora. Qualunque sia il momento in cui lo guardate, le lancette non si spostano. Il campanaro, dicono, non esce più dalla torre."
      };

      /* ---- POI (da non duplicare con il modulo Ventimiglia, li ridefinisco in scope locale) ---- */
      var CAMP_POIS = [
        { name:"Città Alta",            lat:43.7879, lng:7.6059 },
        { name:"Cattedrale Assunta",    lat:43.7877, lng:7.6055 },
        { name:"Porta Canarda",         lat:43.7882, lng:7.6063 },
        { name:"Porta Nino Lamboglia",  lat:43.7875, lng:7.6051 },
        { name:"Teatro Romano",         lat:43.7874, lng:7.6048 },
        { name:"Cattedrale S.Michele",  lat:43.7871, lng:7.6048 },
        { name:"Piazza Repubblica",     lat:43.7868, lng:7.6074 },
        { name:"Piazza C. Battisti",    lat:43.7863, lng:7.6091 },
        { name:"Mercato Settimanale",   lat:43.7856, lng:7.6088 },
        { name:"Ospedale",              lat:43.7901, lng:7.6095 },
        { name:"Biblioteca",            lat:43.7865, lng:7.6069 },
        { name:"Municipio",             lat:43.7866, lng:7.6072 },
        { name:"Stazione FS",           lat:43.7861, lng:7.6107 },
        { name:"Porto Turistico",       lat:43.7836, lng:7.6052 },
        { name:"Confine Italia-FR",     lat:43.7889, lng:7.6369 },
        { name:"Ponte sul Roya",        lat:43.7862, lng:7.6043 },
        { name:"Lungomare",             lat:43.7842, lng:7.6072 },
        { name:"Balzi Rossi",           lat:43.7914, lng:7.5990 },
        { name:"Giardini Hanbury",      lat:43.7928, lng:7.5975 },
        { name:"Capo Mortola",          lat:43.7916, lng:7.5963 },
        { name:"Foce del Roya",         lat:43.7835, lng:7.6038 },
        { name:"Forte dell'Annunziata", lat:43.7888, lng:7.6044 },
        { name:"Torre dell'Orologio",   lat:43.7878, lng:7.6060 },
      ];

      /* ---- Spawn nemici per zone (quando PG si avvicina) ---- */
      var ENEMY_ZONES = [
        { name:"Guardia del Forte",  near:"Forte dell'Annunziata", lat:43.7886, lng:7.6048, col:"#8b2010", hp:18, maxHp:18 },
        { name:"Contrabbandiere",    near:"Porto Turistico",       lat:43.7834, lng:7.6056, col:"#4a3580", hp:12, maxHp:12 },
        { name:"Spirito Antico",     near:"Balzi Rossi",           lat:43.7912, lng:7.5993, col:"#2a6050", hp:14, maxHp:14 },
        { name:"Doganiere Corrotto", near:"Confine Italia-FR",     lat:43.7891, lng:7.6365, col:"#7a5010", hp:10, maxHp:10 },
      ];

      /* ---- Stato ---- */
      var state = {
        active:      false,
        mapReady:    false,
        cmap:        null,   // Leaflet map
        pgMarker:    null,
        enemyMarkers:[],
        pgPos:       { lat: 43.7861, lng: 7.6107 },
        pgColor:     "#5bb7c8",
        pgName:      "Eroe",
        pgHp:        28,
        pgMaxHp:     28,
        sprint:      false,
        currentZone: null,
        visited:     {},
        animId:      null,
        lastT:       null,
        joyDx:       0,
        joyDy:       0,
        groqHist:    [],
        typing:      false,
      };

      /* ── helper DOM ── */
      function el(id) { return document.getElementById(id); }

      /* ---- Lettura party dal VTT ---- */
      function syncPartyData() {
        var party = window.partyData;
        if (party && party.length > 0) {
          var v = window.vttReadPg(party[0], 0);
          state.pgName   = v.name;
          state.pgHp     = v.hp;
          state.pgMaxHp  = v.maxHp;
          state.pgColor  = v.color;
        }
        /* aggiorna HUD */
        if (el("campPgName"))   el("campPgName").textContent   = state.pgName;
        if (el("campPgDot"))    el("campPgDot").style.background = state.pgColor;
        if (el("campPgHpTxt")) el("campPgHpTxt").textContent   = state.pgHp + "/" + state.pgMaxHp;
        var pct = state.pgMaxHp > 0 ? Math.max(0, Math.min(100, (state.pgHp/state.pgMaxHp)*100)) : 0;
        if (el("campPgHpFill")) el("campPgHpFill").style.width = pct + "%";
        /* colore barra HP */
        if (el("campPgHpFill")) el("campPgHpFill").style.background = pct>50?"#5d9f45":pct>25?"#c89b3c":"#c9362b";
      }

      /* ---- DM chat ---- */
      function dmLog(txt, who) {
        /* who: 'dm' | 'pg' | 'sys' */
        var log = el("campDmLog"); if (!log) return;
        var row = document.createElement("div");
        row.className = "camp-dm-msg";
        var av = document.createElement("div");
        av.className = "camp-dm-avatar";
        av.textContent = who === "pg" ? "⭐" : who === "sys" ? "⚙" : "🧙";
        var bub = document.createElement("div");
        bub.className = "camp-dm-bubble" + (who === "pg" ? " pg" : who === "sys" ? " sys" : "");
        bub.textContent = txt;
        row.appendChild(av); row.appendChild(bub);
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
      }

      /* ---- Groq API ---- */
      function getGroqKey() {
        try { return localStorage.getItem(GROQ_KEY_LS) || ""; } catch(e) { return ""; }
      }
      function askGroqDm(systemCtx, userMsg, onDone) {
        var key = getGroqKey();
        if (!key) { onDone(null); return; }
        var partyCtx = "";
        try { if (window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.getPartySheetContext) partyCtx = "\n\nSCHEDE DEL PARTY (gia note, chiamali per nome, NON chiedere presentazioni):\n" + window.UltimateVTTCoreGameplay.getPartySheetContext(); } catch(e){}
        var messages = [{ role:"system", content: systemCtx + partyCtx }];
        /* aggiungi ultimi 4 scambi di storia */
        var hist = state.groqHist.slice(-4);
        hist.forEach(function(h) { messages.push(h); });
        messages.push({ role:"user", content: userMsg });
        fetch(GROQ_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type":"application/json", "Authorization":"Bearer "+key },
          body: JSON.stringify({ model: GROQ_MODEL, max_tokens: 140, temperature: 0.85, messages: messages })
        })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          var reply = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
          if (reply) {
            state.groqHist.push({ role:"user", content: userMsg });
            state.groqHist.push({ role:"assistant", content: reply });
            if (state.groqHist.length > 16) state.groqHist = state.groqHist.slice(-16);
          }
          onDone(reply || null);
        })
        .catch(function() { onDone(null); });
      }

      function dmSpeak(txt, poi) {
        /* prova Groq, altrimenti narrazione pre-scritta o generica */
        if (state.typing) return;
        state.typing = true;
        var sysPrompt = "Sei il Dungeon Master di una campagna D&D 5e ambientata a Ventimiglia, Italia, in stile dark fantasy medievale. " +
          "Il giocatore si chiama " + state.pgName + " (HP " + state.pgHp + "/" + state.pgMaxHp + "). " +
          "Rispondi in italiano, in 2-3 frasi evocative e concise. Non usare elenchi puntati.";
        var userMsg = poi
          ? "Il party è arrivato a: " + poi + ". Descrivi brevemente l'atmosfera."
          : txt;
        dmLog("…", "dm");
        askGroqDm(sysPrompt, userMsg, function(reply) {
          state.typing = false;
          var log = el("campDmLog"); if (!log) return;
          var last = log.lastElementChild;
          if (last) { var b = last.querySelector(".camp-dm-bubble"); if(b) b.textContent = reply || (NARRATIONS[poi] || txt || "Il DM osserva in silenzio."); }
          else { dmLog(reply || (NARRATIONS[poi] || txt || "Il DM osserva in silenzio."), "dm"); }
        });
      }

      function sendPlayerMsg() {
        var inp = el("campDmInput"); if (!inp) return;
        var txt = inp.value.trim(); if (!txt) return;
        inp.value = "";
        dmLog(txt, "pg");
        var poi = state.currentZone ? state.currentZone.name : null;
        var sysPrompt = "Sei il Dungeon Master di una campagna D&D 5e ambientata a Ventimiglia (Italia), dark fantasy. " +
          "Il giocatore si chiama " + state.pgName + " (HP " + state.pgHp + "/" + state.pgMaxHp + "). " +
          (poi ? "Si trova attualmente a: " + poi + ". " : "") +
          "Rispondi in italiano, 2-3 frasi, in prima persona come DM. Mantieni il tono oscuro e avventuroso. Non usare elenchi.";
        dmSpeak(null, null);
        state.typing = true;
        askGroqDm(sysPrompt, txt, function(reply) {
          state.typing = false;
          var log = el("campDmLog"); if (!log) return;
          var last = log.lastElementChild;
          if (last) { var b = last.querySelector(".camp-dm-bubble"); if(b) b.textContent = reply || "Il DM ti guarda con occhi che brillano nell'ombra e non risponde."; }
        });
      }

      /* ---- Banner zona ---- */
      var bannerTimer = null;
      function showBanner(txt) {
        var b = el("campZoneBanner"); if (!b) return;
        b.textContent = txt; b.classList.add("show");
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(function() { b.classList.remove("show"); }, 2800);
      }

      /* ---- Distanza Haversine (m) ---- */
      function distM(lat1, lng1, lat2, lng2) {
        var R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
        var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
                Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
                Math.sin(dLng/2)*Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      }

      /* ---- Rilevamento zone ---- */
      function checkZones() {
        if (!state.active) return;
        var pg = state.pgPos;
        var nearest = null, nearestD = Infinity;
        CAMP_POIS.forEach(function(poi) {
          var d = distM(pg.lat, pg.lng, poi.lat, poi.lng);
          if (d < ZONE_RADIUS && d < nearestD) { nearestD = d; nearest = poi; }
        });
        if (nearest && (!state.currentZone || state.currentZone.name !== nearest.name)) {
          state.currentZone = nearest;
          if (el("campZoneChip")) el("campZoneChip").textContent = "📍 " + nearest.name;
          showBanner("Entrato in: " + nearest.name);
          if (!state.visited[nearest.name]) {
            state.visited[nearest.name] = true;
            dmLog(NARRATIONS[nearest.name] || "Siete arrivati a " + nearest.name + ".", "dm");
            /* prova a migliorare con Groq in background */
            var key = getGroqKey();
            if (key) { dmSpeak(null, nearest.name); }
          }
        } else if (!nearest && state.currentZone) {
          state.currentZone = null;
          if (el("campZoneChip")) el("campZoneChip").textContent = "📍 Ventimiglia";
        }
      }

      /* ---- Creazione icona PG ---- */
      function makePgIcon() {
        var extra = (window.partyData && window.partyData.length > 1) ? (" +" + (window.partyData.length - 1)) : "";
        return window.L.divIcon({
          html: '<div class="camp-pg-marker">' +
                '<div class="camp-pg-dot" style="background:'+state.pgColor+'">'+state.pgName[0].toUpperCase()+'</div>' +
                '<div class="camp-pg-hpbar"><div class="camp-pg-hpfill" style="width:'+
                Math.max(0,Math.min(100,Math.round(state.pgHp/state.pgMaxHp*100)))+'%"></div></div>' +
                '<div class="camp-pg-name">'+state.pgName+extra+'</div>' +
                '</div>',
          className: "",
          iconSize: [120, 78],
          iconAnchor: [60, 23]
        });
      }

      /* ---- Nemici sulla mappa ---- */
      function addEnemyMarkers() {
        state.enemyMarkers.forEach(function(m) { state.cmap.removeLayer(m); });
        state.enemyMarkers = [];
        ENEMY_ZONES.forEach(function(en) {
          var icon = window.L.divIcon({
            html: '<div class="camp-enemy-dot" style="background:'+en.col+'">'+en.name[0]+'</div>',
            className:"", iconSize:[38,38], iconAnchor:[19,19]
          });
          var mk = window.L.marker([en.lat, en.lng], { icon:icon, zIndexOffset:200 });
          mk.on("click", function() {
            /* porta al combattimento nel VTT */
            dmLog("⚔️ " + en.name + " ti affronta! Apro il tracker di combattimento...", "sys");
            setTimeout(function() {
              deactivate();
              var fightBtn = document.getElementById("openCombatModalButton");
              if (fightBtn) fightBtn.click();
            }, 900);
          });
          mk.bindTooltip('<span style="font-size:12px;font-family:Georgia,serif;color:#f0a090">'+en.name+'<br>'+en.hp+'/'+en.maxHp+' HP</span>',
            { permanent:false, direction:"top", className:"camp-tt" });
          mk.addTo(state.cmap);
          state.enemyMarkers.push(mk);
        });
      }

      /* ---- Costruzione mappa Campagna ---- */
      function buildCampMap() {
        var div = el("campMapDiv");
        if (!div || state.cmap) { if(state.cmap) { state.cmap.invalidateSize({animate:false}); addEnemyMarkers(); } return; }

        /* ── CRITICO: forza dimensioni pixel esplicite prima di L.map() ── */
        var W = window.innerWidth, H = window.innerHeight;
        div.style.width  = W + "px";
        div.style.height = H + "px";

        state.cmap = window.L.map(div, {
          center: [state.pgPos.lat, state.pgPos.lng],
          zoom: CAMP_ZOOM,
          zoomControl: true,
          attributionControl: false,
          dragging: true,
          tap: true,
          tapTolerance: 15
        });

        /* Tile OSM — con handler che nasconde lo spinner */
        var tileLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          crossOrigin: true
        });
        tileLayer.on("tileload", function() {
          var ld = el("campMapLoading");
          if (ld) ld.classList.add("tiles-loaded");
        });
        tileLayer.addTo(state.cmap);

        /* Filtro dark sui tile */
        setTimeout(function() {
          var tp = div.querySelector(".leaflet-tile-pane");
          if (tp) tp.style.cssText = "filter:brightness(.66) saturate(.7) contrast(1.25) sepia(.2);";
        }, 800);

        /* Ripristina CSS dopo che Leaflet ha letto le dimensioni */
        setTimeout(function() {
          div.style.width = ""; div.style.height = "";
          if (state.cmap) state.cmap.invalidateSize({animate:false});
        }, 200);

        /* Zoom position */
        state.cmap.zoomControl.setPosition("bottomright");

        /* Scala */
        window.L.control.scale({ metric:true, imperial:false, position:"topleft" }).addTo(state.cmap);

        /* Marker PG */
        state.pgMarker = window.L.marker([state.pgPos.lat, state.pgPos.lng], {
          icon: makePgIcon(),
          zIndexOffset: 1000,
          interactive: false
        }).addTo(state.cmap);

        /* Griglia D&D leggera */
        var lines = [], latS = 1.5/111320, lngS = 1.5/(111320*Math.cos(43.787*Math.PI/180));
        for (var la=43.770; la<=43.800; la+=latS*20) lines.push([[la,7.590],[la,7.660]]);
        for (var lo=7.590; lo<=7.660; lo+=lngS*20) lines.push([[43.770,lo],[43.800,lo]]);
        window.L.polyline(lines, { color:"rgba(200,155,60,.15)", weight:0.6, interactive:false }).addTo(state.cmap);

        /* POI mini markers */
        CAMP_POIS.forEach(function(poi) {
          var icon = window.L.divIcon({
            html: '<div style="width:8px;height:8px;border-radius:50%;background:rgba(200,155,60,.75);border:1px solid rgba(200,155,60,.5);box-shadow:0 0 4px rgba(200,155,60,.4)"></div>',
            className:"", iconSize:[8,8], iconAnchor:[4,4]
          });
          window.L.marker([poi.lat, poi.lng], { icon:icon, interactive:true, zIndexOffset:100 })
            .on("click", function() { showBanner("📍 "+poi.name); })
            .bindTooltip('<span style="font-size:11px;font-family:Georgia,serif;color:#f0d472">'+poi.name+'</span>',
              { permanent:false, direction:"top" })
            .addTo(state.cmap);
        });

        /* Nemici */
        addEnemyMarkers();

        /* Doppio tap → teletrasporto PG */
        state.cmap.on("dblclick", function(e) {
          state.pgPos.lat = e.latlng.lat;
          state.pgPos.lng = e.latlng.lng;
          if (state.pgMarker) {
            state.pgMarker.setLatLng([state.pgPos.lat, state.pgPos.lng]);
            state.pgMarker.setIcon(makePgIcon());
          }
        });

        state.mapReady = true;
      }

      /* ---- Loop di movimento (requestAnimationFrame) ---- */
      function movementLoop(ts) {
        if (!state.active) return;
        if (state.lastT === null) state.lastT = ts;
        var dt = Math.min((ts - state.lastT) / 1000, 0.1);
        state.lastT = ts;

        var speed = state.sprint ? SPEED_RUN : SPEED_WALK;
        var dx = state.joyDx, dy = state.joyDy;
        var len = Math.sqrt(dx*dx + dy*dy);
        if (len > 0.01) {
          dx /= Math.max(len, 1); dy /= Math.max(len, 1);
          state.pgPos.lat -= dy * speed * dt;
          state.pgPos.lng += dx * speed * dt;
          /* muovi marker e mappa */
          if (state.pgMarker) {
            state.pgMarker.setLatLng([state.pgPos.lat, state.pgPos.lng]);
          }
          if (state.cmap) {
            state.cmap.panTo([state.pgPos.lat, state.pgPos.lng], { animate:false });
          }
        }
        state.animId = requestAnimationFrame(movementLoop);
      }

      /* ---- Joystick touch ---- */
      function initJoystick() {
        var base = el("campJoyBase"), knob = el("campJoyKnob");
        if (!base || !knob) return;
        var baseRect, active = false, touchId = null;
        var JR = JOY_RADIUS;

        function getCenter() {
          baseRect = base.getBoundingClientRect();
          return { x: baseRect.left + baseRect.width/2, y: baseRect.top + baseRect.height/2 };
        }
        function setKnob(ox, oy) {
          var len = Math.sqrt(ox*ox + oy*oy), r = Math.min(len, JR);
          var nx = len > 0.01 ? ox/len * r : 0, ny = len > 0.01 ? oy/len * r : 0;
          knob.style.transform = "translate(calc(-50% + "+nx+"px), calc(-50% + "+ny+"px))";
          state.joyDx = nx / JR;
          state.joyDy = ny / JR;
        }
        function resetKnob() {
          knob.style.transform = "translate(-50%, -50%)";
          state.joyDx = 0; state.joyDy = 0;
        }

        base.addEventListener("touchstart", function(e) {
          e.preventDefault();
          if (active) return;
          active = true; touchId = e.changedTouches[0].identifier;
          var c = getCenter(), t = e.changedTouches[0];
          setKnob(t.clientX - c.x, t.clientY - c.y);
        }, { passive:false });

        base.addEventListener("touchmove", function(e) {
          e.preventDefault();
          var t = null;
          for (var i=0; i<e.changedTouches.length; i++) if(e.changedTouches[i].identifier===touchId) t=e.changedTouches[i];
          if (!t) return;
          var c = getCenter();
          setKnob(t.clientX - c.x, t.clientY - c.y);
        }, { passive:false });

        function endTouch(e) {
          e.preventDefault();
          var found = false;
          for (var i=0; i<e.changedTouches.length; i++) if(e.changedTouches[i].identifier===touchId) found=true;
          if (!found) return;
          active = false; touchId = null; resetKnob();
        }
        base.addEventListener("touchend",    endTouch, { passive:false });
        base.addEventListener("touchcancel", endTouch, { passive:false });

        /* mouse fallback (desktop testing) */
        var mouseDown = false;
        base.addEventListener("mousedown", function(e) { mouseDown=true; var c=getCenter(); setKnob(e.clientX-c.x, e.clientY-c.y); });
        window.addEventListener("mousemove", function(e) { if(!mouseDown) return; var c=getCenter(); setKnob(e.clientX-c.x, e.clientY-c.y); });
        window.addEventListener("mouseup", function() { if(!mouseDown) return; mouseDown=false; resetKnob(); });
      }

      /* ---- Pulsanti azione ---- */
      function wireActionButtons() {
        var sprintBtn = el("campSprintBtn");
        var examBtn   = el("campExamBtn");
        var fightBtn  = el("campFightBtn");
        if (sprintBtn) sprintBtn.addEventListener("click", function() {
          state.sprint = !state.sprint;
          sprintBtn.classList.toggle("on", state.sprint);
          dmLog(state.sprint ? "⚡ Stai correndo." : "🚶 Stai camminando.", "sys");
        });
        if (examBtn) examBtn.addEventListener("click", function() {
          var poi = state.currentZone;
          if (poi) {
            dmLog("Esamini attentamente " + poi.name + "...", "pg");
            dmSpeak(null, poi.name);
          } else {
            dmLog("Osservi l'area intorno a te.", "pg");
            var key = getGroqKey();
            if (key) {
              dmSpeak("Cosa vedi intorno a te a Ventimiglia?", null);
            } else {
              dmLog("I vicoli di Ventimiglia ti circondano. Pietra antica, odore di salsedine, rumori lontani.", "dm");
            }
          }
        });
        if (fightBtn) fightBtn.addEventListener("click", function() {
          dmLog("⚔️ Entri in modalità combattimento...", "sys");
          setTimeout(function() {
            deactivate();
            var btn = document.getElementById("openCombatModalButton");
            if (btn) btn.click();
          }, 700);
        });

        var sendBtn = el("campDmSend"), inp = el("campDmInput");
        if (sendBtn) sendBtn.addEventListener("click", sendPlayerMsg);
        if (inp) {
          inp.addEventListener("keydown", function(e) {
            if (e.key === "Enter") { e.preventDefault(); sendPlayerMsg(); }
          });
          /* prevent map touch capture on input */
          inp.addEventListener("touchstart", function(e) { e.stopPropagation(); }, { passive:true });
          inp.addEventListener("touchmove",  function(e) { e.stopPropagation(); }, { passive:true });
        }

        var backBtn = el("campBackBtn");
        if (backBtn) backBtn.addEventListener("click", deactivate);
      }

      /* ---- Carica Leaflet se non già caricato ---- */
      function loadLeaflet(cb) {
        if (window.L) { cb(); return; }
        var css = document.createElement("link"); css.rel="stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);
        var scr = document.createElement("script");
        scr.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        scr.onload = cb;
        scr.onerror = function() { alert("Connessione internet necessaria per la mappa."); };
        document.head.appendChild(scr);
      }

      /* ---- Attivazione ---- */
      function activate() {
        var ov = el("campOverlay"); if (!ov) return;
        syncPartyData();

        /* Rendi l'overlay visibile PRIMA — così il div ottiene dimensioni reali */
        ov.classList.add("camp-active");
        state.active = true;
        state.lastT = null;

        /* Doppio requestAnimationFrame: aspettiamo che il browser abbia
           applicato il CSS e calcolato il layout prima di passare a Leaflet */
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            loadLeaflet(function() {
              buildCampMap();

              /* invalidateSize ripetuto — fondamentale su mobile:
                 il browser imposta le dimensioni reali in modo asincrono */
              var doResize = function() {
                if (!state.cmap) return;
                state.cmap.invalidateSize({ animate: false, pan: false });
                state.cmap.setView([state.pgPos.lat, state.pgPos.lng], CAMP_ZOOM, { animate: false });
              };
              doResize();
              setTimeout(doResize, 100);
              setTimeout(doResize, 350);
              setTimeout(doResize, 800);

              /* Messaggio iniziale DM */
              if (el("campDmLog") && el("campDmLog").children.length === 0) {
                var key = getGroqKey();
                if (key) {
                  state.typing = true;
                  var sys = "Sei il Dungeon Master di una campagna D&D 5e ambientata a Ventimiglia, Italia, in stile dark fantasy. Rispondi in italiano, 2-3 frasi evocative.";
                  dmLog("…", "dm");
                  askGroqDm(sys, "Il party inizia la campagna a Ventimiglia, vicino alla Stazione FS. Dai il benvenuto.", function(r) {
                    state.typing = false;
                    var log = el("campDmLog"); if (!log) return;
                    var last = log.lastElementChild;
                    if (last) { var b = last.querySelector(".camp-dm-bubble"); if(b) b.textContent = r || INTRO_MSG; }
                  });
                } else {
                  dmLog(INTRO_MSG, "dm");
                  dmLog("Configura GROQ nella topbar del VTT per risposte AI del DM.", "sys");
                }
              }

              /* Loop movimento e zone */
              if (state.animId) cancelAnimationFrame(state.animId);
              state.animId = requestAnimationFrame(movementLoop);
              if (state._zoneInterval) clearInterval(state._zoneInterval);
              state._zoneInterval = setInterval(checkZones, 600);

              /* Ricalcola su cambio orientamento (portrait↔landscape) */
              window.addEventListener("orientationchange", function onOrient() {
                if (!state.active) { window.removeEventListener("orientationchange", onOrient); return; }
                setTimeout(function() { state.cmap && state.cmap.invalidateSize({ animate:false }); }, 350);
              });
            });
          });
        });
      }

      var INTRO_MSG = "🗡️ Benvenuti a Ventimiglia, eroi. La città vi accoglie con il suo peso di storia e di ombre. La stazione alle vostre spalle sibila vapore come un drago meccanico addormentato. Dove vi dirigete?";

      /* ---- Disattivazione ---- */
      function deactivate() {
        var ov = el("campOverlay"); if (ov) ov.classList.remove("camp-active");
        state.active = false;
        if (state.animId) { cancelAnimationFrame(state.animId); state.animId = null; }
        if (state._zoneInterval) { clearInterval(state._zoneInterval); state._zoneInterval = null; }
        state.lastT = null; state.joyDx = 0; state.joyDy = 0;
      }

      /* ---- Wiring pulsante CAMPAGNA ---- */
      function wireLaunchBtn() {
        var btn = el("campLaunchBtn");
        if (!btn) { setTimeout(wireLaunchBtn, 200); return; }
        btn.addEventListener("click", function() {
          if (state.active) deactivate(); else activate();
        });
        wireActionButtons();
        initJoystick();
      }
      wireLaunchBtn();

      /* ---- Esporta API globale ---- */
      // Spawn nemici sulla mappa Ventimiglia vicino al PG (chiamato dal Master)
      function spawnEnemyNearPg(names) {
        if (!state.cmap || !window.L) return false;
        (names || []).forEach(function(nm) {
          var ang = Math.random() * Math.PI * 2;
          var dist = 0.0004 + Math.random() * 0.0006;
          var lat = state.pgPos.lat + Math.cos(ang) * dist;
          var lng = state.pgPos.lng + Math.sin(ang) * dist;
          var icon = window.L.divIcon({ html: '<div class="camp-enemy-dot" style="background:#8f1d18">' + (String(nm)[0] || "N") + '</div>', className: "", iconSize: [38,38], iconAnchor: [19,19] });
          var mk = window.L.marker([lat, lng], { icon: icon, zIndexOffset: 200 });
          mk.bindTooltip('<span style="font-size:12px;font-family:Georgia,serif;color:#f0a090">' + nm + '</span>', { permanent: false, direction: "top", className: "camp-tt" });
          mk.on("click", function() { var fb = document.getElementById("openCombatModalButton"); if (fb) { deactivate(); fb.click(); } });
          mk.addTo(state.cmap); state.enemyMarkers.push(mk);
        });
        try { showBanner("Nemici in arrivo!"); } catch (e) {}
        return true;
      }

      // Sposta il TOKEN del PG al luogo esatto nominato dal Master (match fuzzy sui POI)
      function findPlace(name) {
        if (!name) return null;
        function norm(s) { return String(s).toLowerCase().replace(/['`’]/g, " ").replace(/\s+/g, " ").trim(); }
        var nq = norm(name);
        if (!nq) return null;
        var best = null;
        CAMP_POIS.forEach(function(p) {
          if (best) return;
          var np = norm(p.name);
          if (nq.indexOf(np) >= 0 || np.indexOf(nq) >= 0) best = p;
        });
        if (!best) {
          var qwords = nq.split(" ").filter(function(w) { return w.length > 3; });
          CAMP_POIS.forEach(function(p) {
            if (best) return;
            var np = norm(p.name);
            if (qwords.some(function(w) { return np.indexOf(w) >= 0; })) best = p;
          });
        }
        return best;
      }
      function goToPlace(name) {
        var best = findPlace(name);
        if (!best) return null;
        state.pgPos.lat = best.lat; state.pgPos.lng = best.lng;
        var wasActive = state.active;
        if (!wasActive && typeof activate === "function") activate();
        window.setTimeout(function() {
          if (state.pgMarker) state.pgMarker.setLatLng([best.lat, best.lng]);
          if (state.cmap) state.cmap.panTo([best.lat, best.lng], { animate: true });
          state.currentZone = { name: best.name, lat: best.lat, lng: best.lng };
          if (el("campZoneChip")) el("campZoneChip").textContent = "📍 " + best.name;
        }, wasActive ? 60 : 750);
        try { showBanner("➜ " + best.name); } catch (e) {}
        try { dmLog(NARRATIONS[best.name] || ("Il party si dirige verso " + best.name + "."), "sys"); } catch (e) {}
        return best.name;
      }

      window.VTTCampagna = {
        activate: activate,
        deactivate: deactivate,
        isActive: function() { return !!state.active; },
        spawnEnemyNearPg: spawnEnemyNearPg,
        goToPlace: goToPlace,
        places: function() { return CAMP_POIS.map(function(p) { return p.name; }); },
        teleport: function(lat, lng) { state.pgPos.lat=lat; state.pgPos.lng=lng; }
      };

    })();
    // === FINE MODULO CAMPAGNA ===
  