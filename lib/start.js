// Startseite: Erste Schritte für neue Nutzer und „Meine Aufgaben“ (in Arbeit, zur Prüfung, nachbessern).
// Liest nur über lib/store.js; Links führen in Case-Editor (#case=, #kb=, #neu) und Lern-Editor (#k=, #neu).
(function () {
  const Store = window.AppilotStore;
  const Projekt = window.AppilotProjekt;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const fmtDate = iso => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "");
  const byUpdated = (a, b) => (b.updated || b.created || "").localeCompare(a.updated || a.created || "");
  const MAX = 6;
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

  const caseLink = c => "/editor#case=" + encodeURIComponent(c.id);
  const courseLink = k => "/lern-editor#k=" + encodeURIComponent(k.id);
  // Medien öffnen im Case (bzw. in der Lernstrecke), nicht als einzelner Eintrag
  const kbLink = k => k.caseId ? "/editor#medien=" + encodeURIComponent(k.caseId) : k.courseId ? "/lern-editor#k=" + encodeURIComponent(k.courseId) : "/editor#kb=" + encodeURIComponent(k.id);

  let user = null;

  function greet() {
    const h = new Date().getHours();
    const hello = h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
    const first = user && user.name ? user.name.split(" ")[0] : "";
    $("hello").textContent = hello + (first ? ", " + first : "");
  }

  function item({ href, kind, title, meta, tag, tagClass }) {
    return `<li><a href="${esc(href)}">
      <span class="task-kind">${esc(kind)}</span>
      <span class="task-main"><b>${esc(title || "Ohne Titel")}</b><small>${esc(meta)}</small></span>
      ${tag ? `<span class="badge ${esc(tagClass || "")}">${esc(tag)}</span>` : ""}
    </a></li>`;
  }

  function fill(listId, countId, items, empty) {
    $(countId).textContent = items.length || "";
    $(countId).hidden = !items.length;
    $(listId).innerHTML = items.length
      ? items.slice(0, MAX).map(item).join("") + (items.length > MAX ? `<li class="more">und ${items.length - MAX} weitere</li>` : "")
      : `<li class="none">${esc(empty)}</li>`;
  }

  async function render() {
    const [projekt, cases, courses, kb] = await Promise.all([Projekt.get(), Store.cases.all(), Store.courses.all(), Store.kb.all()]);
    greet();
    $("helloSub").textContent = projekt.name
      ? `Projekt: ${Projekt.label(projekt)}. Hier sehen Sie, was als Nächstes ansteht.`
      : `Projekt: ${Projekt.label(projekt)}. Tragen Sie zuerst die Zielanwendung ein, danach legen Sie Cases und Lernstrecken an.`;

    // Erste Schritte, bis alles einmal erledigt ist
    const media = kb.filter(k => k.kind === "video" || k.kind === "anleitung");
    const steps = [
      { done: !!projekt.name, title: "Zielanwendung eintragen", text: "Name der Zielanwendung, Kunde und Zielgruppe im Projekt eintragen.", action: `<button type="button" class="btn small" data-act="projekt">Einrichten</button>` },
      { done: cases.length > 0, title: "Ersten Case anlegen", text: "Ablauf beschreiben, aufnehmen oder Schritte von Hand mit Bildschirmfotos anlegen.", action: `<a class="btn small" href="/editor#neu">Case anlegen</a>` },
      { done: media.length > 0, title: "Video und Klickanleitung erzeugen", text: "Im Case unter „Prüfen und erzeugen“.", action: `<a class="btn small ghost" href="/editor#cases">Zu den Cases</a>` },
      { done: courses.length > 0, title: "Erste Lernstrecke anlegen", text: "Mit Appilot entwerfen oder aus dem Gerüst selbst aufbauen.", action: `<a class="btn small ghost" href="/lern-editor#neu">Lernstrecke anlegen</a>` },
    ];
    const doneCount = steps.filter(s => s.done).length;
    $("firstSteps").hidden = doneCount === steps.length;
    $("firstCount").textContent = `${doneCount} von ${steps.length} erledigt`;
    const next = steps.findIndex(s => !s.done);
    $("firstList").innerHTML = steps.map((s, i) => `
      <li class="${s.done ? "done" : i === next ? "next" : ""}">
        <span class="first-num" aria-hidden="true">${s.done ? "✓" : i + 1}</span>
        <span class="first-text"><b>${esc(s.title)}</b><small>${esc(s.text)}</small></span>
        ${s.done ? `<span class="hint">erledigt</span>` : s.action}
      </li>`).join("");
    $("firstList").querySelectorAll('[data-act="projekt"]').forEach(b => b.addEventListener("click", () => AppilotNav.openProject()));

    // Überblick
    const released = cases.filter(c => c.status === "freigegeben").length;
    const coursesReleased = courses.filter(k => k.status === "freigegeben").length;
    $("stats").innerHTML = [
      ["Cases", cases.length, released + " freigegeben", "/editor#cases"],
      ["Lernstrecken", courses.length, coursesReleased + " freigegeben", "/lern-editor"],
      ["Videos", kb.filter(k => k.kind === "video").length, plural(kb.filter(k => k.kind === "anleitung").length, "Klickanleitung", "Klickanleitungen"), "/editor#medien"],
    ].map(([label, n, sub, href]) => `<a class="stat" href="${href}"><span>${label}</span><b>${n}</b><small>${esc(sub)}</small></a>`).join("");

    // In Arbeit: Entwürfe
    const work = [
      ...cases.filter(c => c.status === "entwurf").map(c => ({ updated: c.updated, href: caseLink(c), kind: "Case", title: c.title,
        meta: `${(c.steps || []).length} Schritte · geändert ${fmtDate(c.updated)}`, tag: c.update && c.update.applied ? "nach Update" : "", tagClass: "pruefung" })),
      ...courses.filter(k => k.status === "entwurf").map(k => ({ updated: k.updated, href: courseLink(k), kind: "Lernstrecke", title: k.title,
        meta: `${(k.blocks || []).length} Bausteine · geändert ${fmtDate(k.updated)}` })),
    ].sort(byUpdated);
    fill("listWork", "nWork", work, "Keine Entwürfe. Legen Sie oben einen neuen Case oder eine Lernstrecke an.");

    // Zur Prüfung
    const review = [
      ...cases.filter(c => c.status === "pruefung").map(c => ({ updated: c.updated, href: caseLink(c), kind: "Case", title: c.title,
        meta: `von ${c.author || "Autor/in"} · ${(c.steps || []).length} Schritte`, tag: "In Prüfung", tagClass: "pruefung" })),
      ...courses.filter(k => k.status === "pruefung").map(k => ({ updated: k.updated, href: courseLink(k), kind: "Lernstrecke", title: k.title,
        meta: `von ${k.author || "Autor/in"} · ${(k.blocks || []).length} Bausteine`, tag: "In Fachprüfung", tagClass: "pruefung" })),
    ].sort(byUpdated);
    fill("listReview", "nReview", review, "Nichts zu prüfen.");

    // Nachbessern: Vorschläge nach Updates, veraltete Medien, freigegebene Cases ohne Video
    const fix = [
      ...cases.filter(c => c.update && !c.update.applied).map(c => ({ updated: c.updated, href: "/editor#updates", kind: "Case", title: c.title,
        meta: `Passt nach Version ${c.update.version} nicht mehr ganz`, tag: "Vorschlag", tagClass: "entwurf" })),
      ...media.filter(k => k.stale).map(k => ({ updated: k.created, href: kbLink(k), kind: k.kind === "video" ? "Video" : "Klickanleitung", title: k.title,
        meta: `Zeigt noch Version ${k.stale.from}`, tag: "veraltet", tagClass: "entwurf" })),
      ...cases.filter(c => c.status === "freigegeben" && !media.some(k => k.kind === "video" && k.caseId === c.id)).map(c => ({ updated: c.updated, href: caseLink(c), kind: "Case", title: c.title,
        meta: "Freigegeben, aber noch ohne Video und Klickanleitung", tag: "Video fehlt" })),
    ].sort(byUpdated);
    fill("listFix", "nFix", fix, "Alles aktuell.");
  }

  Store.onChange(() => render());
  AppilotAuth.ready.then(u => { user = u; greet(); });
  render();
})();
