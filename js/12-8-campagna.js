/*
 * Modulo campagna: luoghi, teletrasporto, spawn dei nemici.
 *
 * Estratto da 12-patch-touch-events-per-mobile.js, che conteneva sette moduli
 * indipendenti in un unico file da 3600 righe, sotto un nome che ne descriveva
 * solo uno. L'ordine di caricamento e' quello originale: i file 12-1 … 12-8
 * vanno inclusi in sequenza in index.html.
 */

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
  