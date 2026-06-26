    // --- INIZIO MODULO 9 JS: AUDIO PROCEDURALE WEB AUDIO API E VOCE MASTER WEB SPEECH API ---
    (function initializeUltimateVttModuleNine() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 9 richiede il Modulo 1.");
      }

      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext || null;
      const speechSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

      const audioState = {
        context: null,
        masterGain: null,
        ambienceGain: null,
        ambienceOscillators: [],
        muted: false,
        volume: 0.55,
        ambienceActive: false,
        initialized: false,
        lastCue: "standby",
        voiceStatus: speechSupported ? "ready" : "unavailable",
        selectedVoiceName: "",
        history: [],
        maxHistory: 8,
        patchedDice: false,
        patchedCombat: false
      };

      function getElement(id) {
        return document.getElementById(id);
      }

      function clearNode(node) {
        while (node && node.firstChild) {
          node.removeChild(node.firstChild);
        }
      }

      function cloneData(value) {
        return JSON.parse(JSON.stringify(value, function stripAudioObjects(key, value) {
          if (key === "context" || key === "masterGain" || key === "ambienceGain" || key === "ambienceOscillators") {
            return undefined;
          }
          return value;
        }));
      }

      function clampNumber(value, minValue, maxValue, fallbackValue) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          return fallbackValue;
        }
        return Math.max(minValue, Math.min(maxValue, numericValue));
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

      function pushHistory(kind, text) {
        audioState.history.unshift({
          kind: kind,
          text: text,
          time: new Date().toLocaleTimeString("it-IT")
        });

        if (audioState.history.length > audioState.maxHistory) {
          audioState.history.length = audioState.maxHistory;
        }

        renderAudioUi();
      }

      function ensureAudioContext() {
        if (!AudioContextConstructor) {
          audioState.lastCue = "audio unavailable";
          pushHistory("sys", "Web Audio API non disponibile.");
          return null;
        }

        if (!audioState.context) {
          audioState.context = new AudioContextConstructor();
          audioState.masterGain = audioState.context.createGain();
          audioState.masterGain.gain.value = audioState.muted ? 0 : audioState.volume;
          audioState.masterGain.connect(audioState.context.destination);
          audioState.initialized = true;
        }

        if (audioState.context.state === "suspended") {
          audioState.context.resume();
        }

        return audioState.context;
      }

      function setVolume(value) {
        audioState.volume = clampNumber(value, 0, 1, 0.55);

        if (audioState.masterGain) {
          audioState.masterGain.gain.setTargetAtTime(audioState.muted ? 0 : audioState.volume, audioState.context.currentTime, 0.018);
        }

        renderAudioUi();
      }

      function setMuted(muted) {
        audioState.muted = Boolean(muted);

        if (audioState.masterGain && audioState.context) {
          audioState.masterGain.gain.setTargetAtTime(audioState.muted ? 0 : audioState.volume, audioState.context.currentTime, 0.018);
        }

        renderAudioUi();
      }

      function createEnvelopeGain(startTime, peak, attack, decay, sustain, release, duration) {
        const context = ensureAudioContext();
        const gain = context.createGain();
        const endTime = startTime + duration;

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), startTime + attack);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), startTime + attack + decay);
        gain.gain.setTargetAtTime(0.0001, Math.max(startTime + attack + decay, endTime - release), Math.max(0.001, release / 4));
        gain.connect(audioState.masterGain);
        return gain;
      }

      function playTone(frequency, duration, options) {
        const context = ensureAudioContext();
        if (!context || audioState.muted) {
          return false;
        }

        const toneOptions = options || {};
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = createEnvelopeGain(now, toneOptions.peak || 0.22, toneOptions.attack || 0.012, toneOptions.decay || 0.08, toneOptions.sustain || 0.04, toneOptions.release || 0.12, duration);

        oscillator.type = toneOptions.type || "sine";
        oscillator.frequency.setValueAtTime(frequency, now);
        if (toneOptions.slideTo) {
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toneOptions.slideTo), now + duration);
        }

        filter.type = toneOptions.filterType || "lowpass";
        filter.frequency.value = toneOptions.filterFrequency || 2400;
        filter.Q.value = toneOptions.q || 0.5;

        oscillator.connect(filter);
        filter.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.18);
        return true;
      }

      function createNoiseBuffer(duration) {
        const context = ensureAudioContext();
        const sampleRate = context.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * duration));
        const buffer = context.createBuffer(1, length, sampleRate);
        const channel = buffer.getChannelData(0);

        for (let index = 0; index < length; index += 1) {
          channel[index] = Math.random() * 2 - 1;
        }

        return buffer;
      }

      function playNoise(duration, options) {
        const context = ensureAudioContext();
        if (!context || audioState.muted) {
          return false;
        }

        const noiseOptions = options || {};
        const now = context.currentTime;
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = createEnvelopeGain(now, noiseOptions.peak || 0.18, noiseOptions.attack || 0.006, noiseOptions.decay || 0.06, noiseOptions.sustain || 0.03, noiseOptions.release || 0.12, duration);

        source.buffer = createNoiseBuffer(duration + 0.05);
        filter.type = noiseOptions.filterType || "bandpass";
        filter.frequency.value = noiseOptions.filterFrequency || 900;
        filter.Q.value = noiseOptions.q || 1.8;
        source.connect(filter);
        filter.connect(gain);
        source.start(now);
        source.stop(now + duration + 0.08);
        return true;
      }

      function playDiceClatter() {
        const context = ensureAudioContext();
        if (!context || audioState.muted) {
          return false;
        }

        for (let index = 0; index < 5; index += 1) {
          const delay = index * 0.045;
          window.setTimeout(function delayedDiceClick() {
            playNoise(0.08, {
              peak: 0.11 - index * 0.012,
              filterType: "bandpass",
              filterFrequency: 420 + Math.random() * 1800,
              q: 4.5
            });
            playTone(160 + Math.random() * 260, 0.08, {
              type: "triangle",
              peak: 0.05,
              slideTo: 90 + Math.random() * 120,
              filterFrequency: 1600
            });
          }, delay * 1000);
        }

        audioState.lastCue = "dice";
        pushHistory("cue", "Dice clatter");
        return true;
      }

      function playImpact() {
        playNoise(0.22, {
          peak: 0.22,
          attack: 0.004,
          decay: 0.08,
          sustain: 0.025,
          filterType: "lowpass",
          filterFrequency: 520,
          q: 0.9
        });
        playTone(84, 0.28, {
          type: "sine",
          peak: 0.16,
          slideTo: 45,
          filterFrequency: 700
        });
        audioState.lastCue = "hit";
        pushHistory("cue", "Impact");
      }

      function playSpellPulse() {
        playTone(220, 0.32, {
          type: "sine",
          peak: 0.13,
          slideTo: 660,
          attack: 0.018,
          filterFrequency: 2800
        });
        window.setTimeout(function secondSpellTone() {
          playTone(330, 0.42, {
            type: "triangle",
            peak: 0.1,
            slideTo: 990,
            filterFrequency: 3600
          });
        }, 80);
        playNoise(0.34, {
          peak: 0.06,
          attack: 0.02,
          filterType: "highpass",
          filterFrequency: 1800,
          q: 1.2
        });
        audioState.lastCue = "spell";
        pushHistory("cue", "Spell pulse");
      }

      function playDoom() {
        playTone(96, 1.1, {
          type: "sawtooth",
          peak: 0.11,
          slideTo: 48,
          attack: 0.08,
          decay: 0.2,
          sustain: 0.07,
          release: 0.48,
          filterFrequency: 900
        });
        window.setTimeout(function doomSecondTone() {
          playTone(72, 0.9, {
            type: "triangle",
            peak: 0.09,
            slideTo: 36,
            attack: 0.05,
            filterFrequency: 600
          });
        }, 140);
        audioState.lastCue = "doom";
        pushHistory("cue", "Doom swell");
      }

      function playUiClick() {
        playTone(880, 0.055, {
          type: "square",
          peak: 0.035,
          slideTo: 620,
          filterFrequency: 2200
        });
        audioState.lastCue = "ui";
      }

      function playCue(name) {
        ensureAudioContext();

        if (name === "dice") {
          return playDiceClatter();
        }

        if (name === "hit") {
          playImpact();
          return true;
        }

        if (name === "spell") {
          playSpellPulse();
          return true;
        }

        if (name === "doom") {
          playDoom();
          return true;
        }

        playUiClick();
        return true;
      }

      function startAmbience() {
        const context = ensureAudioContext();
        if (!context || audioState.ambienceActive) {
          return false;
        }

        const now = context.currentTime;
        audioState.ambienceGain = context.createGain();
        audioState.ambienceGain.gain.setValueAtTime(0.0001, now);
        audioState.ambienceGain.gain.exponentialRampToValueAtTime(0.065, now + 0.8);
        audioState.ambienceGain.connect(audioState.masterGain);

        [55, 82, 123].forEach(function createDrone(frequency, index) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = index === 1 ? "triangle" : "sine";
          oscillator.frequency.value = frequency;
          gain.gain.value = index === 0 ? 0.8 : 0.34;
          oscillator.connect(gain);
          gain.connect(audioState.ambienceGain);
          oscillator.start(now);
          audioState.ambienceOscillators.push(oscillator);
        });

        audioState.ambienceActive = true;
        audioState.lastCue = "ambience";
        pushHistory("sys", "Ambience on");
        renderAudioUi();
        return true;
      }

      function stopAmbience() {
        if (!audioState.ambienceActive) {
          return false;
        }

        const context = audioState.context;
        const now = context ? context.currentTime : 0;

        if (audioState.ambienceGain && context) {
          audioState.ambienceGain.gain.setTargetAtTime(0.0001, now, 0.24);
        }

        audioState.ambienceOscillators.forEach(function stopOscillator(oscillator) {
          try {
            oscillator.stop(now + 0.6);
          } catch (error) {
          }
        });

        audioState.ambienceOscillators = [];
        audioState.ambienceActive = false;
        audioState.lastCue = "ambience off";
        pushHistory("sys", "Ambience off");
        renderAudioUi();
        return true;
      }

      function setAmbience(active) {
        if (active) {
          return startAmbience();
        }
        return stopAmbience();
      }

      function pickVoice() {
        if (!speechSupported) {
          return null;
        }

        const voices = window.speechSynthesis.getVoices();
        const italianVoice = voices.find(function findItalianVoice(voice) {
          return String(voice.lang || "").toLowerCase().indexOf("it") === 0;
        });

        return italianVoice || voices[0] || null;
      }

      function speakMaster(text) {
        const spokenText = String(text || "").trim();
        if (!spokenText) {
          audioState.voiceStatus = "empty";
          renderAudioUi();
          return false;
        }

        if (!speechSupported) {
          audioState.voiceStatus = "unavailable";
          pushHistory("voice", "Web Speech API non disponibile.");
          return false;
        }

        window.speechSynthesis.cancel();
        const utterance = new window.SpeechSynthesisUtterance(spokenText);
        const voice = pickVoice();

        if (voice) {
          utterance.voice = voice;
          audioState.selectedVoiceName = voice.name;
        }

        utterance.lang = voice && voice.lang ? voice.lang : "it-IT";
        utterance.rate = 0.92;
        utterance.pitch = 0.82;
        utterance.volume = audioState.muted ? 0 : audioState.volume;

        utterance.onstart = function handleSpeechStart() {
          audioState.voiceStatus = "speaking";
          pushHistory("voice", spokenText.slice(0, 72));
          renderAudioUi();
        };

        utterance.onend = function handleSpeechEnd() {
          audioState.voiceStatus = "ready";
          renderAudioUi();
        };

        utterance.onerror = function handleSpeechError() {
          audioState.voiceStatus = "error";
          renderAudioUi();
        };

        playDoom();
        window.speechSynthesis.speak(utterance);
        return true;
      }

      function stopVoice() {
        if (speechSupported) {
          window.speechSynthesis.cancel();
        }
        audioState.voiceStatus = speechSupported ? "ready" : "unavailable";
        renderAudioUi();
      }

      function renderAudioHistory() {
        const list = getElement("audioEventListSummary");
        if (!list) {
          return;
        }

        clearNode(list);

        audioState.history.slice(0, 5).forEach(function appendAudioEvent(event) {
          const row = document.createElement("div");
          const kind = document.createElement("span");
          const text = document.createElement("span");

          row.className = "audio-event-row";
          kind.className = "audio-event-kind";
          text.className = "audio-event-text";
          kind.textContent = event.kind;
          text.textContent = event.time + " | " + event.text;
          row.appendChild(kind);
          row.appendChild(text);
          list.appendChild(row);
        });
      }

      function renderAudioUi() {
        const contextStatus = audioState.context ? audioState.context.state : "standby";
        const audioLabel = audioState.muted ? "muted" : contextStatus;
        const volumePercent = Math.round(audioState.volume * 100) + "%";
        const muteCheckbox = getElement("audioMuteCheckbox");
        const ambienceCheckbox = getElement("audioAmbienceCheckbox");
        const volumeSlider = getElement("audioVolumeSlider");

        if (muteCheckbox && muteCheckbox.checked !== audioState.muted) {
          muteCheckbox.checked = audioState.muted;
        }

        if (ambienceCheckbox && ambienceCheckbox.checked !== audioState.ambienceActive) {
          ambienceCheckbox.checked = audioState.ambienceActive;
        }

        if (volumeSlider && document.activeElement !== volumeSlider) {
          volumeSlider.value = String(Math.round(audioState.volume * 100));
        }

        setText("audioVoiceStatus", audioLabel);
        setText("audioStatusSummary", audioLabel);
        setText("voiceStatusSummary", audioState.voiceStatus);
        setText("audioVolumeSummary", volumePercent);
        setText("audioModePill", "Audio: " + audioLabel);
        renderAudioHistory();
      }

      function patchExistingModules() {
        if (window.UltimateVTTDice3D && !audioState.patchedDice) {
          const originalLaunchDie = window.UltimateVTTDice3D.launchDie;
          const originalLaunchDiceSet = window.UltimateVTTDice3D.launchDiceSet;

          window.UltimateVTTDice3D.launchDie = function patchedLaunchDie(sides, options) {
            const result = originalLaunchDie.call(window.UltimateVTTDice3D, sides, options);
            playDiceClatter();
            return result;
          };

          window.UltimateVTTDice3D.launchDiceSet = function patchedLaunchDiceSet(sidesList) {
            const result = originalLaunchDiceSet.call(window.UltimateVTTDice3D, sidesList);
            playDiceClatter();
            return result;
          };

          audioState.patchedDice = true;
        }

        if (window.UltimateVTTCombat && !audioState.patchedCombat) {
          const originalResolveAttack = window.UltimateVTTCombat.resolveAttack;
          window.UltimateVTTCombat.resolveAttack = function patchedResolveAttack(forceCritical) {
            const result = originalResolveAttack.call(window.UltimateVTTCombat, forceCritical);
            if (result && result.hit) {
              if (result.critical) {
                playDoom();
              } else {
                playImpact();
              }
            } else {
              playNoise(0.12, {
                peak: 0.08,
                filterType: "highpass",
                filterFrequency: 1200,
                q: 1.4
              });
            }
            return result;
          };
          audioState.patchedCombat = true;
        }
      }

      function playCombatSoundFromLatestState() {
        if (!window.UltimateVTTCombat || !window.UltimateVTTCombat.getState) {
          return;
        }

        const combatState = window.UltimateVTTCombat.getState();
        const detail = combatState && combatState.lastRoll ? String(combatState.lastRoll.detail || "") : "";

        if (detail.indexOf("CRITICO") !== -1) {
          playDoom();
        } else if (detail.indexOf("colpito") !== -1) {
          playImpact();
        } else if (detail.indexOf("mancato") !== -1) {
          playNoise(0.12, {
            peak: 0.08,
            filterType: "highpass",
            filterFrequency: 1200,
            q: 1.4
          });
        }
      }

      function bindAudioControls() {
        const volumeSlider = getElement("audioVolumeSlider");
        const muteCheckbox = getElement("audioMuteCheckbox");
        const ambienceCheckbox = getElement("audioAmbienceCheckbox");
        const speakButton = getElement("masterSpeakButton");
        const stopVoiceButton = getElement("masterStopVoiceButton");

        Array.prototype.slice.call(document.querySelectorAll("[data-audio-cue]")).forEach(function bindCueButton(button) {
          button.addEventListener("click", function handleCueClick() {
            playCue(button.getAttribute("data-audio-cue"));
          });
        });

        Array.prototype.slice.call(document.querySelectorAll(".dice-button[data-die], [data-physics-die]")).forEach(function bindDiceAudio(button) {
          button.addEventListener("click", function handleDiceAudioClick() {
            playDiceClatter();
          });
        });

        Array.prototype.slice.call(document.querySelectorAll("#moduleFiveAttackButton, #moduleFiveCriticalDamageButton")).forEach(function bindCombatAudio(button) {
          button.addEventListener("click", function handleCombatAudioClick() {
            window.setTimeout(playCombatSoundFromLatestState, 40);
          });
        });

        document.addEventListener("click", function handleDelegatedAudioClick(event) {
          const target = event.target;
          if (!target || !target.closest) {
            return;
          }

          if (target.closest(".spell-action-button") && String(target.textContent || "").trim() === "Lancia") {
            window.setTimeout(playSpellPulse, 40);
          } else if (target.closest(".inventory-action-button") || target.closest(".combat-row-button") || target.closest(".resource-action-button")) {
            playUiClick();
          }
        });

        if (volumeSlider) {
          volumeSlider.addEventListener("input", function handleVolumeInput() {
            setVolume(clampNumber(volumeSlider.value, 0, 100, 55) / 100);
          });
        }

        if (muteCheckbox) {
          muteCheckbox.addEventListener("change", function handleMuteChange() {
            setMuted(muteCheckbox.checked);
          });
        }

        if (ambienceCheckbox) {
          ambienceCheckbox.addEventListener("change", function handleAmbienceChange() {
            setAmbience(ambienceCheckbox.checked);
          });
        }

        if (speakButton) {
          speakButton.addEventListener("click", function handleSpeakClick() {
            const input = getElement("masterVoiceText");
            speakMaster(input ? input.value : "");
          });
        }

        if (stopVoiceButton) {
          stopVoiceButton.addEventListener("click", stopVoice);
        }
      }

      function initializeAudioVoice() {
        bindAudioControls();
        patchExistingModules();
        renderAudioUi();

        if (speechSupported) {
          window.speechSynthesis.onvoiceschanged = function handleVoicesChanged() {
            const voice = pickVoice();
            audioState.selectedVoiceName = voice ? voice.name : "";
            renderAudioUi();
          };
        }
      }

      window.UltimateVTTAudioVoice = {
        getState: function getAudioVoiceState() {
          return cloneData(audioState);
        },
        ensureAudioContext: ensureAudioContext,
        setVolume: setVolume,
        setMuted: setMuted,
        playCue: playCue,
        playDiceClatter: playDiceClatter,
        playImpact: playImpact,
        playSpellPulse: playSpellPulse,
        playDoom: playDoom,
        startAmbience: startAmbience,
        stopAmbience: stopAmbience,
        setAmbience: setAmbience,
        speakMaster: speakMaster,
        stopVoice: stopVoice,
        renderAudioUi: renderAudioUi
      };

      initializeAudioVoice();

      window.UltimateVTT.registerModule(9, {
        webAudioApi: Boolean(AudioContextConstructor),
        proceduralSounds: true,
        ambience: true,
        webSpeechApi: speechSupported,
        masterVoice: true
      });

      appendLog("Modulo 9 caricato: audio procedurale Web Audio API e voce Master Web Speech API.");
    })();
    // --- FINE MODULO 9 JS: AUDIO PROCEDURALE WEB AUDIO API E VOCE MASTER WEB SPEECH API ---
  