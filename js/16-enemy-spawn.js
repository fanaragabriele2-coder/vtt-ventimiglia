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

    // A combattimento GIA' attivo lo spawn viene IGNORATO: il Master IA, istruito a emettere
    // "spawn" quando compaiono nemici, tendeva a ripeterlo in OGNI risposta sullo scontro in corso
    // (non sa che sono gia' comparsi) — ogni messaggio aggiungeva un'altra ondata di goblin
    // duplicati al tracker. I nemici si evocano SOLO all'inizio dello scontro; a scontro finito
    // il Master puo' evocarne di nuovi per un nuovo combattimento.
    try { if (Combat.getState && Combat.getState().active) return; } catch (eAttivo) {}

    // ENCOUNTER BALANCER (modulo 37): prima di far comparire i nemici, ridimensiona quantita' e
    // statistiche in base al party reale (numero, livello, HP correnti), cosi' un PG solitario non
    // viene circondato da 10 goblin e non si generano TPK accidentali. Retrocompatibile: se il
    // modulo non c'e', si spawna la lista com'e'. Ogni tipo puo' portare "overrides" con le stat
    // scalate, passati ad addNpc.
    var overridesPerTipo = {};
    try {
      if (window.UltimateVTTEncounterBalancer && window.UltimateVTTEncounterBalancer.bilanciaPerGioco) {
        var bil = window.UltimateVTTEncounterBalancer.bilanciaPerGioco(list);
        if (bil && Array.isArray(bil.lista) && bil.lista.length) {
          list = bil.lista;
          bil.lista.forEach(function (t) { overridesPerTipo[idFor(t.name)] = t.overrides || null; });
        }
      }
    } catch (eBil) { /* bilanciamento best-effort: in caso di errore si spawna la lista originale */ }

    var base = pcCell();
    // Distanza TATTICA: i nemici compaiono a 4-7 celle dal party (non piu' addosso), cosi' il
    // posizionamento e il movimento (pulsante Sposta, ostacoli, altura) contano davvero, come in
    // BG3: la distanza sulla griglia e' quella reale che separa PG e nemici.
    var offsets = [[5,0],[-5,1],[0,5],[0,-5],[4,4],[-4,-4],[6,2],[-6,-1],[4,-4],[-4,4],[7,0],[-2,6]];
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
      var overrides = overridesPerTipo[cid] || null;
      for (var c=0;c<count;c++){
        var comb = null, tok = null;
        try { comb = Combat.addNpc(cid, overrides); } catch (err) {}
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
    // Annuncio raggruppato ("3× Goblin, 1× Orco"), non un nome ripetuto per ogni copia.
    var perNome = {};
    names.forEach(function(n){ perNome[n] = (perNome[n] || 0) + 1; });
    var annuncio = Object.keys(perNome).map(function(n){ return perNome[n] + "× " + n; }).join(", ");
    try { if (window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.appendChatMessage) window.UltimateVTTCoreGameplay.appendChatMessage("system", "⚔️ Nemici comparsi: " + annuncio + "! Il combattimento ha inizio."); } catch (e) {}
    try { if (window.VTTCampagna && window.VTTCampagna.isActive && window.VTTCampagna.isActive() && window.VTTCampagna.spawnEnemyNearPg) window.VTTCampagna.spawnEnemyNearPg(names); } catch (e) {}
    return names;
  }

  window.VTTSpawn = { spawn: spawn, idFor: idFor };
})();
// --- FINE MODULO SPAWN NEMICI ---
