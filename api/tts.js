// POST /api/tts  { text, lang }  ->  audio/mpeg   (lang: "de", "einfach" oder "en")
// Vertonung der Videos über ElevenLabs. Braucht ELEVENLABS_API_KEY als Umgebungsvariable;
// optional ELEVENLABS_VOICE_ID (Stimme) und ELEVENLABS_MODEL.
import { requireUser } from "./_lib/auth.js";

const VOICE = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const MAX_CHARS = 1200;

// Aussprache: Wörter, die die Stimme sonst falsch liest. Fachbegriffe einer Zielanwendung kommen später aus dem Projekt.
const ALIASES = [
  [/betterknow/gi, "Better Know"],
  [/appilot/gi, "Äpppailett"], // ein Wort: US-englisch „app“ + „pilot“, ohne Pause
  [/\bz\. ?B\./g, "zum Beispiel"],
  [/\bggf\./g, "gegebenenfalls"],
  [/\bNr\./g, "Nummer"],
  [/ · /g, ", "],
  [/ ?€/g, " Euro"],
];

// Englische Texte: Appilot liest die Stimme dort von selbst richtig, deutsche Abkürzungen kommen nicht vor.
const ALIASES_EN = [
  [/betterknow/gi, "Better Know"],
  [/ · /g, ", "],
  [/ ?€/g, " euros"],
];

export function speakable(text, lang) {
  let t = String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  for (const [re, to] of lang === "en" ? ALIASES_EN : ALIASES) t = t.replace(re, to);
  return t;
}

function fail(res, status, error) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error }));
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== "POST") return fail(res, 405, "Nur POST");
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return fail(res, 503, "ELEVENLABS_API_KEY fehlt");
  const lang = req.body && req.body.lang;
  const text = speakable(req.body && req.body.text, lang);
  if (!text) return fail(res, 400, "Kein Text");
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      // Einfache Sprache etwas langsamer sprechen.
      body: JSON.stringify(lang === "einfach" ? { text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.88 } } : { text, model_id: MODEL }),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      console.error("ElevenLabs", r.status, detail);
      return fail(res, 502, "Sprachausgabe nicht verfügbar (" + r.status + ")");
    }
    const audio = Buffer.from(await r.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.end(audio);
  } catch (err) {
    console.error(err);
    fail(res, 502, "Sprachausgabe nicht erreichbar");
  }
}
