'use strict';
/**
 * MODULE: supabase/core/http.js
 * Description: Führt zentrale Fetch- und Authentifizierungslogik für Supabase-REST-Aufrufe mit Retry, Header-Cache und Timeout durch.
 * Submodules:
 *  - imports (Client & State Utilities)
 *  - globals (Diagnostics / Window Binding)
 *  - util (Sleep-Helfer)
 *  - withRetry (generischer Retry-Mechanismus mit Exponential Backoff)
 *  - fetchWithAuth (authentifiziertes Fetch mit Header-Caching, Auto-Refresh & Timeout)
 * Notes:
 *  - Verwendet Diagnose-Logging über window.diag.
 *  - Unterstützt automatisches Session-Refresh bei 401/403.
 *  - Enthält Kurzzeit-Timeout für hängende Requests (10s).
 *  - Version: 1.8.2 (System Integration Layer, M.I.D.A.S.)
 */

// SUBMODULE: imports @internal - Supabase Client und Header-Cache-Funktionen
import { ensureSupabaseClient } from './client.js';
import {
  getCachedHeaders,
  getCachedHeadersAt,
  getHeaderPromise,
  setHeaderPromise,
  cacheHeaders,
  clearHeaderCache
} from './state.js';

// SUBMODULE: globals @internal - Diagnostik-Objekt und globale Handles
const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });
const requestLogSummaries = new Map();
const getRequestSummary = (label) => {
  let summary = requestLogSummaries.get(label);
  if (!summary) {
    summary = {
      active: 0,
      startLogged: false,
      successCount: 0,
      successDuration: 0,
      flushTimer: null
    };
    requestLogSummaries.set(label, summary);
  }
  return summary;
};
const cleanupRequestSummary = (label, summary) => {
  if (!summary) return;
  if (summary.active === 0 && !summary.successCount && !summary.flushTimer) {
    summary.startLogged = false;
    requestLogSummaries.delete(label);
  }
};
const logRequestStart = (label) => {
  const summary = getRequestSummary(label);
  summary.active += 1;
  if (!summary.startLogged) {
    diag.add?.(`[auth] request start ${label}`);
    summary.startLogged = true;
  }
};
const flushSuccessSummary = (label, summary) => {
  if (!summary || !summary.successCount) return;
  const avg = Math.round(summary.successDuration / summary.successCount);
  diag.add?.(
    `[auth] request end ${label} status=200 avg=${avg} ms (x${summary.successCount})`
  );
  summary.successCount = 0;
  summary.successDuration = 0;
};
const scheduleSuccessFlush = (label, summary) => {
  if (summary.flushTimer) return;
  summary.flushTimer = setTimeout(() => {
    summary.flushTimer = null;
    if (!summary.successCount) {
      cleanupRequestSummary(label, summary);
      return;
    }
    flushSuccessSummary(label, summary);
    cleanupRequestSummary(label, summary);
  }, 25);
};
const logRequestSuccess = (label, durationMs) => {
  const summary = getRequestSummary(label);
  summary.active = Math.max(0, summary.active - 1);
  summary.successCount += 1;
  summary.successDuration += durationMs;
  scheduleSuccessFlush(label, summary);
};
const logRequestFailure = (label, status, durationMs, detail) => {
  const summary = getRequestSummary(label);
  summary.active = Math.max(0, summary.active - 1);
  if (summary.flushTimer) {
    clearTimeout(summary.flushTimer);
    summary.flushTimer = null;
  }
  flushSuccessSummary(label, summary);
  const suffix = detail ? ` – ${detail}` : '';
  diag.add?.(`[auth] request end ${label} status=${status} (${durationMs} ms)${suffix}`);
  cleanupRequestSummary(label, summary);
};

// SUBMODULE: util @internal - Sleep-Helper für Backoff-Zeiten
const sleep = (ms = 0) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

// SUBMODULE: withRetry @public - generischer Wiederholungsmechanismus mit Exponential Backoff
export async function withRetry(fn, { tries = 3, base = 300 } = {}) {
  let attempts = Number.isFinite(tries) ? Math.floor(tries) : 0;
  if (attempts <= 0) attempts = 1;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = e?.status ?? e?.response?.status ?? 0;
      if (!(code >= 500 && code < 600)) throw e;
      await sleep(base * Math.pow(2, i));
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('withRetry: all attempts failed');
}

// SUBMODULE: fetchWithAuth @public - führt REST-Aufrufe mit Auth-Headern, Session-Refresh und Retry-Logik aus
export async function fetchWithAuth(makeRequest, { tag = '', retry401 = true, maxAttempts = 2 } = {}) {
  const supa = await ensureSupabaseClient();
  if (!supa) {
    const err = new Error('auth-client-missing');
    err.status = 401;
    try {
      window.showLoginOverlay?.(true);
    } catch (_) {}
    throw err;
  }

    // Hilfsfunktionen: Auth-Refresh und Signalsteuerung
  const signalAuth = () => {
    try {
      window.showLoginOverlay?.(true);
    } catch (_) {}
  };

  const loadHeaders = async (forceRefresh = false) => {
    if (forceRefresh) {
      diag.add?.(`[auth] refresh start ${tag || 'request'}`);
      try {
        await supa.auth.refreshSession();
      } catch (refreshErr) {
        diag.add?.(`[auth] refresh error: ${refreshErr?.message || refreshErr}`);
      }
      diag.add?.(`[auth] refresh end ${tag || 'request'}`);
    }
    const cachedHeaders = getCachedHeaders();
    const cachedAt = getCachedHeadersAt();
    if (!forceRefresh && cachedHeaders && cachedAt && (Date.now() - cachedAt) < 5 * 60 * 1000) {
      diag.add?.('[headers] cache hit');
      return cachedHeaders;
    }
    return await getHeaders();
  };

  // Request-Ausführung mit Timeout und Wiederholungen
  let headers = await loadHeaders(false);
  if (!headers) {
    headers = await loadHeaders(true);
  }
  if (!headers) {
    const err = new Error('auth-headers-missing');
    err.status = 401;
    signalAuth();
    throw err;
  }

  let attempts = 0;
  let refreshed = false;
  const max = Math.max(0, maxAttempts);

  while (true) {
    const reqLabel = tag || 'request';
    logRequestStart(reqLabel);
    let res;
    const reqStart =
      (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
    try {
      // Per-request soft timeout to avoid hanging saves (e.g., after resume)
      const REQ_TIMEOUT_MS = 10000;
      let timeoutId;
      let timedOut = false;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          reject(new Error('request-timeout'));
        }, REQ_TIMEOUT_MS);
      });
      const fetchPromise = (async () => {
        try {
          return await makeRequest(headers);
        } catch (err) {
          if (!timedOut) throw err;
          diag.add?.(`[auth] late error ${tag || 'request'}: ${err?.message || err}`);
          return null;
        }
      })();
      try {
        res = await Promise.race([fetchPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
        const dur = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? (performance.now() - reqStart) : (Date.now() - reqStart);
        if (timedOut) {
          diag.add?.(`[auth] ${tag || 'request'} timeout (${Math.round(dur)} ms)`);
        }
      }
    } catch (err) {
      const duration =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? Math.round(performance.now() - reqStart)
          : Math.round(Date.now() - reqStart);
      logRequestFailure(reqLabel, 'error', duration, err?.message || err);
      if (attempts < max) {
        attempts += 1;
        await sleep(200 * attempts);
        continue;
      }
      throw err;
    }

    const duration =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? Math.round(performance.now() - reqStart)
        : Math.round(Date.now() - reqStart);
    if (!res || typeof res.status !== 'number') {
      logRequestFailure(reqLabel, 'invalid', duration);
      const err = new Error('invalid-response');
      err.status = 0;
      throw err;
    }
    if (res.status === 200) {
      logRequestSuccess(reqLabel, duration);
    } else {
      logRequestFailure(reqLabel, res.status, duration);
    }

    if (res.status === 401 || res.status === 403) {
      if (retry401 && !refreshed) {
        refreshed = true;
        diag.add?.(`[auth] ${tag || 'request'} ${res.status} -> refresh`);
        headers = await loadHeaders(true);
        if (!headers) {
          const err = new Error('auth-headers-missing');
          err.status = res.status;
          signalAuth();
          throw err;
        }
        attempts = 0;
        continue;
      }
      const err = new Error('auth-http');
      err.status = res.status;
      err.response = res;
      signalAuth();
      throw err;
    }

    if (res.status >= 500 && res.status < 600 && attempts < max) {
      attempts += 1;
      await sleep(200 * attempts);
      continue;
    }

    return res;
  }
}
