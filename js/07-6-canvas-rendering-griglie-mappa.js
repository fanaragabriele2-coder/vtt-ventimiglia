    // --- INIZIO MODULO 6 JS: CANVAS RENDERING, GRIGLIE MAPPA, NEBBIA DI GUERRA ---
    (function initializeUltimateVttModuleSix() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 6 richiede il Modulo 1.");
      }

      const canvas = document.getElementById("vttCanvas");
      if (!canvas) {
        throw new Error("UltimateVTT Module 6 non trova #vttCanvas.");
      }

      const context = canvas.getContext("2d");
      const worldRenderers = [];

      const terrainPalettes = {
        dungeon: {
          stone: "#2b2a2c",
          earth: "#4a3828",
          water: "#143541",
          wall: "#111111"
        },
        cavern: {
          stone: "#252629",
          earth: "#3e3025",
          water: "#12333b",
          wall: "#0d0c0b"
        },
        forest: {
          stone: "#30322d",
          earth: "#334229",
          water: "#123945",
          wall: "#161d13"
        }
      };

      const mapState = {
        columns: 32,
        rows: 24,
        gridSize: 48,
        cellMeters: 1.5,
        terrainMode: "dungeon",
        terrainSeed: 61427,
        showGrid: true,
        fogEnabled: true,
        fogMode: "inspect",
        brushRadius: 2,
        terrainCells: [],
        fogCells: [],
        renderQueued: false,
        draggingFog: false,
        viewport: {
          dpr: 1,
          cssWidth: 1,
          cssHeight: 1,
          pixelWidth: 1,
          pixelHeight: 1,
          worldWidth: 1536,
          worldHeight: 1152,
          scale: 1,
          offsetX: 0,
          offsetY: 0
        },
        mouse: {
          inside: false,
          cellX: -1,
          cellY: -1,
          worldX: 0,
          worldY: 0
        }
      };

      function getElement(id) {
        return document.getElementById(id);
      }

      function getAll(selector, root) {
        const searchRoot = root || document;
        return Array.prototype.slice.call(searchRoot.querySelectorAll(selector));
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

      function cellIndex(cellX, cellY) {
        return cellY * mapState.columns + cellX;
      }

      function isCellInBounds(cellX, cellY) {
        return cellX >= 0 && cellY >= 0 && cellX < mapState.columns && cellY < mapState.rows;
      }

      function fractionalNoise(x, y, channel) {
        const raw = Math.sin((x * 127.1) + (y * 311.7) + (mapState.terrainSeed * 0.071) + (channel * 53.3)) * 43758.5453123;
        return raw - Math.floor(raw);
      }

      function adjustHexColor(hexColor, amount) {
        const hex = String(hexColor || "#000000").replace("#", "");
        const red = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
        const green = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
        const blue = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
        const redHex = red.toString(16).padStart(2, "0");
        const greenHex = green.toString(16).padStart(2, "0");
        const blueHex = blue.toString(16).padStart(2, "0");
        return "#" + redHex + greenHex + blueHex;
      }

      function chooseTerrainForCell(cellX, cellY) {
        const edge = cellX === 0 || cellY === 0 || cellX === mapState.columns - 1 || cellY === mapState.rows - 1;
        const centralRoad = Math.abs(cellY - Math.floor(mapState.rows / 2)) <= 1 || Math.abs(cellX - Math.floor(mapState.columns / 2)) <= 1;
        const roomArea = cellX > 4 && cellX < mapState.columns - 5 && cellY > 3 && cellY < mapState.rows - 4;
        const n1 = fractionalNoise(cellX, cellY, 1);
        const n2 = fractionalNoise(cellX, cellY, 2);
        const n3 = fractionalNoise(cellX, cellY, 3);

        if (edge) {
          return "wall";
        }

        if (mapState.terrainMode === "cavern") {
          if (n1 > 0.82 && !centralRoad) {
            return "wall";
          }
          if (n2 < 0.12) {
            return "water";
          }
          if (n3 < 0.62) {
            return "earth";
          }
          return "stone";
        }

        if (mapState.terrainMode === "forest") {
          if (n1 > 0.9 && !centralRoad) {
            return "wall";
          }
          if (n2 < 0.1 && roomArea) {
            return "water";
          }
          if (n3 < 0.76) {
            return "earth";
          }
          return "stone";
        }

        if (centralRoad) {
          return n2 < 0.08 ? "earth" : "stone";
        }

        if (n1 > 0.92 && roomArea) {
          return "wall";
        }

        if (n2 < 0.08) {
          return "water";
        }

        if (n3 < 0.24) {
          return "earth";
        }

        return "stone";
      }

      function generateTerrain() {
        mapState.terrainCells = [];

        for (let y = 0; y < mapState.rows; y += 1) {
          for (let x = 0; x < mapState.columns; x += 1) {
            mapState.terrainCells.push(chooseTerrainForCell(x, y));
          }
        }
      }

      function fillFog(hidden) {
        mapState.fogCells = [];

        for (let index = 0; index < mapState.columns * mapState.rows; index += 1) {
          mapState.fogCells.push(Boolean(hidden));
        }
      }

      function revealCircle(centerX, centerY, radius) {
        applyFogBrush(centerX, centerY, Math.max(0, radius), "reveal");
      }

      function hideCircle(centerX, centerY, radius) {
        applyFogBrush(centerX, centerY, Math.max(0, radius), "hide");
      }

      function initializeMapCells() {
        generateTerrain();
        fillFog(true);
        revealCircle(Math.floor(mapState.columns / 2), Math.floor(mapState.rows / 2), 5);
      }

      function resizeCanvasToDisplaySize() {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const pixelWidth = Math.max(1, Math.floor(rect.width * dpr));
        const pixelHeight = Math.max(1, Math.floor(rect.height * dpr));
        const worldWidth = mapState.columns * mapState.gridSize;
        const worldHeight = mapState.rows * mapState.gridSize;
        const scale = Math.min(pixelWidth / worldWidth, pixelHeight / worldHeight);
        const finalScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }

        mapState.viewport.dpr = dpr;
        mapState.viewport.cssWidth = rect.width;
        mapState.viewport.cssHeight = rect.height;
        mapState.viewport.pixelWidth = pixelWidth;
        mapState.viewport.pixelHeight = pixelHeight;
        mapState.viewport.worldWidth = worldWidth;
        mapState.viewport.worldHeight = worldHeight;
        mapState.viewport.scale = finalScale;
        mapState.viewport.offsetX = Math.floor((pixelWidth - worldWidth * finalScale) / 2);
        mapState.viewport.offsetY = Math.floor((pixelHeight - worldHeight * finalScale) / 2);
      }

      function getTerrainAt(cellX, cellY) {
        if (!isCellInBounds(cellX, cellY)) {
          return "wall";
        }
        return mapState.terrainCells[cellIndex(cellX, cellY)] || "stone";
      }

      function isFogHidden(cellX, cellY) {
        if (!isCellInBounds(cellX, cellY)) {
          return true;
        }
        return Boolean(mapState.fogCells[cellIndex(cellX, cellY)]);
      }

      function isTerrainBlocking(cellX, cellY) {
        return getTerrainAt(cellX, cellY) === "wall";
      }

      function drawTerrainLayer() {
        const palette = terrainPalettes[mapState.terrainMode] || terrainPalettes.dungeon;

        for (let y = 0; y < mapState.rows; y += 1) {
          for (let x = 0; x < mapState.columns; x += 1) {
            const terrain = getTerrainAt(x, y);
            const baseColor = palette[terrain] || palette.stone;
            const variation = Math.floor(fractionalNoise(x, y, 7) * 24) - 12;
            const drawX = x * mapState.gridSize;
            const drawY = y * mapState.gridSize;

            context.fillStyle = adjustHexColor(baseColor, variation);
            context.fillRect(drawX, drawY, mapState.gridSize, mapState.gridSize);

            if (terrain === "water") {
              context.fillStyle = "rgba(91, 183, 200, 0.12)";
              context.fillRect(drawX + 3, drawY + 3, mapState.gridSize - 6, mapState.gridSize - 6);
            }

            if (terrain === "wall") {
              context.fillStyle = "rgba(0, 0, 0, 0.28)";
              context.fillRect(drawX + 4, drawY + 4, mapState.gridSize - 8, mapState.gridSize - 8);
            }
          }
        }
      }

      function drawGridLayer() {
        if (!mapState.showGrid) {
          return;
        }

        context.save();
        context.strokeStyle = "rgba(216, 199, 163, 0.24)";
        context.lineWidth = 1 / Math.max(mapState.viewport.scale, 0.01);

        for (let x = 0; x <= mapState.columns; x += 1) {
          const worldX = x * mapState.gridSize;
          context.beginPath();
          context.moveTo(worldX, 0);
          context.lineTo(worldX, mapState.viewport.worldHeight);
          context.stroke();
        }

        for (let y = 0; y <= mapState.rows; y += 1) {
          const worldY = y * mapState.gridSize;
          context.beginPath();
          context.moveTo(0, worldY);
          context.lineTo(mapState.viewport.worldWidth, worldY);
          context.stroke();
        }

        context.fillStyle = "rgba(216, 199, 163, 0.46)";
        context.font = "10px Arial, Helvetica, sans-serif";
        context.textAlign = "left";
        context.textBaseline = "top";

        for (let labelY = 0; labelY < mapState.rows; labelY += 4) {
          for (let labelX = 0; labelX < mapState.columns; labelX += 4) {
            context.fillText(labelX + "," + labelY, labelX * mapState.gridSize + 4, labelY * mapState.gridSize + 4);
          }
        }

        context.restore();
      }

      function drawWorldRenderers() {
        worldRenderers.forEach(function drawRegisteredRenderer(renderer) {
          renderer({
            context: context,
            mapState: mapState,
            gridSize: mapState.gridSize,
            cellMeters: mapState.cellMeters,
            worldToScreen: worldToScreen,
            screenToWorld: screenToWorld,
            cellToWorldCenter: cellToWorldCenter,
            isFogHidden: isFogHidden,
            isTerrainBlocking: isTerrainBlocking
          });
        });
      }

      function drawFogLayer() {
        if (!mapState.fogEnabled) {
          return;
        }

        for (let y = 0; y < mapState.rows; y += 1) {
          for (let x = 0; x < mapState.columns; x += 1) {
            if (isFogHidden(x, y)) {
              context.fillStyle = "rgba(0, 0, 0, 0.82)";
              context.fillRect(x * mapState.gridSize, y * mapState.gridSize, mapState.gridSize, mapState.gridSize);
            } else {
              context.fillStyle = "rgba(0, 0, 0, 0.08)";
              context.fillRect(x * mapState.gridSize, y * mapState.gridSize, mapState.gridSize, mapState.gridSize);
            }
          }
        }
      }

      function drawHoverCell() {
        if (!mapState.mouse.inside || !isCellInBounds(mapState.mouse.cellX, mapState.mouse.cellY)) {
          return;
        }

        const x = mapState.mouse.cellX * mapState.gridSize;
        const y = mapState.mouse.cellY * mapState.gridSize;
        context.save();
        context.strokeStyle = mapState.fogMode === "hide" ? "rgba(201, 54, 43, 0.95)" : mapState.fogMode === "reveal" ? "rgba(91, 183, 200, 0.95)" : "rgba(200, 155, 60, 0.88)";
        context.lineWidth = 3 / Math.max(mapState.viewport.scale, 0.01);
        context.strokeRect(x + 2, y + 2, mapState.gridSize - 4, mapState.gridSize - 4);
        context.restore();
      }

      function renderCanvasNow() {
        mapState.renderQueued = false;
        resizeCanvasToDisplaySize();

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#050403";
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.save();
        context.translate(mapState.viewport.offsetX, mapState.viewport.offsetY);
        context.scale(mapState.viewport.scale, mapState.viewport.scale);

        drawTerrainLayer();
        drawGridLayer();
        drawWorldRenderers();
        drawFogLayer();
        drawHoverCell();

        context.restore();
        renderMapSummary();
      }

      function requestRender() {
        if (mapState.renderQueued) {
          return;
        }

        mapState.renderQueued = true;
        window.requestAnimationFrame(renderCanvasNow);
      }

      function worldToScreen(worldX, worldY) {
        return {
          x: mapState.viewport.offsetX + worldX * mapState.viewport.scale,
          y: mapState.viewport.offsetY + worldY * mapState.viewport.scale
        };
      }

      function screenToWorld(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const pixelX = (clientX - rect.left) * mapState.viewport.dpr;
        const pixelY = (clientY - rect.top) * mapState.viewport.dpr;
        return {
          x: (pixelX - mapState.viewport.offsetX) / mapState.viewport.scale,
          y: (pixelY - mapState.viewport.offsetY) / mapState.viewport.scale
        };
      }

      function screenToCell(clientX, clientY) {
        const world = screenToWorld(clientX, clientY);
        return {
          cellX: Math.floor(world.x / mapState.gridSize),
          cellY: Math.floor(world.y / mapState.gridSize),
          worldX: world.x,
          worldY: world.y
        };
      }

      function cellToWorldCenter(cellX, cellY) {
        return {
          x: cellX * mapState.gridSize + mapState.gridSize / 2,
          y: cellY * mapState.gridSize + mapState.gridSize / 2
        };
      }

      function applyFogBrush(centerX, centerY, radius, mode) {
        const effectiveRadius = Math.max(0, radius);
        const radiusSquared = effectiveRadius * effectiveRadius;
        const hide = mode === "hide";
        let changed = false;

        for (let dy = -effectiveRadius; dy <= effectiveRadius; dy += 1) {
          for (let dx = -effectiveRadius; dx <= effectiveRadius; dx += 1) {
            if (dx * dx + dy * dy <= radiusSquared) {
              const x = centerX + dx;
              const y = centerY + dy;
              if (isCellInBounds(x, y)) {
                const index = cellIndex(x, y);
                if (mapState.fogCells[index] !== hide) {
                  mapState.fogCells[index] = hide;
                  changed = true;
                }
              }
            }
          }
        }

        if (changed) {
          requestRender();
        }

        return changed;
      }

      function setFogMode(mode) {
        if (mode !== "inspect" && mode !== "reveal" && mode !== "hide") {
          return false;
        }

        mapState.fogMode = mode;
        getAll(".map-mode-button").forEach(function updateModeButton(button) {
          button.classList.toggle("active", button.getAttribute("data-map-mode") === mode);
        });
        setText("mapModePill", "Mappa: " + mode);
        requestRender();
        return true;
      }

      function updateMouseFromEvent(event) {
        const cell = screenToCell(event.clientX, event.clientY);
        mapState.mouse.inside = isCellInBounds(cell.cellX, cell.cellY);
        mapState.mouse.cellX = cell.cellX;
        mapState.mouse.cellY = cell.cellY;
        mapState.mouse.worldX = cell.worldX;
        mapState.mouse.worldY = cell.worldY;
        renderCoordinateReadout();
      }

      function paintFogFromPointer(event) {
        updateMouseFromEvent(event);

        if (!mapState.mouse.inside) {
          requestRender();
          return;
        }

        if (mapState.fogMode === "reveal") {
          applyFogBrush(mapState.mouse.cellX, mapState.mouse.cellY, mapState.brushRadius, "reveal");
        } else if (mapState.fogMode === "hide") {
          applyFogBrush(mapState.mouse.cellX, mapState.mouse.cellY, mapState.brushRadius, "hide");
        } else {
          requestRender();
        }
      }

      function renderCoordinateReadout() {
        const readout = getElement("mapCoordinateReadout");
        if (!readout) {
          return;
        }

        if (!mapState.mouse.inside) {
          readout.textContent = "Cella: -";
          return;
        }

        const terrain = getTerrainAt(mapState.mouse.cellX, mapState.mouse.cellY);
        const fogText = isFogHidden(mapState.mouse.cellX, mapState.mouse.cellY) ? "buio" : "visibile";
        const distanceX = (mapState.mouse.cellX * mapState.cellMeters).toFixed(1);
        const distanceY = (mapState.mouse.cellY * mapState.cellMeters).toFixed(1);
        readout.textContent = "Cella: " + mapState.mouse.cellX + "," + mapState.mouse.cellY + " | " + terrain + " | " + fogText + " | " + distanceX + "m," + distanceY + "m";
      }

      function calculateFogPercent() {
        if (mapState.fogCells.length === 0) {
          return 0;
        }

        const hiddenCount = mapState.fogCells.filter(function countHidden(hidden) {
          return hidden;
        }).length;

        return Math.round((hiddenCount / mapState.fogCells.length) * 100);
      }

      function renderMapSummary() {
        const fogPercent = calculateFogPercent();
        setText("mapRenderStatus", "OK");
        setText("stageStatusLabel", "Canvas: " + mapState.columns + "x" + mapState.rows + " | Fog " + fogPercent + "%");
        setText("mapGridSummary", mapState.columns + " x " + mapState.rows);
        setText("mapFogSummary", fogPercent + "%");
        setText("mapScaleSummary", mapState.cellMeters + " m");
        setText("gridScalePill", "Scala: 1 quadretto = " + mapState.cellMeters + " m");
      }

      function regenerateMap() {
        mapState.terrainSeed = Math.floor(Math.random() * 1000000) + 1;
        generateTerrain();
        fillFog(true);
        revealCircle(Math.floor(mapState.columns / 2), Math.floor(mapState.rows / 2), 5);
        requestRender();
        appendLog("Mappa rigenerata con seed " + mapState.terrainSeed + ".");
      }

      function bindMapControls() {
        const gridSizeInput = getElement("mapGridSizeInput");
        const brushRadiusInput = getElement("mapBrushRadiusInput");
        const terrainSelect = getElement("mapTerrainSelect");
        const showGridCheckbox = getElement("mapShowGridCheckbox");
        const fogAllButton = getElement("mapFogAllButton");
        const revealAllButton = getElement("mapRevealAllButton");
        const centerRevealButton = getElement("mapCenterRevealButton");
        const regenerateButton = getElement("mapRegenerateButton");

        getAll(".map-mode-button").forEach(function bindModeButton(button) {
          button.addEventListener("click", function handleModeClick() {
            setFogMode(button.getAttribute("data-map-mode"));
          });
        });

        if (gridSizeInput) {
          gridSizeInput.addEventListener("change", function handleGridSizeChange() {
            mapState.gridSize = clampNumber(gridSizeInput.value, 32, 96, 48);
            gridSizeInput.value = String(mapState.gridSize);
            requestRender();
          });
        }

        if (brushRadiusInput) {
          brushRadiusInput.addEventListener("change", function handleBrushRadiusChange() {
            mapState.brushRadius = clampNumber(brushRadiusInput.value, 0, 8, 2);
            brushRadiusInput.value = String(mapState.brushRadius);
            requestRender();
          });
        }

        if (terrainSelect) {
          terrainSelect.addEventListener("change", function handleTerrainChange() {
            mapState.terrainMode = terrainSelect.value;
            generateTerrain();
            requestRender();
            appendLog("Terreno mappa: " + mapState.terrainMode + ".");
          });
        }

        if (showGridCheckbox) {
          showGridCheckbox.addEventListener("change", function handleGridToggle() {
            mapState.showGrid = Boolean(showGridCheckbox.checked);
            requestRender();
          });
        }

        if (fogAllButton) {
          fogAllButton.addEventListener("click", function handleFogAllClick() {
            fillFog(true);
            requestRender();
            appendLog("Nebbia di guerra: tutto oscurato.");
          });
        }

        if (revealAllButton) {
          revealAllButton.addEventListener("click", function handleRevealAllClick() {
            fillFog(false);
            requestRender();
            appendLog("Nebbia di guerra: mappa rivelata.");
          });
        }

        if (centerRevealButton) {
          centerRevealButton.addEventListener("click", function handleCenterRevealClick() {
            revealCircle(Math.floor(mapState.columns / 2), Math.floor(mapState.rows / 2), 5);
            requestRender();
            appendLog("Nebbia di guerra: centro rivelato.");
          });
        }

        if (regenerateButton) {
          regenerateButton.addEventListener("click", regenerateMap);
        }
      }

      function bindCanvasPointerEvents() {
        canvas.addEventListener("pointerdown", function handlePointerDown(event) {
          mapState.draggingFog = true;
          canvas.setPointerCapture(event.pointerId);
          paintFogFromPointer(event);
          event.preventDefault();
        });

        canvas.addEventListener("pointermove", function handlePointerMove(event) {
          updateMouseFromEvent(event);
          if (mapState.draggingFog && (event.buttons & 1) === 1) {
            paintFogFromPointer(event);
          } else {
            requestRender();
          }
        });

        canvas.addEventListener("pointerup", function handlePointerUp(event) {
          mapState.draggingFog = false;
          if (canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
          }
          requestRender();
        });

        canvas.addEventListener("pointerleave", function handlePointerLeave() {
          mapState.mouse.inside = false;
          mapState.draggingFog = false;
          renderCoordinateReadout();
          requestRender();
        });
      }

      function addWorldRenderer(renderer) {
        if (typeof renderer !== "function") {
          return false;
        }

        if (worldRenderers.indexOf(renderer) === -1) {
          worldRenderers.push(renderer);
          requestRender();
        }

        return true;
      }

      function removeWorldRenderer(renderer) {
        const index = worldRenderers.indexOf(renderer);
        if (index === -1) {
          return false;
        }

        worldRenderers.splice(index, 1);
        requestRender();
        return true;
      }

      function getGridMetrics() {
        return {
          columns: mapState.columns,
          rows: mapState.rows,
          gridSize: mapState.gridSize,
          cellMeters: mapState.cellMeters,
          worldWidth: mapState.viewport.worldWidth,
          worldHeight: mapState.viewport.worldHeight,
          scale: mapState.viewport.scale,
          offsetX: mapState.viewport.offsetX,
          offsetY: mapState.viewport.offsetY
        };
      }

      function initializeCanvasRenderer() {
        initializeMapCells();
        bindMapControls();
        bindCanvasPointerEvents();
        setFogMode("inspect");
        resizeCanvasToDisplaySize();
        requestRender();
        window.addEventListener("resize", requestRender);
      }

      window.UltimateVTTCanvas = {
        getState: function getCanvasState() {
          return cloneData(mapState);
        },
        getGridMetrics: getGridMetrics,
        requestRender: requestRender,
        renderCanvasNow: renderCanvasNow,
        regenerateMap: regenerateMap,
        setFogMode: setFogMode,
        fillFog: function publicFillFog(hidden) {
          fillFog(Boolean(hidden));
          requestRender();
        },
        revealCircle: function publicRevealCircle(cellX, cellY, radius) {
          revealCircle(clampNumber(cellX, 0, mapState.columns - 1, 0), clampNumber(cellY, 0, mapState.rows - 1, 0), clampNumber(radius, 0, 16, 1));
          requestRender();
        },
        hideCircle: function publicHideCircle(cellX, cellY, radius) {
          hideCircle(clampNumber(cellX, 0, mapState.columns - 1, 0), clampNumber(cellY, 0, mapState.rows - 1, 0), clampNumber(radius, 0, 16, 1));
          requestRender();
        },
        applyFogBrush: applyFogBrush,
        isFogHidden: isFogHidden,
        isTerrainBlocking: isTerrainBlocking,
        getTerrainAt: getTerrainAt,
        worldToScreen: worldToScreen,
        screenToWorld: screenToWorld,
        screenToCell: screenToCell,
        cellToWorldCenter: cellToWorldCenter,
        addWorldRenderer: addWorldRenderer,
        removeWorldRenderer: removeWorldRenderer
      };

      initializeCanvasRenderer();

      window.UltimateVTT.registerModule(6, {
        canvasRendering: true,
        mapGrid: mapState.columns + "x" + mapState.rows,
        fogOfWar: true,
        terrainMode: mapState.terrainMode,
        rendererHooks: true
      });

      appendLog("Modulo 6 caricato: rendering Canvas, griglia mappa e nebbia di guerra.");
    })();
    // --- FINE MODULO 6 JS: CANVAS RENDERING, GRIGLIE MAPPA, NEBBIA DI GUERRA ---
  