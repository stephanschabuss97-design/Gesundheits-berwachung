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

// SUBMODULE: authGrace @internal - Grace-Period-Handling und Finalisierung
const clearAuthGrace = () => {
  if (supabaseState.authGraceTimer) {
    clearTimeout(supabaseState.authGraceTimer);
    supabaseState.authGraceTimer = null;
  }
};

const applyAuthUi = (logged) => {
  callAuthGuard(!!logged);
  callDoctorAccess(!!logged);
  if (logged) {
    callLoginOverlay(false);
  } else if (supabaseState.authState !== 'unknown') {
    callLoginOverlay(true);
  }
};

export const finalizeAuthState = (logged) => {
  clearAuthGrace();
  supabaseState.authState = logged ? 'auth' : 'unauth';
  supabaseState.lastLoggedIn = logged;
  if (logged) {
    supabaseState.pendingSignOut = null;
  } else if (typeof supabaseState.pendingSignOut === 'function') {
    Promise.resolve(supabaseState.pendingSignOut())
      .catch(() => {})
      .finally(() => {
        supabaseState.pendingSignOut = null;
      });
  }
  applyAuthUi(logged);
  callStatus(supabaseState.authState);
};

export const scheduleAuthGrace = () => {
  clearAuthGrace();
  supabaseState.authState = 'unknown';
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
    callUserUi('');
    callLoginOverlay(true);
    callAuthGuard(false);
    callDoctorAccess(false);
    supabaseState.lastLoggedIn = false;
    return false;
  }
  try {
    const { data: { session } = {} } = await supabaseState.sbClient.auth.getSession();
    const logged = !!session;
    supabaseState.lastLoggedIn = logged;
    callUserUi(session?.user?.email || '');
    if (logged) {
      supabaseState.authState = 'auth';
      clearAuthGrace();
    } else if (!supabaseState.authGraceTimer) {
      supabaseState.authState = 'unauth';
    }
    applyAuthUi(logged);
    callStatus(supabaseState.authState);
    return logged;
  } catch (_) {
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
    supabaseState.lastLoggedIn = logged;
    if (supabaseState.authState !== 'unknown') {
      supabaseState.authState = logged ? 'auth' : 'unauth';
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
      try { await globalWindow?.refreshCaptureIntake?.(); } catch (_) {}
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
      try { await globalWindow?.refreshCaptureIntake?.(); } catch (_) {}
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
  globalWindow
    ?.requestUiRefresh?.({ reason: 'boot:afterLogin' })
    .catch((err) => diag.add?.('ui refresh err: ' + (err?.message || err)));
}

// SUBMODULE: getUserId @public - ermittelt aktuelle User-ID mit Timeout & Fallbacks
export async function getUserId() {
  try {
    diag.add?.('[auth] getUserId start');
    const supa = await ensureSupabaseClient();
    if (!supa) {
      const fallback = fallbackUserId('noClient');
      return fallback ?? null;
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
        if (fallback) return fallback;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
    const uid = userInfo?.id ?? null;
    if (uid) {
      supabaseState.lastUserId = uid;
      diag.add?.(`[auth] getUserId done ${maskUid(uid)}`);
      return uid;
    }
    const fallbackNoUid = fallbackUserId('noUid');
    if (fallbackNoUid) return fallbackNoUid;
    diag.add?.('[auth] getUserId done null');
    return null;
  } catch (e) {
    diag.add?.('[auth] getUserId error: ' + (e?.message || e));
    const fallbackError = fallbackUserId('error');
    if (fallbackError) return fallbackError;
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
