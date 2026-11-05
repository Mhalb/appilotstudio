// Appilot-Aufnahme · Hintergrund (Service Worker)
//
// - Start und Stopp der Aufnahme (aus dem Popup), Zustand in chrome.storage.session
// - setzt das Aufnahme-Skript (content.js) in den Tab und nach jedem Laden einer Seite derselben Adresse neu ein;
//   dafür reicht activeTab (bleibt bei Seitenwechseln innerhalb derselben Herkunft erhalten, siehe docs/erweiterung.md)
// - macht die Bildschirmfotos (chrome.tabs.captureVisibleTab): sofort beim Drücken der Maustaste, nach Eingaben, und
//   ein „ruhiges Bild“ als Rückfall (höchstens eins pro Sekunde, Chrome erlaubt zwei pro Sekunde)
// - legt die Schritte in IndexedDB ab (lib/db.js); nichts verlässt den Rechner
import { putRecording, getRecording, addStep, stepsOf } from "./lib/db.js";

const MAX_W = 1600;          // Bilder wie im Studio auf höchstens 1600 Pixel Breite
const MAX_STEPS = 100;       // mehr nimmt das Studio nicht an
const MIN_GAP = 510;         // ms zwischen zwei Bildern (Chrome: höchstens 2 pro Sekunde)
const QUIET_GAP = 1000;      // ruhige Bilder höchstens einmal pro Sekunde

let lastCapture = 0;
let quiet = null;            // { dataUrl, width, height, at, url }
let queue = Promise.resolve();

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
const getState = async () => (await chrome.storage.session.get("state")).state || null;
const setState = state => chrome.storage.session.set({ state });

async function badge(state) {
  if (!state || !state.recording) { await chrome.action.setBadgeText({ text: "" }); return; }
  await chrome.action.setBadgeBackgroundColor({ color: state.paused ? "#a33b00" : "#d4002a" });
  await chrome.action.setBadgeText({ text: state.paused ? "II" : String(state.count || "●") });
}

const originOf = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; } };

// ---------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function capture(windowId) {
  const wait = MIN_GAP - (Date.now() - lastCapture);
  if (wait > 0) await sleep(wait);
  lastCapture = Date.now();
  return chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 90 });
}

// Verkleinern auf höchstens 1600 Pixel Breite, als JPEG. Liefert { dataUrl, width, height, scale }.
async function shrink(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_W / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  const bytes = new Uint8Array(await out.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { dataUrl: "data:image/jpeg;base64," + btoa(bin), width: w, height: h };
}

// Bereich des Elements (CSS-Pixel im sichtbaren Bereich) in Pixel des Bildes umrechnen
function toImageRect(rect, viewportWidth, shot) {
  if (!rect || !viewportWidth) return null;
  const k = shot.width / viewportWidth;
  const x = Math.max(0, Math.round(rect.x * k)), y = Math.max(0, Math.round(rect.y * k));
  const w = Math.min(Math.round(rect.w * k), shot.width - x), h = Math.min(Math.round(rect.h * k), shot.height - y);
  return w >= 4 && h >= 4 ? { x, y, w, h } : null;
}

// ---------------------------------------------------------------------------
// Aufnahme starten und beenden
// ---------------------------------------------------------------------------
async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function start({ tabId, title, recordValues }) {
  const tab = await chrome.tabs.get(tabId);
  const origin = originOf(tab.url);
  if (!origin) throw new Error("Aufnehmen geht nur auf Webseiten (http oder https).");
  const id = "rec-" + Date.now().toString(36);
  const rec = { id, title: String(title || "").trim().slice(0, 120) || tab.title || "Aufnahme", app: { url: tab.url, title: tab.title || "" },
    created: new Date().toISOString(), recordValues: recordValues !== false, origin, notes: [] };
  await putRecording(rec);
  const state = { recording: true, paused: false, rec: id, tabId, windowId: tab.windowId, origin, recordValues: rec.recordValues, count: 0 };
  await setState(state);
  quiet = null;
  try { await inject(tabId); } catch (err) {
    await setState(null);
    throw new Error("Die Seite lässt keine Aufnahme zu (" + (err.message || err) + ").");
  }
  await badge(state);
  return state;
}

async function stop({ open = true } = {}) {
  const state = await getState();
  if (!state) return null;
  await setState(null);
  await badge(null);
  try { await chrome.tabs.sendMessage(state.tabId, { type: "appilot-stop" }); } catch { /* Tab schon zu */ }
  if (open) await chrome.tabs.create({ url: chrome.runtime.getURL("review.html?rec=" + encodeURIComponent(state.rec)) });
  return state.rec;
}

// Nach jedem Laden einer Seite: gleiche Adresse → Skript neu einsetzen; andere Adresse → pausieren.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  const state = await getState();
  if (!state || !state.recording || state.tabId !== tabId) return;
  const origin = originOf(tab.url);
  if (origin === state.origin) {
    try {
      await inject(tabId);
      if (state.paused) { state.paused = false; await setState(state); await badge(state); }
    } catch (err) { console.warn("Appilot-Aufnahme: Skript nicht eingesetzt", err); }
    return;
  }
  if (!state.paused) {
    state.paused = true;
    await setState(state);
    await badge(state);
    const rec = await getRecording(state.rec);
    if (rec) { rec.notes.push({ at: new Date().toISOString(), text: "Aufnahme pausiert: Die Anwendung hat zu " + (origin ? new URL(origin).host : "einer anderen Adresse") + " gewechselt. Zurück auf " + new URL(state.origin).host + " geht es weiter." }); await putRecording(rec); }
  }
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const state = await getState();
  if (state && state.tabId === tabId) await stop({ open: true });
});

// ---------------------------------------------------------------------------
// Nachrichten aus Popup und Aufnahme-Skript
// ---------------------------------------------------------------------------
async function onStep(msg, sender, state) {
  if (state.count >= MAX_STEPS) return { ok: false, error: "Höchstens " + MAX_STEPS + " Schritte je Aufnahme." };
  let shot = null, source = "";
  try {
    if (msg.when === "quiet") throw new Error("ruhiges Bild gewünscht");
    // Ist das Kontingent gerade erschöpft und das ruhige Bild aktuell, das ruhige Bild nehmen statt zu warten.
    // Nur bei Klicks: Nach Eingaben muss das Bild den neuen Wert zeigen, dafür immer ein frisches Bild.
    if (msg.when === "down" && Date.now() - lastCapture < MIN_GAP && quiet && quiet.url === sender.tab.url && quiet.at >= msg.lastChange) throw new Error("ruhiges Bild ist aktuell");
    if (msg.when === "after") await sleep(150); // der Seite Zeit geben, den neuen Wert zu zeichnen
    shot = await shrink(await capture(state.windowId));
    source = msg.when;
  } catch (err) {
    if (quiet && quiet.url === sender.tab.url && (msg.when !== "after" || quiet.at >= msg.lastChange)) { shot = quiet; source = "ruhig"; }
  }
  const s = msg.step || {};
  const step = {
    rec: state.rec, at: Date.now(),
    action: s.action, label: s.label, name: s.name, role: s.role,
    value: state.recordValues && !s.secret ? s.value || "" : "", valueText: state.recordValues && !s.secret ? s.valueText || "" : "",
    secret: !!s.secret, url: sender.tab.url, pageTitle: sender.tab.title || "",
    shot: shot ? { dataUrl: shot.dataUrl, width: shot.width, height: shot.height } : null,
    rect: shot ? toImageRect(s.rect, s.viewportWidth, shot) : null,
    shotSource: source,
  };
  await addStep(step);
  state.count++;
  await setState(state);
  await badge(state);
  return { ok: true, count: state.count };
}

async function onQuiet(sender, state) {
  if (Date.now() - lastCapture < QUIET_GAP) return { ok: false };
  try {
    const shot = await shrink(await capture(state.windowId));
    quiet = Object.assign(shot, { at: Date.now(), url: sender.tab.url });
    return { ok: true };
  } catch { return { ok: false }; }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  (async () => {
    // Aus dem Popup bzw. der Übersichtsseite
    if (msg.type === "state") return { state: await getState() };
    if (msg.type === "start") return { state: await start(msg) };
    if (msg.type === "stop") return { rec: await stop() };
    if (msg.type === "steps") return { steps: await stepsOf(msg.rec), rec: await getRecording(msg.rec) };
    // Aus dem Aufnahme-Skript: nur aus dem Tab, in dem die Aufnahme läuft, und nur von derselben Adresse
    const state = await getState();
    if (!state || !state.recording || state.paused || !sender.tab || sender.tab.id !== state.tabId || originOf(sender.tab.url) !== state.origin) return { ok: false, error: "keine Aufnahme" };
    // Schritte nacheinander verarbeiten, damit Zähler und Reihenfolge stimmen
    if (msg.type === "step") return (queue = queue.catch(() => {}).then(async () => onStep(msg, sender, (await getState()) || state)));
    if (msg.type === "quiet") return onQuiet(sender, state);
    return { ok: false };
  })().then(reply, err => reply({ ok: false, error: String(err && err.message || err) }));
  return true;
});

// Für automatische Tests (extension/test): Start ohne Klick auf das Symbol
self.appilotTest = { start, stop, getState };
