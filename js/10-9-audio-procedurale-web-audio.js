    // --- INIZIO MODULO 9 JS: AUDIO PROCEDURALE WEB AUDIO API E VOCE MASTER WEB SPEECH API ---
    (function initializeUltimateVttModuleNine() {
      "use strict";

      if (!window.UltimateVTT) {
        throw new Error("UltimateVTT Module 9 richiede il Modulo 1.");
      }

      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext || null;
      const speechSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

      // Livello dell'ambience "a riposo": costante condivisa tra startAmbience (che lo imposta) e
      // il ducking sotto la voce del Master (che lo abbassa temporaneamente e lo ripristina) —
      // prima era un magic number ripetuto, con lo stesso valore scritto in due punti diversi.
      const AMBIENCE_LEVEL = 0.065;
      // Quanta coda di frasi accumulare se il Master (o lo streaming del Task 1, che puo' parlare
      // frase per frase mano a mano che arriva) manda testo piu' in fretta di quanto la voce lo
      // legga: oltre questo tetto si scartano le piu' vecchie non ancora lette, cosi' la voce
      // resta "al presente" invece di recitare un discorso ormai superato.
      const CODA_VOCE_MAX = 6;

      const audioState = {
        context: null,
        masterGain: null,
        ambienceGain: null,
        ambienceOscillators: [],
        reverbBus: null,
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

      // Coda della voce del Master: prima ogni nuova battuta chiamava speechSynthesis.cancel() e
      // troncava di netto quella in corso — due comandi "speak" ravvicinati (frequenti con lo
      // streaming del Task 1, che puo' invocarla frase per frase) si scavalcavano a vicenda, con
      // audio spezzato. Ora le battute si ACCODANO e vengono lette una dopo l'altra per intero.
      var codaVoce = [];
      var vociInCorso = false;

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
          if (key === "context" || key === "masterGain" || key === "ambienceGain" || key === "ambienceOscillators" || key === "reverbBus") {
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

      // Bus di riverbero LEGGERO ("immersivo", non una sala da concerto): un ConvolverNode vero
      // richiederebbe generare/tenere in memoria un intero buffer d'impulso — piu' pesante per un
      // client che deve restare leggero (architettura Split-Rig: la GPU/CPU forte sta sul PC
      // remoto con Ollama, non qui). Si usa invece un singolo comb-filter smorzato: un DelayNode
      // in retroazione attraverso un BiquadFilterNode passa-basso. A ogni giro nel loop il segnale
      // perde le frequenze alte — esattamente come un'eco che rimbalza tra pareti di pietra perde
      // gli acuti a ogni riflessione — dando un "respiro" ambientale con pochissimo costo. E' il
      // riverbero "tramite BiquadFilterNode" richiesto: il filtro non e' decorativo, e' lui a
      // scolpire il decadimento del riverbero ripetizione dopo ripetizione.
      function assicuraRiverbero() {
        if (audioState.reverbBus) { return audioState.reverbBus; }
        const context = audioState.context;
        if (!context) { return null; }

        const ingresso = context.createGain();
        const delay = context.createDelay(1.0);
        delay.delayTime.value = 0.045;
        const smorzamento = context.createBiquadFilter();
        smorzamento.type = "lowpass";
        smorzamento.frequency.value = 2200; // le pareti "assorbono" gli acuti a ogni rimbalzo
        const feedback = context.createGain();
        feedback.gain.value = 0.32; // decadimento contenuto: riverbero leggero, non infinito
        const wet = context.createGain();
        wet.gain.value = 0.2; // solo ~20% del segnale attraversa il riverbero: resta "leggero"

        ingresso.connect(delay);
        delay.connect(smorzamento);
        smorzamento.connect(feedback);
        feedback.connect(delay); // retroazione: qui nasce la coda del riverbero
        smorzamento.connect(wet);
        wet.connect(audioState.masterGain);

        audioState.reverbBus = { ingresso: ingresso, wet: wet, delay: delay, smorzamento: smorzamento, feedback: feedback };
        return audioState.reverbBus;
      }

      function createEnvelopeGain(startTime, peak, attack, decay, sustain, release, duration, conRiverbero) {
        const context = ensureAudioContext();
        const gain = context.createGain();
        const endTime = startTime + duration;

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), startTime + attack);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), startTime + attack + decay);
        gain.gain.setTargetAtTime(0.0001, Math.max(startTime + attack + decay, endTime - release), Math.max(0.001, release / 4));
        gain.connect(audioState.masterGain);
        if (conRiverbero) {
          const bus = assicuraRiverbero();
          if (bus) { gain.connect(bus.ingresso); }
        }
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
        const gain = createEnvelopeGain(now, toneOptions.peak || 0.22, toneOptions.attack || 0.012, toneOptions.decay || 0.08, toneOptions.sustain || 0.04, toneOptions.release || 0.12, duration, toneOptions.riverbero);

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
        const gain = createEnvelopeGain(now, noiseOptions.peak || 0.18, noiseOptions.attack || 0.006, noiseOptions.decay || 0.06, noiseOptions.sustain || 0.03, noiseOptions.release || 0.12, duration, noiseOptions.riverbero);

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

      // riverbero:true qui sotto (impatto/incantesimo/doom): sono i suoni "atmosferici", quelli a
      // cui un po' di coda ambientale aggiunge profondita' senza sporcarne la leggibilita'. I
      // click ravvicinati (dadi, click UI, playUiClick) restano SENZA riverbero apposta: sono
      // percussivi e ripetuti in rapida sequenza — impastarli col riverbero li renderebbe confusi
      // invece che piu' immersivi.
      function playImpact() {
        playNoise(0.22, {
          peak: 0.22,
          attack: 0.004,
          decay: 0.08,
          sustain: 0.025,
          filterType: "lowpass",
          filterFrequency: 520,
          q: 0.9,
          riverbero: true
        });
        playTone(84, 0.28, {
          type: "sine",
          peak: 0.16,
          slideTo: 45,
          filterFrequency: 700,
          riverbero: true
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
          filterFrequency: 2800,
          riverbero: true
        });
        window.setTimeout(function secondSpellTone() {
          playTone(330, 0.42, {
            type: "triangle",
            peak: 0.1,
            slideTo: 990,
            filterFrequency: 3600,
            riverbero: true
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
          filterFrequency: 900,
          riverbero: true
        });
        window.setTimeout(function doomSecondTone() {
          playTone(72, 0.9, {
            type: "triangle",
            peak: 0.09,
            slideTo: 36,
            attack: 0.05,
            filterFrequency: 600,
            riverbero: true
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
        audioState.ambienceGain.gain.exponentialRampToValueAtTime(AMBIENCE_LEVEL, now + 0.8);
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

      // Abbassa (o ripristina) l'ambience mentre il Master parla: un "ducking" leggero (il
      // volume scende al 28% e risale con una rampa morbida, setTargetAtTime — stessa tecnica
      // gia' usata altrove in questo modulo per i fade) cosi' la voce resta comprensibile sopra
      // il drone di sottofondo invece di doverci competere. Effetto reale, non decorativo:
      // ascoltabile subito col drone acceso durante una battuta del Master.
      function duckAmbience(giu) {
        if (!audioState.ambienceActive || !audioState.ambienceGain || !audioState.context) {
          return;
        }
        const now = audioState.context.currentTime;
        const bersaglio = giu ? AMBIENCE_LEVEL * 0.28 : AMBIENCE_LEVEL;
        audioState.ambienceGain.gain.setTargetAtTime(bersaglio, now, giu ? 0.12 : 0.35);
      }

      // Legge la PROSSIMA battuta in coda, se non ne sta gia' leggendo una. Non blocca mai il
      // main thread: speechSynthesis.speak() e' asincrona di natura (Web Speech API), qui si
      // aggiunge solo l'incatenamento (onend -> prossima) cosi' piu' battute ravvicinate (es. lo
      // streaming del Task 1, frase per frase) si susseguono invece di troncarsi a vicenda.
      function processaCodaVoce() {
        if (vociInCorso || !codaVoce.length) {
          return;
        }
        const spokenText = codaVoce.shift();
        vociInCorso = true;

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
          duckAmbience(true);
        };

        utterance.onend = function handleSpeechEnd() {
          vociInCorso = false;
          duckAmbience(false);
          audioState.voiceStatus = codaVoce.length ? "speaking" : "ready";
          renderAudioUi();
          processaCodaVoce();
        };

        utterance.onerror = function handleSpeechError() {
          vociInCorso = false;
          duckAmbience(false);
          audioState.voiceStatus = "error";
          renderAudioUi();
          processaCodaVoce();
        };

        playDoom();
        window.speechSynthesis.speak(utterance);
      }

      // Accoda una battuta invece di interromperne una in corso (era il comportamento precedente:
      // speechSynthesis.cancel() ad ogni chiamata tagliava di netto qualunque frase gia' in lettura).
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

        codaVoce.push(spokenText);
        if (codaVoce.length > CODA_VOCE_MAX) {
          codaVoce.splice(0, codaVoce.length - CODA_VOCE_MAX);
        }
        processaCodaVoce();
        return true;
      }

      function stopVoice() {
        codaVoce.length = 0;
        vociInCorso = false;
        if (speechSupported) {
          window.speechSynthesis.cancel();
        }
        duckAmbience(false);
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
        renderAudioUi: renderAudioUi,
        // Diagnostica/test per la coda voce (Task 4: TTS non bloccante).
        getVoiceQueueLength: function getVoiceQueueLength() { return codaVoce.length; },
        isSpeaking: function isSpeaking() { return vociInCorso; }
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
  