import type { Pack, Records } from "./engine";
let connection: Promise<IDBDatabase> | undefined;
function db() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("word-atlas-private-cambridge", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("packs", { keyPath: "book" });
      r.result.createObjectStore("state");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function loadPacks(): Promise<Pack[]> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("packs").objectStore("packs").getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function loadRecords(key: string): Promise<Records> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("state").objectStore("state").get(key);
    r.onsuccess = () => resolve(r.result ?? { attempts: [], activeId: null });
    r.onerror = () => reject(r.error);
  });
}
export async function save(store: string, value: unknown, key?: string) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const t = d.transaction(store, "readwrite");
    if (key === undefined) t.objectStore(store).put(value);
    else t.objectStore(store).put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
