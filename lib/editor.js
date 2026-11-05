// Case-Editor: Cases beschreiben oder aufnehmen, prüfen, freigeben, Video und Klickanleitung erzeugen.
(function () {
  const API = window.APPILOT_API || "/api/appilot";
  const Store = window.AppilotStore;
  const Media = window.AppilotMedia;
  const Lang = window.AppilotSprache;
  const Projekt = window.AppilotProjekt;
  const $ = id => document.getElementById(id);
  const STATUS = { entwurf: "Entwurf", pruefung: "In Prüfung", freigegeben: "Freigegeben" };
  const PEOPLE = { autor: "Maria Sommer", pruefer: "Jens Albrecht" };
  const ACTION_TEXT = { click: "klicken", input: "eintragen", select: "wählen", check: "ankreuzen", upload: "Datei anhängen", info: "Hinweis" };

  let cases = [];
  let current = null;
  let kbItems = [];
  let busy = false;
  let saving = 0;
  let projekt = Projekt.DEFAULTS;  // Zielanwendung und Zielgruppe, siehe lib/projekt.js
  let role = "autor";
  try { role = localStorage.getItem("appilot-role") || "autor"; } catch {}
  $("role").value = role;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const fmtDate = iso => new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function note(text, kind) {
    const n = $("cNote");
    n.textContent = text;
    n.className = "note " + (kind || "");
    n.hidden = !text;
  }

  async function api(body) {
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ project: { app: projekt.name, audience: projekt.audience } }, body)) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "HTTP " + res.status);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // Ansicht wechseln
  // ---------------------------------------------------------------------------
  // Ansichten des Case-Editors; die Navigation links (lib/nav.js) verlinkt sie als #cases, #wissen, #updates.
  const VIEW_HASH = { cases: "#cases", kb: "#wissen", updates: "#updates" };
  const VIEW_NAV = { cases: "cases", kb: "wissen", updates: "updates" };
  const VIEW_TITLE = { cases: "Cases", kb: "Wissen: Videos, Anleitungen, Notizen", updates: "Updates der Anwendung" };
  function showView(view, { keepHash = false } = {}) {
    $("viewCases").hidden = view !== "cases";
    $("viewKb").hidden = view !== "kb";
    $("viewUpdates").hidden = view !== "updates";
    if (view === "updates") renderUpdates();
    $("pageTitle").textContent = VIEW_TITLE[view];
    document.title = VIEW_TITLE[view].split(":")[0] + " · Appilot Studio";
    if (!keepHash && location.hash !== VIEW_HASH[view]) history.replaceState(null, "", location.pathname + VIEW_HASH[view]);
    if (window.AppilotNav) AppilotNav.setActive(VIEW_NAV[view]);
  }
  // Sprungmarken: #cases, #wissen, #updates, #neu (neuer Case), #case=<id>, #kb=<id>; #projekt übernimmt lib/nav.js
  function route() {
    const h = location.hash;
    if (h === "#wissen") return showView("kb");
    if (h === "#updates") return showView("updates");
    if (h === "#neu") { showView("cases"); return $("newCase").click(); }
    if (h === "#cases" || h === "") return showView("cases");
  }
  window.addEventListener("hashchange", route);
  $("role").addEventListener("change", () => {
    role = $("role").value;
    try { localStorage.setItem("appilot-role", role); } catch {}
    renderDetail();
  });
  // ---------------------------------------------------------------------------
  // Projekt: Zielanwendung und Zielgruppe
  // ---------------------------------------------------------------------------
  async function loadProject() {
    projekt = await Projekt.get();
    $("frame").title = Projekt.appName(projekt);
  }
  // Der Projekt-Dialog gehört zur Navigation (lib/nav.js); nach dem Speichern meldet der Speicher die Änderung.
  const openProject = () => AppilotNav.openProject();
  Store.onChange(name => { if (name === "meta") loadProject().then(() => { if (current) renderDetail(); }); });

  // Ohne Adresse der Zielanwendung: Hinweis statt Fehlermeldung aus der Tiefe
  function needApp() {
    if (projekt.url) return false;
    note("Bitte zuerst unter „Projekt“ die Adresse der Zielanwendung eintragen.", "warn");
    openProject();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Cases laden und anzeigen
  // ---------------------------------------------------------------------------
  async function load() {
    await loadProject();
    cases = (await Store.cases.all()).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    kbItems = (await Store.kb.all()).sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    if (current) current = cases.find(c => c.id === current.id) || null;
    renderList();
    renderDetail();
    renderKbList();
    renderBanner();
    if (!$("viewUpdates").hidden) renderUpdates();
  }
  Store.onChange(() => { if (!busy && !saving) load(); });

  const SOURCE_TEXT = c => c.source === "erweiterung" ? "aus der Erweiterung" : c.source === "aufnahme" ? "aufgenommen" : isHand(c) ? "von Hand" : "beschrieben";

  function renderList() {
    $("caseList").innerHTML = cases.map(c => `
      <li class="${current && current.id === c.id ? "active" : ""}" data-id="${esc(c.id)}">
        <b>${esc(c.title)}</b>
        <span><span class="badge ${c.status}">${STATUS[c.status]}</span> ${c.steps.length} Schritte · ${SOURCE_TEXT(c)}</span>
      </li>`).join("");
    $("caseList").querySelectorAll("li").forEach(li => li.addEventListener("click", () => {
      current = cases.find(c => c.id === li.dataset.id);
      note("");
      renderList();
      renderDetail();
    }));
  }

  function editable() {
    return current && current.status === "entwurf" && role === "autor";
  }

  function renderDetail() {
    $("emptyDetail").hidden = !!current;
    $("caseForm").hidden = !current;
    if (!current) return;
    const c = current;
    const canEdit = editable();
    $("cTitle").value = c.title;
    $("cDesc").value = c.description || "";
    $("cTitle").disabled = $("cDesc").disabled = !canEdit;
    $("cStatus").textContent = STATUS[c.status];
    $("cStatus").className = "badge " + c.status;
    $("cMeta").textContent = "Version " + (c.version || 0) + " · Autorin " + (c.author || PEOPLE.autor) + (c.reviewer ? " · freigegeben von " + c.reviewer : "") + " · geändert " + fmtDate(c.updated);

    // Freigabe-Ablauf mit Vier-Augen-Prinzip
    const order = ["entwurf", "pruefung", "freigegeben"];
    let actions = "";
    if (c.status === "entwurf") actions = role === "autor"
      ? `<button type="button" class="btn" id="fSubmit" ${c.steps.length ? "" : "disabled"}>Zur Prüfung geben</button>`
      : `<span class="info">In Bearbeitung bei ${esc(c.author || PEOPLE.autor)}</span>`;
    if (c.status === "pruefung") actions = role === "pruefer"
      ? `<button type="button" class="btn" id="fApprove">Freigeben</button><button type="button" class="btn ghost" id="fReject">Zurück an Autorin</button>`
      : `<span class="info">Liegt bei ${PEOPLE.pruefer} zur Prüfung (Vier-Augen-Prinzip)</span>`;
    if (c.status === "freigegeben") actions = (projekt.url && !isHand(c) ? `<a class="btn ghost" href="${esc(Projekt.appUrl(projekt, { appilotCase: c.id }))}" target="zielanwendung">In der Anwendung ausprobieren ↗</a>` : "") +
      (role === "autor" ? `<button type="button" class="btn ghost" id="fNewVersion">Neue Version bearbeiten</button>` : "");
    $("cFlow").innerHTML = `<ol class="flowline">${order.map(s => `<li class="${s === c.status ? "on" : order.indexOf(s) < order.indexOf(c.status) ? "past" : ""}">${STATUS[s]}</li>`).join("")}</ol><div class="flow-actions">${actions}</div>` +
      (c.status === "freigegeben" ? `<p class="hint">${isHand(c) ? "Video und Klickanleitung stehen in der Wissensdatenbank; Appilot nutzt den Case und seine Fehlerbilder für Antworten." : "Appilot bietet diesen Case in der Anwendung an und nutzt seine Fehlerbilder für Antworten."}</p>` : "") +
      (!canEdit && c.status === "entwurf" ? `<p class="hint">Bearbeiten kann nur die Autorin. Wechseln Sie oben die Rolle.</p>` : "") +
      (c.status !== "entwurf" ? `<p class="hint">Freigegebene und geprüfte Cases sind schreibgeschützt.</p>` : "") +
      (c.update && !c.update.applied ? `<p class="hint warn">Nach dem Update auf Version ${esc(c.update.version)} passt dieser Case nicht mehr ganz. <button type="button" class="lnk" id="fToUpdates" style="color:inherit;text-decoration:underline">Zum Vorschlag unter „Updates“</button></p>` : "") +
      (c.update && c.update.applied && c.status !== "freigegeben" ? `<p class="hint">Neue Fassung für Version ${esc(c.update.version)}. Die geänderten Schritte sind markiert. Nach der Freigabe merkt sich Appilot den neuen Stand der Anwendung.</p>` : "") +
      (c.status === "freigegeben" && !c.update && staleMedia(c).length ? `<p class="hint warn">${staleMedia(c).map(k => KIND[k.kind].replace(/^\S+ /, "")).join(" und ")} ${staleMedia(c).length > 1 ? "zeigen" : "zeigt"} noch Version ${esc(staleMedia(c)[0].stale.from)}. Erzeugen Sie sie mit „Video und Anleitung erzeugen“ neu.</p>` : "");
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
    on("fSubmit", () => setStatus("pruefung"));
    on("fApprove", () => setStatus("freigegeben"));
    on("fReject", () => setStatus("entwurf"));
    on("fNewVersion", () => setStatus("entwurf", true));
    on("fToUpdates", () => showView("updates"));

    ["btnDraft", "btnRecord", "btnPolish", "btnAddError", "btnAddStep", "btnDelete"].forEach(id => { $(id).disabled = !canEdit || busy; });
    // Sprachfassungen ändern die geprüften deutschen Texte nicht und dürfen deshalb jederzeit erstellt werden.
    $("btnLang").disabled = !c.steps.length || busy || role !== "autor" && c.status !== "pruefung";
    renderLangs();
    $("btnTest").disabled = $("btnMedia").disabled = !c.steps.length || busy;
    // Schritte von Hand lassen sich nicht in der Anwendung abspielen; Video und Anleitung entstehen aus den Bildern.
    const hand = isHand(c);
    $("btnTest").hidden = hand;
    $("mediaInfo").textContent = hand
      ? "Video und Klickanleitung entstehen aus den Bildschirmfotos der Schritte."
      : "Probelauf in der Anwendung, danach Video und Klickanleitung für die Wissensdatenbank.";
    $("btnPolish").disabled = !canEdit || busy || !c.steps.length;
    $("cCount").textContent = c.steps.length ? "(" + c.steps.length + ")" : "";
    renderSteps(canEdit);
    renderErrors(canEdit);
  }

  // Schritte von Hand: Der Case enthält mindestens einen Schritt ohne Aufnahme. Video und Klickanleitung entstehen dann
  // aus den Bildschirmfotos der Schritte statt aus der Anwendung.
  const isHand = c => (c.steps || []).some(s => s.manual);
  let picked = -1; // Schritt, in den ein eingefügtes Bildschirmfoto (⌘V) kommt

  function shotHtml(s, i, canEdit) {
    if (s.shot) {
      const r = s.rect;
      const mark = r ? `<span class="mark" style="left:${(r.x / s.shot.width) * 100}%;top:${(r.y / s.shot.height) * 100}%;width:${(r.w / s.shot.width) * 100}%;height:${(r.h / s.shot.height) * 100}%"></span>` : "";
      return `<div class="st-shot">
        <button type="button" class="thumb" data-shot="mark" ${canEdit ? "" : "disabled"} title="${canEdit ? "Bereich markieren" : "Bildschirmfoto"}"><img src="${esc(s.shot.dataUrl)}" alt="Bildschirmfoto Schritt ${i + 1}">${mark}</button>
        ${canEdit ? `<div class="shot-tools">
          <button type="button" class="lnk-btn" data-shot="mark">${r ? "Markierung ändern" : "Bereich markieren"}</button>
          <button type="button" class="lnk-btn" data-shot="pick">Bild ersetzen</button>
          <button type="button" class="lnk-btn" data-shot="del">Bild entfernen</button>
          ${r || s.action === "info" ? "" : `<span class="warn">Ohne Markierung zeigt das Video nur das Bild.</span>`}
        </div>` : ""}
      </div>`;
    }
    if (!canEdit) return `<div class="st-shot"><span class="warn">Kein Bildschirmfoto</span></div>`;
    return `<div class="st-shot"><button type="button" class="drop" data-shot="pick">📷 Bildschirmfoto hinzufügen: auswählen, hierher ziehen oder mit ⌘V/Strg+V einfügen</button></div>`;
  }

  function renderSteps(canEdit) {
    const c = current;
    if (!c.steps.length) {
      $("cSteps").innerHTML = `<li class="none">Noch keine Schritte. Lassen Sie Appilot den Case aus der Beschreibung entwerfen, nehmen Sie ihn auf oder legen Sie Schritte mit „+ Schritt“ selbst an.</li>`;
      return;
    }
    const hand = isHand(c);
    const dis = canEdit ? "" : "disabled";
    $("cSteps").innerHTML = c.steps.map((s, i) => `
      <li data-i="${i}" class="${s._state || ""}${i === picked && canEdit ? " picked" : ""}">
        <span class="num">${i + 1}</span>
        <div class="body">
          <input class="st-title" value="${esc(s.title)}" ${dis} placeholder="Was tun Sie in diesem Schritt? z. B. „Auf Speichern klicken“" aria-label="Titel Schritt ${i + 1}">
          <textarea class="st-text" rows="2" ${dis} placeholder="Kurze Erklärung für Video und Klickanleitung" aria-label="Erklärung Schritt ${i + 1}">${esc(s.text)}</textarea>
          ${s.manual ? `<div class="st-hand">
            <select class="st-action" ${dis} aria-label="Aktion Schritt ${i + 1}">${Object.entries(ACTION_TEXT).map(([k, v]) => `<option value="${k}" ${s.action === k ? "selected" : ""}>${v}</option>`).join("")}</select>
            <input class="st-label" value="${esc(s.label)}" ${dis} placeholder="Element, z. B. Knopf „Speichern“" aria-label="Element Schritt ${i + 1}">
            <input class="st-value" value="${esc(s.value)}" ${dis} ${["input", "select"].includes(s.action) ? "" : "hidden"} placeholder="Beispielwert, z. B. 30 Tage" aria-label="Beispielwert Schritt ${i + 1}">
          </div>` : `<div class="st-meta"><code>${esc(s.label || s.target)}</code> · ${ACTION_TEXT[s.action] || s.action}${s.value && s.action !== "click" ? " · <em>" + esc(s.valueText || s.value) + "</em>" : ""}${s._error ? ` · <b class="err">${esc(s._error)}</b>` : ""}${s.upd ? ` · <b class="upd ${esc(s.upd)}">${s.upd === "neu" ? "neu" : s.upd === "geändert" ? "geändert" : "bitte prüfen"} für Version ${esc((c.update && c.update.version) || "")}</b>` : ""}</div>`}
          ${hand ? shotHtml(s, i, canEdit) : ""}
        </div>
        ${canEdit ? `<div class="st-tools"><button type="button" data-act="up" title="Nach oben">↑</button><button type="button" data-act="down" title="Nach unten">↓</button><button type="button" data-act="del" title="Schritt löschen">✕</button></div>` : ""}
      </li>`).join("");
    $("cSteps").querySelectorAll("li[data-i]").forEach(li => {
      const i = +li.dataset.i;
      const s = c.steps[i];
      li.querySelector(".st-title").addEventListener("input", e => { s.title = e.target.value; save(); });
      li.querySelector(".st-text").addEventListener("input", e => { s.text = e.target.value; save(); });
      if (!canEdit) return;
      li.addEventListener("focusin", () => pick(i));
      li.addEventListener("pointerdown", () => pick(i));
      if (s.manual) {
        li.querySelector(".st-action").addEventListener("change", e => {
          s.action = e.target.value;
          if (!["input", "select"].includes(s.action)) { s.value = ""; s.valueText = ""; }
          save(true);
          renderSteps(canEdit);
        });
        li.querySelector(".st-label").addEventListener("input", e => { s.label = e.target.value; save(); });
        li.querySelector(".st-value").addEventListener("input", e => { s.value = s.valueText = e.target.value; save(); });
      }
      li.querySelectorAll("[data-shot]").forEach(b => b.addEventListener("click", () => {
        pick(i);
        const act = b.dataset.shot;
        if (act === "pick") $("shotFile").click();
        if (act === "mark") openMark(i);
        if (act === "del" && confirm("Bildschirmfoto von Schritt " + (i + 1) + " entfernen?")) { delete s.shot; delete s.rect; save(true); renderSteps(canEdit); }
      }));
      // Bild direkt auf den Schritt ziehen
      if (hand) li.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); li.classList.add("over"); } });
      li.addEventListener("dragleave", () => li.classList.remove("over"));
      li.addEventListener("drop", e => {
        li.classList.remove("over");
        const file = [...e.dataTransfer.files].find(f => f.type.startsWith("image/"));
        if (!file) return;
        e.preventDefault();
        attachShot(i, file);
      });
      li.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
        const act = b.dataset.act;
        if (act === "del") {
          if ((s.shot || s.title) && !confirm("Schritt " + (i + 1) + " löschen?")) return;
          c.steps.splice(i, 1);
          picked = -1;
        }
        if (act === "up" && i > 0) { [c.steps[i - 1], c.steps[i]] = [c.steps[i], c.steps[i - 1]]; picked = i - 1; }
        if (act === "down" && i < c.steps.length - 1) { [c.steps[i + 1], c.steps[i]] = [c.steps[i], c.steps[i + 1]]; picked = i + 1; }
        save(true);
        renderDetail();
      }));
    });
  }

  function pick(i) {
    if (picked === i) return;
    picked = i;
    $("cSteps").querySelectorAll("li[data-i]").forEach(li => li.classList.toggle("picked", +li.dataset.i === i));
  }

  $("btnAddStep").addEventListener("click", () => {
    if (!editable()) return;
    current.steps.push({ id: Store.uid("s"), manual: true, hash: "", target: "", action: "click", value: "", valueText: "", label: "", hint: "", title: "", text: "" });
    picked = current.steps.length - 1;
    save(true);
    renderDetail();
    const items = $("cSteps").querySelectorAll(".st-title");
    if (items.length) { items[items.length - 1].focus(); items[items.length - 1].scrollIntoView({ block: "center", behavior: "smooth" }); }
  });

  // ---------------------------------------------------------------------------
  // Aufnahme aus der Browser-Erweiterung importieren (lib/aufnahme.js prüft die Datei)
  // ---------------------------------------------------------------------------
  $("btnImport").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    await importRecording(file);
  });

  async function importRecording(file) {
    const Aufnahme = window.AppilotAufnahme;
    showView("cases");
    const listNote = (text, kind) => { const n = $("importNote"); n.textContent = text; n.className = "note " + (kind || ""); n.hidden = !text; };
    listNote("");
    if (file.size > 50 * 1024 * 1024) return listNote("Aufnahme nicht importiert: Die Datei ist größer als 50 MB.", "warn");
    let rec;
    try { rec = Aufnahme.parse(await file.text()); } catch (err) {
      return listNote("Aufnahme nicht importiert: " + err.message, "warn");
    }
    setBusy(true);
    listNote("Appilot übernimmt die Aufnahme mit " + rec.steps.length + " Schritten …", "work");
    const steps = [];
    let noShot = 0;
    for (const s of rec.steps) {
      const step = { id: Store.uid("s"), manual: true, hash: "", target: "", action: s.action, value: s.value, valueText: s.valueText,
        label: s.label || s.name, hint: "", title: Aufnahme.stepTitle(s), text: "" };
      if (s.shot) {
        try {
          const { shot } = await imageToShot(s.shot.dataUrl);
          step.shot = shot;
          // Markierung an die neue Bildgröße anpassen: Die Datei gibt sie in Pixeln von shot.width an.
          const k = shot.width / s.shot.width;
          if (s.rect) {
            const x = Math.round(s.rect.x * k), y = Math.round(s.rect.y * k);
            const w = Math.min(Math.round(s.rect.w * k), shot.width - x), h = Math.min(Math.round(s.rect.h * k), shot.height - y);
            if (w >= 4 && h >= 4) step.rect = { x, y, w, h };
          }
        } catch { noShot++; }
      } else noShot++;
      steps.push(step);
    }
    const c = { id: Store.uid("case"), title: rec.title, description: "", app: projekt.name || rec.app.title, status: "entwurf", version: 0,
      source: "erweiterung", author: PEOPLE.autor, reviewer: "", updated: new Date().toISOString(), steps, errors: [],
      recording: { url: rec.app.url, title: rec.app.title, created: rec.created, recorder: rec.recorder, imported: new Date().toISOString() } };
    role = "autor";
    $("role").value = role;
    try { localStorage.setItem("appilot-role", role); } catch {}
    current = c;
    cases.unshift(c);
    await save(true);
    setBusy(false);
    listNote("");
    renderList();
    const other = rec.app.url && projekt.url && new URL(rec.app.url).origin !== new URL(projekt.url).origin;
    note("Aufnahme „" + c.title + "“ mit " + steps.length + " Schritten als Entwurf übernommen. " +
      (noShot ? noShot + (noShot === 1 ? " Schritt hat" : " Schritte haben") + " kein Bild; fügen Sie es hinzu. " : "") +
      (other ? "Hinweis: Die Aufnahme stammt von " + new URL(rec.app.url).host + ", das Projekt ist " + new URL(projekt.url).host + ". " : "") +
      "Lassen Sie Appilot jetzt die Texte formulieren.", noShot || other ? "warn" : "ok");
  }

  // ---------------------------------------------------------------------------
  // Bildschirmfotos für Schritte von Hand
  // ---------------------------------------------------------------------------
  const SHOT_MAX_W = 1600;
  const SHOT_MAX_BYTES = 15 * 1024 * 1024;

  // Bild über eine Zeichenfläche neu erzeugen, verkleinern und als JPEG ablegen: { dataUrl, width, height } wie die
  // Bildschirmfotos aus der Anwendung. scale gibt den Faktor zurück, um eine Markierung mitzuskalieren.
  async function imageToShot(src) {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Das Bild lässt sich nicht öffnen."));
      im.src = src;
    });
    const scale = Math.min(1, SHOT_MAX_W / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { shot: { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height }, scale: canvas.width / img.naturalWidth };
  }

  async function readShot(file) {
    if (!file.type.startsWith("image/")) throw new Error("Das ist kein Bild.");
    if (file.size > SHOT_MAX_BYTES) throw new Error("Das Bild ist größer als 15 MB.");
    const url = URL.createObjectURL(file);
    try { return (await imageToShot(url)).shot; } finally { URL.revokeObjectURL(url); }
  }

  async function attachShot(i, file) {
    if (!editable() || !current.steps[i]) return;
    try {
      const s = current.steps[i];
      s.shot = await readShot(file);
      delete s.rect;
      await save(true);
      renderDetail();
      // Bei Klicks und Eingaben gleich den Bereich markieren lassen
      if (s.action !== "info") openMark(i);
    } catch (err) {
      note("Bildschirmfoto für Schritt " + (i + 1) + " nicht übernommen: " + err.message, "warn");
    }
  }

  $("shotFile").addEventListener("change", e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file && picked >= 0) attachShot(picked, file);
  });

  // ⌘V / Strg+V: Bild aus der Zwischenablage in den gewählten Schritt, sonst in den ersten Schritt ohne Bild.
  document.addEventListener("paste", e => {
    if (!current || !editable() || !isHand(current) || $("viewCases").hidden || $("shotDlg").open) return;
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find(x => x.kind === "file" && x.type.startsWith("image/"));
    if (!item) return;
    let i = picked >= 0 && current.steps[picked] ? picked : current.steps.findIndex(s => !s.shot);
    if (i < 0) return note("Wählen Sie zuerst den Schritt, zu dem das Bildschirmfoto gehört.", "warn");
    e.preventDefault();
    attachShot(i, item.getAsFile());
  });

  // Bereich markieren: Rahmen mit der Maus ziehen. Gespeichert in Bildpunkten des Bildschirmfotos (wie rect aus der Anwendung).
  let markIndex = -1, markRect = null;
  function openMark(i) {
    const s = current.steps[i];
    if (!s || !s.shot) return;
    markIndex = i;
    markRect = s.rect ? Object.assign({}, s.rect) : null;
    $("shotImg").onload = drawMark;
    $("shotImg").src = s.shot.dataUrl;
    $("shotDlg").showModal();
    requestAnimationFrame(drawMark);
  }
  function drawMark() {
    const box = $("shotRect");
    const s = current && current.steps[markIndex];
    if (!markRect || !s) { box.hidden = true; return; }
    const k = $("shotImg").clientWidth / s.shot.width;
    Object.assign(box.style, { left: markRect.x * k + "px", top: markRect.y * k + "px", width: markRect.w * k + "px", height: markRect.h * k + "px" });
    box.hidden = false;
  }
  (function () {
    const area = $("shotCanvas");
    let start = null;
    const at = e => {
      const r = $("shotImg").getBoundingClientRect();
      const s = current.steps[markIndex];
      const k = s.shot.width / r.width;
      return { x: Math.max(0, Math.min(s.shot.width, (e.clientX - r.left) * k)), y: Math.max(0, Math.min(s.shot.height, (e.clientY - r.top) * k)) };
    };
    area.addEventListener("pointerdown", e => {
      if (markIndex < 0) return;
      e.preventDefault();
      area.setPointerCapture(e.pointerId);
      start = at(e);
      markRect = { x: start.x, y: start.y, w: 0, h: 0 };
      drawMark();
    });
    area.addEventListener("pointermove", e => {
      if (!start) return;
      const p = at(e);
      markRect = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      drawMark();
    });
    area.addEventListener("pointerup", () => {
      start = null;
      if (markRect && (markRect.w < 8 || markRect.h < 8)) { markRect = null; drawMark(); }
    });
    window.addEventListener("resize", () => { if ($("shotDlg").open) drawMark(); });
  })();
  function closeMark(rect) {
    const s = current && current.steps[markIndex];
    if (s && rect !== undefined) {
      if (rect) s.rect = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
      else delete s.rect;
      save(true);
      renderDetail();
    }
    markIndex = -1;
    $("shotDlg").close();
  }
  $("shotOk").addEventListener("click", () => closeMark(markRect));
  $("shotNone").addEventListener("click", () => closeMark(null));
  $("shotCancel").addEventListener("click", () => closeMark(undefined));
  $("shotDlg").addEventListener("cancel", () => { markIndex = -1; });

  function renderErrors(canEdit) {
    const c = current;
    c.errors = c.errors || [];
    $("cErrors").innerHTML = c.errors.length ? c.errors.map((e, i) => `
      <div class="err-item" data-i="${i}">
        <input value="${esc(e.title)}" ${canEdit ? "" : "disabled"} aria-label="Fehlerbild">
        <textarea rows="2" ${canEdit ? "" : "disabled"} aria-label="Erklärung und Lösung">${esc(e.text)}</textarea>
        ${canEdit ? `<button type="button" title="Fehlerbild löschen">✕</button>` : ""}
      </div>`).join("") : `<p class="hint">Noch keine Fehlerbilder. Appilot ergänzt sie beim Entwerfen und Formulieren.</p>`;
    $("cErrors").querySelectorAll(".err-item").forEach(el => {
      const i = +el.dataset.i;
      el.querySelector("input").addEventListener("input", e => { c.errors[i].title = e.target.value; save(); });
      el.querySelector("textarea").addEventListener("input", e => { c.errors[i].text = e.target.value; save(); });
      const del = el.querySelector("button");
      if (del) del.addEventListener("click", () => { c.errors.splice(i, 1); save(true); renderDetail(); });
    });
  }

  let saveTimer = null;
  function save(now) {
    if (!current) return;
    current.updated = new Date().toISOString();
    const snapshot = JSON.parse(JSON.stringify(current, (k, v) => (k.startsWith("_") ? undefined : v)));
    clearTimeout(saveTimer);
    const run = async () => {
      saving++;
      try { await Store.cases.put(snapshot); } finally { saving--; }
      const idx = cases.findIndex(c => c.id === snapshot.id);
      if (idx >= 0) cases[idx] = current; else cases.unshift(current);
      renderList();
    };
    if (now) return run();
    saveTimer = setTimeout(run, 400);
  }

  $("cTitle").addEventListener("input", e => { current.title = e.target.value; save(); });
  $("cDesc").addEventListener("input", e => { current.description = e.target.value; save(); });

  // ---------------------------------------------------------------------------
  // Sprachfassungen: Einfache Sprache und Englisch für Appilot
  // ---------------------------------------------------------------------------
  const OTHER = ["einfach", "en"];
  function renderLangs() {
    const c = current;
    if (!Lang) { $("cLangs").innerHTML = ""; return; }
    $("cLangs").innerHTML = OTHER.map(l => {
      const t = c.translations && c.translations[l];
      const ok = Lang.version(c, l);
      const state = ok ? `<span class="badge freigegeben">aktuell</span><small>${t.by === "vorlage" ? "Vorlage" : "von Appilot erstellt" + (t.created ? " am " + esc(fmtDate(t.created)) : "")}</small>`
        : t ? `<span class="badge entwurf">veraltet</span><small>Die deutschen Texte haben sich geändert. Bis zur neuen Fassung übersetzt Appilot den Case während der Führung.</small>`
        : `<span class="badge">fehlt</span><small>Appilot übersetzt den Case dann während der Führung.</small>`;
      const body = ok ? `<ol>${c.steps.map((s, i) => `<li><b>${esc(ok.steps[i].title)}</b>${esc(ok.steps[i].text)}</li>`).join("")}</ol>` +
        ((ok.errors || []).length ? `<div class="lerr">Fehlerbilder: ${ok.errors.map(e => esc(e.title)).join(" · ")}</div>` : "") : "";
      return `<details><summary><b>${esc(Lang.LANGS[l])}</b>${state}</summary>${body}</details>`;
    }).join("");
  }
  async function makeVersions(c, quiet) {
    if (!Lang || !c.steps.length) return;
    const todo = OTHER.filter(l => !Lang.version(c, l));
    if (!todo.length) { if (!quiet) note("Die Sprachfassungen sind aktuell.", "ok"); return; }
    busy = true;
    renderDetail();
    note("Appilot erstellt die Sprachfassungen (" + todo.map(l => Lang.LANGS[l]).join(", ") + ") …", "work");
    const src = Lang.source(c);
    const failed = [];
    for (const l of todo) {
      try {
        const t = await api({ mode: "translate", lang: l, title: c.title, description: c.description, steps: c.steps.map(s => ({ title: s.title, text: s.text })), errors: c.errors || [] });
        c.translations = Object.assign({}, c.translations, { [l]: Object.assign({ source: src, by: "appilot", created: new Date().toISOString() }, t) });
      } catch (err) {
        console.warn("Appilot: Sprachfassung fehlgeschlagen", err);
        failed.push(Lang.LANGS[l]);
      }
    }
    busy = false;
    if (current === c) await save(true); else await Store.cases.put(c);
    renderDetail();
    note(failed.length
      ? "Nicht erstellt: " + failed.join(", ") + ". Appilot ist gerade nicht erreichbar. In der Anwendung übersetzt Appilot den Case dann während der Führung oder zeigt ihn auf Deutsch."
      : "Sprachfassungen erstellt. Sie stehen unten unter „Sprachfassungen“ und gehen mit in die Prüfung.", failed.length ? "warn" : "ok");
  }
  $("btnLang").addEventListener("click", () => makeVersions(current));

  async function setStatus(status, newVersion) {
    const c = current;
    if (status === "pruefung") c.author = PEOPLE.autor;
    if (status === "freigegeben") {
      c.reviewer = PEOPLE.pruefer;
      c.version = (c.version || 0) + 1;
      // Stand der Anwendung bei der Freigabe merken. Damit vergleicht Appilot nach dem nächsten Update.
      // Schritte von Hand kennen keine Elemente der Anwendung; dafür gibt es keinen Vergleichsstand.
      if (!isHand(c)) try { c.snapshot = Upd.snapshot(c, await Upd.readApp()); } catch (err) { console.warn("Appilot: Stand der Anwendung nicht gespeichert", err); }
      delete c.update;
      c.steps.forEach(s => delete s.upd);
    }
    if (status === "entwurf" && newVersion) c.reviewer = "";
    c.status = status;
    await save(true);
    renderDetail();
    if (status === "pruefung" || status === "freigegeben") makeVersions(c, true);
    toast({ pruefung: "An Jens Albrecht zur Prüfung gegeben.", freigegeben: isHand(c) ? "Freigegeben." : "Freigegeben. Appilot bietet den Case jetzt in der Anwendung an.", entwurf: newVersion ? "Neue Version in Bearbeitung. Bis zur nächsten Freigabe bietet Appilot den Case in der Anwendung nicht an." : "Zurück an die Autorin." }[status]);
  }

  $("newCase").addEventListener("click", async () => {
    role = "autor";
    $("role").value = role;
    try { localStorage.setItem("appilot-role", role); } catch {}
    const c = { id: Store.uid("case"), title: "Neuer Case", description: "", app: projekt.name, status: "entwurf", version: 0, source: "beschreibung", author: PEOPLE.autor, reviewer: "", updated: new Date().toISOString(), steps: [], errors: [] };
    current = c;
    cases.unshift(c);
    await save(true);
    renderDetail();
    $("cTitle").select();
  });
  $("btnDelete").addEventListener("click", async () => {
    if (!current || !confirm("Case „" + current.title + "“ löschen?")) return;
    await Store.cases.del(current.id);
    current = null;
    await load();
  });
  $("btnAddError").addEventListener("click", () => {
    current.errors.push({ title: "", text: "" });
    save(true);
    renderDetail();
    const items = $("cErrors").querySelectorAll(".err-item input");
    if (items.length) items[items.length - 1].focus();
  });

  // ---------------------------------------------------------------------------
  // Bühne: die Anwendung im Rahmen
  // ---------------------------------------------------------------------------
  const frame = $("frame");
  const stage = {
    seq: 0,
    pending: new Map(),
    ready: null,
    onStep: null,
    load(mode) {
      // Meldet sich Appilot in der Zielanwendung nicht, nicht endlos warten
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.ready = null;
          reject(new Error("Die Zielanwendung meldet sich nicht. Ist dort Appilot eingebunden? (" + projekt.url + ")"));
        }, 15000);
        this.ready = () => { clearTimeout(timer); resolve(); };
        frame.src = Projekt.appUrl(projekt, { appilot: mode });
      });
    },
    show(title, info, { stop = false, frame = true } = {}) {
      $("stageWrap").hidden = false;
      $("stageFrame").hidden = !frame;
      $("stageTitle").textContent = title;
      $("stageInfo").textContent = info || "";
      $("stageStop").hidden = !stop;
      $("stageClose").hidden = stop;
      $("stageLog").innerHTML = "";
      $("progress").hidden = true;
      fit();
    },
    hide() {
      $("stageWrap").hidden = true;
      frame.src = "about:blank";
    },
    call(cmd, arg) {
      const id = ++this.seq;
      frame.contentWindow.postMessage({ appilotCmd: cmd, id, arg }, Projekt.appOrigin(projekt));
      return new Promise((resolve, reject) => {
        this.pending.set(id, resolve);
        setTimeout(() => { if (this.pending.delete(id)) reject(new Error("Die Anwendung antwortet nicht (" + cmd + ").")); }, 30000);
      });
    },
  };
  window.addEventListener("message", e => {
    // Nur Nachrichten der Zielanwendung im Rahmen annehmen
    if (e.origin !== Projekt.appOrigin(projekt) || e.source !== frame.contentWindow || !e.data) return;
    if (e.data.appilot === "ready" && stage.ready) { const r = stage.ready; stage.ready = null; r(); }
    if (e.data.appilot === "step" && stage.onStep) stage.onStep(e.data.step);
    if (e.data.appilotReply && stage.pending.has(e.data.appilotReply)) {
      const r = stage.pending.get(e.data.appilotReply);
      stage.pending.delete(e.data.appilotReply);
      r(e.data.result);
    }
  });
  function fit() {
    const box = $("stageFrame");
    const availW = Math.min(window.innerWidth - 360, 1280);
    const availH = window.innerHeight - 110;
    const s = Math.max(0.3, Math.min(availW / 1280, availH / 800, 1));
    box.style.width = 1280 * s + "px";
    box.style.height = 800 * s + "px";
    frame.style.transform = "scale(" + s + ")";
  }
  window.addEventListener("resize", () => { if (!$("stageWrap").hidden) fit(); });
  $("stageClose").addEventListener("click", () => { if (!busy) stage.hide(); });
  function progress(p) {
    $("progress").hidden = false;
    $("progressBar").style.width = Math.round(p * 100) + "%";
  }
  function logLine(text, kind) {
    const li = document.createElement("li");
    li.className = kind || "";
    li.textContent = text;
    $("stageLog").appendChild(li);
    $("stageLog").scrollTop = $("stageLog").scrollHeight;
    return li;
  }
  function setBusy(v) {
    busy = v;
    renderDetail();
  }

  // ---------------------------------------------------------------------------
  // 1 · Aus der Beschreibung entwerfen
  // ---------------------------------------------------------------------------
  $("btnDraft").addEventListener("click", async () => {
    if (needApp()) return;
    const description = $("cDesc").value.trim();
    if (!description) { note("Bitte zuerst den Ablauf in eigenen Worten beschreiben.", "warn"); $("cDesc").focus(); return; }
    if (current.steps.length && !confirm("Die vorhandenen Schritte werden durch den Entwurf ersetzt. Fortfahren?")) return;
    setBusy(true);
    note("Appilot liest die Anwendung und entwirft die Schritte …", "work");
    try {
      await stage.load("play");
      const map = await stage.call("map");
      frame.src = "about:blank";
      const out = await api({ mode: "draft", description, controls: map.controls, screens: map.screens });
      const byId = Object.fromEntries(map.controls.map(c => [c.id, c]));
      current.steps = out.steps.map((s, i) => {
        const ctl = byId[s.target] || {};
        const opt = (ctl.options || []).find(o => o.value === s.value);
        return { id: "s" + (i + 1), hash: "", target: s.target, action: s.action, value: s.value, valueText: opt ? opt.text : "", label: ctl.label || s.target, hint: ctl.hint || "", title: s.title, text: s.text };
      });
      current.errors = out.errors || [];
      if (!current.title || current.title === "Neuer Case") current.title = out.title;
      current.source = "beschreibung";
      await save(true);
      setBusy(false);
      note("Entwurf mit " + current.steps.length + " Schritten erstellt. Prüfen Sie ihn jetzt mit dem Probelauf in der Anwendung.", "ok");
    } catch (err) {
      setBusy(false);
      note("Appilot konnte keinen Entwurf erstellen: " + err.message + ". Ist der API-Schlüssel in Vercel gesetzt? Alternativ den Ablauf aufnehmen.", "warn");
    }
  });

  // ---------------------------------------------------------------------------
  // 2 · Aufnehmen
  // ---------------------------------------------------------------------------
  let recorded = [];
  function defaultTitle(s) {
    const l = s.label || s.target;
    if (s.action === "click") return s.target.startsWith("tile") ? "Kachel „" + l + "“ öffnen" : "„" + l + "“ klicken";
    if (s.action === "select") return l + " wählen";
    if (s.action === "input") return l + " eintragen";
    if (s.action === "check") return "„" + l + "“ " + (s.value === "false" ? "abwählen" : "ankreuzen");
    if (s.action === "upload") return l.replace(/ hinzufügen$/, "") + " anhängen";
    return l;
  }
  function renderRecorded() {
    $("stageLog").innerHTML = "";
    recorded.forEach((s, i) => logLine((i + 1) + ". " + defaultTitle(s) + (s.action !== "click" && s.action !== "upload" && s.action !== "check" && s.value ? " · " + (s.valueText || s.value) : ""), "ok"));
    $("stageInfo").textContent = recorded.length + " Schritte aufgezeichnet. Klicken Sie den Ablauf in der Anwendung durch.";
  }
  $("btnRecord").addEventListener("click", async () => {
    if (needApp()) return;
    if (current.steps.length && !confirm("Die vorhandenen Schritte werden durch die Aufnahme ersetzt. Fortfahren?")) return;
    recorded = [];
    setBusy(true);
    stage.show("● Aufnahme läuft", "Klicken Sie den Ablauf in der Anwendung durch. Appilot zeichnet jeden Schritt auf.", { stop: true });
    stage.onStep = s => {
      const last = recorded[recorded.length - 1];
      // Mehrere Eingaben ins selbe Feld zählen als ein Schritt.
      if (last && last.target === s.target && ["input", "select"].includes(s.action) && last.action === s.action) recorded[recorded.length - 1] = s;
      else recorded.push(s);
      renderRecorded();
    };
    try {
      await stage.load("record");
    } catch (err) {
      stage.onStep = null;
      stage.hide();
      setBusy(false);
      note(err.message, "warn");
    }
  });
  $("stageStop").addEventListener("click", async () => {
    stage.onStep = null;
    stage.hide();
    if (!recorded.length) { setBusy(false); note("Es wurde nichts aufgezeichnet.", "warn"); return; }
    current.steps = recorded.map((s, i) => ({ id: "s" + (i + 1), hash: s.hash, target: s.target, action: s.action, value: s.value, valueText: s.valueText || "", label: s.label, hint: s.hint, screen: s.screen, title: defaultTitle(s), text: s.hint || "" }));
    current.source = "aufnahme";
    await save(true);
    setBusy(false);
    note("Aufnahme mit " + current.steps.length + " Schritten gespeichert. Appilot formuliert jetzt die Erklärtexte …", "work");
    polish(true);
  });

  async function polish(afterRecord) {
    setBusy(true);
    if (!afterRecord) note("Appilot formuliert die Texte …", "work");
    try {
      // Ohne Bildschirmfotos: Die KI braucht nur Aktion, Element und Wert.
      const steps = current.steps.map(({ shot, rect, ...rest }) => rest);
      const out = await api({ mode: "polish", description: current.description, steps });
      out.steps.forEach((s, i) => { current.steps[i].title = s.title; current.steps[i].text = s.text; });
      if (!current.errors.length) current.errors = out.errors;
      if (!current.title || current.title === "Neuer Case") current.title = out.title;
      if (!current.description) current.description = out.description;
      await save(true);
      note("Texte formuliert. Passen Sie sie bei Bedarf an und starten Sie dann den Probelauf.", "ok");
    } catch (err) {
      note("Appilot ist gerade nicht erreichbar. Die Schritte haben Standardtexte aus der Feldhilfe der Anwendung, die Sie hier anpassen können.", "warn");
    }
    setBusy(false);
  }
  $("btnPolish").addEventListener("click", () => polish(false));

  // ---------------------------------------------------------------------------
  // 3 · Probelauf
  // ---------------------------------------------------------------------------
  async function runAll({ title, info, perStep, pause = 450 }) {
    const steps = current.steps;
    steps.forEach(s => { delete s._state; delete s._error; });
    stage.show(title, info);
    try {
      await stage.load("play");
      await stage.call("reset");
    } catch (err) {
      logLine(err.message, "fail");
      return { ok: false, index: -1, error: err.message };
    }
    await wait(300);
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const line = logLine((i + 1) + ". " + s.title, "run");
      progress(i / steps.length);
      const r = await perStep(s, i);
      if (!r.ok) {
        line.className = "fail";
        line.textContent += " · " + r.error;
        s._state = "fail";
        s._error = r.error;
        return { ok: false, index: i, error: r.error };
      }
      line.className = "ok";
      s._state = "ok";
      await wait(pause);
    }
    progress(1);
    return { ok: true };
  }

  async function runAndCheck(s) {
    const r = await stage.call("run", s);
    if (!r || !r.ok) return r || { ok: false, error: "Keine Antwort" };
    if (r.hash) s.hash = r.hash;
    if (s.action === "click") {
      await wait(150);
      const msgs = await stage.call("messages");
      if (msgs && msgs.length) return { ok: false, error: "Anwendung meldet: " + msgs[0] };
    }
    return r;
  }

  $("btnTest").addEventListener("click", async () => {
    if (needApp()) return;
    setBusy(true);
    note("");
    const res = await runAll({ title: "Probelauf", info: "Appilot spielt den Case in der Anwendung ab.", perStep: runAndCheck });
    $("stageInfo").textContent = res.ok ? "Probelauf erfolgreich: alle " + current.steps.length + " Schritte laufen." : res.index < 0 ? "Probelauf nicht gestartet." : "Probelauf bei Schritt " + (res.index + 1) + " gestoppt.";
    if (editable()) await save(true);
    setBusy(false);
    note(res.ok ? "Probelauf erfolgreich: alle " + current.steps.length + " Schritte laufen in der Anwendung." : res.index < 0 ? res.error : "Schritt " + (res.index + 1) + " hat nicht funktioniert: " + res.error + " Passen Sie den Schritt an oder nehmen Sie den Ablauf neu auf.", res.ok ? "ok" : "warn");
  });

  // ---------------------------------------------------------------------------
  // Video und Klickanleitung
  // ---------------------------------------------------------------------------
  $("btnMedia").addEventListener("click", async () => {
    if (isHand(current)) return mediaFromShots();
    if (needApp()) return;
    setBusy(true);
    note("");
    const items = [];
    const res = await runAll({
      title: "Video und Anleitung",
      info: "Appilot spielt den Case ab und macht Screenshots.",
      pause: 120,
      perStep: async s => {
        // Bei Klicks zeigt das Bild den Zustand vor dem Klick, bei Eingaben den ausgefüllten Zustand.
        const before = s.action === "click" || s.action === "upload";
        let rect = null, shot = null;
        if (before) { rect = await stage.call("rect", s.target); shot = await stage.call("shot"); }
        const r = await runAndCheck(s);
        if (!r.ok) return r;
        if (!before) { rect = await stage.call("rect", s.target); shot = await stage.call("shot"); }
        if (!shot || !shot.dataUrl) return { ok: false, error: "Screenshot fehlgeschlagen" };
        items.push({ step: s, shot, rect });
        return { ok: true };
      },
    });
    if (!res.ok) {
      setBusy(false);
      note(res.index < 0 ? res.error : "Abgebrochen bei Schritt " + (res.index + 1) + ": " + res.error, "warn");
      return;
    }
    await buildMedia(items);
  });

  // Schritte von Hand: Video und Klickanleitung aus den hochgeladenen Bildschirmfotos, ohne die Anwendung.
  async function mediaFromShots() {
    const missing = current.steps.map((s, i) => (s.shot ? 0 : i + 1)).filter(Boolean);
    if (missing.length) {
      note((missing.length === 1 ? "Schritt " : "Schritte ") + missing.join(", ") + (missing.length === 1 ? " hat" : " haben") + " noch kein Bildschirmfoto. Fügen Sie es hinzu, dann entstehen Video und Klickanleitung.", "warn");
      const li = $("cSteps").querySelector(`li[data-i="${missing[0] - 1}"]`);
      if (li) li.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setBusy(true);
    note("");
    stage.show("Video und Anleitung", "Appilot bereitet die Bildschirmfotos vor …", { frame: false });
    current.steps.forEach((s, i) => logLine((i + 1) + ". " + (s.title || "Schritt " + (i + 1)), "ok"));
    const items = current.steps.map(s => ({ step: s, shot: s.shot, rect: s.rect || null }));
    await buildMedia(items);
  }

  async function buildMedia(items) {
    $("stageInfo").textContent = "Screenshots fertig. Appilot schneidet das Video …";
    progress(0);
    try {
      await Media.prepare(items);
      const created = new Date().toISOString();
      const guide = {
        id: "anleitung-" + current.id, kind: "anleitung", caseId: current.id, version: current.version || 1, created,
        title: current.title, description: current.description,
        steps: items.map(it => ({ title: it.step.title, text: it.step.text, value: it.step.action !== "click" && it.step.action !== "upload" && it.step.value ? (it.step.action === "check" ? "" : "Beispielwert: " + (it.step.valueText || it.step.value)) : "", image: Media.still(it) })),
      };
      await Store.kb.put(guide);
      let voice = null, voiceError = "";
      if ($("optVoice").checked) {
        $("stageInfo").textContent = "Appilot vertont die Texte …";
        try {
          voice = await Media.fetchVoice(Media.narration(current, items), p => { progress(p); $("stageInfo").textContent = "Appilot vertont die Texte … " + Math.round(p * 100) + " %"; });
        } catch (err) {
          console.warn("Appilot: Vertonung fehlgeschlagen", err);
          voiceError = err.message;
        }
        progress(0);
      }
      const video = await Media.renderVideo(current, items, p => { progress(p); $("stageInfo").textContent = "Video wird erzeugt … " + Math.round(p * 100) + " %"; }, voice);
      const entry = {
        id: "video-" + current.id, kind: "video", caseId: current.id, version: current.version || 1, created,
        title: current.title, description: current.description, video: video.blob, mime: video.mime, ext: video.ext,
        seconds: video.seconds, voiced: video.voiced, voiceError: voice ? "" : voiceError, poster: Media.poster(current, items),
        steps: current.steps.map(s => ({ title: s.title, text: s.text })),
      };
      await Store.kb.put(entry);
      stage.hide();
      setBusy(false);
      await load();
      showView("kb");
      openKb(entry.id);
      toast(voiceError ? "Video ohne Ton erzeugt, die Vertonung hat nicht geklappt: " + voiceError : "Video und Klickanleitung liegen in der Wissensdatenbank.");
    } catch (err) {
      console.error(err);
      setBusy(false);
      note("Das Video konnte nicht erzeugt werden: " + err.message, "warn");
    }
  }

  // ---------------------------------------------------------------------------
  // Wissensdatenbank
  // ---------------------------------------------------------------------------
  const KIND = { video: "▶ Video", anleitung: "☰ Klickanleitung", notiz: "✎ Notiz", neuigkeit: "✦ Neuigkeit" };
  let kbOpen = null;
  let objectUrl = null;

  function renderKbList() {
    $("kbList").innerHTML = kbItems.length ? kbItems.map(k => `
      <li class="${kbOpen === k.id ? "active" : ""}" data-id="${esc(k.id)}">
        ${k.poster ? `<img src="${k.poster}" alt="">` : ""}
        <b>${esc(k.title)}</b>
        <span>${KIND[k.kind]}${k.kind === "video" ? (k.voiced ? " · mit Sprecher" : " · ohne Ton") : ""} · ${fmtDate(k.created)}${k.version && k.kind !== "neuigkeit" ? " · Version " + k.version : ""}${k.kind === "neuigkeit" ? " · " + (k.status === "freigegeben" ? "für Nutzer freigegeben" : "Entwurf") : ""}${k.stale ? ` <span class="tag old">veraltet</span>` : ""}</span>
      </li>`).join("") : `<li class="none">Noch leer.</li>`;
    $("kbList").querySelectorAll("li[data-id]").forEach(li => li.addEventListener("click", () => openKb(li.dataset.id)));
  }

  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const fileName = t => t.replace(/[^\wäöüÄÖÜß-]+/g, "_").replace(/_+/g, "_").slice(0, 60);

  function openKb(id) {
    const k = kbItems.find(x => x.id === id);
    kbOpen = k ? id : null;
    renderKbList();
    $("kbEmpty").hidden = !!k;
    $("kbView").hidden = !k;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    if (!k) return;
    const v = $("kbView");
    if (k.kind === "video") {
      objectUrl = URL.createObjectURL(k.video);
      v.innerHTML = `<h2>${esc(k.title)}</h2>${staleNote(k)}<p class="meta">${KIND.video} · ${k.seconds || "?"} Sekunden · ${k.voiced ? "mit Sprecher" : "ohne Ton" + (k.voiceError ? " (" + esc(k.voiceError) + ")" : "")} · ${esc(k.mime)} · Version ${k.version} · ${fmtDate(k.created)}</p>
        <video controls src="${objectUrl}" poster="${k.poster || ""}" id="kbVideo"></video>
        <div class="btns"><button type="button" class="btn" id="kbDownload">Video herunterladen</button><button type="button" class="btn ghost" id="kbDel">Löschen</button></div>
        <p class="hint">Appilot schlägt dieses Video in der Anwendung vor, wenn jemand nach diesem Ablauf fragt.</p>`;
      $("kbDownload").addEventListener("click", () => download(k.video, fileName(k.title) + "." + (k.ext || "mp4")));
    } else if (k.kind === "anleitung") {
      v.innerHTML = `<h2>${esc(k.title)}</h2>${staleNote(k)}<p class="meta">${KIND.anleitung} · ${k.steps.length} Schritte · Version ${k.version} · ${fmtDate(k.created)}</p>
        <div class="btns"><button type="button" class="btn" id="kbPrint">Drucken / als PDF speichern</button><button type="button" class="btn ghost" id="kbHtml">HTML herunterladen</button><button type="button" class="btn ghost" id="kbDel">Löschen</button></div>
        <iframe class="doc" id="kbDoc" title="Klickanleitung"></iframe>`;
      const html = Media.guideHtml(k);
      $("kbDoc").srcdoc = html;
      $("kbPrint").addEventListener("click", () => $("kbDoc").contentWindow.print());
      $("kbHtml").addEventListener("click", () => download(new Blob([html], { type: "text/html" }), fileName(k.title) + "_Klickanleitung.html"));
    } else if (k.kind === "neuigkeit") {
      v.innerHTML = `<h2>${esc(k.title)}</h2><p class="meta">${KIND.neuigkeit} · Version ${esc(k.version)} · ${k.status === "freigegeben" ? "für Nutzer freigegeben" + (k.approvedBy ? " von " + esc(k.approvedBy) : "") : "Entwurf"}</p>
        <p>${esc(k.text)}</p><ul>${(k.items || []).map(x => `<li><b>${esc(x.title)}:</b> ${esc(x.text)}</li>`).join("")}</ul>
        <div class="btns"><button type="button" class="btn" id="kbToUpd">Unter „Updates“ bearbeiten</button><button type="button" class="btn ghost" id="kbDel">Löschen</button></div>
        <p class="hint">Appilot zeigt diese Karte in der Anwendung allen Nutzern von Version ${esc(k.version)}, sobald sie freigegeben ist.</p>`;
      $("kbToUpd").addEventListener("click", () => showView("updates"));
    } else {
      v.innerHTML = `<p class="meta">${KIND.notiz} · ${fmtDate(k.created)}</p>
        <input class="title-input" id="kbTitle" value="${esc(k.title)}" aria-label="Titel">
        <textarea id="kbText" rows="14" aria-label="Text">${esc(k.text)}</textarea>
        <div class="btns"><button type="button" class="btn" id="kbSave">Speichern</button><button type="button" class="btn ghost" id="kbDel">Löschen</button></div>
        <p class="hint">Notizen sind z. B. interne Vorgaben oder Hausregeln. Appilot nutzt sie für Antworten in der Anwendung.</p>`;
      $("kbSave").addEventListener("click", async () => {
        k.title = $("kbTitle").value.trim() || "Notiz";
        k.text = $("kbText").value;
        await Store.kb.put(k);
        renderKbList();
        toast("Notiz gespeichert.");
      });
    }
    $("kbDel").addEventListener("click", async () => {
      if (!confirm("Eintrag „" + k.title + "“ löschen?")) return;
      await Store.kb.del(k.id);
      kbOpen = null;
      await load();
      openKb(null);
    });
  }
  $("newNote").addEventListener("click", async () => {
    const k = { id: Store.uid("notiz"), kind: "notiz", title: "Neue Notiz", text: "", created: new Date().toISOString() };
    await Store.kb.put(k);
    await load();
    openKb(k.id);
    $("kbTitle").select();
  });

  // ---------------------------------------------------------------------------
  // Updates der Anwendung: vergleichen, Befunde, Vorschläge, Nutzerkarte „Was ist neu“
  // ---------------------------------------------------------------------------
  const Upd = window.AppilotUpdate;
  let checking = false;
  let lastCheck = null;
  const plain = c => JSON.parse(JSON.stringify(c, (k, v) => (k.startsWith("_") ? undefined : v)));
  // Zuletzt gesehene Version der Zielanwendung (aus dem letzten Update-Check), gespeichert im Projekt
  const appVersion = () => projekt.seenVersion || "";
  // Update-Check: nur Cases mit Elementen der Anwendung (aufgenommen oder entworfen), nicht Schritte von Hand.
  const released = () => cases.filter(c => c.status === "freigegeben" && !isHand(c));
  // Freigegebene Cases, deren Vergleichsstand älter ist als die Version, die Appilot zuletzt in der Anwendung gesehen hat.
  function needsCheck() {
    const v = appVersion();
    return v ? released().filter(c => c.snapshot && c.snapshot.version && c.snapshot.version !== v && !(c.update && c.update.version === v)) : [];
  }
  const staleMedia = c => kbItems.filter(k => k.caseId === c.id && k.stale && (k.kind === "video" || k.kind === "anleitung"));
  function staleNote(k) {
    return k.stale ? `<p class="note warn">Veraltet: zeigt noch Version ${esc(k.stale.from)}. In Version ${esc(k.stale.version)} hat sich die Anwendung geändert. Nach der Freigabe der neuen Fassung erzeugen Sie Video und Klickanleitung im Case neu.</p>` : "";
  }

  function renderBanner() {
    const todo = needsCheck();
    const open = cases.filter(c => c.update && !c.update.applied).length;
    const n = todo.length + open;
    AppilotNav.setCount(n);
    const b = $("updBanner");
    b.hidden = !todo.length;
    if (!todo.length) return;
    b.innerHTML = `<span>✦ Appilot hat eine neue Version von ${esc(Projekt.appName(projekt))} bemerkt: <b>Version ${esc(appVersion())}</b>. ${todo.length === 1 ? "Ein freigegebener Case wurde" : todo.length + " freigegebene Cases wurden"} mit Version ${esc(todo[0].snapshot.version)} erstellt.</span><button type="button" class="btn small" id="bannerCheck">Jetzt auf Änderungen prüfen</button>`;
    $("bannerCheck").addEventListener("click", () => { showView("updates"); runCheck(); });
  }

  function updNote(text, kind) {
    const n = $("updNote");
    n.textContent = text;
    n.className = "note " + (kind || "");
    n.hidden = !text;
  }

  function renderUpdates() {
    const v = appVersion();
    const rel = released();
    const versions = [...new Set(rel.filter(c => c.snapshot).map(c => c.snapshot.version))];
    const without = rel.filter(c => !c.snapshot);
    $("updState").innerHTML = (v ? `${esc(Projekt.appName(projekt))}: <b>Version ${esc(v)}</b>` : "Appilot hat die Anwendung noch nicht geprüft") +
      ` · ${rel.length} freigegebene${rel.length === 1 ? "r Case" : " Cases"}` + (versions.length ? `, Vergleichsstand Version ${versions.map(esc).join(", ")}` : "") +
      (without.length ? ` · ohne Vergleichsstand: ${without.map(c => "„" + esc(c.title) + "“").join(", ")} (wird bei der nächsten Freigabe angelegt)` : "");
    $("btnCheck").disabled = checking || busy;
    const open = cases.filter(c => c.update);
    $("updCases").innerHTML = open.map(updCard).join("") ||
      (lastCheck ? `<p class="note ok">Geprüft am ${esc(fmtDate(lastCheck.at))}: Alle freigegebenen Cases passen zu Version ${esc(lastCheck.version)}.</p>` : "");
    $("updCases").querySelectorAll("[data-apply]").forEach(b => b.addEventListener("click", () => applyProposal(b.dataset.apply)));
    $("updCases").querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
      current = cases.find(c => c.id === b.dataset.open);
      showView("cases");
      renderList();
      renderDetail();
    }));
    renderNews();
  }

  function updCard(c) {
    const u = c.update;
    const count = l => u.findings.filter(f => f.level === l).length;
    const media = kbItems.filter(k => k.caseId === c.id && k.stale);
    const langs = Lang ? OTHER.filter(l => c.translations && c.translations[l]).map(l => Lang.LANGS[l]) : [];
    const courses = u.courses || [];
    const tags = [
      ...media.map(k => `<span class="tag old">${KIND[k.kind]} · veraltet</span>`),
      langs.length ? `<span class="tag old">Sprachfassungen (${langs.map(esc).join(", ")}) · werden mit der neuen Fassung neu erstellt</span>` : "",
      ...courses.map(t => `<span class="tag">Lernstrecke „${esc(t)}“</span>`),
    ].filter(Boolean);
    const action = u.applied
      ? `<p class="done">✓ Als Entwurf übernommen${c.status === "pruefung" ? ", liegt zur Prüfung bei " + PEOPLE.pruefer : ""}. Nach der Freigabe ist dieser Eintrag erledigt.</p><div class="btns"><button type="button" class="btn ghost small" data-open="${esc(c.id)}">Case öffnen</button></div>`
      : `<div class="btns"><button type="button" class="btn" data-apply="${esc(c.id)}" ${role === "autor" && !busy ? "" : "disabled"}>Vorschläge als Entwurf übernehmen</button><button type="button" class="btn ghost" data-open="${esc(c.id)}">Case öffnen</button></div>` +
        (role === "autor" ? `<p class="hint">Daraus entsteht eine neue Fassung im Entwurf. Sie geht wie jede Änderung durch Probelauf, Prüfung und Freigabe. Danach erzeugen Sie Video und Klickanleitung neu.</p>` : `<p class="hint">Übernehmen kann die Autorin. Wechseln Sie oben die Rolle.</p>`);
    return `<article class="upd-card">
      <header><h3>${esc(c.title)}</h3><span class="badge ${c.status}">${STATUS[c.status]}</span><small>Version ${esc(u.from)} → ${esc(u.version)}</small></header>
      <div class="affected">${["kaputt", "pruefen", "neu"].filter(count).map(l => `<span class="lvl ${l}" style="padding:2px 9px">${count(l)} ${Upd.LEVELS[l]}</span>`).join("")}</div>
      <ul class="findings">${u.findings.map(f => `<li><span class="lvl ${f.level}">${Upd.LEVELS[f.level]}</span><span>${esc(f.text)}</span></li>`).join("")}</ul>
      ${tags.length ? `<div class="affected"><b>Betroffen:</b> ${tags.join("")}</div>` : ""}
      <details ${u.applied ? "" : "open"}><summary>Vorschlag von Appilot (${u.proposal.changes.length} Änderungen)</summary><ul class="changes">${u.proposal.changes.map(x => `<li>${esc(x.text)}</li>`).join("")}</ul></details>
      ${action}
    </article>`;
  }

  // Karte der Anwendung: aus der Zielanwendung (Appilot-Protokoll) oder aus einer Datei (fromFile)
  async function runCheck(fromFile) {
    if (checking) return;
    if (!fromFile && !projekt.url) { updNote("Bitte zuerst unter „Projekt“ die Adresse der Zielanwendung eintragen oder eine Karte aus einer Datei prüfen.", "warn"); return; }
    checking = true;
    renderUpdates();
    updNote(fromFile ? "Appilot vergleicht die Karte aus der Datei mit dem Stand bei der Freigabe …" : "Appilot liest die Anwendung und vergleicht sie mit dem Stand bei der Freigabe …", "work");
    let map;
    try {
      map = fromFile ? await Upd.readMapFile(fromFile) : await Upd.readApp();
    } catch (err) {
      checking = false;
      renderUpdates();
      updNote((fromFile ? "Die Datei konnte nicht gelesen werden: " : "Die Anwendung konnte nicht gelesen werden: ") + err.message, "warn");
      return;
    }
    const v = map.version || appVersion();
    await Projekt.set({ seenVersion: v });
    projekt = await Projekt.get();
    const now = new Date().toISOString();
    const courses = (await Store.courses.all().catch(() => [])).map(k => ({ title: k.title, caseIds: (k.blocks || []).map(b => b.caseId || (b.videoId || "").replace(/^video-/, "")).filter(Boolean) }));
    const all = [];
    let affected = 0, baselined = 0;
    busy = true;
    try {
      for (const c of released()) {
        const found = Upd.diff(c, map);
        if (!found) {
          // Noch kein Vergleichsstand (z. B. freigegeben, ohne dass die Anwendung verbunden war): diese Karte gilt ab jetzt.
          c.snapshot = Upd.snapshot(c, map);
          baselined++;
          await Store.cases.put(plain(c));
          continue;
        }
        if (!found.length) {
          // Nichts geändert, was der Case nutzt: Vergleichsstand auf die neue Version setzen.
          if (c.snapshot.version !== v) c.snapshot = Upd.snapshot(c, map);
          delete c.update;
          await Store.cases.put(plain(c));
          continue;
        }
        affected++;
        all.push(...found);
        c.update = { version: v, from: c.snapshot.version, checked: now, findings: found, proposal: Upd.propose(c, found), applied: false,
          courses: courses.filter(k => k.caseIds.includes(c.id)).map(k => k.title) };
        await Store.cases.put(plain(c));
        for (const id of ["video-" + c.id, "anleitung-" + c.id]) {
          const k = await Store.kb.get(id);
          if (k && !k.stale) { k.stale = { from: c.snapshot.version, version: v, at: now }; await Store.kb.put(k); }
        }
      }
      if (all.length && !(await Store.kb.get("neu-" + v))) {
        await Store.kb.put({ id: "neu-" + v, kind: "neuigkeit", version: v, created: now, status: "entwurf",
          title: "Neu in Version " + v, text: "In " + Projekt.appName(projekt) + " hat sich etwas geändert, das Ihre Arbeit betrifft.", items: Upd.newsItems(all) });
      }
    } finally {
      busy = false;
      checking = false;
    }
    lastCheck = { version: v, at: now };
    await load();
    renderUpdates();
    const k = l => all.filter(f => f.level === l).length;
    updNote(all.length
      ? `Version ${v} geprüft: ${affected === 1 ? "ein Case" : affected + " Cases"} betroffen, ${k("kaputt")} kaputt, ${k("pruefen")} zu prüfen, ${k("neu")} neu. Videos und Klickanleitungen dazu sind als veraltet markiert.`
      : `Version ${v} geprüft: keine Änderungen, die freigegebene Cases betreffen.` +
        (baselined ? ` Für ${baselined === 1 ? "einen Case" : baselined + " Cases"} gilt Version ${v} jetzt als Vergleichsstand.` : ""), all.length ? "warn" : "ok");
  }
  $("btnCheck").addEventListener("click", () => runCheck());
  $("mapFile").addEventListener("change", e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) runCheck(file);
  });

  async function applyProposal(id) {
    const c = cases.find(x => x.id === id);
    if (!c || !c.update || role !== "autor") return;
    c.steps = c.update.proposal.steps.map(s => Object.assign({}, s));
    c.update.applied = true;
    c.status = "entwurf";
    c.reviewer = "";
    c.updated = new Date().toISOString();
    await Store.cases.put(plain(c));
    current = c;
    await load();
    showView("cases");
    note("Neue Fassung für Version " + c.update.version + " als Entwurf angelegt. Die geänderten Schritte sind markiert. Prüfen Sie sie mit dem Probelauf und geben Sie den Case dann zur Prüfung.", "ok");
  }

  // Nutzerkarte „Neu in Version …“: Appilot schlägt sie vor, der Fachbereich passt sie an und gibt sie frei.
  let newsTimer = null;
  function renderNews() {
    const v = appVersion();
    const k = kbItems.find(x => x.kind === "neuigkeit" && x.version === v);
    if (!k) { $("updNews").innerHTML = ""; return; }
    const ok = k.status === "freigegeben";
    const dis = ok ? "disabled" : "";
    $("updNews").innerHTML = `<section class="upd-news">
      <div class="section-head"><h3>Nutzerkarte „${esc(k.title)}“</h3><span class="badge ${ok ? "freigegeben" : "entwurf"}">${ok ? "Für Nutzer freigegeben" + (k.approvedBy ? " · " + esc(k.approvedBy) : "") : "Entwurf"}</span></div>
      <p class="hint">In der Anwendung fragt Appilot: „${esc(k.title)}. Soll ich es Ihnen zeigen?“ und zeigt mit dem Zeiger auf jede Änderung. Passen Sie die Texte an. Nutzer sehen die Karte erst nach der Freigabe.</p>
      <input id="newsTitle" value="${esc(k.title)}" ${dis} aria-label="Titel der Karte" style="margin-top:10px;font-weight:600">
      <textarea id="newsText" rows="2" ${dis} aria-label="Einleitung" style="margin-top:6px">${esc(k.text)}</textarea>
      ${(k.items || []).map((x, i) => `<div class="news-item" data-i="${i}"><input value="${esc(x.title)}" ${dis} aria-label="Änderung ${i + 1}"><textarea rows="2" ${dis} aria-label="Erklärung ${i + 1}">${esc(x.text)}</textarea>${ok ? "" : `<button type="button" title="Änderung entfernen">✕</button>`}</div>`).join("")}
      <div class="btns">${ok ? `<button type="button" class="btn ghost" id="newsWithdraw">Freigabe zurücknehmen</button>${projekt.url ? `<a class="btn ghost" href="${esc(projekt.url)}" target="zielanwendung">In der Anwendung ansehen ↗</a>` : ""}` : `<button type="button" class="btn" id="newsApprove" ${(k.items || []).length ? "" : "disabled"}>Für Nutzer freigeben</button>`}</div>
    </section>`;
    const put = async () => { await Store.kb.put(k); };
    const later = () => { clearTimeout(newsTimer); newsTimer = setTimeout(() => { saving++; put().finally(() => saving--); }, 400); };
    if (!ok) {
      $("newsTitle").addEventListener("input", e => { k.title = e.target.value; later(); });
      $("newsText").addEventListener("input", e => { k.text = e.target.value; later(); });
      $("updNews").querySelectorAll(".news-item").forEach(el => {
        const i = +el.dataset.i;
        el.querySelector("input").addEventListener("input", e => { k.items[i].title = e.target.value; later(); });
        el.querySelector("textarea").addEventListener("input", e => { k.items[i].text = e.target.value; later(); });
        el.querySelector("button").addEventListener("click", async () => { k.items.splice(i, 1); await put(); renderNews(); });
      });
      $("newsApprove").addEventListener("click", async () => {
        clearTimeout(newsTimer);
        Object.assign(k, { status: "freigegeben", approvedBy: PEOPLE[role], approved: new Date().toISOString() });
        await put();
        await load();
        toast("Freigegeben. Appilot zeigt die Karte allen Nutzern von Version " + k.version + ".");
      });
    } else {
      $("newsWithdraw").addEventListener("click", async () => {
        Object.assign(k, { status: "entwurf", approvedBy: "", approved: "" });
        await put();
        await load();
      });
    }
  }


  load().then(() => {
    const m = location.hash.match(/^#kb=(.+)$/);
    const c = location.hash.match(/^#case=(.+)$/);
    if (m) { showView("kb", { keepHash: true }); openKb(decodeURIComponent(m[1])); }
    else if (c && cases.some(x => x.id === decodeURIComponent(c[1]))) { showView("cases", { keepHash: true }); current = cases.find(x => x.id === decodeURIComponent(c[1])); renderList(); renderDetail(); }
    else {
      if (cases.length && location.hash !== "#neu") { current = cases.find(c => c.status === "entwurf") || cases[0]; renderList(); renderDetail(); }
      route();
    }
  });
})();
