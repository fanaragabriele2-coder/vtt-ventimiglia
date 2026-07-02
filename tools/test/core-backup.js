// Test del backup scaricabile (modulo 11): export su file (download) e import da file
// (FileReader), oltre al salvataggio esistente in localStorage. Verifica il round-trip dello
// stato del PG e che gli errori (file mancante, JSON non valido, lettura fallita, schema errato)
// siano gestiti con un esito { ok:false, message } e non con un'eccezione non gestita.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");

let passati = 0, falliti = 0;
function check(n, c) { if (c) { passati++; console.log("  OK  " + n); } else { falliti++; console.log("  FAIL " + n); } }

// ---- Stub browser: DOM minimale per createElement("a") + click/download, Blob, URL, FileReader.
const linkCreati = [];
function nuovoElemento(tag) {
  return {
    tagName: String(tag || "div").toUpperCase(), href: "", download: "", clicked: false,
    click() { this.clicked = true; }, setAttribute() {}, addEventListener() {}
  };
}
global.window = global;
global.document = {
  readyState: "complete",
  addEventListener() {},
  createElement(tag) { const el = nuovoElemento(tag); if (tag === "a") { linkCreati.push(el); } return el; },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  body: { appendChild() {}, removeChild() {} }
};
global.Blob = function (parts, opts) { this.parts = parts; this.type = opts && opts.type; };
global.URL = { createObjectURL() { return "blob:fake/" + Math.random().toString(36).slice(2); }, revokeObjectURL() {} };

// FileReader finto: legge una proprieta' __content del "file" passato; puo' simulare un errore
// di lettura se il file ha __erroreLettura:true.
global.FileReader = function () {
  const self = this;
  this.readAsText = function (file) {
    setTimeout(function () {
      if (file && file.__erroreLettura) { if (self.onerror) { self.onerror(); } return; }
      self.result = (file && file.__content) || "";
      if (self.onload) { self.onload(); }
    }, 0);
  };
};

global.localStorage = (function () { var s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } }; })();
window.UltimateVTT = { appendSystemLog() {}, runSelfDiagnostics: () => null, version: "test", registerModule() {} };

function carica(rel) { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel }); }
carica("js/04-3-state-manager-pg-statistiche.js");
carica("js/11-10-ai-bridge-json-parser.js");

const S = window.UltimateVTTState;
const B = window.UltimateVTTAIBridge;
check("UltimateVTTAIBridge esposto con le nuove funzioni di backup", typeof B.exportSnapshotToFile === "function" && typeof B.importSnapshotFromFile === "function");

console.log("\n[Export su file]");
S.setMaxHp(30); S.setCurrentHp(22);
const esportato = B.exportSnapshotToFile();
check("exportSnapshotToFile ritorna ok:true", esportato.ok === true);
check("il nome file contiene .json", /\.json$/.test(esportato.filename));
check("lo snapshot esportato ha lo schema atteso", esportato.snapshot.schema === "ultimate-vtt-local-save");
check("lo snapshot esportato contiene lo stato del PG corrente (HP 22)", esportato.snapshot.characterState.resources.hp.current === 22);
check("e' stato creato un link <a> di download", linkCreati.length === 1);
check("il link ha l'attributo download impostato al nome file", linkCreati[0].download === esportato.filename);
check("il link e' stato 'cliccato' per avviare il download", linkCreati[0].clicked === true);

console.log("\n[Import da file: round-trip valido]");
const contenutoValido = JSON.stringify(esportato.snapshot);
S.setCurrentHp(1); // disallinea lo stato per verificare che l'import lo ripristini
B.importSnapshotFromFile({ __content: contenutoValido }).then(function (risultato) {
  check("import da file valido ritorna ok:true", risultato.ok === true);
  check("import da file ripristina l'HP corrente (22)", S.getState().resources.hp.current === 22);

  console.log("\n[Import da file: casi di errore, nessuna eccezione]");
  return B.importSnapshotFromFile(null);
}).then(function (risultato) {
  check("import senza file ritorna ok:false (non lancia)", risultato.ok === false);
  return B.importSnapshotFromFile({ __content: "{ questo non e' json valido" });
}).then(function (risultato) {
  check("import con JSON malformato ritorna ok:false", risultato.ok === false);
  check("il messaggio segnala il file non valido", /non valido/i.test(risultato.message));
  return B.importSnapshotFromFile({ __content: JSON.stringify({ schema: "altro-schema" }) });
}).then(function (risultato) {
  check("import con schema sbagliato ritorna ok:false", risultato.ok === false);
  return B.importSnapshotFromFile({ __erroreLettura: true });
}).then(function (risultato) {
  check("errore di lettura del file (FileReader.onerror) ritorna ok:false (non lancia)", risultato.ok === false);

  console.log("\nRisultato core-backup: " + passati + " passati, " + falliti + " falliti.");
  process.exit(falliti === 0 ? 0 : 1);
}).catch(function (e) {
  falliti += 1;
  console.log("  ECCEZIONE non gestita: " + (e && e.message));
  console.log("\nRisultato core-backup: " + passati + " passati, " + falliti + " falliti.");
  process.exit(1);
});
