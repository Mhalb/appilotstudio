// Projekteinstellungen: Zielanwendung (Name, Adresse) und Zielgruppe der Lernstrecken.
// Die Zielanwendung ist die Web-Anwendung, zu der Cases, Videos und Lernstrecken entstehen. Mit ihr spricht das Studio
// über das Appilot-Protokoll (siehe README): Aufnahme, Probelauf, Bildschirmfotos, Karte der Masken für den Update-Check.
(function () {
  const Store = window.AppilotStore;
  const DEFAULTS = { name: "", url: "", audience: "Beschäftigte, die die Anwendung im Arbeitsalltag nutzen" };
  let cache = null;

  async function get() {
    if (!cache) cache = Object.assign({}, DEFAULTS, (await Store.meta.get("projekt")) || {});
    return cache;
  }

  async function set(values) {
    const next = Object.assign({}, await get(), values, { key: "projekt" });
    next.name = String(next.name || "").trim();
    next.url = String(next.url || "").trim();
    next.audience = String(next.audience || "").trim() || DEFAULTS.audience;
    if (next.url && !/^https?:\/\//i.test(next.url)) throw new Error("Die Adresse muss mit http:// oder https:// beginnen.");
    await Store.meta.put(next);
    cache = next;
    return next;
  }

  Store.onChange(name => { if (name === "meta") cache = null; });

  // Name für Texte: „Zielanwendung“, solange keiner eingetragen ist.
  const appName = p => (p && p.name) || "die Zielanwendung";

  // Adresse der Anwendung mit Appilot-Parametern, z. B. { appilot: "play" } oder { appilotCase: "case-1" }.
  function appUrl(p, params = {}) {
    if (!p || !p.url) throw new Error("Bitte zuerst in den Projekteinstellungen die Adresse der Zielanwendung eintragen.");
    const u = new URL(p.url, location.href);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  // Herkunft der Anwendung: Nachrichten werden nur an sie geschickt und nur von ihr angenommen.
  const appOrigin = p => (p && p.url ? new URL(p.url, location.href).origin : null);

  window.AppilotProjekt = { DEFAULTS, get, set, appName, appUrl, appOrigin };
})();
