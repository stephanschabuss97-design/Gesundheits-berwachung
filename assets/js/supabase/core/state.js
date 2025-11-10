'use strict';
/**
 * MODULE: supabase/core/state.js
 * Description: Verwaltet zentralen Supabase-Runtime-State (Client, Auth-Session, Header-Cache) im RAM.
 * Submodules:
 *  - state (Hauptobjekt mit globalem Supabase-Zustand)
 *  - header cache utilities (Cache- und Promise-Verwaltung für Auth-Header)
 * Notes:
 *  - Kein persistenter Speicher; ausschließlich flüchtige Laufzeitdaten.
 *  - Wird gemeinsam genutzt von client.js, http.js und auth/core.js.
 */

// SUBMODULE: state @internal - globaler Supabase-Zustand (Client, Auth-Status, Header-Cache)
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

// SUBMODULE: header cache utilities @public - steuert Cache und Promise-Verwaltung
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
