// Ende-zu-Ende-Test der Erweiterung: Aufnahme auf Testseiten → Übersichtsseite → Datei → Prüfung wie im Studio.
//
//   npm i --no-save playwright && npx playwright install chromium
//   node extension/test/aufnahme.test.mjs
//
// Playwright ist bewusst keine Abhängigkeit des Studios (nur für diesen Test). Optional: PLAYWRIGHT=<Pfad zum Modul>,
// CHROMIUM=<Pfad zu Chromium>, SAVE=<Datei> speichert die erzeugte Aufnahme,
// SHOTS=<Ordner> macht Bildschirmfotos von Übersicht und Popup. Weil ein Test nicht auf das Erweiterungssymbol klicken kann (activeTab), läuft er mit einer
// Kopie der Erweiterung, die zusätzlich das Recht für die Testadressen hat. Alles andere ist die echte Erweiterung.
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
const here = dirname(fileURLToPath(import.meta.url));
const EXT_SRC = join(here, "..");
const STUDIO_AUFNAHME = join(here, "..", "..", "lib", "aufnahme.js");

// Erweiterung kopieren, Testrecht ergänzen, Test-Ordner weglassen
const dir = await mkdtemp(join(tmpdir(), "appilot-ext-"));
await cp(EXT_SRC, dir, { recursive: true, filter: src => !src.includes("/test") });
const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
manifest.host_permissions = ["<all_urls>"];
await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));

const APP = "https://app.appilot.test";
const OTHER = "https://login.appilot.test";
const PAGE1 = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kunden</title>
<style>body{font:16px sans-serif;margin:0} header{background:#123;padding:12px} header a{color:#fff;margin-right:16px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)} li{padding:10px;border-bottom:1px solid #ccc;cursor:pointer}
.mehr{cursor:pointer;color:#06c;margin:12px}</style></head><body>
<header><a href="/kunden/neu">Neuer Kunde (Formular)</a><a href="${OTHER}/anmelden">Anmelden</a></header>
<main><h1>Kunden</h1><button id="neu" onclick="document.getElementById('info').textContent='Bitte Formular nutzen'">Neuer Kunde</button>
<p id="info"></p>
<ul><li role="listitem"><span class="Title">Muster GmbH</span> <span>449,99 EUR</span><span class="sr-only">Hervorgehoben</span></li>
<li role="listitem"><span class="Title">Beispiel AG</span> <span>12,00 EUR</span></li></ul>
<div class="mehr" onclick="this.textContent='Weniger anzeigen'">Mehr anzeigen</div>
<button aria-label="Einstellungen öffnen">⚙</button></main></body></html>`;
const PAGE2 = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Neuer Kunde</title></head><body style="font:16px sans-serif">
<h1>Neuer Kunde</h1><form onsubmit="event.preventDefault();document.body.innerHTML='<h1>Gespeichert</h1><a href=/>Zur Liste</a>'">
<p><label for="name">Name</label> <input id="name"></p>
<p><label>Kennwort <input id="pw" type="password" autocomplete="new-password"></label></p>
<p><label for="ziel">Zahlungsziel</label> <select id="ziel"><option value="14">14 Tage</option><option value="30">30 Tage</option></select></p>
<p><label><input type="checkbox" id="nl"> Newsletter</label></p>
<p><button type="submit">Speichern</button></p></form></body></html>`;
const PAGE_OTHER = `<!doctype html><title>Anmelden</title><h1>Anmeldung</h1><a href="${APP}/">Zurück zur Anwendung</a>`;

const ctx = await chromium.launchPersistentContext("", {
  executablePath: process.env.CHROMIUM || undefined, headless: false, viewport: { width: 1280, height: 800 }, acceptDownloads: true,
  args: ["--headless=new", `--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
});
const failures = [];
try {
  await ctx.route(APP + "/**", r => r.fulfill({ contentType: "text/html; charset=utf-8", body: new URL(r.request().url()).pathname.startsWith("/kunden/neu") ? PAGE2 : PAGE1 }));
  await ctx.route(OTHER + "/**", r => r.fulfill({ contentType: "text/html; charset=utf-8", body: PAGE_OTHER }));
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  const page = ctx.pages()[0] || await ctx.newPage();
  const pause = ms => page.waitForTimeout(ms);
  const click = async loc => { await loc.hover(); await pause(400); await loc.click({ delay: 110 }); await pause(900); };

  await page.goto(APP + "/");
  await pause(500);
  const started = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return self.appilotTest.start({ tabId: tab.id, title: "Neuen Kunden anlegen", recordValues: true });
  });
  assert.equal(started.recording, true, "Aufnahme läuft");
  await pause(1200);

  await click(page.getByRole("button", { name: "Neuer Kunde" }));                 // 1 Knopf
  await click(page.getByText("Muster GmbH"));                                       // 2 Listeneintrag (ohne Preis, ohne „Hervorgehoben“)
  await click(page.getByText("Mehr anzeigen"));                                     // 3 Element ohne Rolle (Hand-Mauszeiger)
  await click(page.getByRole("button", { name: "Einstellungen öffnen" }));          // 4 Symbol-Knopf mit aria-label
  await click(page.getByRole("link", { name: "Neuer Kunde (Formular)" }));          // 5 Link → Seitenwechsel, gleiche Adresse
  await page.waitForURL("**/kunden/neu"); await pause(1200);
  await page.getByLabel("Name").fill("Muster GmbH"); await page.keyboard.press("Tab"); await pause(900);    // 6 Eingabe
  await page.locator("#pw").fill("geheim123"); await page.keyboard.press("Tab"); await pause(900);           // 7 Passwort: ohne Wert
  await page.getByLabel("Zahlungsziel").selectOption("30"); await pause(900);                               // 8 Auswahl
  await click(page.getByText("Newsletter"));                                                                 // 9 Häkchen (über Beschriftung, kein doppelter Schritt)
  await click(page.getByRole("button", { name: "Speichern" }));                                              // 10 Knopf
  await click(page.getByRole("link", { name: "Zur Liste" }));                                                // 11 Link → zurück
  await page.waitForURL(APP + "/"); await pause(1000);
  await click(page.getByRole("link", { name: "Anmelden" }));                                                 // 12 Link → andere Adresse (pausiert)
  await page.waitForURL(OTHER + "/**"); await pause(800);
  const paused = await sw.evaluate(() => self.appilotTest.getState());
  assert.equal(paused.paused, true, "Aufnahme pausiert auf anderer Adresse");
  await page.getByRole("link", { name: "Zurück zur Anwendung" }).click(); await page.waitForURL(APP + "/"); await pause(1200);  // nicht aufgenommen
  const resumed = await sw.evaluate(() => self.appilotTest.getState());
  assert.equal(resumed.paused, false, "Aufnahme läuft weiter auf der Anwendung");
  await click(page.getByRole("button", { name: "Neuer Kunde" }));                                            // 13 Knopf

  const reviewPromise = ctx.waitForEvent("page");
  await sw.evaluate(() => self.appilotTest.stop());
  const review = await reviewPromise;
  await review.waitForSelector("#steps li");
  if (process.env.SHOTS) {
    await review.setViewportSize({ width: 1100, height: 900 });
    await review.screenshot({ path: join(process.env.SHOTS, "uebersicht.png") });
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 340, height: 520 });
    await popup.goto(review.url().replace(/review\.html.*/, "popup.html"));
    await popup.screenshot({ path: join(process.env.SHOTS, "popup.png") });
    await popup.close();
  }
  const dl = review.waitForEvent("download");
  await review.getByRole("button", { name: "Datei speichern" }).click();
  const download = await dl;
  assert.match(download.suggestedFilename(), /^neuen-kunden-anlegen\.appilot\.json$/);
  const text = await readFile(await download.path(), "utf8");
  if (process.env.SAVE) await writeFile(process.env.SAVE, text); // zum Ansehen, z. B. im Studio importieren

  // Wie das Studio die Datei prüft (lib/aufnahme.js)
  globalThis.window = {};
  new Function(await readFile(STUDIO_AUFNAHME, "utf8"))();
  const rec = window.AppilotAufnahme.parse(text);
  const raw = JSON.parse(text);
  const rows = rec.steps.map(s => [s.action, s.label, s.value, s.secret, !!s.shot, !!s.rect]);
  console.log("Schritte:");
  rows.forEach((r, i) => console.log(String(i + 1).padStart(3), r.join(" | ")));

  const expect = [
    ["click", "Knopf „Neuer Kunde“"],
    ["click", "Eintrag „Muster GmbH“"],
    ["click", "Element „Mehr anzeigen“"],
    ["click", "Knopf „Einstellungen öffnen“"],
    ["click", "Link „Neuer Kunde (Formular)“"],
    ["input", "Feld „Name“", "Muster GmbH"],
    ["input", "Feld „Kennwort“", ""],
    ["select", "Liste „Zahlungsziel“", "30"],
    ["check", "Kästchen „Newsletter“"],
    ["click", "Knopf „Speichern“"],
    ["click", "Link „Zur Liste“"],
    ["click", "Link „Anmelden“"],
    ["click", "Knopf „Neuer Kunde“"],
  ];
  const check = (cond, text) => { if (!cond) failures.push(text); };
  check(rec.steps.length === expect.length, `Anzahl Schritte ${rec.steps.length}, erwartet ${expect.length}`);
  expect.forEach(([action, label, value], i) => {
    const s = rec.steps[i];
    if (!s) return;
    check(s.action === action, `Schritt ${i + 1}: Aktion ${s.action}, erwartet ${action}`);
    check(s.label === label, `Schritt ${i + 1}: Name ${s.label}, erwartet ${label}`);
    if (value !== undefined) check(s.value === value, `Schritt ${i + 1}: Wert ${s.value}, erwartet ${value}`);
    check(!!s.shot, `Schritt ${i + 1}: kein Bild`);
    check(!!s.rect, `Schritt ${i + 1}: kein markierter Bereich`);
  });
  check(rec.steps[6] && rec.steps[6].secret === true && !text.includes("geheim123"), "Passwort darf nicht in der Datei stehen");
  check(!text.includes("Hervorgehoben"), "Text nur für Screenreader darf nicht im Namen stehen");
  check(raw.steps.every(s => !s.shot || s.shot.width <= 1600), "Bilder höchstens 1600 Pixel breit");
  check(rec.app.url === APP + "/", "Adresse der Anwendung");
  const notes = await review.locator("#notes").textContent();
  check(/pausiert/.test(notes), "Hinweis auf die Pause in der Übersicht");
  console.log("Datei:", Math.round(text.length / 1024), "KB");
} finally {
  await ctx.close();
  await rm(dir, { recursive: true, force: true });
}
if (failures.length) { console.error("FEHLER:\n- " + failures.join("\n- ")); process.exit(1); }
console.log("OK: Aufnahme → Datei → Studio-Prüfung");
