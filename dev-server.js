// Server statico minimale per anteprima locale del VTT.
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = __dirname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};
http.createServer(function (req, res) {
  var p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  var file = path.join(root, p);
  if (file.indexOf(root) !== 0) { res.writeHead(403); res.end("403"); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end("404 Not Found"); return; }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    });
    res.end(data);
  });
}).listen(4599, function () { console.log("VTT preview server in ascolto su http://localhost:4599"); });
