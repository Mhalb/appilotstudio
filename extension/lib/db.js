// Speicher der Erweiterung: Aufnahmen und ihre Schritte in IndexedDB (braucht kein zusätzliches Recht).
// Eine Aufnahme liegt hier nur, bis sie als Datei gespeichert oder verworfen wird.
const DB_NAME = "appilot-aufnahme";
const VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("recordings")) db.createObjectStore("recordings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("steps")) {
        const s = db.createObjectStore("steps", { keyPath: "id", autoIncrement: true });
        s.createIndex("rec", "rec");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then(r => { result = r; });
    t.oncomplete = () => resolve(result && "result" in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const putRecording = rec => tx("recordings", "readwrite", t => { t.objectStore("recordings").put(rec); return rec; });
export const getRecording = id => tx("recordings", "readonly", t => t.objectStore("recordings").get(id));
export const allRecordings = () => tx("recordings", "readonly", t => t.objectStore("recordings").getAll());
export const addStep = step => tx("steps", "readwrite", t => t.objectStore("steps").add(step));
export const putStep = step => tx("steps", "readwrite", t => { t.objectStore("steps").put(step); return step; });
export const deleteStep = id => tx("steps", "readwrite", t => { t.objectStore("steps").delete(id); });
export const stepsOf = rec => tx("steps", "readonly", t => t.objectStore("steps").index("rec").getAll(rec))
  .then(list => list.sort((a, b) => a.at - b.at));

export async function deleteRecording(id) {
  const steps = await stepsOf(id);
  await tx(["recordings", "steps"], "readwrite", t => {
    for (const s of steps) t.objectStore("steps").delete(s.id);
    t.objectStore("recordings").delete(id);
  });
}
