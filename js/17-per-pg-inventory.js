// --- MODULO INVENTARIO PER-PG: ogni personaggio ha il proprio zaino ---
// Al cambio di PG attivo (rilevato via subscribe dello stato), salva l'inventario
// del PG uscente e ripristina quello del PG entrante. Al primo passaggio su un PG
// senza inventario salvato, materializza il kit di classe dal menu di creazione.
(function vttPerPgInventory(){
  "use strict";

  var lastOwner = null;
  // Kit di partenza di riferimento, catturato una sola volta all'avvio (prima di qualunque hydrate):
  // usato come fallback per un PG senza inventario salvato NE' build (es. aggiunto in hotseat con
  // "+ Aggiungi giocatore", js/12, che non passa dalla creazione personaggio e quindi non ha un
  // record "build" in VTTCharacters.byId). Prima di questo fallback, restoreFor() non faceva NULLA
  // in quel caso ("mantieni l'inventario corrente") — lo zaino del PG USCENTE restava visibile e
  // modificabile sotto l'identita' del PG entrante, un bug silenzioso in ogni sessione hotseat con
  // membri aggiunti al volo.
  var inventarioIniziale = null;

  function inv(){ return window.UltimateVTTInventory; }
  function regById(){ window.VTTCharacters = window.VTTCharacters || { byId:{} }; return window.VTTCharacters.byId; }
  function activeId(){ try { return window.UltimateVTTState.getState().identity.id; } catch (e) { return null; } }

  function saveCurrentTo(id){
    if (!id) return;
    var I = inv(); if (!I || !I.getState) return;
    var r = regById();
    r[id] = r[id] || { build:null, progression:null };
    r[id].inventory = I.getState();
  }
  function restoreFor(id){
    var I = inv(); if (!I) return;
    var rec = regById()[id];
    if (rec && rec.inventory && I.hydrate){ I.hydrate(rec.inventory); }
    else if (rec && rec.build && window.VTTStartMenu && window.VTTStartMenu.applyKitFor){
      window.VTTStartMenu.applyKitFor(rec.build);
      if (I.getState) rec.inventory = I.getState();
    }
    else if (inventarioIniziale && I.hydrate){ I.hydrate(inventarioIniziale); }
    // altrimenti (nessun kit di riferimento nemmeno catturato): mantieni l'inventario corrente.
  }
  function onActiveChange(newId){
    if (!newId || newId === lastOwner) return;
    saveCurrentTo(lastOwner);
    restoreFor(newId);
    lastOwner = newId;
  }

  function boot(){
    lastOwner = activeId();
    try { if (inv() && inv().getState) { inventarioIniziale = inv().getState(); } } catch (e) {}
    try { window.UltimateVTTState && window.UltimateVTTState.subscribe && window.UltimateVTTState.subscribe(function(){ onActiveChange(activeId()); }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.VTTPerPgInventory = { saveCurrentTo: saveCurrentTo, restoreFor: restoreFor };
})();
// --- FINE MODULO INVENTARIO PER-PG ---
