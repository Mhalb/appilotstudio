// Übersicht nach der Aufnahme: Schritte prüfen, löschen, Namen anpassen, als Datei .appilot.json speichern.
// Format siehe docs/erweiterung.md und README des Studios („Aufnahme importieren“).
import { getRecording, putRecording, stepsOf, putStep, deleteStep, deleteRecording } from "./lib/db.js";

const $ = id => document.getElementById(id);
const VERSION = chrome.runtime.getManifest().version;
const ACTION = { click: "klicken", input: "eintragen", select: "wählen", check: "ankreuzen", upload: "Datei anhängen", info: "Hinweis" };
const recId = new URLSearchParams(location.search).get("rec");
let rec = null, steps = [];

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kids.filter(k => k != null));
  return e;
}

function shotView(s) {
  if (!s.shot) return el("div", { class: "noshot" }, "Kein Bild");
  const box = el("div", { class: "shot" }, el("img", { src: s.shot.dataUrl, alt: "Bildschirmfoto" }));
  if (s.rect) {
    const m = el("span", { class: "mark" });
    Object.assign(m.style, { left: (s.rect.x / s.shot.width) * 100 + "%", top: (s.rect.y / s.shot.height) * 100 + "%",
      width: (s.rect.w / s.shot.width) * 100 + "%", height: (s.rect.h / s.shot.height) * 100 + "%" });
    box.append(m);
  }
  return box;
}

function render() {
  $("title").value = rec.title;
  $("meta").textContent = new URL(rec.app.url).host + " · " + steps.length + (steps.length === 1 ? " Schritt" : " Schritte");
  $("notes").textContent = (rec.notes || []).map(n => n.text).join(" ");
  $("notes").hidden = !(rec.notes || []).length;
  $("empty").hidden = steps.length > 0;
  $("btnSave").disabled = !steps.length;
  $("steps").replaceChildren(...steps.map((s, i) => {
    const name = el("input", { value: s.label || "", maxlength: 120, "aria-label": "Element in Schritt " + (i + 1),
      oninput: e => { s.label = e.target.value; putStep(s); } });
    return el("li", {},
      el("span", { class: "num" }, String(i + 1)),
      el("div", { class: "body" },
        el("div", { class: "row" }, el("span", { class: "act" }, ACTION[s.action] || s.action), name,
          s.secret ? el("span", { class: "small" }, "Wert nicht aufgezeichnet") : s.valueText || s.value ? el("span", { class: "small" }, "Wert: " + (s.valueText || s.value)) : null),
        el("div", { class: "small" }, s.pageTitle || s.url),
        shotView(s)),
      el("button", { type: "button", class: "del", title: "Schritt löschen", "aria-label": "Schritt " + (i + 1) + " löschen",
        onclick: async () => { await deleteStep(s.id); steps.splice(i, 1); render(); } }, "✕"));
  }));
}

function fileName() {
  const base = (rec.title || "aufnahme").toLowerCase().replace(/[äöüß]/g, c => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c])).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return (base || "aufnahme") + ".appilot.json";
}

$("title").addEventListener("input", e => { rec.title = e.target.value; putRecording(rec); });

$("btnSave").addEventListener("click", () => {
  const data = {
    format: "appilot-aufnahme", version: 1, title: rec.title, app: rec.app, created: rec.created, recorder: "Appilot-Aufnahme " + VERSION,
    steps: steps.map(s => ({ action: s.action, label: s.label, name: s.name, role: s.role, value: s.value, valueText: s.valueText, secret: s.secret,
      url: s.url, pageTitle: s.pageTitle, shot: s.shot, rect: s.rect })),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = el("a", { href: url, download: fileName() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  $("saved").hidden = false;
});

$("btnDiscard").addEventListener("click", async () => {
  if (!confirm("Aufnahme „" + rec.title + "“ mit " + steps.length + " Schritten verwerfen? Das lässt sich nicht rückgängig machen.")) return;
  await deleteRecording(rec.id);
  window.close();
  document.body.replaceChildren(el("main", {}, el("p", { class: "empty" }, "Aufnahme verworfen. Sie können diesen Tab schließen.")));
});

rec = recId ? await getRecording(recId) : null;
if (!rec) {
  document.querySelector("main").replaceChildren(el("p", { class: "empty" }, "Diese Aufnahme gibt es nicht mehr."));
} else {
  steps = await stepsOf(rec.id);
  render();
}
