/* StallPOS v2 — storage. IndexedDB (large, durable) with a localStorage fallback.
   Keys: 'state' = the whole app state; 'backup:YYYY-MM-DD' = automatic daily snapshots. */
SP.db = (() => {
  const DB_NAME = 'stallpos-v2';
  const STORE = 'kv';
  const LS_PREFIX = 'stallpos-v2:';
  let dbPromise = null;
  let mode = 'indexeddb';

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      try {
        if (!window.indexedDB) throw new Error('no indexedDB');
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { mode = 'localstorage'; resolve(null); };
        req.onblocked = () => { mode = 'localstorage'; resolve(null); };
      } catch (e) {
        mode = 'localstorage';
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function get(key) {
    const db = await open();
    if (!db) {
      try { const v = localStorage.getItem(LS_PREFIX + key); return v ? JSON.parse(v) : undefined; }
      catch (e) { return undefined; }
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async function set(key, value) {
    const db = await open();
    if (!db) {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function del(key) {
    const db = await open();
    if (!db) { localStorage.removeItem(LS_PREFIX + key); return; }
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async function keys() {
    const db = await open();
    if (!db) {
      return Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).map(k => k.slice(LS_PREFIX.length));
    }
    return new Promise(resolve => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).getAllKeys();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([]);
    });
  }

  // Ask the browser not to evict our data (supported on most modern browsers)
  async function requestPersistence() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); }
    catch (e) {}
    return false;
  }

  return { get, set, del, keys, requestPersistence, get mode() { return mode; } };
})();
