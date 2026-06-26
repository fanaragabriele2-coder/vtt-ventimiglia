    // --- INIZIO MODULO 2 JS: MODALI, FILTRI STATUS, SCHEDA, HUD DADI ---
    (function initializeUltimateVttModuleTwo() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 2 richiede il Modulo 1.");
      }

      const statusLabels = {
        blinded: "Accecato",
        charmed: "Affascinato",
        frightened: "Spaventato",
        poisoned: "Avvelenato",
        prone: "Prono",
        stunned: "Stordito"
      };

      const moduleTwoState = {
        activeStatusFilters: new Set(),
        currentSheetTab: "core",
        diceHudTimer: 0
      };

      function getElement(id) {
        return document.getElementById(id);
      }

      function getAll(selector, root) {
        const searchRoot = root || document;
        return Array.prototype.slice.call(searchRoot.querySelectorAll(selector));
      }

      function clearNode(node) {
        while (node && node.firstChild) {
          node.removeChild(node.firstChild);
        }
      }

      function createTextElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) {
          element.className = className;
        }
        element.textContent = text;
        return element;
      }

      function createModalSection(titleText) {
        const section = document.createElement("section");
        const title = createTextElement("h3", "sheet-section-title", titleText);
        section.className = "sheet-section";
        section.appendChild(title);
        return section;
      }

      function createModalRow(labelText, valueText) {
        const row = document.createElement("div");
        const label = document.createElement("span");
        const value = document.createElement("span");
        row.className = "sheet-row";
        label.textContent = labelText;
        value.className = "sheet-row-value";
        value.textContent = valueText;
        row.appendChild(label);
        row.appendChild(value);
        return row;
      }

      function readInputValue(id, fallbackValue) {
        const input = getElement(id);
        if (!input) {
          return fallbackValue;
        }
        if (String(input.value).trim() === "") {
          return fallbackValue;
        }
        return String(input.value).trim();
      }

      function createSheetModalContent() {
        const fragment = document.createDocumentFragment();
        const resourceSection = createModalSection("Risorse personaggio");
        const notesSection = createModalSection("Note");
        const notesText = readInputValue("moduleTwoNotesInput", "Nessuna nota locale inserita.");

        resourceSection.appendChild(createModalRow("HP", readInputValue("moduleTwoHpInput", "10")));
        resourceSection.appendChild(createModalRow("CA", readInputValue("moduleTwoAcInput", "10")));
        resourceSection.appendChild(createModalRow("Velocita", readInputValue("moduleTwoSpeedInput", "9") + " m"));
        resourceSection.appendChild(createModalRow("Dadi Vita", readInputValue("moduleTwoHitDiceInput", "1d8")));
        notesSection.appendChild(createTextElement("p", "", notesText));

        fragment.appendChild(resourceSection);
        fragment.appendChild(notesSection);
        return fragment;
      }

      function createStatusModalContent() {
        const fragment = document.createDocumentFragment();
        const statusSection = createModalSection("Status attivi");
        const activeStatuses = Array.from(moduleTwoState.activeStatusFilters);

        if (activeStatuses.length === 0) {
          statusSection.appendChild(createTextElement("p", "", "Nessun filtro status attivo."));
        } else {
          activeStatuses.forEach(function appendStatusRow(statusKey) {
            const label = statusLabels[statusKey] || statusKey;
            statusSection.appendChild(createModalRow(label, "Filtro attivo"));
          });
        }

        fragment.appendChild(statusSection);
        return fragment;
      }

      function openModal(titleText, contentFragment, statusText) {
        const backdrop = getElement("modalBackdrop");
        const title = getElement("modalTitle");
        const body = getElement("modalBody");
        const statusPill = getElement("modalStatusPill");

        if (!backdrop || !title || !body || !statusPill) {
          return false;
        }

        title.textContent = titleText;
        statusPill.textContent = statusText;
        clearNode(body);
        body.appendChild(contentFragment);
        backdrop.classList.remove("hidden");
        backdrop.classList.add("is-open");
        backdrop.setAttribute("aria-hidden", "false");
        return true;
      }

      function closeModal() {
        const backdrop = getElement("modalBackdrop");
        if (!backdrop) {
          return false;
        }
        backdrop.classList.remove("is-open");
        backdrop.classList.add("hidden");
        backdrop.setAttribute("aria-hidden", "true");
        return true;
      }

      function setSheetTab(tabName) {
        const tabs = getAll(".sheet-tab");
        const panels = getAll(".sheet-panel");

        moduleTwoState.currentSheetTab = tabName;

        tabs.forEach(function updateTab(tab) {
          const isActive = tab.getAttribute("data-sheet-tab") === tabName;
          tab.classList.toggle("active", isActive);
          tab.setAttribute("aria-selected", isActive ? "true" : "false");
        });

        panels.forEach(function updatePanel(panel) {
          const isActive = panel.getAttribute("data-sheet-panel") === tabName;
          panel.classList.toggle("active", isActive);
        });
      }

      function renderStatusFilterButtons() {
        const buttons = getAll(".status-filter-button");

        buttons.forEach(function updateStatusButton(button) {
          const statusKey = button.getAttribute("data-status");
          const isActive = moduleTwoState.activeStatusFilters.has(statusKey);
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
      }

      function toggleStatusFilter(statusKey) {
        if (moduleTwoState.activeStatusFilters.has(statusKey)) {
          moduleTwoState.activeStatusFilters.delete(statusKey);
        } else {
          moduleTwoState.activeStatusFilters.add(statusKey);
        }

        renderStatusFilterButtons();

        if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
          const label = statusLabels[statusKey] || statusKey;
          const activeText = moduleTwoState.activeStatusFilters.has(statusKey) ? "attivato" : "disattivato";
          window.UltimateVTT.appendSystemLog("Filtro status " + label + " " + activeText + ".");
        }
      }

      function syncHpMeter() {
        const hpInput = getElement("moduleTwoHpInput");
        const meter = getElement("moduleTwoHpMeter");

        if (!hpInput || !meter) {
          return;
        }

        const numericHp = Number(hpInput.value);
        const clampedHp = Number.isFinite(numericHp) ? Math.max(0, Math.min(20, numericHp)) : 0;
        const percent = Math.round((clampedHp / 20) * 100);
        meter.style.setProperty("--meter-value", percent + "%");
      }

      function showDiceHud(sides, result) {
        const hud = getElement("diceHud");
        const face = getElement("diceHudFace");
        const label = getElement("diceHudLabel");
        const resultText = getElement("diceHudResult");

        if (!hud || !face || !label || !resultText) {
          return;
        }

        face.textContent = "D" + sides;
        label.textContent = "Tiro rapido";
        resultText.textContent = "D" + sides + " = " + result;
        hud.classList.add("is-visible");

        if (moduleTwoState.diceHudTimer) {
          window.clearTimeout(moduleTwoState.diceHudTimer);
        }

        moduleTwoState.diceHudTimer = window.setTimeout(function hideDiceHud() {
          hud.classList.remove("is-visible");
          moduleTwoState.diceHudTimer = 0;
        }, 2600);
      }

      function rollQuickDie(sides) {
        const result = Math.floor(Math.random() * sides) + 1;
        showDiceHud(sides, result);

        if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
          window.UltimateVTT.appendSystemLog("Tiro rapido D" + sides + ": " + result + ".");
        }

        return result;
      }

      function bindSheetTabs() {
        getAll(".sheet-tab").forEach(function bindSheetTab(tab) {
          tab.addEventListener("click", function handleSheetTabClick() {
            const tabName = tab.getAttribute("data-sheet-tab");
            setSheetTab(tabName);
          });
        });
      }

      function bindStatusFilters() {
        getAll(".status-filter-button").forEach(function bindStatusButton(button) {
          button.addEventListener("click", function handleStatusClick() {
            const statusKey = button.getAttribute("data-status");
            toggleStatusFilter(statusKey);
          });
        });
      }

      function bindDiceButtons() {
        getAll(".dice-button").forEach(function bindDiceButton(button) {
          button.addEventListener("click", function handleDiceClick() {
            const sides = Number(button.getAttribute("data-die"));
            if (Number.isFinite(sides) && sides > 0) {
              rollQuickDie(sides);
            }
          });
        });
      }

      function bindModalControls() {
        const openSheetButton = getElement("openSheetModalButton");
        const openStatusButton = getElement("openStatusModalButton");
        const closeButton = getElement("modalCloseButton");
        const confirmButton = getElement("modalConfirmButton");
        const backdrop = getElement("modalBackdrop");

        if (openSheetButton) {
          openSheetButton.addEventListener("click", function handleOpenSheetModal() {
            openModal("Scheda estesa", createSheetModalContent(), "Scheda locale");
          });
        }

        if (openStatusButton) {
          openStatusButton.addEventListener("click", function handleOpenStatusModal() {
            openModal("Filtri status", createStatusModalContent(), "Condizioni");
          });
        }

        if (closeButton) {
          closeButton.addEventListener("click", closeModal);
        }

        if (confirmButton) {
          confirmButton.addEventListener("click", closeModal);
        }

        if (backdrop) {
          backdrop.addEventListener("click", function handleBackdropClick(event) {
            if (event.target === backdrop) {
              closeModal();
            }
          });
        }

        document.addEventListener("keydown", function handleEscapeKey(event) {
          if (event.key === "Escape") {
            closeModal();
          }
        });
      }

      function bindMeterInputs() {
        const hpInput = getElement("moduleTwoHpInput");
        if (hpInput) {
          hpInput.addEventListener("input", syncHpMeter);
        }
      }

      function initializeModuleTwoUi() {
        bindSheetTabs();
        bindStatusFilters();
        bindDiceButtons();
        bindModalControls();
        bindMeterInputs();
        renderStatusFilterButtons();
        syncHpMeter();
      }

      window.UltimateVTTModule2 = {
        state: moduleTwoState,
        openModal: openModal,
        closeModal: closeModal,
        setSheetTab: setSheetTab,
        toggleStatusFilter: toggleStatusFilter,
        renderStatusFilterButtons: renderStatusFilterButtons,
        rollQuickDie: rollQuickDie,
        showDiceHud: showDiceHud,
        syncHpMeter: syncHpMeter
      };

      initializeModuleTwoUi();

      window.UltimateVTT.registerModule(2, {
        advancedCss: true,
        modalWindows: true,
        statusFilters: true,
        characterSheetUi: true,
        diceHud: true
      });

      window.UltimateVTT.appendSystemLog("Modulo 2 caricato: CSS avanzato, modali, status, scheda e HUD dadi.");
    })();
    // --- FINE MODULO 2 JS: MODALI, FILTRI STATUS, SCHEDA, HUD DADI ---
  