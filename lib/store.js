// Speicher des Studios: die einzige Stelle, über die Editor, Lern-Editor und Lernansicht Daten lesen und schreiben.
//
// Schnittstelle (alle Methoden liefern Promises):
//   Store.cases | Store.kb | Store.courses | Store.meta
//     .all()      alle Einträge
//     .get(id)    ein Eintrag oder undefined (meta: Schlüssel statt id)
//     .put(item)  anlegen oder ersetzen, liefert den Eintrag
//     .del(id)    löschen
//   Store.onChange(fn)  fn(tabelle) nach jeder Änderung, auch aus anderen Tabs
//   Store.uid(prefix)   neue ID
//
// Die Datenformate von Case und Lernstrecke bleiben unabhängig vom Speicher gleich.
// Heute liegt alles im Browser (lib/store-idb.js). In Schritt 2 kommt ein Server-Speicher mit derselben Schnittstelle.
(function () {
  const backend = window.AppilotStoreIDB;
  if (!backend) throw new Error("Kein Speicher geladen: lib/store-idb.js fehlt vor lib/store.js.");
  const uid = prefix => prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  window.AppilotStore = {
    cases: backend.cases,
    kb: backend.kb,
    courses: backend.courses,
    meta: backend.meta,
    onChange: backend.onChange,
    uid,
  };
})();
