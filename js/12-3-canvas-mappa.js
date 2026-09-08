/*
 * Modulo canvas: rendering della mappa e della griglia.
 *
 * Estratto da 12-patch-touch-events-per-mobile.js, che conteneva sette moduli
 * indipendenti in un unico file da 3600 righe, sotto un nome che ne descriveva
 * solo uno. L'ordine di caricamento e' quello originale: i file 12-1 … 12-8
 * vanno inclusi in sequenza in index.html.
 */

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
