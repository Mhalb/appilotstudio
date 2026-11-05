// Appilot-Aufnahme · Aufnahme-Skript im Tab der Anwendung
// Merkt sich Klicks und Eingaben, bestimmt den Namen des Elements wie ein Screenreader und seinen Bereich und meldet
// beides dem Hintergrund, der das Bildschirmfoto macht. Es blendet nichts in die Seite ein und ändert nichts an ihr.
// Werte aus Passwortfeldern und ähnlichen Feldern werden nie gemeldet.
(() => {
  if (window.__appilotAufnahme) return;
  const listeners = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); };
  let observer = null;
  window.__appilotAufnahme = { stop };

  const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
  const txt = s => (s || "").replace(/\s+/g, " ").trim();

  // ---------------------------------------------------------------------------
  // Was gilt als bedienbares Element
  // ---------------------------------------------------------------------------
  const SEL = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=checkbox],[role=radio],[role=switch],[role=option],[role=combobox],[role=textbox],[role=searchbox],[role=treeitem],[role=listitem],[role=row],[role=gridcell],[contenteditable=true]";
  const FIELD_TYPES = ["text", "email", "search", "tel", "url", "number", "password", "date", "datetime-local", "time", "month", "week", "color", "range"];
  const isField = el => (el.tagName === "INPUT" && FIELD_TYPES.includes((el.type || "text").toLowerCase())) || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
  const isToggle = el => el.tagName === "INPUT" && ["checkbox", "radio"].includes(el.type);

  function target(start) {
    let el = start && start.closest ? start.closest(SEL) : null;
    if (el) return el;
    // Elemente ohne Rolle, die wie ein Knopf wirken (Mauszeiger „Hand“), z. B. in älteren Anwendungen
    for (let e = start, i = 0; e && e !== document.body && i < 5; e = e.parentElement, i++) {
      if (e.nodeType === 1 && getComputedStyle(e).cursor === "pointer") return e;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Rolle und Name wie ein Screenreader
  // ---------------------------------------------------------------------------
  const TAG_ROLE = { A: "link", BUTTON: "button", SELECT: "combobox", TEXTAREA: "textbox", SUMMARY: "button" };
  function role(el) {
    const r = el.getAttribute("role");
    if (r) return r.split(" ")[0];
    if (el.tagName === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return { checkbox: "checkbox", radio: "radio", button: "button", submit: "button", reset: "button", image: "button", file: "button", range: "slider", search: "searchbox" }[t] || "textbox";
    }
    return TAG_ROLE[el.tagName] || (el.isContentEditable ? "textbox" : "generic");
  }
  const ROLE_WORD = { button: "Knopf", link: "Link", textbox: "Feld", searchbox: "Suchfeld", combobox: "Liste", checkbox: "Kästchen", radio: "Option", switch: "Schalter",
    tab: "Reiter", menuitem: "Menüpunkt", menuitemcheckbox: "Menüpunkt", menuitemradio: "Menüpunkt", option: "Eintrag", listitem: "Eintrag", treeitem: "Eintrag", row: "Zeile", gridcell: "Zelle", slider: "Regler" };

  // Nur für Screenreader gedachte oder versteckte Teile weglassen (z. B. „Hervorgehoben“ in SAP Fiori)
  const HIDDEN_CLASS = /(^|\s|-)(sr-only|visually-hidden|visuallyhidden|screen-reader-text|sapUiInvisibleText|a11y-hidden|offscreen)(\s|$)/i;
  function hidden(e) {
    if (HIDDEN_CLASS.test(e.className && e.className.baseVal === undefined ? e.className : "")) return true;
    if (e.getAttribute("aria-hidden") === "true") return true;
    const s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden") return true;
    if (s.position === "absolute" && (parseFloat(s.width) <= 1 || parseFloat(s.height) <= 1) && s.overflow === "hidden") return true;
    return /rect\(0(px)?,? ?0(px)?,? ?0(px)?,? ?0(px)?\)/.test(s.clip) || s.clipPath === "inset(50%)";
  }
  function visibleText(el, max = 160) {
    let out = "";
    const walk = n => {
      if (out.length > max) return;
      if (n.nodeType === 3) { out += n.nodeValue + " "; return; }
      if (n.nodeType !== 1 || hidden(n)) return;
      if (n.tagName === "IMG") { out += (n.getAttribute("alt") || "") + " "; return; }
      if (n.tagName === "SVG" || n.tagName === "svg") { const t = n.querySelector("title"); if (t) out += t.textContent + " "; return; }
      for (const c of n.childNodes) walk(c);
    };
    walk(el);
    return txt(out).slice(0, max);
  }
  const byIds = ids => txt(ids.split(/\s+/).map(id => { const e = document.getElementById(id); return e ? visibleText(e) || txt(e.textContent) : ""; }).join(" "));

  function name(el) {
    const lb = el.getAttribute("aria-labelledby");
    if (lb) { const n = byIds(lb); if (n) return n; }
    const al = txt(el.getAttribute("aria-label")); if (al) return al;
    if (el.labels && el.labels.length) { const n = txt([...el.labels].map(l => visibleText(l)).join(" ")); if (n) return n; }
    if (el.tagName === "INPUT" && ["submit", "button", "reset"].includes(el.type) && txt(el.value)) return txt(el.value);
    if (el.tagName === "INPUT" && el.type === "image" && txt(el.alt)) return txt(el.alt);
    const r = role(el);
    // Listeneinträge, Zeilen: Titel des Eintrags statt Preis, Status und Nebentexte
    if (["listitem", "row", "option", "treeitem", "gridcell"].includes(r)) {
      const t = el.querySelector("[role=heading],h1,h2,h3,h4,h5,[class*=Title]:not([class*=Subtitle]),[class*=title]:not([class*=subtitle]),strong,b");
      if (t) { const n = visibleText(t, 80); if (n) return n; }
    }
    if (!isField(el)) { const n = visibleText(el, 80); if (n) return n; }
    const t = txt(el.getAttribute("title")); if (t) return t;
    const ph = txt(el.getAttribute("placeholder")); if (ph) return ph;
    if (el.name) return txt(el.name);
    return "";
  }
  const label = (r, n) => (ROLE_WORD[r] || "Element") + (n ? " „" + n + "“" : "");

  // Werte, die nie in eine Aufnahme gehören
  function secret(el) {
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return false;
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    return el.type === "password" || /cc-|one-time-code|password/.test(ac);
  }

  const rectOf = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };

  // ---------------------------------------------------------------------------
  // Änderungen der Seite: daraus entstehen die „ruhigen Bilder“ im Hintergrund
  // ---------------------------------------------------------------------------
  let lastChange = Date.now(), timer = null, firstPending = 0;
  function changed() {
    lastChange = Date.now();
    clearTimeout(timer);
    if (!firstPending) firstPending = lastChange;
    // 300 ms Ruhe abwarten, bei ständiger Bewegung spätestens nach 700 ms
    const delay = Math.max(0, Math.min(300, 700 - (lastChange - firstPending)));
    timer = setTimeout(() => { firstPending = 0; if (!document.hidden) send({ type: "quiet" }); }, delay);
  }

  // ---------------------------------------------------------------------------
  // Klicks: Bild sofort beim Drücken der Maustaste, bevor die Seite reagiert
  // ---------------------------------------------------------------------------
  on(document, "pointerdown", e => {
    if (!e.isPrimary || e.button !== 0) return;
    // Klick auf die Beschriftung eines Felds oder Häkchens: Das Feld meldet sich selbst über „change“.
    const lab = e.target.closest && e.target.closest("label");
    if (lab && lab.control && (isField(lab.control) || isToggle(lab.control))) return;
    const el = target(e.target);
    if (!el || isField(el) || isToggle(el) || el.isContentEditable) return; // Felder und Häkchen über „change“
    const r = role(el), n = name(el);
    const upload = el.tagName === "INPUT" && el.type === "file";
    send({ type: "step", when: "down", lastChange, step: { action: upload ? "upload" : "click", role: r, name: n, label: label(r, n), rect: rectOf(el), viewportWidth: innerWidth } });
  }, true);

  // Eingaben, Auswahl, Häkchen: Bild nach der Änderung (Wert ist sichtbar)
  on(document, "change", e => {
    const el = e.target;
    if (!el || el.nodeType !== 1) return;
    if (el.tagName === "INPUT" && el.type === "file") return; // schon beim Klick aufgenommen
    if (!isField(el) && !isToggle(el)) return;
    const r = role(el), n = name(el);
    const step = { role: r, name: n, label: label(r, n), rect: rectOf(el), viewportWidth: innerWidth };
    if (isToggle(el)) Object.assign(step, { action: el.type === "radio" ? "click" : "check" });
    else if (el.tagName === "SELECT") {
      const opt = el.selectedOptions && el.selectedOptions[0];
      Object.assign(step, { action: "select", value: String(el.value || "").slice(0, 200), valueText: opt ? txt(opt.textContent).slice(0, 200) : "" });
    } else {
      const s = secret(el);
      Object.assign(step, { action: "input", secret: s, value: s ? "" : String(el.value || "").slice(0, 200) });
    }
    send({ type: "step", when: "after", lastChange: Date.now(), step });
  }, true);

  observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  on(document, "input", changed, true); // Tippen ändert den DOM nicht, aber das Bild
  on(window, "scroll", changed, { capture: true, passive: true });
  on(window, "resize", changed, { passive: true });
  changed();

  function stop() {
    for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
    if (observer) observer.disconnect();
    clearTimeout(timer);
    delete window.__appilotAufnahme;
  }
  chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type === "appilot-stop" && window.__appilotAufnahme) stop(); });
})();
