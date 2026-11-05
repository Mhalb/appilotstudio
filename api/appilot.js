// POST /api/appilot – KI-Hilfe des Studios
//   { mode: "draft", description, controls, screens }      ->  { title, description, steps, errors }
//   { mode: "polish", description, steps }                 ->  { title, description, steps, errors }
//   { mode: "course", topic, audience, sources, cases }     ->  { title, goal, minutes, blocks }
//   { mode: "tutor", messages, course, current, lang }      ->  { text }
//   { mode: "translate", lang, title, description, steps, errors } -> { title, description, steps, errors }
// Alle nehmen zusätzlich project: { app, audience } aus den Projekteinstellungen. lang: "de", "einfach" oder "en".
// Läuft als Vercel-Funktion; lokal über server.mjs. Braucht ANTHROPIC_API_KEY als Umgebungsvariable.
import Anthropic from "@anthropic-ai/sdk";
import {
  cleanProject,
  draftSystem, draftSchema, cleanControls, cleanScreens,
  polishSystem, POLISH_SCHEMA, cleanRecorded,
  courseSystem, courseSchema, cleanCaseRefs, buildTutor, TUTOR_SCHEMA, cleanCourseForTutor,
  cleanLang, translateSystem, TRANSLATE_SCHEMA, cleanTexts,
} from "../lib/prompt.js";
import { requireUser } from "./_lib/auth.js";

const client = new Anthropic();
const MODEL = process.env.APPILOT_MODEL || "claude-opus-5-5";
const MAX_TURNS = 10;
const MAX_CHARS = 1000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function ask({ system, schema, messages, maxTokens = 2000, effort = "low" }) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages,
  });
  if (response.stop_reason === "refusal") throw new Error("refusal");
  if (response.stop_reason === "max_tokens") throw new Error("Antwort abgeschnitten");
  return JSON.parse(response.content.find(b => b.type === "text").text);
}

function cleanMessages(input) {
  if (!Array.isArray(input)) return null;
  const msgs = input
    .slice(-MAX_TURNS)
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

async function draft(body) {
  const description = typeof body.description === "string" ? body.description.slice(0, 4000) : "";
  const controls = cleanControls(body.controls, 150).map(({ value, message, visible, ...c }) => c);
  if (!description.trim() || !controls.length) return [400, { error: "Beschreibung oder Karte der Anwendung fehlt" }];
  const map = { screens: cleanScreens(body.screens), controls };
  const out = await ask({
    system: draftSystem(cleanProject(body.project)),
    schema: draftSchema(controls),
    messages: [{ role: "user", content: "KARTE DER ANWENDUNG\n" + JSON.stringify(map) + "\n\nBESCHREIBUNG DES ABLAUFS\n" + description }],
    maxTokens: 8000,
    effort: "medium",
  });
  return [200, out];
}

async function polish(body) {
  const steps = cleanRecorded(body.steps);
  if (!steps.length) return [400, { error: "Keine aufgezeichneten Schritte" }];
  const description = typeof body.description === "string" ? body.description.slice(0, 2000) : "";
  const out = await ask({
    system: polishSystem(cleanProject(body.project)),
    schema: POLISH_SCHEMA,
    messages: [{ role: "user", content: (description ? "BESCHREIBUNG DES AUTORS\n" + description + "\n\n" : "") + "AUFGEZEICHNETE SCHRITTE\n" + JSON.stringify(steps) }],
    maxTokens: 6000,
  });
  if (!Array.isArray(out.steps) || out.steps.length !== steps.length) throw new Error("Schrittanzahl passt nicht");
  return [200, out];
}

async function course(body) {
  const topic = typeof body.topic === "string" ? body.topic.slice(0, 3000) : "";
  if (!topic.trim()) return [400, { error: "Thema fehlt" }];
  const project = cleanProject(body.project);
  const audience = typeof body.audience === "string" ? body.audience.slice(0, 400) : "";
  const sources = typeof body.sources === "string" ? body.sources.slice(0, 12000) : "";
  const cases = cleanCaseRefs(body.cases);
  const out = await ask({
    system: courseSystem(project),
    schema: courseSchema(cases),
    messages: [{ role: "user", content: "THEMA UND STICHWORTE\n" + topic + (audience ? "\n\nZIELGRUPPE\n" + audience : "") + (sources ? "\n\nQUELLEN DES AUTORS\n" + sources : "") + "\n\nVORHANDENE CASES FÜR DIE PRAXIS\n" + JSON.stringify(cases) }],
    maxTokens: 16000,
    effort: "medium",
  });
  return [200, out];
}

async function tutor(body) {
  const messages = cleanMessages(body.messages);
  if (!messages) return [400, { error: "messages fehlt oder endet nicht mit einer Nutzerfrage" }];
  const current = typeof body.current === "string" ? body.current.slice(0, 200) : "";
  const out = await ask({
    system: buildTutor({ course: cleanCourseForTutor(body.course), current, lang: cleanLang(body.lang), project: cleanProject(body.project) }),
    schema: TUTOR_SCHEMA,
    messages,
  });
  return [200, out];
}

async function translate(body) {
  const lang = cleanLang(body.lang);
  if (lang === "de") return [400, { error: "lang muss einfach oder en sein" }];
  const texts = cleanTexts(body);
  if (!texts.steps.length) return [400, { error: "Keine Schritte" }];
  const out = await ask({
    system: translateSystem(lang, cleanProject(body.project)),
    schema: TRANSLATE_SCHEMA,
    messages: [{ role: "user", content: "CASE\n" + JSON.stringify(texts) }],
    maxTokens: 8000,
  });
  if (out.steps.length !== texts.steps.length || out.errors.length !== texts.errors.length) throw new Error("Anzahl der Schritte passt nicht");
  return [200, out];
}

const MODES = { draft, polish, course, tutor, translate };

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end();
  }
  const mode = MODES[req.body?.mode] ? req.body.mode : null;
  if (!mode) return send(res, 400, { error: "mode muss draft, polish, course, tutor oder translate sein" });
  try {
    const [status, body] = await MODES[mode](req.body);
    send(res, status, body);
  } catch (err) {
    console.error("appilot " + mode + ":", err?.status || "", err?.message || err);
    // Die Seiten fallen bei Fehlern auf lokale Antworten zurück.
    send(res, 502, { error: "Appilot ist gerade nicht erreichbar" });
  }
}
