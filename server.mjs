// Lokaler Server: node server.mjs  ->  http://localhost:3000
// Liefert die Seiten des Studios aus und leitet /api/appilot und /api/tts an dieselben Funktionen wie auf Vercel.
// Schlüssel (ANTHROPIC_API_KEY, ELEVENLABS_API_KEY) kommen aus der Umgebung oder aus .env.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

try { process.loadEnvFile(); } catch { /* ohne .env: Umgebungsvariablen genügen */ }
const { default: handler } = await import("./api/appilot.js");
const { default: tts } = await import("./api/tts.js");

const root = fileURLToPath(new URL(".", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
const PUBLIC = ["/editor.html", "/lernen.html", "/lern-editor.html", "/lib/", "/vendor/"];
const PAGES = { "/": "/editor.html", "/editor": "/editor.html", "/lernen": "/lernen.html", "/lern-editor": "/lern-editor.html" };

http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/appilot") || req.url.startsWith("/api/tts")) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try { req.body = JSON.parse(raw || "{}"); } catch { req.body = {}; }
    return (req.url.startsWith("/api/tts") ? tts : handler)(req, res);
  }
  let path = req.url.split("?")[0];
  path = normalize(PAGES[path] || path);
  // Die Anweisungen an die KI bleiben auf dem Server.
  if (!PUBLIC.some(p => path.startsWith(p)) || path.includes("..") || path === "/lib/prompt.js") {
    res.statusCode = 404;
    return res.end("Nicht gefunden");
  }
  try {
    const body = await readFile(join(root, path));
    res.setHeader("Content-Type", types[extname(path)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("Nicht gefunden");
  }
}).listen(process.env.PORT || 3000, () => console.log("Appilot Studio läuft auf http://localhost:" + (process.env.PORT || 3000)));
