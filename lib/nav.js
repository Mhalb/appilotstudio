// Gemeinsame Navigation des Studios: Seitenleiste links (auf schmalen Fenstern oben), Projekt-Dialog, Rückmeldungen.
// Wird auf Start, Case-Editor und Lern-Editor nach lib/projekt.js geladen und baut sich sofort auf.
//
//   AppilotNav.openProject()   Projekt-Dialog öffnen; Promise mit true, wenn gespeichert
//   AppilotNav.setActive(id)   aktiven Eintrag setzen: start, cases, kurse, wissen, updates
//   AppilotNav.setCount(n)     Zahl offener Updates am Eintrag „Updates“
//   AppilotNav.toast(text)     kurze Rückmeldung unten
//
// Die Lernansicht (lernen.html) hat bewusst keine Seitenleiste: Sie zeigt, was Lernende sehen.
(function () {
  const Projekt = window.AppilotProjekt;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  const ITEMS = [
    { id: "start", href: "/start", icon: "⌂", text: "Start" },
    { id: "cases", href: "/editor#cases", icon: "☰", text: "Cases" },
    { id: "kurse", href: "/lern-editor", icon: "◈", text: "Lernstrecken" },
    { id: "wissen", href: "/editor#wissen", icon: "▶", text: "Wissen" },
    { id: "updates", href: "/editor#updates", icon: "↻", text: "Updates", count: true },
  ];

  // Aktiver Eintrag aus Adresse und Sprungmarke
  function current() {
    const path = location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/start";
    if (path === "/lern-editor") return "kurse";
    if (path === "/editor") {
      const h = location.hash;
      if (h.startsWith("#wissen") || h.startsWith("#kb=")) return "wissen";
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
    <ul class="appnav-items">${ITEMS.map(i => `
      <li><a href="${i.href}" data-nav="${i.id}"><span class="appnav-icon" aria-hidden="true">${i.icon}</span><span>${i.text}</span>${i.count ? `<span class="count" id="updCount" hidden></span>` : ""}</a></li>`).join("")}
    </ul>
    <div class="appnav-proj">
      <span class="appnav-label">Projekt</span>
      <button type="button" class="appnav-projbtn" id="navProject" title="Zielanwendung und Zielgruppe einstellen">…</button>
      <a class="appnav-app" id="navToApp" target="zielanwendung" hidden>Anwendung öffnen ↗</a>
    </div>
    <div class="appnav-user"></div>`;
  document.body.prepend(nav);
  document.body.classList.add("with-nav");

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
    const el = document.getElementById("updCount");
    if (!el) return;
    el.textContent = n || "";
    el.hidden = !n;
  }

  // ---------------------------------------------------------------------------
  // Projekt: Anzeige in der Leiste und Dialog
  // ---------------------------------------------------------------------------
  async function showProject() {
    const p = await Projekt.get();
    const btn = document.getElementById("navProject");
    btn.textContent = p.name || "Projekt einrichten";
    btn.classList.toggle("todo", !p.name);
    const link = document.getElementById("navToApp");
    link.hidden = !p.url;
    if (p.url) {
      link.href = p.url;
      link.title = Projekt.appName(p) + " in neuem Tab öffnen";
    }
  }

  const dlg = document.createElement("dialog");
  dlg.className = "proj-dlg";
  dlg.id = "projDlg";
  dlg.setAttribute("aria-labelledby", "projTitle");
  dlg.innerHTML = `
    <form id="projForm" method="dialog">
      <h2 id="projTitle">Projekt</h2>
      <p class="hint">Die Zielanwendung ist die Web-Anwendung, zu der Cases, Videos und Lernstrecken entstehen.</p>
      <label class="lbl" for="projName">Name der Zielanwendung</label>
      <input id="projName" maxlength="80" placeholder="z. B. Kundenportal" required>
      <label class="lbl" for="projUrl">Adresse der Zielanwendung <span class="hint">(optional)</span></label>
      <input id="projUrl" type="url" maxlength="300" placeholder="https://…">
      <p class="hint">Mit Adresse kann Appilot Abläufe in der Anwendung aufnehmen, entwerfen und prüfen – dafür muss Appilot dort
        eingebunden sein. Ohne Appilot legen Sie Schritte von Hand mit Bildschirmfotos an.</p>
      <label class="lbl" for="projAudience">Zielgruppe der Lernstrecken</label>
      <input id="projAudience" maxlength="300">
      <p class="note warn" id="projError" hidden></p>
      <div class="btns"><button type="submit" class="btn">Speichern</button><button type="button" class="btn ghost" id="projCancel">Abbrechen</button></div>
    </form>`;
  document.body.append(dlg);

  let resolveDlg = null;
  async function openProject() {
    const p = await Projekt.get();
    dlg.querySelector("#projName").value = p.name;
    dlg.querySelector("#projUrl").value = p.url;
    dlg.querySelector("#projAudience").value = p.audience;
    dlg.querySelector("#projError").hidden = true;
    if (!dlg.open) dlg.showModal();
    dlg.querySelector("#projName").focus();
    return new Promise(r => { resolveDlg = r; });
  }
  function closeProject(saved) {
    if (dlg.open) dlg.close();
    if (location.hash === "#projekt") history.replaceState(null, "", location.pathname + location.search);
    if (resolveDlg) { const r = resolveDlg; resolveDlg = null; r(saved); }
  }
  dlg.querySelector("#projCancel").addEventListener("click", () => closeProject(false));
  dlg.addEventListener("cancel", () => closeProject(false));
  dlg.querySelector("#projForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await Projekt.set({
        name: dlg.querySelector("#projName").value,
        url: dlg.querySelector("#projUrl").value,
        audience: dlg.querySelector("#projAudience").value,
      });
      await showProject();
      closeProject(true);
      toast("Projekt gespeichert.");
    } catch (err) {
      const box = dlg.querySelector("#projError");
      box.textContent = err.message;
      box.hidden = false;
    }
  });
  document.getElementById("navProject").addEventListener("click", () => openProject());

  // #projekt öffnet den Dialog auf jeder Seite, z. B. von der Startseite aus.
  const fromHash = () => { if (location.hash === "#projekt") openProject(); };
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

  window.AppilotStore.onChange(name => { if (name === "meta") showProject(); });
  showProject().then(fromHash);

  window.AppilotNav = { openProject, setActive, setCount, toast, current };
})();
