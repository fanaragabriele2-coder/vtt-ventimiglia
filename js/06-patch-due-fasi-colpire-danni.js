    // --- INIZIO MODULO 5 JS: COMBAT TRACKER, INIZIATIVA PNG, VANTAGGIO/SVANTAGGIO, DANNI CRITICI ---
    (function initializeUltimateVttModuleFive() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 5 richiede il Modulo 1.");
      }

      if (!window.UltimateVTTState) {
        throw new Error("UltimateVTT Module 5 richiede il Modulo 3.");
      }

      const npcCatalog = [
        { id: "goblin", name: "Goblin", armorClass: 15, hitPoints: 7, initiativeBonus: 2, attackBonus: 4, damageFormula: "1d6+2", challenge: "1/4" },
        { id: "bandit", name: "Bandito", armorClass: 12, hitPoints: 11, initiativeBonus: 1, attackBonus: 3, damageFormula: "1d6+1", challenge: "1/8" },
        { id: "skeleton", name: "Scheletro", armorClass: 13, hitPoints: 13, initiativeBonus: 2, attackBonus: 4, damageFormula: "1d6+2", challenge: "1/4" },
        { id: "wolf", name: "Lupo", armorClass: 13, hitPoints: 11, initiativeBonus: 2, attackBonus: 4, damageFormula: "2d4+2", challenge: "1/4" },
        { id: "orc", name: "Orco", armorClass: 13, hitPoints: 15, initiativeBonus: 1, attackBonus: 5, damageFormula: "1d12+3", challenge: "1/2" },
        { id: "cultist", name: "Cultista", armorClass: 12, hitPoints: 9, initiativeBonus: 1, attackBonus: 3, damageFormula: "1d6+1", challenge: "1/8" },
        { id: "zombie", name: "Zombie", armorClass: 8, hitPoints: 22, initiativeBonus: -2, attackBonus: 3, damageFormula: "1d6+1", challenge: "1/4" },
        { id: "hobgoblin", name: "Hobgoblin", armorClass: 18, hitPoints: 11, initiativeBonus: 1, attackBonus: 3, damageFormula: "1d8+1", challenge: "1/2" }
      ];

      const combatState = {
        active: false,
        round: 0,
        currentTurnIndex: -1,
        rollMode: "normal",
        selectedTargetId: null,
        lastEvent: "Combattimento non iniziato.",
        lastRoll: {
          title: "In attesa",
          detail: "Nessun tiro eseguito."
        },
        nextNpcNumber: 1,
        // Il tracker parte SOLO con il PG: i nemici NON devono esistere finche' il Master non li fa
        // comparire (VTTSpawn.spawn -> addNpc). Prima qui c'erano 3 PNG fissi (Goblin/Bandito/
        // Scheletro) sempre presenti: comparivano nell'iniziativa e nella HUD anche quando il Master,
        // nella chat, stava facendo tutt'altro (andare al municipio, aprire una porta) e non aveva
        // affatto evocato nemici — dando l'impressione di un combattimento partito dal nulla.
        combatants: [
          { id: "pc-local", kind: "pc", name: "Eroe Locale", armorClass: 10, hitPoints: 10, maxHitPoints: 10, temporaryHitPoints: 0, initiative: 0, initiativeBonus: 0, attackBonus: 4, damageFormula: "1d8+2", defeated: false }
        ]
      };

      function getElement(id) {
        return document.getElementById(id);
      }

      function getAll(selector, root) {
        const searchRoot = root || document;
        return Array.prototype.slice.call(searchRoot.querySelectorAll(selector));
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

      function appendLog(message) {
        if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
          window.UltimateVTT.appendSystemLog(message);
        }
      }

      function getCharacterSnapshot() {
        return window.UltimateVTTState.getState();
      }

      function formatModifier(value) {
        if (window.UltimateVTTState && window.UltimateVTTState.formatModifier) {
          return window.UltimateVTTState.formatModifier(value);
        }
        return value >= 0 ? "+" + value : String(value);
      }

      function getCombatant(combatantId) {
        return combatState.combatants.find(function findCombatant(combatant) {
          return combatant.id === combatantId;
        }) || null;
      }

      function getActiveCombatant() {
        if (combatState.currentTurnIndex < 0 || combatState.currentTurnIndex >= combatState.combatants.length) {
          return null;
        }
        return combatState.combatants[combatState.currentTurnIndex];
      }

      function getLivingCombatants() {
        return combatState.combatants.filter(function keepLiving(combatant) {
          return !combatant.defeated && combatant.hitPoints > 0;
        });
      }

      function syncPlayerCombatantFromState() {
        const character = getCharacterSnapshot();
        const player = getCombatant("pc-local");
        if (!player) {
          return;
        }

        const dexScore = character.abilities && character.abilities.dex ? character.abilities.dex.score : 10;
        const dexModifier = window.UltimateVTTState.calculateAbilityModifier(dexScore);
        const strengthScore = character.abilities && character.abilities.str ? character.abilities.str.score : 10;
        const strengthModifier = window.UltimateVTTState.calculateAbilityModifier(strengthScore);
        const proficiencyBonus = character.proficiencyBonus || 2;

        player.name = character.identity && character.identity.name ? character.identity.name : "Eroe Locale";
        player.armorClass = character.resources ? character.resources.armorClass : player.armorClass;
        player.hitPoints = character.resources && character.resources.hp ? character.resources.hp.current : player.hitPoints;
        player.maxHitPoints = character.resources && character.resources.hp ? character.resources.hp.max : player.maxHitPoints;
        player.temporaryHitPoints = character.resources && character.resources.hp ? character.resources.hp.temporary : 0;
        player.initiativeBonus = dexModifier;
        player.attackBonus = proficiencyBonus + Math.max(strengthModifier, dexModifier);
        // formula danni: dado dell'arma equipaggiata + modificatore (Forza/Destrezza piu alto)
        var atkMod = Math.max(strengthModifier, dexModifier);
        var weaponDie = "1d8";
        try {
          var inv = window.UltimateVTTInventory;
          if (inv && inv.getState) {
            var invState = inv.getState();
            var mainId = invState.equipmentSlots && invState.equipmentSlots.mainHand;
            var entry = mainId ? (invState.inventory || []).filter(function (e) { return e.inventoryId === mainId; })[0] : null;
            var cat = entry ? (inv.itemCatalog || []).filter(function (c) { return c.id === entry.catalogId; })[0] : null;
            if (cat && cat.damage) { var dm = String(cat.damage).match(/\d+d\d+/); if (dm) weaponDie = dm[0]; }
          }
        } catch (e) {}
        player.damageFormula = atkMod > 0 ? (weaponDie + "+" + atkMod) : (atkMod < 0 ? (weaponDie + atkMod) : weaponDie);
        player.defeated = player.hitPoints <= 0;
      }

      function rollDie(sides) {
        return Math.floor(Math.random() * sides) + 1;
      }

      function rollD20WithMode(mode) {
        const first = rollDie(20);
        const second = rollDie(20);
        let chosen = first;
        let discarded = null;

        if (mode === "advantage") {
          chosen = Math.max(first, second);
          discarded = Math.min(first, second);
        } else if (mode === "disadvantage") {
          chosen = Math.min(first, second);
          discarded = Math.max(first, second);
        }

        return {
          mode: mode,
          rolls: mode === "normal" ? [first] : [first, second],
          chosen: chosen,
          discarded: discarded,
          naturalOne: chosen === 1,
          naturalTwenty: chosen === 20
        };
      }

      function parseDamageFormula(formula) {
        const normalized = String(formula || "1d4").replace(/\s+/g, "").toLowerCase();
        const terms = normalized.match(/[+-]?[^+-]+/g) || ["1d4"];
        const parsedTerms = [];

        terms.forEach(function parseTerm(term) {
          const diceMatch = term.match(/^([+-]?)(\d*)d(\d+)$/);
          const flatMatch = term.match(/^([+-]?\d+)$/);
          if (diceMatch) {
            const sign = diceMatch[1] === "-" ? -1 : 1;
            const count = clampNumber(diceMatch[2] || 1, 1, 50, 1);
            const sides = clampNumber(diceMatch[3], 1, 100, 4);
            parsedTerms.push({
              type: "dice",
              sign: sign,
              count: count,
              sides: sides
            });
          } else if (flatMatch) {
            parsedTerms.push({
              type: "flat",
              value: clampNumber(flatMatch[1], -999, 999, 0)
            });
          }
        });

        if (parsedTerms.length === 0) {
          parsedTerms.push({
            type: "dice",
            sign: 1,
            count: 1,
            sides: 4
          });
        }

        return parsedTerms;
      }

      function rollDamageFormula(formula, critical) {
        const parsedTerms = parseDamageFormula(formula);
        const rollDetails = [];
        let total = 0;
        let diceTotal = 0;
        let modifierTotal = 0;

        parsedTerms.forEach(function rollTerm(term) {
          if (term.type === "dice") {
            const rollCount = critical && term.sign > 0 ? term.count * 2 : term.count;
            const rolls = [];
            for (let rollIndex = 0; rollIndex < rollCount; rollIndex += 1) {
              rolls.push(rollDie(term.sides));
            }
            const termTotal = rolls.reduce(function sumRolls(sum, roll) {
              return sum + roll;
            }, 0) * term.sign;
            diceTotal += termTotal;
            total += termTotal;
            rollDetails.push({
              type: "dice",
              count: term.count,
              sides: term.sides,
              sign: term.sign,
              criticalCount: rollCount,
              rolls: rolls,
              total: termTotal
            });
          } else {
            modifierTotal += term.value;
            total += term.value;
            rollDetails.push({
              type: "flat",
              value: term.value
            });
          }
        });

        return {
          formula: String(formula || "1d4"),
          critical: Boolean(critical),
          total: Math.max(0, total),
          rawTotal: total,
          diceTotal: diceTotal,
          modifierTotal: modifierTotal,
          details: rollDetails
        };
      }

      function describeDamageRoll(damageRoll) {
        const pieces = damageRoll.details.map(function describeTerm(term) {
          if (term.type === "dice") {
            const signText = term.sign < 0 ? "-" : "+";
            return signText + term.criticalCount + "d" + term.sides + "[" + term.rolls.join(",") + "]";
          }
          return term.value >= 0 ? "+" + term.value : String(term.value);
        });

        let detail = pieces.join(" ");
        if (detail.charAt(0) === "+") {
          detail = detail.slice(1);
        }
        return detail;
      }

      function sortCombatantsByInitiative() {
        const activeId = getActiveCombatant() ? getActiveCombatant().id : null;
        combatState.combatants.sort(function sortCombatants(left, right) {
          if (right.initiative !== left.initiative) {
            return right.initiative - left.initiative;
          }
          if (right.initiativeBonus !== left.initiativeBonus) {
            return right.initiativeBonus - left.initiativeBonus;
          }
          return left.name.localeCompare(right.name);
        });

        if (activeId) {
          const newIndex = combatState.combatants.findIndex(function findActive(combatant) {
            return combatant.id === activeId;
          });
          combatState.currentTurnIndex = newIndex >= 0 ? newIndex : combatState.currentTurnIndex;
        }
      }

      function rollInitiativeForCombatant(combatant) {
        const initiativeRoll = rollDie(20);
        combatant.initiative = initiativeRoll + combatant.initiativeBonus;
        return {
          roll: initiativeRoll,
          total: combatant.initiative,
          bonus: combatant.initiativeBonus
        };
      }

      function rollAllInitiative() {
        syncPlayerCombatantFromState();
        const results = combatState.combatants.map(function rollForCombatant(combatant) {
          const result = rollInitiativeForCombatant(combatant);
          return combatant.name + " " + result.total + " (" + result.roll + formatModifier(result.bonus) + ")";
        });

        sortCombatantsByInitiative();
        combatState.currentTurnIndex = getLivingCombatants().length > 0 ? 0 : -1;
        combatState.lastEvent = "Iniziativa: " + results.join("; ");
        renderCombat();
        appendLog(combatState.lastEvent);
        return results;
      }

      function startCombat() {
        syncPlayerCombatantFromState();
        combatState.active = true;
        combatState.round = 1;
        rollAllInitiative();
        combatState.currentTurnIndex = findNextLivingIndex(-1);
        combatState.lastEvent = "Combattimento iniziato.";
        if (window.UltimateVTTInventory && window.UltimateVTTInventory.resetTurn) {
          window.UltimateVTTInventory.resetTurn();
        }
        renderCombat();
        appendLog("Combattimento iniziato.");
      }

      function endCombat() {
        combatState.active = false;
        combatState.round = 0;
        combatState.currentTurnIndex = -1;
        combatState.lastEvent = "Combattimento terminato.";
        renderCombat();
        appendLog("Combattimento terminato.");
      }

      function findNextLivingIndex(fromIndex) {
        if (combatState.combatants.length === 0) {
          return -1;
        }

        for (let offset = 1; offset <= combatState.combatants.length; offset += 1) {
          const index = (fromIndex + offset + combatState.combatants.length) % combatState.combatants.length;
          const combatant = combatState.combatants[index];
          if (combatant && !combatant.defeated && combatant.hitPoints > 0) {
            return index;
          }
        }

        return -1;
      }

      function nextTurn() {
        if (!combatState.active) {
          startCombat();
          return;
        }

        const previousIndex = combatState.currentTurnIndex;
        const nextIndex = findNextLivingIndex(previousIndex);

        if (nextIndex === -1) {
          combatState.lastEvent = "Nessun combattente vivo.";
          renderCombat();
          appendLog(combatState.lastEvent);
          return;
        }

        if (previousIndex >= 0 && nextIndex <= previousIndex) {
          combatState.round += 1;
        }

        combatState.currentTurnIndex = nextIndex;
        const activeCombatant = getActiveCombatant();
        combatState.lastEvent = "Turno: " + (activeCombatant ? activeCombatant.name : "nessuno") + ".";

        if (window.UltimateVTTInventory && window.UltimateVTTInventory.resetTurn) {
          window.UltimateVTTInventory.resetTurn();
        }

        renderCombat();
        appendLog(combatState.lastEvent);
      }

      function addNpc(catalogId) {
        const npcTemplate = npcCatalog.find(function findNpc(template) {
          return template.id === catalogId;
        });

        if (!npcTemplate) {
          return null;
        }

        const sameTypeCount = combatState.combatants.filter(function countSameType(combatant) {
          return combatant.kind === "npc" && combatant.name.indexOf(npcTemplate.name) === 0;
        }).length + 1;

        const combatant = {
          id: "npc-" + combatState.nextNpcNumber,
          kind: "npc",
          name: npcTemplate.name + " " + sameTypeCount,
          armorClass: npcTemplate.armorClass,
          hitPoints: npcTemplate.hitPoints,
          maxHitPoints: npcTemplate.hitPoints,
          temporaryHitPoints: 0,
          initiative: 0,
          initiativeBonus: npcTemplate.initiativeBonus,
          attackBonus: npcTemplate.attackBonus,
          damageFormula: npcTemplate.damageFormula,
          defeated: false
        };

        combatState.nextNpcNumber += 1;
        combatState.combatants.push(combatant);
        combatState.selectedTargetId = combatant.id;
        combatState.lastEvent = "PNG aggiunto: " + combatant.name + ".";
        renderCombat();
        appendLog(combatState.lastEvent);
        return combatant;
      }

      function removeCombatant(combatantId) {
        if (combatantId === "pc-local") {
          appendLog("Il PG locale non puo essere rimosso dal tracker.");
          return false;
        }

        const removed = getCombatant(combatantId);
        combatState.combatants = combatState.combatants.filter(function keepCombatant(combatant) {
          return combatant.id !== combatantId;
        });

        if (combatState.selectedTargetId === combatantId) {
          const firstNpc = combatState.combatants.find(function findNpc(combatant) {
            return combatant.kind === "npc";
          });
          combatState.selectedTargetId = firstNpc ? firstNpc.id : "pc-local";
        }

        combatState.currentTurnIndex = Math.min(combatState.currentTurnIndex, combatState.combatants.length - 1);
        combatState.lastEvent = "Combattente rimosso: " + (removed ? removed.name : combatantId) + ".";
        renderCombat();
        appendLog(combatState.lastEvent);
        return true;
      }

      function applyDamageToCombatant(combatantId, amount) {
        const combatant = getCombatant(combatantId);
        const damageAmount = clampNumber(amount, 0, 9999, 0);

        if (!combatant) {
          return false;
        }

        if (combatant.kind === "pc") {
          window.UltimateVTTState.applyDamage(damageAmount);
          syncPlayerCombatantFromState();
        } else {
          combatant.hitPoints = Math.max(0, combatant.hitPoints - damageAmount);
          combatant.defeated = combatant.hitPoints <= 0;
        }

        combatState.lastEvent = combatant.name + " subisce " + damageAmount + " danni.";
        renderCombat();
        appendLog(combatState.lastEvent);
        return true;
      }

      function healCombatant(combatantId, amount) {
        const combatant = getCombatant(combatantId);
        const healAmount = clampNumber(amount, 0, 9999, 0);

        if (!combatant) {
          return false;
        }

        if (combatant.kind === "pc") {
          window.UltimateVTTState.heal(healAmount);
          syncPlayerCombatantFromState();
        } else {
          combatant.hitPoints = Math.min(combatant.maxHitPoints, combatant.hitPoints + healAmount);
          combatant.defeated = combatant.hitPoints <= 0;
        }

        combatState.lastEvent = combatant.name + " recupera " + healAmount + " HP.";
        renderCombat();
        appendLog(combatState.lastEvent);
        return true;
      }

      function setRollMode(mode) {
        if (mode !== "normal" && mode !== "advantage" && mode !== "disadvantage") {
          return false;
        }
        combatState.rollMode = mode;
        renderRollModeButtons();
        return true;
      }

      function getAttackInputs() {
        const activeCombatant = getActiveCombatant();
        const attackBonusInput = getElement("moduleFiveAttackBonusInput");
        const damageFormulaInput = getElement("moduleFiveDamageFormulaInput");
        const targetSelect = getElement("moduleFiveTargetSelect");
        const targetAcInput = getElement("moduleFiveTargetAcInput");
        const targetId = targetSelect && targetSelect.value ? targetSelect.value : combatState.selectedTargetId;
        const target = getCombatant(targetId);
        const attackBonusFallback = activeCombatant ? activeCombatant.attackBonus : 0;
        const damageFormulaFallback = activeCombatant ? activeCombatant.damageFormula : "1d4";
        const targetAcFallback = target ? target.armorClass : 10;

        return {
          attacker: activeCombatant,
          target: target,
          targetId: targetId,
          attackBonus: clampNumber(attackBonusInput ? attackBonusInput.value : attackBonusFallback, -20, 50, attackBonusFallback),
          damageFormula: damageFormulaInput && damageFormulaInput.value ? damageFormulaInput.value : damageFormulaFallback,
          targetArmorClass: clampNumber(targetAcInput ? targetAcInput.value : targetAcFallback, 1, 99, targetAcFallback)
        };
      }

      function resolveAttack(forceCritical) {
        syncPlayerCombatantFromState();
        const inputs = getAttackInputs();
        const attacker = inputs.attacker;
        const target = inputs.target;

        if (!attacker) {
          combatState.lastRoll.title = "Errore";
          combatState.lastRoll.detail = "Nessun attaccante attivo.";
          renderCombat();
          return null;
        }

        if (!target) {
          combatState.lastRoll.title = "Errore";
          combatState.lastRoll.detail = "Nessun target selezionato.";
          renderCombat();
          return null;
        }

        const attackRoll = rollD20WithMode(combatState.rollMode);
        const attackTotal = attackRoll.chosen + inputs.attackBonus;
        const critical = Boolean(forceCritical || attackRoll.naturalTwenty);
        const automaticMiss = attackRoll.naturalOne && !forceCritical;
        const hit = !automaticMiss && (critical || attackTotal >= inputs.targetArmorClass);
        let damageRoll = null;

        if (hit) {
          damageRoll = rollDamageFormula(inputs.damageFormula, critical);
          applyDamageToCombatant(target.id, damageRoll.total);
        }

        const modeText = combatState.rollMode === "normal" ? "normale" : combatState.rollMode === "advantage" ? "vantaggio" : "svantaggio";
        const hitText = hit ? critical ? "CRITICO" : "colpito" : "mancato";
        const rollText = attackRoll.rolls.join("/");
        const damageText = damageRoll ? " Danni: " + damageRoll.total + " (" + describeDamageRoll(damageRoll) + ")." : "";

        combatState.lastRoll.title = attacker.name + " vs " + target.name;
        combatState.lastRoll.detail = "Tiro " + modeText + " [" + rollText + "] + " + inputs.attackBonus + " = " + attackTotal + " contro CA " + inputs.targetArmorClass + ": " + hitText + "." + damageText;
        combatState.lastEvent = combatState.lastRoll.detail;
        setTargetFromCombatant(target.id);
        renderCombat();
        appendLog(combatState.lastRoll.detail);

        return {
          attacker: cloneData(attacker),
          target: cloneData(target),
          attackRoll: attackRoll,
          attackTotal: attackTotal,
          hit: hit,
          critical: critical,
          damageRoll: damageRoll
        };
      }

      // Attacco diretto tra due combattenti SPECIFICI (non dipende dal turno corrente ne' dai campi
      // del DOM): usato dall'IA dei nemici (modulo 33) per far attaccare un PNG contro un bersaglio
      // preciso. Tira per colpire e, se colpisce, tira i danni e li applica; imposta lastRoll/
      // lastEvent nel formato "Attaccante vs Bersaglio ..." (cosi' la memoria di combattimento del
      // modulo 29 e l'attribuzione XP del modulo 15 lo riconoscono come qualunque altro attacco).
      function resolveAttackBetween(attackerId, targetId, mode) {
        const attacker = getCombatant(attackerId);
        const target = getCombatant(targetId);
        if (!attacker || !target) { return null; }
        const rollMode = (mode === "advantage" || mode === "disadvantage") ? mode : "normal";
        const attackRoll = rollD20WithMode(rollMode);
        const attackTotal = attackRoll.chosen + (attacker.attackBonus || 0);
        const critical = Boolean(attackRoll.naturalTwenty);
        const automaticMiss = attackRoll.naturalOne;
        const targetAc = typeof target.armorClass === "number" ? target.armorClass : 10;
        const hit = !automaticMiss && (critical || attackTotal >= targetAc);
        let damageRoll = null;
        if (hit) {
          damageRoll = rollDamageFormula(attacker.damageFormula || "1d4", critical);
          applyDamageToCombatant(target.id, damageRoll.total);
        }
        const hitText = hit ? (critical ? "CRITICO" : "colpito") : "mancato";
        const damageText = damageRoll ? " Danni: " + damageRoll.total + " (" + describeDamageRoll(damageRoll) + ")." : "";
        combatState.lastRoll.title = attacker.name + " vs " + target.name;
        combatState.lastRoll.detail = "d20 " + attackRoll.chosen + "+" + (attacker.attackBonus || 0) + "=" + attackTotal + " vs CA " + targetAc + ": " + hitText + "." + damageText;
        combatState.lastEvent = combatState.lastRoll.detail;
        renderCombat();
        appendLog(combatState.lastRoll.detail);
        return {
          attacker: cloneData(attacker), target: cloneData(target),
          attackRoll: attackRoll, attackTotal: attackTotal, hit: hit, critical: critical, damageRoll: damageRoll
        };
      }

      /* ---- PATCH: DUE FASI (colpire → danni) con HUD animato ---- */
      var pendingAttackStep = null;

      function getAphud(id) { return document.getElementById(id); }

      function openAttackHud(title) {
        var h = getAphud("attackPhaseHud");
        if (h) h.classList.add("is-visible");
        var t = getAphud("aphudTitle"); if (t) t.textContent = title;
        var d = getAphud("aphudDie"); if (d) d.textContent = "–";
        var l = getAphud("aphudLines"); if (l) l.innerHTML = "";
        var a = getAphud("aphudActions"); if (a) a.innerHTML = "";
      }
      function closeAttackHud() {
        var h = getAphud("attackPhaseHud");
        if (h) h.classList.remove("is-visible");
        pendingAttackStep = null;
      }
      function aphudSetDie(val) {
        var d = getAphud("aphudDie"); if (d) d.textContent = val;
      }
      function aphudLines(html) {
        var l = getAphud("aphudLines"); if (l) l.innerHTML = html;
      }
      function aphudBtn(label, cls, fn) {
        var a = getAphud("aphudActions"); if (!a) return;
        var b = document.createElement("button");
        b.className = "combat-control-button " + (cls || "");
        b.textContent = label;
        b.type = "button";
        b.addEventListener("click", fn);
        a.appendChild(b);
      }
      function spinAphudDie(faces, finalVal, cb) {
        var el = getAphud("aphudDie");
        if (!el) { if (cb) cb(); return; }
        el.classList.add("spin");
        var n = 0;
        var iv = setInterval(function () {
          el.textContent = Math.floor(Math.random() * faces) + 1;
          n += 1;
          if (n >= 12) {
            clearInterval(iv);
            el.classList.remove("spin");
            el.textContent = finalVal;
            if (cb) cb();
          }
        }, 42);
      }

      /* FASE 1: tiro per colpire */
      function resolveAttackStep1(forceCritical) {
        syncPlayerCombatantFromState();
        var inputs = getAttackInputs();
        if (!inputs.attacker) { appendLog("Errore: nessun attaccante."); return; }
        if (!inputs.target)   { appendLog("Errore: nessun target."); return; }

        openAttackHud("Tiro per colpire");
        var attackRoll = rollD20WithMode(combatState.rollMode);
        var attackTotal = attackRoll.chosen + inputs.attackBonus;
        var critical = Boolean(forceCritical || attackRoll.naturalTwenty);
        var automaticMiss = attackRoll.naturalOne && !forceCritical;
        var hit = !automaticMiss && (critical || attackTotal >= inputs.targetArmorClass);
        var modeText = combatState.rollMode === "normal" ? "" :
                       combatState.rollMode === "advantage" ? " [Vant. " + attackRoll.rolls.join("/") + "]" :
                       " [Svant. " + attackRoll.rolls.join("/") + "]";

        pendingAttackStep = {
          inputs: inputs,
          attackRoll: attackRoll,
          attackTotal: attackTotal,
          critical: critical,
          hit: hit
        };

        spinAphudDie(20, attackRoll.chosen, function () {
          var acText = inputs.targetArmorClass;
          var rollLine = "d20 " + attackRoll.chosen + modeText +
                         " + " + inputs.attackBonus + " = <span class='big'>" + attackTotal + "</span>" +
                         " vs CA " + acText;
          var resultLine = critical
            ? "<span class='crit'>✦ COLPO CRITICO!</span>"
            : attackRoll.naturalOne && !forceCritical
              ? "<span class='miss'>✕ Fallimento critico</span>"
              : hit
                ? "<span class='hit'>✔ Colpito!</span>"
                : "<span class='miss'>✗ Mancato (CA " + acText + ")</span>";

          aphudLines(
            "<b>" + inputs.attacker.name + "</b> → <b>" + inputs.target.name + "</b><br>" +
            rollLine + "<br>" + resultLine
          );

          if (hit) {
            aphudBtn("🎲 Tira danni (" + inputs.damageFormula + ")", "", function () { resolveAttackStep2(); });
            aphudBtn("Annulla", "style='opacity:.6'", closeAttackHud);
          } else {
            combatState.lastRoll.title = inputs.attacker.name + " vs " + inputs.target.name;
            combatState.lastRoll.detail = "d20 " + attackRoll.chosen + "+" + inputs.attackBonus + "=" + attackTotal + " vs CA " + acText + ": mancato.";
            combatState.lastEvent = combatState.lastRoll.detail;
            appendLog(combatState.lastRoll.detail);
            setTargetFromCombatant(inputs.target.id);
            renderCombat();
            aphudBtn("Chiudi", "", closeAttackHud);
          }
        });
      }

      /* FASE 2: tiro per i danni */
      function resolveAttackStep2() {
        if (!pendingAttackStep) return;
        var p = pendingAttackStep;
        openAttackHud("Tiro per i danni" + (p.critical ? " — CRITICO" : ""));

        var damageRoll = rollDamageFormula(p.inputs.damageFormula, p.critical);
        var firstDie = (p.inputs.damageFormula.match(/d(\d+)/) || [null, "6"])[1];
        var firstRoll = damageRoll.details[0] && damageRoll.details[0].rolls
                        ? damageRoll.details[0].rolls[0] : damageRoll.total;

        spinAphudDie(parseInt(firstDie, 10) || 6, firstRoll, function () {
          applyDamageToCombatant(p.inputs.target.id, damageRoll.total);

          var dmgDesc = describeDamageRoll(damageRoll);
          var targetNow = getCombatant(p.inputs.target.id);
          var hpText = targetNow
            ? targetNow.hitPoints + " / " + targetNow.maxHitPoints + " HP"
            : "";
          var defeatedText = targetNow && targetNow.defeated ? " — <span class='crit'>SCONFITTO</span>" : "";

          aphudLines(
            (p.critical ? "<span class='crit'>✦ Dadi raddoppiati!</span><br>" : "") +
            "Danni: <span class='big dmg'>" + damageRoll.total + "</span><br>" +
            "<span style='font-size:11px;opacity:.75'>" + dmgDesc + "</span><br>" +
            "<b>" + p.inputs.target.name + "</b>: " + hpText + defeatedText
          );

          combatState.lastRoll.title = p.inputs.attacker.name + " vs " + p.inputs.target.name;
          combatState.lastRoll.detail = "COLPITO! Danni: " + damageRoll.total + " (" + dmgDesc + ")." + (p.critical ? " CRITICO!" : "");
          combatState.lastEvent = combatState.lastRoll.detail;
          appendLog(combatState.lastRoll.detail);
          setTargetFromCombatant(p.inputs.target.id);
          pendingAttackStep = null;
          renderCombat();
          aphudBtn("Chiudi", "", closeAttackHud);
        });
      }
      /* ---- FINE PATCH DUE FASI ---- */

      /* ---- PATCH: INITIATIVE STRIP ---- */
      function renderInitiativeStrip() {
        var strip = document.getElementById("initiativeStrip");
        if (!strip) return;
        if (!combatState.active || combatState.combatants.length === 0) {
          strip.classList.remove("is-visible");
          strip.innerHTML = "";
          return;
        }
        strip.classList.add("is-visible");
        var sorted = combatState.combatants.slice().sort(function (a, b) {
          return b.initiative - a.initiative || b.initiativeBonus - a.initiativeBonus;
        });
        var currentId = combatState.combatants[combatState.currentTurnIndex]
                        ? combatState.combatants[combatState.currentTurnIndex].id : null;
        var html = sorted.map(function (c) {
          var isCurrent = c.id === currentId;
          var isDefeated = c.defeated || c.hitPoints <= 0;
          var dotColor = c.kind === "pc" ? "#5bb7c8" : "#c9362b";
          return '<div class="init-chip' +
            (isCurrent ? " is-current" : "") +
            (isDefeated ? " is-defeated" : "") + '">' +
            '<span class="init-chip-dot" style="background:' + dotColor + '"></span>' +
            '<span class="init-chip-name">' + c.name + '</span>' +
            '<span class="init-chip-num">' + c.initiative + '</span>' +
            '</div>';
        }).join("");
        strip.innerHTML = html;
        var cur = strip.querySelector(".is-current");
        if (cur) cur.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      }
      /* ---- FINE PATCH INITIATIVE STRIP ---- */

      function setTargetFromCombatant(combatantId) {
        const combatant = getCombatant(combatantId);
        const targetSelect = getElement("moduleFiveTargetSelect");
        const targetAcInput = getElement("moduleFiveTargetAcInput");

        if (!combatant) {
          return false;
        }

        combatState.selectedTargetId = combatantId;

        if (targetSelect) {
          targetSelect.value = combatantId;
        }

        if (targetAcInput) {
          targetAcInput.value = String(combatant.armorClass);
        }

        return true;
      }

      function syncAttackInputsWithActiveCombatant() {
        const activeCombatant = getActiveCombatant();
        const attackBonusInput = getElement("moduleFiveAttackBonusInput");
        const damageFormulaInput = getElement("moduleFiveDamageFormulaInput");

        if (!activeCombatant) {
          return;
        }

        if (attackBonusInput && document.activeElement !== attackBonusInput) {
          attackBonusInput.value = String(activeCombatant.attackBonus);
        }

        if (damageFormulaInput && document.activeElement !== damageFormulaInput) {
          damageFormulaInput.value = activeCombatant.damageFormula;
        }
      }

      function renderNpcSelect() {
        const select = getElement("moduleFiveNpcSelect");
        if (!select) {
          return;
        }

        clearNode(select);

        npcCatalog.forEach(function appendNpcOption(npc) {
          const option = document.createElement("option");
          option.value = npc.id;
          option.textContent = npc.name + " GS " + npc.challenge;
          select.appendChild(option);
        });
      }

      function renderTargetSelect() {
        const select = getElement("moduleFiveTargetSelect");
        if (!select) {
          return;
        }

        const currentValue = select.value || combatState.selectedTargetId;
        clearNode(select);

        combatState.combatants.forEach(function appendTargetOption(combatant) {
          const option = document.createElement("option");
          option.value = combatant.id;
          option.textContent = combatant.name + " CA " + combatant.armorClass;
          select.appendChild(option);
        });

        if (getCombatant(currentValue)) {
          select.value = currentValue;
          combatState.selectedTargetId = currentValue;
        } else if (combatState.combatants.length > 0) {
          select.value = combatState.combatants[0].id;
          combatState.selectedTargetId = combatState.combatants[0].id;
        }

        const selectedTarget = getCombatant(combatState.selectedTargetId);
        const targetAcInput = getElement("moduleFiveTargetAcInput");
        if (selectedTarget && targetAcInput && document.activeElement !== targetAcInput) {
          targetAcInput.value = String(selectedTarget.armorClass);
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

      function renderCombatTracker() {
        const list = getElement("combatTrackerList");
        const activeCombatant = getActiveCombatant();

        if (!list) {
          return;
        }

        clearNode(list);

        combatState.combatants.forEach(function renderCombatant(combatant) {
          const row = document.createElement("div");
          const header = document.createElement("div");
          const name = document.createElement("div");
          const initiative = document.createElement("div");
          const meta = document.createElement("div");
          const hpRow = document.createElement("div");
          const hpMeter = document.createElement("div");
          const hpFill = document.createElement("div");
          const hpText = document.createElement("div");
          const actions = document.createElement("div");
          const hpPercent = combatant.maxHitPoints > 0 ? Math.max(0, Math.min(100, Math.round((combatant.hitPoints / combatant.maxHitPoints) * 100))) : 0;

          row.className = "combatant-row";
          if (activeCombatant && activeCombatant.id === combatant.id) {
            row.classList.add("active");
          }
          if (combatant.defeated || combatant.hitPoints <= 0) {
            row.classList.add("defeated");
          }

          header.className = "combatant-header";
          name.className = "combatant-name";
          initiative.className = "initiative-badge";
          meta.className = "combatant-meta";
          hpRow.className = "combat-hp-row";
          hpMeter.className = "combat-hp-meter";
          hpFill.className = "combat-hp-fill";
          hpText.className = "combatant-meta";
          actions.className = "combat-row-actions";

          name.textContent = combatant.name;
          initiative.textContent = combatant.initiative || "-";
          meta.textContent = (combatant.kind === "pc" ? "PG" : "PNG") + " | CA " + combatant.armorClass + " | Init " + formatModifier(combatant.initiativeBonus);
          hpFill.style.setProperty("--combat-hp-value", hpPercent + "%");
          hpText.textContent = combatant.hitPoints + " / " + combatant.maxHitPoints + " HP";

          header.appendChild(name);
          header.appendChild(initiative);
          hpMeter.appendChild(hpFill);
          hpRow.appendChild(hpMeter);
          hpRow.appendChild(hpText);

          actions.appendChild(createButton("combat-row-button", "Target", function handleTargetClick() {
            setTargetFromCombatant(combatant.id);
            renderCombat();
          }));
          actions.appendChild(createButton("combat-row-button", "-5 HP", function handleDamageClick() {
            applyDamageToCombatant(combatant.id, 5);
          }));
          actions.appendChild(createButton("combat-row-button", "+5 HP", function handleHealClick() {
            healCombatant(combatant.id, 5);
          }));
          actions.appendChild(createButton("combat-row-button", "Remove", function handleRemoveClick() {
            removeCombatant(combatant.id);
          }));

          row.appendChild(header);
          row.appendChild(meta);
          row.appendChild(hpRow);
          row.appendChild(actions);
          list.appendChild(row);
        });
      }

      function renderRollModeButtons() {
        getAll(".roll-mode-button").forEach(function renderButton(button) {
          const mode = button.getAttribute("data-roll-mode");
          button.classList.toggle("active", mode === combatState.rollMode);
        });
      }

      function renderCombatResult() {
        setText("combatResultValue", combatState.lastRoll.title);
        setText("combatResultDetail", combatState.lastRoll.detail);
      }

      function renderCombatSummary() {
        const activeCombatant = getActiveCombatant();
        const enemyCount = combatState.combatants.filter(function countEnemies(combatant) {
          return combatant.kind === "npc" && !combatant.defeated && combatant.hitPoints > 0;
        }).length;

        setText("combatRoundSummary", combatState.round);
        setText("combatTurnSummary", activeCombatant ? activeCombatant.name : "-");
        setText("combatEnemySummary", enemyCount);
        setText("combatEventSummary", combatState.lastEvent);
        setText("activeActorPill", "Turno: " + (activeCombatant ? activeCombatant.name : "nessuno"));
        setText("combatModePill", combatState.active ? "Combat: round " + combatState.round : "Combat: off");
      }

      function renderCombat() {
        syncPlayerCombatantFromState();
        renderNpcSelect();
        renderTargetSelect();
        renderCombatTracker();
        renderRollModeButtons();
        renderCombatResult();
        renderCombatSummary();
        syncAttackInputsWithActiveCombatant();
        renderInitiativeStrip(); /* PATCH: aggiorna strip */
        /* PATCH: aggiorna pill turno nella topbar */
        var active = getActiveCombatant();
        var pill = document.getElementById("activeTurnPill");
        if (pill) pill.textContent = "TURNO: " + (active ? active.name : "—");
      }

      function createCombatModalContent() {
        const fragment = document.createDocumentFragment();
        const section = document.createElement("section");
        const title = document.createElement("h3");
        const activeCombatant = getActiveCombatant();

        section.className = "sheet-section";
        title.className = "sheet-section-title";
        title.textContent = "Tracker combattimento";
        section.appendChild(title);

        combatState.combatants.forEach(function appendCombatantRow(combatant) {
          const row = document.createElement("div");
          const value = document.createElement("span");
          row.className = "sheet-row";
          row.textContent = combatant.name + " | CA " + combatant.armorClass + " | HP " + combatant.hitPoints + "/" + combatant.maxHitPoints;
          value.className = "sheet-row-value";
          value.textContent = activeCombatant && activeCombatant.id === combatant.id ? "Turno" : String(combatant.initiative || "-");
          row.appendChild(value);
          section.appendChild(row);
        });

        fragment.appendChild(section);
        return fragment;
      }

      function bindCombatControls() {
        const addNpcButton = getElement("moduleFiveAddNpcButton");
        const rollInitiativeButton = getElement("moduleFiveRollInitiativeButton");
        const nextTurnButton = getElement("moduleFiveNextTurnButton");
        const startCombatButton = getElement("moduleFiveStartCombatButton");
        const endCombatButton = getElement("moduleFiveEndCombatButton");
        const attackButton = getElement("moduleFiveAttackButton");
        const criticalDamageButton = getElement("moduleFiveCriticalDamageButton");
        const targetSelect = getElement("moduleFiveTargetSelect");
        const openCombatModalButton = getElement("openCombatModalButton");

        if (addNpcButton) {
          addNpcButton.addEventListener("click", function handleAddNpcClick() {
            const select = getElement("moduleFiveNpcSelect");
            if (select) {
              addNpc(select.value);
            }
          });
        }

        if (rollInitiativeButton) {
          rollInitiativeButton.addEventListener("click", rollAllInitiative);
        }

        if (nextTurnButton) {
          nextTurnButton.addEventListener("click", nextTurn);
        }

        if (startCombatButton) {
          startCombatButton.addEventListener("click", startCombat);
        }

        if (endCombatButton) {
          endCombatButton.addEventListener("click", endCombat);
        }

        if (attackButton) {
          attackButton.addEventListener("click", function handleAttackClick() {
            resolveAttackStep1(false); /* PATCH: due fasi */
          });
        }

        if (criticalDamageButton) {
          criticalDamageButton.addEventListener("click", function handleCriticalClick() {
            resolveAttackStep1(true); /* PATCH: due fasi forzato critico */
          });
        }

        /* PATCH: chiudi HUD attacco */
        var aphClose = document.getElementById("aphudClose");
        if (aphClose) {
          aphClose.addEventListener("click", function () { closeAttackHud(); });
        }

        if (targetSelect) {
          targetSelect.addEventListener("change", function handleTargetChange() {
            setTargetFromCombatant(targetSelect.value);
          });
        }

        getAll(".roll-mode-button").forEach(function bindRollModeButton(button) {
          button.addEventListener("click", function handleRollModeClick() {
            setRollMode(button.getAttribute("data-roll-mode"));
          });
        });

        if (openCombatModalButton) {
          openCombatModalButton.addEventListener("click", function handleCombatModalClick() {
            if (window.UltimateVTTModule2 && window.UltimateVTTModule2.openModal) {
              window.UltimateVTTModule2.openModal("Combat Tracker", createCombatModalContent(), "Round " + combatState.round);
            }
          });
        }
      }

      function initializeCombatEngine() {
        syncPlayerCombatantFromState();
        bindCombatControls();
        renderCombat();

        window.UltimateVTTState.subscribe(function handleStateChange() {
          syncPlayerCombatantFromState();
          renderCombat();
        });
      }

      window.UltimateVTTCombat = {
        npcCatalog: cloneData(npcCatalog),
        getState: function getCombatState() {
          return cloneData(combatState);
        },
        rollD20WithMode: rollD20WithMode,
        parseDamageFormula: parseDamageFormula,
        rollDamageFormula: rollDamageFormula,
        rollAllInitiative: rollAllInitiative,
        startCombat: startCombat,
        endCombat: endCombat,
        nextTurn: nextTurn,
        addNpc: addNpc,
        removeCombatant: removeCombatant,
        applyDamageToCombatant: applyDamageToCombatant,
        healCombatant: healCombatant,
        setRollMode: setRollMode,
        resolveAttack: resolveAttack,
        // Attacco a DUE FASI con animazione dei dadi (tiro per colpire -> tiro per i danni): e' il
        // flusso che mostra davvero i dadi al giocatore. La HUD BG3 (modulo 23) lo usa se presente,
        // cosi' cliccare "Attacca" fa vedere il tiro invece di risolvere tutto in silenzio.
        resolveAttackAnimato: resolveAttackStep1,
        // Attacco diretto tra due combattenti (usato dall'IA nemici, modulo 33).
        resolveAttackBetween: resolveAttackBetween,
        renderCombat: renderCombat
      };

      initializeCombatEngine();

      window.UltimateVTT.registerModule(5, {
        combatTracker: true,
        npcInitiative: true,
        advantageDisadvantage: true,
        criticalDamage: true,
        combatants: combatState.combatants.length,
        npcCatalog: npcCatalog.length
      });

      appendLog("Modulo 5 caricato: tracker combattimento, iniziativa PNG, vantaggio, svantaggio e danni critici.");
    })();
    // --- FINE MODULO 5 JS: COMBAT TRACKER, INIZIATIVA PNG, VANTAGGIO/SVANTAGGIO, DANNI CRITICI ---
  