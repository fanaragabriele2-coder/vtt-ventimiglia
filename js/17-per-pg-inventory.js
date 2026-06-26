// --- MODULO INVENTARIO PER-PG: ogni personaggio ha il proprio zaino ---
// Al cambio di PG attivo (rilevato via subscribe dello stato), salva l'inventario
// del PG uscente e ripristina quello del PG entrante. Al primo passaggio su un PG
// senza inventario salvato, materializza il kit di classe dal menu di creazione.
(function vttPerPgInventory(){
  "use strict";

  var lastOwner = null;

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
    // altrimenti: nessun dato noto, mantieni l'inventario corrente
  }
  function onActiveChange(newId){
    if (!newId || newId === lastOwner) return;
    saveCurrentTo(lastOwner);
    restoreFor(newId);
    lastOwner = newId;
  }

  function boot(){
    lastOwner = activeId();
    try { window.UltimateVTTState && window.UltimateVTTState.subscribe && window.UltimateVTTState.subscribe(function(){ onActiveChange(activeId()); }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.VTTPerPgInventory = { saveCurrentTo: saveCurrentTo, restoreFor: restoreFor };
})();
// --- FINE MODULO INVENTARIO PER-PG ---
