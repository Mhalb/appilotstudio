// Lernstrecken-Seite: Übersicht, Bausteine Schritt für Schritt, Übungen mit Feedback, Praxis in der Zielanwendung, Lernbegleiter.
(function () {
  const API = window.APPILOT_API || "/api/appilot";
  const TTS = window.APPILOT_TTS || "/api/tts";
  const Store = window.AppilotStore;
  // Im SCORM-Paket: eine Lernstrecke, Fortschritt im LMS, ohne Tutor und Vorlesen.
  const PKG = window.APPILOT_PACKAGE || null;
  // Zielanwendung für die Praxis: im Studio aus den Projekteinstellungen, im SCORM-Paket aus dem Export.
  let appBase = PKG ? PKG.online || "" : "";
  let appName = (PKG && PKG.appName) || "die Anwendung";
  let project = null;
  const appLink = caseId => {
    if (!appBase) return null;
    const u = new URL(appBase);
    if (caseId) u.searchParams.set("appilotCase", caseId);
    return u.toString();
  };
  const LMS = window.AppilotScorm;
  const K = window.AppilotKurs;
  const $ = id => document.getElementById(id);
  const app = $("app");

  let courses = [];
  let cases = [];
  let kb = [];
  let course = null;   // aktuelle Lernstrecke
  let state = null;    // Fortschritt { i, done: { blockId: true }, check: { score, total } }
  let preview = false;
  let objectUrl = null;

  // Kleiner Helfer, um DOM ohne innerHTML für Inhalte zu bauen.
  function el(tag, props = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k in e && typeof v !== "string") e[k] = v;
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) put(e, c.nodeType ? c : String(c));
    return e;
  }
  // replaceChildren ohne leere Teile (sonst stünde „null“ auf der Seite).
  const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
  const put = (node, ...kids) => node.append(...kids.flat().filter(k => k != null && k !== false));
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const fmtNum = n => Number(n).toLocaleString("de-DE", { maximumFractionDigits: 2 });

  // ---------------------------------------------------------------------------
  // Fortschritt (pro Lernstrecke und Version im Browser)
  // ---------------------------------------------------------------------------
  const key = c => "appilot-lernen:" + c.id + ":v" + (c.version || 1);
  function loadState(c) {
    if (PKG) { const s = LMS.load(); return s && s.done ? s : { i: 0, done: {}, check: null }; }
    if (!preview) try { const s = JSON.parse(localStorage.getItem(key(c))); if (s && s.done) return s; } catch {}
    return { i: 0, done: {}, check: null };
  }
  function saveState() {
    if (preview || !course) return;
    if (PKG) return LMS.save(state, course);
    try { localStorage.setItem(key(course), JSON.stringify(state)); } catch {}
  }
  function peekProgress(c) {
    try {
      const s = JSON.parse(localStorage.getItem(key(c)));
      const n = (c.blocks || []).length;
      return s && n ? Math.min(1, Object.keys(s.done || {}).filter(id => c.blocks.some(b => b.id === id)).length / n) : 0;
    } catch { return 0; }
  }
  // Abgeschlossene Lernstrecke von vorn: Fortschritt löschen, die Seite lädt sie dann frisch.
  function restart(c) {
    try { localStorage.removeItem(key(c)); } catch {}
    if (course && course.id === c.id) course = null;
  }
  function markDone(b) {
    if (state.done[b.id]) return;
    state.done[b.id] = true;
    saveState();
    renderSide();
  }

  // ---------------------------------------------------------------------------
  // Vorlesen (ElevenLabs über /api/tts), Einstellung geteilt mit Appilot in der Anwendung
  // ---------------------------------------------------------------------------
  const voice = {
    on: !PKG && (() => { try { return localStorage.getItem("appilot-voice") === "1"; } catch { return false; } })(),
    cache: new Map(), audio: null, current: "", button: null,
  };
  function renderVoice() {
    $("voice").setAttribute("aria-pressed", String(voice.on));
    $("voice").textContent = voice.on ? "🔊 Vorlesen an" : "🔇 Vorlesen aus";
  }
  $("voice").addEventListener("click", () => {
    voice.on = !voice.on;
    try { localStorage.setItem("appilot-voice", voice.on ? "1" : "0"); } catch {}
    renderVoice();
    if (voice.on && course) speakBlock();
    else stopSpeaking();
  });
  function stopSpeaking() {
    if (voice.audio) { voice.audio.pause(); voice.audio = null; }
    voice.current = "";
    document.querySelectorAll(".say.on").forEach(b => { b.classList.remove("on"); b.textContent = "🔊 Vorlesen"; });
  }
  async function speak(text, button) {
    text = (text || "").trim();
    stopSpeaking();
    if (!text) return;
    voice.current = text;
    if (button) { button.classList.add("on"); button.textContent = "■ Stopp"; }
    try {
      let url = voice.cache.get(text);
      if (!url) {
        const res = await fetch(TTS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        if (!res.ok) throw new Error("tts " + res.status);
        url = URL.createObjectURL(await res.blob());
        voice.cache.set(text, url);
      }
      if (voice.current !== text) return;
      const a = new Audio(url);
      voice.audio = a;
      a.onended = () => { if (voice.audio === a) stopSpeaking(); };
      await a.play();
    } catch (err) {
      console.warn("Appilot: Vorlesen nicht möglich", err);
      if (voice.current === text) stopSpeaking();
    }
  }
  // Was zu einem Baustein vorgelesen wird.
  function narration(b) {
    const parts = [b.title];
    if (b.type === "szenario") parts.push(b.text);
    else if (b.type === "erklaerung") {
      parts.push(b.text);
      (b.points || []).forEach(p => parts.push(p.head + ". " + p.text));
      if (b.merksatz) parts.push("Merksatz: " + b.merksatz);
    } else if (b.type === "praxis") parts.push(b.text);
    else if (b.type === "spickzettel") (b.punkte || []).forEach(p => parts.push(p));
    else parts.push(b.frage);
    return parts.filter(Boolean).join(". ").replace(/\.\s*\./g, ".");
  }
  function speakBlock() {
    const b = course && course.blocks[state.i];
    if (!b) return;
    // Erklärungen mit Video haben ihren eigenen Sprecher.
    if (b.type === "erklaerung" && b.videoId) return;
    speak(narration(b), document.querySelector(".blockcard .say"));
  }

  // ---------------------------------------------------------------------------
  // Laden und Navigation über #k=<id>
  // ---------------------------------------------------------------------------
  async function load() {
    if (PKG) { courses = [PKG.course]; cases = PKG.cases || []; return; }
    project = await window.AppilotProjekt.get();
    appBase = project.url;
    appName = window.AppilotProjekt.appName(project);
    const toApp = $("toApp");
    if (toApp && appBase) { toApp.href = appBase; toApp.textContent = appName + " ↗"; toApp.hidden = false; }
    courses = await Store.courses.all();
    cases = await Store.cases.all();
    kb = await Store.kb.all();
  }
  function visible(c) {
    return c.status === "freigegeben";
  }
  async function route() {
    stopSpeaking();
    const p = new URLSearchParams(location.hash.slice(1));
    const id = PKG ? PKG.course.id : p.get("k");
    preview = !PKG && p.get("vorschau") === "1";
    const c = id && courses.find(x => x.id === id);
    if (p.has("hilfe") && !PKG) {
      course = null;
      state = null;
      renderHelp(p.get("e"));
    } else if (c && (visible(c) || preview)) {
      if (!course || course.id !== c.id || course.version !== c.version) {
        state = loadState(c);
        // Fortsetzen nach dem Abschluss: beim ersten offenen Schritt weitermachen.
        if (state.finished) {
          state.finished = false;
          state.i = Math.max(0, c.blocks.findIndex(b => !state.done[b.id]));
        }
      }
      course = c;
      if (state.i >= c.blocks.length) state.i = Math.max(0, c.blocks.length - 1);
      renderCourse();
    } else {
      course = null;
      state = null;
      renderOverview(id && !c ? "Diese Lernstrecke gibt es nicht mehr." : id ? "Diese Lernstrecke ist noch nicht freigegeben." : "");
    }
    $("tutorFab").hidden = PKG || !course || !$("tutor").hidden;
    if (!course) $("tutor").hidden = true;
  }
  window.addEventListener("hashchange", route);

  // Änderungen aus dem Lern-Editor übernehmen, ohne laufende Übungen zurückzusetzen.
  if (!PKG) Store.onChange(async name => {
    if (name !== "courses" && name !== "cases" && name !== "kb") return;
    await load();
    if (!course) {
      // Laufendes Video in der Hilfe nicht unterbrechen.
      if (new URLSearchParams(location.hash.slice(1)).get("e") && document.querySelector("video")) return;
      return route();
    }
    const c = courses.find(x => x.id === course.id);
    if (!c || (!visible(c) && !preview) || c.version !== course.version) return route();
    const b = course.blocks[state.i];
    course = c;
    renderSide();
    if (b && ["szenario", "erklaerung", "spickzettel"].includes(b.type)) renderBlock();
  });

  // ---------------------------------------------------------------------------
  // Übersicht
  // ---------------------------------------------------------------------------
  function renderOverview(message) {
    document.title = "Lernstrecken · Appilot";
    const list = courses.filter(visible).sort((a, b) => a.title.localeCompare(b.title, "de"));
    fill(app, 
      tabs("lernen"),
      el("section", { class: "hero" },
        el("h1", {}, "Grundlagen lernen"),
        el("p", {}, "Kurze Lernstrecken für den Einstieg: Sie starten mit einem echten Auftrag, lernen das Nötige in Erklärvideos und Übungen und erledigen den Auftrag am Ende selbst in " + appName + ", begleitet von Appilot.")),
      message ? el("div", { class: "banner" }, message) : null,
      list.length ? el("div", { class: "cards" }, list.map(c => {
        const p = peekProgress(c);
        return el("article", { class: "ccard" },
          el("div", { class: "meta" }, el("span", { class: "pill" }, "Lernstrecke"), el("span", {}, "⏱ " + (c.minutes || K.estimate(c)) + " Minuten"), el("span", {}, c.blocks.length + " Schritte")),
          el("h2", {}, c.title),
          c.audience ? el("div", { class: "meta" }, "Für: " + c.audience) : null,
          c.goal ? el("p", { class: "goal" }, c.goal) : null,
          el("div", { class: "foot" },
            el("a", { class: "btn", href: "#k=" + encodeURIComponent(c.id), onclick: () => { if (p >= 1) restart(c); } }, p >= 1 ? "Wiederholen" : p > 0 ? "Fortsetzen" : "Starten"),
            el("div", { class: "bar", title: Math.round(p * 100) + " % erledigt" }, el("i", { style: "width:" + Math.round(p * 100) + "%" })),
            el("span", { class: "meta" }, Math.round(p * 100) + " %")));
      })) : el("div", { class: "empty" }, "Noch keine Lernstrecke freigegeben. Im Lern-Editor können Sie eine anlegen und zur Fachprüfung geben."),
    );
  }

  // ---------------------------------------------------------------------------
  // Lernstrecke
  // ---------------------------------------------------------------------------
  function tabs(active) {
    return el("nav", { class: "ptabs" },
      el("a", { href: "#", class: active === "lernen" ? "on" : "" }, "🎓 Lernstrecken"),
      el("a", { href: "#hilfe", class: active === "hilfe" ? "on" : "" }, "❓ Hilfe und Anleitungen"));
  }

  // ---------------------------------------------------------------------------
  // Hilfe und Anleitungen: alles Freigegebene aus der Wissensdatenbank, ohne Bearbeiten
  // ---------------------------------------------------------------------------
  let helpQuery = "";
  function helpItems() {
    const out = [];
    const byId = id => kb.find(k => k.id === id);
    for (const c of cases.filter(c => c.status === "freigegeben")) {
      out.push({ id: "case:" + c.id, group: "ablauf", title: c.title, text: c.description || "", caseId: c.id, video: byId("video-" + c.id), guide: byId("anleitung-" + c.id) });
    }
    for (const k of kb) {
      const fromCourse = k.courseId ? courses.find(c => c.id === k.courseId) : null;
      if (k.courseId && !(fromCourse && visible(fromCourse))) continue;
      if (k.kind === "video" && k.courseId) out.push({ id: k.id, group: "erklaer", title: k.title, text: (k.steps || []).map(s => s.title).join(" · "), video: k, course: fromCourse });
      if (k.kind === "notiz") out.push({ id: k.id, group: "notiz", title: k.title, text: k.text || "", note: k, course: fromCourse });
    }
    // Spickzettel freigegebener Lernstrecken, auch wenn er noch nicht in der Wissensdatenbank liegt.
    for (const c of courses.filter(visible)) {
      const sheet = K.cheatSheet(c);
      if (sheet && !out.some(x => x.id === sheet.id)) out.push({ id: sheet.id, group: "notiz", title: sheet.title, text: sheet.text, note: sheet, course: c });
    }
    return out;
  }
  const GROUPS = [
    ["ablauf", "Abläufe in der Anwendung", "Appilot führt Sie Schritt für Schritt durch die Anwendung. Wo vorhanden, gibt es dazu ein Schulungsvideo und eine Klickanleitung zum Ausdrucken."],
    ["erklaer", "Erklärvideos", "Kurze Videos zu den Grundlagen, aus den Lernstrecken."],
    ["notiz", "Spickzettel und Regeln", "Merksätze aus den Lernstrecken und hausinterne Regeln."],
  ];
  const mmss = s => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");

  function renderHelp(openId) {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    const items = helpItems();
    const item = openId && items.find(x => x.id === openId);
    if (item) return renderHelpItem(item);
    document.title = "Hilfe und Anleitungen · Appilot";
    const list = el("div");
    const search = el("input", { class: "hsearch", type: "search", placeholder: "Suchen, z. B. Ablauf, Begriff, Maske …", value: helpQuery, "aria-label": "Hilfe durchsuchen" });
    const draw = () => {
      const q = helpQuery.trim().toLowerCase();
      const hit = x => !q || (x.title + " " + x.text).toLowerCase().includes(q);
      const sections = GROUPS.map(([g, title, sub]) => {
        const xs = items.filter(x => x.group === g && hit(x));
        if (!xs.length) return null;
        return el("section", { class: "hgroup" }, el("h2", {}, title), el("p", { class: "hsub" }, sub), el("div", { class: "hcards" }, xs.map(helpCard)));
      }).filter(Boolean);
      fill(list, ...(sections.length ? sections : [el("div", { class: "empty" }, q ? "Nichts gefunden zu „" + helpQuery + "“. Fragen Sie Appilot in der Anwendung, er hilft auch ohne Eintrag." : "Noch nichts freigegeben.")]));
    };
    search.addEventListener("input", () => { helpQuery = search.value; draw(); });
    draw();
    fill(app, 
      tabs("hilfe"),
      el("section", { class: "hero" },
        el("h1", {}, "Hilfe und Anleitungen"),
        el("p", {}, "Schulungsvideos, Klickanleitungen und Spickzettel an einem Ort. Alles hier ist vom Fachbereich erstellt und freigegeben. Bei Abläufen führt Appilot Sie auf Wunsch direkt in der Anwendung.")),
      search, list);
  }

  function helpCard(x) {
    const badges = [];
    if (x.group === "ablauf") badges.push(el("span", { class: "pill ok" }, "✦ Mit Appilot"));
    if (x.video) badges.push(el("span", { class: "pill" }, "▶ Video" + (x.video.seconds ? " " + mmss(x.video.seconds) : "")));
    if (x.guide) badges.push(el("span", { class: "pill" }, "☰ Klickanleitung"));
    if ((x.video && x.video.stale) || (x.guide && x.guide.stale)) badges.push(el("span", { class: "pill warn", title: "Die Anwendung hat sich geändert. Eine neue Fassung ist in Arbeit." }, "veraltet: zeigt Version " + ((x.video && x.video.stale) || x.guide.stale).from));
    if (x.group === "notiz") badges.push(el("span", { class: "pill" }, x.course ? "📌 Spickzettel" : "✎ Regel"));
    return el("a", { class: "hcard", href: "#hilfe&e=" + encodeURIComponent(x.id) },
      x.video && x.video.poster ? el("img", { src: x.video.poster, alt: "" }) : el("div", { class: "hicon" + (x.group === "notiz" ? " note" : "") }, x.group === "notiz" ? "📌" : x.group === "ablauf" ? "✦" : "▶"),
      el("div", { class: "hbody" },
        el("b", {}, x.title),
        x.text ? el("span", { class: "htext" }, x.text) : null,
        el("div", { class: "hbadges" }, badges)));
  }

  function renderHelpItem(x) {
    document.title = x.title + " · Appilot";
    const body = el("div", { class: "blockcard" },
      el("a", { class: "back", href: "#hilfe" }, "← Alle Hilfen"),
      el("h1", {}, x.title));
    if (x.group === "ablauf") {
      if (x.text) put(body, el("p", { class: "lead" }, x.text));
      put(body, el("div", { class: "practice" },
        el("div", { class: "case" }, el("span", { class: "ico" }, "✦"), el("div", {}, el("b", {}, "Mit Appilot in der Anwendung durchgehen"), el("span", {}, "Appilot öffnet " + appName + " und zeigt Ihnen jeden Klick. Sie arbeiten dabei mit echten Masken."))),
        appBase ? el("div", { class: "row" }, el("a", { class: "btn", href: appLink(x.caseId), target: "zielanwendung" }, "Jetzt starten ↗")) : null));
    } else if (x.course) {
      put(body, el("p", { class: "quelle" }, "Aus der Lernstrecke ", el("a", { href: "#k=" + encodeURIComponent(x.course.id) }, x.course.title)));
    }
    if (x.video && x.video.video) {
      objectUrl = URL.createObjectURL(x.video.video);
      const v = el("video", { class: "video", controls: true, preload: "metadata", playsInline: true });
      if (x.video.poster) v.poster = x.video.poster;
      v.src = objectUrl;
      put(body, el("h2", { class: "hh" }, "Schulungsvideo"), v);
    }
    if (x.group === "erklaer" && x.video.steps) {
      put(body, el("div", { class: "points" }, x.video.steps.map(s => el("div", { class: "point" }, el("b", {}, s.title), el("span", {}, s.text)))));
    }
    if (x.guide && window.AppilotMedia) {
      const frame = el("iframe", { class: "guide", title: "Klickanleitung" });
      frame.srcdoc = window.AppilotMedia.guideHtml(x.guide);
      put(body, el("div", { class: "hrow" }, el("h2", { class: "hh" }, "Klickanleitung"),
        el("button", { type: "button", class: "btn ghost small", onclick: () => frame.contentWindow.print() }, "🖨 Drucken / als PDF")), frame);
    }
    if (x.group === "ablauf" && !x.video && !x.guide) {
      put(body, feedback("info", "", "Für diesen Ablauf gibt es noch kein Video und keine Klickanleitung. Appilot führt Sie trotzdem direkt in der Anwendung."));
    }
    if (x.note) {
      put(body, el("div", { class: "sheet" }, el("p", { class: "lead" }, x.note.text)),
        el("div", { class: "noprint" }, el("button", { type: "button", class: "btn ghost small", onclick: () => window.print() }, "🖨 Drucken")));
    }
    fill(app, tabs("hilfe"), body);
    window.scrollTo({ top: 0 });
  }

  function renderCourse() {
    document.title = course.title + " · Appilot";
    fill(app, 
      el("div", { class: "course" },
        el("aside", { class: "side", id: "side" }),
        el("section", { class: "stage" },
          preview && !visible(course) ? el("div", { class: "banner" }, "Vorschau: Diese Lernstrecke ist noch nicht freigegeben. Lernende sehen sie erst nach der Fachprüfung. Der Fortschritt wird in der Vorschau nicht gespeichert.") : null,
          el("div", { id: "block" }),
          el("div", { class: "nav", id: "nav" }))));
    renderSide();
    if (state.finished) renderFinish(); else renderBlock();
  }

  function renderSide() {
    const side = $("side");
    if (!side) return;
    const n = course.blocks.length;
    const d = course.blocks.filter(b => state.done[b.id]).length;
    const sheet = course.blocks.findIndex(b => b.type === "spickzettel");
    fill(side, 
      PKG ? null : el("a", { class: "back", href: "#" }, "← Alle Lernstrecken"),
      el("h2", {}, course.title),
      el("div", { class: "prog" }, el("div", { class: "bar" }, el("i", { style: "width:" + Math.round(d / n * 100) + "%" })), el("span", {}, d + " von " + n)),
      el("ol", { class: "steps" }, course.blocks.map((b, i) =>
        el("li", { class: (state.done[b.id] ? "done " : "") + (i === state.i && !state.finished ? "cur" : "") },
          el("button", { type: "button", onclick: () => go(i) },
            el("span", { class: "mk" }, state.done[b.id] ? "✓" : String(i + 1)),
            el("span", {}, b.title || K.TYPES[b.type]?.label))))),
      PKG && sheet >= 0 ? el("p", { class: "sidenote" }, "Fragen? Die wichtigsten Merksätze stehen im ",
        el("button", { type: "button", class: "fblink", onclick: () => go(sheet) }, "Spickzettel"), ".") : null);
  }

  function go(i) {
    stopSpeaking();
    state.i = Math.max(0, Math.min(course.blocks.length - 1, i));
    state.finished = false;
    saveState();
    renderSide();
    renderBlock();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const KIND = { szenario: "Ihr Auftrag", erklaerung: "Erklärung", auswahl: "Übung", zuordnen: "Übung", rechnen: "Übung", reihenfolge: "Übung", praxis: "Praxis", check: "Wissenscheck", spickzettel: "Zum Mitnehmen" };
  const EXERCISE = new Set(["auswahl", "zuordnen", "rechnen", "reihenfolge", "praxis", "check"]);

  function renderBlock() {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    if (praxisChannel) { praxisChannel.close(); praxisChannel = null; }
    const b = course.blocks[state.i];
    const body = el("div", { class: "blockcard" });
    const sayBtn = PKG ? null : el("button", { type: "button", class: "say", onclick: e => (e.currentTarget.classList.contains("on") ? stopSpeaking() : speak(narration(b), e.currentTarget)) }, "🔊 Vorlesen");
    put(body, 
      el("div", { class: "eyebrow" }, el("span", {}, (K.TYPES[b.type]?.icon || "") + " " + (KIND[b.type] || "")), el("span", {}, "· Schritt " + (state.i + 1) + " von " + course.blocks.length), sayBtn),
      el("h1", {}, b.title || K.TYPES[b.type]?.label));
    (RENDER[b.type] || (() => {}))(b, body);
    fill($("block"), body);
    renderNav();
    if (!EXERCISE.has(b.type) && b.type !== "erklaerung") markDone(b);
    if (voice.on) setTimeout(speakBlock, 50);
  }

  function renderNav() {
    const b = course.blocks[state.i];
    const last = state.i === course.blocks.length - 1;
    const pending = EXERCISE.has(b.type) && !state.done[b.id];
    fill($("nav"), 
      el("button", { type: "button", class: "btn ghost", disabled: state.i === 0, onclick: () => go(state.i - 1) }, "← Zurück"),
      pending ? el("span", { class: "hint" }, b.type === "praxis" ? "Erledigen Sie den Auftrag in der Anwendung." : "Probieren Sie die Übung aus.") : el("span"),
      el("button", {
        type: "button", class: "btn" + (pending ? " ghost" : ""),
        onclick: () => { if (!EXERCISE.has(b.type)) markDone(b); last ? finish() : go(state.i + 1); },
      }, pending ? "Überspringen →" : last ? "Abschließen ✓" : "Weiter →"));
  }

  function feedback(kind, title, text) {
    return el("div", { class: "feedback " + kind, role: "status" }, title ? el("b", {}, title) : null, text || null);
  }

  // ---------------------------------------------------------------------------
  // Bausteine
  // ---------------------------------------------------------------------------
  let praxisChannel = null;

  const RENDER = {
    szenario(b, body) {
      put(body, el("div", { class: "scenario" }, b.text));
      if (course.goal) put(body, feedback("info", "Ihr Lernziel", course.goal));
    },

    async erklaerung(b, body) {
      if (b.text) put(body, el("p", { class: "lead" }, b.text));
      const pts = el("div", { class: "points" }, (b.points || []).filter(p => p.head || p.text).map(p => el("div", { class: "point" }, el("b", {}, p.head), el("span", {}, p.text))));
      const slot = el("div");
      put(body, slot);
      if (b.merksatz) put(body, el("div", { class: "merk" }, el("small", {}, "Merksatz"), b.merksatz));
      if (b.quelle) put(body, el("div", { class: "quelle" }, "Quelle: " + b.quelle));
      const entry = !b.videoId ? null : PKG ? (PKG.videos || {})[b.videoId] : await Store.kb.get(b.videoId).catch(() => null);
      if (course.blocks[state.i] !== b) return;
      if (entry && entry.video) {
        const v = el("video", { class: "video", controls: true, preload: "metadata", playsInline: true });
        if (entry.poster) v.poster = entry.poster;
        // Im Paket liegt das Video als Datei daneben, sonst als Blob in der Wissensdatenbank.
        v.src = typeof entry.video === "string" ? entry.video : (objectUrl = URL.createObjectURL(entry.video));
        v.addEventListener("play", stopSpeaking);
        v.addEventListener("ended", () => { markDone(b); renderNav(); });
        put(slot, v, el("details", { class: "script" }, el("summary", {}, "Inhalt des Videos als Text"), pts));
      } else put(slot, pts);
      markDone(b);
      renderNav();
    },

    auswahl(b, body) {
      const multi = b.mehrfach || (b.optionen || []).filter(o => o.richtig).length > 1;
      const chosen = new Set();
      put(body, el("p", { class: "lead" }, b.frage), multi ? el("div", { class: "quelle" }, "Mehrere Antworten sind richtig.") : null);
      const opts = el("div", { class: "opts" });
      const out = el("div");
      const check = el("button", { type: "button", class: "btn", disabled: true }, "Antwort prüfen");
      const items = shuffle((b.optionen || []).filter(o => o.text)).map(o => {
        const btn = el("button", { type: "button", class: "opt" + (multi ? " multi" : "") }, el("span", { class: "box" }), el("span", {}, o.text));
        btn.addEventListener("click", () => {
          if (!multi) { chosen.clear(); items.forEach(x => x.btn.classList.remove("sel")); }
          chosen.has(o) ? chosen.delete(o) : chosen.add(o);
          btn.classList.toggle("sel", chosen.has(o));
          check.disabled = !chosen.size;
        });
        put(opts, btn);
        return { o, btn };
      });
      check.addEventListener("click", () => {
        const ok = items.every(({ o }) => !!o.richtig === chosen.has(o));
        items.forEach(({ o, btn }) => {
          btn.disabled = true;
          btn.classList.remove("sel");
          const picked = chosen.has(o);
          if (o.richtig) btn.classList.add("right");
          else if (picked) btn.classList.add("wrong");
          btn.querySelector(".box").textContent = o.richtig ? "✓" : picked ? "✕" : "";
          if ((picked || o.richtig) && o.feedback) put(btn.lastChild, el("span", { class: "fb" }, o.feedback));
        });
        check.remove();
        fill(out, ok ? feedback("ok", "Richtig!") : feedback("bad", "Nicht ganz.", "Die richtige Antwort ist grün markiert."),
          ok ? null : el("button", { type: "button", class: "btn ghost small", onclick: () => renderBlock() }, "Nochmal versuchen"));
        markDone(b);
        renderNav();
      });
      put(body, opts, el("div", {}, check), out);
    },

    zuordnen(b, body) {
      const pairs = (b.paare || []).filter(p => p.links && p.rechts);
      const choices = shuffle(pairs.map(p => p.rechts));
      put(body, el("p", { class: "lead" }, b.frage || "Ordnen Sie zu."));
      const rows = pairs.map(p => {
        const sel = el("select", {}, el("option", { value: "" }, "Bitte wählen …"), choices.map(c => el("option", { value: c }, c)));
        const mark = el("span", { class: "r" });
        const row = el("div", { class: "pairrow" }, el("b", {}, p.links), sel, mark);
        sel.addEventListener("change", () => { row.classList.remove("right", "wrong"); mark.textContent = ""; check.disabled = rows.some(r => !r.sel.value); });
        return { p, sel, row, mark };
      });
      const out = el("div");
      const check = el("button", { type: "button", class: "btn", disabled: true }, "Zuordnung prüfen");
      check.addEventListener("click", () => {
        let right = 0;
        rows.forEach(r => {
          const ok = r.sel.value === r.p.rechts;
          if (ok) right++;
          r.row.classList.add(ok ? "right" : "wrong");
          r.mark.textContent = ok ? "✓" : "✕";
          r.mark.style.color = ok ? "var(--ok)" : "var(--bad)";
        });
        const all = right === rows.length;
        fill(out, all ? feedback("ok", "Alles richtig zugeordnet!") : feedback("bad", right + " von " + rows.length + " richtig.", "Ändern Sie die rot markierten Zuordnungen und prüfen Sie noch einmal."));
        if (all) { rows.forEach(r => { r.sel.disabled = true; }); check.remove(); markDone(b); renderNav(); }
        else if (++attempts >= 2) {
          put(out, el("button", { type: "button", class: "btn ghost small", onclick: () => {
            rows.forEach(r => { r.sel.value = r.p.rechts; r.sel.disabled = true; r.row.className = "pairrow right"; r.mark.textContent = "✓"; r.mark.style.color = "var(--ok)"; });
            check.remove(); fill(out, feedback("info", "Lösung", "So gehört es zusammen.")); markDone(b); renderNav();
          } }, "Lösung anzeigen"));
        }
      });
      let attempts = 0;
      put(body, el("div", { class: "pairs" }, rows.map(r => r.row)), el("div", {}, check), out);
    },

    rechnen(b, body) {
      put(body, el("p", { class: "lead" }, b.frage));
      const input = el("input", { inputmode: "decimal", placeholder: "Ihr Ergebnis", "aria-label": "Ihr Ergebnis" });
      const check = el("button", { type: "button", class: "btn" }, "Ergebnis prüfen");
      const out = el("div");
      let attempts = 0;
      const solve = ok => {
        input.disabled = true;
        check.remove();
        fill(out, feedback(ok ? "ok" : "info", ok ? "Richtig: " + fmtNum(b.loesung) + " " + (b.einheit || "") : "Lösung: " + fmtNum(b.loesung) + " " + (b.einheit || ""), b.erklaerung || ""));
        markDone(b);
        renderNav();
      };
      const run = () => {
        const raw = input.value.trim().replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
        const v = Number(raw);
        if (!raw || Number.isNaN(v)) { fill(out, feedback("bad", "Bitte eine Zahl eingeben.", "Zum Beispiel 1234,50")); return; }
        if (Math.abs(v - Number(b.loesung)) <= (Number(b.toleranz) || 0) + 1e-9) return solve(true);
        attempts++;
        fill(out, feedback("bad", "Noch nicht richtig.", b.hinweis || "Prüfen Sie Ihren Rechenweg."));
        if (attempts >= 2) put(out, el("button", { type: "button", class: "btn ghost small", onclick: () => solve(false) }, "Lösung anzeigen"));
      };
      check.addEventListener("click", run);
      input.addEventListener("keydown", e => { if (e.key === "Enter") run(); });
      put(body, el("div", { class: "calc" }, input, b.einheit ? el("span", { class: "unit" }, b.einheit) : null, check), out);
    },

    reihenfolge(b, body) {
      const right = (b.schritte || []).filter(Boolean);
      let order = shuffle(right);
      if (order.every((s, i) => s === right[i]) && right.length > 1) order = [...order.slice(1), order[0]];
      put(body, el("p", { class: "lead" }, b.frage || "Bringen Sie die Schritte in die richtige Reihenfolge."));
      const list = el("ol", { class: "order" });
      const out = el("div");
      let locked = false;
      const draw = (marks) => {
        fill(list, ...order.map((s, i) => el("li", { class: marks ? (marks[i] ? "right" : "wrong") : "" },
          el("span", { class: "n" }, String(i + 1)), el("span", { class: "t" }, s),
          el("button", { type: "button", "aria-label": "nach oben", disabled: locked || i === 0, onclick: () => move(i, -1) }, "↑"),
          el("button", { type: "button", "aria-label": "nach unten", disabled: locked || i === order.length - 1, onclick: () => move(i, 1) }, "↓"))));
      };
      const move = (i, d) => { [order[i], order[i + d]] = [order[i + d], order[i]]; fill(out, ); draw(); };
      const check = el("button", { type: "button", class: "btn" }, "Reihenfolge prüfen");
      check.addEventListener("click", () => {
        const marks = order.map((s, i) => s === right[i]);
        const ok = marks.every(Boolean);
        if (ok) { locked = true; check.remove(); markDone(b); renderNav(); }
        draw(marks);
        fill(out, ok ? feedback("ok", "Genau so läuft es ab!") : feedback("bad", marks.filter(Boolean).length + " von " + order.length + " Schritten stehen richtig.", "Verschieben Sie die rot markierten Schritte."));
      });
      draw();
      put(body, list, el("div", {}, check), out);
    },

    praxis(b, body) {
      const c = cases.find(x => x.id === b.caseId);
      put(body, el("p", { class: "lead" }, b.text));
      if (!c) { put(body, feedback("bad", "Der Case für diese Übung fehlt.", "Bitte im Lern-Editor einen Case wählen.")); return; }
      const done = !!state.done[b.id];
      const status = el("div");
      const showDone = () => { fill(status, feedback("ok", "Geschafft!", "Sie haben den Auftrag in der Anwendung erledigt.")); manual.hidden = true; };
      const manual = el("button", { type: "button", class: "btn ghost small", onclick: () => { markDone(b); showDone(); renderNav(); } }, "Ich habe es erledigt");
      const box = el("div", { class: "practice" },
        el("div", { class: "case" }, el("span", { class: "ico" }, "✦"), el("div", {}, el("b", {}, c.title), el("span", {}, (c.steps || []).length + " Schritte · Appilot zeigt Ihnen jeden Klick in " + appName))),
        el("div", { class: "row" },
          !appBase ? null : el("a", { class: "btn", href: appLink(c.id), target: "zielanwendung", onclick: () => { if (!state.done[b.id]) fill(status, el("div", { class: "wait" }, el("span", { class: "pulse" }), PKG ? "Appilot führt Sie im anderen Tab durch den Ablauf. Danach klicken Sie hier auf „Ich habe es erledigt“." : "Appilot führt Sie im anderen Tab durch den Ablauf. Danach geht es hier weiter.")); } }, "In der Anwendung üben ↗"),
          manual),
        status);
      put(body, box);
      if (done) showDone();
      if ("BroadcastChannel" in window) {
        praxisChannel = new BroadcastChannel("appilot-learning");
        praxisChannel.onmessage = e => {
          if (e.data && e.data.caseDone === c.id && course.blocks[state.i] === b) { markDone(b); showDone(); renderNav(); window.focus(); }
        };
      }
    },

    check(b, body) {
      const qs = (b.fragen || []).filter(q => q.frage);
      if (b.frage) put(body, el("p", { class: "lead" }, b.frage));
      const picks = new Map();
      const quiz = el("div", { class: "quiz" });
      const out = el("div");
      const check = el("button", { type: "button", class: "btn", disabled: true }, "Auswerten");
      const items = qs.map((q, k) => {
        const opts = (q.optionen || []).filter(o => o.text).map(o => {
          const btn = el("button", { type: "button", class: "opt" }, el("span", { class: "box" }), el("span", {}, o.text));
          btn.addEventListener("click", () => {
            picks.set(q, o);
            opts.forEach(x => x.btn.classList.toggle("sel", x.o === o));
            check.disabled = picks.size < qs.length;
          });
          return { o, btn };
        });
        const expl = el("div");
        put(quiz, el("div", { class: "q" }, el("b", {}, (k + 1) + ". " + q.frage), el("div", { class: "opts" }, opts.map(x => x.btn)), expl));
        return { q, opts, expl };
      });
      check.addEventListener("click", () => {
        let score = 0;
        items.forEach(({ q, opts, expl }) => {
          const pick = picks.get(q);
          if (pick && pick.richtig) score++;
          opts.forEach(({ o, btn }) => {
            btn.disabled = true;
            btn.classList.remove("sel");
            if (o.richtig) { btn.classList.add("right"); btn.querySelector(".box").textContent = "✓"; }
            else if (o === pick) { btn.classList.add("wrong"); btn.querySelector(".box").textContent = "✕"; }
          });
          if (q.erklaerung) put(expl, feedback(pick && pick.richtig ? "ok" : "info", "", q.erklaerung));
        });
        const need = Math.ceil(qs.length * 2 / 3);
        const passed = score >= need;
        state.check = { score, total: qs.length, passed };
        check.remove();
        const pct = qs.length ? score / qs.length : 0;
        fill(out, el("div", { class: "score" },
          el("div", { class: "ring", style: "background:conic-gradient(" + (passed ? "var(--ok)" : "var(--bad)") + " " + Math.round(pct * 360) + "deg,#e3e8ee 0);" }, el("span", { style: "background:#fff;border-radius:50%;width:56px;height:56px;display:grid;place-items:center" }, score + "/" + qs.length)),
          passed ? feedback("ok", "Bestanden!", "Sie haben " + score + " von " + qs.length + " Fragen richtig beantwortet.") : feedback("bad", "Noch nicht bestanden.", "Sie brauchen " + need + " richtige Antworten. Schauen Sie sich die Erklärungen an und versuchen Sie es noch einmal.")),
          passed ? null : el("button", { type: "button", class: "btn ghost small", onclick: () => renderBlock() }, "Nochmal versuchen"));
        if (passed) markDone(b); else saveState();
        renderNav();
      });
      put(body, quiz, el("div", {}, check), out);
    },

    spickzettel(b, body) {
      put(body, el("div", { class: "sheet" }, el("h2", {}, course.title), el("ul", {}, (b.punkte || []).filter(Boolean).map(p => el("li", {}, p)))),
        el("div", { class: "noprint" }, el("button", { type: "button", class: "btn ghost small", onclick: () => window.print() }, "🖨 Drucken"), " ",
          el("span", { class: "quelle" }, "Den Spickzettel kennt auch Appilot in " + appName + ". Fragen Sie dort einfach nach.")));
    },
  };

  function finish() {
    stopSpeaking();
    state.finished = true;
    saveState();
    renderSide();
    renderFinish();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function renderFinish() {
    const n = course.blocks.length;
    const d = course.blocks.filter(b => state.done[b.id]).length;
    const open = course.blocks.map((b, i) => ({ b, i })).filter(x => !state.done[x.b.id]);
    const sheet = course.blocks.findIndex(b => b.type === "spickzettel");
    const praxis = course.blocks.find(b => b.type === "praxis");
    fill($("block"), el("div", { class: "blockcard finish" },
      el("div", { class: "big" }, open.length ? "👍" : "🎉"),
      el("h1", {}, open.length ? "Fast geschafft" : "Lernstrecke abgeschlossen"),
      el("p", { class: "lead" }, d + " von " + n + " Schritten erledigt" + (state.check ? ", Wissenscheck " + state.check.score + " von " + state.check.total + (state.check.passed ? " (bestanden)" : " (noch nicht bestanden)") : "") + "."),
      open.length ? el("div", { class: "row" }, open.slice(0, 4).map(x => el("button", { type: "button", class: "btn ghost small", onclick: () => go(x.i) }, "Offen: " + (x.b.title || K.TYPES[x.b.type].label)))) : null,
      el("div", { class: "row" },
        sheet >= 0 ? el("button", { type: "button", class: "btn ghost", onclick: () => go(sheet) }, "📌 Spickzettel") : null,
        praxis && appBase ? el("a", { class: "btn ghost", href: appLink(), target: "zielanwendung" }, "Zur Anwendung ↗") : null,
        el("button", { type: "button", class: "btn ghost", onclick: () => { state = { i: 0, done: {}, check: null }; saveState(); renderCourse(); } }, "Von vorn beginnen"),
        PKG ? null : el("a", { class: "btn", href: "#" }, "Alle Lernstrecken"))));
    fill($("nav"), );
  }

  // ---------------------------------------------------------------------------
  // Lernbegleiter: Rückfragen an Appilot zur aktuellen Lernstrecke
  // ---------------------------------------------------------------------------
  const chat = [];
  $("tutorFab").addEventListener("click", () => {
    $("tutor").hidden = false;
    $("tutorFab").hidden = true;
    if (!$("tutorLog").children.length) {
      bot("Hallo! Ich begleite Sie durch „" + course.title + "“. Fragen Sie mich, wenn ein Begriff oder Schritt unklar ist.");
      put($("tutorLog"), el("div", { class: "tutor-chips" }, ["Worum geht es in diesem Schritt?", "Können Sie das an einem Beispiel erklären?", "Was wird hier oft falsch gemacht?"].map(q => el("button", { type: "button", onclick: () => ask(q) }, q))));
    }
    $("tutorInput").focus();
  });
  $("tutorClose").addEventListener("click", () => { $("tutor").hidden = true; $("tutorFab").hidden = !course; });
  $("tutorForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = $("tutorInput").value.trim();
    if (q) ask(q);
  });
  function bot(text, cls) {
    const m = el("div", { class: "msg bot " + (cls || "") }, text);
    put($("tutorLog"), m);
    $("tutorLog").scrollTop = $("tutorLog").scrollHeight;
    return m;
  }
  async function ask(q) {
    $("tutorInput").value = "";
    $("tutorLog").querySelector(".tutor-chips")?.remove();
    put($("tutorLog"), el("div", { class: "msg me" }, q));
    chat.push({ role: "user", content: q });
    const wait = bot("Appilot denkt nach …", "typing");
    const b = course.blocks[state.i];
    let text;
    try {
      const res = await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "tutor", messages: chat, course, current: (b && b.title) || "", lang: window.AppilotSprache ? window.AppilotSprache.get() : "de",
          project: project ? { app: project.name, audience: project.audience } : undefined }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      text = (await res.json()).text;
      if (!text) throw new Error("leere Antwort");
    } catch (err) {
      console.warn("Appilot: Lernbegleiter offline", err);
      text = offline(q);
    }
    wait.remove();
    chat.push({ role: "assistant", content: text });
    bot(text);
    if (voice.on) speak(text);
  }

  // Ohne KI-Verbindung: passende Stelle aus der Lernstrecke heraussuchen.
  const STOP = new Set("aber auch dann dass dein denn der die das dem den des ein eine einen einer eines für hat ich ist kann mit nicht noch oder sich sind und von was warum wie wieso weshalb wer wo zu zum zur bei beim muss werden wird welche welcher welches mir mich man".split(" "));
  const words = s => (s || "").toLowerCase().replace(/[^a-zäöüß0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  function offline(q) {
    const want = words(q);
    const pieces = [];
    for (const b of course.blocks) {
      if (b.type === "erklaerung") {
        (b.points || []).forEach(p => pieces.push({ t: b.title, text: p.head + ": " + p.text }));
        if (b.merksatz) pieces.push({ t: b.title, text: b.merksatz });
      }
      if (b.type === "szenario") pieces.push({ t: b.title, text: b.text });
      if (b.type === "spickzettel") (b.punkte || []).forEach(p => pieces.push({ t: b.title, text: p }));
      if (b.type === "zuordnen") (b.paare || []).forEach(p => pieces.push({ t: b.title, text: p.links + ": " + p.rechts }));
    }
    const score = p => {
      const have = words(p.text);
      return want.reduce((s, w) => s + (have.some(h => h.startsWith(w.slice(0, Math.max(4, w.length - 2))) || w.startsWith(h.slice(0, Math.max(4, h.length - 2)))) ? 1 : 0), 0);
    };
    const best = pieces.map(p => ({ p, s: score(p) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2);
    if (!best.length) return "Dazu finde ich in dieser Lernstrecke nichts. Schauen Sie in die Erklärungen oder fragen Sie die zuständige Fachabteilung. (Appilot ist gerade ohne KI-Verbindung und antwortet nur aus der Lernstrecke.)";
    return "Dazu steht in der Lernstrecke:\n" + best.map(x => "• " + x.p.text + " (" + x.p.t + ")").join("\n") + "\n\n(Appilot ist gerade ohne KI-Verbindung und antwortet nur aus der Lernstrecke.)";
  }

  renderVoice();
  load().then(route);
})();
