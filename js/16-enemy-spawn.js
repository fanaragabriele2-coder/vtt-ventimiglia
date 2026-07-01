// --- MODULO SPAWN NEMICI: il Master fa comparire i nemici nel punto indicato ---
// Riceve una lista [{name/type, count}] dal Master (campo "spawn" del JSON),
// aggiunge i nemici al combat tracker e li mostra come token sulla griglia
// tattica vicino al PG, e come marker sulla mappa di Ventimiglia se attiva.
(function vttEnemySpawn(){
  "use strict";

  function bestiary(){ return (window.UltimateVTTCombat && window.UltimateVTTCombat.npcCatalog) || []; }
  function idFor(name){
    var n = String(name || "").toLowerCase().trim();
    var b = bestiary();
    for (var i=0;i<b.length;i++){ if (b[i].id === n) return b[i].id; }
    for (var j=0;j<b.length;j++){ if (b[j].name.toLowerCase() === n) return b[j].id; }
    for (var k=0;k<b.length;k++){ if (n && n.indexOf(b[k].name.toLowerCase()) >= 0) return b[k].id; }
    return b.length ? b[0].id : null; // fallback (primo del bestiario)
  }
  function templateById(id){ var b = bestiary(); for (var i=0;i<b.length;i++){ if (b[i].id === id) return b[i]; } return null; }

  function pcCell(){
    var cell = { cellX: 16, cellY: 12 };
    try {
      var ts = window.UltimateVTTTokenPhysics && window.UltimateVTTTokenPhysics.getState && window.UltimateVTTTokenPhysics.getState();
      var pc = ts && (ts.tokens || []).filter(function(t){ return t.id === "token-pc"; })[0];
      if (pc) cell = { cellX: pc.cellX, cellY: pc.cellY };
    } catch (e) {}
    return cell;
  }

  function spawn(list){
    if (!list) return;
    if (!Array.isArray(list)) list = [list];
    if (!list.length) return;
    var Combat = window.UltimateVTTCombat, TP = window.UltimateVTTTokenPhysics;
    if (!Combat || !Combat.addNpc) return;

    var base = pcCell();
    var offsets = [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[1,1],[-1,1],[1,-1],[-1,-1],[2,1],[-2,-1]];
    var k = 0, names = [];

    // Prima si AGGIUNGONO i nemici, POI si avvia il combattimento (sotto): cosi' l'iniziativa viene
    // tirata includendo i nemici appena comparsi. (Con l'ordine inverso — startCombat prima di
    // addNpc — i nemici restavano fuori dall'ordine di iniziativa, con initiative 0.)
    list.forEach(function(e){
      if (!e) return;
      var count = Math.max(1, Math.min(8, parseInt(e.count, 10) || 1));
      var cid = idFor(e.name || e.type || e.id);
      var tmpl = templateById(cid);
      var label = tmpl ? tmpl.name : (e.name || "Nemico");
      for (var c=0;c<count;c++){
        var comb = null, tok = null;
        try { comb = Combat.addNpc(cid); } catch (err) {}
        var off = offsets[k % offsets.length]; k++;
        try { if (TP && TP.addToken) tok = TP.addToken(label, base.cellX + off[0], base.cellY + off[1], "#8f1d18"); } catch (err2) {}
        // Collega esplicitamente il token appena creato (id "token-extra-N") al combattente
        // (id "npc-N"): l'euristica di default della FSM mappa solo "token-npc-N" <-> "npc-N", che
        // NON combacia con i token generati qui — senza questo collegamento l'IA dei nemici (e le
        // azioni BG3 spinta/superfici/elevazione mirate) non riuscirebbero a trovare la posizione
        // del nemico sulla griglia.
        try {
          if (comb && tok && window.UltimateVTTCombatFSM && window.UltimateVTTCombatFSM.impostaMappaToken) {
            window.UltimateVTTCombatFSM.impostaMappaToken(tok.id, comb.id);
          }
        } catch (err3) {}
        names.push(label);
      }
    });

    if (!names.length) return;

    // Avvia il combattimento (con l'iniziativa che ora include i nemici) solo se non e' gia' attivo.
    try { var cs = Combat.getState(); if (!cs.active && Combat.startCombat) Combat.startCombat(); } catch (e) {}
    try { if (window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.appendChatMessage) window.UltimateVTTCoreGameplay.appendChatMessage("system", "⚔️ Nemici comparsi: " + names.join(", ") + "! Apri FIGHT per il combattimento."); } catch (e) {}
    try { if (window.VTTCampagna && window.VTTCampagna.isActive && window.VTTCampagna.isActive() && window.VTTCampagna.spawnEnemyNearPg) window.VTTCampagna.spawnEnemyNearPg(names); } catch (e) {}
    return names;
  }

  window.VTTSpawn = { spawn: spawn, idFor: idFor };
})();
// --- FINE MODULO SPAWN NEMICI ---
