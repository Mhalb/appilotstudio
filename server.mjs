// Lokaler Server: node server.mjs  ->  http://localhost:3000
// Liefert die Seiten des Studios aus und leitet /api/... an dieselben Funktionen wie auf Vercel.
// Schlüssel (ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, DATABASE_URL) kommen aus der Umgebung oder aus .env.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

try { process.loadEnvFile(); } catch { /* ohne .env: Umgebungsvariablen genügen */ }
const API = {
  "/api/appilot": (await import("./api/appilot.js")).default,
  "/api/tts": (await import("./api/tts.js")).default,
  "/api/auth": (await import("./api/auth.js")).default,
};

const root = fileURLToPath(new URL(".", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
const PUBLIC = ["/start.html", "/editor.html", "/lernen.html", "/lern-editor.html", "/anmelden.html", "/lib/", "/vendor/"];
const PAGES = { "/": "/start.html", "/start": "/start.html", "/editor": "/editor.html", "/lernen": "/lernen.html", "/lern-editor": "/lern-editor.html", "/anmelden": "/anmelden.html" };

http.createServer(async (req, res) => {
  const route = req.url.split("?")[0];
  if (API[route]) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try { req.body = JSON.parse(raw || "{}"); } catch { req.body = {}; }
    return API[route](req, res);
  }
  const path = normalize(PAGES[route] || route);
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
