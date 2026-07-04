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

      // ---------------------------------------------------------------------------------------
      // CACHE OFFSCREEN dei layer statici (Task 3 — performance). Prima OGNI frame ridisegnava
      // TUTTA la griglia cella per cella: 32x24 = 768 celle x (fillRect terreno + rumore
      // procedurale + fillRect nebbia) = ~1600 operazioni canvas per frame, anche quando terreno
      // e nebbia non erano cambiati affatto (es. durante il semplice drag di un token). Ora:
      //   - il TERRENO + GRIGLIA vivono in un canvas offscreen, ridisegnato SOLO quando cambiano
      //     davvero (rigenerazione, ostacoli dell'arena, palette, toggle griglia, resize);
      //   - la NEBBIA vive in un secondo canvas offscreen, ridisegnata SOLO quando il Master
      //     rivela/nasconde celle;
      //   - il frame "caldo" si riduce a: 2 drawImage (blit accelerati dalla GPU: un canvas
      //     world-size copiato con la trasformazione gia' attiva) + i token dinamici + il
      //     riquadro hover. E' la differenza tra "ricalcolare la scena" e "incollare una foto".
      // Le statistiche (frame totali vs ridisegni pieni) sono esposte via getRenderStats() sia
      // per i test (verificano che la cache NON venga ributtata via a ogni frame) sia per la
      // diagnostica dal vivo.
      // ---------------------------------------------------------------------------------------
      const cacheStatica = {
        terreno: null, terrenoCtx: null, terrenoSporco: true,
        nebbia: null, nebbiaCtx: null, nebbiaSporca: true,
        larghezza: 0, altezza: 0, scala: 0
      };
      const renderStats = { frames: 0, terrainRedraws: 0, fogRedraws: 0 };

      function invalidaTerreno() { cacheStatica.terrenoSporco = true; }
      function invalidaNebbia() { cacheStatica.nebbiaSporca = true; }

      function assicuraCanvasCache() {
        const w = mapState.columns * mapState.gridSize;
        const h = mapState.rows * mapState.gridSize;
        const scala = mapState.viewport.scale;
        // Dimensioni del mondo o scala cambiate (resize/griglia): le superfici vanno ricreate e
        // ridisegnate — la larghezza delle linee di griglia dipende dalla scala per restare ~1px
        // a schermo, quindi anche un semplice resize invalida il layer statico.
        if (!cacheStatica.terreno || cacheStatica.larghezza !== w || cacheStatica.altezza !== h || Math.abs(cacheStatica.scala - scala) > 0.0001) {
          cacheStatica.terreno = document.createElement("canvas");
          cacheStatica.terreno.width = w; cacheStatica.terreno.height = h;
          cacheStatica.terrenoCtx = cacheStatica.terreno.getContext("2d");
          cacheStatica.nebbia = document.createElement("canvas");
          cacheStatica.nebbia.width = w; cacheStatica.nebbia.height = h;
          cacheStatica.nebbiaCtx = cacheStatica.nebbia.getContext("2d");
          cacheStatica.larghezza = w; cacheStatica.altezza = h; cacheStatica.scala = scala;
          cacheStatica.terrenoSporco = true;
          cacheStatica.nebbiaSporca = true;
        }
      }

      function aggiornaCacheStatiche() {
        assicuraCanvasCache();
        if (cacheStatica.terrenoSporco) {
          cacheStatica.terrenoCtx.clearRect(0, 0, cacheStatica.larghezza, cacheStatica.altezza);
          drawTerrainLayer(cacheStatica.terrenoCtx);
          drawGridLayer(cacheStatica.terrenoCtx);
          cacheStatica.terrenoSporco = false;
          renderStats.terrainRedraws += 1;
        }
        if (cacheStatica.nebbiaSporca) {
          cacheStatica.nebbiaCtx.clearRect(0, 0, cacheStatica.larghezza, cacheStatica.altezza);
          drawFogLayer(cacheStatica.nebbiaCtx);
          cacheStatica.nebbiaSporca = false;
          renderStats.fogRedraws += 1;
        }
      }

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
        invalidaTerreno();
      }

      function fillFog(hidden) {
        mapState.fogCells = [];

        for (let index = 0; index < mapState.columns * mapState.rows; index += 1) {
          mapState.fogCells.push(Boolean(hidden));
        }
        invalidaNebbia();
      }

      function revealCircle(centerX, centerY, radius) {
        applyFogBrush(centerX, centerY, Math.max(0, radius), "reveal");
      }

      function hideCircle(centerX, centerY, radius) {
        applyFogBrush(centerX, centerY, Math.max(0, radius), "hide");
      }

      function initializeMapCells() {
        generateTerrain();
        // La mappa parte tutta VISIBILE: la nebbia di guerra e' uno strumento che il Master attiva
        // quando serve ("Tutto Buio" / pennello Nascondi), non un sipario nero che all'avvio copre
        // quasi tutta la scena rendendo il tavolo illeggibile.
        fillFog(false);
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

      // Scrive il terreno di UNA cella (usato dall'arena tattica, modulo 40, per piazzare ostacoli
      // e coperture a inizio combattimento). Terreni validi: stone/earth/water/wall.
      function setTerrainAt(cellX, cellY, terrain) {
        if (!isCellInBounds(cellX, cellY)) {
          return false;
        }
        const valid = ["stone", "earth", "water", "wall"];
        if (valid.indexOf(terrain) < 0) {
          return false;
        }
        mapState.terrainCells[cellIndex(cellX, cellY)] = terrain;
        invalidaTerreno();
        return true;
      }

      // I layer statici disegnano su un context PASSATO (quello della cache offscreen): il
      // frame caldo non li chiama piu' direttamente, li incolla gia' pronti con un drawImage.
      function drawTerrainLayer(ctx) {
        const palette = terrainPalettes[mapState.terrainMode] || terrainPalettes.dungeon;

        for (let y = 0; y < mapState.rows; y += 1) {
          for (let x = 0; x < mapState.columns; x += 1) {
            const terrain = getTerrainAt(x, y);
            const baseColor = palette[terrain] || palette.stone;
            const variation = Math.floor(fractionalNoise(x, y, 7) * 24) - 12;
            const drawX = x * mapState.gridSize;
            const drawY = y * mapState.gridSize;

            ctx.fillStyle = adjustHexColor(baseColor, variation);
            ctx.fillRect(drawX, drawY, mapState.gridSize, mapState.gridSize);

            if (terrain === "water") {
              ctx.fillStyle = "rgba(91, 183, 200, 0.12)";
              ctx.fillRect(drawX + 3, drawY + 3, mapState.gridSize - 6, mapState.gridSize - 6);
            }

            if (terrain === "wall") {
              ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
              ctx.fillRect(drawX + 4, drawY + 4, mapState.gridSize - 8, mapState.gridSize - 8);
            }
          }
        }
      }

      function drawGridLayer(ctx) {
        if (!mapState.showGrid) {
          return;
        }

        ctx.save();
        ctx.strokeStyle = "rgba(216, 199, 163, 0.24)";
        ctx.lineWidth = 1 / Math.max(mapState.viewport.scale, 0.01);

        for (let x = 0; x <= mapState.columns; x += 1) {
          const worldX = x * mapState.gridSize;
          ctx.beginPath();
          ctx.moveTo(worldX, 0);
          ctx.lineTo(worldX, mapState.viewport.worldHeight);
          ctx.stroke();
        }

        for (let y = 0; y <= mapState.rows; y += 1) {
          const worldY = y * mapState.gridSize;
          ctx.beginPath();
          ctx.moveTo(0, worldY);
          ctx.lineTo(mapState.viewport.worldWidth, worldY);
          ctx.stroke();
        }

        // Niente etichette di coordinate ("4,8") stampate sul terreno: erano rumore tecnico sopra
        // la scena. La cella sotto il cursore resta leggibile nel readout in fondo agli strumenti.
        ctx.restore();
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

      function drawFogLayer(ctx) {
        if (!mapState.fogEnabled) {
          return;
        }

        // Nebbia meno invasiva: le celle nascoste restano leggibili come "zona ignota" (non un nero
        // pieno), quelle visibili non vengono scurite quasi per niente — la mappa resta luminosa.
        for (let y = 0; y < mapState.rows; y += 1) {
          for (let x = 0; x < mapState.columns; x += 1) {
            if (isFogHidden(x, y)) {
              ctx.fillStyle = "rgba(4, 3, 6, 0.72)";
              ctx.fillRect(x * mapState.gridSize, y * mapState.gridSize, mapState.gridSize, mapState.gridSize);
            } else {
              ctx.fillStyle = "rgba(0, 0, 0, 0.02)";
              ctx.fillRect(x * mapState.gridSize, y * mapState.gridSize, mapState.gridSize, mapState.gridSize);
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

        // Frame CALDO (Task 3): i layer statici arrivano gia' pronti dalle cache offscreen — due
        // blit invece di ~1600 fillRect per frame. Solo i token (dinamici) e l'hover si disegnano
        // dal vivo. Le cache si ridisegnano SOLO se qualcosa le ha invalidate (vedi invalidaTerreno
        // / invalidaNebbia): durante un semplice drag di token, qui non si ricalcola nulla.
        aggiornaCacheStatiche();
        context.drawImage(cacheStatica.terreno, 0, 0);
        drawWorldRenderers();
        if (mapState.fogEnabled) {
          context.drawImage(cacheStatica.nebbia, 0, 0);
        }
        drawHoverCell();

        context.restore();
        renderStats.frames += 1;
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
          invalidaNebbia();
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
            invalidaTerreno();
            invalidaNebbia();
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
            invalidaTerreno();
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
        // Statistiche del rendering (Task 3): frame totali vs ridisegni PIENI dei layer statici.
        // In un client sano frames cresce di continuo mentre terrainRedraws/fogRedraws restano
        // quasi fermi: se crescono insieme, qualcosa sta invalidando le cache a ogni frame.
        getRenderStats: function getRenderStats() {
          return { frames: renderStats.frames, terrainRedraws: renderStats.terrainRedraws, fogRedraws: renderStats.fogRedraws };
        },
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
        setTerrainAt: function publicSetTerrainAt(cellX, cellY, terrain) {
          const ok = setTerrainAt(cellX, cellY, terrain);
          if (ok) { requestRender(); }
          return ok;
        },
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
  