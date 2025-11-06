'use strict';
/**
 * MODULE: dataLocal
 * intent: Lokale IndexedDB- und Konfig-Hilfen für Intake-/Doctor-Features
 * exports: initDB, putConf, getConf, getTimeZoneOffsetMs, dayIsoToMidnightIso,
 *          addEntry, updateEntry, getAllEntries, getEntryByRemoteId, deleteEntryLocal
 * version: 1.6
 * compat: Hybrid (Monolith + window.AppModules)
 * notes: Atomare Transaktionen (resolve nur bei Commit), zentraler Helper wrapIDBRequest(),
 *        vollständige SUBMODULE-Dokumentation
 */

/* ===== IndexedDB Setup ===== */

// SUBMODULE: fail @internal - vereinheitlicht Fehlerlogging
function fail(reject, e, msg) {
  const err = e?.target?.error || e || new Error('unknown');
  console.error(`[dataLocal] ${msg}`, err);
  reject(err);
}

// SUBMODULE: ensureDbReady @internal - prüft ob Datenbank initialisiert ist
function ensureDbReady() {
  if (!db) throw new Error('IndexedDB not initialized. Call initDB() first.');
}

/* --- Konstanten --- */
let db;
const DB_NAME = 'healthlog_db';
const STORE = 'entries';
const CONF = 'config';
const DB_VERSION = 5;

// SUBMODULE: wrapIDBRequest @internal - generischer Handler für IDB Request/Transaktions-Fluss
function wrapIDBRequest(tx, req, { onSuccess, actionName }) {
  return new Promise((resolve, reject) => {
    let settled = false;

    req.onsuccess = e => {
      try {
        if (settled) return;
        const value = typeof onSuccess === 'function' ? onSuccess(e, req) : undefined;
        tx.oncomplete = () => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        };
      } catch (err) {
        if (!settled) {
          settled = true;
          fail(reject, err, `${actionName} success handler failed`);
        }
      }
    };

    req.onerror = e => {
      if (settled) return;
      settled = true;
      fail(reject, e, `${actionName} request failed`);
    };

    tx.onabort = e => {
      if (settled) return;
      settled = true;
      fail(reject, e, `${actionName} aborted`);
    };

    tx.onerror = e => {
      if (settled) return;
      settled = true;
      fail(reject, e, `${actionName} failed`);
    };
  });
}

// SUBMODULE: initDB @internal - initialisiert IndexedDB Stores und Indizes
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
        const idxNames = Array.from(s.indexNames);
        if (!idxNames.includes('byDateTime')) {
          try { s.createIndex('byDateTime', 'dateTime', { unique: false }); }
          catch (err) { if (err.name !== 'ConstraintError') console.warn('[dataLocal] Failed to create index byDateTime:', err); }
        }
        if (!idxNames.includes('byRemote')) {
          try { s.createIndex('byRemote', 'remote_id', { unique: false }); }
          catch (err) { if (err.name !== 'ConstraintError') console.warn('[dataLocal] Failed to create index byRemote:', err); }
        }
      }
      if (!db.objectStoreNames.contains(CONF)) db.createObjectStore(CONF, { keyPath: 'key' });
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

// SUBMODULE: putConf @public - schreibt Konfigurationseintrag in Store
function putConf(key, value) {
  ensureDbReady();
  const tx = db.transaction(CONF, 'readwrite');
  const store = tx.objectStore(CONF);
  const req = store.put({ key, value });
  return wrapIDBRequest(tx, req, {
    actionName: 'putConf',
    onSuccess: () => undefined
  });
}

// SUBMODULE: getConf @public - liest Konfigurationseintrag aus Store
function getConf(key) {
  ensureDbReady();
  diag.add?.(`[conf] getConf start ${key}`);
  const tx = db.transaction(CONF, 'readonly');
  const req = tx.objectStore(CONF).get(key);
  return wrapIDBRequest(tx, req, {
    actionName: 'getConf',
    onSuccess: (_, rq) => {
      const val = rq.result?.value ?? null;
      diag.add?.(`[conf] getConf done ${key}=${val ? '[set]' : 'null'}`);
      return val;
    }
  });
}

/* ===== Timezone Helpers ===== */

// SUBMODULE: getTimeZoneOffsetMs @internal - berechnet Zeitzonenoffset für Mitternachtstransformation
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
      if (part.type !== 'literal') bucket[part.type] = part.value;
    }
    const [year, month, day, hour, minute, second] = [
      bucket.year, bucket.month, bucket.day, bucket.hour, bucket.minute, bucket.second
    ].map(Number);
    if ([year, month, day, hour, minute, second].some(n => !Number.isFinite(n))) return 0;
    const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    return asUtc - referenceDate.getTime();
  } catch {
    return 0;
  }
}

// SUBMODULE: dayIsoToMidnightIso @internal - wandelt Tages-ISO in UTC-Midnight-Zeitstempel
function dayIsoToMidnightIso(dayIso, timeZone = 'Europe/Vienna') {
  try {
    const normalized = String(dayIso || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
    const [y, m, d] = normalized.split('-').map(Number);
    if (![y, m, d].every(Number.isFinite)) return null;
    const ref = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const offset = getTimeZoneOffsetMs(timeZone, ref);
    return new Date(ref.getTime() - offset).toISOString();
  } catch {
    return null;
  }
}

/* ===== Entry Store ===== */

// SUBMODULE: addEntry @public - fügt lokalen Eintrag hinzu
function addEntry(obj) {
  ensureDbReady();
  const tx = db.transaction(STORE, 'readwrite');
  const req = tx.objectStore(STORE).add(obj);
  return wrapIDBRequest(tx, req, {
    actionName: 'addEntry',
    onSuccess: (_, rq) => rq.result
  });
}

// SUBMODULE: updateEntry @public - aktualisiert bestehenden Eintrag (manualAbort geschützt)
function updateEntry(id, patch) {
  ensureDbReady();
  return new Promise((res, rej) => {
    let settled = false;
    let manualAbort = false;
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(id);

    get.onsuccess = () => {
      const cur = get.result;
      if (!cur) {
        manualAbort = true;
        try { tx.abort(); } catch {}
        if (!settled) {
          settled = true;
          res(false);
        }
        return;
      }
      const putReq = store.put({ ...cur, ...patch });
      putReq.onsuccess = () => {}; // Success via tx.oncomplete
      putReq.onerror = e => {
        if (settled) return;
        settled = true;
        fail(rej, e, 'updateEntry request failed');
      };
    };

    get.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'updateEntry get failed');
    };

    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      res(true);
    };
    tx.onabort = e => {
      if (manualAbort) return;
      if (settled) return;
      settled = true;
      fail(rej, e, 'updateEntry aborted');
    };
    tx.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'updateEntry failed');
    };
  });
}

// SUBMODULE: getAllEntries @public - gibt alle Einträge aus Store zurück
function getAllEntries() {
  ensureDbReady();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).getAll();
  return wrapIDBRequest(tx, req, {
    actionName: 'getAllEntries',
    onSuccess: (_, rq) => rq.result || []
  });
}

// SUBMODULE: getEntryByRemoteId @public - findet Eintrag anhand remote_id
function getEntryByRemoteId(remoteId) {
  ensureDbReady();
  const tx = db.transaction(STORE, 'readonly');
  const idx = tx.objectStore(STORE).index('byRemote');
  const req = idx.get(remoteId);
  return wrapIDBRequest(tx, req, {
    actionName: 'getEntryByRemoteId',
    onSuccess: (_, rq) => rq.result ?? null
  });
}

// SUBMODULE: deleteEntryLocal @public - löscht lokalen Eintrag
function deleteEntryLocal(id) {
  ensureDbReady();
  const tx = db.transaction(STORE, 'readwrite');
  const req = tx.objectStore(STORE).delete(id);
  return wrapIDBRequest(tx, req, {
    actionName: 'deleteEntryLocal',
    onSuccess: () => undefined
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

for (const [key, value] of Object.entries(dataLocalApi)) {
  if (typeof window[key] === 'undefined') {
    window[key] = value;
  }
}
