/*
 * Mappa reale di Ventimiglia (Leaflet) e sincronizzazione dei token.
 *
 * Estratto da 12-patch-touch-events-per-mobile.js, che conteneva sette moduli
 * indipendenti in un unico file da 3600 righe, sotto un nome che ne descriveva
 * solo uno. L'ordine di caricamento e' quello originale: i file 12-1 … 12-8
 * vanno inclusi in sequenza in index.html.
 */

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
