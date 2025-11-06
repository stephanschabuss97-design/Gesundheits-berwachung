'use strict';
/**
 * MODULE: dataLocal
 * intent: Lokale IndexedDB- und Konfig-Hilfen für Intake-/Doctor-Features
 * exports: initDB, putConf, getConf, getTimeZoneOffsetMs, dayIsoToMidnightIso,
 *          addEntry, updateEntry, getAllEntries, getEntryByRemoteId, deleteEntryLocal
 * version: 1.4
 * compat: Hybrid (Monolith + window.AppModules)
 * notes: Guards, onabort-Handler, safer updateEntry, request-level handling,
 *        double-settle prevention, robust index creation with validation
 */

/* ===== IndexedDB Setup ===== */
let db;
const DB_NAME = 'healthlog_db';
const STORE = 'entries';
const CONF = 'config';
const DB_VERSION = 5;

/** Einheitliches Logging + Reject */
function fail(reject, e, msg) {
  const err = e?.target?.error || e || new Error('unknown');
  console.error(`[dataLocal] ${msg}`, err);
  reject(err);
}

/** Prüft, ob DB initialisiert ist */
function ensureDbReady() {
  if (!db) throw new Error('IndexedDB not initialized. Call initDB() first.');
}

/** Initialisiert IndexedDB und legt ObjectStores an (entries/config) */
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      db = e.target.result;

      // === Entries Store ===
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('byDateTime', 'dateTime', { unique: false });
        s.createIndex('byRemote', 'remote_id', { unique: false });
      } else {
        const s = e.target.transaction.objectStore(STORE);
        const idxNames = Array.from(s.indexNames);

        // create missing indexes, log unexpected errors
        if (!idxNames.includes('byDateTime')) {
          try {
            s.createIndex('byDateTime', 'dateTime', { unique: false });
          } catch (err) {
            if (err.name !== 'ConstraintError') {
              console.warn('[dataLocal] Failed to create index byDateTime:', err);
              throw err;
            }
          }
        }
        if (!idxNames.includes('byRemote')) {
          try {
            s.createIndex('byRemote', 'remote_id', { unique: false });
          } catch (err) {
            if (err.name !== 'ConstraintError') {
              console.warn('[dataLocal] Failed to create index byRemote:', err);
              throw err;
            }
          }
        }
      }

      // === Config Store ===
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

/** Schreibt Konfigurationseintrag */
function putConf(key, value) {
  ensureDbReady();
  return new Promise((res, rej) => {
    let settled = false;
    const tx = db.transaction(CONF, 'readwrite');
    const store = tx.objectStore(CONF);

    const req = store.put({ key, value });
    req.onsuccess = () => {
      if (settled) return;
      settled = true;
      res();
    };
    req.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'putConf request failed');
    };

    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      res();
    };
    tx.onabort = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'putConf aborted');
    };
    tx.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'putConf failed');
    };
  });
}

/** Liest Konfigurationseintrag */
function getConf(key) {
  ensureDbReady();
  diag.add?.(`[conf] getConf start ${key}`);
  return new Promise((res, rej) => {
    let settled = false;
    const tx = db.transaction(CONF, 'readonly');
    const rq = tx.objectStore(CONF).get(key);

    rq.onsuccess = () => {
      if (settled) return;
      settled = true;
      const val = rq.result?.value ?? null;
      diag.add?.(`[conf] getConf done ${key}=${val ? '[set]' : 'null'}`);
      res(val);
    };
    rq.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, `getConf error ${key}`);
    };
    tx.onabort = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, `getConf aborted ${key}`);
    };
    tx.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, `getConf failed ${key}`);
    };
  });
}

/* ===== Timezone Helpers ===== */

/** Ermittelt Offset für dayIsoToMidnightIso (in Millisekunden) */
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

/** Wandelt YYYY-MM-DD ISO-String in Mitternachts-ISO-Zeitstempel (lokale Zone) */
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

/** Fügt neuen Eintrag hinzu (Capture-Daten) */
function addEntry(obj) {
  ensureDbReady();
  return new Promise((res, rej) => {
    let settled = false;
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const rq = store.add(obj);

    rq.onsuccess = () => {
      if (settled) return;
      settled = true;
      res(rq.result);
    };
    rq.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'addEntry request failed');
    };
    tx.onabort = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'addEntry aborted');
    };
    tx.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'addEntry failed');
    };
  });
}

/** Aktualisiert bestehenden Eintrag */
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
        try { tx.abort(); } catch (_) {}
        if (!settled) {
          settled = true;
          res(false);
        }
        return;
      }

      const putReq = store.put({ ...cur, ...patch });
      putReq.onsuccess = () => {};
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

/** Holt alle gespeicherten Einträge */
function getAllEntries() {
  ensureDbReady();
  return new Promise((res, rej) => {
    let settled = false;
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).getAll();
    rq.onsuccess = () => {
      if (settled) return;
      settled = true;
      res(rq.result || []);
    };
    rq.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'getAllEntries request failed');
    };
    tx.onabort = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'getAllEntries aborted');
    };
    tx.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'getAllEntries failed');
    };
  });
}

/** Holt Eintrag anhand der remote_id */
function getEntryByRemoteId(remoteId) {
  ensureDbReady();
  return new Promise((res, rej) => {
    let settled = false;
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('byRemote');
    const rq = idx.get(remoteId);

    rq.onsuccess = () => {
      if (settled) return;
      settled = true;
      res(rq.result ?? null);
    };
    rq.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'getEntryByRemoteId request failed');
    };
    tx.onabort = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'getEntryByRemoteId aborted');
    };
    tx.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'getEntryByRemoteId failed');
    };
  });
}

/** Löscht Eintrag lokal */
function deleteEntryLocal(id) {
  ensureDbReady();
  return new Promise((res, rej) => {
    let settled = false;
    const tx = db.transaction(STORE, 'readwrite');
    const rq = tx.objectStore(STORE).delete(id);

    rq.onsuccess = () => {
      if (settled) return;
      settled = true;
      res();
    };
    rq.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'deleteEntryLocal request failed');
    };
    tx.onabort = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'deleteEntryLocal aborted');
    };
    tx.onerror = e => {
      if (settled) return;
      settled = true;
      fail(rej, e, 'deleteEntryLocal failed');
    };
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
