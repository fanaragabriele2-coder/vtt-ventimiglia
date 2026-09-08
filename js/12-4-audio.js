/*
 * Modulo audio: effetti sonori e ambienza.
 *
 * Estratto da 12-patch-touch-events-per-mobile.js, che conteneva sette moduli
 * indipendenti in un unico file da 3600 righe, sotto un nome che ne descriveva
 * solo uno. L'ordine di caricamento e' quello originale: i file 12-1 … 12-8
 * vanno inclusi in sequenza in index.html.
 */

    // --- INIZIO MODULO 9: WEB AUDIO API PROCEDURALE E FILTRI VISIVI (PATCH 4) ---
    (function initAudioModule() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      let ctx = null;
      let masterGain = null;
      let droneOsc = null;
      let droneGain = null;
      
      const volumeSlider = document.getElementById("audioVolumeSlider");
      const muteCheck = document.getElementById("audioMuteCheckbox");
      const ambienceCheck = document.getElementById("audioAmbienceCheckbox");
      const statusSpan = document.getElementById("audioVoiceStatus");
      
      function initCtx() {
        if (!ctx) {
          ctx = new AudioContext();
          masterGain = ctx.createGain();
          masterGain.connect(ctx.destination);
          updateVolume();
        }
        if (ctx.state === "suspended") ctx.resume();
      }
      
      function updateVolume() {
        if (!masterGain) return;
        if (muteCheck && muteCheck.checked) {
          masterGain.gain.value = 0;
        } else {
          const vol = volumeSlider ? volumeSlider.value / 100 : 0.5;
          masterGain.gain.value = vol;
        }
      }
      
      if (volumeSlider) volumeSlider.addEventListener("input", updateVolume);
      if (muteCheck) muteCheck.addEventListener("change", updateVolume);
      
      // DRONE AMBIENTALE
      function toggleDrone() {
        initCtx();
        if (ambienceCheck && ambienceCheck.checked) {
          if (!droneOsc) {
            droneOsc = ctx.createOscillator();
            droneOsc.type = "sine";
            droneOsc.frequency.value = 45; // Sub-bass
            
            const lfo = ctx.createOscillator();
            lfo.type = "sine";
            lfo.frequency.value = 0.2;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 5;
            lfo.connect(lfoGain);
            lfoGain.connect(droneOsc.frequency);
            lfo.start();
            
            droneGain = ctx.createGain();
            droneGain.gain.value = 0.3;
            droneOsc.connect(droneGain);
            droneGain.connect(masterGain);
            droneOsc.start();
          }
          if (statusSpan) statusSpan.textContent = "Ambience ON";
        } else {
          if (droneOsc) {
            droneOsc.stop();
            droneOsc.disconnect();
            droneGain.disconnect();
            droneOsc = null;
            droneGain = null;
          }
          if (statusSpan) statusSpan.textContent = "Silent";
        }
      }
      
      if (ambienceCheck) ambienceCheck.addEventListener("change", toggleDrone);
      
      // SOUND CUES PROCEDURALI
      function playNoise(duration, vol) {
        initCtx();
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1000;
        
        const env = ctx.createGain();
        env.gain.setValueAtTime(vol, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        
        noise.connect(filter);
        filter.connect(env);
        env.connect(masterGain);
        noise.start();
      }
      
      function playSineSweep(startFreq, endFreq, duration, vol) {
        initCtx();
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);
        
        const env = ctx.createGain();
        env.gain.setValueAtTime(vol, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        
        osc.connect(env);
        env.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      }
      
      function playHit() {
        initCtx();
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
        
        const env = ctx.createGain();
        env.gain.setValueAtTime(1, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        
        osc.connect(env);
        env.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
      
      function playDoom() {
        initCtx();
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(200, ctx.currentTime);
        filter.frequency.linearRampToValueAtTime(50, ctx.currentTime + 3);
        
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.2);
        env.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);
        
        osc.connect(filter);
        filter.connect(env);
        env.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + 3);
      }
      
      document.querySelectorAll(".audio-control-button[data-audio-cue]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const cue = btn.getAttribute("data-audio-cue");
          if (cue === "dice") playNoise(0.4, 0.5);
          else if (cue === "hit") playHit();
          else if (cue === "spell") playSineSweep(800, 2000, 0.8, 0.4);
          else if (cue === "doom") playDoom();
        });
      });
      
      // MAP TERRAIN FILTERS (Visuali)
      const terrainSelect = document.getElementById("mapTerrainSelect");
      const stage = document.querySelector(".stage");
      if (terrainSelect && stage) {
        terrainSelect.addEventListener("change", function() {
          stage.classList.remove("filter-dungeon", "filter-forest", "filter-cavern");
          if (terrainSelect.value) {
            stage.classList.add("filter-" + terrainSelect.value);
            if (window.UltimateVTTSystemLog && window.UltimateVTTSystemLog.append) {
              window.UltimateVTTSystemLog.append("Terreno modificato: " + terrainSelect.value);
            }
          }
        });
        // Init default
        stage.classList.add("filter-" + terrainSelect.value);
      }

      const logSys = document.getElementById("diagnosticSummaryPill");
      if(logSys) logSys.textContent = "Audio e Filtri pronti.";
    })();
    // --- FINE MODULO 9: WEB AUDIO API PROCEDURALE E FILTRI VISIVI (PATCH 4) ---
