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

      // Regola 2 (multi-party): TUTTI i membri vivi del roster hotseat (window.partyData) entrano
      // in combattimento come combattenti distinti, non solo la scheda attiva. Il membro ATTIVO
      // resta rappresentato da "pc-local" (sincronizzato dallo state manager, come sempre); gli
      // ALTRI diventano "pc-party-<id>", con statistiche derivate dalla loro scheda nel roster e
      // HP persistiti nel roster stesso (cosi' i danni restano sul personaggio giusto).
      function syncPartyCombatantsFromRoster() {
        const roster = window.partyData;
        if (!Array.isArray(roster) || roster.length < 2) {
          return; // party di 1 (o assente): basta pc-local
        }
        let activeId = null;
        try { activeId = window.UltimateVTTState.getState().identity.id; } catch (e) { activeId = null; }

        roster.forEach(function syncMember(member) {
          if (!member || !member.identity || !member.identity.id) {
            return;
          }
          if (member.identity.id === activeId) {
            return; // gia' rappresentato da pc-local
          }
          const combatantId = "pc-party-" + member.identity.id;
          const dexScore = member.abilities && member.abilities.dex ? member.abilities.dex.score : 10;
          const strScore = member.abilities && member.abilities.str ? member.abilities.str.score : 10;
          const dexMod = Math.floor((dexScore - 10) / 2);
          const strMod = Math.floor((strScore - 10) / 2);
          const attackMod = Math.max(strMod, dexMod);
          const existing = getCombatant(combatantId);
          const combatant = existing || {
            id: combatantId, kind: "pc", temporaryHitPoints: 0, initiative: 0, defeated: false
          };
          combatant.name = member.identity.name || combatantId;
          combatant.armorClass = (member.resources && member.resources.armorClass) || 10;
          combatant.maxHitPoints = (member.resources && member.resources.hp && member.resources.hp.max) || 10;
          combatant.hitPoints = (member.resources && member.resources.hp && member.resources.hp.current != null)
            ? member.resources.hp.current : combatant.maxHitPoints;
          combatant.initiativeBonus = dexMod;
          combatant.attackBonus = (member.proficiencyBonus || 2) + attackMod;
          combatant.damageFormula = attackMod > 0 ? ("1d8+" + attackMod) : (attackMod < 0 ? ("1d8" + attackMod) : "1d8");
          combatant.defeated = combatant.hitPoints <= 0;
          if (!existing) {
            combatState.combatants.push(combatant);
          }
        });
      }

      // Regola 4 (distanze): celle fra due combattenti sulla griglia (Chebyshev, come si muovono i
      // token), risolte via mappatura FSM + posizioni dei token. null se una posizione non e' nota
      // (es. teatro della mente / membro senza token): in quel caso l'attacco non viene bloccato.
      function combatantCell(combatantId) {
        let tokenId = null;
        try {
          if (window.UltimateVTTCombatFSM && window.UltimateVTTCombatFSM.combattenteAToken) {
            tokenId = window.UltimateVTTCombatFSM.combattenteAToken(combatantId);
          }
        } catch (e) { tokenId = null; }
        if (!tokenId && combatantId === "pc-local") { tokenId = "token-pc"; }
        if (!tokenId) {
          const m = /^npc-(\w+)$/.exec(String(combatantId)); if (m) { tokenId = "token-npc-" + m[1]; }
        }
        if (!tokenId || !window.UltimateVTTTokenPhysics || !window.UltimateVTTTokenPhysics.getState) {
          return null;
        }
        let tokens; try { tokens = window.UltimateVTTTokenPhysics.getState().tokens || []; } catch (e) { return null; }
        const token = tokens.find(function findToken(t) { return t.id === tokenId; });
        return token ? { cellX: token.cellX, cellY: token.cellY } : null;
      }

      function distanzaCelle(aId, bId) {
        const a = combatantCell(aId), b = combatantCell(bId);
        if (!a || !b) { return null; }
        return Math.max(Math.abs(a.cellX - b.cellX), Math.abs(a.cellY - b.cellY));
      }

      // Portata dell'arma in celle: mischia = 1 (adiacente); a distanza (arco/balestra equipaggiata
      // in mano principale) = 12 celle (~18 m). I PNG del bestiario attaccano in mischia.
      function portataArma(attacker) {
        if (!attacker || attacker.kind !== "pc") { return 1; }
        try {
          const inv = window.UltimateVTTInventory;
          if (inv && inv.getState) {
            const st = inv.getState();
            const mainId = st.equipmentSlots && st.equipmentSlots.mainHand;
            const entry = mainId ? (st.inventory || []).find(function (e) { return e.inventoryId === mainId; }) : null;
            const cat = entry ? (inv.itemCatalog || []).find(function (c) { return c.id === entry.catalogId; }) : null;
            if (cat && (/bow|crossbow/i.test(cat.id || "") || /arco|balestra/i.test(cat.name || ""))) { return 12; }
          }
        } catch (e) { /* fallback mischia */ }
        return 1;
      }

      // Regola 1 (action economy): l'attacco di un PG spende la sua Azione. Il pool e' quello del
      // modulo 05 (azione/bonus/reazione del tavolo hotseat, resettato a ogni cambio turno). Se il
      // modulo non e' caricato (ambienti di test ridotti) non si blocca nulla.
      function spendiAzioneDelPg() {
        const inv = window.UltimateVTTInventory;
        if (!inv || !inv.spendActionResource) { return true; }
        try { return inv.spendActionResource("action") === true; } catch (e) { return true; }
      }

      // Guardie comuni pre-attacco per un attaccante PG: portata dell'arma, poi spesa dell'Azione.
      // Ritorna null se l'attacco puo' procedere, altrimenti il messaggio di blocco.
      function bloccoAttaccoPg(attacker, target) {
        if (!attacker || attacker.kind !== "pc") { return null; } // i PNC (IA) gestiscono da soli il loro turno
        const dist = distanzaCelle(attacker.id, target.id);
        const portata = portataArma(attacker);
        if (dist != null && dist > portata) {
          return "Fuori portata: " + target.name + " è a " + dist + " celle, l'arma arriva a " + portata + ".";
        }
        if (!spendiAzioneDelPg()) {
          return "Azione già spesa in questo turno: usa Termina turno.";
        }
        return null;
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
        syncPartyCombatantsFromRoster();
        // Non si combatte con tutto il party a terra: dopo una sconfitta lo scontro puo' ripartire
        // solo quando almeno un PG e' di nuovo cosciente (rianimato/curato DAVVERO), altrimenti si
        // riaprirebbe un combattimento gia' perso in uno stato rotto (turni che girano a vuoto,
        // nemici senza bersagli validi).
        var pgCoscienti = combatState.combatants.some(function (c) {
          return c.kind === "pc" && !c.defeated && c.hitPoints > 0;
        });
        if (!pgCoscienti) {
          combatState.lastEvent = "Impossibile iniziare il combattimento: tutti i PG sono incoscienti. Rianimali prima.";
          renderCombat();
          appendLog(combatState.lastEvent);
          return;
        }
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
        // A combattimento spento avanzare il turno NON deve (ri)avviare lo scontro: dopo un TPK o
        // una fine combattimento, un "Turno Succ." (o un nextTurn programmatico rimasto in coda)
        // riavviava il combattimento in uno stato incoerente. Lo scontro parte SOLO da startCombat
        // (pulsante Start, spawn dei nemici, ponte chat).
        if (!combatState.active) {
          combatState.lastEvent = "Il combattimento non e' attivo: nessun turno da avanzare.";
          renderCombat();
          appendLog(combatState.lastEvent);
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

      // Membro del roster hotseat (window.partyData) rappresentato da un combattente "pc-party-<id>".
      function partyMemberByCombatantId(combatantId) {
        const m = /^pc-party-(.+)$/.exec(String(combatantId || ""));
        if (!m || !Array.isArray(window.partyData)) {
          return null;
        }
        return window.partyData.find(function findMember(member) {
          return member && member.identity && member.identity.id === m[1];
        }) || null;
      }

      function applyDamageToCombatant(combatantId, amount) {
        const combatant = getCombatant(combatantId);
        const damageAmount = clampNumber(amount, 0, 9999, 0);

        if (!combatant) {
          return false;
        }

        // Routing per ID, non per kind: "pc-local" e' il PG della scheda ATTIVA (state manager);
        // "pc-party-<id>" sono gli ALTRI membri del party in hotseat (HP persistiti nel roster
        // window.partyData, cosi' il danno resta sul personaggio giusto anche cambiando scheda).
        if (combatantId === "pc-local") {
          window.UltimateVTTState.applyDamage(damageAmount);
          syncPlayerCombatantFromState();
        } else if (combatant.kind === "pc") {
          combatant.hitPoints = Math.max(0, combatant.hitPoints - damageAmount);
          combatant.defeated = combatant.hitPoints <= 0;
          const member = partyMemberByCombatantId(combatantId);
          if (member && member.resources && member.resources.hp) {
            member.resources.hp.current = combatant.hitPoints;
          }
        } else {
          combatant.hitPoints = Math.max(0, combatant.hitPoints - damageAmount);
          combatant.defeated = combatant.hitPoints <= 0;
        }

        // Un PG a 0 HP e' INCOSCIENTE (puo' essere rialzato da un alleato), non "sconfitto" come un PNG.
        if (combatant.kind === "pc" && getCombatant(combatantId).defeated) {
          combatState.lastEvent = combatant.name + " subisce " + damageAmount + " danni e cade INCOSCIENTE!";
        } else {
          combatState.lastEvent = combatant.name + " subisce " + damageAmount + " danni.";
        }
        renderCombat();
        appendLog(combatState.lastEvent);

        // TPK: se TUTTI i PG del party sono a terra contemporaneamente, il combattimento si chiude
        // subito (resetCombat) invece di lasciare i turni dei nemici a girare su un party incosciente.
        if (combatState.active) {
          const pgVivi = combatState.combatants.filter(function contaPgVivi(c) {
            return c.kind === "pc" && !c.defeated && c.hitPoints > 0;
          });
          const pgTotali = combatState.combatants.filter(function contaPg(c) { return c.kind === "pc"; });
          if (pgTotali.length > 0 && pgVivi.length === 0) {
            resetCombat();
          }
        }
        return true;
      }

      function healCombatant(combatantId, amount) {
        const combatant = getCombatant(combatantId);
        const healAmount = clampNumber(amount, 0, 9999, 0);

        if (!combatant) {
          return false;
        }

        if (combatantId === "pc-local") {
          window.UltimateVTTState.heal(healAmount);
          syncPlayerCombatantFromState();
        } else if (combatant.kind === "pc") {
          combatant.hitPoints = Math.min(combatant.maxHitPoints, combatant.hitPoints + healAmount);
          combatant.defeated = combatant.hitPoints <= 0;
          const member = partyMemberByCombatantId(combatantId);
          if (member && member.resources && member.resources.hp) {
            member.resources.hp.current = combatant.hitPoints;
          }
        } else {
          combatant.hitPoints = Math.min(combatant.maxHitPoints, combatant.hitPoints + healAmount);
          combatant.defeated = combatant.hitPoints <= 0;
        }

        combatState.lastEvent = combatant.name + " recupera " + healAmount + " HP.";
        renderCombat();
        appendLog(combatState.lastEvent);
        return true;
      }

      // Rialza un PG incosciente (Regola 5): un alleato spende la sua Azione Bonus (o l'Azione, se
      // la bonus e' gia' stata usata — la spesa la gestisce chi chiama, es. la HUD) per rimetterlo
      // in piedi con pochi HP. Solo per PG: i PNG sconfitti restano sconfitti.
      function reviveCombatant(combatantId, hp) {
        const combatant = getCombatant(combatantId);
        if (!combatant || combatant.kind !== "pc") {
          return false;
        }
        const amount = clampNumber(hp, 1, 9999, 1);
        if (combatantId === "pc-local") {
          try { window.UltimateVTTState.setCurrentHp(amount); } catch (e) { return false; }
          syncPlayerCombatantFromState();
        } else {
          combatant.hitPoints = Math.min(amount, combatant.maxHitPoints || amount);
          combatant.defeated = false;
          const member = partyMemberByCombatantId(combatantId);
          if (member && member.resources && member.resources.hp) {
            member.resources.hp.current = combatant.hitPoints;
          }
        }
        combatState.lastEvent = combatant.name + " riprende conoscenza (" + getCombatant(combatantId).hitPoints + " HP).";
        renderCombat();
        appendLog(combatState.lastEvent);
        return true;
      }

      // TPK / interruzione forzata: chiude lo scontro (il modulo 29 ne fara' il riepilogo per il
      // Master, con esito "sconfitta del party" se tutti i PG sono a terra).
      function resetCombat() {
        try {
          if (window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.appendChatMessage) {
            window.UltimateVTTCoreGameplay.appendChatMessage("system", "💀 Tutto il party è incosciente: il combattimento si interrompe.");
          }
        } catch (e) { /* ignora */ }
        appendLog("💀 TPK: tutti i PG sono a terra. Combattimento interrotto.");
        endCombat();
        risveglioDopoLaSconfitta();
      }

      // Dopo il TPK il party NON resta in uno stato "zombie" a 0 HP: prima il Master narrava la
      // rianimazione ma meccanicamente i PG restavano incoscienti, quindi il combattimento non
      // poteva ripartire in modo valido (o ripartiva rotto). A scontro ormai chiuso — il riepilogo
      // del modulo 29 fotografa l'ultimo stato ATTIVO, quindi l'esito "sconfitta del party" resta
      // corretto — il party si risveglia con gli HP pieni, pronto a riprendere la storia. Applica
      // il risveglio solo il Master (o il gioco in solitaria/hotseat): in multiplayer decide un
      // client solo, come per tutte le azioni GM-autorevoli.
      function risveglioDopoLaSconfitta() {
        if (window.UltimateVTTSync && !window.UltimateVTTSync.isMaster()) {
          return;
        }
        combatState.combatants.forEach(function risvegliaPg(c) {
          if (c.kind !== "pc") {
            return;
          }
          reviveCombatant(c.id, c.maxHitPoints || 1);
        });
        try {
          if (window.UltimateVTTCoreGameplay && window.UltimateVTTCoreGameplay.appendChatMessage) {
            window.UltimateVTTCoreGameplay.appendChatMessage("system", "🌅 Il party si risveglia malconcio ma vivo: HP ripristinati. La storia continua.");
          }
        } catch (e) { /* ignora */ }
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

        const blocco = bloccoAttaccoPg(attacker, target);
        if (blocco) {
          combatState.lastRoll.title = "Attacco non eseguito";
          combatState.lastRoll.detail = blocco;
          combatState.lastEvent = blocco;
          renderCombat();
          appendLog(blocco);
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

      /* ---- Attacco animato tra due combattenti SPECIFICI (usato dall'IA nemici, modulo 33): stessa
         HUD dei dadi del giocatore (tiro per colpire -> tiro per i danni), ma pilotata per id invece
         che dal turno corrente/dai campi del form, e senza bisogno di click per proseguire tra le
         fasi — al termine (colpito o mancato) chiama onComplete(), cosi' chi la invoca (l'IA) sa
         quando puo' passare al turno successivo invece di indovinare un ritardo fisso scollegato
         dall'animazione vera. Un pulsante "Chiudi" resta disponibile per chi vuole saltare l'attesa. ---- */
      var PAUSA_TRA_FASI_MS = 650;
      var PAUSA_RISULTATO_MS = 1100;

      function resolveAttackAnimatoTra(attackerId, targetId, mode, onComplete) {
        var attacker = getCombatant(attackerId);
        var target = getCombatant(targetId);
        var chiuso = false;
        function fine() {
          if (chiuso) { return; }
          chiuso = true;
          closeAttackHud();
          if (typeof onComplete === "function") { onComplete(); }
        }
        if (!attacker || !target) { fine(); return; }

        var rollMode = (mode === "advantage" || mode === "disadvantage") ? mode : "normal";
        openAttackHud(attacker.name + " attacca " + target.name + "!");
        var attackRoll = rollD20WithMode(rollMode);
        var attackBonus = attacker.attackBonus || 0;
        var attackTotal = attackRoll.chosen + attackBonus;
        var critical = Boolean(attackRoll.naturalTwenty);
        var automaticMiss = attackRoll.naturalOne;
        var targetAc = typeof target.armorClass === "number" ? target.armorClass : 10;
        var hit = !automaticMiss && (critical || attackTotal >= targetAc);
        var modeText = rollMode === "normal" ? "" :
                       rollMode === "advantage" ? " [Vant. " + attackRoll.rolls.join("/") + "]" :
                       " [Svant. " + attackRoll.rolls.join("/") + "]";

        spinAphudDie(20, attackRoll.chosen, function () {
          var rollLine = "d20 " + attackRoll.chosen + modeText + " + " + attackBonus +
                         " = <span class='big'>" + attackTotal + "</span> vs CA " + targetAc;
          var resultLine = critical
            ? "<span class='crit'>✦ COLPO CRITICO!</span>"
            : automaticMiss
              ? "<span class='miss'>✕ Fallimento critico</span>"
              : hit
                ? "<span class='hit'>✔ Colpito!</span>"
                : "<span class='miss'>✗ Mancato (CA " + targetAc + ")</span>";
          aphudLines("<b>" + attacker.name + "</b> → <b>" + target.name + "</b><br>" + rollLine + "<br>" + resultLine);
          aphudBtn("Chiudi", "style='opacity:.6'", fine);

          if (!hit) {
            combatState.lastRoll.title = attacker.name + " vs " + target.name;
            combatState.lastRoll.detail = "d20 " + attackRoll.chosen + "+" + attackBonus + "=" + attackTotal + " vs CA " + targetAc + ": mancato.";
            combatState.lastEvent = combatState.lastRoll.detail;
            appendLog(combatState.lastRoll.detail);
            renderCombat();
            window.setTimeout(fine, PAUSA_RISULTATO_MS);
            return;
          }

          window.setTimeout(function () {
            if (chiuso) { return; } // gia' chiuso (es. click su "Chiudi" durante la pausa)
            openAttackHud("Tiro per i danni" + (critical ? " — CRITICO" : ""));
            var damageRoll = rollDamageFormula(attacker.damageFormula || "1d4", critical);
            var firstDie = (String(attacker.damageFormula || "1d4").match(/d(\d+)/) || [null, "6"])[1];
            var firstRoll = damageRoll.details[0] && damageRoll.details[0].rolls
                            ? damageRoll.details[0].rolls[0] : damageRoll.total;

            spinAphudDie(parseInt(firstDie, 10) || 6, firstRoll, function () {
              applyDamageToCombatant(target.id, damageRoll.total);

              var dmgDesc = describeDamageRoll(damageRoll);
              var targetNow = getCombatant(target.id);
              var hpText = targetNow ? targetNow.hitPoints + " / " + targetNow.maxHitPoints + " HP" : "";
              var defeatedText = targetNow && targetNow.defeated ? " — <span class='crit'>SCONFITTO</span>" : "";

              aphudLines(
                (critical ? "<span class='crit'>✦ Dadi raddoppiati!</span><br>" : "") +
                "Danni: <span class='big dmg'>" + damageRoll.total + "</span><br>" +
                "<span style='font-size:11px;opacity:.75'>" + dmgDesc + "</span><br>" +
                "<b>" + target.name + "</b>: " + hpText + defeatedText
              );
              aphudBtn("Chiudi", "", fine);

              combatState.lastRoll.title = attacker.name + " vs " + target.name;
              combatState.lastRoll.detail = "COLPITO! Danni: " + damageRoll.total + " (" + dmgDesc + ")." + (critical ? " CRITICO!" : "");
              combatState.lastEvent = combatState.lastRoll.detail;
              appendLog(combatState.lastRoll.detail);
              setTargetFromCombatant(target.id);
              renderCombat();
              window.setTimeout(fine, PAUSA_RISULTATO_MS);
            });
          }, PAUSA_TRA_FASI_MS);
        });
      }

      /* FASE 1: tiro per colpire */
      function resolveAttackStep1(forceCritical) {
        syncPlayerCombatantFromState();
        var inputs = getAttackInputs();
        if (!inputs.attacker) { appendLog("Errore: nessun attaccante."); return; }
        if (!inputs.target)   { appendLog("Errore: nessun target."); return; }

        // Stesse guardie della risoluzione immediata: portata dell'arma e Azione del turno.
        var bloccoDueFasi = bloccoAttaccoPg(inputs.attacker, inputs.target);
        if (bloccoDueFasi) {
          combatState.lastRoll.title = "Attacco non eseguito";
          combatState.lastRoll.detail = bloccoDueFasi;
          combatState.lastEvent = bloccoDueFasi;
          renderCombat();
          appendLog(bloccoDueFasi);
          return;
        }

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
        // La barra iniziativa in stile BG3 (modulo 23) e' l'UNICA striscia d'iniziativa del gioco:
        // quando e' presente, questa versione precedente resta spenta, altrimenti in combattimento
        // comparivano DUE barre sovrapposte che dicevano la stessa cosa una sopra l'altra.
        if (window.UltimateVTTBG3HUD) {
          strip.classList.remove("is-visible");
          strip.innerHTML = "";
          return;
        }
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
        // Attacco diretto tra due combattenti (usato dall'IA nemici, modulo 33): risoluzione
        // immediata (senza HUD, per test/automazioni) e versione animata con la stessa HUD dei
        // dadi del giocatore, che avvisa onComplete() quando l'animazione e' davvero finita.
        resolveAttackBetween: resolveAttackBetween,
        resolveAttackAnimatoTra: resolveAttackAnimatoTra,
        // Incoscienza/rialzo dei PG e chiusura forzata (TPK) — Regola 5.
        reviveCombatant: reviveCombatant,
        resetCombat: resetCombat,
        // Distanze e portata (Regola 4) e sync del party (Regola 2), esposte anche per i test.
        distanzaCelle: distanzaCelle,
        portataArma: portataArma,
        syncPartyCombatants: syncPartyCombatantsFromRoster,
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
  