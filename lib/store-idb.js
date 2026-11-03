// Speicher im Browser (IndexedDB). Erfüllt die Schnittstelle aus lib/store.js.
// Alles bleibt auf diesem Rechner. In Schritt 2 ersetzt ein Server mit Datenbank diesen Speicher.
(function () {
  const DB_NAME = "appilot-studio";
  const VERSION = 1;
  const TABLES = ["cases", "kb", "courses", "meta"];
  const KEYS = { meta: "key" };
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: KEYS[t] || "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Öffnet ein anderer Tab eine neuere Version, geben wir die Verbindung frei.
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      // Ein noch offener Tab mit dem alten Stand hält die Datenbank fest. Bis er neu lädt, wartet das Öffnen.
      req.onblocked = () => blockedHint();
    });
    return dbPromise;
  }

  function blockedHint() {
    if (document.getElementById("appilot-blocked")) return;
    const d = document.createElement("div");
    d.id = "appilot-blocked";
    d.textContent = "Das Studio wurde aktualisiert. Bitte laden Sie die anderen geöffneten Studio-Tabs einmal neu oder schließen Sie sie. Danach geht es hier automatisch weiter.";
    d.style.cssText = "position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:9999;max-width:560px;background:#fff3e6;color:#a33b00;border:1px solid #f0c9a8;border-radius:12px;padding:12px 16px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.15)";
    (document.body || document.documentElement).append(d);
    open().then(() => d.remove(), () => {});
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const result = fn(t.objectStore(store));
      t.oncomplete = () => resolve(result && "result" in result ? result.result : result);
      t.onerror = () => reject(t.error);
    });
  }

  function table(name, notify) {
    return {
      all: () => tx(name, "readonly", s => s.getAll()),
      get: id => tx(name, "readonly", s => s.get(id)),
      put: item => tx(name, "readwrite", s => s.put(item)).then(() => { notify(name); return item; }),
      del: id => tx(name, "readwrite", s => s.delete(id)).then(() => notify(name)),
    };
  }

  // Andere Tabs (Case-Editor, Lern-Editor, Lernansicht) erfahren von Änderungen.
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(DB_NAME) : null;
  const listeners = [];
  function notify(name) {
    if (channel) channel.postMessage({ changed: name });
    listeners.forEach(fn => fn(name));
  }
  if (channel) channel.onmessage = e => listeners.forEach(fn => fn(e.data.changed));

  const backend = { onChange: fn => listeners.push(fn) };
  for (const t of TABLES) backend[t] = table(t, notify);
  window.AppilotStoreIDB = backend;
})();
