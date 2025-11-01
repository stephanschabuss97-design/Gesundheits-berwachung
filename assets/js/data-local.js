/**
 * MODULE: DATA ACCESS (IndexedDB)
 * intent: lokale IndexedDB- und Konfig-Hilfen fuer Intake-/Doctor-Features
 * exports: initDB, putConf, getConf, getTimeZoneOffsetMs, dayIsoToMidnightIso,
 *          addEntry, updateEntry, getAllEntries, getEntryByRemoteId, deleteEntryLocal
 * notes: Logik unveraendert aus index.html extrahiert
 */

/* ===== IndexedDB ===== */
let db;
const DB_NAME = 'healthlog_db';
const STORE = 'entries';
const CONF = 'config';

// SUBMODULE: initDB @internal - initialisiert IndexedDB Stores (entries/config)
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 5);

    req.onupgradeneeded = e => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('byDateTime', 'dateTime', { unique: false });
        s.createIndex('byRemote', 'remote_id', { unique: false });
      } else {
        const s = e.target.transaction.objectStore(STORE);
        try {
          s.createIndex('byDateTime', 'dateTime', { unique: false });
        } catch (_) {}
        try {
          s.createIndex('byRemote', 'remote_id', { unique: false });
        } catch (_) {}
      }
      if (!db.objectStoreNames.contains(CONF)) {
        db.createObjectStore(CONF, { keyPath: 'key' });
      }
    };

    req.onsuccess = e => {
      db = e.target.result;
      db.onversionchange = () => db?.close?.();
      resolve();
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

/* --- IDB Helpers (global) --- */
function putConf(key, value) {
  return new Promise((res, rej) => {
    const tx = db.transaction(CONF, 'readwrite');
    tx.objectStore(CONF).put({ key, value });
    tx.oncomplete = () => res();
    tx.onerror = e => rej(e);
  });
}

function getConf(key) {
  diag.add?.(`[conf] getConf start ${key}`);
  return new Promise((res, rej) => {
    const tx = db.transaction(CONF, 'readonly');
    const rq = tx.objectStore(CONF).get(key);
    rq.onsuccess = () => {
      const val = rq.result?.value ?? null;
      diag.add?.(`[conf] getConf done ${key}=${val ? '[set]' : 'null'}`);
      res(val);
    };
    rq.onerror = e => {
      diag.add?.(`[conf] getConf error ${key}: ${e?.target?.error || e}`);
      rej(e);
    };
  });
}

// SUBMODULE: getTimeZoneOffsetMs @internal - ermittelt Offset fuer dayIsoToMidnightIso
function getTimeZoneOffsetMs(timeZone, referenceDate) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts = dtf.formatToParts(referenceDate);
    const bucket = {};
    for (const part of parts) {
      if (part.type === 'literal') continue;
      bucket[part.type] = part.value;
    }
    const year = Number(bucket.year);
    const month = Number(bucket.month);
    const day = Number(bucket.day);
    const hour = Number(bucket.hour);
    const minute = Number(bucket.minute);
    const second = Number(bucket.second);
    if ([year, month, day, hour, minute, second].some(n => !Number.isFinite(n))) {
      return 0;
    }
    const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    return asUtc - referenceDate.getTime();
  } catch (_) {
    return 0;
  }
}

function dayIsoToMidnightIso(dayIso, timeZone = 'Europe/Vienna') {
  try {
    const normalized = String(dayIso || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
    const [y, m, d] = normalized.split('-').map(Number);
    if (![y, m, d].every(Number.isFinite)) return null;
    const ref = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const offset = getTimeZoneOffsetMs(timeZone, ref);
    const utcMillis = ref.getTime() - offset;
    return new Date(utcMillis).toISOString();
  } catch (_) {
    return null;
  }
}

// SUBMODULE: addEntry @internal - persistiert Capture-Eintrag lokal vor Sync
function addEntry(obj) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const rq = tx.objectStore(STORE).add(obj);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = e => rej(e);
  });
}

function updateEntry(id, patch) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const cur = get.result;
      if (!cur) {
        res(false);
        return;
      }
      store.put(Object.assign({}, cur, patch));
    };
    tx.oncomplete = () => res(true);
    tx.onerror = e => rej(e);
  });
}

function getAllEntries() {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).getAll();
    rq.onsuccess = () => res(rq.result || []);
    rq.onerror = e => rej(e);
  });
}

function getEntryByRemoteId(remoteId) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('byRemote');
    const rq = idx.getAll(remoteId);
    rq.onsuccess = () => res(rq.result?.[0] ?? null);
    rq.onerror = e => rej(e);
  });
}

function deleteEntryLocal(id) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = e => rej(e);
  });
}

const dataLocalApi = {
  initDB,
  putConf,
  getConf,
  getTimeZoneOffsetMs,
  dayIsoToMidnightIso,
  addEntry,
  updateEntry,
  getAllEntries,
  getEntryByRemoteId,
  deleteEntryLocal
};
window.AppModules = window.AppModules || {};
window.AppModules.dataLocal = dataLocalApi;
for (const [key, value] of Object.entries(dataLocalApi)) {
  if (typeof window[key] === 'undefined') {
    window[key] = value;
  }
}
