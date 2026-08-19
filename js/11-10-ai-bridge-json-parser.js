    // --- INIZIO MODULO 10 JS: AI BRIDGE JSON, PARSER COMANDI MASTER IA, LOCALSTORAGE SAVE/LOAD ---
    (function initializeUltimateVttModuleTen() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 10 richiede il Modulo 1.");
      }

      const storagePrefix = "ultimate-vtt-5e-save-";
      const exampleCommands = [
        { command: "speak", text: "La porta si apre con un respiro di polvere antica." },
        { command: "rollDie", sides: 20 },
        { command: "audioCue", cue: "spell" },
        { command: "moveToken", tokenId: "token-pc", cellX: 18, cellY: 12 },
        { command: "revealFog", cellX: 18, cellY: 12, radius: 4 },
        { command: "createSurface", type: "fuoco", cellX: 20, cellY: 12, radius: 1, rounds: 3 },
        { command: "setElevation", cellX: 22, cellY: 10, radius: 2, level: 1 },
        { command: "applyCondition", targetId: "npc-1", condition: "prono", rounds: 1 },
        { command: "clearCondition", targetId: "npc-1", condition: "prono" },
        { command: "damage", targetId: "npc-1", amount: 5 },
        { command: "save", slot: "slot1" }
      ];

      const bridgeState = {
        commandCount: 0,
        lastStatus: "ready",
        lastResult: "Nessun comando eseguito.",
        lastSaveSlot: "slot1",
        storageAvailable: true,
        exampleIndex: 0,
        history: [],
        maxHistory: 10
      };

      function getElement(id) {
        return document.getElementById(id);
      }

      function clearNode(node) {
        while (node && node.firstChild) {
          node.removeChild(node.firstChild);
        }
      }

      function cloneData(value) {
        return JSON.parse(JSON.stringify(value));
      }

      function clampNumber(value, minValue, maxValue, fallbackValue) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          return fallbackValue;
        }
        return Math.max(minValue, Math.min(maxValue, Math.trunc(numericValue)));
      }

      function setText(id, value) {
        const element = getElement(id);
        if (element) {
          element.textContent = String(value);
        }
      }

      function appendLog(message) {
        if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
          window.UltimateVTT.appendSystemLog(message);
        }
      }

      function storageKey(slot) {
        return storagePrefix + String(slot || "slot1");
      }

      function testStorage() {
        try {
          const testKey = storagePrefix + "probe";
          window.localStorage.setItem(testKey, "1");
          window.localStorage.removeItem(testKey);
          bridgeState.storageAvailable = true;
          return true;
        } catch (error) {
          bridgeState.storageAvailable = false;
          return false;
        }
      }

      function pushHistory(kind, text, ok) {
        bridgeState.history.unshift({
          kind: kind,
          text: text,
          ok: Boolean(ok),
          time: new Date().toLocaleTimeString("it-IT")
        });

        if (bridgeState.history.length > bridgeState.maxHistory) {
          bridgeState.history.length = bridgeState.maxHistory;
        }

        renderBridgeUi();
      }

      function readJsonInput() {
        const input = getElement("aiCommandInput");
        const raw = input ? input.value : "";

        try {
          return {
            ok: true,
            value: JSON.parse(raw)
          };
        } catch (error) {
          return {
            ok: false,
            error: error.message
          };
        }
      }

      function normalizeCommand(payload) {
        if (!payload || typeof payload !== "object") {
          return {
            command: "noop"
          };
        }

        if (payload.command) {
          return payload;
        }

        if (payload.action) {
          payload.command = payload.action;
          return payload;
        }

        if (payload.type) {
          payload.command = payload.type;
          return payload;
        }

        return payload;
      }

      function getModuleState(moduleName) {
        const moduleObject = window[moduleName];
        if (moduleObject && typeof moduleObject.getState === "function") {
          try {
            return moduleObject.getState();
          } catch (error) {
            return {
              error: error.message
            };
          }
        }
        return null;
      }

      function createSnapshot() {
        const notesInput = getElement("moduleTwoNotesInput");
        const aiInput = getElement("aiCommandInput");
        const diagnostics = window.UltimateVTT.runSelfDiagnostics ? window.UltimateVTT.runSelfDiagnostics() : null;

        return {
          schema: "ultimate-vtt-local-save",
          schemaVersion: 1,
          savedAt: new Date().toISOString(),
          appVersion: window.UltimateVTT.version,
          diagnostics: diagnostics,
          characterState: getModuleState("UltimateVTTState"),
          inventoryState: getModuleState("UltimateVTTInventory"),
          combatState: getModuleState("UltimateVTTCombat"),
          canvasState: getModuleState("UltimateVTTCanvas"),
          tokenState: getModuleState("UltimateVTTTokenPhysics"),
          diceState: getModuleState("UltimateVTTDice3D"),
          audioVoiceState: getModuleState("UltimateVTTAudioVoice"),
          coreGameplayState: getModuleState("UltimateVTTCoreGameplay"),
          ui: {
            notes: notesInput ? notesInput.value : "",
            aiCommandText: aiInput ? aiInput.value : ""
          }
        };
      }

      function applyCharacterSnapshot(snapshot) {
        if (snapshot.characterState && window.UltimateVTTState && window.UltimateVTTState.hydrate) {
          return window.UltimateVTTState.hydrate(snapshot.characterState);
        }
        return false;
      }

      function applyTokenSnapshot(snapshot) {
        if (!snapshot.tokenState || !window.UltimateVTTTokenPhysics) {
          return false;
        }

        const tokenModule = window.UltimateVTTTokenPhysics;
        const savedTokens = Array.isArray(snapshot.tokenState.tokens) ? snapshot.tokenState.tokens : [];
        const current = tokenModule.getState ? tokenModule.getState() : { tokens: [] };
        const savedIds = savedTokens.map(function mapTokenId(token) {
          return token.id;
        });

        if (Array.isArray(current.tokens)) {
          current.tokens.forEach(function removeExtraToken(token) {
            if (token.id !== "token-pc" && savedIds.indexOf(token.id) === -1 && tokenModule.removeToken) {
              tokenModule.removeToken(token.id);
            }
          });
        }

        savedTokens.forEach(function restoreToken(token) {
          const moduleState = tokenModule.getState ? tokenModule.getState() : { tokens: [] };
          const exists = moduleState.tokens && moduleState.tokens.some(function findToken(candidate) {
            return candidate.id === token.id;
          });

          if (exists && tokenModule.moveTokenToCell) {
            tokenModule.moveTokenToCell(token.id, token.cellX, token.cellY, false);
          } else if (!exists && tokenModule.addToken) {
            tokenModule.addToken(token.name, token.cellX, token.cellY, token.color);
          }
        });

        if (snapshot.tokenState.selectedTokenId && tokenModule.setSelectedToken) {
          tokenModule.setSelectedToken(snapshot.tokenState.selectedTokenId);
        }

        return true;
      }

      function applyCanvasSnapshot(snapshot) {
        if (!snapshot.canvasState || !window.UltimateVTTCanvas) {
          return false;
        }

        const canvasModule = window.UltimateVTTCanvas;
        const fogCells = Array.isArray(snapshot.canvasState.fogCells) ? snapshot.canvasState.fogCells : null;

        if (fogCells && canvasModule.fillFog && canvasModule.revealCircle && canvasModule.hideCircle) {
          canvasModule.fillFog(true);
          const columns = snapshot.canvasState.columns || 32;
          const rows = snapshot.canvasState.rows || 24;

          for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < columns; x += 1) {
              const index = y * columns + x;
              if (fogCells[index] === false) {
                canvasModule.revealCircle(x, y, 0);
              }
            }
          }
        }

        if (canvasModule.requestRender) {
          canvasModule.requestRender();
        }

        return true;
      }

      function applyCoreGameplaySnapshot(snapshot) {
        if (snapshot.coreGameplayState && window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.hydrate) {
          return window.UltimateVTTCoreGameplay.hydrate(snapshot.coreGameplayState);
        }
        return false;
      }

      function applyUiSnapshot(snapshot) {
        if (!snapshot.ui) {
          return false;
        }

        const notesInput = getElement("moduleTwoNotesInput");
        const aiInput = getElement("aiCommandInput");

        if (notesInput && typeof snapshot.ui.notes === "string") {
          notesInput.value = snapshot.ui.notes;
        }

        if (aiInput && typeof snapshot.ui.aiCommandText === "string") {
          aiInput.value = snapshot.ui.aiCommandText;
        }

        return true;
      }

      function applySnapshot(snapshot) {
        if (!snapshot || snapshot.schema !== "ultimate-vtt-local-save") {
          return {
            ok: false,
            message: "Snapshot non valido."
          };
        }

        const restored = {
          character: applyCharacterSnapshot(snapshot),
          canvas: applyCanvasSnapshot(snapshot),
          tokens: applyTokenSnapshot(snapshot),
          ui: applyUiSnapshot(snapshot),
          coreGameplay: applyCoreGameplaySnapshot(snapshot)
        };

        if (window.UltimateVTTDice3D && window.UltimateVTTDice3D.clearDice) {
          window.UltimateVTTDice3D.clearDice();
        }

        return {
          ok: true,
          message: "Snapshot caricato.",
          restored: restored
        };
      }

      function saveTable(slot) {
        if (!testStorage()) {
          bridgeState.lastStatus = "storage error";
          bridgeState.lastResult = "LocalStorage non disponibile.";
          pushHistory("save", bridgeState.lastResult, false);
          return {
            ok: false,
            message: bridgeState.lastResult
          };
        }

        const targetSlot = String(slot || bridgeState.lastSaveSlot || "slot1");
        const snapshot = createSnapshot();
        const serialized = JSON.stringify(snapshot);

        try {
          window.localStorage.setItem(storageKey(targetSlot), serialized);
          window.localStorage.setItem(storagePrefix + "last-slot", targetSlot);
          bridgeState.lastSaveSlot = targetSlot;
          bridgeState.lastStatus = "saved";
          bridgeState.lastResult = "Salvataggio completato in " + targetSlot + " (" + serialized.length + " bytes).";
          pushHistory("save", bridgeState.lastResult, true);
          appendLog(bridgeState.lastResult);
          return {
            ok: true,
            slot: targetSlot,
            bytes: serialized.length,
            snapshot: snapshot
          };
        } catch (error) {
          bridgeState.lastStatus = "save error";
          bridgeState.lastResult = error.message;
          pushHistory("save", error.message, false);
          return {
            ok: false,
            message: error.message
          };
        }
      }

      function loadTable(slot) {
        if (!testStorage()) {
          bridgeState.lastStatus = "storage error";
          bridgeState.lastResult = "LocalStorage non disponibile.";
          pushHistory("load", bridgeState.lastResult, false);
          return {
            ok: false,
            message: bridgeState.lastResult
          };
        }

        const targetSlot = String(slot || bridgeState.lastSaveSlot || "slot1");
        const raw = window.localStorage.getItem(storageKey(targetSlot));

        if (!raw) {
          bridgeState.lastStatus = "empty";
          bridgeState.lastResult = "Nessun salvataggio trovato in " + targetSlot + ".";
          pushHistory("load", bridgeState.lastResult, false);
          renderBridgeUi();
          return {
            ok: false,
            message: bridgeState.lastResult
          };
        }

        try {
          const snapshot = JSON.parse(raw);
          const result = applySnapshot(snapshot);
          bridgeState.lastSaveSlot = targetSlot;
          bridgeState.lastStatus = result.ok ? "loaded" : "load error";
          bridgeState.lastResult = result.message + " Slot: " + targetSlot + ".";
          pushHistory("load", bridgeState.lastResult, result.ok);
          appendLog(bridgeState.lastResult);
          return result;
        } catch (error) {
          bridgeState.lastStatus = "load error";
          bridgeState.lastResult = error.message;
          pushHistory("load", error.message, false);
          return {
            ok: false,
            message: error.message
          };
        }
      }

      function exportSnapshotToInput() {
        const input = getElement("aiCommandInput");
        const snapshot = createSnapshot();
        const serialized = JSON.stringify(snapshot, null, 2);

        if (input) {
          input.value = serialized;
        }

        bridgeState.lastStatus = "exported";
        bridgeState.lastResult = "Snapshot esportato nella textarea.";
        pushHistory("export", bridgeState.lastResult, true);
        return {
          ok: true,
          bytes: serialized.length,
          snapshot: snapshot
        };
      }

      function importSnapshotFromInput() {
        const parsed = readJsonInput();

        if (!parsed.ok) {
          return {
            ok: false,
            message: parsed.error
          };
        }

        return applySnapshot(parsed.value);
      }

      // Backup scaricabile: a differenza di saveTable() (solo localStorage del browner corrente),
      // produce un file .json che l'utente puo' conservare altrove e ripristinare anche su un
      // altro dispositivo/browser. Riusa lo stesso createSnapshot() del salvataggio in slot.
      function exportSnapshotToFile() {
        const snapshot = createSnapshot();
        const serialized = JSON.stringify(snapshot, null, 2);
        const slot = bridgeState.lastSaveSlot || "slot1";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = "vtt-ventimiglia-" + slot + "-" + timestamp + ".json";

        try {
          const blob = new Blob([serialized], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          bridgeState.lastStatus = "exported file";
          bridgeState.lastResult = "Backup scaricato: " + filename + " (" + serialized.length + " bytes).";
          pushHistory("export-file", bridgeState.lastResult, true);
          renderBridgeUi();
          return {
            ok: true,
            filename: filename,
            bytes: serialized.length,
            snapshot: snapshot
          };
        } catch (error) {
          bridgeState.lastStatus = "export error";
          bridgeState.lastResult = "Download backup fallito: " + error.message;
          pushHistory("export-file", bridgeState.lastResult, false);
          renderBridgeUi();
          return {
            ok: false,
            message: bridgeState.lastResult
          };
        }
      }

      // Ripristina da un file scelto dall'utente (es. <input type="file"> .files[0]). Asincrono
      // (FileReader): ritorna una Promise che risolve sempre con { ok, message, ... }, mai con un
      // throw, cosi' chi chiama puo' trattarla allo stesso modo di un esito non riuscito.
      function importSnapshotFromFile(file) {
        return new Promise(function resolveImport(resolve) {
          if (!file) {
            const message = "Nessun file selezionato.";
            bridgeState.lastStatus = "import error";
            bridgeState.lastResult = message;
            pushHistory("import-file", message, false);
            renderBridgeUi();
            resolve({ ok: false, message: message });
            return;
          }

          const reader = new FileReader();

          reader.onerror = function handleReadError() {
            const message = "Lettura del file di backup fallita.";
            bridgeState.lastStatus = "import error";
            bridgeState.lastResult = message;
            pushHistory("import-file", message, false);
            renderBridgeUi();
            resolve({ ok: false, message: message });
          };

          reader.onload = function handleReadDone() {
            let result;
            try {
              const parsed = JSON.parse(String(reader.result || ""));
              result = applySnapshot(parsed);
            } catch (error) {
              result = { ok: false, message: "File di backup non valido: " + error.message };
            }
            bridgeState.lastStatus = result.ok ? "imported file" : "import error";
            bridgeState.lastResult = result.ok ? (result.message + " (da file).") : result.message;
            pushHistory("import-file", bridgeState.lastResult, result.ok);
            renderBridgeUi();
            resolve(result);
          };

          reader.readAsText(file);
        });
      }

      function executeCommand(commandPayload) {
        const command = normalizeCommand(cloneData(commandPayload));
        const name = String(command.command || "noop");
        let result = {
          ok: true,
          command: name,
          message: "Comando eseguito."
        };

        if (name === "noop") {
          result.message = "Nessuna azione.";
        } else if (name === "speak") {
          if (window.UltimateVTTAudioVoice && window.UltimateVTTAudioVoice.speakMaster) {
            result.ok = window.UltimateVTTAudioVoice.speakMaster(command.text || "");
            result.message = result.ok ? "Voce Master avviata." : "Voce Master non disponibile.";
          } else {
            result.ok = false;
            result.message = "Modulo audio non disponibile.";
          }
        } else if (name === "audioCue") {
          result.ok = Boolean(window.UltimateVTTAudioVoice && window.UltimateVTTAudioVoice.playCue && window.UltimateVTTAudioVoice.playCue(command.cue || "ui"));
          result.message = "Cue audio: " + (command.cue || "ui") + ".";
        } else if (name === "rollDie") {
          result.value = window.UltimateVTTDice3D && window.UltimateVTTDice3D.launchDie ? window.UltimateVTTDice3D.launchDie(clampNumber(command.sides, 4, 20, 20)) : 0;
          result.ok = result.value > 0;
          result.message = "Dado lanciato: D" + clampNumber(command.sides, 4, 20, 20) + ".";
        } else if (name === "rollDiceSet") {
          const dice = Array.isArray(command.dice) ? command.dice : [20, 6];
          result.value = window.UltimateVTTDice3D && window.UltimateVTTDice3D.launchDiceSet ? window.UltimateVTTDice3D.launchDiceSet(dice) : [];
          result.ok = result.value.length > 0;
          result.message = "Set dadi lanciato.";
        } else if (name === "addNpc") {
          result.value = window.UltimateVTTCombat && window.UltimateVTTCombat.addNpc ? window.UltimateVTTCombat.addNpc(command.npcId || command.id || "bandit") : null;
          result.ok = Boolean(result.value);
          result.message = result.ok ? "PNG aggiunto." : "Impossibile aggiungere PNG.";
        } else if (name === "startCombat") {
          if (window.UltimateVTTCombat && window.UltimateVTTCombat.startCombat) {
            window.UltimateVTTCombat.startCombat();
          }
          result.message = "Combattimento avviato.";
        } else if (name === "endCombat") {
          if (window.UltimateVTTCombat && window.UltimateVTTCombat.endCombat) {
            window.UltimateVTTCombat.endCombat();
          }
          result.message = "Combattimento terminato.";
        } else if (name === "nextTurn") {
          if (window.UltimateVTTCombat && window.UltimateVTTCombat.nextTurn) {
            window.UltimateVTTCombat.nextTurn();
          }
          result.message = "Turno avanzato.";
        } else if (name === "rollInitiative") {
          result.value = window.UltimateVTTCombat && window.UltimateVTTCombat.rollAllInitiative ? window.UltimateVTTCombat.rollAllInitiative() : [];
          result.message = "Iniziativa tirata.";
        } else if (name === "attack") {
          if (window.UltimateVTTCombat && window.UltimateVTTCombat.setRollMode && command.rollMode) {
            window.UltimateVTTCombat.setRollMode(command.rollMode);
          }
          result.value = window.UltimateVTTCombat && window.UltimateVTTCombat.resolveAttack ? window.UltimateVTTCombat.resolveAttack(Boolean(command.critical)) : null;
          result.ok = Boolean(result.value);
          result.message = result.ok ? "Attacco risolto." : "Attacco non risolto.";
        } else if (name === "damage") {
          result.ok = Boolean(window.UltimateVTTCombat && window.UltimateVTTCombat.applyDamageToCombatant && window.UltimateVTTCombat.applyDamageToCombatant(command.targetId || "pc-local", clampNumber(command.amount, 0, 9999, 0)));
          result.message = "Danno applicato.";
        } else if (name === "heal") {
          result.ok = Boolean(window.UltimateVTTCombat && window.UltimateVTTCombat.healCombatant && window.UltimateVTTCombat.healCombatant(command.targetId || "pc-local", clampNumber(command.amount, 0, 9999, 0)));
          result.message = "Cura applicata.";
        } else if (name === "moveToken") {
          result.ok = Boolean(window.UltimateVTTTokenPhysics && window.UltimateVTTTokenPhysics.moveTokenToCell && window.UltimateVTTTokenPhysics.moveTokenToCell(command.tokenId || "token-pc", clampNumber(command.cellX, 0, 999, 0), clampNumber(command.cellY, 0, 999, 0), true));
          result.message = "Token mosso.";
        } else if (name === "addToken") {
          result.value = window.UltimateVTTTokenPhysics && window.UltimateVTTTokenPhysics.addToken ? window.UltimateVTTTokenPhysics.addToken(command.name || "Token IA", clampNumber(command.cellX, 0, 999, 16), clampNumber(command.cellY, 0, 999, 12), command.color || "#5bb7c8") : null;
          result.ok = Boolean(result.value);
          result.message = result.ok ? "Token aggiunto." : "Token non aggiunto.";
        } else if (name === "revealFog") {
          if (window.UltimateVTTCanvas && window.UltimateVTTCanvas.revealCircle) {
            window.UltimateVTTCanvas.revealCircle(clampNumber(command.cellX, 0, 999, 16), clampNumber(command.cellY, 0, 999, 12), clampNumber(command.radius, 0, 16, 3));
          }
          result.message = "Nebbia rivelata.";
        } else if (name === "createSurface") {
          if (window.UltimateVTTSurfaces && typeof window.UltimateVTTSurfaces.creaSuperficie === "function") {
            var esitoSuperficie = window.UltimateVTTSurfaces.creaSuperficie(
              command.type || "fuoco",
              clampNumber(command.cellX, 0, 999, 16),
              clampNumber(command.cellY, 0, 999, 12),
              clampNumber(command.radius, 0, 16, 1),
              clampNumber(command.rounds, 1, 20, 3)
            );
            result.ok = Boolean(esitoSuperficie && esitoSuperficie.ok);
            result.message = (esitoSuperficie && esitoSuperficie.message) || (result.ok ? "Superficie creata." : "Superficie non creata.");
          } else {
            result.ok = false;
            result.message = "Modulo superfici non disponibile.";
          }
        } else if (name === "setElevation") {
          if (window.UltimateVTTElevation && typeof window.UltimateVTTElevation.impostaElevazioneArea === "function") {
            var esitoElevazione = window.UltimateVTTElevation.impostaElevazioneArea(
              clampNumber(command.cellX, 0, 999, 16),
              clampNumber(command.cellY, 0, 999, 12),
              clampNumber(command.radius, 0, 16, 1),
              clampNumber(command.level, -5, 5, 1)
            );
            result.ok = Boolean(esitoElevazione && esitoElevazione.ok);
            result.message = (esitoElevazione && esitoElevazione.message) || (result.ok ? "Quota impostata." : "Quota non impostata.");
          } else {
            result.ok = false;
            result.message = "Modulo elevazione non disponibile.";
          }
        } else if (name === "applyCondition") {
          if (window.UltimateVTTConditions && typeof window.UltimateVTTConditions.applicaCondizione === "function") {
            var esitoCondizione = window.UltimateVTTConditions.applicaCondizione(
              command.targetId || "pc-local",
              command.condition || "",
              clampNumber(command.rounds, 1, 20, 1)
            );
            result.ok = Boolean(esitoCondizione && esitoCondizione.ok);
            result.message = (esitoCondizione && esitoCondizione.message) || (result.ok ? "Condizione applicata." : "Condizione non applicata.");
          } else {
            result.ok = false;
            result.message = "Modulo condizioni non disponibile.";
          }
        } else if (name === "clearCondition") {
          if (window.UltimateVTTConditions && typeof window.UltimateVTTConditions.rimuoviCondizione === "function") {
            var esitoRimozione = window.UltimateVTTConditions.rimuoviCondizione(command.targetId || "pc-local", command.condition || "");
            result.ok = Boolean(esitoRimozione && esitoRimozione.ok);
            result.message = (esitoRimozione && esitoRimozione.message) || (result.ok ? "Condizione rimossa." : "Condizione non rimossa.");
          } else {
            result.ok = false;
            result.message = "Modulo condizioni non disponibile.";
          }
        } else if (name === "hideFog") {
          if (window.UltimateVTTCanvas && window.UltimateVTTCanvas.hideCircle) {
            window.UltimateVTTCanvas.hideCircle(clampNumber(command.cellX, 0, 999, 16), clampNumber(command.cellY, 0, 999, 12), clampNumber(command.radius, 0, 16, 3));
          }
          result.message = "Nebbia nascosta.";
        } else if (name === "setFogMode") {
          result.ok = Boolean(window.UltimateVTTCanvas && window.UltimateVTTCanvas.setFogMode && window.UltimateVTTCanvas.setFogMode(command.mode || "inspect"));
          result.message = "Modo fog impostato.";
        } else if (name === "setAbility") {
          result.ok = Boolean(window.UltimateVTTState && window.UltimateVTTState.setAbilityScore && window.UltimateVTTState.setAbilityScore(command.ability || "str", clampNumber(command.score, 1, 30, 10)));
          result.message = "Statistica aggiornata.";
        } else if (name === "setHp") {
          result.ok = Boolean(window.UltimateVTTState && window.UltimateVTTState.setCurrentHp && window.UltimateVTTState.setCurrentHp(clampNumber(command.current, 0, 999, 10)));
          result.message = "HP aggiornati.";
        } else if (name === "setAc") {
          result.ok = Boolean(window.UltimateVTTState && window.UltimateVTTState.setArmorClass && window.UltimateVTTState.setArmorClass(clampNumber(command.armorClass, 1, 99, 10)));
          result.message = "CA aggiornata.";
        } else if (name === "note") {
          const notesInput = getElement("moduleTwoNotesInput");
          if (notesInput) {
            notesInput.value = String(command.text || "");
          }
          result.message = "Nota aggiornata.";
        } else if (name === "save") {
          result = saveTable(command.slot || bridgeState.lastSaveSlot);
          result.command = name;
        } else if (name === "load") {
          result = loadTable(command.slot || bridgeState.lastSaveSlot);
          result.command = name;
        } else if (name === "export") {
          result = exportSnapshotToInput();
          result.command = name;
        } else if (name === "import") {
          result = importSnapshotFromInput();
          result.command = name;
        } else {
          result.ok = false;
          result.message = "Comando non riconosciuto: " + name + ".";
        }

        bridgeState.commandCount += 1;
        bridgeState.lastStatus = result.ok ? "ok" : "error";
        bridgeState.lastResult = result.message || "Comando eseguito.";
        pushHistory(name, bridgeState.lastResult, result.ok);
        appendLog("AI Bridge: " + name + " -> " + bridgeState.lastResult);
        return result;
      }

      function executePayload(payload) {
        const commands = Array.isArray(payload) ? payload : payload && Array.isArray(payload.commands) ? payload.commands : [payload];
        const results = commands.map(function executeSingleCommand(command) {
          return executeCommand(command);
        });

        return {
          ok: results.every(function checkResult(result) {
            return result.ok;
          }),
          results: results
        };
      }

      function executeInput() {
        const parsed = readJsonInput();

        if (!parsed.ok) {
          bridgeState.lastStatus = "json error";
          bridgeState.lastResult = parsed.error;
          pushHistory("json", parsed.error, false);
          return {
            ok: false,
            message: parsed.error
          };
        }

        const result = executePayload(parsed.value);
        bridgeState.lastStatus = result.ok ? "ok" : "error";
        bridgeState.lastResult = result.results.map(function mapMessage(item) {
          return item.command + ": " + item.message;
        }).join(" | ");
        renderBridgeUi();
        return result;
      }

      function cycleExample() {
        const input = getElement("aiCommandInput");
        const example = exampleCommands[bridgeState.exampleIndex % exampleCommands.length];
        bridgeState.exampleIndex += 1;

        if (input) {
          input.value = JSON.stringify(example, null, 2);
        }

        bridgeState.lastStatus = "example";
        bridgeState.lastResult = "Esempio caricato: " + example.command + ".";
        renderBridgeUi();
      }

      function renderHistory() {
        const list = getElement("aiCommandListSummary");
        if (!list) {
          return;
        }

        clearNode(list);

        bridgeState.history.slice(0, 5).forEach(function appendCommandHistory(entry) {
          const row = document.createElement("div");
          const kind = document.createElement("span");
          const text = document.createElement("span");

          row.className = "ai-command-row";
          kind.className = "ai-command-kind";
          text.className = "ai-command-text";
          kind.textContent = entry.kind;
          text.textContent = entry.time + " | " + (entry.ok ? "ok" : "err") + " | " + entry.text;
          row.appendChild(kind);
          row.appendChild(text);
          list.appendChild(row);
        });
      }

      function renderBridgeUi() {
        const slotSelect = getElement("saveSlotSelect");

        if (slotSelect && slotSelect.value !== bridgeState.lastSaveSlot) {
          slotSelect.value = bridgeState.lastSaveSlot;
        }

        setText("aiBridgeStatus", bridgeState.lastStatus);
        setText("aiBridgeResult", bridgeState.lastResult);
        setText("aiCommandCountSummary", bridgeState.commandCount);
        setText("saveStatusSummary", bridgeState.lastSaveSlot);
        setText("storageStatusSummary", bridgeState.storageAvailable ? "local" : "blocked");
        setText("aiModePill", "AI: " + bridgeState.lastStatus);
        renderHistory();
      }

      function bindBridgeControls() {
        const exampleButton = getElement("aiExampleButton");
        const executeButton = getElement("aiExecuteButton");
        const exportButton = getElement("aiExportButton");
        const saveButton = getElement("saveTableButton");
        const loadButton = getElement("loadTableButton");
        const slotSelect = getElement("saveSlotSelect");
        const downloadBackupButton = getElement("downloadBackupButton");
        const restoreBackupButton = getElement("restoreBackupButton");
        const restoreBackupInput = getElement("restoreBackupInput");

        if (exampleButton) {
          exampleButton.addEventListener("click", cycleExample);
        }

        if (executeButton) {
          executeButton.addEventListener("click", executeInput);
        }

        if (exportButton) {
          exportButton.addEventListener("click", exportSnapshotToInput);
        }

        if (saveButton) {
          saveButton.addEventListener("click", function handleSaveClick() {
            saveTable(slotSelect ? slotSelect.value : bridgeState.lastSaveSlot);
          });
        }

        if (loadButton) {
          loadButton.addEventListener("click", function handleLoadClick() {
            loadTable(slotSelect ? slotSelect.value : bridgeState.lastSaveSlot);
          });
        }

        if (slotSelect) {
          slotSelect.addEventListener("change", function handleSlotChange() {
            bridgeState.lastSaveSlot = slotSelect.value;
            renderBridgeUi();
          });
        }

        if (downloadBackupButton) {
          downloadBackupButton.addEventListener("click", exportSnapshotToFile);
        }

        if (restoreBackupButton && restoreBackupInput) {
          restoreBackupButton.addEventListener("click", function handleRestoreClick() {
            restoreBackupInput.click();
          });
        }

        if (restoreBackupInput) {
          restoreBackupInput.addEventListener("change", function handleRestoreFileChosen() {
            const file = restoreBackupInput.files && restoreBackupInput.files[0];
            importSnapshotFromFile(file).then(function resetInput() {
              restoreBackupInput.value = ""; // permette di ricaricare lo stesso file una seconda volta
            });
          });
        }
      }

      function initializeBridge() {
        testStorage();
        bindBridgeControls();
        renderBridgeUi();
      }

      window.UltimateVTTAIBridge = {
        getState: function getBridgeState() {
          return cloneData(bridgeState);
        },
        createSnapshot: createSnapshot,
        applySnapshot: applySnapshot,
        saveTable: saveTable,
        loadTable: loadTable,
        exportSnapshotToInput: exportSnapshotToInput,
        importSnapshotFromInput: importSnapshotFromInput,
        exportSnapshotToFile: exportSnapshotToFile,
        importSnapshotFromFile: importSnapshotFromFile,
        executeCommand: executeCommand,
        executePayload: executePayload,
        executeInput: executeInput,
        renderBridgeUi: renderBridgeUi
      };

      initializeBridge();

      window.UltimateVTT.registerModule(10, {
        aiBridge: true,
        jsonParser: true,
        localStorage: bridgeState.storageAvailable,
        saveLoad: true,
        commands: exampleCommands.length
      });

      appendLog("Modulo 10 caricato: AI Bridge JSON e LocalStorage Save/Load.");
    })();
    // --- FINE MODULO 10 JS: AI BRIDGE JSON, PARSER COMANDI MASTER IA, LOCALSTORAGE SAVE/LOAD ---
  