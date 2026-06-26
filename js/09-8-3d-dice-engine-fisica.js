    // --- INIZIO MODULO 8 JS: 3D DICE ENGINE, FISICA PURA, CADUTA E COLLISIONI A SCHERMO ---
    (function initializeUltimateVttModuleEight() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 8 richiede il Modulo 1.");
      }

      const diceCanvas = document.getElementById("diceCanvas");
      if (!diceCanvas) {
        throw new Error("UltimateVTT Module 8 non trova #diceCanvas.");
      }

      const diceContext = diceCanvas.getContext("2d");
      const diceState = {
        dice: [],
        history: [],
        nextId: 1,
        animationFrame: 0,
        running: false,
        lastTimestamp: performance.now(),
        gravity: 2500,
        airDrag: 0.988,
        surfaceFriction: 0.965,
        restitution: 0.48,
        angularDrag: 0.975,
        maxHistory: 8,
        lastHudHistoryId: "",
        viewport: {
          dpr: 1,
          width: 1,
          height: 1
        }
      };

      const diceVisuals = {
        4: { label: "D4", sides: 4, color: "#b85c38", accent: "#ffd28a", vertices: 3, size: 34 },
        6: { label: "D6", sides: 6, color: "#8f1d18", accent: "#f0ddb3", vertices: 4, size: 36 },
        8: { label: "D8", sides: 8, color: "#315c70", accent: "#9ee6f0", vertices: 6, size: 38 },
        10: { label: "D10", sides: 10, color: "#6d4b8f", accent: "#e8d6ff", vertices: 8, size: 40 },
        12: { label: "D12", sides: 12, color: "#4e6f39", accent: "#d8f5bd", vertices: 10, size: 42 },
        20: { label: "D20", sides: 20, color: "#c89b3c", accent: "#fff0ba", vertices: 12, size: 45 }
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

      function resizeDiceCanvas() {
        const rect = diceCanvas.getBoundingClientRect();
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const width = Math.max(1, Math.floor(rect.width * dpr));
        const height = Math.max(1, Math.floor(rect.height * dpr));

        if (diceCanvas.width !== width || diceCanvas.height !== height) {
          diceCanvas.width = width;
          diceCanvas.height = height;
        }

        diceState.viewport.dpr = dpr;
        diceState.viewport.width = width;
        diceState.viewport.height = height;
      }

      function randomRange(minValue, maxValue) {
        return minValue + Math.random() * (maxValue - minValue);
      }

      function rollDieValue(sides) {
        return Math.floor(Math.random() * sides) + 1;
      }

      function createDie(sides, originX, originY) {
        const visual = diceVisuals[sides] || diceVisuals[20];
        const width = diceState.viewport.width;
        const height = diceState.viewport.height;
        const size = visual.size * diceState.viewport.dpr;
        const safeX = Number.isFinite(originX) ? originX : randomRange(width * 0.34, width * 0.66);
        const safeY = Number.isFinite(originY) ? originY : randomRange(height * 0.16, height * 0.32);

        return {
          id: "die-" + diceState.nextId,
          sides: sides,
          label: visual.label,
          result: rollDieValue(sides),
          x: safeX,
          y: safeY,
          z: randomRange(180, 340) * diceState.viewport.dpr,
          vx: randomRange(-520, 520) * diceState.viewport.dpr,
          vy: randomRange(90, 440) * diceState.viewport.dpr,
          vz: randomRange(-260, 120) * diceState.viewport.dpr,
          rx: randomRange(0, Math.PI * 2),
          ry: randomRange(0, Math.PI * 2),
          rz: randomRange(0, Math.PI * 2),
          avx: randomRange(-9, 9),
          avy: randomRange(-9, 9),
          avz: randomRange(-12, 12),
          size: size,
          radius: size * 0.72,
          settled: false,
          restTimer: 0,
          age: 0,
          collisionFlash: 0
        };
      }

      function addHistoryEntry(die) {
        diceState.history.unshift({
          id: die.id,
          label: die.label,
          sides: die.sides,
          result: die.result,
          settledAt: new Date().toLocaleTimeString("it-IT")
        });

        if (diceState.history.length > diceState.maxHistory) {
          diceState.history.length = diceState.maxHistory;
        }
      }

      function launchDie(sides, options) {
        resizeDiceCanvas();
        const launchOptions = options || {};
        const die = createDie(clampNumber(sides, 4, 20, 20), launchOptions.x, launchOptions.y);
        diceState.nextId += 1;
        diceState.dice.push(die);
        ensureAnimation();
        renderDiceUi();
        appendLog("Dado fisico lanciato: " + die.label + ".");
        return die.result;
      }

      function launchDiceSet(sidesList) {
        const list = Array.isArray(sidesList) && sidesList.length > 0 ? sidesList : [20];
        const results = [];
        resizeDiceCanvas();

        list.forEach(function launchSetDie(sides, index) {
          const x = diceState.viewport.width * (0.38 + index * 0.08);
          const y = diceState.viewport.height * 0.18;
          results.push(launchDie(sides, { x: x, y: y }));
        });

        return results;
      }

      function clearDice() {
        diceState.dice = [];
        diceState.history = [];
        renderDiceFrame();
        renderDiceUi();
        appendLog("Dadi fisici ripuliti.");
      }

      function resolveWallCollisions(die) {
        const width = diceState.viewport.width;
        const height = diceState.viewport.height;
        const r = die.radius;

        if (die.x - r < 0) {
          die.x = r;
          die.vx = Math.abs(die.vx) * diceState.restitution;
          die.avz += randomRange(-3, 3);
          die.collisionFlash = 1;
        }

        if (die.x + r > width) {
          die.x = width - r;
          die.vx = -Math.abs(die.vx) * diceState.restitution;
          die.avz += randomRange(-3, 3);
          die.collisionFlash = 1;
        }

        if (die.y - r < 0) {
          die.y = r;
          die.vy = Math.abs(die.vy) * diceState.restitution;
          die.avx += randomRange(-2, 2);
          die.collisionFlash = 1;
        }

        if (die.y + r > height) {
          die.y = height - r;
          die.vy = -Math.abs(die.vy) * diceState.restitution;
          die.avx += randomRange(-2, 2);
          die.collisionFlash = 1;
        }
      }

      function resolveFloorCollision(die) {
        if (die.z <= 0) {
          die.z = 0;
          if (die.vz > 0) {
            die.vz = -die.vz * diceState.restitution;
            die.vx *= diceState.surfaceFriction;
            die.vy *= diceState.surfaceFriction;
            die.avx *= diceState.angularDrag;
            die.avy *= diceState.angularDrag;
            die.avz *= diceState.angularDrag;
            die.collisionFlash = 1;
          }
        }
      }

      function resolveDieCollisions() {
        for (let leftIndex = 0; leftIndex < diceState.dice.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < diceState.dice.length; rightIndex += 1) {
            const left = diceState.dice[leftIndex];
            const right = diceState.dice[rightIndex];
            const dx = right.x - left.x;
            const dy = right.y - left.y;
            const distanceSquared = dx * dx + dy * dy;
            const minDistance = left.radius + right.radius;

            if (distanceSquared > 0 && distanceSquared < minDistance * minDistance) {
              const distance = Math.sqrt(distanceSquared);
              const nx = dx / distance;
              const ny = dy / distance;
              const overlap = minDistance - distance;
              const correction = overlap * 0.5;
              const relativeVelocityX = right.vx - left.vx;
              const relativeVelocityY = right.vy - left.vy;
              const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;

              left.x -= nx * correction;
              left.y -= ny * correction;
              right.x += nx * correction;
              right.y += ny * correction;

              if (velocityAlongNormal < 0) {
                const impulse = -(1 + diceState.restitution) * velocityAlongNormal * 0.5;
                left.vx -= impulse * nx;
                left.vy -= impulse * ny;
                right.vx += impulse * nx;
                right.vy += impulse * ny;
                left.avz += randomRange(-4, 4);
                right.avz += randomRange(-4, 4);
                left.collisionFlash = 1;
                right.collisionFlash = 1;
              }
            }
          }
        }
      }

      function updateDie(die, deltaSeconds) {
        if (die.settled) {
          die.collisionFlash = Math.max(0, die.collisionFlash - deltaSeconds * 5);
          return;
        }

        die.age += deltaSeconds;
        die.vz += diceState.gravity * deltaSeconds;
        die.x += die.vx * deltaSeconds;
        die.y += die.vy * deltaSeconds;
        die.z -= die.vz * deltaSeconds;
        die.rx += die.avx * deltaSeconds;
        die.ry += die.avy * deltaSeconds;
        die.rz += die.avz * deltaSeconds;
        die.vx *= diceState.airDrag;
        die.vy *= diceState.airDrag;
        die.avx *= diceState.angularDrag;
        die.avy *= diceState.angularDrag;
        die.avz *= diceState.angularDrag;
        die.collisionFlash = Math.max(0, die.collisionFlash - deltaSeconds * 5);

        resolveFloorCollision(die);
        resolveWallCollisions(die);

        const speed = Math.sqrt(die.vx * die.vx + die.vy * die.vy + die.vz * die.vz);
        const angularSpeed = Math.abs(die.avx) + Math.abs(die.avy) + Math.abs(die.avz);

        if (die.z === 0 && speed < 46 * diceState.viewport.dpr && angularSpeed < 0.52) {
          die.restTimer += deltaSeconds;
        } else {
          die.restTimer = 0;
        }

        if (die.restTimer > 0.44 || die.age > 5.5) {
          die.settled = true;
          die.vx = 0;
          die.vy = 0;
          die.vz = 0;
          die.avx = 0;
          die.avy = 0;
          die.avz = 0;
          die.z = 0;
          die.rz = Math.round(die.rz / (Math.PI / 8)) * (Math.PI / 8);
          addHistoryEntry(die);
        }
      }

      function updatePhysics(deltaSeconds) {
        diceState.dice.forEach(function updateSingleDie(die) {
          updateDie(die, deltaSeconds);
        });
        resolveDieCollisions();
      }

      function drawDieShadow(die) {
        const shadowScale = Math.max(0.18, 1 - die.z / (520 * diceState.viewport.dpr));
        const shadowWidth = die.radius * 1.75 * shadowScale;
        const shadowHeight = die.radius * 0.68 * shadowScale;

        diceContext.save();
        diceContext.globalAlpha = 0.18 + shadowScale * 0.22;
        diceContext.fillStyle = "#000000";
        diceContext.beginPath();
        diceContext.ellipse(die.x, die.y + die.radius * 0.68, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
        diceContext.fill();
        diceContext.restore();
      }

      function buildDiePolygon(die) {
        const visual = diceVisuals[die.sides] || diceVisuals[20];
        const vertices = visual.vertices;
        const points = [];
        const projectionScale = 1 + die.z / (900 * diceState.viewport.dpr);
        const wobbleX = Math.cos(die.rx) * 0.18;
        const wobbleY = Math.sin(die.ry) * 0.18;
        const baseRadius = die.radius * projectionScale;

        for (let i = 0; i < vertices; i += 1) {
          const angle = die.rz + (Math.PI * 2 * i) / vertices;
          const radialNoise = 1 + Math.sin(die.rx + i * 1.71) * 0.08 + Math.cos(die.ry + i * 1.13) * 0.06;
          points.push({
            x: die.x + Math.cos(angle) * baseRadius * radialNoise * (1 + wobbleX),
            y: die.y - die.z * 0.32 + Math.sin(angle) * baseRadius * radialNoise * (1 + wobbleY)
          });
        }

        return points;
      }

      function drawDieBody(die) {
        const visual = diceVisuals[die.sides] || diceVisuals[20];
        const points = buildDiePolygon(die);
        const centerY = die.y - die.z * 0.32;
        const gradient = diceContext.createRadialGradient(die.x - die.radius * 0.35, centerY - die.radius * 0.45, die.radius * 0.1, die.x, centerY, die.radius * 1.2);
        const brightness = Math.max(0, Math.min(1, (Math.sin(die.rx) + Math.cos(die.ry) + 2) / 4));

        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.12, visual.accent);
        gradient.addColorStop(0.58, visual.color);
        gradient.addColorStop(1, "#080706");

        diceContext.save();
        diceContext.beginPath();
        points.forEach(function drawPoint(point, index) {
          if (index === 0) {
            diceContext.moveTo(point.x, point.y);
          } else {
            diceContext.lineTo(point.x, point.y);
          }
        });
        diceContext.closePath();
        diceContext.fillStyle = gradient;
        diceContext.fill();
        diceContext.lineWidth = (die.settled ? 2.5 : 1.8) * diceState.viewport.dpr;
        diceContext.strokeStyle = die.collisionFlash > 0 ? "rgba(255, 210, 138, 0.95)" : "rgba(216, 199, 163, 0.72)";
        diceContext.stroke();

        diceContext.globalAlpha = 0.16 + brightness * 0.18;
        diceContext.fillStyle = "#ffffff";
        diceContext.beginPath();
        diceContext.ellipse(die.x - die.radius * 0.24, centerY - die.radius * 0.28, die.radius * 0.24, die.radius * 0.12, die.rz, 0, Math.PI * 2);
        diceContext.fill();
        diceContext.globalAlpha = 1;

        diceContext.fillStyle = "#050403";
        diceContext.font = "700 " + Math.max(15, die.radius * 0.62) + "px Georgia, Times New Roman, serif";
        diceContext.textAlign = "center";
        diceContext.textBaseline = "middle";
        diceContext.shadowColor = "rgba(255, 255, 255, 0.22)";
        diceContext.shadowBlur = 6 * diceState.viewport.dpr;
        diceContext.fillText(String(die.settled ? die.result : die.sides), die.x, centerY + die.radius * 0.03);
        diceContext.shadowBlur = 0;
        diceContext.fillStyle = "rgba(216, 199, 163, 0.88)";
        diceContext.font = "700 " + Math.max(9, die.radius * 0.22) + "px Arial, Helvetica, sans-serif";
        diceContext.fillText(visual.label, die.x, centerY + die.radius * 0.48);
        diceContext.restore();
      }

      function renderDiceFrame() {
        resizeDiceCanvas();
        diceContext.setTransform(1, 0, 0, 1, 0, 0);
        diceContext.clearRect(0, 0, diceCanvas.width, diceCanvas.height);

        diceState.dice.forEach(function drawShadowFirst(die) {
          drawDieShadow(die);
        });

        diceState.dice
          .slice()
          .sort(function sortByHeight(left, right) {
            return right.z - left.z;
          })
          .forEach(function drawDie(die) {
            drawDieBody(die);
          });
      }

      function hasMovingDice() {
        return diceState.dice.some(function checkMoving(die) {
          return !die.settled;
        });
      }

      function tickDice(timestamp) {
        const deltaSeconds = Math.min(0.04, Math.max(0.001, (timestamp - diceState.lastTimestamp) / 1000));
        diceState.lastTimestamp = timestamp;
        updatePhysics(deltaSeconds);
        renderDiceFrame();
        renderDiceUi();

        if (hasMovingDice()) {
          diceState.animationFrame = window.requestAnimationFrame(tickDice);
        } else {
          diceState.running = false;
          diceState.animationFrame = 0;
          renderDiceUi();
        }
      }

      function ensureAnimation() {
        if (diceState.running) {
          return;
        }

        diceState.running = true;
        diceState.lastTimestamp = performance.now();
        diceState.animationFrame = window.requestAnimationFrame(tickDice);
      }

      function calculateHistoryTotal() {
        return diceState.history.reduce(function sumHistory(total, entry) {
          return total + entry.result;
        }, 0);
      }

      function renderDiceHistory() {
        const list = getElement("diceRollListSummary");
        if (!list) {
          return;
        }

        clearNode(list);

        diceState.history.slice(0, 5).forEach(function appendHistory(entry) {
          const row = document.createElement("div");
          const face = document.createElement("span");
          const name = document.createElement("span");
          const value = document.createElement("span");

          row.className = "dice-roll-row";
          face.className = "dice-roll-face";
          face.textContent = entry.label;
          name.className = "dice-roll-name";
          name.textContent = "Risultato " + entry.settledAt;
          value.className = "dice-roll-value";
          value.textContent = String(entry.result);

          row.appendChild(face);
          row.appendChild(name);
          row.appendChild(value);
          list.appendChild(row);
        });
      }

      function renderDiceUi() {
        const moving = hasMovingDice();
        const settledCount = diceState.dice.filter(function countSettled(die) {
          return die.settled;
        }).length;
        const activeText = moving ? "rolling" : "idle";

        setText("diceCountSummary", diceState.dice.length);
        setText("diceTotalSummary", calculateHistoryTotal());
        setText("diceMotionSummary", activeText);
        setText("dicePhysicsStatus", activeText);
        setText("diceModePill", "Dadi: " + activeText);
        renderDiceHistory();

        if (!moving && diceState.dice.length > 0 && settledCount === diceState.dice.length) {
          const latest = diceState.history[0];
          if (latest && window.UltimateVTTModule2 && window.UltimateVTTModule2.showDiceHud) {
            if (latest.id !== diceState.lastHudHistoryId) {
              diceState.lastHudHistoryId = latest.id;
              window.UltimateVTTModule2.showDiceHud(latest.sides, latest.result);
            }
          }
        }
      }

      function bindDiceControls() {
        const clearButton = getElement("diceClearButton");
        const setButton = getElement("diceThrowSetButton");

        Array.prototype.slice.call(document.querySelectorAll("[data-physics-die]")).forEach(function bindPhysicsDie(button) {
          button.addEventListener("click", function handlePhysicsDieClick() {
            launchDie(clampNumber(button.getAttribute("data-physics-die"), 4, 20, 20));
          });
        });

        Array.prototype.slice.call(document.querySelectorAll(".dice-button[data-die]")).forEach(function bindExistingDieButton(button) {
          button.addEventListener("click", function handleExistingDieClick() {
            launchDie(clampNumber(button.getAttribute("data-die"), 4, 20, 20));
          });
        });

        if (clearButton) {
          clearButton.addEventListener("click", clearDice);
        }

        if (setButton) {
          setButton.addEventListener("click", function handleDiceSetClick() {
            launchDiceSet([20, 6]);
          });
        }
      }

      function initializeDiceEngine() {
        resizeDiceCanvas();
        bindDiceControls();
        renderDiceFrame();
        renderDiceUi();
        window.addEventListener("resize", function handleDiceResize() {
          resizeDiceCanvas();
          renderDiceFrame();
        });
      }

      window.UltimateVTTDice3D = {
        getState: function getDiceState() {
          return cloneData(diceState);
        },
        launchDie: launchDie,
        launchDiceSet: launchDiceSet,
        clearDice: clearDice,
        rollDieValue: rollDieValue,
        renderDiceFrame: renderDiceFrame
      };

      initializeDiceEngine();

      window.UltimateVTT.registerModule(8, {
        dice3d: true,
        pureJavaScriptPhysics: true,
        supportedDice: [4, 6, 8, 10, 12, 20],
        screenCollisions: true,
        diceCanvas: true
      });

      appendLog("Modulo 8 caricato: motore dadi 3D con fisica pura e collisioni a schermo.");
    })();
    // --- FINE MODULO 8 JS: 3D DICE ENGINE, FISICA PURA, CADUTA E COLLISIONI A SCHERMO ---
  