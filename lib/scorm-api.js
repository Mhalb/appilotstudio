// SCORM 1.2 im exportierten Paket: Fortschritt, Ergebnis und Status an das LMS melden.
// Ohne LMS (Paket direkt im Browser geöffnet) bleibt der Fortschritt im Browser.
(function () {
  function findAPI(win) {
    for (let n = 0; win && n < 10; n++) {
      try { if (win.API) return win.API; } catch { return null; }
      if (win.parent === win) break;
      win = win.parent;
    }
    return null;
  }
  const api = findAPI(window) || (window.opener ? findAPI(window.opener) : null);
  const ok = r => String(r) === "true";
  const get = k => (api ? String(api.LMSGetValue(k) || "") : "");
  const set = (k, v) => { if (api) api.LMSSetValue(k, String(v)); };

  let started = false;
  let finished = false;
  let status = "";       // zuletzt gemeldeter Status, wird nie herabgestuft
  const t0 = Date.now();
  const localKey = "appilot-scorm:" + location.pathname;

  function start() {
    if (started || !api) return;
    started = ok(api.LMSInitialize(""));
    status = get("cmi.core.lesson_status");
    if (!status || status === "not attempted") {
      status = "incomplete";
      set("cmi.core.lesson_status", status);
      api.LMSCommit("");
    }
  }

  function load() {
    start();
    try { return JSON.parse(api ? get("cmi.suspend_data") : localStorage.getItem(localKey)); } catch { return null; }
  }

  // Status aus dem Fortschritt: mit Wissenscheck bestanden oder nicht bestanden, sonst abgeschlossen.
  function lessonStatus(state, course) {
    const hasCheck = course.blocks.some(b => b.type === "check");
    const allDone = course.blocks.every(b => state.done[b.id]);
    if (hasCheck) {
      if (state.check && state.check.passed) return "passed";
      if (state.finished && state.check) return "failed";
      return "incomplete";
    }
    return allDone || state.finished ? "completed" : "incomplete";
  }

  function save(state, course) {
    if (!api) { try { localStorage.setItem(localKey, JSON.stringify(state)); } catch {} return; }
    start();
    set("cmi.suspend_data", JSON.stringify(state));
    set("cmi.core.lesson_location", String(state.i || 0));
    if (state.check && state.check.total) {
      set("cmi.core.score.min", 0);
      set("cmi.core.score.max", 100);
      set("cmi.core.score.raw", Math.round(state.check.score / state.check.total * 100));
    }
    const next = lessonStatus(state, course);
    // Einmal bestanden oder abgeschlossen bleibt es, auch wenn jemand von vorn beginnt.
    const final = s => s === "passed" || s === "completed";
    if (!final(status) && next !== status && !(status === "failed" && next === "incomplete")) {
      status = next;
      set("cmi.core.lesson_status", status);
    }
    set("cmi.core.exit", state.finished ? "" : "suspend");
    api.LMSCommit("");
  }

  function sessionTime() {
    const s = Math.round((Date.now() - t0) / 1000);
    const p = n => String(n).padStart(2, "0");
    return String(Math.floor(s / 3600)).padStart(4, "0") + ":" + p(Math.floor(s / 60) % 60) + ":" + p(s % 60);
  }
  function finish() {
    if (!api || !started || finished) return;
    finished = true;
    set("cmi.core.session_time", sessionTime());
    api.LMSCommit("");
    api.LMSFinish("");
  }
  window.addEventListener("pagehide", finish);
  window.addEventListener("beforeunload", finish);

  window.AppilotScorm = { connected: !!api, load, save, finish };
})();
