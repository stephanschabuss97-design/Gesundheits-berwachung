/** MODULE: supabase/auth/core.js — Session & Auth State @v1.8.1 */

import { supabaseState } from '../core/state.js';
import { ensureSupabaseClient, maskUid } from '../core/client.js';

const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

const AUTH_GRACE_MS = 400;
const GET_USER_TIMEOUT_MS = globalWindow?.GET_USER_TIMEOUT_MS ?? 2000;

const defaultSetupRealtime = async () => undefined;
const defaultResumeFromBackground = async () => undefined;
const noopRealtime = () => undefined;

const authHooks = {
  onStatus: null,
  onLoginOverlay: null,
  onUserUi: null,
  onDoctorAccess: null
};

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
    } catch (err) {
      diag.add?.('[auth] overlay hook error: ' + (err?.message || err));
    }
  } else if (typeof globalWindow?.showLoginOverlay === 'function') {
    try {
      globalWindow.showLoginOverlay(!!visible);
    } catch (_) {}
  }
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
  if (typeof globalWindow?.setUserUi === 'function') {
    try {
      globalWindow.setUserUi(email);
    } catch (_) {}
  }
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
  if (typeof globalWindow?.setDoctorAccess === 'function') {
    try {
      globalWindow.setDoctorAccess(!!enabled);
    } catch (_) {}
  }
};

const callAuthGuard = (enabled) => {
  if (typeof globalWindow?.setAuthGuard === 'function') {
    try {
      globalWindow.setAuthGuard(!!enabled);
    } catch (_) {}
  }
};

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

const finalizeAuthState = (logged) => {
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

const scheduleAuthGrace = () => {
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

export function watchAuthState() {
  if (!supabaseState.sbClient) return;
  if (!supabaseState.sbClient.auth?.onAuthStateChange) return;
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
}

export async function afterLoginBoot() {
  if (supabaseState.booted) return;
  supabaseState.booted = true;
  globalWindow
    ?.requestUiRefresh?.({ reason: 'boot:afterLogin' })
    .catch((err) => diag.add?.('ui refresh err: ' + (err?.message || err)));
}

export async function getUserId() {
  try {
    diag.add?.('[auth] getUserId start');
    const supa = await ensureSupabaseClient();
    if (!supa) {
      if (
        (supabaseState.authState === 'auth' || supabaseState.authState === 'unknown') &&
        supabaseState.lastUserId
      ) {
        diag.add?.(
          `[auth] getUserId fallback (no client) ${maskUid(supabaseState.lastUserId)}`
        );
        return supabaseState.lastUserId;
      }
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
        if (
          (supabaseState.authState === 'auth' || supabaseState.authState === 'unknown') &&
          supabaseState.lastUserId
        ) {
          diag.add?.(
            `[auth] getUserId fallback (timeout) ${maskUid(supabaseState.lastUserId)}`
          );
          return supabaseState.lastUserId;
        }
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
    if (
      (supabaseState.authState === 'auth' || supabaseState.authState === 'unknown') &&
      supabaseState.lastUserId
    ) {
      diag.add?.(`[auth] getUserId fallback (no uid) ${maskUid(supabaseState.lastUserId)}`);
      return supabaseState.lastUserId;
    }
    diag.add?.('[auth] getUserId done null');
    return null;
  } catch (e) {
    diag.add?.('[auth] getUserId error: ' + (e?.message || e));
    if (
      (supabaseState.authState === 'auth' || supabaseState.authState === 'unknown') &&
      supabaseState.lastUserId
    ) {
      diag.add?.(`[auth] getUserId fallback (error) ${maskUid(supabaseState.lastUserId)}`);
      return supabaseState.lastUserId;
    }
    return null;
  }
}

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

export function resetAuthHooks() {
  authHooks.onStatus = null;
  authHooks.onLoginOverlay = null;
  authHooks.onUserUi = null;
  authHooks.onDoctorAccess = null;
}
