    // --- INIZIO MODULO 1 JS: AUTODIAGNOSI BASE ---
    (function initializeUltimateVttModuleOne() {
      "use strict";

      const moduleDefinitions = [
        { id: 1, name: "Root HTML, CSS Variables, Layout, Autodiagnosi", requiredGlobals: ["UltimateVTT"] },
        { id: 2, name: "CSS Avanzato", requiredGlobals: ["UltimateVTTModule2"] },
        { id: 3, name: "JS State Manager", requiredGlobals: ["UltimateVTTState"] },
        { id: 4, name: "JS Action & Inventory", requiredGlobals: ["UltimateVTTInventory"] },
        { id: 5, name: "JS Combat Engine", requiredGlobals: ["UltimateVTTCombat"] },
        { id: 6, name: "JS Canvas Rendering", requiredGlobals: ["UltimateVTTCanvas"] },
        { id: 7, name: "JS Token Physics", requiredGlobals: ["UltimateVTTTokenPhysics"] },
        { id: 8, name: "JS 3D Dice Engine", requiredGlobals: ["UltimateVTTDice3D"] },
        { id: 9, name: "JS Audio & Voice", requiredGlobals: ["UltimateVTTAudioVoice"] },
        { id: 10, name: "JS AI Bridge e Save System", requiredGlobals: ["UltimateVTTAIBridge"] }
      ];

      const moduleRegistry = {};
      const bootTime = new Date().toISOString();

      function getElement(id) {
        return document.getElementById(id);
      }

      function appendSystemLog(message) {
        const logBox = getElement("systemLog");
        const timestamp = new Date().toLocaleTimeString("it-IT");
        if (logBox) {
          logBox.textContent = "[" + timestamp + "] " + message + "\n" + logBox.textContent;
        }
      }

      function registerModule(id, payload) {
        const numericId = Number(id);
        const definition = moduleDefinitions.find(function findDefinition(moduleDefinition) {
          return moduleDefinition.id === numericId;
        });

        moduleRegistry[numericId] = {
          id: numericId,
          name: definition ? definition.name : "Modulo sconosciuto",
          loaded: true,
          loadedAt: new Date().toISOString(),
          payload: payload || {}
        };

        renderDiagnostics();
        return moduleRegistry[numericId];
      }

      function inspectModule(definition) {
        const registered = Boolean(moduleRegistry[definition.id] && moduleRegistry[definition.id].loaded);
        const globalsReady = definition.requiredGlobals.every(function inspectGlobal(globalName) {
          return Boolean(window[globalName]);
        });
        const ready = registered && globalsReady;

        return {
          id: definition.id,
          name: definition.name,
          registered: registered,
          globalsReady: globalsReady,
          ready: ready,
          status: ready ? "ready" : "pending"
        };
      }

      function runSelfDiagnostics() {
        const results = moduleDefinitions.map(function inspectDefinition(definition) {
          return inspectModule(definition);
        });

        const readyCount = results.filter(function countReady(result) {
          return result.ready;
        }).length;

        const summaryPill = getElement("diagnosticSummaryPill");
        const moduleCountPill = getElement("moduleCountPill");

        if (summaryPill) {
          summaryPill.textContent = "Diagnostica: " + readyCount + " / " + moduleDefinitions.length;
        }

        if (moduleCountPill) {
          moduleCountPill.textContent = readyCount + " / " + moduleDefinitions.length;
        }

        return {
          bootTime: bootTime,
          checkedAt: new Date().toISOString(),
          readyCount: readyCount,
          totalCount: moduleDefinitions.length,
          results: results
        };
      }

      function renderDiagnostics() {
        const panel = getElement("diagnosticPanel");
        const diagnostics = runSelfDiagnostics();

        if (!panel) {
          return diagnostics;
        }

        panel.innerHTML = "";

        diagnostics.results.forEach(function renderDiagnosticRow(result) {
          const row = document.createElement("div");
          const label = document.createElement("div");
          const status = document.createElement("div");

          row.className = "diagnostic-row";
          label.textContent = "Modulo " + result.id + ": " + result.name;
          status.className = "diagnostic-status " + result.status;
          status.textContent = result.ready ? "pronto" : "attesa";

          row.appendChild(label);
          row.appendChild(status);
          panel.appendChild(row);
        });

        return diagnostics;
      }

      function drawInitialCanvasFrame() {
        const canvas = getElement("vttCanvas");
        if (!canvas) {
          return;
        }

        const context = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        const gridSize = 48;

        context.clearRect(0, 0, width, height);
        context.fillStyle = "#0b0908";
        context.fillRect(0, 0, width, height);

        context.strokeStyle = "rgba(200, 155, 60, 0.18)";
        context.lineWidth = 1;

        for (let x = 0; x <= width; x += gridSize) {
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, height);
          context.stroke();
        }

        for (let y = 0; y <= height; y += gridSize) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(width, y);
          context.stroke();
        }

        context.fillStyle = "rgba(216, 199, 163, 0.88)";
        context.font = "24px Georgia, Times New Roman, serif";
        context.textAlign = "center";
        context.fillText("Ultimate VTT - Mappa pronta", width / 2, height / 2 - 8);

        context.fillStyle = "rgba(216, 199, 163, 0.58)";
        context.font = "14px Arial, Helvetica, sans-serif";
        context.fillText("I moduli Canvas, Token e Nebbia verranno innestati nelle fasi successive.", width / 2, height / 2 + 24);
      }

      function bindBaseControls() {
        const diagnosticRefreshButton = getElement("diagnosticRefreshButton");
        const fullscreenButton = getElement("fullscreenButton");

        if (diagnosticRefreshButton) {
          diagnosticRefreshButton.addEventListener("click", function handleDiagnosticRefresh() {
            renderDiagnostics();
            appendSystemLog("Autodiagnosi eseguita manualmente.");
          });
        }

        if (fullscreenButton) {
          fullscreenButton.addEventListener("click", function handleFullscreenToggle() {
            const root = getElement("app");
            if (!document.fullscreenElement && root && root.requestFullscreen) {
              root.requestFullscreen();
              appendSystemLog("Richiesta modalita schermo intero.");
            } else if (document.fullscreenElement && document.exitFullscreen) {
              document.exitFullscreen();
              appendSystemLog("Uscita da schermo intero.");
            }
          });
        }
      }

      const allyModeStorageKey = "ultimate-vtt-rog-ally-mode";

      function readRogAllyMode() {
        try {
          return window.localStorage.getItem(allyModeStorageKey) === "1";
        } catch (error) {
          return false;
        }
      }

      function writeRogAllyMode(enabled) {
        try {
          window.localStorage.setItem(allyModeStorageKey, enabled ? "1" : "0");
        } catch (error) {
          // LocalStorage puo essere bloccato in alcune WebView.
        }
      }

      function applyRogAllyMode(enabled, persist, announce) {
        const body = document.body;
        const button = getElement("rogAllyModeButton");
        const sessionPill = getElement("sessionModePill");

        if (!body) {
          return;
        }

        body.classList.toggle("mode-ally", enabled);
        body.classList.toggle("ally-mode", enabled);

        if (button) {
          button.classList.toggle("is-active", enabled);
          button.setAttribute("aria-pressed", enabled ? "true" : "false");
          button.textContent = enabled ? "CONSOLE ON" : "MODALITA CONSOLE";
          button.title = enabled ? "Disattiva Modalita Console" : "Attiva Modalita Console";
        }

        if (sessionPill) {
          sessionPill.textContent = enabled ? "Modalita: ROG Ally" : "Modalita: Tavolo Locale";
        }

        if (persist) {
          writeRogAllyMode(enabled);
        }

        if (announce) {
          appendSystemLog(enabled ? "Modalita ROG Ally attivata." : "Modalita ROG Ally disattivata.");
        }
      }

      function bindRogAllyControls() {
        const button = getElement("rogAllyModeButton");

        if (button) {
          button.addEventListener("click", function handleRogAllyModeClick() {
            applyRogAllyMode(!document.body.classList.contains("mode-ally"), true, true);
          });
        }
      }

      function initializeRogAllyMode() {
        applyRogAllyMode(readRogAllyMode(), false, false);
        bindRogAllyControls();
      }

      window.UltimateVTT = {
        version: "0.1.0-module-1",
        bootTime: bootTime,
        modules: moduleRegistry,
        moduleDefinitions: moduleDefinitions,
        registerModule: registerModule,
        runSelfDiagnostics: runSelfDiagnostics,
        renderDiagnostics: renderDiagnostics,
        appendSystemLog: appendSystemLog
      };

      registerModule(1, {
        rootHtml: true,
        cssVariables: true,
        baseLayout: true,
        selfDiagnostics: true
      });

      bindBaseControls();
      initializeRogAllyMode();
      drawInitialCanvasFrame();
      renderDiagnostics();
      appendSystemLog("Modulo 1 caricato e verificato.");
    })();
    // --- FINE MODULO 1 JS: AUTODIAGNOSI BASE ---
  