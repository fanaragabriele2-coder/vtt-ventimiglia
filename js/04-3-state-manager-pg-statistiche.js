    // --- INIZIO MODULO 3 JS: STATE MANAGER PG, STATISTICHE, 18 ABILITA, HP, CA, DADI VITA ---
    (function initializeUltimateVttModuleThree() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 3 richiede il Modulo 1.");
      }

      const abilityDefinitions = [
        { key: "str", label: "Forza", shortLabel: "For", previewId: "previewStr" },
        { key: "dex", label: "Destrezza", shortLabel: "Des", previewId: "previewDex" },
        { key: "con", label: "Costituzione", shortLabel: "Cos", previewId: "previewCon" },
        { key: "int", label: "Intelligenza", shortLabel: "Int", previewId: "previewInt" },
        { key: "wis", label: "Saggezza", shortLabel: "Sag", previewId: "previewWis" },
        { key: "cha", label: "Carisma", shortLabel: "Car", previewId: "previewCha" }
      ];

      const skillDefinitions = [
        { key: "acrobatics", label: "Acrobazia", ability: "dex" },
        { key: "animalHandling", label: "Addestrare Animali", ability: "wis" },
        { key: "arcana", label: "Arcano", ability: "int" },
        { key: "athletics", label: "Atletica", ability: "str" },
        { key: "deception", label: "Inganno", ability: "cha" },
        { key: "history", label: "Storia", ability: "int" },
        { key: "insight", label: "Intuizione", ability: "wis" },
        { key: "intimidation", label: "Intimidire", ability: "cha" },
        { key: "investigation", label: "Indagare", ability: "int" },
        { key: "medicine", label: "Medicina", ability: "wis" },
        { key: "nature", label: "Natura", ability: "int" },
        { key: "perception", label: "Percezione", ability: "wis" },
        { key: "performance", label: "Intrattenere", ability: "cha" },
        { key: "persuasion", label: "Persuasione", ability: "cha" },
        { key: "religion", label: "Religione", ability: "int" },
        { key: "sleightOfHand", label: "Rapidita di Mano", ability: "dex" },
        { key: "stealth", label: "Furtivita", ability: "dex" },
        { key: "survival", label: "Sopravvivenza", ability: "wis" }
      ];

      const defaultCharacterState = {
        identity: {
          id: "local-hero",
          name: "Eroe Locale",
          className: "Avventuriero",
          ancestry: "Umano",
          level: 1
        },
        proficiencyBonus: 2,
        abilities: {
          str: { score: 10, savingThrowProficient: false },
          dex: { score: 10, savingThrowProficient: false },
          con: { score: 10, savingThrowProficient: false },
          int: { score: 10, savingThrowProficient: false },
          wis: { score: 10, savingThrowProficient: false },
          cha: { score: 10, savingThrowProficient: false }
        },
        skills: {
          acrobatics: { proficient: false, expertise: false, bonus: 0 },
          animalHandling: { proficient: false, expertise: false, bonus: 0 },
          arcana: { proficient: false, expertise: false, bonus: 0 },
          athletics: { proficient: false, expertise: false, bonus: 0 },
          deception: { proficient: false, expertise: false, bonus: 0 },
          history: { proficient: false, expertise: false, bonus: 0 },
          insight: { proficient: false, expertise: false, bonus: 0 },
          intimidation: { proficient: false, expertise: false, bonus: 0 },
          investigation: { proficient: false, expertise: false, bonus: 0 },
          medicine: { proficient: false, expertise: false, bonus: 0 },
          nature: { proficient: false, expertise: false, bonus: 0 },
          perception: { proficient: false, expertise: false, bonus: 0 },
          performance: { proficient: false, expertise: false, bonus: 0 },
          persuasion: { proficient: false, expertise: false, bonus: 0 },
          religion: { proficient: false, expertise: false, bonus: 0 },
          sleightOfHand: { proficient: false, expertise: false, bonus: 0 },
          stealth: { proficient: false, expertise: false, bonus: 0 },
          survival: { proficient: false, expertise: false, bonus: 0 }
        },
        resources: {
          hp: {
            current: 10,
            max: 10,
            temporary: 0
          },
          armorClass: 10,
          speedMeters: 9,
          hitDice: {
            formula: "1d8",
            total: 1,
            remaining: 1
          }
        }
      };

      const globalState = {
        party: [
          createCharacterState("local-hero", "Eroe Locale", 0)
        ],
        activePlayerIndex: 0,
        nextPlayerNumber: 2
      };

      function createCharacterState(id, name, variantIndex) {
        const character = cloneData(defaultCharacterState);
        const variant = Number.isFinite(Number(variantIndex)) ? Number(variantIndex) : 0;
        const abilitySpread = [
          { str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 },
          { str: 8, dex: 16, con: 12, int: 13, wis: 10, cha: 11 },
          { str: 10, dex: 12, con: 12, int: 15, wis: 13, cha: 10 }
        ][variant % 3];

        character.identity.id = String(id || "player-" + (variant + 1));
        character.identity.name = String(name || "Player " + (variant + 1));
        character.identity.className = ["Guerriero", "Ladro", "Mago"][variant % 3];
        character.resources.hp.max = [16, 12, 10][variant % 3];
        character.resources.hp.current = character.resources.hp.max;
        character.resources.armorClass = [16, 14, 12][variant % 3];

        Object.keys(abilitySpread).forEach(function assignAbilityScore(key) {
          character.abilities[key].score = abilitySpread[key];
        });

        return character;
      }

      if (window.UltimateVTT) {
        window.UltimateVTT.globalState = globalState;
      }
      window.globalState = globalState;

      let state = globalState.party[globalState.activePlayerIndex];
      const subscribers = new Set();

      function getElement(id) {
        return document.getElementById(id);
      }

      function getAll(selector, root) {
        const searchRoot = root || document;
        return Array.prototype.slice.call(searchRoot.querySelectorAll(selector));
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

      function clampBoolean(value) {
        return Boolean(value);
      }

      function calculateAbilityModifier(score) {
        return Math.floor((score - 10) / 2);
      }

      function formatModifier(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          return "+0";
        }
        if (numericValue >= 0) {
          return "+" + numericValue;
        }
        return String(numericValue);
      }

      function findAbilityDefinition(abilityKey) {
        return abilityDefinitions.find(function matchAbility(definition) {
          return definition.key === abilityKey;
        });
      }

      function findSkillDefinition(skillKey) {
        return skillDefinitions.find(function matchSkill(definition) {
          return definition.key === skillKey;
        });
      }

      function calculateSavingThrowModifier(abilityKey) {
        const ability = state.abilities[abilityKey];
        if (!ability) {
          return 0;
        }
        const abilityModifier = calculateAbilityModifier(ability.score);
        const proficiencyModifier = ability.savingThrowProficient ? state.proficiencyBonus : 0;
        return abilityModifier + proficiencyModifier;
      }

      function calculateSkillModifier(skillKey) {
        const skillDefinition = findSkillDefinition(skillKey);
        const skill = state.skills[skillKey];
        if (!skillDefinition || !skill) {
          return 0;
        }
        const ability = state.abilities[skillDefinition.ability];
        const abilityScore = ability ? ability.score : 10;
        const abilityModifier = calculateAbilityModifier(abilityScore);
        const proficiencyMultiplier = skill.expertise ? 2 : skill.proficient ? 1 : 0;
        const proficiencyModifier = state.proficiencyBonus * proficiencyMultiplier;
        return abilityModifier + proficiencyModifier + skill.bonus;
      }

      function calculatePassiveSkill(skillKey) {
        return 10 + calculateSkillModifier(skillKey);
      }

      function parseHitDiceFormula(formula) {
        const normalized = String(formula || "").trim().toLowerCase();
        const match = normalized.match(/^(\d+)d(4|6|8|10|12)$/);
        if (!match) {
          return {
            count: state.resources.hitDice.total,
            sides: 8,
            valid: false
          };
        }
        return {
          count: clampNumber(match[1], 1, 20, 1),
          sides: clampNumber(match[2], 4, 12, 8),
          valid: true
        };
      }

      function notifySubscribers(reason) {
        const snapshot = getState();
        subscribers.forEach(function notifySubscriber(listener) {
          listener(snapshot, reason);
        });
      }

      function subscribe(listener) {
        if (typeof listener !== "function") {
          return function noopUnsubscribe() {};
        }
        subscribers.add(listener);
        listener(getState(), "subscribe");
        return function unsubscribe() {
          subscribers.delete(listener);
        };
      }

      function getState() {
        return cloneData(state);
      }

      function setAbilityScore(abilityKey, score) {
        if (!state.abilities[abilityKey]) {
          return false;
        }
        state.abilities[abilityKey].score = clampNumber(score, 1, 30, 10);
        notifySubscribers("ability:" + abilityKey);
        return true;
      }

      function setSavingThrowProficiency(abilityKey, proficient) {
        if (!state.abilities[abilityKey]) {
          return false;
        }
        state.abilities[abilityKey].savingThrowProficient = clampBoolean(proficient);
        notifySubscribers("savingThrow:" + abilityKey);
        return true;
      }

      function setProficiencyBonus(value) {
        state.proficiencyBonus = clampNumber(value, 0, 12, 2);
        notifySubscribers("proficiencyBonus");
        return true;
      }

      function setSkillProficiency(skillKey, proficient) {
        if (!state.skills[skillKey]) {
          return false;
        }
        state.skills[skillKey].proficient = clampBoolean(proficient);
        if (!state.skills[skillKey].proficient) {
          state.skills[skillKey].expertise = false;
        }
        notifySubscribers("skillProficiency:" + skillKey);
        return true;
      }

      function setSkillExpertise(skillKey, expertise) {
        if (!state.skills[skillKey]) {
          return false;
        }
        state.skills[skillKey].expertise = clampBoolean(expertise);
        if (state.skills[skillKey].expertise) {
          state.skills[skillKey].proficient = true;
        }
        notifySubscribers("skillExpertise:" + skillKey);
        return true;
      }

      function setSkillBonus(skillKey, bonus) {
        if (!state.skills[skillKey]) {
          return false;
        }
        state.skills[skillKey].bonus = clampNumber(bonus, -20, 20, 0);
        notifySubscribers("skillBonus:" + skillKey);
        return true;
      }

      function setCurrentHp(value) {
        const maxHp = Math.max(1, state.resources.hp.max);
        state.resources.hp.current = clampNumber(value, 0, maxHp, maxHp);
        notifySubscribers("hpCurrent");
        return true;
      }

      function setMaxHp(value) {
        const newMaxHp = clampNumber(value, 1, 999, 1);
        state.resources.hp.max = newMaxHp;
        state.resources.hp.current = Math.min(state.resources.hp.current, newMaxHp);
        notifySubscribers("hpMax");
        return true;
      }

      function setTemporaryHp(value) {
        state.resources.hp.temporary = clampNumber(value, 0, 999, 0);
        notifySubscribers("hpTemporary");
        return true;
      }

      function applyDamage(amount) {
        const damageAmount = clampNumber(amount, 0, 999, 0);
        let remainingDamage = damageAmount;
        const absorbedByTemporaryHp = Math.min(state.resources.hp.temporary, remainingDamage);
        state.resources.hp.temporary -= absorbedByTemporaryHp;
        remainingDamage -= absorbedByTemporaryHp;
        state.resources.hp.current = Math.max(0, state.resources.hp.current - remainingDamage);
        notifySubscribers("damage");
        return {
          requestedDamage: damageAmount,
          absorbedByTemporaryHp: absorbedByTemporaryHp,
          appliedToCurrentHp: remainingDamage,
          currentHp: state.resources.hp.current,
          temporaryHp: state.resources.hp.temporary
        };
      }

      function heal(amount) {
        const healAmount = clampNumber(amount, 0, 999, 0);
        state.resources.hp.current = Math.min(state.resources.hp.max, state.resources.hp.current + healAmount);
        notifySubscribers("heal");
        return {
          requestedHealing: healAmount,
          currentHp: state.resources.hp.current,
          maxHp: state.resources.hp.max
        };
      }

      function setArmorClass(value) {
        state.resources.armorClass = clampNumber(value, 1, 99, 10);
        notifySubscribers("armorClass");
        return true;
      }

      function setSpeedMeters(value) {
        state.resources.speedMeters = clampNumber(value, 0, 99, 9);
        notifySubscribers("speedMeters");
        return true;
      }

      function setHitDiceFormula(value) {
        const formula = String(value || "1d8").trim().toLowerCase();
        const parsed = parseHitDiceFormula(formula);
        state.resources.hitDice.formula = parsed.valid ? parsed.count + "d" + parsed.sides : "1d8";
        state.resources.hitDice.total = parsed.valid ? parsed.count : 1;
        state.resources.hitDice.remaining = Math.min(state.resources.hitDice.remaining, state.resources.hitDice.total);
        notifySubscribers("hitDiceFormula");
        return parsed.valid;
      }

      function setHitDiceRemaining(value) {
        state.resources.hitDice.remaining = clampNumber(value, 0, state.resources.hitDice.total, state.resources.hitDice.remaining);
        notifySubscribers("hitDiceRemaining");
        return true;
      }

      function rollIntegerDie(sides) {
        return Math.floor(Math.random() * sides) + 1;
      }

      function spendHitDie() {
        const hitDice = state.resources.hitDice;
        const parsed = parseHitDiceFormula(hitDice.formula);
        if (hitDice.remaining <= 0) {
          return {
            spent: false,
            reason: "Nessun Dado Vita rimasto.",
            roll: 0,
            constitutionModifier: calculateAbilityModifier(state.abilities.con.score),
            healing: 0
          };
        }

        const roll = rollIntegerDie(parsed.sides);
        const constitutionModifier = calculateAbilityModifier(state.abilities.con.score);
        const healing = Math.max(1, roll + constitutionModifier);
        hitDice.remaining -= 1;
        state.resources.hp.current = Math.min(state.resources.hp.max, state.resources.hp.current + healing);
        notifySubscribers("spendHitDie");

        return {
          spent: true,
          reason: "Dado Vita speso.",
          roll: roll,
          constitutionModifier: constitutionModifier,
          healing: healing,
          currentHp: state.resources.hp.current,
          remaining: hitDice.remaining
        };
      }

      function serialize() {
        return JSON.stringify(state);
      }

      function hydrate(serializedState) {
        try {
          const incomingState = typeof serializedState === "string" ? JSON.parse(serializedState) : serializedState;
          if (!incomingState || !incomingState.abilities || !incomingState.skills || !incomingState.resources) {
            return false;
          }
          state = cloneData(defaultCharacterState);
          abilityDefinitions.forEach(function hydrateAbility(definition) {
            if (incomingState.abilities[definition.key]) {
              state.abilities[definition.key].score = clampNumber(incomingState.abilities[definition.key].score, 1, 30, 10);
              state.abilities[definition.key].savingThrowProficient = clampBoolean(incomingState.abilities[definition.key].savingThrowProficient);
            }
          });
          skillDefinitions.forEach(function hydrateSkill(definition) {
            if (incomingState.skills[definition.key]) {
              state.skills[definition.key].proficient = clampBoolean(incomingState.skills[definition.key].proficient);
              state.skills[definition.key].expertise = clampBoolean(incomingState.skills[definition.key].expertise);
              state.skills[definition.key].bonus = clampNumber(incomingState.skills[definition.key].bonus, -20, 20, 0);
            }
          });
          if (incomingState.identity) {
            state.identity.id = String(incomingState.identity.id || defaultCharacterState.identity.id);
            state.identity.name = String(incomingState.identity.name || defaultCharacterState.identity.name);
            state.identity.className = String(incomingState.identity.className || defaultCharacterState.identity.className);
            state.identity.ancestry = String(incomingState.identity.ancestry || defaultCharacterState.identity.ancestry);
            state.identity.level = clampNumber(incomingState.identity.level, 1, 20, 1);
          }
          state.proficiencyBonus = clampNumber(incomingState.proficiencyBonus, 0, 12, 2);
          state.resources.hp.max = clampNumber(incomingState.resources.hp && incomingState.resources.hp.max, 1, 999, 10);
          state.resources.hp.temporary = clampNumber(incomingState.resources.hp && incomingState.resources.hp.temporary, 0, 999, 0);
          state.resources.hp.current = clampNumber(incomingState.resources.hp && incomingState.resources.hp.current, 0, state.resources.hp.max, state.resources.hp.max);
          state.resources.armorClass = clampNumber(incomingState.resources.armorClass, 1, 99, 10);
          state.resources.speedMeters = clampNumber(incomingState.resources.speedMeters, 0, 99, 9);
          state.resources.hitDice.formula = String(incomingState.resources.hitDice && incomingState.resources.hitDice.formula || "1d8");
          setHitDiceFormula(state.resources.hitDice.formula);
          state.resources.hitDice.remaining = clampNumber(incomingState.resources.hitDice && incomingState.resources.hitDice.remaining, 0, state.resources.hitDice.total, state.resources.hitDice.total);
          notifySubscribers("hydrate");
          return true;
        } catch (error) {
          return false;
        }
      }

      function setInputValue(id, value) {
        const input = getElement(id);
        if (!input) {
          return;
        }
        if (document.activeElement === input) {
          return;
        }
        input.value = String(value);
      }

      function setText(id, value) {
        const element = getElement(id);
        if (element) {
          element.textContent = String(value);
        }
      }

      function ensureAbilityEditors() {
        const grid = getElement("abilityEditorGrid");
        if (!grid || grid.children.length > 0) {
          return;
        }

        abilityDefinitions.forEach(function createAbilityCard(definition) {
          const card = document.createElement("div");
          const labelWrap = document.createElement("div");
          const name = document.createElement("div");
          const modifier = document.createElement("div");
          const input = document.createElement("input");

          card.className = "ability-editor-card";
          card.setAttribute("data-ability-card", definition.key);
          labelWrap.className = "ability-editor-label";
          name.className = "ability-editor-name";
          name.textContent = definition.label;
          modifier.className = "ability-editor-modifier";
          modifier.id = "abilityModifier" + definition.key.toUpperCase();
          modifier.textContent = "+0";
          input.className = "ability-editor-input";
          input.id = "abilityInput" + definition.key.toUpperCase();
          input.type = "number";
          input.min = "1";
          input.max = "30";
          input.value = String(state.abilities[definition.key].score);
          input.setAttribute("data-ability-input", definition.key);
          input.addEventListener("input", function handleAbilityInput() {
            setAbilityScore(definition.key, input.value);
          });

          labelWrap.appendChild(name);
          labelWrap.appendChild(modifier);
          card.appendChild(labelWrap);
          card.appendChild(input);
          grid.appendChild(card);
        });
      }

      function ensureSkillRows() {
        const list = getElement("skillListModuleThree");
        if (!list || list.children.length > 0) {
          return;
        }

        skillDefinitions.forEach(function createSkillRow(definition) {
          const row = document.createElement("div");
          const checkbox = document.createElement("input");
          const label = document.createElement("div");
          const ability = document.createElement("div");
          const bonusInput = document.createElement("input");
          const value = document.createElement("div");

          row.className = "skill-row";
          row.setAttribute("data-skill-row", definition.key);

          checkbox.className = "skill-check";
          checkbox.type = "checkbox";
          checkbox.id = "skillProficient" + definition.key;
          checkbox.setAttribute("data-skill-proficiency", definition.key);
          checkbox.addEventListener("change", function handleSkillProficiencyChange() {
            setSkillProficiency(definition.key, checkbox.checked);
          });

          label.className = "skill-label";
          label.textContent = definition.label;

          ability.className = "skill-ability";
          ability.textContent = definition.ability;

          bonusInput.className = "skill-bonus-input";
          bonusInput.type = "number";
          bonusInput.min = "-20";
          bonusInput.max = "20";
          bonusInput.value = "0";
          bonusInput.id = "skillBonus" + definition.key;
          bonusInput.title = "Bonus situazionale";
          bonusInput.addEventListener("input", function handleSkillBonusInput() {
            setSkillBonus(definition.key, bonusInput.value);
          });

          value.className = "skill-value";
          value.id = "skillValue" + definition.key;
          value.textContent = "+0";

          row.appendChild(checkbox);
          row.appendChild(label);
          row.appendChild(ability);
          row.appendChild(value);
          row.appendChild(bonusInput);
          list.appendChild(row);
        });
      }

      function renderAbilityPreview() {
        abilityDefinitions.forEach(function renderAbility(definition) {
          const ability = state.abilities[definition.key];
          const modifier = calculateAbilityModifier(ability.score);
          const previewText = String(ability.score) + " (" + formatModifier(modifier) + ")";
          const modifierId = "abilityModifier" + definition.key.toUpperCase();
          const inputId = "abilityInput" + definition.key.toUpperCase();
          setText(definition.previewId, previewText);
          setText(modifierId, formatModifier(modifier));
          setInputValue(inputId, ability.score);
        });
      }

      function renderSkills() {
        skillDefinitions.forEach(function renderSkill(definition) {
          const skill = state.skills[definition.key];
          const row = document.querySelector("[data-skill-row='" + definition.key + "']");
          const checkbox = getElement("skillProficient" + definition.key);
          const bonusInput = getElement("skillBonus" + definition.key);
          const skillValue = calculateSkillModifier(definition.key);
          setText("skillValue" + definition.key, formatModifier(skillValue));

          if (row) {
            row.classList.toggle("is-proficient", skill.proficient);
          }

          if (checkbox && document.activeElement !== checkbox) {
            checkbox.checked = skill.proficient;
          }

          if (bonusInput && document.activeElement !== bonusInput) {
            bonusInput.value = String(skill.bonus);
          }
        });
      }

      function renderResources() {
        const hp = state.resources.hp;
        const hitDice = state.resources.hitDice;
        const hpMeter = getElement("moduleTwoHpMeter");
        const hpPercent = hp.max > 0 ? Math.round((Math.min(hp.current, hp.max) / hp.max) * 100) : 0;

        setInputValue("moduleTwoHpInput", hp.current);
        setInputValue("moduleThreeMaxHpInput", hp.max);
        setInputValue("moduleThreeTempHpInput", hp.temporary);
        setInputValue("moduleTwoAcInput", state.resources.armorClass);
        setInputValue("moduleTwoSpeedInput", state.resources.speedMeters);
        setInputValue("moduleThreeProficiencyInput", state.proficiencyBonus);
        setInputValue("moduleTwoHitDiceInput", hitDice.formula);
        setInputValue("moduleThreeHitDiceRemainingInput", hitDice.remaining);

        if (hpMeter) {
          hpMeter.style.setProperty("--meter-value", hpPercent + "%");
        }

        setText("stateSummaryHp", hp.current + " / " + hp.max);
        setText("stateSummaryAc", state.resources.armorClass);
        setText("stateSummaryHitDice", hitDice.remaining + " / " + hitDice.total);
        setText("characterIdentityPill", state.identity.name);
      }

      function renderState() {
        ensureAbilityEditors();
        ensureSkillRows();
        renderAbilityPreview();
        renderSkills();
        renderResources();
      }

      function bindResourceInputs() {
        const hpInput = getElement("moduleTwoHpInput");
        const maxHpInput = getElement("moduleThreeMaxHpInput");
        const tempHpInput = getElement("moduleThreeTempHpInput");
        const acInput = getElement("moduleTwoAcInput");
        const speedInput = getElement("moduleTwoSpeedInput");
        const proficiencyInput = getElement("moduleThreeProficiencyInput");
        const hitDiceFormulaInput = getElement("moduleTwoHitDiceInput");
        const hitDiceRemainingInput = getElement("moduleThreeHitDiceRemainingInput");

        if (hpInput) {
          hpInput.addEventListener("input", function handleHpInput() {
            setCurrentHp(hpInput.value);
          });
        }

        if (maxHpInput) {
          maxHpInput.addEventListener("input", function handleMaxHpInput() {
            setMaxHp(maxHpInput.value);
          });
        }

        if (tempHpInput) {
          tempHpInput.addEventListener("input", function handleTempHpInput() {
            setTemporaryHp(tempHpInput.value);
          });
        }

        if (acInput) {
          acInput.addEventListener("input", function handleArmorClassInput() {
            setArmorClass(acInput.value);
          });
        }

        if (speedInput) {
          speedInput.addEventListener("input", function handleSpeedInput() {
            setSpeedMeters(speedInput.value);
          });
        }

        if (proficiencyInput) {
          proficiencyInput.addEventListener("input", function handleProficiencyInput() {
            setProficiencyBonus(proficiencyInput.value);
          });
        }

        if (hitDiceFormulaInput) {
          hitDiceFormulaInput.addEventListener("change", function handleHitDiceFormulaInput() {
            const isValid = setHitDiceFormula(hitDiceFormulaInput.value);
            if (!isValid && window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
              window.UltimateVTT.appendSystemLog("Formula Dadi Vita non valida. Uso 1d8.");
            }
          });
        }

        if (hitDiceRemainingInput) {
          hitDiceRemainingInput.addEventListener("input", function handleHitDiceRemainingInput() {
            setHitDiceRemaining(hitDiceRemainingInput.value);
          });
        }
      }

      function bindResourceButtons() {
        const damageButton = getElement("moduleThreeDamageButton");
        const healButton = getElement("moduleThreeHealButton");
        const spendHitDieButton = getElement("moduleThreeSpendHitDieButton");

        if (damageButton) {
          damageButton.addEventListener("click", function handleDamageButtonClick() {
            const damageResult = applyDamage(5);
            if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
              window.UltimateVTT.appendSystemLog("Danno rapido: " + damageResult.requestedDamage + " danni.");
            }
          });
        }

        if (healButton) {
          healButton.addEventListener("click", function handleHealButtonClick() {
            const healResult = heal(5);
            if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
              window.UltimateVTT.appendSystemLog("Cura rapida: HP " + healResult.currentHp + " / " + healResult.maxHp + ".");
            }
          });
        }

        if (spendHitDieButton) {
          spendHitDieButton.addEventListener("click", function handleSpendHitDieButtonClick() {
            const hitDieResult = spendHitDie();
            if (window.UltimateVTT && window.UltimateVTT.appendSystemLog) {
              if (hitDieResult.spent) {
                window.UltimateVTT.appendSystemLog("Dado Vita: tiro " + hitDieResult.roll + ", cura " + hitDieResult.healing + ".");
              } else {
                window.UltimateVTT.appendSystemLog(hitDieResult.reason);
              }
            }
          });
        }
      }

      function initializeStateManagerUi() {
        ensureAbilityEditors();
        ensureSkillRows();
        bindResourceInputs();
        bindResourceButtons();
        subscribe(function handleStateRender() {
          renderState();
        });
      }

      window.UltimateVTTState = {
        abilityDefinitions: cloneData(abilityDefinitions),
        skillDefinitions: cloneData(skillDefinitions),
        getState: getState,
        subscribe: subscribe,
        setAbilityScore: setAbilityScore,
        setSavingThrowProficiency: setSavingThrowProficiency,
        setProficiencyBonus: setProficiencyBonus,
        setSkillProficiency: setSkillProficiency,
        setSkillExpertise: setSkillExpertise,
        setSkillBonus: setSkillBonus,
        calculateAbilityModifier: calculateAbilityModifier,
        calculateSavingThrowModifier: calculateSavingThrowModifier,
        calculateSkillModifier: calculateSkillModifier,
        calculatePassiveSkill: calculatePassiveSkill,
        formatModifier: formatModifier,
        setCurrentHp: setCurrentHp,
        setMaxHp: setMaxHp,
        setTemporaryHp: setTemporaryHp,
        applyDamage: applyDamage,
        heal: heal,
        setArmorClass: setArmorClass,
        setSpeedMeters: setSpeedMeters,
        setHitDiceFormula: setHitDiceFormula,
        setHitDiceRemaining: setHitDiceRemaining,
        spendHitDie: spendHitDie,
        serialize: serialize,
        hydrate: hydrate,
        renderState: renderState
      };

      initializeStateManagerUi();

      window.UltimateVTT.registerModule(3, {
        stateManager: true,
        abilityScores: abilityDefinitions.length,
        skills: skillDefinitions.length,
        hitPoints: true,
        armorClass: true,
        hitDice: true
      });

      window.UltimateVTT.appendSystemLog("Modulo 3 caricato: State Manager PG con 6 statistiche, 18 abilita, HP, CA e Dadi Vita.");
    })();
    // --- FINE MODULO 3 JS: STATE MANAGER PG, STATISTICHE, 18 ABILITA, HP, CA, DADI VITA ---
  