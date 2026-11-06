// Speicher des Studios: die einzige Stelle, über die Editor, Lern-Editor, Lernansicht und Startseite Daten lesen und
// schreiben.
//
// Schnittstelle (alle Methoden liefern Promises):
//   Store.cases | Store.kb | Store.courses     Inhalte des aktuellen Projekts
//     .all()      alle Einträge des aktuellen Projekts
//     .get(id)    ein Eintrag des aktuellen Projekts oder undefined
//     .put(item)  anlegen oder ersetzen; neue Einträge bekommen projectId des aktuellen Projekts
//     .del(id)    löschen
//   Store.projects                            alle Projekte (gleiche Methoden, ohne Filter)
//   Store.meta                                Einstellungen (.get(key), .put({ key, … }))
//   Store.ready                               Promise: Projekte geladen, alte Daten übernommen
//   Store.currentProjectId()                  ID des aktuellen Projekts (nach Store.ready)
//   Store.switchProject(id)                   anderes Projekt öffnen (lädt die Seite neu)
//   Store.countByProject()                    { [projectId]: { cases, courses, media } }
//   Store.onChange(fn)  fn(tabelle) nach jeder Änderung, auch aus anderen Tabs
//   Store.uid(prefix)   neue ID
//
// Projekte: Jeder Case, jede Lernstrecke und jeder Eintrag in „Medien“ gehört zu genau einem Projekt (projectId). Das
// aktuelle Projekt merkt sich der Speicher unter meta „aktuellesProjekt“. Beim ersten Start nach der Umstellung entsteht
// aus dem bisherigen Projekt (meta „projekt“) das erste Projekt, und alle vorhandenen Inhalte kommen dort hinein.
// Die Datenformate von Case und Lernstrecke bleiben unabhängig vom Speicher gleich (nur projectId kommt dazu).
(function () {
  const backend = window.AppilotStoreIDB;
  if (!backend) throw new Error("Kein Speicher geladen: lib/store-idb.js fehlt vor lib/store.js.");
  const uid = prefix => prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const SCOPED = ["cases", "kb", "courses"];
  const CURRENT = "aktuellesProjekt";
  let currentId = null;

  async function init() {
    const now = new Date().toISOString();
    let projects = await backend.projects.all();
    if (!projects.length) {
      const old = (await backend.meta.get("projekt")) || {};
      const first = {
        // feste ID: Öffnen zwei Tabs gleichzeitig, entsteht trotzdem nur ein Projekt
        id: "projekt-1", title: old.name || "Mein erstes Projekt", kunde: "", name: old.name || "", url: old.url || "",
        audience: old.audience || "", seenVersion: old.seenVersion || "", archived: false, created: now, updated: now,
      };
      await backend.projects.put(first);
      projects = [first];
    }
    const saved = await backend.meta.get(CURRENT);
    const open = projects.filter(p => !p.archived);
    currentId = saved && projects.some(p => p.id === saved.id) ? saved.id : (open[0] || projects[0]).id;
    if (!saved || saved.id !== currentId) await backend.meta.put({ key: CURRENT, id: currentId });
    // Inhalte ohne Projekt (aus der Zeit vor den Projekten) dem aktuellen Projekt zuordnen
    for (const t of SCOPED) {
      for (const item of await backend[t].all()) if (!item.projectId) await backend[t].put(Object.assign(item, { projectId: currentId }));
    }
  }
  const ready = init();

  function scoped(name) {
    const b = backend[name];
    return {
      all: async () => { await ready; return (await b.all()).filter(x => x.projectId === currentId); },
      get: async id => { await ready; const x = await b.get(id); return x && x.projectId === currentId ? x : undefined; },
      put: async item => { await ready; if (!item.projectId) item.projectId = currentId; return b.put(item); },
      del: async id => { await ready; return b.del(id); },
    };
  }

  async function switchProject(id) {
    await ready;
    const p = await backend.projects.get(id);
    if (!p) throw new Error("Dieses Projekt gibt es nicht.");
    await backend.meta.put({ key: CURRENT, id });
    location.reload();
  }

  async function countByProject() {
    await ready;
    const out = {};
    const add = (pid, k) => { (out[pid] = out[pid] || { cases: 0, courses: 0, media: 0 })[k]++; };
    for (const c of await backend.cases.all()) add(c.projectId, "cases");
    for (const k of await backend.courses.all()) add(k.projectId, "courses");
    for (const m of await backend.kb.all()) if (m.kind === "video" || m.kind === "anleitung") add(m.projectId, "media");
    return out;
  }

  // Wechselt ein anderer Tab das Projekt, zeigt dieser Tab sonst das falsche Projekt: neu laden.
  backend.onChange(async name => {
    if (name !== "meta" || currentId === null) return;
    const saved = await backend.meta.get(CURRENT);
    if (saved && saved.id !== currentId) location.reload();
  });

  window.AppilotStore = {
    cases: scoped("cases"),
    kb: scoped("kb"),
    courses: scoped("courses"),
    projects: backend.projects,
    meta: backend.meta,
    ready,
    currentProjectId: () => currentId,
    switchProject,
    countByProject,
    onChange: backend.onChange,
    uid,
  };
})();
