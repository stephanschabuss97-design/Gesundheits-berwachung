'use strict';
/**
 * MODULE: supabase/core/state.js
 * intent: Zentraler In-Memory-State für Supabase-Client, Auth-Status und Header-Cache
 * exports: supabaseState, cacheHeaders, clearHeaderCache, getCachedHeaders, getCachedHeadersAt, getHeaderPromise, setHeaderPromise
 * version: 1.8.2
 * compat: Runtime (Browser / Node / PWA)
 * notes:
 *   - Enthält alle Supabase-Session- und Header-Informationen im RAM
 *   - Wird von client.js, http.js und auth/core.js gemeinsam genutzt
 *   - Kein permanenter Storage – volatile, resetbar per clearHeaderCache()
 * author: System Integration Layer (M.I.D.A.S. v1.8)
 */

// SUBMODULE: state @internal - globaler Supabase-Zustand (Auth + Header + Session)
export const supabaseState = {
  sbClient: null,
  cachedHeaders: null,
  cachedHeadersAt: 0,
  headerPromise: null,
  intakeRpcDisabled: false,
  lastLoggedIn: false,
  authState: 'unauth',
  authGraceTimer: null,
  pendingSignOut: null,
  booted: false,
  lastUserId: null
};

// SUBMODULE: header cache utilities @public - Verwaltung von Auth-Headern
export function cacheHeaders(headers) {
  supabaseState.cachedHeaders = headers;
  supabaseState.cachedHeadersAt = Date.now();
}

export function clearHeaderCache() {
  supabaseState.cachedHeaders = null;
  supabaseState.cachedHeadersAt = 0;
  supabaseState.headerPromise = null;
}

export function getCachedHeaders() {
  return supabaseState.cachedHeaders;
}

export function getCachedHeadersAt() {
  return supabaseState.cachedHeadersAt;
}

export function getHeaderPromise() {
  return supabaseState.headerPromise;
}

export function setHeaderPromise(promise) {
  supabaseState.headerPromise = promise;
}
