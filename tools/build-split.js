/*
 * build-split.js — separa il monolite "vtt 2506.html" in una struttura scalabile:
 *   index.html  (shell HTML che referenzia i file esterni, ordine preservato)
 *   css/NN-nome.css   (un file per ogni blocco <style>)
 *   js/NN-nome.js     (un file per ogni blocco <script> inline)
 * Gli <script src="..."> esterni (es. Leaflet CDN) restano inline.
 *
 * NOTA: migrazione UNA TANTUM, gia eseguita. La fonte di verita ora sono i file
 * modulari (index.html + css/ + js/). Questo script resta solo come riferimento e
 * legge il monolite archiviato in legacy/. NON rieseguirlo: sovrascriverebbe i moduli.
 *
 * Uso:  node tools/build-split.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "legacy", "vtt-2506-monolite-originale.html");
const CSS_DIR = path.join(ROOT, "css");
const JS_DIR = path.join(ROOT, "js");

function slug(text, fallback) {
  let s = (text || "")
    .replace(/INIZIO|MODULO|JS\b|HTML\b|---/gi, " ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .split("-").filter(Boolean).slice(0, 5).join("-");
  return s || fallback;
}

function firstCommentSlug(content, fallback) {
  // CSS:  /* --- INIZIO MODULO 2: ... --- */   |  JS: // --- INIZIO MODULO 1 JS: ...
  const m = content.match(/\/\*+([\s\S]*?)\*\//) || content.match(/\/\/\s*(.+)/);
  return slug(m ? m[1] : "", fallback);
}

function main() {
  let html = fs.readFileSync(SRC, "utf8");
  fs.mkdirSync(CSS_DIR, { recursive: true });
  fs.mkdirSync(JS_DIR, { recursive: true });

  const out = [];     // pezzi del nuovo HTML
  let cssN = 0, jsN = 0;
  let i = 0;
  const lower = html.toLowerCase();

  while (i < html.length) {
    const styleAt = lower.indexOf("<style", i);
    const scriptAt = lower.indexOf("<script", i);
    let next = -1, kind = null;
    if (styleAt !== -1 && (scriptAt === -1 || styleAt < scriptAt)) { next = styleAt; kind = "style"; }
    else if (scriptAt !== -1) { next = scriptAt; kind = "script"; }

    if (next === -1) { out.push(html.slice(i)); break; }

    out.push(html.slice(i, next));                       // testo prima del blocco
    const openEnd = html.indexOf(">", next) + 1;         // fine del tag di apertura
    const openTag = html.slice(next, openEnd);
    const closeTag = kind === "style" ? "</style>" : "</script>";
    const closeAt = lower.indexOf(closeTag, openEnd);
    const inner = html.slice(openEnd, closeAt);
    const blockEnd = closeAt + closeTag.length;

    if (kind === "script" && /\ssrc\s*=/.test(openTag)) {
      out.push(html.slice(next, blockEnd));              // <script src> esterno: lascia inline
    } else if (kind === "style") {
      cssN += 1;
      const name = String(cssN).padStart(2, "0") + "-" + firstCommentSlug(inner, "style") + ".css";
      fs.writeFileSync(path.join(CSS_DIR, name), inner.replace(/^\n/, ""), "utf8");
      out.push('<link rel="stylesheet" href="css/' + name + '">');
    } else {
      jsN += 1;
      const name = String(jsN).padStart(2, "0") + "-" + firstCommentSlug(inner, "module") + ".js";
      fs.writeFileSync(path.join(JS_DIR, name), inner.replace(/^\n/, ""), "utf8");
      out.push('<script src="js/' + name + '"></script>');
    }
    i = blockEnd;
  }

  fs.writeFileSync(path.join(ROOT, "index.html"), out.join(""), "utf8");
  console.log("OK: " + cssN + " file CSS, " + jsN + " file JS estratti. index.html generato.");
}

main();
