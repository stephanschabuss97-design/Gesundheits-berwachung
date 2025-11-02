/** MODULE: supabase/core/state.js — extracted from supabase.js @v1.8.0 */

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
