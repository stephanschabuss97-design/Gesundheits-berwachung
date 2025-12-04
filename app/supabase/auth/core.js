'use strict';
/**
 * MODULE: supabase/auth/core.js
 * Description: Steuert Authentifizierungszustand, Session-Prüfung, Hooks und Grace-Period-Handling für Supabase-Login.
 * Submodules:
 *  - imports (Core-State & Client-Helfer)
 *  - globals (Diagnose & Window)
 *  - constants (Auth-Timing & Defaults)
 *  - fallbackUserId (UserID-Fallback bei Fehlern)
 *  - authHooks (Hook-Verwaltung)
 *  - Hook-Call-Handler (sichere Hook-Ausführung)
 *  - authGrace (Grace-Period-Logik)
 *  - requireSession (Session-Prüfung)
 *  - isLoggedInFast (schnelle Login-Erkennung)
 *  - watchAuthState (Realtime-Listener)
 *  - afterLoginBoot (Post-Login-Initialisierung)
 *  - getUserId (User-ID mit Timeout & Fallback)
 *  - initAuth (Hook-Registrierung)
 *  - resetAuthHooks (Hook-Reset)
 */

// SUBMODULE: imports @internal - Supabase Core-State & Client-Helfer
import { supabaseState } from '../core/state.js';
import { ensureSupabaseClient, maskUid } from '../core/client.js';

// SUBMODULE: globals @internal - Diagnose- und Window-Hilfen
const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });
const getSupabaseApi = () => globalWindow?.AppModules?.supabase || null;
const getBootFlow = () => globalWindow?.AppModules?.bootFlow || null;
const reportBootStatus = (msg, tone = 'info') => {
  try {
    getBootFlow()?.report?.(msg, tone);
  } catch (_) {
    /* noop */
  }
};
const inflightDiagLogs = new Map();
const userIdLogSeenSuccess = new Set();
const userIdLogSuppressed = new Set();
const resetUserIdLogCache = () => {
  userIdLogSeenSuccess.clear();
  userIdLogSuppressed.clear();
};
if (globalWindow?.addEventListener) {
  globalWindow.addEventListener('pageshow', resetUserIdLogCache);
  globalWindow.addEventListener('midas:log-reset', resetUserIdLogCache);
}
if (globalWindow?.document?.addEventListener) {
  globalWindow.document.addEventListener('visibilitychange', () => {
    if (globalWindow.document.visibilityState === 'visible') {
      resetUserIdLogCache();
    }
  });
}
const logDiagStart = (key, message) => {
  if (key === 'auth:getUserId' && userIdLogSeenSuccess.has(key)) {
    userIdLogSuppressed.add(key);
    return;
  }
  if (key === 'auth:getUserId') {
    userIdLogSuppressed.delete(key);
  }
  const entry = inflightDiagLogs.get(key);
  if (entry) {
    entry.dupes += 1;
    return;
  }
  inflightDiagLogs.set(key, { dupes: 0 });
  diag.add?.(message);
};
const logDiagEnd = (key, message, { success = false } = {}) => {
  if (key === 'auth:getUserId' && userIdLogSuppressed.has(key)) {
    userIdLogSuppressed.delete(key);
    if (success) userIdLogSeenSuccess.add(key);
    return;
  }
  const entry = inflightDiagLogs.get(key);
  if (!entry) {
    diag.add?.(message);
    if (success && key === 'auth:getUserId') {
      userIdLogSeenSuccess.add(key);
    }
    return;
  }
  inflightDiagLogs.delete(key);
  const suffix = entry.dupes ? ` (+${entry.dupes})` : '';
  diag.add?.(`${message}${suffix}`);
  if (success && key === 'auth:getUserId') {
    userIdLogSeenSuccess.add(key);
  }
};

    // SUBMODULE: constants @internal - Authentifizierungs-Timing & Defaults
const AUTH_GRACE_MS = 400;
const GET_USER_TIMEOUT_MS = globalWindow?.GET_USER_TIMEOUT_MS ?? 2000;

const defaultSetupRealtime = async () => undefined;
const defaultResumeFromBackground = async () => undefined;
const noopRealtime = () => undefined;

// SUBMODULE: fallbackUserId @internal - Rückfall bei Fehlern/Timeouts
const fallbackUserId = (variant) => {
  if (
    (supabaseState.authState === 'auth' || supabaseState.authState === 'unknown') &&
    supabaseState.lastUserId
  ) {
    const labelMap = {
      noClient: 'fallback (no client)',
      timeout: 'fallback (timeout)',
      noUid: 'fallback (no uid)',
      error: 'fallback (error)'
    };
    const label = labelMap[variant] || 'fallback';
    diag.add?.(`[auth] getUserId ${label} ${maskUid(supabaseState.lastUserId)}`);
    return supabaseState.lastUserId;
  }
  return null;
};

// SUBMODULE: authHooks @internal - Hook-Verwaltung für UI/Status
const authHooks = {
  onStatus: null,
  onLoginOverlay: null,
  onUserUi: null,
  onDoctorAccess: null
};

// SUBMODULE: Hook-Call-Handler @internal - sichere Ausführung aller Hook-Typen
const callStatus = (state) => {
  if (typeof authHooks.onStatus === 'function') {
    try {
      authHooks.onStatus(state);
    } catch (err) {
      diag.add?.('[auth] status hook error: ' + (err?.message || err));
    }
  }
};

const callLoginOverlay = (visible) => {
  if (typeof authHooks.onLoginOverlay === 'function') {
    try {
      authHooks.onLoginOverlay(!!visible);
      return;
    } catch (err) {
      diag.add?.('[auth] overlay hook error: ' + (err?.message || err));
    }
  }
  const supa = getSupabaseApi();
  try {
    supa?.showLoginOverlay?.(!!visible);
  } catch (_) {}
};

const callUserUi = (email) => {
  if (typeof authHooks.onUserUi === 'function') {
    try {
      authHooks.onUserUi(email);
      return;
    } catch (err) {
      diag.add?.('[auth] user hook error: ' + (err?.message || err));
    }
  }
  const supa = getSupabaseApi();
  try {
    supa?.setUserUi?.(email);
  } catch (_) {}
};

const callDoctorAccess = (enabled) => {
  if (typeof authHooks.onDoctorAccess === 'function') {
    try {
      authHooks.onDoctorAccess(!!enabled);
      return;
    } catch (err) {
      diag.add?.('[auth] doctor hook error: ' + (err?.message || err));
    }
  }
  const supa = getSupabaseApi();
  try {
    supa?.setDoctorAccess?.(!!enabled);
  } catch (_) {}
};

const callAuthGuard = (enabled) => {
  if (typeof globalWindow?.setAuthGuard === 'function') {
    try {
      globalWindow.setAuthGuard(!!enabled);
    } catch (_) {}
  }
};

const normalizeAuthState = (value) => {
  if (value === 'auth' || value === 'unauth') return value;
  return 'unknown';
};

const authStateWaiters = [];
const removeAuthStateWaiter = (waiter) => {
  const idx = authStateWaiters.indexOf(waiter);
  if (idx !== -1) {
    authStateWaiters.splice(idx, 1);
  }
};
const resolveAuthStateWaiters = (state) => {
  if (state === 'unknown') return;
  while (authStateWaiters.length) {
    const waiter = authStateWaiters.shift();
    try {
      waiter.cleanup?.();
    } catch (_) {}
    try {
      waiter.resolve(state);
    } catch (_) {}
  }
};

const updateBootStatusForState = (state) => {
  if (state === 'auth') {
    reportBootStatus('');
    return;
  }
  if (state === 'unauth') {
    reportBootStatus('Nicht angemeldet', 'error');
    return;
  }
  reportBootStatus('Pr\u00fcfe Session ...', 'info');
};

const updateBootLockForState = (state) => {
  const bootFlow = getBootFlow();
  if (!bootFlow) return;
  if (state === 'unknown') {
    bootFlow.lockReason = 'auth-check';
    return;
  }
  if (bootFlow.lockReason === 'auth-check') {
    delete bootFlow.lockReason;
  }
};

const applyAuthUi = (state) => {
  const normalized = normalizeAuthState(state);
  const isLoggedIn = normalized === 'auth';
  const body = globalWindow?.document?.body;
  if (body) {
    body.classList.toggle('auth-unknown', normalized === 'unknown');
  }
  callAuthGuard(isLoggedIn);
  callDoctorAccess(isLoggedIn);
  if (normalized === 'auth') {
    callLoginOverlay(false);
    return;
  }
  if (normalized === 'unauth') {
    callLoginOverlay(true);
  } else {
    callLoginOverlay(false);
  }
};

const setAuthState = (nextState, { force = false } = {}) => {
  const normalized = normalizeAuthState(nextState);
  if (!force && supabaseState.authState === normalized) {
    return normalized;
  }
  supabaseState.authState = normalized;
  if (normalized === 'auth') {
    supabaseState.lastLoggedIn = true;
  } else if (normalized === 'unauth') {
    supabaseState.lastLoggedIn = false;
  }
  updateBootLockForState(normalized);
  updateBootStatusForState(normalized);
  applyAuthUi(normalized);
  callStatus(normalized);
  resolveAuthStateWaiters(normalized);
  return normalized;
};

export const isAuthDecisionKnown = () => supabaseState.authState !== 'unknown';

export const waitForAuthDecision = ({ signal } = {}) => {
  const current = normalizeAuthState(supabaseState.authState);
  if (current !== 'unknown') {
    return Promise.resolve(current);
  }
  return new Promise((resolve, reject) => {
    const waiter = {
      resolve(state) {
        resolve(state);
      },
      cleanup: null
    };
    if (signal) {
      const abortHandler = () => {
        signal.removeEventListener('abort', abortHandler);
        removeAuthStateWaiter(waiter);
        reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      waiter.cleanup = () => signal.removeEventListener('abort', abortHandler);
    }
    authStateWaiters.push(waiter);
  });
};

// SUBMODULE: authGrace @internal - Grace-Period-Handling und Finalisierung
const clearAuthGrace = () => {
  if (supabaseState.authGraceTimer) {
    clearTimeout(supabaseState.authGraceTimer);
    supabaseState.authGraceTimer = null;
  }
};

export const finalizeAuthState = (logged) => {
  clearAuthGrace();
  const nextState = logged ? 'auth' : 'unauth';
  if (logged) {
    supabaseState.pendingSignOut = null;
  } else if (typeof supabaseState.pendingSignOut === 'function') {
    Promise.resolve(supabaseState.pendingSignOut())
      .catch(() => {})
      .finally(() => {
        supabaseState.pendingSignOut = null;
      });
  }
  setAuthState(nextState, { force: true });
};

export const scheduleAuthGrace = () => {
  clearAuthGrace();
  setAuthState('unknown', { force: true });
  supabaseState.authGraceTimer = setTimeout(async () => {
    try {
      if (!supabaseState.sbClient) {
        finalizeAuthState(false);
        return;
      }
      diag.add?.('[capture] guard: request session');
      const { data } = await supabaseState.sbClient.auth.getSession();
      diag.add?.('[capture] guard: session resp');
      finalizeAuthState(!!data?.session);
    } catch (_) {
      finalizeAuthState(false);
    }
  }, AUTH_GRACE_MS);
};

// SUBMODULE: requireSession @public - prüft aktuelle Session und aktualisiert UI
export async function requireSession() {
  if (!supabaseState.sbClient) {
    reportBootStatus('Supabase Client fehlt', 'error');
    getBootFlow()?.markFailed?.('Supabase Client fehlt');
    callUserUi('');
    setAuthState('unauth', { force: true });
    return false;
  }
  try {
    const { data: { session } = {} } = await supabaseState.sbClient.auth.getSession();
    const logged = !!session;
    callUserUi(session?.user?.email || '');
    if (logged) {
      clearAuthGrace();
    } else if (!supabaseState.authGraceTimer) {
      setAuthState('unauth');
    }
    if (logged) {
      setAuthState('auth');
    }
    return logged;
  } catch (_) {
    setAuthState('unknown');
    return false;
  }
}

// SUBMODULE: isLoggedInFast @public - schnelle Login-Prüfung mit Timeout
export async function isLoggedInFast({ timeout = 400 } = {}) {
  if (!supabaseState.sbClient) return supabaseState.lastLoggedIn;
  let timer = null;
  try {
    const sessionPromise = supabaseState.sbClient.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('session-timeout')), timeout);
    });
    const { data } = await Promise.race([sessionPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    const logged = !!data?.session;
    if (supabaseState.authState === 'unknown' && !logged && supabaseState.lastLoggedIn) {
      return supabaseState.lastLoggedIn;
    }
    if (supabaseState.authState !== 'unknown') {
      setAuthState(logged ? 'auth' : 'unauth');
    } else {
      supabaseState.lastLoggedIn = logged;
    }
    return logged;
  } catch (_) {
    if (timer) clearTimeout(timer);
    return supabaseState.lastLoggedIn;
  }
}

// SUBMODULE: watchAuthState @public - registriert Realtime-Auth-State-Listener
export function watchAuthState() {
  if (!supabaseState.sbClient) return;
  if (!supabaseState.sbClient.auth?.onAuthStateChange) return;
  const { data: { subscription } = {} } =
    supabaseState.sbClient.auth.onAuthStateChange(async (event, session) => {
      const logged = !!session;
      if (logged) {
        callUserUi(session?.user?.email || '');
        const newUid = session?.user?.id || null;
        if (newUid) {
        supabaseState.lastUserId = newUid;
        diag.add?.(`[auth] session uid=${maskUid(newUid)}`);
      }
      finalizeAuthState(true);
      await afterLoginBoot();
      await (globalWindow?.setupRealtime || defaultSetupRealtime)();
      globalWindow?.requestUiRefresh?.().catch((err) =>
        diag.add?.('ui refresh err: ' + (err?.message || err))
      );
      try { await globalWindow?.AppModules?.capture?.refreshCaptureIntake?.('auth:login'); } catch (_) {}
      try { await globalWindow?.refreshAppointments?.(); } catch (_) {}
      return;
    }

    callUserUi('');
    supabaseState.lastLoggedIn = false;
    if (supabaseState.lastUserId) {
      diag.add?.('[auth] session cleared');
      supabaseState.lastUserId = null;
    }
    supabaseState.pendingSignOut = async () => {
      (globalWindow?.teardownRealtime || noopRealtime)();
      try { await globalWindow?.AppModules?.capture?.refreshCaptureIntake?.('auth:logout'); } catch (_) {}
      try { await globalWindow?.refreshAppointments?.(); } catch (_) {}
    };

    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      finalizeAuthState(false);
    } else {
      scheduleAuthGrace();
    }
  });
  return subscription || null;
}

// SUBMODULE: afterLoginBoot @public - führt Initialisierung nach Login aus
export async function afterLoginBoot() {
  if (supabaseState.booted) return;
  supabaseState.booted = true;
  getBootFlow()?.setStage?.('INIT_CORE');
  globalWindow
    ?.requestUiRefresh?.({ reason: 'boot:afterLogin' })
    .catch((err) => diag.add?.('ui refresh err: ' + (err?.message || err)));
}

// SUBMODULE: getUserId @public - ermittelt aktuelle User-ID mit Timeout & Fallbacks
export async function getUserId() {
  const LOG_KEY = 'auth:getUserId';
  try {
    logDiagStart(LOG_KEY, '[auth] getUserId start');
    const supa = await ensureSupabaseClient();
    if (!supa) {
      const fallback = fallbackUserId('noClient');
      if (fallback) {
        logDiagEnd(LOG_KEY, '[auth] getUserId done (fallback)', { success: true });
        return fallback;
      }
      logDiagEnd(LOG_KEY, '[auth] getUserId done null');
      return null;
    }
    let timeoutId;
    let timedOut = false;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        reject(new Error('getUser-timeout'));
      }, GET_USER_TIMEOUT_MS);
    });
    let userInfo = null;
    try {
      const result = await Promise.race([supa.auth.getUser(), timeoutPromise]);
      userInfo = result?.data?.user ?? null;
    } catch (err) {
      if (timedOut) {
        diag.add?.('[auth] getUserId timeout');
        const fallback = fallbackUserId('timeout');
        if (fallback) {
          logDiagEnd(LOG_KEY, '[auth] getUserId done (fallback)', { success: true });
          return fallback;
        }
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
    const uid = userInfo?.id ?? null;
    if (uid) {
      supabaseState.lastUserId = uid;
      logDiagEnd(LOG_KEY, `[auth] getUserId done ${maskUid(uid)}`, { success: true });
      return uid;
    }
    const fallbackNoUid = fallbackUserId('noUid');
    if (fallbackNoUid) {
      logDiagEnd(LOG_KEY, '[auth] getUserId done (fallback)', { success: true });
      return fallbackNoUid;
    }
    logDiagEnd(LOG_KEY, '[auth] getUserId done null');
    return null;
  } catch (e) {
    diag.add?.('[auth] getUserId error: ' + (e?.message || e));
    const fallbackError = fallbackUserId('error');
    if (fallbackError) {
      logDiagEnd(LOG_KEY, '[auth] getUserId done (fallback)', { success: true });
      return fallbackError;
    }
    logDiagEnd(LOG_KEY, '[auth] getUserId done null');
    return null;
  }
}

// SUBMODULE: initAuth @public - setzt optionale Hook-Handler für UI & Status
export function initAuth(hooks = {}) {
  authHooks.onStatus =
    typeof hooks.onStatus === 'function' ? hooks.onStatus : authHooks.onStatus;
  authHooks.onLoginOverlay =
    typeof hooks.onLoginOverlay === 'function' ? hooks.onLoginOverlay : authHooks.onLoginOverlay;
  authHooks.onUserUi =
    typeof hooks.onUserUi === 'function' ? hooks.onUserUi : authHooks.onUserUi;
  authHooks.onDoctorAccess =
    typeof hooks.onDoctorAccess === 'function'
      ? hooks.onDoctorAccess
      : authHooks.onDoctorAccess;
  if (typeof hooks.onLoginOverlay === 'function') {
    try {
      hooks.onLoginOverlay(false);
    } catch (_) {}
  }
}

// SUBMODULE: resetAuthHooks @public - entfernt alle gesetzten Hook-Handler
export function resetAuthHooks() {
  authHooks.onStatus = null;
  authHooks.onLoginOverlay = null;
  authHooks.onUserUi = null;
  authHooks.onDoctorAccess = null;
}
