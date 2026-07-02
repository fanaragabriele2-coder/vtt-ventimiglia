// --- MODULO XP & LOOT: progressione PG, livellamento, bottino nemici ---
// Rileva le uccisioni via polling dello stato di combattimento (robusto a
// qualunque percorso interno), assegna XP + oro + oggetti reali del catalogo,
// gestisce il level-up (HP max e competenza) e mostra barra XP + popup loot.
(function vttXpLoot(){
  "use strict";

  // XP per nemico (valori 5e per CR)
  var XP_BY_NAME = { "Goblin":50, "Bandito":25, "Scheletro":50, "Lupo":50, "Orco":100, "Cultista":25, "Zombie":50, "Hobgoblin":100 };
  // XP cumulativi per RAGGIUNGERE il livello (indice 0 = liv 1)
  var LEVEL_XP = [0,300,900,2700,6500,14000,23000,34000,48000,64000,85000,100000,120000,140000,165000,195000,225000,265000,305000,355000];
  function profByLevel(l){ return l>=17?6:l>=13?5:l>=9?4:l>=5?3:2; }

  // tabelle bottino: [catalogId, probabilità]. Solo oggetti reali del catalogo.
  var LOOT_BY_NAME = {
    "Goblin":    [["dagger",.6],["healingPotion",.25],["rations",.4],["torch",.3]],
    "Bandito":   [["shortsword",.4],["dagger",.5],["healingPotion",.3],["rope",.2],["thievesTools",.15]],
    "Scheletro": [["shortbow",.35],["dagger",.4],["torch",.25]],
    "Lupo":      [["rations",.6]],
    "Orco":      [["longsword",.45],["chainShirt",.2],["healingPotion",.3],["rations",.4]],
    "Cultista":  [["dagger",.5],["arcaneFocus",.25],["healingPotion",.35]],
    "Zombie":    [["rations",.3],["torch",.2]],
    "Hobgoblin": [["shortsword",.45],["studdedLeather",.25],["shield",.3],["healingPotion",.4]]
  };
  var LOOT_FALLBACK = [["healingPotion",.3],["dagger",.3],["rations",.4],["torch",.3]];

  function baseName(n){ return String(n||"").replace(/\s+\d+$/,"").trim(); }
  function xpForEnemy(c){
    var bn = baseName(c.name);
    if (XP_BY_NAME[bn] != null) return XP_BY_NAME[bn];
    return Math.max(10, Math.round((c.maxHitPoints || c.hitPoints || 4) * 6));
  }
  function lootForEnemy(c){
    var bn = baseName(c.name);
    var table = LOOT_BY_NAME[bn] || LOOT_FALLBACK;
    var items = [];
    table.forEach(function(row){ if (Math.random() < row[1]) items.push(row[0]); });
    var ref = XP_BY_NAME[bn] || 30;
    var gold = Math.floor(Math.random() * Math.max(3, ref / 8)) + 1;
    return { items: items, gold: gold, enemyName: bn };
  }

  // ---- registro progressione per personaggio ----
  function reg(){ window.VTTCharacters = window.VTTCharacters || { byId:{} }; return window.VTTCharacters; }
  var PROG_LS = "vtt-progression-v1";
  function saveProgLS(){
    try { var data = {}, r = reg().byId; Object.keys(r).forEach(function(id){ if (r[id] && r[id].progression) data[id] = r[id].progression; }); localStorage.setItem(PROG_LS, JSON.stringify(data)); } catch(e){}
  }
  function loadProgLS(){
    try { var raw = localStorage.getItem(PROG_LS); if (!raw) return; var data = JSON.parse(raw); var r = reg(); Object.keys(data).forEach(function(id){ r.byId[id] = r.byId[id] || { build:null, progression:null }; r.byId[id].progression = data[id]; }); } catch(e){}
  }
  function activeState(){ try { return window.UltimateVTTState.getState(); } catch(e){ return null; } }
  function activeId(){ var s = activeState(); return s && s.identity && s.identity.id; }
  function memberById(id){ var p = window.partyData || []; for (var i=0;i<p.length;i++){ if (p[i] && p[i].identity && p[i].identity.id === id) return p[i]; } return null; }
  function nameById(id){ var s = activeState(); if (s && s.identity && s.identity.id === id) return s.identity.name; var m = memberById(id); return (m && m.identity && m.identity.name) || "Eroe"; }
  function levelForXp(xp){ var l=1; for (var i=0;i<LEVEL_XP.length;i++){ if (xp >= LEVEL_XP[i]) l=i+1; } return Math.min(20,l); }
  function getProg(id){
    var r = reg(); if (!id) id = "__anon";
    if (!r.byId[id]) r.byId[id] = { build:null, progression:null };
    var e = r.byId[id];
    if (!e.progression){
      var lvl = (id === activeId()) ? ((activeState()&&activeState().identity.level)||1) : 1;
      e.progression = { xp: LEVEL_XP[Math.max(0,lvl-1)] || 0, level: lvl, gold: 0 };
    }
    if (e.progression.gold == null) e.progression.gold = 0;
    return e.progression;
  }
  function xpBand(prog){
    if (prog.level >= 20) return { cur: prog.xp - LEVEL_XP[19], need: 0, pct: 100 };
    var base = LEVEL_XP[prog.level-1], next = LEVEL_XP[prog.level];
    return { cur: prog.xp - base, need: next - base, pct: Math.min(100, Math.round((prog.xp - base) / (next - base) * 100)) };
  }

  function announce(txt, kind){
    try { if (window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.appendChatMessage) window.UltimateVTTCoreGameplay.appendChatMessage(kind || "system", txt); } catch(e){}
  }

  function applyLevelUp(id, fromLvl, toLvl){
    var prof = profByLevel(toLvl);
    var isActive = (id === activeId());
    var src = isActive ? activeState() : memberById(id);
    var conScore = 10, hitDie = 8;
    try {
      if (src && src.abilities && src.abilities.con) conScore = src.abilities.con.score;
      var hf = src && src.resources && src.resources.hitDice && src.resources.hitDice.formula;
      var m = /d(\d+)/.exec(hf || ""); if (m) hitDie = parseInt(m[1],10);
    } catch(e){}
    var conMod = Math.floor((conScore - 10) / 2);
    var hpGain = 0;
    for (var l = fromLvl + 1; l <= toLvl; l++){ hpGain += Math.max(1, Math.floor(hitDie/2) + 1 + conMod); }

    if (isActive){
      var S = window.UltimateVTTState;
      try { S.setProficiencyBonus && S.setProficiencyBonus(prof); } catch(e){}
      try {
        var nm = (activeState().resources.hp.max || 0) + hpGain;
        S.setMaxHp && S.setMaxHp(nm); S.setCurrentHp && S.setCurrentHp(nm);
      } catch(e){}
      try { var st = S.getState(); st.identity.level = toLvl; S.hydrate && S.hydrate(st); } catch(e){}
    } else {
      var mem = memberById(id);
      if (mem){
        mem.proficiencyBonus = prof;
        if (mem.resources && mem.resources.hp){ mem.resources.hp.max += hpGain; mem.resources.hp.current = mem.resources.hp.max; }
        if (mem.identity) mem.identity.level = toLvl;
      }
    }
    announce("⭐ LIVELLO " + toLvl + "! " + nameById(id) + " sale di livello: +" + hpGain + " HP max, competenza +" + prof + ".");
  }

  // targetId: a chi accreditare l'XP. Se omesso ricade su activeId() (il PG attualmente mostrato in
  // hotseat) — corretto per le ricompense dirette del Master (completeQuest, tag [XP:n] in chat),
  // ma NON per un'uccisione in combattimento: li' l'XP deve andare a chi ha davvero sferrato il
  // colpo, non a chi capita di essere visualizzato quando il polling se ne accorge (vedi onEnemyDefeated).
  function gainXp(amount, reason, targetId){
    amount = Math.max(0, Math.round(amount || 0));
    if (!amount) return;
    var id = targetId || activeId(); var p = getProg(id);
    var from = p.level;
    p.xp += amount;
    announce("✨ +" + amount + " XP" + (reason ? (" — " + reason) : "") + " (" + nameById(id) + ").");
    var to = levelForXp(p.xp);
    if (to > from){ p.level = to; applyLevelUp(id, from, to); }
    renderXpBar(); saveProgLS();
  }
  function completeQuest(name, xp){ gainXp(xp || 100, "missione" + (name ? ": " + name : "") + " completata"); }

  // ---- bottino ----
  var lootQueue = [];
  function itemName(catId){
    var cat = (window.UltimateVTTInventory && window.UltimateVTTInventory.itemCatalog) || [];
    for (var i=0;i<cat.length;i++){ if (cat[i].id === catId) return cat[i].name; }
    return catId;
  }
  function onEnemyDefeated(c, killerId){
    gainXp(xpForEnemy(c), "sconfitto " + baseName(c.name), killerId);
    var loot = lootForEnemy(c);
    if (loot.items.length || loot.gold){ lootQueue.push(loot); showNextLoot(); }
  }

  // ---- attribuzione dell'uccisione: chi ha davvero sferrato il colpo, non chi e' attivo ora ----
  // combatState.lastRoll.title e' impostato da OGNI risoluzione di attacco (sia il resolver classico
  // a due fasi sia resolveAttack() della HUD BG3) nel formato "NomeAttaccante vs NomeBersaglio" —
  // path-agnostico, stesso principio gia' usato dal modulo 29 per la memoria di combattimento.
  function attaccanteDelBersaglio(lastRoll, nomeBersaglio){
    var titolo = lastRoll && lastRoll.title;
    if (typeof titolo !== "string" || !nomeBersaglio) return null;
    var suffisso = " vs " + nomeBersaglio;
    if (titolo.length <= suffisso.length || titolo.slice(-suffisso.length) !== suffisso) return null;
    return titolo.slice(0, titolo.length - suffisso.length);
  }
  // Il tracker di combattimento (js/06) ha UN SOLO slot per PG, sempre con id fisso "pc-local":
  // solo il NOME viene risincronizzato a chi e' attivo in hotseat (syncPlayerCombatantFromState),
  // l'id no. Percio' NON si puo' usare l'id del combattente per accreditare l'XP (sarebbe sempre
  // "pc-local", un id fantasma su cui nessuna scheda/barra XP e' mai mostrata): si risale invece al
  // vero id di progressione cercando il NOME nel roster hotseat (window.partyData), l'unico posto
  // dove nome e id-di-progressione reale sono entrambi presenti insieme.
  function trovaMembroPerNome(nome){
    if (!nome) return null;
    var lista = window.partyData || [];
    for (var i = 0; i < lista.length; i++){
      var m = lista[i];
      if (m && m.identity && m.identity.name === nome) return m.identity.id;
    }
    return null;
  }
  function collectLoot(loot){
    var inv = window.UltimateVTTInventory;
    (loot.items || []).forEach(function(id){ try { inv && inv.addInventoryItem && inv.addInventoryItem(id, 1); } catch(e){} });
    if (loot.gold){ var p = getProg(activeId()); p.gold = (p.gold || 0) + loot.gold; }
    var parts = (loot.items || []).map(itemName);
    if (loot.gold) parts.push(loot.gold + " oro");
    announce("🎒 Raccolto da " + loot.enemyName + ": " + (parts.join(", ") || "nulla") + ".");
    renderXpBar(); saveProgLS();
  }

  // ================= UI =================
  function injectStyle(){
    if (document.getElementById("vttXpLootStyle")) return;
    var s = document.createElement("style"); s.id = "vttXpLootStyle";
    s.textContent =
      "#vttXpBar{display:flex;flex-direction:column;justify-content:center;width:188px;font-family:Arial,Helvetica,sans-serif;" +
        "background:rgba(18,16,14,.72);border:1px solid rgba(200,155,60,.4);" +
        "border-radius:8px;padding:4px 9px;color:#d8c7a3;}" +
      "#vttXpBar .xb-top{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:3px;}" +
      "#vttXpBar .xb-lvl{font-weight:700;color:#c89b3c;}" +
      "#vttXpBar .xb-name{font-size:11px;color:#b99f6b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:96px;}" +
      "#vttXpBar .xb-track{height:9px;background:rgba(0,0,0,.5);border-radius:5px;overflow:hidden;border:1px solid rgba(216,199,163,.16);}" +
      "#vttXpBar .xb-fill{height:100%;background:linear-gradient(90deg,#5bb7c8,#c89b3c);transition:width .4s;}" +
      "#vttXpBar .xb-bot{display:flex;justify-content:space-between;font-size:10px;color:#b99f6b;margin-top:4px;}" +
      "#vttLootPop{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(6,5,4,.66);font-family:Arial,Helvetica,sans-serif;}" +
      "#vttLootPop.show{display:flex;}" +
      "#vttLootPop .lp-card{width:min(380px,92vw);background:linear-gradient(180deg,rgba(36,32,28,.98),rgba(12,10,9,.98));border:1px solid rgba(200,155,60,.55);border-radius:12px;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.7);color:#d8c7a3;}" +
      "#vttLootPop .lp-title{font-family:Georgia,serif;font-size:21px;color:#c89b3c;text-align:center;margin:0 0 4px;}" +
      "#vttLootPop .lp-sub{text-align:center;font-size:12px;color:#b99f6b;margin:0 0 14px;}" +
      "#vttLootPop .lp-item{display:flex;align-items:center;gap:8px;padding:8px 10px;margin:6px 0;border-radius:7px;background:rgba(9,7,6,.7);border:1px solid rgba(216,199,163,.16);font-size:14px;}" +
      "#vttLootPop .lp-gold{color:#e8c451;}" +
      "#vttLootPop .lp-btns{display:flex;gap:10px;margin-top:16px;}" +
      "#vttLootPop .lp-btn{flex:1;cursor:pointer;border-radius:8px;padding:12px;font-size:14px;font-weight:700;border:1px solid rgba(200,155,60,.55);" +
        "background:linear-gradient(180deg,rgba(40,110,60,.85),rgba(15,55,25,.95));color:#e2ffd9;}" +
      "#vttLootPop .lp-btn.leave{background:linear-gradient(180deg,rgba(40,40,46,.85),rgba(18,18,22,.95));color:#d8c7a3;border-color:rgba(216,199,163,.25);}";
    document.head.appendChild(s);
  }
  function ensureBar(){
    if (document.getElementById("vttXpBar")) return;
    injectStyle();
    var d = document.createElement("div"); d.id = "vttXpBar";
    d.innerHTML = '<div class="xb-top"><span class="xb-lvl" id="xbLvl">Liv 1</span><span class="xb-name" id="xbName">Eroe</span></div>' +
      '<div class="xb-track"><div class="xb-fill" id="xbFill" style="width:0%"></div></div>' +
      '<div class="xb-bot"><span id="xbXp">0 / 300 XP</span><span id="xbGold">🪙 0</span></div>';
    var host = document.querySelector(".topbar-center") || document.querySelector(".topbar") || document.body;
    host.appendChild(d);
  }
  function renderXpBar(){
    ensureBar();
    var id = activeId(); var p = getProg(id); var b = xpBand(p);
    var set = function(i,t){ var e=document.getElementById(i); if(e) e.textContent=t; };
    set("xbLvl", "Liv " + p.level);
    set("xbName", nameById(id));
    set("xbXp", p.level >= 20 ? "MAX" : (b.cur + " / " + b.need + " XP"));
    set("xbGold", "🪙 " + (p.gold || 0));
    var f = document.getElementById("xbFill"); if (f) f.style.width = b.pct + "%";
  }

  function ensurePop(){
    if (document.getElementById("vttLootPop")) return;
    injectStyle();
    var d = document.createElement("div"); d.id = "vttLootPop";
    d.innerHTML = '<div class="lp-card"><h3 class="lp-title">Bottino</h3><div class="lp-sub" id="lpSub"></div>' +
      '<div id="lpItems"></div><div class="lp-btns">' +
      '<button class="lp-btn" id="lpTake">Raccogli tutto</button>' +
      '<button class="lp-btn leave" id="lpLeave">Lascia</button></div></div>';
    document.body.appendChild(d);
    d.querySelector("#lpTake").addEventListener("click", function(){ if (currentLoot) collectLoot(currentLoot); closePop(); });
    d.querySelector("#lpLeave").addEventListener("click", function(){ closePop(); });
  }
  var currentLoot = null;
  function showNextLoot(){
    if (currentLoot) return;
    var loot = lootQueue.shift(); if (!loot) return;
    currentLoot = loot;
    ensurePop();
    var sub = document.getElementById("lpSub"); if (sub) sub.textContent = loot.enemyName + " sconfitto";
    var box = document.getElementById("lpItems");
    if (box){
      var rows = (loot.items || []).map(function(id){ return '<div class="lp-item">⚔️ ' + itemName(id) + '</div>'; });
      if (loot.gold) rows.push('<div class="lp-item lp-gold">🪙 ' + loot.gold + ' monete d\'oro</div>');
      if (!rows.length) rows.push('<div class="lp-item">Nessun oggetto.</div>');
      box.innerHTML = rows.join("");
    }
    document.getElementById("vttLootPop").classList.add("show");
  }
  function closePop(){
    var p = document.getElementById("vttLootPop"); if (p) p.classList.remove("show");
    currentLoot = null;
    if (lootQueue.length) setTimeout(showNextLoot, 250);
  }

  // ================= rilevamento uccisioni (polling) =================
  var deadSet = {}; var initialized = false;
  function pollCombat(){
    var C = window.UltimateVTTCombat; if (!C || !C.getState) return;
    var st; try { st = C.getState(); } catch(e){ return; }
    var combatants = (st && st.combatants) || [];
    var seen = {};
    combatants.forEach(function(c){
      seen[c.id] = true;
      var dead = c.defeated || c.hitPoints <= 0;
      if (c.kind === "npc"){
        if (dead && !deadSet[c.id]){
          deadSet[c.id] = true;
          if (initialized){
            var nomeUccisore = attaccanteDelBersaglio(st.lastRoll, c.name);
            onEnemyDefeated(c, trovaMembroPerNome(nomeUccisore));
          }
        }
        else if (!dead && deadSet[c.id]){ deadSet[c.id] = false; }
      }
    });
    Object.keys(deadSet).forEach(function(id){ if (!seen[id]) delete deadSet[id]; });
    initialized = true;
  }

  // ================= quest XP via tag [XP:n] / [QUEST:nome] nei messaggi Master =================
  function watchChat(){
    var log = document.getElementById("masterChatLog"); if (!log) return;
    var obs = new MutationObserver(function(muts){
      muts.forEach(function(m){
        for (var i=0;i<m.addedNodes.length;i++){
          var n = m.addedNodes[i]; var t = (n.textContent || "");
          var xm = t.match(/\[XP:(\d+)\]/i); if (xm) gainXp(parseInt(xm[1],10), "ricompensa del Master");
          var qm = t.match(/\[QUEST:([^\]]+)\]/i); if (qm) completeQuest(qm[1].trim(), 100);
        }
      });
    });
    obs.observe(log, { childList: true, subtree: true });
  }

  // API pubblica
  window.VTTProgression = {
    gainXp: gainXp, completeQuest: completeQuest, getProg: getProg,
    renderXpBar: renderXpBar, _onEnemyDefeated: onEnemyDefeated,
    // logica pura (testabile): attribuzione dell'uccisione al vero autore del colpo, non a chi e'
    // attivo in hotseat quando il polling se ne accorge.
    attaccanteDelBersaglio: attaccanteDelBersaglio,
    trovaMembroPerNome: trovaMembroPerNome,
    // utile ai test: esegue un ciclo di polling reale (lo stesso richiamato da setInterval)
    _pollCombat: function () { pollCombat(); }
  };

  function boot(){
    loadProgLS();
    ensureBar(); renderXpBar(); watchChat();
    window.setInterval(pollCombat, 600);
    // riallinea la barra quando cambia il PG attivo
    try { window.UltimateVTTState && window.UltimateVTTState.subscribe && window.UltimateVTTState.subscribe(function(){ renderXpBar(); }); } catch(e){}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
// --- FINE MODULO XP & LOOT ---
