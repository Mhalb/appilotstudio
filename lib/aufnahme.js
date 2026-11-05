// Aufnahme aus der Browser-Erweiterung importieren (Datei .appilot.json, Format siehe README und docs/erweiterung.md).
// Die Datei ist fremde Eingabe: Format, Größen und Texte werden geprüft und gekürzt, unbekannte Felder verworfen.
// Die Bilder prüft hier nur die Form; neu erzeugt (über eine Zeichenfläche) werden sie im Case-Editor.
//
//   AppilotAufnahme.parse(text)  ->  { title, app: { url, title }, created, recorder, steps: [...] }  oder Error
//   AppilotAufnahme.stepTitle(step)  vorläufiger Titel, bis Appilot die Texte formuliert
(function () {
  const FORMAT = "appilot-aufnahme";
  const VERSION = 1;
  const MAX_BYTES = 50 * 1024 * 1024;
  const MAX_STEPS = 100;
  const MAX_SHOT_CHARS = 8 * 1024 * 1024; // ein Bild als data:-Adresse
  const ACTIONS = ["click", "input", "select", "check", "upload", "info"];
  const IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

  const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
  const num = v => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const httpUrl = v => {
    const s = str(v, 500);
    try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.toString() : ""; } catch { return ""; }
  };

  function shotOf(s) {
    const sh = s && s.shot;
    if (!sh || typeof sh.dataUrl !== "string") return null;
    if (sh.dataUrl.length > MAX_SHOT_CHARS || !IMAGE.test(sh.dataUrl)) return null;
    const width = num(sh.width), height = num(sh.height);
    if (!(width >= 50 && width <= 10000 && height >= 50 && height <= 20000)) return null;
    return { dataUrl: sh.dataUrl, width: Math.round(width), height: Math.round(height) };
  }

  // Markierter Bereich: muss im Bild liegen, sonst ohne Markierung.
  function rectOf(s, shot) {
    const r = s && s.rect;
    if (!r || !shot) return null;
    let x = num(r.x), y = num(r.y), w = num(r.w), h = num(r.h);
    if ([x, y, w, h].some(Number.isNaN) || w < 4 || h < 4) return null;
    x = Math.max(0, x); y = Math.max(0, y);
    w = Math.min(w, shot.width - x); h = Math.min(h, shot.height - y);
    if (w < 4 || h < 4) return null;
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  function parse(text) {
    if (typeof text !== "string" || !text.length) throw new Error("Die Datei ist leer.");
    if (text.length > MAX_BYTES) throw new Error("Die Datei ist größer als 50 MB.");
    let raw;
    try { raw = JSON.parse(text); } catch { throw new Error("Das ist keine Aufnahme der Appilot-Erweiterung (kein gültiges JSON)."); }
    if (!raw || typeof raw !== "object" || raw.format !== FORMAT) throw new Error("Das ist keine Aufnahme der Appilot-Erweiterung.");
    if (raw.version !== VERSION) throw new Error(`Diese Aufnahme hat Version ${str(String(raw.version), 10)}. Das Studio kennt Version ${VERSION}; bitte Studio oder Erweiterung aktualisieren.`);
    if (!Array.isArray(raw.steps) || !raw.steps.length) throw new Error("Die Aufnahme enthält keine Schritte.");
    if (raw.steps.length > MAX_STEPS) throw new Error(`Die Aufnahme hat mehr als ${MAX_STEPS} Schritte. Bitte in kleinere Abläufe teilen.`);

    const steps = raw.steps.map(s => {
      const action = ACTIONS.includes(s && s.action) ? s.action : "info";
      const shot = shotOf(s);
      const secret = action === "input" && s && s.secret === true;
      return {
        action,
        label: str(s && s.label, 120),
        name: str(s && s.name, 120),
        role: str(s && s.role, 40),
        value: secret ? "" : str(s && s.value, 200),
        valueText: secret ? "" : str(s && (s.valueText || s.value), 200),
        secret,
        url: httpUrl(s && s.url),
        pageTitle: str(s && s.pageTitle, 200),
        shot,
        rect: rectOf(s, shot),
      };
    });

    const created = str(raw.created, 40);
    return {
      title: str(raw.title, 120) || "Aufnahme",
      app: { url: httpUrl(raw.app && raw.app.url), title: str(raw.app && raw.app.title, 120) },
      created: created && !Number.isNaN(Date.parse(created)) ? new Date(created).toISOString() : "",
      recorder: str(raw.recorder, 80),
      steps,
    };
  }

  // Vorläufiger Titel aus Aktion und Name des Elements, z. B. „Auf ‚Neuer Kunde‘ klicken“.
  function stepTitle(s) {
    const n = s.name ? "„" + s.name + "“" : s.label || "das Element";
    switch (s.action) {
      case "click": return "Auf " + n + " klicken";
      case "input": return n + " ausfüllen";
      case "select": return s.valueText ? "In " + n + " „" + s.valueText + "“ wählen" : "In " + n + " auswählen";
      case "check": return n + " ankreuzen";
      case "upload": return "Datei bei " + n + " anhängen";
      default: return s.label || s.pageTitle || "Hinweis";
    }
  }

  window.AppilotAufnahme = { FORMAT, VERSION, MAX_STEPS, parse, stepTitle };
})();
