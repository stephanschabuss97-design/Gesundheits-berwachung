'use strict';
/**
 * MODULE: app/supabase.js
 * Description: Übergangs-Proxy für Supabase – spiegelt die modularen Komponenten aus `app/supabase/*`
 *              in ein globales SupabaseAPI-Objekt (window.AppModules.supabase), damit Legacy-Code
 *              ohne Refactor weiterläuft.
 * Submodules:
 *  - imports (core, auth, api, realtime)
 *  - Supabase State Binding (window.sbClient, __authState, __lastLoggedIn)
 *  - SupabaseAPI Aggregation (Forwarder für Core-/Auth-/API-/Realtime-Funktionen)
 *  - Legacy Window Exposure (AppModules.supabase, warnLegacy)
 * Notes:
 *  - Setzt keinerlei eigene Logik um, sondern delegiert nur an die modularen Dateien.
 *  - Dient Phase 2 als Brücke, bis alle Verbraucher direkt die neuen Module importieren.
 */

// SUBMODULE: imports @internal - bindet Supabase-Kernmodule, Auth- und API-Komponenten
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

// SUBMODULE: state exports @internal - extrahiert und forwardet State-Handler (Cache, Header, Promise)
const {
  supabaseState,
  cacheHeaders,
  clearHeaderCache,
  getCachedHeaders,
  getCachedHeadersAt,
  getHeaderPromise,
  setHeaderPromise
} = state;

// SUBMODULE: client exports @internal - zentrale Supabase-Client-Methoden und Debug-Toggles
const {
  baseUrlFromRest,
  ensureSupabaseClient,
  maskUid,
  setSupabaseDebugPii
} = client;

// SUBMODULE: http exports @internal - HTTP/FETCH Wrapper mit Retry-Logik
const { withRetry, fetchWithAuth } = http;

// SUBMODULE: ui overlay helpers @internal - Login-Overlay forwarder (UI-Schicht)
const showLoginOverlay = () => authUi.showLoginOverlay();
const hideLoginOverlay = () => authUi.hideLoginOverlay();

// SUBMODULE: window property binding @internal - verbindet Supabase-State mit globalem Fensterobjekt
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

// SUBMODULE: SupabaseAPI aggregation @public - bündelt alle Forwarder aus Core-, Auth-, API- und Realtime-Modulen
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
  appendNoteRemote: notes.appendNoteRemote,
  deleteRemote: notes.deleteRemote,
  deleteRemoteDay: notes.deleteRemoteDay,
  loadIntakeToday: intake.loadIntakeToday,
  saveIntakeTotals: intake.saveIntakeTotals,
  saveIntakeTotalsRpc: intake.saveIntakeTotalsRpc,
  cleanupOldIntake: intake.cleanupOldIntake,
  loadBpFromView: vitals.loadBpFromView,
  loadBodyFromView: vitals.loadBodyFromView,
  fetchDailyOverview: vitals.fetchDailyOverview,
  pushPendingToRemote,
  bindAuthButtons: authUi.bindAuthButtons,
  prefillSupabaseConfigForm: authUi.prefillSupabaseConfigForm,
  setConfigStatus: authUi.setConfigStatus,
  showLoginOverlay,
  hideLoginOverlay,
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

// SUBMODULE: export binding @public - registriert SupabaseAPI unter window.AppModules.supabase
export const SupabaseAPI = supabaseApi;
window.AppModules = window.AppModules || {};
window.AppModules.supabase = SupabaseAPI;

// SUBMODULE: warnLegacy @internal - Platzhalter für zukünftige Warnmeldungen bei globalem Zugriff
const warnLegacy = () => {};

// SUBMODULE: legacy window proxies @internal - leitet alte globale Aufrufe auf SupabaseAPI weiter
const legacyNames = [...Object.keys(SupabaseAPI), 'SupabaseAPI'];
legacyNames.forEach((name) => {
  if (Object.prototype.hasOwnProperty.call(window, name)) return;
  Object.defineProperty(window, name, {
    configurable: true,
    get() {
      warnLegacy(name);
      return name === 'SupabaseAPI' ? SupabaseAPI : SupabaseAPI[name];
    },
    set(value) {
      warnLegacy(name);
      if (name !== 'SupabaseAPI') {
        SupabaseAPI[name] = value;
      }
    }
  });
});
