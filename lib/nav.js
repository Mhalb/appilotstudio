// Gemeinsame Navigation des Studios: Seitenleiste links (auf schmalen Fenstern oben) mit Projektwechsel,
// Projekt-Dialog (Einstellungen und neues Projekt), Projekte verwalten, Rückmeldungen.
// Wird auf Start, Case-Editor und Lern-Editor nach lib/projekt.js geladen und baut sich sofort auf.
//
//   AppilotNav.openProject()   Einstellungen des aktuellen Projekts; Promise mit true, wenn gespeichert
//   AppilotNav.newProject()    Dialog „Neues Projekt“
//   AppilotNav.setActive(id)   aktiven Eintrag setzen: start, cases, kurse, medien, updates
//   AppilotNav.setCount(n)     Zahl offener Updates am Eintrag „Updates“
//   AppilotNav.toast(text)     kurze Rückmeldung unten
//
// Die Lernansicht (lernen.html) hat bewusst keine Seitenleiste: Sie zeigt, was Lernende sehen.
(function () {
  const Projekt = window.AppilotProjekt;
  const Store = window.AppilotStore;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  const ITEMS = [
    { id: "start", href: "/start", icon: "⌂", text: "Start" },
    { id: "cases", href: "/editor#cases", icon: "☰", text: "Cases" },
    { id: "kurse", href: "/lern-editor", icon: "◈", text: "Lernstrecken" },
    { id: "medien", href: "/editor#medien", icon: "▶", text: "Medien" },
    { id: "updates", href: "/editor#updates", icon: "↻", text: "Updates", count: true },
  ];

  // Aktiver Eintrag aus Adresse und Sprungmarke
  function current() {
    const path = location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/start";
    if (path === "/lern-editor") return "kurse";
    if (path === "/editor") {
      const h = location.hash;
      if (h.startsWith("#medien") || h.startsWith("#wissen") || h.startsWith("#notizen") || h.startsWith("#kb=")) return "medien";
      if (h.startsWith("#updates")) return "updates";
      return "cases";
    }
    return "start";
  }

  const nav = document.createElement("nav");
  nav.className = "appnav";
  nav.setAttribute("aria-label", "Studio");
  nav.innerHTML = `
    <a class="appnav-brand" href="/start"><span class="dot">✦</span><span>Appilot <b>Studio</b></span></a>
    <div class="appnav-switch">
      <button type="button" class="appnav-current" id="navSwitch" aria-haspopup="true" aria-expanded="false" title="Projekt wechseln">
        <span class="appnav-label">Projekt</span>
        <span class="appnav-ptitle" id="navPTitle">…</span>
        <span class="appnav-pkunde" id="navPKunde"></span>
        <span class="appnav-caret" aria-hidden="true">▾</span>
      </button>
      <div class="appnav-menu" id="navMenu" hidden>
        <input type="search" id="navSearch" placeholder="Projekt suchen" aria-label="Projekt suchen" autocomplete="off">
        <div class="appnav-list" id="navList" role="listbox" aria-label="Projekte"></div>
        <div class="appnav-menu-foot">
          <button type="button" class="btn small" id="navNew">+ Neues Projekt</button>
          <button type="button" class="lnk-dark" id="navManage">Projekte verwalten</button>
        </div>
      </div>
    </div>
    <ul class="appnav-items">${ITEMS.map(i => `
      <li><a href="${i.href}" data-nav="${i.id}"><span class="appnav-icon" aria-hidden="true">${i.icon}</span><span>${i.text}</span>${i.count ? `<span class="count" id="updCount" hidden></span>` : ""}</a></li>`).join("")}
    </ul>
    <div class="appnav-proj">
      <button type="button" class="appnav-projbtn" id="navProject" title="Projektname, Kunde, Zielanwendung und Zielgruppe">Projekt-Einstellungen</button>
      <a class="appnav-app" id="navToApp" target="zielanwendung" hidden>Anwendung öffnen ↗</a>
    </div>
    <div class="appnav-user"></div>`;
  document.body.prepend(nav);
  document.body.classList.add("with-nav");
  const $ = id => document.getElementById(id);

  function setActive(id) {
    nav.querySelectorAll("[data-nav]").forEach(a => {
      const on = a.dataset.nav === (id || current());
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  setActive();
  window.addEventListener("hashchange", () => setActive());

  function setCount(n) {
    const el = $("updCount");
    if (!el) return;
    el.textContent = n || "";
    el.hidden = !n;
  }

  // ---------------------------------------------------------------------------
  // Aktuelles Projekt in der Leiste
  // ---------------------------------------------------------------------------
  async function showProject() {
    const p = await Projekt.get();
    $("navPTitle").textContent = p.title || "Projekt";
    $("navPKunde").textContent = p.kunde || "";
    $("navPKunde").hidden = !p.kunde;
    $("navProject").classList.toggle("todo", !p.name);
    $("navProject").textContent = p.name ? "Projekt-Einstellungen" : "Zielanwendung eintragen";
    const link = $("navToApp");
    link.hidden = !p.url;
    if (p.url) {
      link.href = p.url;
      link.textContent = Projekt.appName(p) + " öffnen ↗";
      link.title = Projekt.appName(p) + " in neuem Tab öffnen";
    }
  }

  // ---------------------------------------------------------------------------
  // Projektwechsel: Liste nach Kunde gruppiert, mit Suche
  // ---------------------------------------------------------------------------
  let projects = [];
  async function fillMenu() {
    projects = await Projekt.list();
    renderMenu();
  }
  function renderMenu() {
    const q = $("navSearch").value.trim().toLowerCase();
    const cur = Store.currentProjectId();
    const hits = projects.filter(p => !q || (p.title + " " + p.kunde + " " + p.name).toLowerCase().includes(q));
    let lastKunde = null;
    $("navList").innerHTML = hits.length ? hits.map(p => {
      const head = p.kunde !== lastKunde ? `<div class="appnav-group">${esc(p.kunde || "Ohne Kunde")}</div>` : "";
      lastKunde = p.kunde;
      return head + `<button type="button" role="option" class="appnav-opt${p.id === cur ? " on" : ""}" data-id="${esc(p.id)}" aria-selected="${p.id === cur}">
        <b>${esc(p.title)}</b>${p.name && p.name !== p.title ? `<small>${esc(p.name)}</small>` : ""}</button>`;
    }).join("") : `<p class="appnav-none">Kein Projekt gefunden.</p>`;
    $("navList").querySelectorAll("[data-id]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.id === cur) return closeMenu();
      Projekt.open(b.dataset.id);
    }));
  }
  // Das Menü liegt über der Seite (position: fixed), damit die scrollbare Leiste es nicht abschneidet.
  function placeMenu() {
    const r = $("navSwitch").getBoundingClientRect(), menu = $("navMenu");
    if (matchMedia("(max-width: 900px)").matches) { menu.style.left = menu.style.top = ""; return; }
    menu.style.left = r.left + "px";
    menu.style.top = r.bottom + 6 + "px";
  }
  window.addEventListener("resize", () => { if (!$("navMenu").hidden) placeMenu(); });
  function openMenu() {
    placeMenu();
    $("navMenu").hidden = false;
    $("navSwitch").setAttribute("aria-expanded", "true");
    $("navSearch").value = "";
    fillMenu().then(() => $("navSearch").focus());
  }
  function closeMenu() {
    $("navMenu").hidden = true;
    $("navSwitch").setAttribute("aria-expanded", "false");
  }
  $("navSwitch").addEventListener("click", () => ($("navMenu").hidden ? openMenu() : closeMenu()));
  $("navSearch").addEventListener("input", renderMenu);
  $("navSearch").addEventListener("keydown", e => {
    if (e.key === "Escape") { closeMenu(); $("navSwitch").focus(); }
    if (e.key === "Enter") { const first = $("navList").querySelector("[data-id]"); if (first) first.click(); }
  });
  document.addEventListener("click", e => { if (!$("navMenu").hidden && !e.target.closest(".appnav-switch")) closeMenu(); });
  $("navNew").addEventListener("click", () => { closeMenu(); newProject(); });
  $("navManage").addEventListener("click", () => { closeMenu(); manage(); });

  // ---------------------------------------------------------------------------
  // Projekt-Dialog: Einstellungen des aktuellen Projekts oder neues Projekt
  // ---------------------------------------------------------------------------
  const dlg = document.createElement("dialog");
  dlg.className = "proj-dlg";
  dlg.id = "projDlg";
  dlg.setAttribute("aria-labelledby", "projTitle");
  dlg.innerHTML = `
    <form id="projForm" method="dialog">
      <h2 id="projTitle">Projekt</h2>
      <p class="hint" id="projIntro"></p>
      <label class="lbl" for="projPTitle">Projektname</label>
      <input id="projPTitle" maxlength="120" placeholder="z. B. Einführung Kundenportal" required>
      <label class="lbl" for="projKunde">Kunde <span class="hint">(optional)</span></label>
      <input id="projKunde" maxlength="120" placeholder="z. B. Muster GmbH" list="projKunden">
      <datalist id="projKunden"></datalist>
      <label class="lbl" for="projName">Name der Zielanwendung</label>
      <input id="projName" maxlength="80" placeholder="z. B. Kundenportal">
      <label class="lbl" for="projUrl">Adresse der Zielanwendung <span class="hint">(optional)</span></label>
      <input id="projUrl" type="url" maxlength="300" placeholder="https://…">
      <p class="hint">Mit Adresse kann Appilot Abläufe in der Anwendung aufnehmen, entwerfen und prüfen – dafür muss Appilot dort
        eingebunden sein. Sonst nehmen Sie mit der Appilot-Erweiterung auf oder legen Schritte von Hand an.</p>
      <label class="lbl" for="projAudience">Zielgruppe der Lernstrecken</label>
      <input id="projAudience" maxlength="300">
      <p class="note warn" id="projError" hidden></p>
      <div class="btns"><button type="submit" class="btn" id="projSave">Speichern</button><button type="button" class="btn ghost" id="projCancel">Abbrechen</button></div>
    </form>`;
  document.body.append(dlg);
  const f = id => dlg.querySelector("#" + id);

  let resolveDlg = null, mode = "edit";
  async function fillKunden() {
    const kunden = [...new Set((await Projekt.list({ archived: true })).map(p => p.kunde).filter(Boolean))];
    f("projKunden").innerHTML = kunden.map(k => `<option value="${esc(k)}">`).join("");
  }
  async function openDialog(m) {
    mode = m;
    const p = m === "new" ? Object.assign({}, Projekt.DEFAULTS, { kunde: (await Projekt.get()).kunde }) : await Projekt.get();
    f("projTitle").textContent = m === "new" ? "Neues Projekt" : "Projekt-Einstellungen";
    f("projIntro").textContent = m === "new"
      ? "Ein Projekt ist ein Auftrag mit einer Zielanwendung. Cases, Lernstrecken und Medien liegen jeweils in ihrem Projekt."
      : "Die Zielanwendung ist die Web-Anwendung, zu der Cases, Videos und Lernstrecken entstehen.";
    f("projSave").textContent = m === "new" ? "Projekt anlegen und öffnen" : "Speichern";
    f("projPTitle").value = p.title;
    f("projKunde").value = p.kunde;
    f("projName").value = p.name;
    f("projUrl").value = p.url;
    f("projAudience").value = p.audience;
    f("projError").hidden = true;
    fillKunden();
    if (!dlg.open) dlg.showModal();
    f("projPTitle").focus();
    return new Promise(r => { resolveDlg = r; });
  }
  const openProject = () => openDialog("edit");
  const newProject = () => openDialog("new");
  function closeProject(saved) {
    if (dlg.open) dlg.close();
    if (location.hash === "#projekt" || location.hash === "#projekt-neu") history.replaceState(null, "", location.pathname + location.search);
    if (resolveDlg) { const r = resolveDlg; resolveDlg = null; r(saved); }
  }
  f("projCancel").addEventListener("click", () => closeProject(false));
  dlg.addEventListener("cancel", () => closeProject(false));
  // Ohne eigenen Projektnamen den Namen der Anwendung vorschlagen
  f("projName").addEventListener("input", () => { if (mode === "new" && !f("projPTitle").dataset.touched) f("projPTitle").value = f("projName").value; });
  f("projPTitle").addEventListener("input", () => { f("projPTitle").dataset.touched = "1"; });
  f("projForm").addEventListener("submit", async e => {
    e.preventDefault();
    const values = { title: f("projPTitle").value, kunde: f("projKunde").value, name: f("projName").value, url: f("projUrl").value, audience: f("projAudience").value };
    try {
      if (mode === "new") { await Projekt.create(values); return; } // lädt die Seite im neuen Projekt neu
      await Projekt.set(values);
      await showProject();
      closeProject(true);
      toast("Projekt gespeichert.");
    } catch (err) {
      f("projError").textContent = err.message;
      f("projError").hidden = false;
    }
  });
  $("navProject").addEventListener("click", () => openProject());

  // ---------------------------------------------------------------------------
  // Projekte verwalten: Überblick, öffnen, archivieren
  // ---------------------------------------------------------------------------
  const man = document.createElement("dialog");
  man.className = "proj-dlg manage-dlg";
  man.setAttribute("aria-labelledby", "manTitle");
  man.innerHTML = `
    <h2 id="manTitle">Projekte verwalten</h2>
    <p class="hint">Archivierte Projekte erscheinen nicht mehr im Projektwechsel. Ihre Inhalte bleiben erhalten.</p>
    <div class="manage-list" id="manList"></div>
    <label class="opt"><input type="checkbox" id="manArchived"> Archivierte zeigen</label>
    <div class="btns"><button type="button" class="btn small" id="manNew">+ Neues Projekt</button><button type="button" class="btn ghost" id="manClose">Schließen</button></div>`;
  document.body.append(man);
  const m = id => man.querySelector("#" + id);
  async function renderManage() {
    const [all, counts] = await Promise.all([Projekt.list({ archived: m("manArchived").checked }), Store.countByProject()]);
    const cur = Store.currentProjectId();
    m("manList").innerHTML = `<table><thead><tr><th>Projekt</th><th>Kunde</th><th>Cases</th><th>Lernstrecken</th><th>Medien</th><th></th></tr></thead><tbody>` +
      all.map(p => {
        const n = counts[p.id] || { cases: 0, courses: 0, media: 0 };
        return `<tr class="${p.archived ? "arch" : ""}"><td><b>${esc(p.title)}</b>${p.id === cur ? ` <span class="badge freigegeben">geöffnet</span>` : ""}${p.archived ? ` <span class="badge">archiviert</span>` : ""}${p.name ? `<br><small>${esc(p.name)}</small>` : ""}</td>
          <td>${esc(p.kunde)}</td><td>${n.cases}</td><td>${n.courses}</td><td>${n.media}</td>
          <td class="acts">${p.id === cur ? "" : `<button type="button" class="lnk-btn" data-open="${esc(p.id)}">Öffnen</button>`}
            ${p.id === cur ? "" : `<button type="button" class="lnk-btn" data-arch="${esc(p.id)}" data-val="${p.archived ? "0" : "1"}">${p.archived ? "Wiederherstellen" : "Archivieren"}</button>`}</td></tr>`;
      }).join("") + `</tbody></table>`;
    m("manList").querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => Projekt.open(b.dataset.open)));
    m("manList").querySelectorAll("[data-arch]").forEach(b => b.addEventListener("click", async () => {
      try { await Projekt.archive(b.dataset.arch, b.dataset.val === "1"); renderManage(); } catch (err) { toast(err.message); }
    }));
  }
  function manage() { renderManage(); if (!man.open) man.showModal(); }
  m("manArchived").addEventListener("change", renderManage);
  m("manClose").addEventListener("click", () => man.close());
  m("manNew").addEventListener("click", () => { man.close(); newProject(); });

  // #projekt bzw. #projekt-neu öffnen den Dialog auf jeder Seite, z. B. von der Startseite aus.
  const fromHash = () => {
    if (location.hash === "#projekt") openProject();
    if (location.hash === "#projekt-neu") newProject();
  };
  window.addEventListener("hashchange", fromHash);

  // ---------------------------------------------------------------------------
  // Rückmeldung unten
  // ---------------------------------------------------------------------------
  let toastBox = null, toastTimer = null;
  function toast(text) {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "nav-toast";
      toastBox.setAttribute("role", "status");
      document.body.append(toastBox);
    }
    toastBox.textContent = text;
    toastBox.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastBox.hidden = true; }, 3200);
  }

  Store.onChange(name => { if (name === "projects") showProject(); });
  showProject().then(fromHash);

  window.AppilotNav = { openProject, newProject, setActive, setCount, toast, current };
})();
