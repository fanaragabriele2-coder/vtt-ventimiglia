    // --- INIZIO MODULO 4 JS: ACTION ECONOMY, INVENTARIO, EQUIPAGGIAMENTO, PESO, SPELLBOOK ---
    (function initializeUltimateVttModuleFour() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 4 richiede il Modulo 1.");
      }

      if (!window.UltimateVTTState) {
        throw new Error("UltimateVTT Module 4 richiede il Modulo 3.");
      }

      const equipmentSlotDefinitions = [
        { key: "mainHand", label: "Mano primaria", accepts: ["weapon", "focus"] },
        { key: "offHand", label: "Mano secondaria", accepts: ["weapon", "shield", "focus"] },
        { key: "armor", label: "Armatura", accepts: ["armor"] },
        { key: "head", label: "Testa", accepts: ["head"] },
        { key: "neck", label: "Collo", accepts: ["neck"] },
        { key: "cloak", label: "Mantello", accepts: ["cloak"] },
        { key: "hands", label: "Mani", accepts: ["hands"] },
        { key: "ringLeft", label: "Anello sx", accepts: ["ring"] },
        { key: "ringRight", label: "Anello dx", accepts: ["ring"] },
        { key: "feet", label: "Piedi", accepts: ["feet"] }
      ];

      const itemCatalog = [
        { id: "longsword", name: "Spada Lunga", type: "weapon", weightKg: 1.4, stackable: false, damage: "1d8", properties: "Versatile 1d10", compatibleSlots: ["mainHand", "offHand"] },
        { id: "shortsword", name: "Spada Corta", type: "weapon", weightKg: 0.9, stackable: false, damage: "1d6", properties: "Accurata, leggera", compatibleSlots: ["mainHand", "offHand"] },
        { id: "dagger", name: "Pugnale", type: "weapon", weightKg: 0.45, stackable: true, damage: "1d4", properties: "Accurata, leggera, lancio", compatibleSlots: ["mainHand", "offHand"] },
        { id: "quarterstaff", name: "Bastone Ferrato", type: "weapon", weightKg: 1.8, stackable: false, damage: "1d6", properties: "Versatile 1d8", compatibleSlots: ["mainHand", "offHand"] },
        { id: "shortbow", name: "Arco Corto", type: "weapon", weightKg: 0.9, stackable: false, damage: "1d6", properties: "Munizioni, due mani", compatibleSlots: ["mainHand"] },
        { id: "arcaneFocus", name: "Focus Arcano", type: "focus", weightKg: 0.45, stackable: false, damage: "", properties: "Focus da incantatore", compatibleSlots: ["mainHand", "offHand"] },
        { id: "shield", name: "Scudo", type: "shield", weightKg: 2.7, stackable: false, acBonus: 2, damage: "", properties: "+2 CA", compatibleSlots: ["offHand"] },
        { id: "leatherArmor", name: "Armatura di Cuoio", type: "armor", weightKg: 4.5, stackable: false, armorBase: 11, dexCap: null, properties: "Leggera", compatibleSlots: ["armor"] },
        { id: "studdedLeather", name: "Cuoio Borchiato", type: "armor", weightKg: 5.9, stackable: false, armorBase: 12, dexCap: null, properties: "Leggera", compatibleSlots: ["armor"] },
        { id: "chainShirt", name: "Giaco di Maglia", type: "armor", weightKg: 9.1, stackable: false, armorBase: 13, dexCap: 2, properties: "Media, Des max +2", compatibleSlots: ["armor"] },
        { id: "chainMail", name: "Cotta di Maglia", type: "armor", weightKg: 24.9, stackable: false, armorBase: 16, dexCap: 0, properties: "Pesante", compatibleSlots: ["armor"] },
        { id: "healingPotion", name: "Pozione di Cura", type: "consumable", weightKg: 0.25, stackable: true, healing: "2d4+2", damage: "", properties: "Cura 2d4+2 HP", compatibleSlots: [] },
        { id: "rations", name: "Razioni", type: "gear", weightKg: 0.9, stackable: true, damage: "", properties: "Una giornata di cibo", compatibleSlots: [] },
        { id: "rope", name: "Corda 15 m", type: "gear", weightKg: 4.5, stackable: false, damage: "", properties: "Canapa", compatibleSlots: [] },
        { id: "torch", name: "Torcia", type: "gear", weightKg: 0.45, stackable: true, damage: "1 fuoco", properties: "Illumina 6 m", compatibleSlots: [] },
        { id: "thievesTools", name: "Arnesi da Scasso", type: "tools", weightKg: 0.45, stackable: false, damage: "", properties: "Strumenti", compatibleSlots: [] }
      ];

      const spellCatalog = [
        { id: "fireBolt", name: "Fire Bolt", level: 0, school: "Evocazione", castingTime: "action", range: "36 m", effect: "1d10 fuoco" },
        { id: "rayOfFrost", name: "Ray of Frost", level: 0, school: "Evocazione", castingTime: "action", range: "18 m", effect: "1d8 freddo, -3 m velocita" },
        { id: "mageHand", name: "Mage Hand", level: 0, school: "Evocazione", castingTime: "action", range: "9 m", effect: "Mano spettrale" },
        { id: "guidance", name: "Guidance", level: 0, school: "Divinazione", castingTime: "action", range: "Contatto", effect: "+1d4 a una prova" },
        { id: "cureWounds", name: "Cure Wounds", level: 1, school: "Invocazione", castingTime: "action", range: "Contatto", effect: "Cura 1d8 + mod incantatore" },
        { id: "magicMissile", name: "Magic Missile", level: 1, school: "Invocazione", castingTime: "action", range: "36 m", effect: "3 dardi da 1d4+1" },
        { id: "shieldSpell", name: "Shield", level: 1, school: "Abiurazione", castingTime: "reaction", range: "Personale", effect: "+5 CA fino al turno" },
        { id: "burningHands", name: "Burning Hands", level: 1, school: "Evocazione", castingTime: "action", range: "Cono 4,5 m", effect: "3d6 fuoco" },
        { id: "healingWord", name: "Healing Word", level: 1, school: "Invocazione", castingTime: "bonusAction", range: "18 m", effect: "Cura 1d4 + mod incantatore" },
        { id: "bless", name: "Bless", level: 1, school: "Ammaliamento", castingTime: "action", range: "9 m", effect: "+1d4 ad attacchi e TS" },
        { id: "mistyStep", name: "Misty Step", level: 2, school: "Evocazione", castingTime: "bonusAction", range: "Personale", effect: "Teletrasporto 9 m" },
        { id: "scorchingRay", name: "Scorching Ray", level: 2, school: "Evocazione", castingTime: "action", range: "36 m", effect: "Tre raggi da 2d6 fuoco" }
      ];

      const actionDefinitions = [
        { key: "action", label: "Azione", buttonText: "Usa Azione" },
        { key: "bonusAction", label: "Azione Bonus", buttonText: "Usa Bonus" },
        { key: "reaction", label: "Reazione", buttonText: "Usa Reazione" },
        { key: "movement", label: "Movimento", buttonText: "Usa 3 m" }
      ];

      const inventoryState = {
        actionEconomy: {
          action: true,
          bonusAction: true,
          reaction: true,
          movementMetersUsed: 0
        },
        equipmentSlots: {
          mainHand: "inv-longsword",
          offHand: "inv-shield",
          armor: "inv-leather",
          head: null,
          neck: null,
          cloak: null,
          hands: null,
          ringLeft: null,
          ringRight: null,
          feet: null
        },
        inventory: [
          { inventoryId: "inv-longsword", catalogId: "longsword", quantity: 1, equippedSlot: "mainHand" },
          { inventoryId: "inv-shield", catalogId: "shield", quantity: 1, equippedSlot: "offHand" },
          { inventoryId: "inv-leather", catalogId: "leatherArmor", quantity: 1, equippedSlot: "armor" },
          { inventoryId: "inv-potion", catalogId: "healingPotion", quantity: 2, equippedSlot: null },
          { inventoryId: "inv-rations", catalogId: "rations", quantity: 5, equippedSlot: null },
          { inventoryId: "inv-rope", catalogId: "rope", quantity: 1, equippedSlot: null },
          { inventoryId: "inv-torch", catalogId: "torch", quantity: 4, equippedSlot: null }
        ],
        spellSlots: {
          1: { max: 2, remaining: 2 },
          2: { max: 0, remaining: 0 },
          3: { max: 0, remaining: 0 },
          4: { max: 0, remaining: 0 },
          5: { max: 0, remaining: 0 },
          6: { max: 0, remaining: 0 },
          7: { max: 0, remaining: 0 },
          8: { max: 0, remaining: 0 },
          9: { max: 0, remaining: 0 }
        },
        spellbook: [
          { spellId: "fireBolt", prepared: true },
          { spellId: "mageHand", prepared: true },
          { spellId: "magicMissile", prepared: true },
          { spellId: "shieldSpell", prepared: true },
          { spellId: "mistyStep", prepared: false }
        ],
        nextInventoryNumber: 8
      };

      let isSyncingArmorClass = false;

      function getElement(id) {
        return document.getElementById(id);
      }

      function clearNode(node) {
        while (node && node.firstChild) {
          node.removeChild(node.firstChild);
        }
      }

      function cloneData(value) {
        return JSON.parse(JSON.stringify(value));
      }

      function clampNumber(value, minValue, maxValue, fallbackValue) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          return fallbackValue;
        }
        return Math.max(minValue, Math.min(maxValue, Math.trunc(numericValue)));
      }

      function setText(id, value) {
        const element = getElement(id);
        if (element) {
          element.textContent = String(value);
        }
      }

      function getCharacterSnapshot() {
        return window.UltimateVTTState.getState();
      }

      function getItemCatalogEntry(catalogId) {
        return itemCatalog.find(function findItem(item) {
          return item.id === catalogId;
        }) || null;
      }

      function getSpellCatalogEntry(spellId) {
        return spellCatalog.find(function findSpell(spell) {
          return spell.id === spellId;
        }) || null;
      }

      function getInventoryEntry(inventoryId) {
        return inventoryState.inventory.find(function findInventoryEntry(entry) {
          return entry.inventoryId === inventoryId;
        }) || null;
      }

      function getEquippedEntry(slotKey) {
        const inventoryId = inventoryState.equipmentSlots[slotKey];
        if (!inventoryId) {
          return null;
        }
        return getInventoryEntry(inventoryId);
      }

      function formatWeight(value) {
        return (Math.round(value * 10) / 10).toFixed(1) + " kg";
      }

      function formatActionCost(castingTime) {
        if (castingTime === "bonusAction") {
          return "azione bonus";
        }
        if (castingTime === "reaction") {
          return "reazione";
        }
        if (castingTime === "free") {
          return "gratis";
        }
        return "azione";
      }

      function calculateTotalWeightKg() {
        return inventoryState.inventory.reduce(function sumWeight(total, entry) {
          const item = getItemCatalogEntry(entry.catalogId);
          if (!item) {
            return total;
          }
          return total + item.weightKg * entry.quantity;
        }, 0);
      }

      function calculateCarryCapacityKg() {
        const character = getCharacterSnapshot();
        const strengthScore = character.abilities && character.abilities.str ? character.abilities.str.score : 10;
        return strengthScore * 15 * 0.453592;
      }

      function calculateWeightPercent() {
        const capacity = calculateCarryCapacityKg();
        if (capacity <= 0) {
          return 100;
        }
        return Math.max(0, Math.min(100, Math.round((calculateTotalWeightKg() / capacity) * 100)));
      }

      function calculateEquipmentArmorClass() {
        const character = getCharacterSnapshot();
        const dexScore = character.abilities && character.abilities.dex ? character.abilities.dex.score : 10;
        const dexModifier = window.UltimateVTTState.calculateAbilityModifier(dexScore);
        const armorEntry = getEquippedEntry("armor");
        const armorItem = armorEntry ? getItemCatalogEntry(armorEntry.catalogId) : null;
        let armorClass = 10 + dexModifier;

        if (armorItem && armorItem.type === "armor") {
          const dexContribution = armorItem.dexCap === null ? dexModifier : Math.min(dexModifier, armorItem.dexCap);
          armorClass = armorItem.armorBase + dexContribution;
        }

        Object.keys(inventoryState.equipmentSlots).forEach(function addShieldBonus(slotKey) {
          const entry = getEquippedEntry(slotKey);
          const item = entry ? getItemCatalogEntry(entry.catalogId) : null;
          if (item && item.type === "shield") {
            armorClass += item.acBonus || 0;
          }
        });

        return armorClass;
      }

      function syncArmorClassToState() {
        if (isSyncingArmorClass) {
          return;
        }

        const character = getCharacterSnapshot();
        const computedArmorClass = calculateEquipmentArmorClass();
        if (character.resources && character.resources.armorClass === computedArmorClass) {
          return;
        }

        isSyncingArmorClass = true;
        window.UltimateVTTState.setArmorClass(computedArmorClass);
        isSyncingArmorClass = false;
      }

      function findCompatibleSlot(item, preferredSlot) {
        if (!item || !item.compatibleSlots || item.compatibleSlots.length === 0) {
          return null;
        }

        if (preferredSlot && item.compatibleSlots.indexOf(preferredSlot) !== -1) {
          return preferredSlot;
        }

        const emptySlot = item.compatibleSlots.find(function findEmptySlot(slotKey) {
          return !inventoryState.equipmentSlots[slotKey];
        });

        if (emptySlot) {
          return emptySlot;
        }

        return item.compatibleSlots[0];
      }

      function equipItem(inventoryId, preferredSlot) {
        const entry = getInventoryEntry(inventoryId);
        const item = entry ? getItemCatalogEntry(entry.catalogId) : null;
        const targetSlot = findCompatibleSlot(item, preferredSlot);

        if (!entry || !item || !targetSlot) {
          return false;
        }

        if (entry.equippedSlot) {
          inventoryState.equipmentSlots[entry.equippedSlot] = null;
        }

        const currentlyEquippedId = inventoryState.equipmentSlots[targetSlot];
        if (currentlyEquippedId) {
          const currentlyEquippedEntry = getInventoryEntry(currentlyEquippedId);
          if (currentlyEquippedEntry) {
            currentlyEquippedEntry.equippedSlot = null;
          }
        }

        entry.equippedSlot = targetSlot;
        inventoryState.equipmentSlots[targetSlot] = inventoryId;
        syncArmorClassToState();
        renderModuleFour();
        appendLog("Equipaggiato: " + item.name + ".");
        return true;
      }

      function unequipItem(inventoryId) {
        const entry = getInventoryEntry(inventoryId);
        const item = entry ? getItemCatalogEntry(entry.catalogId) : null;

        if (!entry || !entry.equippedSlot) {
          return false;
        }

        inventoryState.equipmentSlots[entry.equippedSlot] = null;
        entry.equippedSlot = null;
        syncArmorClassToState();
        renderModuleFour();
        appendLog("Rimosso equipaggiamento: " + (item ? item.name : inventoryId) + ".");
        return true;
      }

      function addInventoryItem(catalogId, quantity) {
        const item = getItemCatalogEntry(catalogId);
        const addQuantity = clampNumber(quantity, 1, 99, 1);

        if (!item) {
          return null;
        }

        if (item.stackable) {
          const existingEntry = inventoryState.inventory.find(function findStack(entry) {
            return entry.catalogId === catalogId && !entry.equippedSlot;
          });

          if (existingEntry) {
            existingEntry.quantity += addQuantity;
            renderModuleFour();
            appendLog("Aggiunto: " + item.name + " x" + addQuantity + ".");
            return existingEntry;
          }
        }

        const entry = {
          inventoryId: "inv-custom-" + inventoryState.nextInventoryNumber,
          catalogId: catalogId,
          quantity: addQuantity,
          equippedSlot: null
        };

        inventoryState.nextInventoryNumber += 1;
        inventoryState.inventory.push(entry);
        renderModuleFour();
        appendLog("Aggiunto: " + item.name + " x" + addQuantity + ".");
        return entry;
      }

      function dropInventoryItem(inventoryId) {
        const entry = getInventoryEntry(inventoryId);
        const item = entry ? getItemCatalogEntry(entry.catalogId) : null;

        if (!entry) {
          return false;
        }

        if (entry.quantity > 1 && !entry.equippedSlot) {
          entry.quantity -= 1;
        } else {
          if (entry.equippedSlot) {
            inventoryState.equipmentSlots[entry.equippedSlot] = null;
          }
          inventoryState.inventory = inventoryState.inventory.filter(function keepEntry(candidate) {
            return candidate.inventoryId !== inventoryId;
          });
        }

        syncArmorClassToState();
        renderModuleFour();
        appendLog("Scartato: " + (item ? item.name : inventoryId) + ".");
        return true;
      }

      function rollFormula(formula) {
        const normalized = String(formula || "").replace(/\s+/g, "").toLowerCase();
        const match = normalized.match(/^(\d+)d(\d+)([+-]\d+)?$/);
        if (!match) {
          return {
            total: 0,
            rolls: [],
            modifier: 0,
            formula: normalized
          };
        }

        const count = clampNumber(match[1], 1, 50, 1);
        const sides = clampNumber(match[2], 1, 100, 6);
        const modifier = match[3] ? clampNumber(match[3], -999, 999, 0) : 0;
        const rolls = [];

        for (let rollIndex = 0; rollIndex < count; rollIndex += 1) {
          rolls.push(Math.floor(Math.random() * sides) + 1);
        }

        return {
          total: rolls.reduce(function sumRolls(total, roll) {
            return total + roll;
          }, 0) + modifier,
          rolls: rolls,
          modifier: modifier,
          formula: normalized
        };
      }

      function consumeActionCost(actionCost) {
        if (actionCost === "free") {
          return true;
        }

        if (actionCost === "bonusAction") {
          if (!inventoryState.actionEconomy.bonusAction) {
            return false;
          }
          inventoryState.actionEconomy.bonusAction = false;
          return true;
        }

        if (actionCost === "reaction") {
          if (!inventoryState.actionEconomy.reaction) {
            return false;
          }
          inventoryState.actionEconomy.reaction = false;
          return true;
        }

        if (!inventoryState.actionEconomy.action) {
          return false;
        }

        inventoryState.actionEconomy.action = false;
        return true;
      }

      function useInventoryItem(inventoryId) {
        const entry = getInventoryEntry(inventoryId);
        const item = entry ? getItemCatalogEntry(entry.catalogId) : null;

        if (!entry || !item) {
          return false;
        }

        if (item.type !== "consumable") {
          appendLog(item.name + " non e un consumabile.");
          return false;
        }

        if (!consumeActionCost("action")) {
          appendLog("Azione gia spesa: impossibile usare " + item.name + ".");
          renderModuleFour();
          return false;
        }

        if (item.healing) {
          const healingRoll = rollFormula(item.healing);
          window.UltimateVTTState.heal(healingRoll.total);
          appendLog(item.name + ": cura " + healingRoll.total + " HP.");
        }

        dropInventoryItem(inventoryId);
        renderModuleFour();
        return true;
      }

      function resetTurn() {
        inventoryState.actionEconomy.action = true;
        inventoryState.actionEconomy.bonusAction = true;
        inventoryState.actionEconomy.reaction = true;
        inventoryState.actionEconomy.movementMetersUsed = 0;
        renderModuleFour();
        appendLog("Action economy resettata per un nuovo turno.");
      }

      function shortRest() {
        inventoryState.actionEconomy.action = true;
        inventoryState.actionEconomy.bonusAction = true;
        inventoryState.actionEconomy.reaction = true;
        inventoryState.actionEconomy.movementMetersUsed = 0;
        renderModuleFour();
        appendLog("Riposo breve registrato.");
      }

      function longRest() {
        Object.keys(inventoryState.spellSlots).forEach(function resetSpellSlot(levelKey) {
          inventoryState.spellSlots[levelKey].remaining = inventoryState.spellSlots[levelKey].max;
        });
        inventoryState.actionEconomy.action = true;
        inventoryState.actionEconomy.bonusAction = true;
        inventoryState.actionEconomy.reaction = true;
        inventoryState.actionEconomy.movementMetersUsed = 0;
        renderModuleFour();
        appendLog("Riposo lungo: slot incantesimo e azioni ripristinati.");
      }

      function spendActionResource(resourceKey) {
        const character = getCharacterSnapshot();
        const speedMeters = character.resources ? character.resources.speedMeters : 9;

        if (resourceKey === "movement") {
          inventoryState.actionEconomy.movementMetersUsed = Math.min(speedMeters, inventoryState.actionEconomy.movementMetersUsed + 3);
          renderModuleFour();
          appendLog("Movimento usato: " + inventoryState.actionEconomy.movementMetersUsed + " / " + speedMeters + " m.");
          return true;
        }

        if (!consumeActionCost(resourceKey)) {
          appendLog("Risorsa gia spesa: " + resourceKey + ".");
          renderModuleFour();
          return false;
        }

        renderModuleFour();
        appendLog("Risorsa spesa: " + resourceKey + ".");
        return true;
      }

      function addSpell(spellId) {
        const spell = getSpellCatalogEntry(spellId);
        if (!spell) {
          return false;
        }

        const exists = inventoryState.spellbook.some(function spellAlreadyKnown(entry) {
          return entry.spellId === spellId;
        });

        if (exists) {
          appendLog("Incantesimo gia presente: " + spell.name + ".");
          return false;
        }

        inventoryState.spellbook.push({
          spellId: spellId,
          prepared: spell.level === 0
        });
        renderModuleFour();
        appendLog("Incantesimo aggiunto: " + spell.name + ".");
        return true;
      }

      function removeSpell(spellId) {
        const spell = getSpellCatalogEntry(spellId);
        inventoryState.spellbook = inventoryState.spellbook.filter(function keepSpell(entry) {
          return entry.spellId !== spellId;
        });
        renderModuleFour();
        appendLog("Incantesimo rimosso: " + (spell ? spell.name : spellId) + ".");
        return true;
      }

      function togglePreparedSpell(spellId) {
        const entry = inventoryState.spellbook.find(function findSpellbookEntry(candidate) {
          return candidate.spellId === spellId;
        });
        const spell = getSpellCatalogEntry(spellId);

        if (!entry || !spell) {
          return false;
        }

        if (spell.level === 0) {
          entry.prepared = true;
        } else {
          entry.prepared = !entry.prepared;
        }

        renderModuleFour();
        appendLog((entry.prepared ? "Preparato: " : "Non preparato: ") + spell.name + ".");
        return true;
      }

      function setSpellSlot(level, field, value) {
        const levelKey = String(level);
        if (!inventoryState.spellSlots[levelKey]) {
          return false;
        }

        if (field === "max") {
          inventoryState.spellSlots[levelKey].max = clampNumber(value, 0, 9, 0);
          inventoryState.spellSlots[levelKey].remaining = Math.min(inventoryState.spellSlots[levelKey].remaining, inventoryState.spellSlots[levelKey].max);
        } else {
          inventoryState.spellSlots[levelKey].remaining = clampNumber(value, 0, inventoryState.spellSlots[levelKey].max, 0);
        }

        renderModuleFour();
        return true;
      }

      function castSpell(spellId) {
        const entry = inventoryState.spellbook.find(function findSpellbookEntry(candidate) {
          return candidate.spellId === spellId;
        });
        const spell = getSpellCatalogEntry(spellId);

        if (!entry || !spell) {
          return false;
        }

        if (!entry.prepared) {
          appendLog("Incantesimo non preparato: " + spell.name + ".");
          return false;
        }

        if (spell.level > 0) {
          const slot = inventoryState.spellSlots[String(spell.level)];
          if (!slot || slot.remaining <= 0) {
            appendLog("Nessuno slot di livello " + spell.level + " disponibile per " + spell.name + ".");
            renderModuleFour();
            return false;
          }
        }

        if (!consumeActionCost(spell.castingTime)) {
          appendLog("Risorsa non disponibile per " + spell.name + " (" + formatActionCost(spell.castingTime) + ").");
          renderModuleFour();
          return false;
        }

        if (spell.level > 0) {
          const slot = inventoryState.spellSlots[String(spell.level)];
          slot.remaining -= 1;
        }

        renderModuleFour();
        appendLog("Lanciato: " + spell.name + " (" + spell.effect + ").");
        return true;
      }

      function appendLog(message) {
        if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
          window.UltimateVTT.appendSystemLog(message);
        }
      }

      function createButton(className, text, handler) {
        const button = document.createElement("button");
        button.className = className;
        button.type = "button";
        button.textContent = text;
        button.addEventListener("click", handler);
        return button;
      }

      function createBadge(text, className) {
        const badge = document.createElement("span");
        badge.className = className;
        badge.textContent = text;
        return badge;
      }

      function renderActionEconomy() {
        const grid = getElement("actionEconomyGrid");
        const character = getCharacterSnapshot();
        const speedMeters = character.resources ? character.resources.speedMeters : 9;

        if (!grid) {
          return;
        }

        clearNode(grid);

        actionDefinitions.forEach(function renderActionCard(definition) {
          const card = document.createElement("div");
          const title = document.createElement("div");
          const status = document.createElement("div");
          let available = true;
          let statusText = "Disponibile";

          if (definition.key === "action") {
            available = inventoryState.actionEconomy.action;
          } else if (definition.key === "bonusAction") {
            available = inventoryState.actionEconomy.bonusAction;
          } else if (definition.key === "reaction") {
            available = inventoryState.actionEconomy.reaction;
          } else if (definition.key === "movement") {
            available = inventoryState.actionEconomy.movementMetersUsed < speedMeters;
            statusText = inventoryState.actionEconomy.movementMetersUsed + " / " + speedMeters + " m";
          }

          card.className = "action-card " + (available ? "available" : "spent");
          title.className = "action-card-title";
          title.textContent = definition.label;
          status.className = "action-card-status";
          status.textContent = definition.key === "movement" ? statusText : available ? "Disponibile" : "Spesa";

          card.appendChild(title);
          card.appendChild(status);
          card.appendChild(createButton("action-card-button", definition.buttonText, function handleActionClick() {
            spendActionResource(definition.key);
          }));
          grid.appendChild(card);
        });
      }

      function renderEquipmentSlots() {
        const grid = getElement("equipmentSlotGrid");
        if (!grid) {
          return;
        }

        clearNode(grid);

        equipmentSlotDefinitions.forEach(function renderSlot(definition) {
          const slot = document.createElement("div");
          const label = document.createElement("div");
          const value = document.createElement("div");
          const entry = getEquippedEntry(definition.key);
          const item = entry ? getItemCatalogEntry(entry.catalogId) : null;

          slot.className = "equipment-slot";
          label.className = "equipment-slot-label";
          value.className = "equipment-slot-value";
          label.textContent = definition.label;
          value.textContent = item ? item.name : "Vuoto";

          slot.appendChild(label);
          slot.appendChild(value);
          if (item && entry) {
            slot.appendChild(createButton("inventory-action-button", "Rimuovi", function handleUnequipSlot() {
              unequipItem(entry.inventoryId);
            }));
          }
          grid.appendChild(slot);
        });
      }

      function renderInventorySelect() {
        const select = getElement("moduleFourItemSelect");
        if (!select) {
          return;
        }

        clearNode(select);

        itemCatalog.forEach(function appendOption(item) {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.name;
          select.appendChild(option);
        });
      }

      function renderInventoryList() {
        const list = getElement("inventoryListModuleFour");
        if (!list) {
          return;
        }

        clearNode(list);

        inventoryState.inventory.forEach(function renderInventoryEntry(entry) {
          const item = getItemCatalogEntry(entry.catalogId);
          const row = document.createElement("div");
          const header = document.createElement("div");
          const name = document.createElement("div");
          const badge = createBadge(entry.equippedSlot ? "Equip" : item ? item.type : "Oggetto", "equipment-badge");
          const meta = document.createElement("div");
          const actions = document.createElement("div");

          if (!item) {
            return;
          }

          row.className = "inventory-row" + (entry.equippedSlot ? " is-equipped" : "");
          header.className = "inventory-row-header";
          name.className = "inventory-item-name";
          meta.className = "inventory-item-meta";
          actions.className = "inventory-row-actions";
          name.textContent = item.name + " x" + entry.quantity;
          meta.textContent = formatWeight(item.weightKg * entry.quantity) + " | " + item.properties;

          header.appendChild(name);
          header.appendChild(badge);
          row.appendChild(header);
          row.appendChild(meta);

          if (item.compatibleSlots && item.compatibleSlots.length > 0) {
            if (entry.equippedSlot) {
              actions.appendChild(createButton("inventory-action-button", "Unequip", function handleUnequipClick() {
                unequipItem(entry.inventoryId);
              }));
            } else {
              actions.appendChild(createButton("inventory-action-button", "Equip", function handleEquipClick() {
                equipItem(entry.inventoryId, null);
              }));
            }
          } else {
            actions.appendChild(createButton("inventory-action-button", "Info", function handleInfoClick() {
              appendLog(item.name + ": " + item.properties + ".");
            }));
          }

          actions.appendChild(createButton("inventory-action-button", "Usa", function handleUseClick() {
            useInventoryItem(entry.inventoryId);
          }));
          actions.appendChild(createButton("inventory-action-button", "Scarta", function handleDropClick() {
            dropInventoryItem(entry.inventoryId);
          }));
          row.appendChild(actions);
          list.appendChild(row);
        });
      }

      function renderWeightSummary() {
        const totalWeight = calculateTotalWeightKg();
        const capacity = calculateCarryCapacityKg();
        const percent = calculateWeightPercent();
        const meter = getElement("moduleFourWeightMeter");
        const summaryMeter = getElement("inventoryWeightSummaryMeter");

        if (meter) {
          meter.style.setProperty("--weight-value", percent + "%");
        }

        if (summaryMeter) {
          summaryMeter.style.setProperty("--weight-value", percent + "%");
        }

        setText("inventoryWeightSummary", formatWeight(totalWeight) + " / " + formatWeight(capacity));
        setText("equipmentAcSummary", calculateEquipmentArmorClass());
      }

      function renderSpellSelect() {
        const select = getElement("moduleFourSpellSelect");
        if (!select) {
          return;
        }

        clearNode(select);

        spellCatalog.forEach(function appendSpellOption(spell) {
          const option = document.createElement("option");
          option.value = spell.id;
          option.textContent = (spell.level === 0 ? "Trucchetto" : "Liv " + spell.level) + " - " + spell.name;
          select.appendChild(option);
        });
      }

      function renderSpellSlots() {
        const grid = getElement("spellSlotsGrid");
        if (!grid) {
          return;
        }

        clearNode(grid);

        Object.keys(inventoryState.spellSlots).forEach(function renderSlot(levelKey) {
          const slot = inventoryState.spellSlots[levelKey];
          const card = document.createElement("div");
          const label = document.createElement("div");
          const remainingInput = document.createElement("input");
          const maxInput = document.createElement("input");

          card.className = "spell-slot-card";
          label.className = "spell-slot-label";
          label.textContent = "Livello " + levelKey + " (" + slot.remaining + " / " + slot.max + ")";

          remainingInput.className = "spell-slot-input";
          remainingInput.type = "number";
          remainingInput.min = "0";
          remainingInput.max = String(slot.max);
          remainingInput.value = String(slot.remaining);
          remainingInput.title = "Slot rimasti";
          remainingInput.addEventListener("change", function handleRemainingChange() {
            setSpellSlot(levelKey, "remaining", remainingInput.value);
          });

          maxInput.className = "spell-slot-input";
          maxInput.type = "number";
          maxInput.min = "0";
          maxInput.max = "9";
          maxInput.value = String(slot.max);
          maxInput.title = "Slot massimi";
          maxInput.addEventListener("change", function handleMaxChange() {
            setSpellSlot(levelKey, "max", maxInput.value);
          });

          card.appendChild(label);
          card.appendChild(remainingInput);
          card.appendChild(maxInput);
          grid.appendChild(card);
        });
      }

      function renderSpellbookList() {
        const list = getElement("spellbookListModuleFour");
        if (!list) {
          return;
        }

        clearNode(list);

        inventoryState.spellbook.forEach(function renderSpellbookEntry(entry) {
          const spell = getSpellCatalogEntry(entry.spellId);
          const row = document.createElement("div");
          const header = document.createElement("div");
          const name = document.createElement("div");
          const badge = document.createElement("span");
          const meta = document.createElement("div");
          const actions = document.createElement("div");

          if (!spell) {
            return;
          }

          row.className = "spell-row" + (entry.prepared ? " is-prepared" : "");
          header.className = "spell-row-header";
          name.className = "spell-name";
          badge.className = "spell-school-badge";
          meta.className = "spell-meta";
          actions.className = "spell-row-actions";

          name.textContent = spell.name;
          badge.textContent = spell.level === 0 ? "Cantrip" : "Liv " + spell.level;
          meta.textContent = spell.school + " | " + formatActionCost(spell.castingTime) + " | " + spell.range + " | " + spell.effect;

          header.appendChild(name);
          header.appendChild(badge);
          actions.appendChild(createButton("spell-action-button", entry.prepared ? "Unprep" : "Prep", function handlePrepareClick() {
            togglePreparedSpell(entry.spellId);
          }));
          actions.appendChild(createButton("spell-action-button", "Lancia", function handleCastClick() {
            castSpell(entry.spellId);
          }));
          actions.appendChild(createButton("spell-action-button", "Rimuovi", function handleRemoveClick() {
            removeSpell(entry.spellId);
          }));

          row.appendChild(header);
          row.appendChild(meta);
          row.appendChild(actions);
          list.appendChild(row);
        });
      }

      function renderActionPill() {
        const actionReady = inventoryState.actionEconomy.action ? "A" : "-";
        const bonusReady = inventoryState.actionEconomy.bonusAction ? "B" : "-";
        const reactionReady = inventoryState.actionEconomy.reaction ? "R" : "-";
        setText("actionEconomyPill", "Azioni: " + actionReady + "/" + bonusReady + "/" + reactionReady);
      }

      function renderSpellSummary() {
        const preparedCount = inventoryState.spellbook.filter(function countPrepared(entry) {
          return entry.prepared;
        }).length;
        setText("spellbookSummary", preparedCount + " / " + inventoryState.spellbook.length);
      }

      function renderModuleFour() {
        renderActionEconomy();
        renderEquipmentSlots();
        renderInventorySelect();
        renderInventoryList();
        renderWeightSummary();
        renderSpellSelect();
        renderSpellSlots();
        renderSpellbookList();
        renderActionPill();
        renderSpellSummary();
      }

      function createInventoryModalContent() {
        const fragment = document.createDocumentFragment();
        const section = document.createElement("section");
        const title = document.createElement("h3");
        const weight = document.createElement("div");
        const armorClass = document.createElement("div");
        const equipped = document.createElement("div");

        section.className = "sheet-section";
        title.className = "sheet-section-title";
        title.textContent = "Riepilogo inventario";
        weight.className = "sheet-row";
        armorClass.className = "sheet-row";
        equipped.className = "sheet-row";
        weight.textContent = "Peso: " + formatWeight(calculateTotalWeightKg()) + " / " + formatWeight(calculateCarryCapacityKg());
        armorClass.textContent = "CA equipaggiamento: " + calculateEquipmentArmorClass();
        equipped.textContent = "Oggetti: " + inventoryState.inventory.length;

        section.appendChild(title);
        section.appendChild(weight);
        section.appendChild(armorClass);
        section.appendChild(equipped);
        fragment.appendChild(section);
        return fragment;
      }

      function createSpellbookModalContent() {
        const fragment = document.createDocumentFragment();
        const section = document.createElement("section");
        const title = document.createElement("h3");
        section.className = "sheet-section";
        title.className = "sheet-section-title";
        title.textContent = "Incantesimi preparati";
        section.appendChild(title);

        inventoryState.spellbook.forEach(function appendPreparedSpell(entry) {
          const spell = getSpellCatalogEntry(entry.spellId);
          const row = document.createElement("div");
          const value = document.createElement("span");
          if (!spell || !entry.prepared) {
            return;
          }
          row.className = "sheet-row";
          row.textContent = spell.name;
          value.className = "sheet-row-value";
          value.textContent = spell.level === 0 ? "Cantrip" : "Liv " + spell.level;
          row.appendChild(value);
          section.appendChild(row);
        });

        fragment.appendChild(section);
        return fragment;
      }

      function bindModuleFourControls() {
        const addItemButton = getElement("moduleFourAddItemButton");
        const addSpellButton = getElement("moduleFourAddSpellButton");
        const resetTurnButton = getElement("moduleFourResetTurnButton");
        const shortRestButton = getElement("moduleFourShortRestButton");
        const longRestButton = getElement("moduleFourLongRestButton");
        const openInventoryModalButton = getElement("openInventoryModalButton");
        const openSpellbookModalButton = getElement("openSpellbookModalButton");

        if (addItemButton) {
          addItemButton.addEventListener("click", function handleAddItemClick() {
            const select = getElement("moduleFourItemSelect");
            if (select) {
              addInventoryItem(select.value, 1);
            }
          });
        }

        if (addSpellButton) {
          addSpellButton.addEventListener("click", function handleAddSpellClick() {
            const select = getElement("moduleFourSpellSelect");
            if (select) {
              addSpell(select.value);
            }
          });
        }

        if (resetTurnButton) {
          resetTurnButton.addEventListener("click", resetTurn);
        }

        if (shortRestButton) {
          shortRestButton.addEventListener("click", shortRest);
        }

        if (longRestButton) {
          longRestButton.addEventListener("click", longRest);
        }

        if (openInventoryModalButton) {
          openInventoryModalButton.addEventListener("click", function handleInventoryModalClick() {
            if (window.UltimateVTTModule2 && window.UltimateVTTModule2.openModal) {
              window.UltimateVTTModule2.openModal("Inventario", createInventoryModalContent(), "Carico e slot");
            }
          });
        }

        if (openSpellbookModalButton) {
          openSpellbookModalButton.addEventListener("click", function handleSpellbookModalClick() {
            if (window.UltimateVTTModule2 && window.UltimateVTTModule2.openModal) {
              window.UltimateVTTModule2.openModal("Spellbook", createSpellbookModalContent(), "Incantesimi");
            }
          });
        }
      }

      function initializeModuleFour() {
        bindModuleFourControls();
        syncArmorClassToState();
        renderModuleFour();

        window.UltimateVTTState.subscribe(function handleCharacterStateChange() {
          if (!isSyncingArmorClass) {
            syncArmorClassToState();
          }
          renderModuleFour();
        });
      }

      // Sostituisce l'intero stato inventario (per inventari separati per PG)
      function hydrateInventory(snapshot) {
        if (!snapshot || typeof snapshot !== "object") return false;
        if (snapshot.inventory) inventoryState.inventory = cloneData(snapshot.inventory);
        if (snapshot.equipmentSlots) inventoryState.equipmentSlots = cloneData(snapshot.equipmentSlots);
        if (snapshot.spellSlots) inventoryState.spellSlots = cloneData(snapshot.spellSlots);
        if (snapshot.spellbook) inventoryState.spellbook = cloneData(snapshot.spellbook);
        if (snapshot.actionEconomy) inventoryState.actionEconomy = cloneData(snapshot.actionEconomy);
        if (typeof snapshot.nextInventoryNumber === "number") inventoryState.nextInventoryNumber = snapshot.nextInventoryNumber;
        try { syncArmorClassToState(); } catch (e) {}
        renderModuleFour();
        return true;
      }

      window.UltimateVTTInventory = {
        equipmentSlotDefinitions: cloneData(equipmentSlotDefinitions),
        itemCatalog: cloneData(itemCatalog),
        spellCatalog: cloneData(spellCatalog),
        getState: function getInventoryState() {
          return cloneData(inventoryState);
        },
        hydrate: hydrateInventory,
        calculateTotalWeightKg: calculateTotalWeightKg,
        calculateCarryCapacityKg: calculateCarryCapacityKg,
        calculateEquipmentArmorClass: calculateEquipmentArmorClass,
        equipItem: equipItem,
        unequipItem: unequipItem,
        addInventoryItem: addInventoryItem,
        dropInventoryItem: dropInventoryItem,
        useInventoryItem: useInventoryItem,
        resetTurn: resetTurn,
        shortRest: shortRest,
        longRest: longRest,
        spendActionResource: spendActionResource,
        addSpell: addSpell,
        removeSpell: removeSpell,
        togglePreparedSpell: togglePreparedSpell,
        setSpellSlot: setSpellSlot,
        castSpell: castSpell,
        renderModuleFour: renderModuleFour
      };

      initializeModuleFour();

      window.UltimateVTT.registerModule(4, {
        actionEconomy: true,
        equipmentSlots: equipmentSlotDefinitions.length,
        inventoryItems: inventoryState.inventory.length,
        weightSystem: true,
        spellbookEntries: inventoryState.spellbook.length,
        spellCatalog: spellCatalog.length
      });

      appendLog("Modulo 4 caricato: action economy, inventario, peso, equipaggiamento e spellbook.");
    })();
    // --- FINE MODULO 4 JS: ACTION ECONOMY, INVENTARIO, EQUIPAGGIAMENTO, PESO, SPELLBOOK ---
  