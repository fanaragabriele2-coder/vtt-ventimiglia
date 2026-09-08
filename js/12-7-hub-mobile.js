/*
 * Hub mobile: schede PG, statistiche, azioni rapide.
 *
 * Estratto da 12-patch-touch-events-per-mobile.js, che conteneva sette moduli
 * indipendenti in un unico file da 3600 righe, sotto un nome che ne descriveva
 * solo uno. L'ordine di caricamento e' quello originale: i file 12-1 … 12-8
 * vanno inclusi in sequenza in index.html.
 */

    // =====================================================================
    // MODULO MOBILE HUB — Layout unificato: mappa · chat · scheda · combat
    // =====================================================================
    (function initMobileHub() {
      "use strict";

      var hub = { map: null, mapReady: false, activeTab: "chat", syncTimer: null, chatMirrorTimer: null };

      var GROQ_LS   = "ultimate-vtt-groq-api-key";
      var GROQ_URL  = "https://api.groq.com/openai/v1/chat/completions";
      var GROQ_MOD  = "llama-3.3-70b-versatile";
      var CAMP_CENTER = [43.7870, 7.6075];
      var STAT_LABELS = { str:"FOR", dex:"DES", con:"COS", int:"INT", wis:"SAG", cha:"CAR",
                          strength:"FOR", dexterity:"DES", constitution:"COS",
                          intelligence:"INT", wisdom:"SAG", charisma:"CAR" };
      function mmod(v) { var n=parseInt(v,10)||10; return Math.floor((n-10)/2); }
      function sgn(n) { return (n>=0?"+":"")+n; }
      function el(id) { return document.getElementById(id); }
      function clamp(v,a,b) { return Math.max(a,Math.min(b,v)); }

      /* ── Attiva / disattiva hub ── */
      function openHub() {
        document.body.classList.add("hub-active");
        renderSync();
        initHubMap();
        hub.syncTimer = setInterval(renderSync, 1200);
        hub.chatMirrorTimer = setInterval(mirrorChat, 800);
      }
      function closeHub() {
        document.body.classList.remove("hub-active");
        clearInterval(hub.syncTimer);
        clearInterval(hub.chatMirrorTimer);
      }

      /* ── Tab switching ── */
      function switchTab(name) {
        hub.activeTab = name;
        document.querySelectorAll(".hub-tab").forEach(function(b) { b.classList.toggle("is-active", b.dataset.panel===name); });
        document.querySelectorAll(".hub-panel").forEach(function(p) { p.classList.remove("is-active"); });
        var panel = el("hubPanel"+(name.charAt(0).toUpperCase()+name.slice(1)));
        if (panel) panel.classList.add("is-active");
        /* nav bar */
        document.querySelectorAll(".hub-nav-btn[data-nav]").forEach(function(b) { b.classList.toggle("is-active", b.dataset.nav===name); });
        /* lazy-render */
        if (name==="pg") renderPgPanel();
        if (name==="combat") renderCombatPanel();
        if (name==="map") {
          if (hub.map) setTimeout(function() { hub.map.invalidateSize({animate:false}); }, 120);
        }
      }

      /* ── Sync status bar ── */
      function renderSync() {
        var party = window.partyData || [];
        var v = window.vttReadPg(party[0], 0);
        var name = v.name;
        var hp = v.hp;
        var maxHp = v.maxHp;
        var color = v.color;
        var hpPct = maxHp>0 ? clamp(hp/maxHp*100,0,100) : 0;
        var hpColor = hpPct>50?"#5d9f45":hpPct>25?"#c89b3c":"#c9362b";

        if (el("hubPgColor")) { el("hubPgColor").textContent=name[0]||"E"; el("hubPgColor").style.background=color; }
        if (el("hubPgNameTxt")) el("hubPgNameTxt").textContent=name;
        if (el("hubPgHpFill")) { el("hubPgHpFill").style.width=hpPct+"%"; el("hubPgHpFill").style.background=hpColor; }
        if (el("hubPgHpNum")) el("hubPgHpNum").textContent=hp+"/"+maxHp;

        /* round combat */
        var cs = window.UltimateVTTCombat ? window.UltimateVTTCombat.getState() : null;
        var round = cs && cs.active ? cs.round : "—";
        if (el("hubRoundNum")) el("hubRoundNum").textContent=round;

        /* zona (da campaign module se attivo) */
        var zone = (window.VTTCampagna && window._hubZone) ? window._hubZone : "Ventimiglia";
        if (el("hubZoneTxt")) el("hubZoneTxt").textContent=zone;

        /* aggiorna marker PG sulla mappa hub */
        if (hub.pgMarker) {
          hub.pgMarker.setIcon(makePgIcon(color, name[0].toUpperCase(), hp, maxHp, name));
        }

        /* refresh pannello attivo */
        if (hub.activeTab==="combat") renderCombatPanel();
        if (hub.activeTab==="pg") {
          /* solo se il pannello è già renderizzato */
          syncPgHpBars();
        }
      }

      /* ── MAPPA HUB ── */
      function loadLeaflet(cb) {
        if (window.L) { cb(); return; }
        var css=document.createElement("link"); css.rel="stylesheet";
        css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
        var scr=document.createElement("script"); scr.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        scr.onload=cb; document.head.appendChild(scr);
      }

      function makePgIcon(color, initial, hp, maxHp, name) {
        var pct = maxHp>0 ? clamp(Math.round(hp/maxHp*100),0,100) : 100;
        var bc = pct>50?"#5d9f45":pct>25?"#c89b3c":"#c9362b";
        var label = name ? '<div style="margin-top:7px;max-width:108px;padding:1px 7px;border-radius:5px;background:rgba(9,7,6,.9);border:1px solid rgba(200,155,60,.55);color:#f0d472;font:700 10px/1.15 Georgia,serif;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px rgba(0,0,0,.6)">'+name+'</div>' : '';
        return window.L.divIcon({
          html: '<div style="display:flex;flex-direction:column;align-items:center;width:110px">' +
                '<div style="position:relative;width:36px">' +
                '<div style="width:36px;height:36px;border-radius:50%;background:'+color+';'+
                'border:2.5px solid rgba(255,255,255,.75);display:flex;align-items:center;justify-content:center;'+
                'font-weight:700;font-size:16px;color:#fff;box-shadow:0 0 0 2px rgba(200,155,60,.7),0 2px 10px rgba(0,0,0,.6);'+
                'font-family:Georgia,serif">'+initial+'</div>'+
                '<div style="position:absolute;bottom:-5px;left:0;right:0;height:4px;background:#1a1510;border-radius:3px;overflow:hidden">'+
                '<div style="height:100%;width:'+pct+'%;background:'+bc+'"></div></div></div>'+
                label +
                '</div>',
          className:"", iconSize:[110, name?60:42], iconAnchor:[55,18]
        });
      }

      function initHubMap() {
        var div = el("hubMapDiv"); if (!div) return;
        if (!window.L) { setTimeout(initHubMap, 300); return; }
        if (hub.map) { hub.map.invalidateSize({animate:false}); return; }
        var v = window.vttReadPg(window.partyData && window.partyData[0], 0);
        var color = v.color, name = v.name;
        /* Forza dimensioni pixel prima di L.map() */
        var wrap = el("hubMapWrap");
        var wW = wrap ? wrap.offsetWidth  : window.innerWidth;
        var wH = wrap ? wrap.offsetHeight : Math.round(window.innerHeight*0.38);
        div.style.width = wW+"px"; div.style.height = wH+"px";
        hub.map = window.L.map(div, { center:CAMP_CENTER, zoom:16, zoomControl:true, attributionControl:false, tap:true, tapTolerance:15 });
        var tl = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, crossOrigin:true });
        tl.on("tileload", function() { var ld=el("hubMapLoading"); if(ld) ld.classList.add("tiles-loaded"); });
        tl.addTo(hub.map);
        setTimeout(function() {
          var tp = div.querySelector(".leaflet-tile-pane");
          if (tp) tp.style.cssText="filter:brightness(.68) saturate(.7) contrast(1.2) sepia(.22);";
        }, 700);
        /* Ripristina CSS */
        setTimeout(function() { div.style.width=""; div.style.height=""; hub.map&&hub.map.invalidateSize({animate:false}); }, 250);
        hub.map.zoomControl.setPosition("bottomright");
        hub.pgMarker = window.L.marker(CAMP_CENTER, {
          icon: makePgIcon(color, name[0]||"E", v.hp, v.maxHp, name),
          interactive: false, zIndexOffset:1000
        }).addTo(hub.map);
        var POIS=[[43.7879,7.6059],[43.7877,7.6055],[43.7868,7.6074],[43.7861,7.6107],[43.7836,7.6052],[43.7842,7.6072],[43.7914,7.5990],[43.7888,7.6044]];
        POIS.forEach(function(ll) {
          window.L.circleMarker(ll,{radius:4,color:"rgba(200,155,60,.8)",fillColor:"rgba(200,155,60,.6)",fillOpacity:1,weight:1,interactive:false}).addTo(hub.map);
        });
        hub.mapReady=true;
        var doR=function(){hub.map&&hub.map.invalidateSize({animate:false});};
        setTimeout(doR,150); setTimeout(doR,500); setTimeout(doR,1000);
        setInterval(function() {
          if (!hub.mapReady||!hub.map) return;
          var vc = window.VTTCampagna;
          if (vc && vc._state && vc._state.pgPos) {
            var pos=vc._state.pgPos;
            hub.pgMarker.setLatLng([pos.lat,pos.lng]);
            hub.map.panTo([pos.lat,pos.lng],{animate:false});
          }
        }, 1000);
      }

      /* ── CHAT: mirror dal masterChatLog ── */
      var lastChatCount = 0;
      function mirrorChat() {
        var src = el("masterChatLog"); if (!src) return;
        var msgs = src.querySelectorAll(".master-chat-message");
        if (msgs.length===lastChatCount) return;
        lastChatCount = msgs.length;
        var log = el("hubChatLog"); if (!log) return;
        log.innerHTML="";
        var recent = Array.prototype.slice.call(msgs).slice(-20);
        recent.forEach(function(m) {
          var speaker = m.querySelector(".master-chat-speaker");
          var txt = m.querySelector("p");
          if (!speaker || !txt) return;
          var spk = speaker.textContent.trim();
          var isUser = m.classList.contains("user") || spk==="Tu";
          var isSys  = m.classList.contains("system") || spk==="Sistema";
          var row = document.createElement("div"); row.className="hub-msg";
          var av  = document.createElement("div"); av.className="hub-msg-av";
          av.textContent = isUser?"⭐":isSys?"⚙":"🧙";
          var body= document.createElement("div"); body.className="hub-msg-body";
          var who = document.createElement("div"); who.className="hub-msg-who"; who.textContent=spk;
          var bub = document.createElement("div");
          bub.className="hub-msg-txt"+(isUser?" pg":isSys?" sys":"");
          bub.textContent=txt.textContent;
          body.appendChild(who); body.appendChild(bub);
          row.appendChild(av); row.appendChild(body); log.appendChild(row);
        });
        log.scrollTop=log.scrollHeight;
      }

      /* Invio messaggio (usa il sistema chat esistente) */
      function sendHubChat() {
        var inp=el("hubChatInputField"); if(!inp) return;
        var txt=inp.value.trim(); if(!txt) return;
        inp.value="";
        var realInput=el("masterChatInput"); var realForm=el("masterChatForm");
        if(realInput && realForm) {
          realInput.value=txt;
          realForm.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
          return;
        }
        /* fallback: Groq diretto */
        var key=""; try{key=localStorage.getItem(GROQ_LS)||"";}catch(e){}
        if (!key) { addHubMsg("Sistema","(Configura GROQ nella topbar per le risposte del DM)","sys"); return; }
        addHubMsg("Tu",txt,"pg");
        addHubMsg("DM","…","dm");
        fetch(GROQ_URL,{ method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
          body:JSON.stringify({model:GROQ_MOD,max_tokens:150,messages:[
            {role:"system",content:"Sei il DM di una campagna D&D 5e a Ventimiglia, dark fantasy. Rispondi in italiano, 2-3 frasi."},
            {role:"user",content:txt}
          ]})
        }).then(function(r){return r.json();}).then(function(d){
          var log=el("hubChatLog"); if(!log) return;
          var last=log.lastElementChild;
          var reply=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
          if(last){var b=last.querySelector(".hub-msg-txt");if(b)b.textContent=reply||"…";}
        }).catch(function(){});
      }
      function addHubMsg(who,txt,type) {
        var log=el("hubChatLog"); if(!log) return;
        var row=document.createElement("div"); row.className="hub-msg";
        var av=document.createElement("div"); av.className="hub-msg-av";
        av.textContent=type==="pg"?"⭐":type==="sys"?"⚙":"🧙";
        var body=document.createElement("div"); body.className="hub-msg-body";
        var wh=document.createElement("div"); wh.className="hub-msg-who"; wh.textContent=who;
        var bub=document.createElement("div"); bub.className="hub-msg-txt"+(type==="pg"?" pg":type==="sys"?" sys":"");
        bub.textContent=txt;
        body.appendChild(wh); body.appendChild(bub); row.appendChild(av); row.appendChild(body); log.appendChild(row);
        log.scrollTop=log.scrollHeight;
      }

      /* ── SCHEDA PG ── */
      function renderPgPanel() {
        var party=window.partyData||[]; if(!party.length){if(el("hubPgContent"))el("hubPgContent").innerHTML='<p style="color:var(--gold);padding:16px">Nessun personaggio creato.</p>';return;}
        /* Selezione PG */
        var sel=el("hubPgSelect"); if(sel){
          sel.innerHTML=party.map(function(pg,i){
            var c=["#5bb7c8","#c89b3c","#5d9f45","#7b59c4"][i%4];
            return '<button class="hub-pg-btn'+(i===0?" is-active":"")+'" data-idx="'+i+'">'+
                   '<span class="hub-pg-btn-dot" style="background:'+c+'"></span>'+
                   /* Il nome sta in identity.name: leggerlo da pg.name faceva
                      comparire "PG1" al posto del nome scelto dal giocatore.
                      Stessa formula gia' usata in 01-adattatore-party. */
                   window.UltimateVTTUtils.escapeHtml(
                     (pg.identity && pg.identity.name) || pg.name || ("PG"+(i+1))
                   )+'</button>';
          }).join("");
          sel.querySelectorAll(".hub-pg-btn").forEach(function(b){
            b.addEventListener("click",function(){
              sel.querySelectorAll(".hub-pg-btn").forEach(function(x){x.classList.remove("is-active");});
              b.classList.add("is-active");
              renderPgContent(parseInt(b.dataset.idx,10));
            });
          });
        }
        renderPgContent(0);
      }
      function renderPgContent(idx) {
        var party=window.partyData||[]; var pg=party[idx]; if(!pg) return;
        var cont=el("hubPgContent"); if(!cont) return;
        var V=window.vttReadPg(pg, idx);
        var hp=V.hp, maxHp=V.maxHp;
        var hpPct=maxHp>0?clamp(hp/maxHp*100,0,100):0;
        var hpC=hpPct>50?"#5d9f45":hpPct>25?"#c89b3c":"#c9362b";
        var stats=["str","dex","con","int","wis","cha"];
        var statsHtml=stats.map(function(k){
          var v=V.abil[k];
          return '<div class="hub-stat"><span class="hub-stat-label">'+(STAT_LABELS[k]||k.toUpperCase())+'</span>'+
                 '<span class="hub-stat-val">'+v+'</span><span class="hub-stat-mod">'+sgn(mmod(v))+'</span></div>';
        }).join("");
        cont.innerHTML=
          '<div class="hub-hp-block">'+
            '<div class="hub-hp-top"><span class="hub-hp-name">'+window.UltimateVTTUtils.escapeHtml(V.name)+'</span>'+
            '<span class="hub-hp-vals">❤️ '+hp+'/'+maxHp+' &nbsp;🛡 '+(V.ac!=null?V.ac:'—')+'</span></div>'+
            '<div class="hub-hp-bar-full"><div class="hub-hp-bar-fill" style="width:'+hpPct+'%;background:'+hpC+'"></div></div>'+
          '</div>'+
          '<div class="hub-section-title">Caratteristiche</div>'+
          '<div class="hub-stats-grid">'+statsHtml+'</div>'+
          '<div class="hub-section-title">Azioni rapide</div>'+
          '<div class="hub-quick-actions">'+
            '<button class="hub-qa-btn dmg" id="hqDmg'+idx+'">⚔️ Attacca</button>'+
            '<button class="hub-qa-btn" id="hqHeal'+idx+'">💊 Cura (+1d6)</button>'+
            '<button class="hub-qa-btn" id="hqProva'+idx+'">🎲 Prova</button>'+
          '</div>';
        var dmgB=cont.querySelector("#hqDmg"+idx);
        var healB=cont.querySelector("#hqHeal"+idx);
        var provB=cont.querySelector("#hqProva"+idx);
        if(dmgB) dmgB.addEventListener("click",function(){switchTab("combat");});
        if(healB) healB.addEventListener("click",function(){
          var r=Math.floor(Math.random()*6)+1;
          var cur=window.vttReadPg(pg, idx); var nh=clamp(cur.hp+r,0,cur.maxHp); window.vttWritePgHp(pg, nh);
          addHubMsg("Sistema","💊 "+cur.name+" cura "+r+" PF → "+nh+"/"+cur.maxHp,"sys");
          renderSync();
          renderPgContent(idx);
        });
        if(provB) provB.addEventListener("click",function(){showProvaDialog(pg);});
      }
      function syncPgHpBars() { /* aggiorna solo le barre senza re-render completo */ }

      /* Dialog prova abilità rapida */
      function showProvaDialog(pg) {
        var abil=[["FOR","str"],["DES","dex"],["COS","con"],["INT","int"],["SAG","wis"],["CAR","cha"]];
        var chosen=abil[Math.floor(Math.random()*6)];
        var stat=pg[chosen[1]]||10, bonus=mmod(stat), roll=Math.floor(Math.random()*20)+1, tot=roll+bonus;
        addHubMsg("Sistema","🎲 Prova di "+chosen[0]+": d20("+roll+")"+sgn(bonus)+" = "+tot,"sys");
        addHubMsg("DM",tot>=15?"Un successo notevole! Prosegui con fiducia.":tot>=10?"Ce la fai, ma a caro prezzo.":"Fallisci. Le conseguenze si fanno sentire.","dm");
      }

      /* ── COMBAT PANEL ── */
      function renderCombatPanel() {
        var cont=el("hubCombatContent"); if(!cont) return;
        var cs=window.UltimateVTTCombat?window.UltimateVTTCombat.getState():null;
        if(!cs||!cs.active){
          cont.innerHTML=
            '<p style="color:var(--gold);font-family:Georgia,serif;padding:8px 0 12px">Nessun combattimento attivo.</p>'+
            '<div class="hub-combat-actions">'+
              '<button class="hub-ca-btn full primary" id="hcRoll">⚔️ Tira Iniziativa</button>'+
            '</div>';
          var rb=cont.querySelector("#hcRoll");
          if(rb) rb.addEventListener("click",function(){
            var b=el("moduleFiveRollInitiativeButton"); if(b){b.click(); setTimeout(renderCombatPanel,400);}
          });
          return;
        }
        var cur=cs.combatants[cs.currentTurnIndex]||{};
        var dotColor=cur.kind==="pc"?"#5bb7c8":"#c9362b";
        var initHtml=cs.combatants.map(function(c,i){
          var isCur=i===cs.currentTurnIndex, isDead=c.defeated||c.hitPoints<=0;
          var dc=c.kind==="pc"?"#5bb7c8":"#c9362b";
          var hpPct=c.maxHitPoints>0?clamp(c.hitPoints/c.maxHitPoints*100,0,100):0;
          return '<div class="hub-init-row'+(isCur?" is-current":"")+(!isDead?"":' is-dead')+'">'+
                 '<div class="hub-init-dot" style="background:'+dc+'">'+c.name[0]+'</div>'+
                 '<span class="hub-init-name">'+c.name+'</span>'+
                 '<span class="hub-init-init">'+c.initiative+'</span>'+
                 '<span class="hub-init-hp">❤️'+c.hitPoints+'</span>'+
                 '</div>';
        }).join("");

        /* Build target options */
        var enemies=cs.combatants.filter(function(c){return c.kind!=="pc"&&!c.defeated&&c.hitPoints>0;});
        var tgtHtml=enemies.map(function(e){return '<option value="'+e.id+'">'+e.name+' ('+e.hitPoints+' HP)</option>';}).join("");

        cont.innerHTML=
          '<div class="hub-turn-banner">'+
            '<div class="hub-turn-dot" style="background:'+dotColor+'">'+cur.name[0]+'</div>'+
            '<div class="hub-turn-info"><div class="hub-turn-name">'+cur.name+'</div>'+
            '<div class="hub-turn-sub">Round '+cs.round+' &nbsp;·&nbsp; '+(cur.hitPoints||0)+'/'+(cur.maxHitPoints||0)+' HP &nbsp;·&nbsp; Init '+cur.initiative+'</div>'+
            '</div></div>'+
          '<div class="hub-section-title">Ordine iniziativa</div>'+
          '<div class="hub-init-list">'+initHtml+'</div>'+
          (tgtHtml?'<div class="hub-section-title">Bersaglio</div>'+
            '<select id="hubTgtSel" class="hub-target-sel" style="width:100%;background:rgba(20,16,10,.8);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:#d8c7a3;margin-bottom:6px;font-family:inherit;">'+tgtHtml+'</select>':'')+
          '<div class="hub-combat-actions">'+
            '<button class="hub-ca-btn primary" id="hcAtk">⚔️ Attacca</button>'+
            '<button class="hub-ca-btn" id="hcNext">▶ Prossimo</button>'+
            '<button class="hub-ca-btn danger" id="hcEnd">⛔ Fine Combat.</button>'+
          '</div>';

        cont.querySelector("#hcAtk")&&cont.querySelector("#hcAtk").addEventListener("click",function(){
          /* sincronizza target */
          var sel=cont.querySelector("#hubTgtSel");
          if(sel){var mainSel=el("moduleFiveTargetSelect");if(mainSel){mainSel.value=sel.value;}}
          /* click sul pulsante originale che triggera resolveAttackStep1 */
          var btn=el("moduleFiveAttackButton"); if(btn) btn.click();
        });
        cont.querySelector("#hcNext")&&cont.querySelector("#hcNext").addEventListener("click",function(){
          if(window.UltimateVTTCombat) window.UltimateVTTCombat.nextTurn();
          setTimeout(renderCombatPanel,300);
        });
        cont.querySelector("#hcEnd")&&cont.querySelector("#hcEnd").addEventListener("click",function(){
          if(window.UltimateVTTCombat) window.UltimateVTTCombat.endCombat();
          setTimeout(renderCombatPanel,300);
        });
      }

      /* ── WIRING ── */
      function wire() {
        /* Back button */
        var back=el("hubBackBtn"); if(back) back.addEventListener("click",function(){closeHub();});
        if(el("hubNavVTT")) el("hubNavVTT").addEventListener("click",function(){closeHub();});

        /* Tab strip */
        document.querySelectorAll(".hub-tab[data-panel]").forEach(function(b){
          b.addEventListener("click",function(){ switchTab(b.dataset.panel); });
        });
        /* Bottom nav */
        document.querySelectorAll(".hub-nav-btn[data-nav]").forEach(function(b){
          b.addEventListener("click",function(){
            if(b.dataset.nav==="map"){ switchTab("chat"); /* mostra mappa espansa */ if(hub.map) setTimeout(function(){hub.map.invalidateSize({animate:false});},50); return; }
            switchTab(b.dataset.nav);
          });
        });

        /* Chat send */
        var sf=el("hubChatSendBtn"); if(sf) sf.addEventListener("click",sendHubChat);
        var ci=el("hubChatInputField"); if(ci) ci.addEventListener("keydown",function(e){ if(e.key==="Enter"){e.preventDefault();sendHubChat();} });

        /* Launch campagna */
        var cl=el("hubCampLaunch"); if(cl) cl.addEventListener("click",function(){
          if(window.VTTCampagna) window.VTTCampagna.activate();
        });

        /* Bottone Hub nel topbar VTT (aggiunto dinamicamente) */
        setTimeout(addHubButton, 400);
      }

      function addHubButton() {
        if (el("hubLaunchBtn")) return; /* già aggiunto */
        var ref = el("campLaunchBtn");
        if (!ref) { setTimeout(addHubButton, 300); return; }
        var btn = document.createElement("button");
        btn.id = "hubLaunchBtn";
        btn.className = "hud-button";
        btn.type = "button";
        btn.title = "Apri Hub Mobile (mappa + chat + scheda)";
        btn.style.cssText = "min-width:80px;border-color:rgba(200,155,60,.7);background:linear-gradient(180deg,rgba(60,42,8,.8),rgba(25,17,3,.9));color:#f0d472;font-weight:700;";
        btn.textContent = "📱 HUB";
        btn.addEventListener("click", openHub);
        ref.parentNode.insertBefore(btn, ref.nextSibling);
      }

      /* ── Auto-attivazione su mobile ── */
      function autoCheck() {
        if (window.innerWidth < 780 && !document.body.classList.contains("hub-active")) {
          openHub();
        }
      }

      document.addEventListener("DOMContentLoaded", function() {
        wire();
        /* piccolo delay per far caricare tutto prima di aprire l'hub */
        setTimeout(autoCheck, 600);
      });
      window.addEventListener("load", function() { if (window.innerWidth<780) openHub(); });

      /* ── Esporta per uso esterno ── */
      window.MobileHub = { open: openHub, close: closeHub, switchTab: switchTab };

    })();
    // === FINE MODULO MOBILE HUB ===
