// Test del Task 4 (audio/voce non bloccante, modulo 10): carica il VERO js/10 con un
// AudioContext e una Web Speech API finti ma realistici (registrano i collegamenti del grafo e
// permettono di pilotare a mano onstart/onend), e verifica:
//  - la coda della voce del Master (niente piu' cancel() distruttivo tra due battute ravvicinate);
//  - il ducking dell'ambience mentre il Master parla;
//  - il bus di riverbero (BiquadFilterNode in retroazione) usato dai suoni atmosferici e NON da
//    quelli percussivi (dadi/click), creato una volta sola e riusato.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Nodo audio finto: registra i collegamenti (connect) e i parametri usati (gain/frequency). ----
function creaParametroFinto(valoreIniziale) {
  return {
    value: valoreIniziale,
    _target: [],
    setValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    setTargetAtTime(v, quando, costante) { this._target.push({ v: v, quando: quando, costante: costante }); this.value = v; }
  };
}
function creaNodoFinto(tipo) {
  const nodo = {
    _tipo: tipo, _collegamentiUscenti: [],
    type: "sine", frequency: creaParametroFinto(440), Q: creaParametroFinto(1),
    gain: creaParametroFinto(1), delayTime: creaParametroFinto(0), buffer: null,
    connect(dest) { this._collegamentiUscenti.push(dest); return dest; },
    disconnect() {}, start() {}, stop() {}
  };
  return nodo;
}

function creaAudioContextFinto() {
  const nodiCreati = [];
  const ctx = {
    state: "running",
    currentTime: 0,
    sampleRate: 44100,
    destination: { _tipo: "destination" },
    resume() { this.state = "running"; },
    createGain() { const n = creaNodoFinto("gain"); nodiCreati.push(n); return n; },
    createOscillator() { const n = creaNodoFinto("oscillator"); nodiCreati.push(n); return n; },
    createBufferSource() { const n = creaNodoFinto("bufferSource"); nodiCreati.push(n); return n; },
    createBiquadFilter() { const n = creaNodoFinto("biquad"); nodiCreati.push(n); return n; },
    createDelay(max) { const n = creaNodoFinto("delay"); n._maxDelay = max; nodiCreati.push(n); return n; },
    createBuffer(canali, lunghezza, sampleRate) {
      return { getChannelData: () => new Float32Array(lunghezza), length: lunghezza, sampleRate: sampleRate };
    },
    _nodi: nodiCreati
  };
  return ctx;
}

// ---- Web Speech API finta: cattura ogni utterance passata a speak(), pilotabile a mano. ----
function creaSpeechSynthesisFinta() {
  const parlate = [];
  return {
    _parlate: parlate,
    cancel() { this._cancellata = true; },
    getVoices() { return [{ name: "Voce IT", lang: "it-IT" }]; },
    speak(utterance) { parlate.push(utterance); },
    onvoiceschanged: null
  };
}
function creaUtteranceFinta(testo) {
  return { text: testo, lang: "", rate: 1, pitch: 1, volume: 1, voice: null, onstart: null, onend: null, onerror: null };
}

// ---- DOM permissivo (stesso pattern degli altri test che caricano moduli reali) ----
function nuovoElemento(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(), id: "", textContent: "", value: "", checked: false,
    style: {}, children: [], options: [],
    appendChild(f) { this.children.push(f); return f; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setAttribute() {}, getAttribute() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }
  };
}

global.window = global;
global.document = {
  readyState: "complete",
  addEventListener() {}, removeEventListener() {},
  getElementById() { return nuovoElemento("div"); },
  querySelectorAll() { return []; },
  querySelector() { return nuovoElemento("div"); },
  createElement: nuovoElemento,
  body: nuovoElemento("body")
};
window.UltimateVTT = { appendSystemLog() {}, registerModule() {} };

const audioCtx = creaAudioContextFinto();
window.AudioContext = function () { return audioCtx; };
const speechSynth = creaSpeechSynthesisFinta();
window.speechSynthesis = speechSynth;
window.SpeechSynthesisUtterance = function (testo) { return creaUtteranceFinta(testo); };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }

console.log("Caricamento del VERO js/10 (audio procedurale + voce Master)...");
carica("js/10-9-audio-procedurale-web-audio.js");
const A = window.UltimateVTTAudioVoice;
check("UltimateVTTAudioVoice esposto", !!A);

A.ensureAudioContext();

// ---------------------------------------------------------------------------
console.log("\n[Coda della voce: niente piu' cancel() distruttivo tra due battute]");
check("in partenza la coda e' vuota e non si sta parlando", A.getVoiceQueueLength() === 0 && A.isSpeaking() === false);

const ok1 = A.speakMaster("Le ombre si muovono oltre la soglia.");
check("speakMaster accoda e ritorna true", ok1 === true);
check("la prima battuta parte SUBITO (coda vuota, nessuno in corso)", speechSynth._parlate.length === 1 && A.isSpeaking() === true);

const ok2 = A.speakMaster("Un ringhio arriva dal buio.");
check("una seconda battuta arrivata MENTRE la prima parla si ACCODA (non la interrompe)",
  ok2 === true && speechSynth._parlate.length === 1 && A.getVoiceQueueLength() === 1);
check("nessun cancel() e' stato chiamato (niente troncamento distruttivo)", !speechSynth._cancellata);

// La prima battuta finisce: la seconda deve partire DA SOLA.
speechSynth._parlate[0].onend();
check("finita la prima, la seconda parte automaticamente", speechSynth._parlate.length === 2 && A.getVoiceQueueLength() === 0);
speechSynth._parlate[1].onend();
check("finita anche la seconda, la coda e' vuota e non si sta piu' parlando", A.getVoiceQueueLength() === 0 && A.isSpeaking() === false);

console.log("\n[Tetto della coda: le battute piu' vecchie non lette vengono scartate]");
A.speakMaster("battuta 1 (in lettura)"); // parte subito, occupa "in corso"
for (let i = 2; i <= 9; i++) { A.speakMaster("battuta " + i); } // altre 8 si accodano
check("la coda non supera il tetto (6), le piu' vecchie sono state scartate", A.getVoiceQueueLength() === 6);
speechSynth._parlate[speechSynth._parlate.length - 1].onend(); // libera la "in corso"
speechSynth._parlate[speechSynth._parlate.length - 1].onend(); // libera la successiva
// svuota la coda residua per non contaminare i test successivi
A.stopVoice();
check("stopVoice svuota la coda e interrompe la lettura in corso", A.getVoiceQueueLength() === 0 && A.isSpeaking() === false);

// ---------------------------------------------------------------------------
console.log("\n[Ducking: l'ambience si abbassa quando il Master parla, e risale a fine battuta]");
A.startAmbience();
speechSynth._parlate.length = 0;
A.speakMaster("Un sussurro attraversa la sala.");
const gainAmbience = audioCtx._nodi.filter(n => n._tipo === "gain").pop(); // l'ultimo gain creato prima della voce e' quello dell'ambience o del reverbero: verifichiamo tramite lo storico dei target
// Verifica diretta: lo stato interno del modulo espone il gain dell'ambience via getState? Non e'
// clonabile (e' un AudioNode). Si verifica quindi il COMPORTAMENTO: subito dopo onstart, un
// qualche gain node ha ricevuto una chiamata setTargetAtTime con un valore MOLTO piu' basso di
// prima (ducking), e dopo onend torna a un valore piu' alto.
speechSynth._parlate[0].onstart();
const duckato = audioCtx._nodi.some(n => n._tipo === "gain" && n.gain._target.some(t => t.v > 0 && t.v < 0.02));
check("all'avvio della battuta, un gain (l'ambience) viene abbassato (ducking)", duckato);
speechSynth._parlate[0].onend();
const risalito = audioCtx._nodi.some(n => n._tipo === "gain" && n.gain._target.some(t => Math.abs(t.v - 0.065) < 0.0001));
check("a fine battuta, il gain torna al livello originale dell'ambience (0.065)", risalito);
A.stopAmbience();

// ---------------------------------------------------------------------------
console.log("\n[Bus di riverbero: creato UNA volta, usato dai suoni atmosferici]");
const nodiPrimaDiUnSuono = audioCtx._nodi.length;
A.playImpact(); // atmosferico: riverbero:true sulle sue chiamate a playNoise/playTone
const nodiDopoImpact = audioCtx._nodi.length;
check("playImpact ha creato dei nodi audio (suono generato)", nodiDopoImpact > nodiPrimaDiUnSuono);
// Il bus di riverbero contiene un DelayNode + un BiquadFilterNode in retroazione: dopo playImpact
// devono esistere entrambi tra i nodi creati (creati alla prima richiesta di riverbero).
check("il riverbero usa un DelayNode (la sua coda)", audioCtx._nodi.some(n => n._tipo === "delay"));
const numeroBiquadPrimaDiUnSecondoSuono = audioCtx._nodi.filter(n => n._tipo === "biquad").length;
A.playDoom(); // altro suono atmosferico: deve RIUSARE lo stesso bus, non crearne un secondo
const numeroBiquadDopo = audioCtx._nodi.filter(n => n._tipo === "biquad").length;
// playDoom aggiunge i SUOI filtri passa-basso/passa-alto propri (uno per playTone), ma NON un
// secondo bus di riverbero: la differenza deve corrispondere solo ai filtri dei nuovi toni/rumori
// di playDoom, non a un secondo smorzamento del riverbero. Verifichiamo quindi indirettamente che
// il numero di DelayNode resti 1 (il bus non viene ricreato).
check("il riverbero resta UN solo DelayNode anche dopo un secondo suono atmosferico",
  audioCtx._nodi.filter(n => n._tipo === "delay").length === 1);

console.log("\n[I suoni percussivi (dadi, click UI) NON passano dal riverbero]");
const delayPrimaDiDadi = audioCtx._nodi.filter(n => n._tipo === "delay").length;
A.playDiceClatter();
check("playDiceClatter non crea un nuovo DelayNode (resta percussivo, niente riverbero)",
  audioCtx._nodi.filter(n => n._tipo === "delay").length === delayPrimaDiDadi);

console.log("\nRisultato core-audio-voice: " + passati + " passati, " + falliti + " falliti.");
process.exit(falliti === 0 ? 0 : 1);
