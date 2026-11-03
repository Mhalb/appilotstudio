// Update-Check: Appilot merkt sich bei jeder Freigabe, wie die Zielanwendung aussah, und vergleicht nach einem Update.
// Daraus entstehen Befunde (kaputt, prüfen, neu), ein Vorschlag für die neue Fassung des Case und die Nutzerkarte „Was ist neu“.
// Die Karte der Anwendung kommt über das Appilot-Protokoll aus der Anwendung (readApp) oder aus einer Datei (readMapFile).
(function () {
  const LEVELS = { kaputt: "Kaputt", pruefen: "Prüfen", neu: "Neu" };
  const ORDER = { kaputt: 0, pruefen: 1, neu: 2 };

  const Projekt = window.AppilotProjekt;

  // Die Zielanwendung unsichtbar laden und ihre Karte abholen (alle Masken, Felder, Auswahllisten).
  // Antworten nimmt das Studio nur von der Herkunft der Zielanwendung an (Appilot-Protokoll, siehe README).
  async function readApp(timeout = 20000) {
    const p = await Projekt.get();
    const src = Projekt.appUrl(p, { appilot: "play" });
    const origin = Projekt.appOrigin(p);
    return new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      frame.title = "Anwendung lesen";
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1280px;height:800px;border:0;visibility:hidden";
      const id = "upd-" + Date.now().toString(36);
      const done = (fn, v) => { window.removeEventListener("message", onMsg); clearTimeout(timer); frame.remove(); fn(v); };
      const onMsg = e => {
        if (e.origin !== origin || e.source !== frame.contentWindow || !e.data) return;
        if (e.data.appilot === "ready") frame.contentWindow.postMessage({ appilotCmd: "map", id }, origin);
        if (e.data.appilotReply === id) done(resolve, e.data.result);
      };
      const timer = setTimeout(() => done(reject, new Error("Die Zielanwendung antwortet nicht. Ist Appilot dort eingebunden?")), timeout);
      window.addEventListener("message", onMsg);
      frame.src = src;
      document.body.append(frame);
    });
  }

  // Karte aus einer Datei, z. B. von der Browser-Erweiterung oder aus der Anwendung exportiert:
  // { version, screens: [{ id, title }], controls: [{ id, type, label, screen, required, hint, options }] }
  function readMapFile(file) {
    return file.text().then(text => {
      let map;
      try { map = JSON.parse(text); } catch { throw new Error("Die Datei ist kein gültiges JSON."); }
      if (!map || !Array.isArray(map.controls) || !map.controls.length) throw new Error("In der Datei fehlt die Liste der Bedienelemente (controls).");
      if (!map.version) throw new Error("In der Datei fehlt die Version der Anwendung (version).");
      return map;
    });
  }

  const byId = map => Object.fromEntries((map.controls || []).map(c => [c.id, c]));
  const pick = c => ({ type: c.type, label: c.label, screen: c.screen, required: !!c.required, hint: c.hint || "", options: c.options || undefined });

  // Stand bei der Freigabe: die Bedienelemente, die der Case nutzt, und die Pflichtfelder auf seinen Masken.
  function snapshot(c, map) {
    const now = byId(map);
    const controls = {};
    for (const s of c.steps || []) if (now[s.target]) controls[s.target] = pick(now[s.target]);
    const screens = new Set(Object.values(controls).filter(x => x.type !== "button" && x.type !== "tile").map(x => x.screen).filter(Boolean));
    const required = {};
    for (const scr of screens) required[scr] = map.controls.filter(x => x.screen === scr && x.required).map(x => x.id);
    return { version: map.version || "", at: new Date().toISOString(), controls, required };
  }

  const stepsOf = (c, id) => (c.steps || []).map((s, i) => (s.target === id ? i : -1)).filter(i => i >= 0);
  const nums = list => list.map(i => i + 1).join(", ");
  const optName = t => String(t || "").split(" · ").pop();

  // Befunde: was im Case nach dem Update nicht mehr stimmt. Liefert null, wenn kein Vergleichsstand da ist.
  function diff(c, map) {
    const snap = c.snapshot;
    if (!snap) return null;
    const now = byId(map);
    const out = [];
    for (const [id, old] of Object.entries(snap.controls)) {
      const cur = now[id];
      const used = stepsOf(c, id);
      const where = used.length ? " (Schritt " + nums(used) + ")" : "";
      const hash = used.length ? c.steps[used[0]].hash || "" : "";
      const base = { target: id, label: old.label, steps: used, hash };
      if (!cur) {
        out.push(Object.assign({}, base, { level: "kaputt", kind: "removed", type: old.type, text: "„" + old.label + "“ gibt es in der Anwendung nicht mehr" + where + "." }));
        continue;
      }
      if (cur.label !== old.label) out.push(Object.assign({}, base, { level: "pruefen", kind: "label", before: old.label, after: cur.label, text: "Das Feld „" + old.label + "“ heißt jetzt „" + cur.label + "“" + where + "." }));
      if (cur.screen !== old.screen) out.push(Object.assign({}, base, { level: "pruefen", kind: "screen", before: old.screen, after: cur.screen, text: "„" + cur.label + "“ steht jetzt auf einer anderen Maske" + where + "." }));
      if ((cur.hint || "") !== (old.hint || "")) out.push(Object.assign({}, base, { level: "pruefen", kind: "hint", label: cur.label, before: old.hint, after: cur.hint, text: "„" + cur.label + "“ hat einen neuen Hilfetext: " + (cur.hint || "(leer)") }));
      for (const i of used) {
        const s = c.steps[i];
        if (s.action !== "select" || !s.value) continue;
        const was = (old.options || []).find(o => o.value === s.value);
        const is = (cur.options || []).find(o => o.value === s.value);
        if (!is) out.push(Object.assign({}, base, { level: "kaputt", kind: "option", steps: [i], value: s.value, before: was ? was.text : s.value, text: "Die Auswahl „" + (was ? was.text : s.value) + "“ in „" + cur.label + "“ gibt es nicht mehr (Schritt " + (i + 1) + ")." }));
        else if (was && was.text !== is.text) out.push(Object.assign({}, base, { level: "pruefen", kind: "option-text", steps: [i], value: s.value, before: was.text, after: is.text, text: "Die Auswahl „" + was.text + "“ heißt jetzt „" + is.text + "“ (Schritt " + (i + 1) + ")." }));
      }
    }
    for (const [scr, ids] of Object.entries(snap.required || {})) {
      const known = new Set(ids);
      for (const cur of map.controls.filter(x => x.screen === scr && x.required && !known.has(x.id) && !snap.controls[x.id])) {
        // Nach der letzten Eingabe auf dieser Maske einfügen, also vor Weiter oder Speichern, sonst nach dem letzten Schritt.
        let after = -1, lastInput = -1;
        (c.steps || []).forEach((s, i) => {
          if (!snap.controls[s.target] || snap.controls[s.target].screen !== scr) return;
          after = i;
          if (s.action !== "click") lastInput = i;
        });
        if (lastInput >= 0) after = lastInput;
        out.push({ level: "neu", kind: "required", target: cur.id, label: cur.label, type: cur.type, hint: cur.hint || "", options: cur.options || [], after, steps: [], hash: after >= 0 ? c.steps[after].hash || "" : "",
          text: "Neues Pflichtfeld „" + cur.label + "“" + (after >= 0 ? " nach Schritt " + (after + 1) : "") + ". Ohne Eingabe kommt man nicht weiter." });
      }
    }
    return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  }

  // Vorschlag für die neue Fassung: Schritte angepasst, entfallene entfernt, neue Pflichtfelder eingefügt.
  function propose(c, findings) {
    const steps = (c.steps || []).map(s => Object.assign({}, s));
    const changes = [];
    const drop = new Set();
    const inserts = {};
    const mark = (s, how) => { if (!s.upd) s.upd = how; };
    for (const f of findings) {
      if (f.kind === "label") for (const i of f.steps) {
        const s = steps[i];
        s.label = f.after;
        const hit = s.title.includes(f.before) || (s.text || "").includes(f.before);
        s.title = s.title.split(f.before).join(f.after);
        s.text = hit ? (s.text || "").split(f.before).join(f.after) : ((s.text || "").replace(/\s*$/, "") + " Das Feld heißt jetzt „" + f.after + "“.").trim();
        mark(s, "geändert");
        changes.push({ level: f.level, text: "Schritt " + (i + 1) + ": neuer Feldname „" + f.after + "“ übernommen." });
      }
      if (f.kind === "option-text") for (const i of f.steps) {
        const s = steps[i];
        if (s.valueText) s.valueText = f.after;
        const a = optName(f.before), b = optName(f.after);
        if (a !== b) { s.title = s.title.split(a).join(b); s.text = (s.text || "").split(a).join(b); }
        mark(s, "geändert");
        changes.push({ level: f.level, text: "Schritt " + (i + 1) + ": Auswahl heißt jetzt „" + f.after + "“." });
      }
      if (f.kind === "hint" && f.steps.length) {
        for (const i of f.steps) steps[i].hint = f.after;
        changes.push({ level: f.level, text: (f.steps.length === 1 ? "Schritt " : "Schritte ") + nums(f.steps) + ": neuen Hilfetext von „" + f.label + "“ prüfen. Erklärt der Text noch alles?" });
      }
      if (f.kind === "screen") for (const i of f.steps) changes.push({ level: f.level, text: "Schritt " + (i + 1) + ": steht jetzt auf einer anderen Maske. Bitte mit dem Probelauf prüfen." });
      if (f.kind === "removed") for (const i of f.steps) {
        drop.add(i);
        changes.push({ level: f.level, text: "Schritt " + (i + 1) + " „" + steps[i].title + "“ entfernt, das Bedienelement gibt es nicht mehr." });
      }
      if (f.kind === "option") for (const i of f.steps) {
        mark(steps[i], "prüfen");
        changes.push({ level: f.level, text: "Schritt " + (i + 1) + ": bitte eine neue Auswahl festlegen." });
      }
      if (f.kind === "required" && f.after >= 0) {
        const first = (f.options || [])[0];
        const action = f.type === "select" ? "select" : f.type === "checkbox" || f.type === "radio" ? "check" : "input";
        const s = {
          id: "u-" + f.target, hash: steps[f.after].hash || "", target: f.target, action,
          value: action === "select" ? (first ? first.value : "") : action === "check" ? "true" : "",
          valueText: action === "select" && first ? first.text : "", label: f.label, hint: f.hint, screen: steps[f.after].screen,
          title: action === "select" ? f.label + " wählen" : action === "check" ? "„" + f.label + "“ ankreuzen" : f.label + " eintragen",
          text: f.hint || "", upd: "neu",
        };
        (inserts[f.after] = inserts[f.after] || []).push(s);
        changes.push({ level: f.level, text: "Neuer Schritt nach Schritt " + (f.after + 1) + ": „" + s.title + "“." });
      }
    }
    const out = [];
    steps.forEach((s, i) => {
      if (!drop.has(i)) out.push(s);
      (inserts[i] || []).forEach(x => out.push(x));
    });
    return { steps: out, changes };
  }

  // Nutzerkarte „Was ist neu“: eine Zeile pro Änderung, mit Ziel für den Zeiger. Der Fachbereich passt die Texte an.
  function newsItems(findings) {
    const seen = new Set();
    const items = [];
    const rank = { required: 0, label: 1, removed: 2, hint: 3, "option-text": 4, screen: 5 };
    for (const f of findings.slice().sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9))) {
      const key = f.kind + ":" + f.target + ":" + (f.value || "");
      if (seen.has(key) || f.kind === "option") continue;
      seen.add(key);
      const item = { target: f.kind === "removed" ? "" : f.target, hash: f.hash || "" };
      if (f.kind === "required") Object.assign(item, { title: "Neues Pflichtfeld „" + f.label + "“", text: f.hint || "Dieses Feld muss jetzt ausgefüllt werden." });
      if (f.kind === "label") Object.assign(item, { title: "Neuer Name: „" + f.after + "“", text: "Das Feld „" + f.before + "“ heißt jetzt „" + f.after + "“. Eingetragen wird dasselbe wie bisher." });
      if (f.kind === "removed") Object.assign(item, { title: "„" + f.label + "“ entfällt", text: "Die Schaltfläche „" + f.label + "“ gibt es nicht mehr." });
      if (f.kind === "hint") Object.assign(item, { title: "„" + f.label + "“ macht jetzt mehr", text: f.after });
      if (f.kind === "option-text") Object.assign(item, { title: "Auswahl umbenannt", text: "„" + f.before + "“ heißt jetzt „" + f.after + "“." });
      if (f.kind === "screen") Object.assign(item, { title: "„" + f.label + "“ ist umgezogen", text: "Sie finden das Feld jetzt auf einer anderen Maske." });
      items.push(item);
    }
    // Für die Tour nach Masken sortiert, damit der Zeiger nicht hin und her springt.
    return items.map((x, i) => [x, i]).sort((a, b) => (a[0].hash || "~").localeCompare(b[0].hash || "~") || a[1] - b[1]).map(([x]) => x);
  }

  window.AppilotUpdate = { LEVELS, readApp, readMapFile, snapshot, diff, propose, newsItems };
})();
