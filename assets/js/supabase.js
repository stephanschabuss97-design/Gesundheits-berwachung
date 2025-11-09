'use strict';
/**
 * MODULE: SUPABASE ACCESS (Legacy Proxy)
 * intent: exposes Supabase modules via a legacy window-based API without duplicating logic
 * exports: SupabaseAPI (forwarders only)
 */

import * as state from './supabase/core/state.js';
import * as client from './supabase/core/client.js';
import * as http from './supabase/core/http.js';
import * as authCore from './supabase/auth/core.js';
import * as authUi from './supabase/auth/ui.js';
import * as authGuard from './supabase/auth/guard.js';
import * as intake from './supabase/api/intake.js';
import * as vitals from './supabase/api/vitals.js';
import * as notes from './supabase/api/notes.js';
import * as realtime from './supabase/realtime/index.js';
import { pushPendingToRemote } from './supabase/api/push.js';
import { syncCaptureToggles } from './supabase/api/toggles.js';

const {
  supabaseState,
  cacheHeaders,
  clearHeaderCache,
  getCachedHeaders,
  getCachedHeadersAt,
  getHeaderPromise,
  setHeaderPromise
} = state;

const {
  baseUrlFromRest,
  ensureSupabaseClient,
  maskUid,
  setSupabaseDebugPii
} = client;

const { withRetry, fetchWithAuth } = http;

const showLoginOverlayLegacy = (show = true) =>
  show ? authUi.showLoginOverlay() : authUi.hideLoginOverlay();

Object.defineProperties(window, {
  sbClient: {
    configurable: true,
    get() {
      return supabaseState.sbClient;
    },
    set(value) {
      supabaseState.sbClient = value;
    }
  },
  __authState: {
    configurable: true,
    get() {
      return supabaseState.authState;
    },
    set(value) {
      supabaseState.authState = value;
    }
  },
  __lastLoggedIn: {
    configurable: true,
    get() {
      return supabaseState.lastLoggedIn;
    },
    set(value) {
      supabaseState.lastLoggedIn = value;
    }
  }
});

const supabaseApi = {
  withRetry,
  fetchWithAuth,
  cacheHeaders,
  clearHeaderCache,
  getCachedHeaders,
  getCachedHeadersAt,
  getHeaderPromise,
  setHeaderPromise,
  setSupabaseDebugPii,
  maskUid,
  baseUrlFromRest,
  ensureSupabaseClient,
  syncWebhook: notes.syncWebhook,
  patchDayFlags: notes.patchDayFlags,
  appendNoteRemote: notes.appendNoteRemote,
  deleteRemote: notes.deleteRemote,
  deleteRemoteDay: notes.deleteRemoteDay,
  loadIntakeToday: intake.loadIntakeToday,
  saveIntakeTotals: intake.saveIntakeTotals,
  saveIntakeTotalsRpc: intake.saveIntakeTotalsRpc,
  cleanupOldIntake: intake.cleanupOldIntake,
  loadBpFromView: vitals.loadBpFromView,
  loadBodyFromView: vitals.loadBodyFromView,
  loadFlagsFromView: vitals.loadFlagsFromView,
  fetchDailyOverview: vitals.fetchDailyOverview,
  pushPendingToRemote,
  syncCaptureToggles,
  bindAuthButtons: authUi.bindAuthButtons,
  prefillSupabaseConfigForm: authUi.prefillSupabaseConfigForm,
  setConfigStatus: authUi.setConfigStatus,
  showLoginOverlay: showLoginOverlayLegacy,
  hideLoginOverlay: authUi.hideLoginOverlay,
  setUserUi: authUi.setUserUi,
  setDoctorAccess: authGuard.setDoctorAccess,
  setupRealtime: realtime.setupRealtime,
  teardownRealtime: realtime.teardownRealtime,
  resumeFromBackground: realtime.resumeFromBackground,
  toEventsUrl: realtime.toEventsUrl,
  requireDoctorUnlock: authGuard.requireDoctorUnlock,
  resumeAfterUnlock: authGuard.resumeAfterUnlock,
  bindAppLockButtons: authGuard.bindAppLockButtons,
  authGuardState: authGuard.authGuardState,
  lockUi: authGuard.lockUi,
  requireSession: authCore.requireSession,
  watchAuthState: authCore.watchAuthState,
  afterLoginBoot: authCore.afterLoginBoot,
  getUserId: authCore.getUserId,
  isLoggedInFast: authCore.isLoggedInFast,
  scheduleAuthGrace: authCore.scheduleAuthGrace,
  finalizeAuthState: authCore.finalizeAuthState
};

export const SupabaseAPI = supabaseApi;
window.AppModules = window.AppModules || {};
window.AppModules.supabase = SupabaseAPI;
window.SupabaseAPI = SupabaseAPI;

const legacyGlobals = {
  cacheHeaders,
  clearHeaderCache,
  getCachedHeaders,
  getCachedHeadersAt,
  getHeaderPromise,
  setHeaderPromise,
  setSupabaseDebugPii,
  maskUid,
  baseUrlFromRest,
  ensureSupabaseClient,
  withRetry,
  fetchWithAuth,
  syncWebhook: notes.syncWebhook,
  patchDayFlags: notes.patchDayFlags,
  appendNoteRemote: notes.appendNoteRemote,
  deleteRemote: notes.deleteRemote,
  deleteRemoteDay: notes.deleteRemoteDay,
  loadIntakeToday: intake.loadIntakeToday,
  saveIntakeTotals: intake.saveIntakeTotals,
  saveIntakeTotalsRpc: intake.saveIntakeTotalsRpc,
  cleanupOldIntake: intake.cleanupOldIntake,
  loadBpFromView: vitals.loadBpFromView,
  loadBodyFromView: vitals.loadBodyFromView,
  loadFlagsFromView: vitals.loadFlagsFromView,
  fetchDailyOverview: vitals.fetchDailyOverview,
  pushPendingToRemote,
  syncCaptureToggles,
  bindAuthButtons: authUi.bindAuthButtons,
  prefillSupabaseConfigForm: authUi.prefillSupabaseConfigForm,
  setConfigStatus: authUi.setConfigStatus,
  showLoginOverlay: showLoginOverlayLegacy,
  hideLoginOverlay: authUi.hideLoginOverlay,
  setUserUi: authUi.setUserUi,
  setDoctorAccess: authGuard.setDoctorAccess,
  setupRealtime: realtime.setupRealtime,
  teardownRealtime: realtime.teardownRealtime,
  resumeFromBackground: realtime.resumeFromBackground,
  toEventsUrl: realtime.toEventsUrl,
  requireDoctorUnlock: authGuard.requireDoctorUnlock,
  resumeAfterUnlock: authGuard.resumeAfterUnlock,
  bindAppLockButtons: authGuard.bindAppLockButtons,
  authGuardState: authGuard.authGuardState,
  lockUi: authGuard.lockUi,
  requireSession: authCore.requireSession,
  watchAuthState: authCore.watchAuthState,
  afterLoginBoot: authCore.afterLoginBoot,
  getUserId: authCore.getUserId,
  isLoggedInFast: authCore.isLoggedInFast,
  scheduleAuthGrace: authCore.scheduleAuthGrace,
  finalizeAuthState: authCore.finalizeAuthState
};

Object.entries(legacyGlobals).forEach(([name, fn]) => {
  if (!(name in window)) {
    window[name] = fn;
  } else {
    window[name] = fn;
  }
});
