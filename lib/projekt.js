// Projekte: Ein Projekt ist ein Auftrag mit einer Zielanwendung, z. B. „Einführung Kundenportal“ für die Muster GmbH.
// Felder: title (Projektname), kunde, name und url der Zielanwendung, audience (Zielgruppe der Lernstrecken),
// seenVersion (zuletzt gesehene Version der Anwendung, Update-Check), archived.
// Cases, Lernstrecken und Medien gehören immer zum aktuellen Projekt (siehe lib/store.js).
//
// Die Zielanwendung ist die Web-Anwendung, zu der Cases, Videos und Lernstrecken entstehen. Mit ihr spricht das Studio
// über das Appilot-Protokoll (siehe README): Aufnahme, Probelauf, Bildschirmfotos, Karte der Masken für den Update-Check.
(function () {
  const Store = window.AppilotStore;
  const DEFAULTS = { id: "", title: "", kunde: "", name: "", url: "", audience: "Beschäftigte, die die Anwendung im Arbeitsalltag nutzen", seenVersion: "", archived: false };
  let cache = null;

  function clean(values, base) {
    const next = Object.assign({}, DEFAULTS, base, values);
    for (const k of ["title", "kunde", "name", "url", "audience"]) next[k] = String(next[k] || "").trim();
    next.title = next.title.slice(0, 120) || next.name || "Neues Projekt";
    next.kunde = next.kunde.slice(0, 120);
    next.audience = next.audience || DEFAULTS.audience;
    if (next.url && !/^https?:\/\//i.test(next.url)) throw new Error("Die Adresse muss mit http:// oder https:// beginnen.");
    next.updated = new Date().toISOString();
    return next;
  }

  // Aktuelles Projekt
  async function get() {
    if (!cache) {
      await Store.ready;
      cache = Object.assign({}, DEFAULTS, (await Store.projects.get(Store.currentProjectId())) || {});
    }
    return cache;
  }

  async function set(values) {
    const next = clean(values, await get());
    await Store.projects.put(next);
    cache = next;
    return next;
  }

  // Alle Projekte, sortiert nach Kunde und Name
  async function list({ archived = false } = {}) {
    await Store.ready;
    const all = (await Store.projects.all()).filter(p => archived || !p.archived);
    const key = p => ((p.kunde || "~") + " " + p.title).toLowerCase();
    return all.sort((a, b) => key(a).localeCompare(key(b), "de"));
  }

  // Neues Projekt anlegen und öffnen
  async function create(values) {
    const p = clean(values, { id: Store.uid("projekt"), created: new Date().toISOString() });
    await Store.projects.put(p);
    await Store.switchProject(p.id);
    return p;
  }

  async function archive(id, archived = true) {
    await Store.ready;
    if (archived && id === Store.currentProjectId()) throw new Error("Das geöffnete Projekt lässt sich nicht archivieren. Öffnen Sie zuerst ein anderes.");
    const p = await Store.projects.get(id);
    if (!p) return;
    p.archived = archived;
    p.updated = new Date().toISOString();
    await Store.projects.put(p);
  }

  const open = id => Store.switchProject(id);

  Store.onChange(name => { if (name === "projects" || name === "meta") cache = null; });

  // Name für Texte: „die Zielanwendung“, solange keiner eingetragen ist.
  const appName = p => (p && p.name) || "die Zielanwendung";
  // Projekt für Anzeigen: „Einführung Kundenportal · Muster GmbH“
  const label = p => (p ? p.title + (p.kunde ? " · " + p.kunde : "") : "");

  // Adresse der Anwendung mit Appilot-Parametern, z. B. { appilot: "play" } oder { appilotCase: "case-1" }.
  function appUrl(p, params = {}) {
    if (!p || !p.url) throw new Error("Bitte zuerst in den Projekteinstellungen die Adresse der Zielanwendung eintragen.");
    const u = new URL(p.url, location.href);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  // Herkunft der Anwendung: Nachrichten werden nur an sie geschickt und nur von ihr angenommen.
  const appOrigin = p => (p && p.url ? new URL(p.url, location.href).origin : null);

  window.AppilotProjekt = { DEFAULTS, get, set, list, create, archive, open, appName, label, appUrl, appOrigin };
})();
