// --- INIZIO MODULO 41 JS: ARMERIA — RARITA', ARMATURE, AMULETI, DROP SCALATI ---
// Sistema di equipaggiamento in stile BG3:
//   - ogni oggetto ha una RARITA' (comune / rara / epica / leggendaria) con colore e bonus;
//   - le armi possono avere ABILITA' (il bonus e' gia' cotto nelle statistiche: danno "+N" e tiro
//     per colpire, letti dal motore combat); armature e amuleti alzano la CA;
//   - i DROP dai nemici scalano con la loro forza (XP/CR): piu' il nemico e' forte, piu' e'
//     probabile che lasci oggetti potenti (il modulo 15 consulta rollDropNemico ad ogni uccisione);
//   - tutto passa dal catalogo dell'inventario (modulo 05, registerCatalogItems): gli oggetti
//     raccolti finiscono nello zaino del PG, si equipaggiano dagli slot, si usano in game
//     dall'inventario e in combattimento dal menu Azione Bonus (modulo 38).
//
// Data-driven (VINCOLO: niente statistiche hardcodate nella logica): rarita' e oggetti sono
// tabelle; aggiungere un'arma leggendaria e' aggiungere una riga, non codice.
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // RARITA' (tabella): bonus alle statistiche, colore UI, soglia di potenza del nemico.
  // ---------------------------------------------------------------------------
  var RARITA = {
    comune:      { ordine: 0, bonus: 0, colore: "#b8ab90", etichetta: "Comune" },
    rara:        { ordine: 1, bonus: 1, colore: "#4fa3ff", etichetta: "Rara" },
    epica:       { ordine: 2, bonus: 2, colore: "#b45cff", etichetta: "Epica" },
    leggendaria: { ordine: 3, bonus: 3, colore: "#ff9e3d", etichetta: "Leggendaria" }
  };

  // ---------------------------------------------------------------------------
  // CATALOGO DELL'ARMERIA. Formato compatibile col catalogo del modulo 05, piu' "rarity" e
  // "ability" (testo dell'abilita'; l'effetto meccanico e' nelle statistiche: damage/+N, acBonus,
  // healing). weightKg contenuti per non sfondare il carico.
  // ---------------------------------------------------------------------------
  var CATALOGO = [
    // --- ARMI RARE ---
    { id: "r-lama-affilata", name: "Lama Affilata", type: "weapon", rarity: "rara", weightKg: 1.4, stackable: false,
      damage: "1d8+1", ability: "Affilata: +1 a colpire e ai danni", properties: "Versatile", compatibleSlots: ["mainHand", "offHand"] },
    { id: "r-arco-lungo-teso", name: "Arco del Doganiere", type: "weapon", rarity: "rara", weightKg: 0.9, stackable: false,
      damage: "1d6+1", ability: "Teso: +1 a colpire e ai danni", properties: "Munizioni, due mani", compatibleSlots: ["mainHand"] },
    { id: "r-pugnale-corsaro", name: "Pugnale del Corsaro", type: "weapon", rarity: "rara", weightKg: 0.4, stackable: false,
      damage: "1d4+1", ability: "Rapido: ideale come arma secondaria", properties: "Accurata, leggera", compatibleSlots: ["mainHand", "offHand"] },
    // --- ARMI EPICHE ---
    { id: "e-lama-corsara", name: "Lama del Corsaro di Ventimiglia", type: "weapon", rarity: "epica", weightKg: 1.3, stackable: false,
      damage: "1d8+2", ability: "Filo di sale: +2 a colpire e ai danni", properties: "Versatile", compatibleSlots: ["mainHand", "offHand"] },
    { id: "e-arco-frontiera", name: "Arco della Frontiera", type: "weapon", rarity: "epica", weightKg: 0.8, stackable: false,
      damage: "1d6+2", ability: "Mira di confine: +2 a colpire e ai danni", properties: "Munizioni, due mani", compatibleSlots: ["mainHand"] },
    // --- ARMI LEGGENDARIE ---
    { id: "l-rovina-goblin", name: "Rovina dei Goblin", type: "weapon", rarity: "leggendaria", weightKg: 1.2, stackable: false,
      damage: "1d8+3", ability: "Terrore dei predoni: +3 a colpire e ai danni", properties: "Versatile", compatibleSlots: ["mainHand", "offHand"] },
    { id: "l-zanna-roya", name: "Zanna del Roya", type: "weapon", rarity: "leggendaria", weightKg: 0.5, stackable: false,
      damage: "1d4+3", ability: "Morso del fiume: +3 a colpire e ai danni", properties: "Accurata, leggera", compatibleSlots: ["mainHand", "offHand"] },
    // --- ARMATURE ---
    { id: "r-cuoio-rinforzato", name: "Cuoio Rinforzato", type: "armor", rarity: "rara", weightKg: 5.5, stackable: false,
      armorBase: 13, dexCap: null, ability: "Rinforzi in ferro", properties: "Leggera", compatibleSlots: ["armor"] },
    { id: "e-giaco-runico", name: "Giaco Runico", type: "armor", rarity: "epica", weightKg: 8.8, stackable: false,
      armorBase: 14, dexCap: 2, ability: "Rune di protezione", properties: "Media, Des max +2", compatibleSlots: ["armor"] },
    { id: "l-corazza-forte", name: "Corazza del Forte dell'Annunziata", type: "armor", rarity: "leggendaria", weightKg: 20, stackable: false,
      armorBase: 17, dexCap: 0, ability: "Bastione portatile", properties: "Pesante", compatibleSlots: ["armor"] },
    // --- AMULETI (slot collo) ---
    { id: "r-amuleto-viandante", name: "Amuleto del Viandante", type: "neck", rarity: "rara", weightKg: 0.1, stackable: false,
      acBonus: 1, ability: "+1 CA", properties: "Un ciondolo di conchiglia", compatibleSlots: ["neck"] },
    { id: "e-talismano-rocca", name: "Talismano della Rocca", type: "neck", rarity: "epica", weightKg: 0.1, stackable: false,
      acBonus: 2, ability: "+2 CA", properties: "Pietra del forte antico", compatibleSlots: ["neck"] },
    { id: "l-occhio-ventimiglia", name: "Occhio di Ventimiglia", type: "neck", rarity: "leggendaria", weightKg: 0.1, stackable: false,
      acBonus: 3, ability: "+3 CA", properties: "Gemma che guarda il confine", compatibleSlots: ["neck"] },
    // --- CONSUMABILI (usabili in game dall'inventario e in combattimento come Azione Bonus) ---
    { id: "r-pozione-maggiore", name: "Pozione di Cura Maggiore", type: "consumable", rarity: "rara", weightKg: 0.25, stackable: true,
      healing: "4d4+4", ability: "Cura 4d4+4 HP", properties: "Cura 4d4+4 HP", compatibleSlots: [] },
    { id: "e-elisir-rinascita", name: "Elisir della Rinascita", type: "consumable", rarity: "epica", weightKg: 0.25, stackable: true,
      healing: "8d4+8", ability: "Cura 8d4+8 HP", properties: "Cura 8d4+8 HP", compatibleSlots: [] }
  ];

  // ---------------------------------------------------------------------------
  // DROP SCALATI SULLA FORZA DEL NEMICO (logica pura, rng iniettabile per i test).
  // potenza = XP 5e del nemico (25 = gregario, 100 = orco/hobgoblin, 450+ = boss).
  // ---------------------------------------------------------------------------
  function probabilitaDrop(potenza) {
    return Math.min(0.85, 0.22 + (potenza || 25) / 260);
  }

  function rollRarita(potenza, rng) {
    rng = rng || Math.random;
    var p = potenza || 25;
    var r = rng();
    var pLeggendaria = Math.min(0.10, p / 2500);
    var pEpica = Math.min(0.22, p / 650);
    var pRara = Math.min(0.50, 0.10 + p / 260);
    if (r < pLeggendaria) { return "leggendaria"; }
    if (r < pLeggendaria + pEpica) { return "epica"; }
    if (r < pLeggendaria + pEpica + pRara) { return "rara"; }
    return "comune";
  }

  function oggettiPerRarita(rarita) {
    return CATALOGO.filter(function (o) { return o.rarity === rarita; });
  }

  // Ritorna gli id degli oggetti dell'armeria lasciati cadere dal nemico (0-2). "comune" non
  // genera drop dall'armeria (il bottino comune arriva dalle tabelle base del modulo 15).
  function rollDropNemico(potenza, rng) {
    rng = rng || Math.random;
    var out = [];
    if (rng() >= probabilitaDrop(potenza)) { return out; }
    var rarita = rollRarita(potenza, rng);
    if (rarita !== "comune") {
      var pool = oggettiPerRarita(rarita);
      if (pool.length) { out.push(pool[Math.floor(rng() * pool.length) % pool.length].id); }
    }
    // I nemici molto forti possono lasciare un secondo oggetto.
    if ((potenza || 0) >= 100 && rng() < Math.min(0.35, potenza / 900)) {
      var rar2 = rollRarita(potenza, rng);
      if (rar2 !== "comune") {
        var pool2 = oggettiPerRarita(rar2);
        if (pool2.length) { out.push(pool2[Math.floor(rng() * pool2.length) % pool2.length].id); }
      }
    }
    return out;
  }

  function raritaDi(catalogId) {
    var voce = CATALOGO.filter(function (o) { return o.id === catalogId; })[0];
    return voce ? voce.rarity : null;
  }
  function coloreRarita(rarita) {
    return (RARITA[rarita] || RARITA.comune).colore;
  }

  // ---------------------------------------------------------------------------
  // Registrazione nel catalogo dell'inventario (modulo 05). Retry finche' il modulo esiste.
  // ---------------------------------------------------------------------------
  var registrato = false;
  function registra() {
    if (registrato) { return true; }
    var inv = window.UltimateVTTInventory;
    if (!inv || typeof inv.registerCatalogItems !== "function") { return false; }
    try { inv.registerCatalogItems(CATALOGO); registrato = true; } catch (e) { return false; }
    return registrato;
  }

  var timer = null;
  function inizializza() {
    if (!window.document) { return; }
    if (!registra() && !timer) {
      timer = window.setInterval(function () { if (registra() && timer) { clearInterval(timer); timer = null; } }, 300);
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.registerModule === "function") {
      try { window.UltimateVTT.registerModule(41, { armeria: true, oggetti: CATALOGO.length }); } catch (e) { /* best-effort */ }
    }
    if (window.UltimateVTT && typeof window.UltimateVTT.appendSystemLog === "function") {
      try { window.UltimateVTT.appendSystemLog("Modulo 41 caricato: armeria con rarita' (armi, armature, amuleti) e drop scalati."); } catch (e) { /* ignora */ }
    }
  }

  window.UltimateVTTArmeria = {
    // dati (estendibili)
    RARITA: RARITA,
    CATALOGO: CATALOGO,
    // logica pura (testabile)
    probabilitaDrop: probabilitaDrop,
    rollRarita: rollRarita,
    rollDropNemico: rollDropNemico,
    oggettiPerRarita: oggettiPerRarita,
    raritaDi: raritaDi,
    coloreRarita: coloreRarita,
    // controllo
    registra: registra,
    fermaAggiornamento: function () { if (timer) { clearInterval(timer); timer = null; } }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inizializza);
  } else {
    inizializza();
  }
})();
// --- FINE MODULO 41 JS: ARMERIA ---
