'use strict';
/**
 * MODULE: dataLocal
 * intent: Lokale IndexedDB- und Konfig-Hilfen für Intake-/Doctor-Features
 * exports: initDB, putConf, getConf, getTimeZoneOffsetMs, dayIsoToMidnightIso,
 *          addEntry, updateEntry, getAllEntries, getEntryByRemoteId, deleteEntryLocal
 * version: 1.2
 * compat: Hybrid (Monolith + window.AppModules)
 * notes: Guards, onabort-Handler, safer updateEntry, unified error handling
 */

/* ===== IndexedDB Setup ===== */
let db;
const DB_NAME = 'healthlog_db';
const STORE = 'entries';
const CONF = 'config';
const DB_VERSION = 5;

/**
 * Kleine Hilfsfunktion für einheitliches Logging + Rejects
 */
function fail(reject, e, msg) {
  const err = e?.target?.error || e || new Error('unknown');
  console.error(`[dataLocal] ${msg}`, err);
  reject(err);
}

/**
 * Prüft, ob DB initialisiert ist
 */
function ensureDbReady() {
  if (!db) throw new Error('IndexedDB not initialized. Call initDB() first.');
}

/**
 * Initialisiert IndexedDB und legt ObjectStores an (entries/config)
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('byDateTime', 'dateTime', { unique: false });
        s.createIndex('byRemote', 'remote_id', { unique: false });
      } else {
        const s = e.target.transaction.objectStore(STORE);
        try { s.createIndex('byDateTime', 'dateTime', { unique: false }); } catch (_) {}
        try { s.createIndex('byRemote', 'remote_id', { unique: false }); } catch (_) {}
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
    req.onerror = e => fail(reject, e, 'IndexedDB open failed');
  });
}

/* ===== Config Store ===== */

/**
 * Schreibt Konfigurationseintrag
 */
function putConf(key, value) {
  ensureDbReady();
  return new Promise((res, rej) => {
    const tx = db.transaction(CONF, 'readwrite');
    const store = tx.objectStore(CONF);
    store.put({ key, value });
    tx.oncomplete = () => res();
    tx.onabort = e => fail(rej, e, 'putConf aborted');
    tx.onerror = e => fail(rej, e, 'putConf failed');
  });
}

/**
 * Liest Konfigurationseintrag
 */
function getConf(key) {
  ensureDbReady();
  diag.add?.(`[conf] getConf start ${key}`);
  return new Promise((res, rej) => {
    const tx = db.transaction(CONF, 'readonly');
    const rq = tx.objectStore(CONF).get(key);
    rq.onsuccess = () => {
      const val = rq.result?.value ?? null;
      diag.add?.(`[conf] getConf done ${key}=${val ? '[set]' : 'null'}`);
      res(val);
    };
    rq.onerror = e => fail(rej, e, `getConf error ${key}`);
    tx.onabort = e => fail(rej, e, `getConf aborted ${key}`);
  });
}

/* ===== Timezone Helpers ===== */

/**
 * Ermittelt Offset für dayIsoToMidnightIso (in Millisekunden)
 * Note: Safari hat minor Intl edge cases außerhalb ±14h, safe für Europe/Vienna
 */
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

/**
 * Wandelt YYYY-MM-DD ISO-String in Mitternachts-ISO-Zeitstempel (lokale Zone)
 */
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

/* ===== Entry Store ===== */

/**
 * Fügt neuen Eintrag hinzu (Capture-Daten)
 */
function addEntry(obj) {
  ensureDbReady();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const rq = tx.objectStore(STORE).add(obj);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = e => fail(rej, e, 'addEntry failed');
    tx.onabort = e => fail(rej, e, 'addEntry aborted');
  });
}

/**
 * Aktualisiert bestehenden Eintrag
 */
function updateEntry(id, patch) {
  ensureDbReady();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(id);

    get.onsuccess = () => {
      const cur = get.result;
      if (!cur) {
        tx.abort();
        res(false);
        return;
      }
      store.put({ ...cur, ...patch });
    };

    tx.oncomplete = () => res(true);
    tx.onabort = e => fail(rej, e, 'updateEntry aborted');
    tx.onerror = e => fail(rej, e, 'updateEntry failed');
  });
}

/**
 * Holt alle gespeicherten Einträge
 */
function getAllEntries() {
  ensureDbReady();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).getAll();
    rq.onsuccess = () => res(rq.result || []);
    rq.onerror = e => fail(rej, e, 'getAllEntries failed');
    tx.onabort = e => fail(rej, e, 'getAllEntries aborted');
  });
}

/**
 * Holt Eintrag anhand der remote_id
 */
function getEntryByRemoteId(remoteId) {
  ensureDbReady();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('byRemote');
    const rq = idx.get(remoteId); // get() statt getAll() für Performance
    rq.onsuccess = () => res(rq.result ?? null);
    rq.onerror = e => fail(rej, e, 'getEntryByRemoteId failed');
    tx.onabort = e => fail(rej, e, 'getEntryByRemoteId aborted');
  });
}

/**
 * Löscht Eintrag lokal
 */
function deleteEntryLocal(id) {
  ensureDbReady();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onabort = e => fail(rej, e, 'deleteEntryLocal aborted');
    tx.onerror = e => fail(rej, e, 'deleteEntryLocal failed');
  });
}

/* ===== Export ===== */
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

// Legacy-safe globals (nur definieren, wenn nicht vorhanden)
for (const [key, value] of Object.entries(dataLocalApi)) {
  if (typeof window[key] === 'undefined') {
    window[key] = value;
  }
}
