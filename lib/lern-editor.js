// Lern-Editor: Lernstrecken entwerfen, Bausteine bearbeiten, fachlich freigeben, Erklärvideos erzeugen.
(function () {
  const API = window.APPILOT_API || "/api/appilot";
  const Store = window.AppilotStore;
  const Media = window.AppilotMedia;
  const K = window.AppilotKurs;
  const Projekt = window.AppilotProjekt;
  const $ = id => document.getElementById(id);
  const STATUS = { entwurf: "Entwurf", pruefung: "In Fachprüfung", freigegeben: "Freigegeben" };
  const PEOPLE = { autor: "Maria Sommer", pruefer: "Jens Albrecht" };

  let projekt = Projekt.DEFAULTS;  // Zielanwendung und Zielgruppe, siehe lib/projekt.js
  let courses = [];
  let cases = [];
  let current = null;
  let busy = false;
  let saving = 0;
  let saveTimer = null;
  const open = new Set();
  let role = "autor";
  try { role = localStorage.getItem("appilot-role") || "autor"; } catch {}
  $("role").value = role;

  const fmtDate = iso => new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

  // Kleiner Helfer, um DOM ohne innerHTML für Nutzertexte zu bauen.
  function el(tag, props = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k in e && typeof v !== "string") e[k] = v;
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
    return e;
  }

  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 3600);
  }
  function note(text, kind) {
    $("kNote").textContent = text;
    $("kNote").className = "note " + (kind || "");
    $("kNote").hidden = !text;
  }
  function progress(p) {
    $("progress").hidden = p == null;
    $("progressBar").style.width = Math.round((p || 0) * 100) + "%";
  }

  $("role").addEventListener("change", () => {
    role = $("role").value;
    try { localStorage.setItem("appilot-role", role); } catch {}
    renderDetail();
  });

  // ---------------------------------------------------------------------------
  // Laden und Liste
  // ---------------------------------------------------------------------------
  async function load() {
    projekt = await Projekt.get();
    courses = (await Store.courses.all()).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    cases = await Store.cases.all();
    if (current) current = courses.find(c => c.id === current.id) || null;
    const want = new URLSearchParams(location.hash.slice(1)).get("k");
    if (!current && want) current = courses.find(c => c.id === want) || null;
    renderList();
    renderDetail();
  }
  Store.onChange(name => { if ((name === "courses" || name === "cases") && !busy && !saving) load(); });

  function renderList() {
    const ul = $("courseList");
    ul.replaceChildren(...courses.map(c => el("li", { class: current && current.id === c.id ? "active" : "", onclick: () => select(c.id) },
      el("b", {}, c.title),
      el("span", {}, el("span", { class: "badge " + c.status }, STATUS[c.status]), " " + (c.blocks || []).length + " Bausteine · ca. " + (c.minutes || K.estimate(c)) + " Min."))));
    if (!courses.length) ul.append(el("li", { class: "none" }, "Noch keine Lernstrecken."));
  }
  function select(id) {
    current = courses.find(c => c.id === id) || null;
    open.clear();
    note("");
    $("draftPanel").hidden = true;
    history.replaceState(null, "", "#k=" + encodeURIComponent(id));
    renderList();
    renderDetail();
  }

  function editable() {
    return current && current.status === "entwurf" && role === "autor";
  }

  function save(now) {
    clearTimeout(saveTimer);
    if (!current) return;
    current.updated = new Date().toISOString();
    const snapshot = structuredClone(current);
    const run = async () => {
      saving++;
      try { await Store.courses.put(snapshot); } finally { saving--; }
      const i = courses.findIndex(c => c.id === snapshot.id);
      if (i >= 0) courses[i] = current; else courses.unshift(current);
      renderList();
    };
    if (now) return run();
    saveTimer = setTimeout(run, 400);
  }

  // ---------------------------------------------------------------------------
  // Detail
  // ---------------------------------------------------------------------------
  function renderDetail() {
    $("emptyDetail").hidden = !!current;
    $("courseForm").hidden = !current;
    if (!current) return;
    const c = current;
    const canEdit = editable();
    $("kTitle").value = c.title;
    $("kAudience").value = c.audience || "";
    $("kGoal").value = c.goal || "";
    $("kMinutes").value = c.minutes || K.estimate(c);
    ["kTitle", "kAudience", "kGoal", "kMinutes"].forEach(id => { $(id).disabled = !canEdit; });
    $("kStatus").textContent = STATUS[c.status];
    $("kStatus").className = "badge " + c.status;
    $("kMeta").textContent = "Version " + (c.version || 0) + " · Autorin " + (c.author || PEOPLE.autor) + (c.reviewer ? " · fachlich freigegeben von " + c.reviewer : "") + " · geändert " + fmtDate(c.updated);
    $("btnPreview").href = "/lernen.html#k=" + encodeURIComponent(c.id) + (c.status === "freigegeben" ? "" : "&vorschau=1");
    ["btnDraft", "btnScaffold", "addType", "btnDelete"].forEach(id => { $(id).disabled = !canEdit || busy; });
    // Videos setzen nur den geprüften Text um und dürfen deshalb auch für freigegebene Lernstrecken neu erzeugt werden.
    $("btnVideos").disabled = busy || role !== "autor" || c.status === "pruefung" || !(c.blocks || []).some(b => b.type === "erklaerung");
    renderFlow();
    renderBlocks();
  }

  function renderFlow() {
    const c = current;
    const list = K.issues(c, cases);
    const blocking = list.some(i => i.level === "fehlt");
    const order = ["entwurf", "pruefung", "freigegeben"];
    const box = $("kFlow");
    box.replaceChildren(el("ol", { class: "flowline" }, order.map(s => el("li", { class: s === c.status ? "on" : order.indexOf(s) < order.indexOf(c.status) ? "past" : "" }, STATUS[s]))));
    const actions = el("div", { class: "flow-actions" });
    if (c.status === "entwurf") {
      if (role === "autor") actions.append(el("button", { type: "button", class: "btn", disabled: blocking, onclick: () => setStatus("pruefung") }, "Zur Fachprüfung geben"));
      else actions.append(el("span", { class: "info" }, "In Bearbeitung bei " + (c.author || PEOPLE.autor)));
    }
    if (c.status === "pruefung") {
      if (role === "pruefer") {
        const ok = el("input", { type: "checkbox", id: "kConfirm" });
        const approve = el("button", { type: "button", class: "btn", disabled: true, onclick: () => setStatus("freigegeben") }, "Fachlich freigeben");
        ok.addEventListener("change", () => { approve.disabled = !ok.checked; });
        actions.append(el("label", { class: "confirm" }, ok, "Inhalte und Quellen fachlich geprüft"), approve,
          el("button", { type: "button", class: "btn ghost", onclick: () => setStatus("entwurf") }, "Zurück an Autorin"));
      } else actions.append(el("span", { class: "info" }, "Liegt bei " + PEOPLE.pruefer + " zur Fachprüfung (Vier-Augen-Prinzip)"));
    }
    if (c.status === "freigegeben") {
      actions.append(el("a", { class: "btn ghost", href: "/lernen.html#k=" + encodeURIComponent(c.id), target: "lernen" }, "Lernstrecke öffnen ↗"));
      if (role === "autor") actions.append(el("button", { type: "button", class: "btn ghost", onclick: () => setStatus("entwurf", true) }, "Neue Version bearbeiten"));
      actions.append(el("button", { type: "button", class: "btn ghost", disabled: busy, onclick: exportScorm }, "⤓ SCORM-Paket"));
    }
    box.append(actions);
    if (list.length && c.status !== "freigegeben") {
      box.append(el("p", { class: "hint" }, blocking ? "Vor der Fachprüfung noch zu erledigen:" : "Hinweise für die Fachprüfung:"),
        el("ul", { class: "issues" }, list.map(i => el("li", { class: i.level }, i.text))));
    }
    if (c.status === "freigegeben") box.append(el("p", { class: "hint" }, "Die Lernstrecke steht allen Lernenden zur Verfügung. Ihr Spickzettel liegt in der Wissensdatenbank, Appilot nutzt ihn in der Anwendung."));
    if (c.status === "freigegeben") box.append(el("p", { class: "hint" }, "SCORM-Paket (SCORM 1.2) für Ihr LMS, etwa Moodle oder ILIAS: Es enthält alle Schritte, die Erklärvideos, den Wissenscheck und den Spickzettel und meldet Fortschritt und Ergebnis an das LMS. KI-Lernbegleiter und Vorlesen bleiben der Online-Version vorbehalten."));
    if (!editable() && c.status === "entwurf") box.append(el("p", { class: "hint" }, "Bearbeiten kann nur die Autorin. Wechseln Sie oben die Rolle."));
    if (c.status !== "entwurf") box.append(el("p", { class: "hint" }, "Lernstrecken in Prüfung oder Freigabe sind schreibgeschützt."));
  }

  async function setStatus(status, newVersion) {
    const c = current;
    if (status === "pruefung") c.author = PEOPLE.autor;
    if (status === "freigegeben") { c.reviewer = PEOPLE.pruefer; c.version = (c.version || 0) + 1; }
    if (status === "entwurf" && newVersion) c.reviewer = "";
    c.status = status;
    await save(true);
    if (status === "freigegeben") {
      const sheet = K.cheatSheet(c);
      if (sheet) await Store.kb.put(sheet);
    }
    renderDetail();
    toast({
      pruefung: "An " + PEOPLE.pruefer + " zur Fachprüfung gegeben.",
      freigegeben: "Freigegeben. Die Lernstrecke ist für Lernende sichtbar, der Spickzettel liegt in der Wissensdatenbank.",
      entwurf: newVersion ? "Neue Version in Bearbeitung. Lernende sehen bis zur Freigabe die bisherige Fassung nicht mehr." : "Zurück an die Autorin.",
    }[status]);
  }

  // Freigegebene Lernstrecke als SCORM-1.2-Paket herunterladen.
  async function exportScorm() {
    busy = true;
    renderDetail();
    note("Das SCORM-Paket wird gepackt …", "work");
    try {
      const pkg = await window.AppilotScormExport.build(current, cases, projekt);
      const a = el("a", { href: URL.createObjectURL(pkg.blob), download: pkg.name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      note("SCORM-Paket „" + pkg.name + "“ heruntergeladen (" + (pkg.blob.size / 1048576).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " MB" + (pkg.videos ? ", mit " + pkg.videos + (pkg.videos === 1 ? " Erklärvideo" : " Erklärvideos") : "") + "). Laden Sie die ZIP-Datei in Ihrem LMS als SCORM-Lernpaket hoch." +
        (pkg.missing ? " " + pkg.missing + (pkg.missing === 1 ? " Erklärung hat" : " Erklärungen haben") + " noch kein Video und erscheinen im Paket als Text." : ""), pkg.missing ? "warn" : "ok");
    } catch (err) {
      console.error(err);
      note("Das SCORM-Paket konnte nicht erstellt werden: " + err.message, "warn");
    }
    busy = false;
    renderDetail();
  }

  $("kTitle").addEventListener("input", e => { current.title = e.target.value; save(); });
  $("kAudience").addEventListener("input", e => { current.audience = e.target.value; save(); });
  $("kGoal").addEventListener("input", e => { current.goal = e.target.value; save(); });
  $("kMinutes").addEventListener("input", e => { current.minutes = Number(e.target.value) || 0; save(); });

  // ---------------------------------------------------------------------------
  // Bausteine
  // ---------------------------------------------------------------------------
  $("addType").append(...Object.entries(K.TYPES).map(([k, t]) => el("option", { value: k }, t.icon + " " + t.label)));
  $("addType").addEventListener("change", e => {
    const type = e.target.value;
    e.target.value = "";
    if (!type || !editable()) return;
    const b = K.blank(type);
    current.blocks.push(b);
    open.add(b.id);
    save(true);
    renderDetail();
    document.querySelector(`[data-block="${b.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  function summary(b) {
    if (b.type === "erklaerung") return (b.points || []).length + " Kernpunkte" + (b.quelle ? " · Quelle: " + b.quelle : " · ohne Quelle");
    if (b.type === "auswahl") return (b.optionen || []).length + " Antworten";
    if (b.type === "zuordnen") return (b.paare || []).length + " Paare";
    if (b.type === "reihenfolge") return (b.schritte || []).length + " Schritte";
    if (b.type === "rechnen") return "Lösung " + (b.loesung ?? "") + " " + (b.einheit || "");
    if (b.type === "praxis") return cases.find(x => x.id === b.caseId)?.title || "kein Case gewählt";
    if (b.type === "check") return (b.fragen || []).length + " Fragen";
    if (b.type === "spickzettel") return (b.punkte || []).length + " Merksätze";
    return (b.text || "").slice(0, 90);
  }

  function renderBlocks() {
    const c = current;
    const canEdit = editable();
    const blocks = c.blocks || [];
    $("kCount").textContent = blocks.length ? "(" + blocks.length + ")" : "";
    const ol = $("kBlocks");
    if (!blocks.length) {
      ol.replaceChildren(el("li", { class: "none" }, "Noch keine Bausteine. Lassen Sie Appilot einen Entwurf erstellen oder fügen Sie das Gerüst ein."));
      return;
    }
    ol.replaceChildren(...blocks.map((b, i) => {
      const t = K.TYPES[b.type];
      const li = el("li", { class: "blk" + (open.has(b.id) ? " open" : ""), "data-block": b.id });
      const sub = el("span", {}, t.label + " · " + summary(b));
      const head = el("div", { class: "blk-head", onclick: e => {
        if (e.target.closest(".tools")) return;
        open.has(b.id) ? open.delete(b.id) : open.add(b.id);
        li.classList.toggle("open");
      } },
        el("span", { class: "ico", "aria-hidden": "true" }, t.icon),
        el("span", { class: "t" }, el("b", { class: "bt" }, (i + 1) + ". " + (b.title || t.label)), sub),
        b.type === "erklaerung" && b.videoId ? el("span", { class: "vid" }, "▶ Video") : null,
        el("span", { class: "tools" },
          el("button", { type: "button", title: "Nach oben", disabled: !canEdit || i === 0, onclick: () => move(i, -1) }, "↑"),
          el("button", { type: "button", title: "Nach unten", disabled: !canEdit || i === blocks.length - 1, onclick: () => move(i, 1) }, "↓"),
          el("button", { type: "button", title: "Entfernen", disabled: !canEdit, onclick: () => remove(i) }, "✕")));
      const body = el("div", { class: "blk-body" }, el("p", { class: "hintline" }, t.hint));
      for (const [key, kind, label] of t.fields) body.append(field(b, key, kind, label, canEdit, () => {
        li.querySelector(".bt").textContent = (i + 1) + ". " + (b.title || t.label);
        sub.textContent = t.label + " · " + summary(b);
      }));
      li.append(head, body);
      return li;
    }));
  }

  function move(i, d) {
    const blocks = current.blocks;
    [blocks[i], blocks[i + d]] = [blocks[i + d], blocks[i]];
    save(true);
    renderBlocks();
  }
  function remove(i) {
    const b = current.blocks[i];
    if (!confirm("Baustein „" + (b.title || K.TYPES[b.type].label) + "“ entfernen?")) return;
    current.blocks.splice(i, 1);
    save(true);
    renderDetail();
  }

  // Ein Formularfeld für einen Baustein. changed() aktualisiert die Kopfzeile.
  function field(b, key, kind, label, canEdit, changed) {
    const wrap = el("div", { class: "fld" }, el("span", {}, label));
    const touch = () => { save(); changed(); };
    const structural = () => { save(true); renderFlow(); const f = field(b, key, kind, label, canEdit, changed); wrap.replaceWith(f); changed(); };
    const input = (value, set, opts = {}) => el(opts.area ? "textarea" : "input", {
      value: value ?? "", rows: opts.rows || 2, placeholder: opts.placeholder || "", disabled: !canEdit, type: opts.type || "text",
      oninput: e => { set(opts.type === "number" ? Number(e.target.value) : e.target.value); touch(); },
      onchange: () => renderFlow(),
    });
    const x = onclick => el("button", { type: "button", class: "x", title: "Entfernen", disabled: !canEdit, onclick }, "✕");
    const plus = (text, onclick) => el("button", { type: "button", class: "plus", disabled: !canEdit, onclick }, "+ " + text);

    if (kind === "text") wrap.append(input(b[key], v => { b[key] = v; }));
    else if (kind === "area") wrap.append(input(b[key], v => { b[key] = v; }, { area: true, rows: key === "text" && b.type === "szenario" ? 5 : 3 }));
    else if (kind === "number") wrap.append(input(b[key], v => { b[key] = v; }, { type: "number" }));
    else if (kind === "bool") wrap.firstChild.replaceWith(el("label", { class: "inline" }, el("input", { type: "checkbox", checked: !!b[key], disabled: !canEdit, onchange: e => { b[key] = e.target.checked; touch(); } }), label));
    else if (kind === "case") {
      const sel = el("select", { disabled: !canEdit, onchange: e => { b[key] = e.target.value; touch(); renderFlow(); } },
        el("option", { value: "" }, "Case wählen …"),
        cases.map(c => el("option", { value: c.id, selected: c.id === b[key] }, c.title + (c.status === "freigegeben" ? "" : " (noch nicht freigegeben)"))));
      wrap.append(sel);
    } else if (kind === "points") {
      b[key].forEach((p, i) => wrap.append(el("div", { class: "row pt" },
        input(p.head, v => { p.head = v; }, { placeholder: "Kernaussage" }),
        input(p.text, v => { p.text = v; }, { area: true, placeholder: "Erklärung in 1 bis 2 Sätzen" }),
        x(() => { b[key].splice(i, 1); structural(); }))));
      wrap.append(plus("Kernpunkt", () => { b[key].push({ head: "", text: "" }); structural(); }));
    } else if (kind === "options") {
      b[key].forEach((o, i) => wrap.append(el("div", { class: "row opt" },
        el("input", { type: "checkbox", title: "Richtige Antwort", checked: !!o.richtig, disabled: !canEdit, onchange: e => { o.richtig = e.target.checked; touch(); renderFlow(); } }),
        input(o.text, v => { o.text = v; }, { placeholder: "Antwort" }),
        input(o.feedback, v => { o.feedback = v; }, { placeholder: "Feedback: warum richtig oder falsch" }),
        x(() => { b[key].splice(i, 1); structural(); }))));
      wrap.append(plus("Antwort", () => { b[key].push({ text: "", richtig: false, feedback: "" }); structural(); }));
    } else if (kind === "pairs") {
      b[key].forEach((p, i) => wrap.append(el("div", { class: "row pair" },
        input(p.links, v => { p.links = v; }, { placeholder: "Begriff" }),
        input(p.rechts, v => { p.rechts = v; }, { placeholder: "Bedeutung" }),
        x(() => { b[key].splice(i, 1); structural(); }))));
      wrap.append(plus("Paar", () => { b[key].push({ links: "", rechts: "" }); structural(); }));
    } else if (kind === "strings") {
      b[key].forEach((s, i) => wrap.append(el("div", { class: "row num" },
        el("span", { class: "n" }, i + 1 + "."),
        input(s, v => { b[key][i] = v; }),
        x(() => { b[key].splice(i, 1); structural(); }))));
      wrap.append(plus(b.type === "reihenfolge" ? "Schritt" : "Merksatz", () => { b[key].push(""); structural(); }));
    } else if (kind === "questions") {
      b[key].forEach((q, i) => {
        const box = el("div", { class: "q" }, el("div", { class: "q-head" }, "Frage " + (i + 1), x(() => { b[key].splice(i, 1); structural(); })),
          input(q.frage, v => { q.frage = v; }, { placeholder: "Frage" }));
        q.optionen.forEach((o, k) => box.append(el("div", { class: "row opt" },
          el("input", { type: "checkbox", title: "Richtige Antwort", checked: !!o.richtig, disabled: !canEdit, onchange: e => { o.richtig = e.target.checked; touch(); renderFlow(); } }),
          input(o.text, v => { o.text = v; }, { placeholder: "Antwort" }),
          el("span"),
          x(() => { q.optionen.splice(k, 1); structural(); }))));
        box.append(plus("Antwort", () => { q.optionen.push({ text: "", richtig: false }); structural(); }),
          input(q.erklaerung, v => { q.erklaerung = v; }, { placeholder: "Erklärung nach der Antwort" }));
        wrap.append(box);
      });
      wrap.append(plus("Frage", () => { b[key].push({ frage: "", optionen: [{ text: "", richtig: true }, { text: "", richtig: false }, { text: "", richtig: false }], erklaerung: "" }); structural(); }));
    }
    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Neu, Gerüst, Löschen
  // ---------------------------------------------------------------------------
  $("newCourse").addEventListener("click", async () => {
    role = "autor";
    $("role").value = role;
    try { localStorage.setItem("appilot-role", role); } catch {}
    const c = { id: Store.uid("lern"), title: "Neue Lernstrecke", audience: projekt.audience, goal: "", minutes: 0, status: "entwurf", version: 0, author: PEOPLE.autor, reviewer: "", created: new Date().toISOString(), updated: new Date().toISOString(), blocks: [] };
    current = c;
    courses.unshift(c);
    await save(true);
    select(c.id);
    $("draftPanel").hidden = false;
    $("dTopic").focus();
  });
  $("btnScaffold").addEventListener("click", () => {
    if (current.blocks.length && !confirm("Das Gerüst wird an die vorhandenen Bausteine angehängt. Fortfahren?")) return;
    const first = cases.find(c => c.status === "freigegeben");
    const blocks = K.scaffold(first && first.id);
    current.blocks.push(...blocks);
    open.add(blocks[0].id);
    save(true);
    renderDetail();
    note("Gerüst eingefügt: Fall, zwei Erklärungen mit Übungen, Praxis in der Anwendung, Wissenscheck und Spickzettel. Füllen Sie die Bausteine der Reihe nach.", "ok");
  });
  $("btnDelete").addEventListener("click", async () => {
    if (!current || !confirm("Lernstrecke „" + current.title + "“ löschen?")) return;
    await Store.courses.del(current.id);
    current = null;
    history.replaceState(null, "", location.pathname);
    await load();
  });

  // ---------------------------------------------------------------------------
  // Entwurf mit Appilot
  // ---------------------------------------------------------------------------
  $("btnDraft").addEventListener("click", () => {
    $("draftPanel").hidden = !$("draftPanel").hidden;
    if (!$("draftPanel").hidden) $("dTopic").focus();
  });
  $("dCancel").addEventListener("click", () => { $("draftPanel").hidden = true; });
  $("dGo").addEventListener("click", async () => {
    const topic = $("dTopic").value.trim();
    if (!topic) { $("dTopic").focus(); return; }
    if (current.blocks.length && !confirm("Der Entwurf ersetzt die vorhandenen Bausteine. Fortfahren?")) return;
    busy = true;
    renderDetail();
    $("dGo").disabled = true;
    note("Appilot entwirft die Lernstrecke: Szenario, Erklärungen, Übungen und Wissenscheck. Das dauert etwa eine Minute …", "work");
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "course", topic, audience: current.audience, sources: $("dSources").value,
          project: { app: projekt.name, audience: projekt.audience },
          cases: cases.filter(c => c.status === "freigegeben").map(c => ({ id: c.id, title: c.title, description: c.description })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "HTTP " + res.status);
      const out = await res.json();
      const blocks = (out.blocks || []).map(K.normalize).filter(Boolean);
      if (!blocks.length) throw new Error("Der Entwurf enthielt keine Bausteine");
      current.title = out.title || current.title;
      current.goal = out.goal || current.goal;
      current.minutes = out.minutes || K.estimate({ blocks });
      current.blocks = blocks;
      open.clear();
      open.add(blocks[0].id);
      await save(true);
      $("draftPanel").hidden = true;
      busy = false;
      renderDetail();
      const n = K.issues(current, cases).length;
      note("Entwurf mit " + blocks.length + " Bausteinen übernommen. Prüfen Sie die Inhalte, besonders die Quellen" + (n ? " (" + n + " Hinweise oben)." : "."), "ok");
    } catch (err) {
      busy = false;
      renderDetail();
      note("Appilot konnte gerade keinen Entwurf erstellen (" + err.message + "). Sie können mit dem Gerüst starten und die Bausteine selbst füllen.", "warn");
    } finally {
      $("dGo").disabled = false;
    }
  });

  // ---------------------------------------------------------------------------
  // Erklärvideos
  // ---------------------------------------------------------------------------
  $("btnVideos").addEventListener("click", async () => {
    const list = current.blocks.filter(b => b.type === "erklaerung" && (b.points || []).some(p => p.head));
    if (!list.length) return;
    busy = true;
    renderDetail();
    let voiceError = "", voiced = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const label = "Erklärvideo " + (i + 1) + " von " + list.length + " („" + b.title + "“)";
        let voice = null;
        if ($("optVoice").checked && !voiceError) {
          note(label + ": Appilot vertont die Texte …", "work");
          try { voice = await Media.fetchVoice(Media.explainerNarration(b), p => progress((i + p * 0.3) / list.length)); }
          catch (err) { voiceError = err.message; console.warn("Appilot: Vertonung fehlgeschlagen", err); }
        }
        note(label + " wird erzeugt …", "work");
        const video = await Media.renderExplainer(b, current, p => progress((i + 0.3 + p * 0.7) / list.length), voice);
        const entry = {
          id: K.videoId(current, b), kind: "video", courseId: current.id, blockId: b.id, version: current.version || 1, created: new Date().toISOString(),
          title: b.title, description: (b.text || "") + " (Erklärvideo aus der Lernstrecke „" + current.title + "“)",
          video: video.blob, mime: video.mime, ext: video.ext, seconds: video.seconds, voiced: video.voiced, voiceError: voice ? "" : voiceError,
          poster: Media.explainerPoster(b, current),
          steps: (b.points || []).map(p => ({ title: p.head, text: p.text })),
        };
        await Store.kb.put(entry);
        if (video.voiced) voiced++;
        b.videoId = entry.id;
        await save(true);
      }
      progress(null);
      busy = false;
      renderDetail();
      note(list.length + (list.length === 1 ? " Erklärvideo" : " Erklärvideos") + " erzeugt" + (voiced ? ", mit Sprecher" : "") + ". Sie stehen in der Lernstrecke und in der Wissensdatenbank." +
        (voiceError ? " Ohne Ton, weil die Vertonung nicht geklappt hat: " + voiceError : ""), voiceError ? "warn" : "ok");
    } catch (err) {
      console.error(err);
      progress(null);
      busy = false;
      renderDetail();
      note("Das Erklärvideo konnte nicht erzeugt werden: " + err.message, "warn");
    }
  });

  load();
})();
