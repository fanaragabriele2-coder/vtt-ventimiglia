    // --- INIZIO INTEGRAZIONE VOCALE (STT) ---
    document.addEventListener("DOMContentLoaded", function() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn("Speech Recognition API non supportata da questo browser.");
        return;
      }
      
      const recognition = new SpeechRecognition();
      recognition.lang = 'it-IT';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      let isRecording = false;

      function stopRecordingUI(btn, inputField) {
        isRecording = false;
        btn.classList.remove("recording");
        inputField.placeholder = inputField.getAttribute("data-original-placeholder") || "Scrivi al Master o chiedi una prova...";
      }

      function handleMicClick(btn, inputField, submitAction) {
        if (isRecording) {
          recognition.stop();
          return;
        }
        
        recognition.onstart = function() {
          isRecording = true;
          btn.classList.add("recording");
          if (!inputField.hasAttribute("data-original-placeholder")) {
            inputField.setAttribute("data-original-placeholder", inputField.placeholder);
          }
          inputField.placeholder = "In ascolto...";
        };

        recognition.onresult = function(event) {
          const speechResult = event.results[0][0].transcript;
          inputField.value = speechResult;
          if (typeof submitAction === "function") {
            submitAction();
          } else if (submitAction && submitAction.dispatchEvent) {
            submitAction.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          }
        };

        recognition.onerror = function(event) {
          console.error("Errore STT:", event.error);
          stopRecordingUI(btn, inputField);
        };

        recognition.onend = function() {
          stopRecordingUI(btn, inputField);
        };

        recognition.start();
      }

      const micDesktop = document.getElementById("masterChatMicBtn");
      const inputDesktop = document.getElementById("masterChatInput");
      const formDesktop = document.getElementById("masterChatForm");
      if (micDesktop && inputDesktop && formDesktop) {
        micDesktop.addEventListener("click", function() {
          handleMicClick(micDesktop, inputDesktop, formDesktop);
        });
      }

      const micMobile = document.getElementById("hubChatMicBtn");
      const inputMobile = document.getElementById("hubChatInputField");
      const btnMobileSend = document.getElementById("hubChatSendBtn");
      if (micMobile && inputMobile && btnMobileSend) {
        micMobile.addEventListener("click", function() {
          handleMicClick(micMobile, inputMobile, function() {
             btnMobileSend.click();
          });
        });
      }

      window.autoSpeechEnabled = true;
      function toggleTts() {
        window.autoSpeechEnabled = !window.autoSpeechEnabled;
        const state = window.autoSpeechEnabled;
        const deskBtn = document.getElementById("masterChatTtsBtn");
        const mobBtn = document.getElementById("hubChatTtsBtn");
        if (deskBtn) { deskBtn.classList.toggle("muted", !state); deskBtn.textContent = state ? "🔊" : "🔇"; }
        if (mobBtn) { mobBtn.classList.toggle("muted", !state); mobBtn.textContent = state ? "🔊" : "🔇"; }
        if (!state && window.speechSynthesis) window.speechSynthesis.cancel();
      }
      
      const deskTts = document.getElementById("masterChatTtsBtn");
      const mobTts = document.getElementById("hubChatTtsBtn");
      if (deskTts) deskTts.addEventListener("click", toggleTts);
      if (mobTts) mobTts.addEventListener("click", toggleTts);

      function unlockAudio() {
        if (window.speechSynthesis && window.autoSpeechEnabled) {
          const u = new window.SpeechSynthesisUtterance("");
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
      }
      document.addEventListener("click", unlockAudio, { once: true });
    });
    // --- FINE INTEGRAZIONE VOCALE (STT) ---
  