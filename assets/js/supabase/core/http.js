/**
 * MODULE: supabase/core/http.js
 * intent: Einheitliches, fehlertolerantes Fetch- und Auth-Handling für REST-Requests
 * exports: withRetry, fetchWithAuth
 * version: 1.8.2
 * compat: Browser / PWA / TWA
 * notes:
 *   - Implementiert robustes Fetch mit Auth-Header-Cache und automatischem Refresh
 *   - Enthält Exponential-Backoff bei 5xx-Fehlern und Session-Retry bei 401
 *   - Zentraler Baustein für alle Supabase REST-Aufrufe in API-Modulen
 * author: System Integration Layer (M.I.D.A.S. v1.8)
 */

// SUBMODULE: imports @internal - Supabase Client und Header Cache Utilities
import { ensureSupabaseClient } from './client.js';
import {
  getCachedHeaders,
  getCachedHeadersAt,
  getHeaderPromise,
  setHeaderPromise,
  cacheHeaders,
  clearHeaderCache
} from './state.js';

// SUBMODULE: globals @internal - Diagnose und Window Binding
const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

    // SUBMODULE: util - Hilfsfunktionen (sleep)
const sleep = (ms = 0) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

// SUBMODULE: retry-wrapper @public - generische Wiederholungslogik mit Exponential Backoff
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

// SUBMODULE: fetchWithAuth @public - authentifiziertes Fetch mit Header-Cache und Retry-Strategien
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
    let res;
    try {
      // Per-request soft timeout to avoid hanging saves (e.g., after resume)
      const REQ_TIMEOUT_MS = 10000;
      const reqStart = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
      diag.add?.(`[auth] request start ${tag || 'request'}`);
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
      if (attempts < max) {
        attempts += 1;
        await sleep(200 * attempts);
        continue;
      }
      throw err;
    }

    if (!res || typeof res.status !== 'number') {
      const err = new Error('invalid-response');
      err.status = 0;
      throw err;
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
