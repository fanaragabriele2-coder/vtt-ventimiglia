    // --- ADATTATORE PARTY: legge la scheda core (identity/resources/abilities) e
    //     la espone con i campi "piatti" attesi dai moduli hub e campagna ---
    (function vttPartyAdapter(){
      "use strict";
      var PALETTE = ["#5bb7c8","#c89b3c","#5d9f45","#7b59c4"];
      function num(v, d){ var n = Number(v); return (v == null || isNaN(n)) ? d : n; }
      window.vttReadPg = function(m, idx){
        m = m || {};
        var name = (m.identity && m.identity.name) || m.name || "Eroe";
        var hp, maxHp, ac;
        if (m.resources && m.resources.hp){ hp = m.resources.hp.current; maxHp = m.resources.hp.max; }
        if (hp == null) hp = num(m.hp, 28);
        if (maxHp == null) maxHp = num(m.maxHp, 28);
        if (m.resources && m.resources.armorClass != null) ac = m.resources.armorClass;
        else ac = num(m.armorClass != null ? m.armorClass : m.ac, null);
        var abil = {};
        ["str","dex","con","int","wis","cha"].forEach(function(k){
          if (m.abilities && m.abilities[k] && m.abilities[k].score != null) abil[k] = m.abilities[k].score;
          else abil[k] = num(m[k] != null ? m[k] : m[k + "Score"], 10);
        });
        return {
          name: name, hp: hp, maxHp: maxHp, ac: ac, abil: abil,
          color: m.color || PALETTE[(idx || 0) % PALETTE.length], member: m
        };
      };
      window.vttWritePgHp = function(m, newHp){
        if (!m) return;
        if (m.resources && m.resources.hp) m.resources.hp.current = newHp; else m.hp = newHp;
        try {
          if (window.UltimateVTTState && window.UltimateVTTState.getState && window.UltimateVTTState.setCurrentHp){
            var act = window.UltimateVTTState.getState();
            if (act && act.identity && m.identity && act.identity.id === m.identity.id){
              window.UltimateVTTState.setCurrentHp(newHp);
            }
          }
        } catch (e) {}
      };

      // Riassunto completo delle schede di tutti i PG del party, da dare in pasto al Master.
      var ABIL = [["str","FOR"],["dex","DES"],["con","COS"],["int","INT"],["wis","SAG"],["cha","CAR"]];
      function smod(v){ var m = Math.floor((v - 10) / 2); return (m >= 0 ? "+" : "") + m; }
      window.vttPartyBriefing = function(){
        var party = window.partyData || [];
        if (!party.length) return "";
        var skillLabels = {};
        try { ((window.UltimateVTTState && window.UltimateVTTState.skillDefinitions) || []).forEach(function(s){ skillLabels[s.key] = s.label; }); } catch (e) {}
        var itemCat = (window.UltimateVTTInventory && window.UltimateVTTInventory.itemCatalog) || [];
        var spellCat = (window.UltimateVTTInventory && window.UltimateVTTInventory.spellCatalog) || [];
        function nameOf(list, id){ for (var i = 0; i < list.length; i++){ if (list[i].id === id) return list[i].name; } return id; }
        var reg = (window.VTTCharacters && window.VTTCharacters.byId) || {};
        return party.map(function(m, idx){
          var id = m.identity && m.identity.id;
          var b = reg[id] && reg[id].build;
          var prog = reg[id] && reg[id].progression;
          var v = window.vttReadPg(m, idx);
          var lvl = (m.identity && m.identity.level) || (prog && prog.level) || 1;
          var abilStr = ABIL.map(function(a){ return a[1] + " " + v.abil[a[0]] + "(" + smod(v.abil[a[0]]) + ")"; }).join(" ");
          var saves = ABIL.filter(function(a){ return m.abilities && m.abilities[a[0]] && m.abilities[a[0]].savingThrowProficient; }).map(function(a){ return a[1]; }).join(", ") || "nessuno";
          var skills = [];
          if (m.skills) Object.keys(m.skills).forEach(function(k){ if (m.skills[k] && m.skills[k].proficient) skills.push(skillLabels[k] || k); });
          var equip = (b && b.equip) ? b.equip.map(function(it){ return nameOf(itemCat, it.c) + (it.q > 1 ? (" x" + it.q) : ""); }).join(", ") : "equipaggiamento base";
          var spells = (b && b.spellcaster && b.spells && b.spells.length) ? b.spells.map(function(s){ return nameOf(spellCat, s); }).join(", ") : "";
          return "• " + v.name + " — " + (m.identity.ancestry || "?") + " " + (m.identity.className || "?") + " Liv " + lvl +
            " | " + abilStr +
            " | HP " + v.hp + "/" + v.maxHp + " CA " + v.ac + " Vel " + ((m.resources && m.resources.speedMeters) || 9) + "m Comp +" + (m.proficiencyBonus || 2) +
            " | TS: " + saves +
            (skills.length ? " | Competenze: " + skills.join(", ") : "") +
            " | Equip: " + equip +
            (spells ? " | Incantesimi: " + spells : "");
        }).join("\n");
      };
    })();
  