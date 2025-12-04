'use strict';
/**
 * MODULE: dataLocal.js
 * Description: Verwaltet lokale IndexedDB-Operationen und Konfigurationsspeicher für Healthlog-Einträge und Einstellungen.
 * Submodules:
 *  - fail (Fehlerlogging)
 *  - ensureDbReady (Initialisierungsprüfung)
 *  - IndexedDB Setup (Datenbank- und Store-Definition)
 *  - wrapIDBRequest (generischer IDB-Promise-Wrapper)
 *  - initDB (DB-Setup & Migration)
 *  - putConf / getConf (Konfigurations-Store)
 *  - getTimeZoneOffsetMs / dayIsoToMidnightIso (Zeitzonen-Hilfen)
 *  - addEntry / updateEntry / getAllEntries / getEntryByRemoteId / deleteEntryLocal (CRUD für Einträge)
 *  - dataLocalApi export (AppModules.dataLocal + window bridge)
 */

/* ===== IndexedDB Setup ===== */

// SUBMODULE: fail @internal - vereinheitlicht Fehlerlogging
const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diagLogger =
  globalWindow?.diag ||
  globalWindow?.AppModules?.diag ||
  globalWindow?.AppModules?.diagnostics ||
  { add() {} };
const LOG_DEBUG = !!globalWindow?.AppModules?.config?.DEV_ALLOW_DEFAULTS;
const getBootFlowSafe = () => globalWindow?.AppModules?.bootFlow || null;
const confLogSeenSuccess = new Set();
const confLogSuppressed = new Set();
const resetConfLogCache = () => {
  confLogSeenSuccess.clear();
  confLogSuppressed.clear();
};
if (globalWindow?.addEventListener) {
  globalWindow.addEventListener('pageshow', resetConfLogCache);
  globalWindow.addEventListener('midas:log-reset', resetConfLogCache);
}
if (globalWindow?.document?.addEventListener) {
  globalWindow.document.addEventListener('visibilitychange', () => {
    if (globalWindow.document.visibilityState === 'visible') {
      resetConfLogCache();
    }
  });
}
const logWarn = (message, err, context) => {
  const suffix = err ? ` ${err?.message || err}` : '';
  const detail = context ? ` ${JSON.stringify(context)}` : '';
  diagLogger.add?.(`[dataLocal] ${message}${suffix}${detail}`);
  if (LOG_DEBUG) {
    console.warn('[dataLocal]', message, err, context);
  }
};
const logError = (message, err) => {
  const suffix = err ? ` ${err?.message || err}` : '';
  diagLogger.add?.(`[dataLocal] ${message}${suffix}`);
  if (LOG_DEBUG) {
    console.error('[dataLocal]', message, err);
  }
};
const inflightConfLogs = new Map();
const logConfStart = (key, message) => {
  if (confLogSeenSuccess.has(key)) {
    confLogSuppressed.add(key);
    return;
  }
  confLogSuppressed.delete(key);
  const entry = inflightConfLogs.get(key);
  if (entry) {
    entry.dupes += 1;
    return;
  }
  inflightConfLogs.set(key, { dupes: 0 });
  diagLogger.add?.(message);
};
const logConfDone = (key, message, { success = false } = {}) => {
  if (confLogSuppressed.has(key)) {
    confLogSuppressed.delete(key);
    if (success) confLogSeenSuccess.add(key);
    return;
  }
  const entry = inflightConfLogs.get(key);
  if (!entry) {
    diagLogger.add?.(message);
    if (success) confLogSeenSuccess.add(key);
    return;
  }
  inflightConfLogs.delete(key);
  const suffix = entry.dupes ? ` (+${entry.dupes})` : '';
  diagLogger.add?.(`${message}${suffix}`);
  if (success) confLogSeenSuccess.add(key);
};
function fail(reject, e, msg) {
  const err = e?.target?.error || e || new Error('unknown');
  logError(msg, err);
  reject(err);
}

// SUBMODULE: ensureDbReady @internal - prüft ob Datenbank initialisiert ist
function ensureDbReady() {
  if (!db) {
    const message = 'IndexedDB not initialized. Call initDB() first.';
    if (dbInitStarted) {
      logError(message);
      getBootFlowSafe()?.report?.('IndexedDB fehlt', 'error');
      getBootFlowSafe()?.markFailed?.(message);
    } else {
      diagLogger.add?.('[dataLocal] IndexedDB accessed before init');
    }
    throw new Error(message);
  }
}

/* --- Konstanten --- */
let db;
let dbInitStarted = false;
const DB_NAME = 'healthlog_db';
const STORE = 'entries';
const CONF = 'config';
const DB_VERSION = 5;

// SUBMODULE: wrapIDBRequest @internal - generischer Handler für IDB Request/Transaktions-Fluss
/**
 * @param {IDBTransaction} tx
 * @param {IDBRequest} req
 * @param {{ onSuccess?: (e: Event, req: IDBRequest) => any,
 *           actionName: string,
 *           resolveOn?: 'request' | 'txcomplete',
 *           onAbortResolve?: any }} opts
 * @returns {Promise<any>}
 */
function wrapIDBRequest(tx, req, { onSuccess, actionName, resolveOn = 'request', onAbortResolve } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let lastValue;

    // Register transaction handlers immediately to never miss events
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(resolveOn === 'txcomplete' ? lastValue : lastValue);
    };
    tx.onabort = e => {
      if (settled) return;
      settled = true;
      if (onAbortResolve !== undefined) {
        // Map abort (z.B. "not found") auf definierten Resolve-Wert
        resolve(onAbortResolve);
      } else {
        fail(reject, e, `${actionName} aborted`);
      }
    };
    tx.onerror = e => {
      if (settled) return;
      settled = true;
      fail(reject, e, `${actionName} failed`);
    };

    req.onsuccess = e => {
      try {
        lastValue = typeof onSuccess === 'function' ? onSuccess(e, req) : undefined;
        if (resolveOn === 'request') {
          if (settled) return;
          settled = true;
          resolve(lastValue);
        }
        // if resolveOn === 'txcomplete', we just store lastValue and let tx.oncomplete resolve
      } catch (err) {
        if (settled) return;
        settled = true;
        fail(reject, err, `${actionName} success handler failed`);
      }
    };

    req.onerror = e => {
      if (settled) return;
      settled = true;
      fail(reject, e, `${actionName} request failed`);
    };
  });
}

// SUBMODULE: initDB @internal - initialisiert IndexedDB Stores und Indizes
function initDB() {
  dbInitStarted = true;
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
          catch (err) { if (err.name !== 'ConstraintError') logWarn('Failed to create index byDateTime', err); }
        }
        if (!idxNames.includes('byRemote')) {
          try { s.createIndex('byRemote', 'remote_id', { unique: false }); }
          catch (err) { if (err.name !== 'ConstraintError') logWarn('Failed to create index byRemote', err); }
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
    onSuccess: () => undefined,
    // für Writes: resolveOn 'request' genügt; tx-Handler fungieren als Fallback
    resolveOn: 'request'
  });
}

// SUBMODULE: getConf @public - liest Konfigurationseintrag aus Store
function getConf(key) {
  ensureDbReady();
  const logKey = `conf:${key}`;
  logConfStart(logKey, `[conf] getConf start ${key}`);
  const tx = db.transaction(CONF, 'readonly');
  const req = tx.objectStore(CONF).get(key);
  return wrapIDBRequest(tx, req, {
    actionName: 'getConf',
    onSuccess: (_, rq) => rq.result?.value ?? null,
    resolveOn: 'request'
  })
    .then((val) => {
      const label = val ? '[set]' : 'null';
      logConfDone(logKey, `[conf] getConf done ${key}=${label}`, { success: true });
      return val;
    })
    .catch((err) => {
      logConfDone(logKey, `[conf] getConf failed ${key}`);
      throw err;
    });
}

/* ===== Timezone Helpers ===== */

// SUBMODULE: getTimeZoneOffsetMs @internal - berechnet Zeitzonenoffset für Mitternachtstransformation
/**
 * @returns {number|null} Offset in Millisekunden oder null bei Fehler
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
      if (part.type !== 'literal') bucket[part.type] = part.value;
    }
    const [year, month, day, hour, minute, second] = [
      bucket.year, bucket.month, bucket.day, bucket.hour, bucket.minute, bucket.second
    ].map(Number);
    if ([year, month, day, hour, minute, second].some(n => !Number.isFinite(n))) return null;
    const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    return asUtc - referenceDate.getTime();
  } catch (err) {
    logWarn('getTimeZoneOffsetMs failed', err, { timeZone, referenceDate });
    return null;
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
    if (offset == null) {
      logWarn('dayIsoToMidnightIso: timezone offset unavailable, returning null', null, { dayIso, timeZone });
      return null;
    }
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
    onSuccess: (_, rq) => rq.result,
    resolveOn: 'request'
  });
}

// SUBMODULE: updateEntry @public - aktualisiert bestehenden Eintrag (Wrapper-basiert)
function updateEntry(id, patch) {
  ensureDbReady();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const getReq = store.get(id);

  // Im onSuccess des GET: wenn vorhanden, PUT ausführen; wenn nicht, tx.abort()
  // Resolve erfolgt NACH Commit (resolveOn: 'txcomplete'); Abbruch (not found) -> resolve(false)
  return wrapIDBRequest(tx, getReq, {
    actionName: 'updateEntry',
    resolveOn: 'txcomplete',
    onAbortResolve: false, // „not found“ führt zu Abort -> liefere false
    onSuccess: (_, rq) => {
      const cur = rq.result;
      if (!cur) {
        tx.abort();
        return false;
      }
      store.put({ ...cur, ...patch });
      // Wert, der bei tx.oncomplete zurückkommt:
      return true;
    }
  });
}

// SUBMODULE: getAllEntries @public - gibt alle Einträge aus Store zurück
function getAllEntries() {
  ensureDbReady();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).getAll();
  return wrapIDBRequest(tx, req, {
    actionName: 'getAllEntries',
    onSuccess: (_, rq) => rq.result || [],
    resolveOn: 'request'
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
    onSuccess: (_, rq) => rq.result ?? null,
    resolveOn: 'request'
  });
}

// SUBMODULE: deleteEntryLocal @public - löscht lokalen Eintrag
function deleteEntryLocal(id) {
  ensureDbReady();
  const tx = db.transaction(STORE, 'readwrite');
  const req = tx.objectStore(STORE).delete(id);
  return wrapIDBRequest(tx, req, {
    actionName: 'deleteEntryLocal',
    onSuccess: () => undefined,
    resolveOn: 'request'
  });
}

/* ===== Export ===== */

// SUBMODULE: dataLocalApi export @internal - registriert API unter AppModules.dataLocal und legt window-Globals an
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
