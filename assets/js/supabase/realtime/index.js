'use strict';
/**
 * MODULE: supabase/realtime/index.js
 * intent: Realtime-Wrapper inklusive Resume-Flows (Focus/Visibility/PageShow)
 * exports: setupRealtime, teardownRealtime, resumeFromBackground, toEventsUrl
 * version: 1.8.2
 * compat: Browser / PWA / TWA
 * notes:
 *   - Delegiert Setup/Teardown an bestehende window.*-Implementierungen (Legacy)
 *   - Enthält native Resume-Implementierung (vormals index.html)
 *   - Verwendet Fallbacks, um fehlende Globals tolerant zu behandeln
 * author: System Integration Layer (M.I.D.A.S. v1.8)
 */

import { scheduleAuthGrace, finalizeAuthState } from '../auth/core.js';

const globalWindow = typeof window !== 'undefined' ? window : undefined;
const globalDocument = typeof document !== 'undefined' ? document : undefined;

const defaultSetupRealtime = async () => undefined;
const defaultTeardownRealtime = () => undefined;

const capturedSetup =
  typeof globalWindow?.setupRealtime === 'function'
    ? globalWindow.setupRealtime
    : defaultSetupRealtime;

const capturedTeardown =
  typeof globalWindow?.teardownRealtime === 'function'
    ? globalWindow.teardownRealtime
    : defaultTeardownRealtime;

const diag =
  globalWindow?.diag ||
  globalWindow?.AppModules?.diag ||
  globalWindow?.AppModules?.diagnostics ||
  { add() {}, init() {} };

const resumeState = {
  lastResumeAt: 0,
  running: false
};

const RESUME_COOLDOWN_MS = 0;

const asyncMaybe = async (fn, ...args) => {
  if (typeof fn !== 'function') return undefined;
  return fn(...args);
};

const callMaybe = (fn, ...args) => {
  if (typeof fn !== 'function') return undefined;
  return fn(...args);
};

const doubleRaf = async () => {
  const raf = globalWindow?.requestAnimationFrame;
  if (typeof raf !== 'function') return;
  await new Promise((resolve) => {
    raf(() => {
      raf(resolve);
    });
  });
};

const realtimeNeedsSetup = () => {
  const ready = !!globalWindow?.__rtReady;
  const channels = globalWindow?.__channels;
  if (!Array.isArray(channels)) return true;
  return !ready || channels.length === 0;
};

async function resumeFromBackgroundInternal({ source = 'resume' } = {}) {
  const now = Date.now();
  if (resumeState.running) {
    diag.add?.(`[resume] skipped (running) - ${source}`);
    return;
  }
  if (resumeState.lastResumeAt && now - resumeState.lastResumeAt < RESUME_COOLDOWN_MS) {
    diag.add?.(`[resume] skipped (cooldown) - ${source}`);
    return;
  }
  resumeState.running = true;
  resumeState.lastResumeAt = now;
  try {
    if (!diag?.logEl) {
      try {
        diag.init?.();
      } catch (_) {}
    }
    diag.add?.(`[resume] start: ${source}`);
    try {
      await doubleRaf();
    } catch (_) {}
    globalWindow?.AppModules?.uiLayout?.updateStickyOffsets?.();
    try {
      scheduleAuthGrace();
    } catch (err) {
      const msg = `[resume] scheduleAuthGrace failed: ${err?.message || err}`;
      diag.add?.(msg);
      console.error?.(msg, err);
      const fallback = globalWindow?.scheduleAuthGrace;
      if (typeof fallback === 'function' && fallback !== scheduleAuthGrace) {
        try {
          fallback();
        } catch (fbErr) {
          const fbMsg = `[resume] fallback scheduleAuthGrace failed: ${fbErr?.message || fbErr}`;
          diag.add?.(fbMsg);
          console.error?.(fbMsg, fbErr);
          throw fbErr;
        }
      }
    }

    const supa = await asyncMaybe(globalWindow?.ensureSupabaseClient);
    diag.add?.('[resume] supabase client ' + (supa ? 'ready' : 'missing'));
    if (!supa) {
      diag.add?.('[resume] no supabase client -> login overlay');
      try {
        finalizeAuthState(false);
      } catch (err) {
        const msg = `[resume] finalizeAuthState(false) failed: ${err?.message || err}`;
        diag.add?.(msg);
        console.error?.(msg, err);
        const fallback = globalWindow?.finalizeAuthState;
        if (typeof fallback === 'function' && fallback !== finalizeAuthState) {
          try {
            fallback(false);
          } catch (fbErr) {
            const fbMsg = `[resume] fallback finalizeAuthState(false) failed: ${fbErr?.message || fbErr}`;
            diag.add?.(fbMsg);
            console.error?.(fbMsg, fbErr);
            throw fbErr;
          }
        }
      }
      callMaybe(globalWindow?.showLoginOverlay, true);
      return;
    }

    let loggedIn = await asyncMaybe(globalWindow?.isLoggedInFast, { timeout: 800 });
    diag.add?.(`[resume] loggedFast=${loggedIn}`);
    if (!loggedIn) {
      diag.add?.('[resume] session miss -> refresh');
      try {
        const refreshed = await supa.auth.refreshSession();
        loggedIn = !!refreshed?.data?.session;
        diag.add?.(`[resume] refresh result=${loggedIn}`);
      } catch (err) {
        diag.add?.('[resume] refresh error: ' + (err?.message || err));
      }
    }
    try {
      finalizeAuthState(loggedIn);
    } catch (err) {
      const msg = `[resume] finalizeAuthState(${loggedIn}) failed`;
      diag.add?.(`${msg}: ${err?.message || err}`);
      console.error?.(msg, err);
      const fallback = globalWindow?.finalizeAuthState;
      if (typeof fallback === 'function' && fallback !== finalizeAuthState) {
        try {
          fallback(loggedIn);
        } catch (fbErr) {
          const fbMsg = `[resume] fallback finalizeAuthState(${loggedIn}) failed: ${fbErr?.message || fbErr}`;
          diag.add?.(fbMsg);
          console.error?.(fbMsg, fbErr);
          throw fbErr;
        }
      }
    }
    diag.add?.(`[resume] logged=${loggedIn}`);
    if (!loggedIn) {
      diag.add?.('[resume] no session -> login overlay');
      callMaybe(globalWindow?.showLoginOverlay, true);
      return;
    }

    try {
      await asyncMaybe(globalWindow?.maybeRefreshForTodayChange, { force: true, source: source || 'resume' });
      diag.add?.('[resume] day state refreshed');
    } catch (err) {
      diag.add?.('[resume] day refresh error: ' + (err?.message || err));
    }

    try {
      callMaybe(globalWindow?.bindIntakeCapture);
      diag.add?.('[resume] intake listeners rebound');
    } catch (err) {
      try {
        diag.add?.('[resume] intake listener error: ' + (err?.message || err));
      } catch (logErr) {
        globalWindow?.console?.error?.('diag.add failed', logErr);
      }
    }

    if (realtimeNeedsSetup()) {
      diag.add?.('Resume: re-setupRealtime');
      try {
        await setupRealtime();
        diag.add?.('[resume] realtime ensured');
      } catch (err) {
        diag.add?.('[resume] realtime error: ' + (err?.message || err));
        throw err;
      }
    }

    const schedule = globalWindow?.setTimeout || setTimeout;
    schedule(() => {
      const refreshPromise = asyncMaybe(globalWindow?.requestUiRefresh, { reason: 'resume', appointments: true });
      refreshPromise?.catch?.((err) => {
        diag.add?.('ui refresh err: ' + (err?.message || err));
      });
    }, 0);
    diag.add?.('[resume] ui refresh requested');

    callMaybe(globalWindow?.scheduleNoonSwitch);
    callMaybe(globalWindow?.maybeAutoApplyBpContext, { source });

    if (globalDocument) {
      try {
        let focusTarget = null;
        if (globalDocument.activeElement?.matches?.('input, select, textarea')) {
          focusTarget = globalDocument.activeElement;
        } else {
          const capture = globalDocument.getElementById?.('capture');
          if (capture?.classList?.contains('active')) {
            focusTarget = globalDocument.getElementById?.('captureAmount');
          }
        }
        if (focusTarget) {
          callMaybe(globalWindow?.ensureNotObscured, focusTarget);
          try {
            focusTarget.focus?.();
          } catch (_) {}
        }
      } catch (_) {}
    }

    diag.add?.('Resume: done');
  } catch (err) {
    diag.add?.('Resume error: ' + (err?.message || err));
  } finally {
    resumeState.running = false;
  }
}

export async function setupRealtime(...args) {
  return capturedSetup(...args);
}

export function teardownRealtime(...args) {
  return capturedTeardown(...args);
}

export async function resumeFromBackground(options = {}) {
  return resumeFromBackgroundInternal(options);
}

export function toEventsUrl(restUrl) {
  try {
    const url = String(restUrl || '').trim();
    if (!url) return null;
    return url.replace(/(\/rest\/v1\/)[^/?#]+/i, '$1health_events');
  } catch (_) {
    return null;
  }
}
