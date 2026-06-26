    // --- INIZIO MODULO 7 JS: TOKEN PHYSICS, DRAG&DROP CANVAS, SNAP-TO-GRID, DISTANZE ---
    (function initializeUltimateVttModuleSeven() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 7 richiede il Modulo 1.");
      }

      if (!window.UltimateVTTCanvas) {
        throw new Error("UltimateVTT Module 7 richiede il Modulo 6.");
      }

      const canvas = document.getElementById("vttCanvas");
      if (!canvas) {
        throw new Error("UltimateVTT Module 7 non trova #vttCanvas.");
      }

      const tokenState = {
        snapToGrid: true,
        selectedTokenId: "token-pc",
        dragTokenId: null,
        dragPointerId: null,
        dragStartCell: null,
        dragStartWorld: null,
        lastMoveDistanceMeters: 0,
        lastMoveEuclideanMeters: 0,
        nextTokenNumber: 4,
        lastFrameTime: performance.now(),
        tokens: [
          { id: "token-pc", name: "Eroe Locale", kind: "pc", color: "#c89b3c", ringColor: "#f0ddb3", cellX: 16, cellY: 12, x: 0, y: 0, targetX: 0, targetY: 0, radiusScale: 0.38, dragging: false, hidden: false },
          { id: "token-npc-1", name: "Goblin", kind: "npc", color: "#5d9f45", ringColor: "#9fe087", cellX: 20, cellY: 12, x: 0, y: 0, targetX: 0, targetY: 0, radiusScale: 0.36, dragging: false, hidden: false },
          { id: "token-npc-2", name: "Bandito", kind: "npc", color: "#8f1d18", ringColor: "#ff8b83", cellX: 22, cellY: 14, x: 0, y: 0, targetX: 0, targetY: 0, radiusScale: 0.36, dragging: false, hidden: false },
          { id: "token-npc-3", name: "Scheletro", kind: "npc", color: "#707070", ringColor: "#d8c7a3", cellX: 20, cellY: 16, x: 0, y: 0, targetX: 0, targetY: 0, radiusScale: 0.36, dragging: false, hidden: false }
        ]
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

      function getGridMetrics() {
        return window.UltimateVTTCanvas.getGridMetrics();
      }

      function getToken(tokenId) {
        return tokenState.tokens.find(function findToken(token) {
          return token.id === tokenId;
        }) || null;
      }

      function getSelectedToken() {
        return getToken(tokenState.selectedTokenId);
      }

      function getCellCenter(cellX, cellY) {
        return window.UltimateVTTCanvas.cellToWorldCenter(cellX, cellY);
      }

      function syncTokenWorldFromCells(token) {
        const center = getCellCenter(token.cellX, token.cellY);
        token.x = center.x;
        token.y = center.y;
        token.targetX = center.x;
        token.targetY = center.y;
      }

      function initializeTokenPositions() {
        tokenState.tokens.forEach(function initializeToken(token) {
          syncTokenWorldFromCells(token);
        });
      }

      function worldToCell(worldX, worldY) {
        const metrics = getGridMetrics();
        return {
          cellX: Math.floor(worldX / metrics.gridSize),
          cellY: Math.floor(worldY / metrics.gridSize)
        };
      }

      function clampCell(cellX, cellY) {
        const metrics = getGridMetrics();
        return {
          cellX: clampNumber(cellX, 0, metrics.columns - 1, 0),
          cellY: clampNumber(cellY, 0, metrics.rows - 1, 0)
        };
      }

      function calculateGridDistanceMeters(fromCellX, fromCellY, toCellX, toCellY) {
        const metrics = getGridMetrics();
        const dx = Math.abs(toCellX - fromCellX);
        const dy = Math.abs(toCellY - fromCellY);
        return Math.max(dx, dy) * metrics.cellMeters;
      }

      function calculateEuclideanDistanceMeters(fromCellX, fromCellY, toCellX, toCellY) {
        const metrics = getGridMetrics();
        const dx = Math.abs(toCellX - fromCellX);
        const dy = Math.abs(toCellY - fromCellY);
        return Math.sqrt(dx * dx + dy * dy) * metrics.cellMeters;
      }

      function updateMoveDistance(token) {
        if (!tokenState.dragStartCell || !token) {
          tokenState.lastMoveDistanceMeters = 0;
          tokenState.lastMoveEuclideanMeters = 0;
          return;
        }

        tokenState.lastMoveDistanceMeters = calculateGridDistanceMeters(tokenState.dragStartCell.cellX, tokenState.dragStartCell.cellY, token.cellX, token.cellY);
        tokenState.lastMoveEuclideanMeters = calculateEuclideanDistanceMeters(tokenState.dragStartCell.cellX, tokenState.dragStartCell.cellY, token.cellX, token.cellY);
      }

      function formatMeters(value) {
        return (Math.round(value * 10) / 10).toFixed(1) + " m";
      }

      function hitTestToken(clientX, clientY) {
        const world = window.UltimateVTTCanvas.screenToWorld(clientX, clientY);
        const metrics = getGridMetrics();

        for (let index = tokenState.tokens.length - 1; index >= 0; index -= 1) {
          const token = tokenState.tokens[index];
          const radius = metrics.gridSize * token.radiusScale;
          const dx = world.x - token.x;
          const dy = world.y - token.y;
          if (dx * dx + dy * dy <= radius * radius) {
            return {
              token: token,
              world: world
            };
          }
        }

        return {
          token: null,
          world: world
        };
      }

      function setSelectedToken(tokenId) {
        const token = getToken(tokenId);
        const select = getElement("tokenSelect");

        if (!token) {
          return false;
        }

        tokenState.selectedTokenId = tokenId;
        if (select && select.value !== tokenId) {
          select.value = tokenId;
        }
        renderTokenUi();
        window.UltimateVTTCanvas.requestRender();
        return true;
      }

      function moveTokenToCell(tokenId, cellX, cellY, animated) {
        const token = getToken(tokenId);
        const clamped = clampCell(cellX, cellY);
        const center = getCellCenter(clamped.cellX, clamped.cellY);

        if (!token) {
          return false;
        }

        if (window.UltimateVTTCanvas.isTerrainBlocking(clamped.cellX, clamped.cellY)) {
          appendLog("Movimento bloccato da terreno: " + token.name + ".");
          return false;
        }

        token.cellX = clamped.cellX;
        token.cellY = clamped.cellY;
        token.targetX = center.x;
        token.targetY = center.y;

        if (!animated) {
          token.x = center.x;
          token.y = center.y;
        }

        renderTokenUi();
        window.UltimateVTTCanvas.requestRender();
        return true;
      }

      function addToken(name, cellX, cellY, color) {
        const clamped = clampCell(cellX, cellY);
        const center = getCellCenter(clamped.cellX, clamped.cellY);
        const token = {
          id: "token-extra-" + tokenState.nextTokenNumber,
          name: name || "PNG " + tokenState.nextTokenNumber,
          kind: "npc",
          color: color || "#8f1d18",
          ringColor: "#f0ddb3",
          cellX: clamped.cellX,
          cellY: clamped.cellY,
          x: center.x,
          y: center.y,
          targetX: center.x,
          targetY: center.y,
          radiusScale: 0.36,
          dragging: false,
          hidden: false
        };

        tokenState.nextTokenNumber += 1;
        tokenState.tokens.push(token);
        setSelectedToken(token.id);
        appendLog("Token aggiunto: " + token.name + ".");
        return token;
      }

      function removeToken(tokenId) {
        if (tokenId === "token-pc") {
          appendLog("Il token del PG locale non puo essere rimosso.");
          return false;
        }

        const token = getToken(tokenId);
        if (!token) {
          return false;
        }

        tokenState.tokens = tokenState.tokens.filter(function keepToken(candidate) {
          return candidate.id !== tokenId;
        });

        if (tokenState.selectedTokenId === tokenId) {
          tokenState.selectedTokenId = tokenState.tokens.length > 0 ? tokenState.tokens[0].id : "";
        }

        renderTokenUi();
        window.UltimateVTTCanvas.requestRender();
        appendLog("Token rimosso: " + token.name + ".");
        return true;
      }

      function resetTokens() {
        const placements = [
          { id: "token-pc", cellX: 16, cellY: 12 },
          { id: "token-npc-1", cellX: 20, cellY: 12 },
          { id: "token-npc-2", cellX: 22, cellY: 14 },
          { id: "token-npc-3", cellX: 20, cellY: 16 }
        ];

        placements.forEach(function resetTokenPlacement(placement) {
          const token = getToken(placement.id);
          if (token) {
            token.cellX = placement.cellX;
            token.cellY = placement.cellY;
            token.dragging = false;
            syncTokenWorldFromCells(token);
          }
        });

        tokenState.lastMoveDistanceMeters = 0;
        tokenState.lastMoveEuclideanMeters = 0;
        renderTokenUi();
        window.UltimateVTTCanvas.requestRender();
        appendLog("Token riportati alla posizione iniziale.");
      }

      function centerSelectedToken() {
        const metrics = getGridMetrics();
        const token = getSelectedToken();
        if (!token) {
          return false;
        }

        const centerCellX = Math.floor(metrics.columns / 2);
        const centerCellY = Math.floor(metrics.rows / 2);
        const moved = moveTokenToCell(token.id, centerCellX, centerCellY, true);
        if (moved) {
          appendLog("Token centrato: " + token.name + ".");
        }
        return moved;
      }

      function beginDrag(token, pointerId, world) {
        tokenState.dragTokenId = token.id;
        tokenState.dragPointerId = pointerId;
        tokenState.dragStartCell = {
          cellX: token.cellX,
          cellY: token.cellY
        };
        tokenState.dragStartWorld = {
          x: token.x,
          y: token.y
        };
        token.dragging = true;
        token.x = world.x;
        token.y = world.y;
        token.targetX = world.x;
        token.targetY = world.y;
        setSelectedToken(token.id);
        updateTokenCellFromWorld(token, world.x, world.y);
        updateMoveDistance(token);
        renderTokenUi();
        window.UltimateVTTCanvas.requestRender();
      }

      function updateTokenCellFromWorld(token, worldX, worldY) {
        const cell = worldToCell(worldX, worldY);
        const clamped = clampCell(cell.cellX, cell.cellY);
        token.cellX = clamped.cellX;
        token.cellY = clamped.cellY;
      }

      function dragTokenToWorld(token, worldX, worldY) {
        token.x = worldX;
        token.y = worldY;
        token.targetX = worldX;
        token.targetY = worldY;
        updateTokenCellFromWorld(token, worldX, worldY);
        updateMoveDistance(token);
        renderTokenUi();
        window.UltimateVTTCanvas.requestRender();
      }

      function endDrag(token) {
        const targetCell = clampCell(token.cellX, token.cellY);
        const blocked = window.UltimateVTTCanvas.isTerrainBlocking(targetCell.cellX, targetCell.cellY);

        token.dragging = false;

        if (blocked && tokenState.dragStartCell && tokenState.dragStartWorld) {
          token.cellX = tokenState.dragStartCell.cellX;
          token.cellY = tokenState.dragStartCell.cellY;
          token.targetX = tokenState.dragStartWorld.x;
          token.targetY = tokenState.dragStartWorld.y;
          appendLog("Movimento annullato: terreno bloccante.");
        } else if (tokenState.snapToGrid) {
          const center = getCellCenter(targetCell.cellX, targetCell.cellY);
          token.cellX = targetCell.cellX;
          token.cellY = targetCell.cellY;
          token.targetX = center.x;
          token.targetY = center.y;
          appendLog(token.name + " mosso a " + targetCell.cellX + "," + targetCell.cellY + " | " + formatMeters(tokenState.lastMoveDistanceMeters) + ".");
        } else {
          updateTokenCellFromWorld(token, token.x, token.y);
          token.targetX = token.x;
          token.targetY = token.y;
          appendLog(token.name + " mosso senza snap | " + formatMeters(tokenState.lastMoveEuclideanMeters) + ".");
        }

        tokenState.dragTokenId = null;
        tokenState.dragPointerId = null;
        renderTokenUi();
        window.UltimateVTTCanvas.requestRender();
      }

      function handlePointerDownCapture(event) {
        const hit = hitTestToken(event.clientX, event.clientY);
        if (!hit.token) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        canvas.setPointerCapture(event.pointerId);
        beginDrag(hit.token, event.pointerId, hit.world);
      }

      function handlePointerMoveCapture(event) {
        if (tokenState.dragTokenId === null || tokenState.dragPointerId !== event.pointerId) {
          return;
        }

        const token = getToken(tokenState.dragTokenId);
        if (!token) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        const world = window.UltimateVTTCanvas.screenToWorld(event.clientX, event.clientY);
        dragTokenToWorld(token, world.x, world.y);
      }

      function handlePointerUpCapture(event) {
        if (tokenState.dragTokenId === null || tokenState.dragPointerId !== event.pointerId) {
          return;
        }

        const token = getToken(tokenState.dragTokenId);
        event.preventDefault();
        event.stopImmediatePropagation();

        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }

        if (token) {
          endDrag(token);
        }
      }

      function updatePhysics(deltaSeconds) {
        let moving = false;
        const stiffness = 20;
        const maxStep = Math.min(1, deltaSeconds * stiffness);

        tokenState.tokens.forEach(function updateToken(token) {
          if (token.dragging) {
            return;
          }

          const dx = token.targetX - token.x;
          const dy = token.targetY - token.y;
          const distanceSquared = dx * dx + dy * dy;

          if (distanceSquared > 0.25) {
            token.x += dx * maxStep;
            token.y += dy * maxStep;
            moving = true;
          } else {
            token.x = token.targetX;
            token.y = token.targetY;
          }
        });

        return moving;
      }

      function drawToken(rendererContext, token, selected) {
        const ctx = rendererContext.context;
        const metrics = getGridMetrics();
        const radius = metrics.gridSize * token.radiusScale;
        const screenScale = rendererContext.mapState && rendererContext.mapState.viewport ? rendererContext.mapState.viewport.scale : 1;
        const lineWidth = 2.5 / Math.max(screenScale, 0.01);
        const labelOffset = radius + 6;
        const gradient = ctx.createRadialGradient(token.x - radius * 0.35, token.y - radius * 0.35, radius * 0.1, token.x, token.y, radius);

        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.14, token.ringColor);
        gradient.addColorStop(0.42, token.color);
        gradient.addColorStop(1, "#080706");

        ctx.save();
        ctx.beginPath();
        ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.lineWidth = selected ? lineWidth * 1.8 : lineWidth;
        ctx.strokeStyle = selected ? "#5bb7c8" : token.ringColor;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(token.x, token.y, radius * 0.54, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
        ctx.fillRect(token.x - radius, token.y + labelOffset - 2, radius * 2, 16);
        ctx.fillStyle = "#d8c7a3";
        ctx.font = "11px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(token.name.slice(0, 14), token.x, token.y + labelOffset);
        ctx.restore();
      }

      function drawDragDistance(rendererContext) {
        const token = getToken(tokenState.dragTokenId);
        if (!token || !tokenState.dragStartWorld) {
          return;
        }

        const ctx = rendererContext.context;
        const screenScale = rendererContext.mapState && rendererContext.mapState.viewport ? rendererContext.mapState.viewport.scale : 1;
        const lineWidth = 2 / Math.max(screenScale, 0.01);
        const midX = (tokenState.dragStartWorld.x + token.x) / 2;
        const midY = (tokenState.dragStartWorld.y + token.y) / 2;

        ctx.save();
        ctx.strokeStyle = "rgba(91, 183, 200, 0.92)";
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(tokenState.dragStartWorld.x, tokenState.dragStartWorld.y);
        ctx.lineTo(token.x, token.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(9, 7, 6, 0.82)";
        ctx.fillRect(midX - 38, midY - 12, 76, 24);
        ctx.strokeStyle = "rgba(91, 183, 200, 0.78)";
        ctx.strokeRect(midX - 38, midY - 12, 76, 24);
        ctx.fillStyle = "#d8c7a3";
        ctx.font = "12px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(formatMeters(tokenState.lastMoveDistanceMeters), midX, midY);
        ctx.restore();
      }

      function tokenWorldRenderer(rendererContext) {
        const now = performance.now();
        const deltaSeconds = Math.min(0.08, (now - tokenState.lastFrameTime) / 1000);
        tokenState.lastFrameTime = now;
        const moving = updatePhysics(deltaSeconds);

        drawDragDistance(rendererContext);
        tokenState.tokens.forEach(function renderToken(token) {
          if (!token.hidden) {
            drawToken(rendererContext, token, token.id === tokenState.selectedTokenId);
          }
        });

        if (moving) {
          window.UltimateVTTCanvas.requestRender();
        }
      }

      function renderTokenSelect() {
        const select = getElement("tokenSelect");
        if (!select) {
          return;
        }

        clearNode(select);

        tokenState.tokens.forEach(function appendTokenOption(token) {
          const option = document.createElement("option");
          option.value = token.id;
          option.textContent = token.name + " (" + token.cellX + "," + token.cellY + ")";
          select.appendChild(option);
        });

        if (getToken(tokenState.selectedTokenId)) {
          select.value = tokenState.selectedTokenId;
        }
      }

      function renderTokenList() {
        const list = getElement("tokenListSummary");
        if (!list) {
          return;
        }

        clearNode(list);

        tokenState.tokens.forEach(function appendTokenRow(token) {
          const row = document.createElement("div");
          const swatch = document.createElement("span");
          const name = document.createElement("span");
          const meta = document.createElement("span");

          row.className = "token-row" + (token.id === tokenState.selectedTokenId ? " active" : "");
          row.addEventListener("click", function handleTokenRowClick() {
            setSelectedToken(token.id);
          });
          swatch.className = "token-swatch";
          swatch.style.setProperty("--token-color", token.color);
          name.className = "token-row-name";
          name.textContent = token.name;
          meta.className = "token-row-meta";
          meta.textContent = token.cellX + "," + token.cellY;

          row.appendChild(swatch);
          row.appendChild(name);
          row.appendChild(meta);
          list.appendChild(row);
        });
      }

      function renderTokenUi() {
        const selected = getSelectedToken();
        const distanceText = formatMeters(tokenState.lastMoveDistanceMeters);
        const euclideanText = formatMeters(tokenState.lastMoveEuclideanMeters);

        renderTokenSelect();
        renderTokenList();
        setText("tokenCountSummary", tokenState.tokens.length);
        setText("tokenSelectedSummary", selected ? selected.name : "-");
        setText("tokenDistanceSummary", distanceText);
        setText("tokenMoveSummary", selected ? selected.name + " | cella " + selected.cellX + "," + selected.cellY + " | griglia " + distanceText + " | libera " + euclideanText : "Nessun token selezionato.");
        setText("tokenModePill", tokenState.snapToGrid ? "Token: snap" : "Token: free");
      }

      function bindTokenControls() {
        const tokenSelect = getElement("tokenSelect");
        const addButton = getElement("tokenAddNpcButton");
        const centerButton = getElement("tokenCenterButton");
        const resetButton = getElement("tokenResetButton");
        const snapCheckbox = getElement("tokenSnapCheckbox");

        if (tokenSelect) {
          tokenSelect.addEventListener("change", function handleTokenSelectChange() {
            setSelectedToken(tokenSelect.value);
          });
        }

        if (addButton) {
          addButton.addEventListener("click", function handleAddTokenClick() {
            const metrics = getGridMetrics();
            const cellX = Math.floor(metrics.columns / 2) + (tokenState.nextTokenNumber % 5);
            const cellY = Math.floor(metrics.rows / 2) + Math.floor(tokenState.nextTokenNumber / 5);
            addToken("PNG " + tokenState.nextTokenNumber, cellX, cellY, "#8f1d18");
          });
        }

        if (centerButton) {
          centerButton.addEventListener("click", centerSelectedToken);
        }

        if (resetButton) {
          resetButton.addEventListener("click", resetTokens);
        }

        if (snapCheckbox) {
          snapCheckbox.addEventListener("change", function handleSnapChange() {
            tokenState.snapToGrid = Boolean(snapCheckbox.checked);
            renderTokenUi();
          });
        }
      }

      function bindCanvasTokenEvents() {
        canvas.addEventListener("pointerdown", handlePointerDownCapture, true);
        canvas.addEventListener("pointermove", handlePointerMoveCapture, true);
        canvas.addEventListener("pointerup", handlePointerUpCapture, true);
        canvas.addEventListener("pointercancel", handlePointerUpCapture, true);
      }

      function initializeTokenPhysics() {
        initializeTokenPositions();
        bindTokenControls();
        bindCanvasTokenEvents();
        window.UltimateVTTCanvas.addWorldRenderer(tokenWorldRenderer);
        renderTokenUi();
        window.UltimateVTTCanvas.requestRender();
      }

      window.UltimateVTTTokenPhysics = {
        getState: function getTokenPhysicsState() {
          return cloneData(tokenState);
        },
        setSelectedToken: setSelectedToken,
        addToken: addToken,
        removeToken: removeToken,
        resetTokens: resetTokens,
        centerSelectedToken: centerSelectedToken,
        moveTokenToCell: moveTokenToCell,
        calculateGridDistanceMeters: calculateGridDistanceMeters,
        calculateEuclideanDistanceMeters: calculateEuclideanDistanceMeters,
        hitTestToken: hitTestToken,
        renderTokenUi: renderTokenUi
      };

      initializeTokenPhysics();

      window.UltimateVTT.registerModule(7, {
        tokenPhysics: true,
        dragAndDrop: true,
        snapToGrid: tokenState.snapToGrid,
        distanceMeters: true,
        tokens: tokenState.tokens.length
      });

      appendLog("Modulo 7 caricato: token drag and drop, snap-to-grid e calcolo distanze.");
    })();
    // --- FINE MODULO 7 JS: TOKEN PHYSICS, DRAG&DROP CANVAS, SNAP-TO-GRID, DISTANZE ---
  