    // --- INIZIO MODULO START MENU + CREAZIONE PERSONAGGIO ---
    (function vttStartMenu(){
      "use strict";
      var RACES = [
        { id:"umano",     name:"Umano",      bonus:{str:1,dex:1,con:1,int:1,wis:1,cha:1}, speed:9,   desc:"+1 a tutte le caratteristiche" },
        { id:"elfo",      name:"Elfo",       bonus:{dex:2},        speed:9,   skill:"perception",  desc:"+2 DES, scurovisione, percezione" },
        { id:"nano",      name:"Nano",       bonus:{con:2},        speed:7.5, desc:"+2 COS, scurovisione, resist. veleno" },
        { id:"halfling",  name:"Halfling",   bonus:{dex:2},        speed:7.5, desc:"+2 DES, fortunato, agile" },
        { id:"mezzorco",  name:"Mezzorco",   bonus:{str:2,con:1},  speed:9,   skill:"intimidation", desc:"+2 FOR +1 COS, resist. feroce" },
        { id:"tiefling",  name:"Tiefling",   bonus:{cha:2,int:1},  speed:9,   desc:"+2 CAR +1 INT, resist. fuoco" },
        { id:"draconide", name:"Draconide",  bonus:{str:2,cha:1},  speed:9,   desc:"+2 FOR +1 CAR, soffio draconico" },
        { id:"gnomo",     name:"Gnomo",      bonus:{int:2},        speed:7.5, desc:"+2 INT, scurovisione, astuzia" }
      ];
      var CLASSES = [
        { id:"guerriero", name:"Guerriero", hitDie:10, saves:["str","con"], skills:["athletics","perception"],
          arr:{str:15,con:14,dex:13,wis:12,cha:10,int:8},
          equip:[{c:"longsword",q:1,slot:"mainHand"},{c:"shield",q:1,slot:"offHand"},{c:"chainShirt",q:1,slot:"armor"},{c:"healingPotion",q:2},{c:"rations",q:5},{c:"torch",q:4}],
          desc:"d10 HP, mischia robusta" },
        { id:"barbaro", name:"Barbaro", hitDie:12, saves:["str","con"], skills:["athletics","intimidation"],
          arr:{str:15,con:14,dex:13,wis:10,cha:8,int:8},
          equip:[{c:"longsword",q:1,slot:"mainHand"},{c:"dagger",q:2},{c:"leatherArmor",q:1,slot:"armor"},{c:"healingPotion",q:2},{c:"rations",q:5}],
          desc:"d12 HP, ira e forza" },
        { id:"ladro", name:"Ladro", hitDie:8, saves:["dex","int"], skills:["stealth","sleightOfHand"],
          arr:{dex:15,int:14,con:13,wis:12,cha:10,str:8},
          equip:[{c:"shortsword",q:1,slot:"mainHand"},{c:"dagger",q:2},{c:"leatherArmor",q:1,slot:"armor"},{c:"thievesTools",q:1},{c:"healingPotion",q:1},{c:"rope",q:1}],
          desc:"d8 HP, furtivita e colpi precisi" },
        { id:"ranger", name:"Ranger", hitDie:10, saves:["str","dex"], skills:["survival","nature"],
          arr:{dex:15,con:14,wis:13,str:12,int:10,cha:8},
          equip:[{c:"shortbow",q:1,slot:"mainHand"},{c:"shortsword",q:1},{c:"leatherArmor",q:1,slot:"armor"},{c:"healingPotion",q:1},{c:"rations",q:5}],
          desc:"d10 HP, distanza e natura" },
        { id:"mago", name:"Mago", hitDie:6, saves:["int","wis"], skills:["arcana","investigation"],
          arr:{int:15,con:14,dex:13,wis:12,cha:10,str:8}, spellcaster:true,
          spells:["fireBolt","mageHand","magicMissile","shieldSpell"], slots:{1:2},
          equip:[{c:"quarterstaff",q:1,slot:"mainHand"},{c:"arcaneFocus",q:1,slot:"offHand"},{c:"healingPotion",q:1},{c:"torch",q:2}],
          desc:"d6 HP, incantesimi arcani" },
        { id:"chierico", name:"Chierico", hitDie:8, saves:["wis","cha"], skills:["medicine","religion"],
          arr:{wis:15,con:14,str:13,cha:12,int:10,dex:8}, spellcaster:true,
          spells:["cureWounds","guidance","healingWord","bless"], slots:{1:2},
          equip:[{c:"quarterstaff",q:1,slot:"mainHand"},{c:"shield",q:1,slot:"offHand"},{c:"chainShirt",q:1,slot:"armor"},{c:"healingPotion",q:2}],
          desc:"d8 HP, cure divine" }
      ];
      var ABIL = [["str","FOR"],["dex","DES"],["con","COS"],["int","INT"],["wis","SAG"],["cha","CAR"]];

      var overlay = document.getElementById("vttStartOverlay");
      var card = document.getElementById("vsmCard");
      var reopenBtn = document.getElementById("vttMenuReopen");
      if(!overlay||!card) return;

      var sel = { raceId:"umano", classId:"guerriero", base:{} };
      var party = [];

      function el(tag, cls, html){ var n=document.createElement(tag); if(cls)n.className=cls; if(html!=null)n.innerHTML=html; return n; }
      function getRace(id){ return RACES.filter(function(r){return r.id===id;})[0]||RACES[0]; }
      function getClass(id){ return CLASSES.filter(function(c){return c.id===id;})[0]||CLASSES[0]; }
      function mod(v){ return Math.floor((v-10)/2); }
      function fmtMod(v){ return v>=0? "+"+v : ""+v; }
      function itemCat(){ return (window.UltimateVTTInventory && window.UltimateVTTInventory.itemCatalog) || []; }
      function findItem(id){ var c=itemCat(); for(var i=0;i<c.length;i++){ if(c[i].id===id) return c[i]; } return null; }

      function finalAbilities(){
        var r=getRace(sel.raceId), out={};
        ABIL.forEach(function(a){ var k=a[0]; var b=(sel.base[k]!=null?sel.base[k]:10)+( (r.bonus&&r.bonus[k])||0 ); out[k]=Math.max(1,Math.min(20,b)); });
        return out;
      }
      function computeAC(fa, equip){
        var dexMod=mod(fa.dex), ac=10+dexMod, shield=0;
        (equip||[]).forEach(function(it){ var c=findItem(it.c); if(!c) return;
          if(it.slot==="armor" && typeof c.armorBase==="number"){ var dc=(c.dexCap==null)?dexMod:Math.min(dexMod,c.dexCap); ac=c.armorBase+dc; }
          if(c.type==="shield" && c.acBonus){ shield+=c.acBonus; }
        });
        return ac+shield;
      }
      function computeHp(fa, cls){ return Math.max(1, cls.hitDie + mod(fa.con)); }

      // ---------- HOME ----------
      function renderHome(){
        card.innerHTML="";
        card.appendChild(el("h1","vsm-title","ULTIMATE VTT 5e"));
        card.appendChild(el("p","vsm-sub","Tavolo Oscuro di Ventimiglia — Master IA, mappa reale e combattimento a turni"));
        var box=el("div","vsm-home-btns");
        var bNew=el("button","vsm-btn","⚔️  NUOVA PARTITA");
        var bLoad=el("button","vsm-btn secondary","💾  CARICA SALVATAGGIO");
        var bCont=el("button","vsm-btn secondary","▶  CONTINUA AL TAVOLO");
        bNew.onclick=function(){ sel.classId="guerriero"; sel.raceId="umano"; sel.base=cloneArr(getClass("guerriero").arr); renderCreate(); };
        bLoad.onclick=function(){
          var b=window.UltimateVTTAIBridge;
          if(b&&b.loadTable){ var res=b.loadTable("slot1");
            if(res&&res.ok){ msg(""); closeOverlay(); }
            else { msg((res&&res.message)||"Nessun salvataggio trovato in slot1."); }
          } else { msg("Sistema di salvataggio non disponibile."); }
        };
        bCont.onclick=function(){ closeOverlay(); };
        box.appendChild(bNew); box.appendChild(bLoad); box.appendChild(bCont);
        card.appendChild(box);
        card.appendChild(el("div","vsm-msg",""));
      }
      function cloneArr(o){ var n={}; Object.keys(o).forEach(function(k){n[k]=o[k];}); return n; }
      function msg(t){ var m=card.querySelector(".vsm-msg"); if(m) m.textContent=t||""; }

      // ---------- CREAZIONE ----------
      function renderCreate(){
        card.innerHTML="";
        card.appendChild(el("h1","vsm-title","Crea il tuo Eroe"));
        card.appendChild(el("p","vsm-sub","Scegli razza e classe: equipaggiamento e bonus si applicano da soli"));

        var nameWrap=el("div"); nameWrap.appendChild(el("label","vsm-label","Nome del personaggio"));
        var nameIn=el("input","vsm-input"); nameIn.id="vsmName"; nameIn.placeholder="Es. Aldric il Coraggioso"; nameIn.value=suggestName();
        nameWrap.appendChild(nameIn); card.appendChild(nameWrap);

        var row=el("div","vsm-row");
        // RAZZA
        var cRace=el("div","vsm-col"); cRace.appendChild(el("label","vsm-label","Razza"));
        var gRace=el("div","vsm-grid");
        RACES.forEach(function(r){
          var p=el("div","vsm-pick"+(r.id===sel.raceId?" active":""),"<span class='pn'>"+r.name+"</span><span class='pd'>"+r.desc+"</span>");
          p.onclick=function(){ sel.raceId=r.id; renderCreate(); };
          gRace.appendChild(p);
        });
        cRace.appendChild(gRace); row.appendChild(cRace);
        // CLASSE
        var cCls=el("div","vsm-col"); cCls.appendChild(el("label","vsm-label","Classe"));
        var gCls=el("div","vsm-grid");
        CLASSES.forEach(function(c){
          var p=el("div","vsm-pick"+(c.id===sel.classId?" active":""),"<span class='pn'>"+c.name+"</span><span class='pd'>"+c.desc+"</span>");
          p.onclick=function(){ sel.classId=c.id; sel.base=cloneArr(c.arr); renderCreate(); };
          gCls.appendChild(p);
        });
        cCls.appendChild(gCls); row.appendChild(cCls);
        card.appendChild(row);

        // ABILITA
        card.appendChild(el("label","vsm-label","Caratteristiche (array standard, modificabili 3–18) + bonus di razza"));
        var r=getRace(sel.raceId);
        var ab=el("div","vsm-abil");
        ABIL.forEach(function(a){
          var k=a[0]; if(sel.base[k]==null) sel.base[k]=10;
          var rb=(r.bonus&&r.bonus[k])||0;
          var fin=Math.max(1,Math.min(20,sel.base[k]+rb));
          var cell=el("div","ab","<b>"+a[1]+"</b>");
          var inp=el("input"); inp.type="number"; inp.min=3; inp.max=18; inp.value=sel.base[k];
          inp.oninput=function(){ var v=parseInt(inp.value,10); if(!isFinite(v))v=10; sel.base[k]=Math.max(3,Math.min(18,v)); var f2=Math.max(1,Math.min(20,sel.base[k]+rb)); var finEl=cell.querySelector(".fin"); if(finEl) finEl.textContent="→ "+f2+" ("+fmtMod(mod(f2))+")"+(rb?" razza +"+rb:""); refreshStats(); };
          cell.appendChild(inp);
          cell.appendChild(el("div","fin","→ "+fin+" ("+fmtMod(mod(fin))+")"+(rb?" razza +"+rb:"")));
          ab.appendChild(cell);
        });
        card.appendChild(ab);

        // STATISTICHE DERIVATE
        var stats=el("div","vsm-stats"); stats.id="vsmStats";
        card.appendChild(stats);
        refreshStats();

        // PARTY GIA CREATO
        if(party.length){
          card.appendChild(el("label","vsm-label","Party ("+party.length+"/4)"));
          var pl=el("div","vsm-party");
          party.forEach(function(pc,i){
            var chip=el("div","pc", "<span>"+pc.name+" · "+pc.raceName+" "+pc.className+"</span>");
            var x=el("button",null,"✕"); x.title="Rimuovi"; x.onclick=function(){ party.splice(i,1); renderCreate(); };
            chip.appendChild(x); pl.appendChild(chip);
          });
          card.appendChild(pl);
        }

        // FOOTER
        var foot=el("div","vsm-foot");
        var bAdd=el("button","vsm-btn secondary","➕  AGGIUNGI AL PARTY"+(party.length>=4?" (max)":""));
        bAdd.disabled=party.length>=4;
        bAdd.onclick=function(){ var b=buildFromForm(); if(b){ party.push(b); renderCreate(); } };
        var bStart=el("button","vsm-btn go","🎲  INIZIA L'AVVENTURA");
        bStart.onclick=function(){
          var solo=buildFromForm();
          var list=party.slice();
          if(solo) list.push(solo);
          if(!list.length){ msg("Crea almeno un personaggio."); return; }
          startAdventure(list);
        };
        var bBack=el("button","vsm-btn secondary","← INDIETRO");
        bBack.onclick=renderHome;
        foot.appendChild(bBack); foot.appendChild(bAdd); foot.appendChild(bStart);
        card.appendChild(foot);
        card.appendChild(el("div","vsm-msg",""));
      }

      function refreshStats(){
        var box=document.getElementById("vsmStats"); if(!box) return;
        var cls=getClass(sel.classId), r=getRace(sel.raceId), fa=finalAbilities();
        var hp=computeHp(fa,cls), ac=computeAC(fa,cls.equip), spd=r.speed;
        box.innerHTML=
          "<div class='s'><b>"+hp+"</b><span>Punti Ferita</span></div>"+
          "<div class='s'><b>"+ac+"</b><span>Classe Armatura</span></div>"+
          "<div class='s'><b>"+spd+"m</b><span>Velocita</span></div>"+
          "<div class='s'><b>1d"+cls.hitDie+"</b><span>Dado Vita</span></div>"+
          "<div class='s'><b>+2</b><span>Competenza</span></div>";
      }

      function suggestName(){
        var n=["Aldric","Brunilde","Cael","Dahlia","Eldon","Fiora","Garrik","Isolde","Joran","Lyra","Magnus","Nyx","Orin","Selene","Thane","Vesper"];
        return n[Math.floor(Math.random()*n.length)];
      }

      function buildFromForm(){
        var nameEl=document.getElementById("vsmName");
        var name=(nameEl&&nameEl.value.trim())||suggestName();
        var cls=getClass(sel.classId), r=getRace(sel.raceId), fa=finalAbilities();
        var id="pc-"+Date.now().toString(36)+"-"+Math.floor(Math.random()*1000);
        return {
          id:id, name:name, classId:cls.id, className:cls.name, raceId:r.id, raceName:r.name,
          finalAbilities:fa, saves:cls.saves, skills:(cls.skills||[]).concat(r.skill?[r.skill]:[]),
          maxHp:computeHp(fa,cls), ac:computeAC(fa,cls.equip), speed:r.speed, hitDie:cls.hitDie,
          equip:cls.equip, spellcaster:!!cls.spellcaster, spells:cls.spells||[], slots:cls.slots||{}
        };
      }

      function buildMember(b){
        var base = (window.UltimateVTTState && window.UltimateVTTState.getState) ? window.UltimateVTTState.getState() : {};
        var m = JSON.parse(JSON.stringify(base||{}));
        m.identity=m.identity||{}; m.abilities=m.abilities||{}; m.skills=m.skills||{}; m.resources=m.resources||{};
        m.identity.id=b.id; m.identity.name=b.name; m.identity.className=b.className; m.identity.ancestry=b.raceName; m.identity.level=1;
        m.proficiencyBonus=2;
        ABIL.forEach(function(a){ var k=a[0]; m.abilities[k]=m.abilities[k]||{}; m.abilities[k].score=b.finalAbilities[k]; m.abilities[k].savingThrowProficient=(b.saves.indexOf(k)>=0); });
        Object.keys(m.skills).forEach(function(s){ if(m.skills[s]) m.skills[s].proficient=false; });
        b.skills.forEach(function(s){ if(m.skills[s]) m.skills[s].proficient=true; });
        m.resources.hp={ current:b.maxHp, max:b.maxHp, temporary:0 };
        m.resources.armorClass=b.ac; m.resources.speedMeters=b.speed;
        m.resources.hitDice={ formula:"1d"+b.hitDie, total:1, remaining:1 };
        return m;
      }

      function clearInventory(){
        var inv=window.UltimateVTTInventory; if(!inv||!inv.getState||!inv.dropInventoryItem) return;
        var guard=0;
        while(guard++<300){
          var st=inv.getState(); if(!st.inventory||!st.inventory.length) break;
          var e=st.inventory[0], q=e.quantity||1;
          for(var i=0;i<q+1;i++){ if(!inv.dropInventoryItem(e.inventoryId)) break; }
        }
      }
      function applyKit(b){
        var inv=window.UltimateVTTInventory; if(!inv||!inv.addInventoryItem) return;
        clearInventory();
        (b.equip||[]).forEach(function(it){ var entry=inv.addInventoryItem(it.c,it.q||1); if(entry&&it.slot&&inv.equipItem){ inv.equipItem(entry.inventoryId,it.slot); } });
        if(b.spellcaster){
          (b.spells||[]).forEach(function(s){ try{ inv.addSpell&&inv.addSpell(s); if(inv.togglePreparedSpell) inv.togglePreparedSpell(s,true); }catch(e){} });
          Object.keys(b.slots||{}).forEach(function(lvl){ try{ inv.setSpellSlot&&inv.setSpellSlot(parseInt(lvl,10),"max",b.slots[lvl]); }catch(e){} });
        }
      }

      function startAdventure(builds){
        window.VTTCharacters=window.VTTCharacters||{byId:{}};
        var members=builds.map(function(b){
          window.VTTCharacters.byId[b.id]={ build:b, progression:{xp:0,level:1,xpToNext:300} };
          return buildMember(b);
        });
        var pd=window.partyData;
        if(pd&&pd.splice){ pd.length=0; members.forEach(function(m){ pd.push(m); }); window.partyData=pd; }
        else { window.partyData=members.slice(); }
        if(window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.switchPartyMember){
          try{ window.UltimateVTTCoreGameplay.switchPartyMember(0,true); }catch(e){ if(window.UltimateVTTState&&window.UltimateVTTState.hydrate) window.UltimateVTTState.hydrate(members[0]); }
        } else if(window.UltimateVTTState && window.UltimateVTTState.hydrate){ window.UltimateVTTState.hydrate(members[0]); }
        applyKit(builds[0]);
        var pill=document.getElementById("activeTurnPill"); if(pill) pill.textContent="TURNO: "+builds[0].name.toUpperCase();
        try{
          if(window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.appendChatMessage){
            window.UltimateVTTCoreGameplay.appendChatMessage("system","🎭 Party pronto: "+builds.map(function(b){return b.name+" ("+b.raceName+" "+b.className+")";}).join(", ")+". Che l'avventura abbia inizio!");
          }
        }catch(e){}
        party=[]; closeOverlay();
        // Il Master saluta il party gia creato (conosce le schede) e avvia l'avventura
        try{
          window.__vttAdventureStarted = true;
          if(window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.triggerPartyWelcome){
            window.setTimeout(function(){ window.UltimateVTTCoreGameplay.triggerPartyWelcome(); }, 400);
          }
        }catch(e){}
      }

      function closeOverlay(){ overlay.classList.add("hidden"); }
      function openOverlay(){ overlay.classList.remove("hidden"); renderHome(); }

      if(reopenBtn){
        reopenBtn.onclick=openOverlay;
        // Sposta il pulsante MENU nella topbar (niente elementi fluttuanti sovrapposti)
        var tr=document.querySelector(".topbar-right");
        if(tr) tr.insertBefore(reopenBtn, tr.firstChild);
      }
      window.VTTStartMenu={ open:openOverlay, close:closeOverlay, applyKitFor:applyKit };

      renderHome();
    })();
    // --- FINE MODULO START MENU + CREAZIONE PERSONAGGIO ---
  