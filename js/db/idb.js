/**
 * A small promise-based wrapper around IndexedDB, plus the database schema.
 *
 * Why not a library? The app only needs get/put/delete/getAll and transactions,
 * which is ~100 lines. Keeping it in-house means zero dependencies.
 *
 * Schema changes: bump DB_VERSION and add a new `if (oldVersion < N)` block in
 * migrate(). Blocks run in order, so a fresh install and an old install both end
 * up with the same schema.
 */
export const DB_VERSION = 1;
let dbName = 'recomp';

/** Lets the test suite use its own throwaway database. Must be called before openDB(). */
export function useDatabase(name) {
  if (dbPromise) throw new Error('useDatabase() must be called before the database is opened');
  dbName = name;
}

/** Object store names, in one place so typos are caught early. */
export const STORES = {
  settings: 'settings',
  foods: 'foods',
  meals: 'meals',
  log: 'logEntries',
};

let dbPromise = null;

/** Opens (and if needed creates/upgrades) the database. Cached after the first call. */
export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_VERSION);
      request.onupgradeneeded = (event) => migrate(request.result, event.oldVersion);
      request.onsuccess = () => {
        const db = request.result;
        // Another tab opened a newer version: close so it can upgrade, then reload into it.
        db.onversionchange = () => {
          db.close();
          location.reload();
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => console.warn('Database upgrade blocked by another open tab.');
    });
  }
  return dbPromise;
}

function migrate(db, oldVersion) {
  if (oldVersion < 1) {
    // Single-row store for user settings, keyed by a fixed key ("main").
    db.createObjectStore(STORES.settings, { keyPath: 'key' });

    // Food library. Recent = sort by lastUsedAt; barcode lets scans find existing foods.
    const foods = db.createObjectStore(STORES.foods, { keyPath: 'id' });
    foods.createIndex('barcode', 'barcode', { unique: false });
    foods.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });

    // Saved meals ("My usual breakfast"), tagged with the meal slot they belong to.
    const meals = db.createObjectStore(STORES.meals, { keyPath: 'id' });
    meals.createIndex('mealType', 'mealType', { unique: false });

    // One row per logged item. `date` is a local "YYYY-MM-DD" key.
    const log = db.createObjectStore(STORES.log, { keyPath: 'id' });
    log.createIndex('date', 'date', { unique: false });
    log.createIndex('date_meal', ['date', 'meal'], { unique: false });
    log.createIndex('foodId', 'foodId', { unique: false });
  }
}

/** Wraps an IDBRequest in a promise. */
export function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Runs `work(stores)` inside one transaction and resolves when it commits.
 * `stores` maps each store name to its IDBObjectStore. Use this whenever several
 * writes must succeed or fail together (e.g. logging a whole saved meal).
 *
 * Inside `work`, only await IndexedDB requests — awaiting anything else
 * (fetch, timers) lets the transaction auto-commit early.
 */
export async function transaction(storeNames, mode, work) {
  const db = await openDB();
  const names = [].concat(storeNames);
  const tx = db.transaction(names, mode);
  const stores = Object.fromEntries(names.map((name) => [name, tx.objectStore(name)]));

  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

  let result;
  try {
    result = await work(stores);
  } catch (error) {
    try { tx.abort(); } catch { /* already finished */ }
    throw error;
  }
  await done;
  return result;
}

// ---- Convenience helpers for single operations ----

export const get = (store, key) =>
  transaction(store, 'readonly', (s) => promisify(s[store].get(key)));

export const put = (store, value) =>
  transaction(store, 'readwrite', (s) => promisify(s[store].put(value)));

export const del = (store, key) =>
  transaction(store, 'readwrite', (s) => promisify(s[store].delete(key)));

/** Merges `fields` into an existing record (no-op if it doesn't exist). Returns the result. */
export const patch = (store, key, fields) =>
  transaction(store, 'readwrite', async (s) => {
    const record = await promisify(s[store].get(key));
    if (!record) return null;
    const updated = { ...record, ...fields };
    s[store].put(updated);
    return updated;
  });

/** Gets all records, optionally via an index and key/range. */
export const getAll = (store, { index, query } = {}) =>
  transaction(store, 'readonly', (s) => {
    const source = index ? s[store].index(index) : s[store];
    return promisify(source.getAll(query));
  });

/** Generates a unique id for new records (string ids merge cleanly on backup import). */
export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
