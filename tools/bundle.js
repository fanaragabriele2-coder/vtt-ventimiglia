/*
 * bundle.js — operazione inversa di build-split: riassembla index.html + css/ + js/
 * in un singolo file autonomo distribuibile (doppio-click, offline):
 *   dist/ultimate-vtt.html
 *
 * Sviluppi nei file modulari (css/, js/), poi generi il file unico da condividere.
 * I riferimenti a CDN esterni (Leaflet) restano come link/script remoti.
 *
 * Uso:  node tools/bundle.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "index.html");
const DIST_DIR = path.join(ROOT, "dist");

function main() {
  let html = fs.readFileSync(SRC, "utf8");

  // Inline i CSS locali:  <link rel="stylesheet" href="css/xxx.css">  ->  <style>...</style>
  html = html.replace(/<link\s+rel="stylesheet"\s+href="(css\/[^"]+)">/gi, function (m, href) {
    const file = path.join(ROOT, href);
    if (!fs.existsSync(file)) return m;
    return "<style>\n" + fs.readFileSync(file, "utf8") + "\n</style>";
  });

  // Inline i JS locali:  <script src="js/xxx.js"></script>  ->  <script>...</script>
  html = html.replace(/<script\s+src="(js\/[^"]+)"><\/script>/gi, function (m, src) {
    const file = path.join(ROOT, src);
    if (!fs.existsSync(file)) return m;
    return "<script>\n" + fs.readFileSync(file, "utf8") + "\n</script>";
  });

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const outFile = path.join(DIST_DIR, "ultimate-vtt.html");
  fs.writeFileSync(outFile, html, "utf8");
  console.log("OK: file unico generato -> dist/ultimate-vtt.html (" + html.length + " bytes)");
}

main();
