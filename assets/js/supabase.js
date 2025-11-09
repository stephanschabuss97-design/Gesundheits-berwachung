/**
 * MODULE: SUPABASE ACCESS
 * intent: kapselt Supabase REST/RPC und Auth-gebundene Fetch-Helper
 * exports: withRetry, fetchWithAuth, syncWebhook, patchDayFlags, appendNoteRemote, deleteRemote,
 *          loadIntakeToday, saveIntakeTotals, saveIntakeTotalsRpc, cleanupOldIntake,
 *          loadBpFromView, loadBodyFromView, loadFlagsFromView, syncCaptureToggles,
 *          fetchDailyOverview, deleteRemoteDay, baseUrlFromRest, ensureSupabaseClient
 * notes: Logik unveraendert aus index.html extrahiert
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
  isServiceRoleKey,
  ensureSupabaseClient,
  maskUid,
  setSupabaseDebugPii
} = client;

const { withRetry, fetchWithAuth } = http;

const verifyImport = (moduleName, name, value, type = 'function') => {
  const ok =
    type === 'object'
      ? value && typeof value === 'object'
      : typeof value === type;
  if (!ok) {
    throw new Error(`Supabase module ${moduleName} missing export: ${name}`);
  }
};

verifyImport('core/state', 'supabaseState', supabaseState, 'object');
verifyImport('core/client', 'ensureSupabaseClient', ensureSupabaseClient);
verifyImport('core/http', 'withRetry', withRetry);
verifyImport('core/http', 'fetchWithAuth', fetchWithAuth);
verifyImport('auth/core', 'requireSession', authCore.requireSession);
verifyImport('auth/core', 'watchAuthState', authCore.watchAuthState);
verifyImport('auth/ui', 'bindAuthButtons', authUi.bindAuthButtons);
verifyImport('auth/ui', 'setConfigStatus', authUi.setConfigStatus);
verifyImport('auth/guard', 'requireDoctorUnlock', authGuard.requireDoctorUnlock);
verifyImport('auth/core', 'initAuth', authCore.initAuth);
verifyImport('auth/ui', 'showLoginOverlay', authUi.showLoginOverlay);
verifyImport('auth/ui', 'hideLoginOverlay', authUi.hideLoginOverlay);
verifyImport('auth/guard', 'setDoctorAccess', authGuard.setDoctorAccess);
verifyImport('auth/guard', 'resumeAfterUnlock', authGuard.resumeAfterUnlock);
verifyImport('auth/guard', 'bindAppLockButtons', authGuard.bindAppLockButtons);
verifyImport('auth/guard', 'authGuardState', authGuard.authGuardState, 'object');
verifyImport('auth/guard', 'lockUi', authGuard.lockUi);

const syncWebhook = (...args) => notes.syncWebhook(...args);
const patchDayFlags = (...args) => notes.patchDayFlags(...args);
const appendNoteRemote = (...args) => notes.appendNoteRemote(...args);
const deleteRemote = (...args) => notes.deleteRemote(...args);
const deleteRemoteDay = (...args) => notes.deleteRemoteDay(...args);

const loadIntakeToday = (...args) => intake.loadIntakeToday(...args);
const saveIntakeTotals = (...args) => intake.saveIntakeTotals(...args);
const saveIntakeTotalsRpc = (...args) => intake.saveIntakeTotalsRpc(...args);
const cleanupOldIntake = (...args) => intake.cleanupOldIntake(...args);

const loadBpFromView = (...args) => vitals.loadBpFromView(...args);
const loadBodyFromView = (...args) => vitals.loadBodyFromView(...args);
const loadFlagsFromView = (...args) => vitals.loadFlagsFromView(...args);
const fetchDailyOverview = (...args) => vitals.fetchDailyOverview(...args);

const setupRealtimeProxy = (...args) => realtime.setupRealtime(...args);
const teardownRealtimeProxy = (...args) => realtime.teardownRealtime(...args);
const resumeFromBackgroundProxy = (...args) => realtime.resumeFromBackground(...args);
const toEventsUrl = (...args) => realtime.toEventsUrl(...args);

Object.defineProperties(window, {
  sbClient: {
    configurable: true,
    get() { return supabaseState.sbClient; },
    set(value) { supabaseState.sbClient = value; }
  },
  __authState: {
    configurable: true,
    get() { return supabaseState.authState; },
    set(value) { supabaseState.authState = value; }
  },
  __lastLoggedIn: {
    configurable: true,
    get() { return supabaseState.lastLoggedIn; },
    set(value) { supabaseState.lastLoggedIn = value; }
  }
});

const defaultRequireDoctorUnlock = async () => true;

function getUiCore() {
  return (window.AppModules && window.AppModules.uiCore) || {};
}

function activateFocusTrap(root) {
  const trap = getUiCore().focusTrap;
  if (trap && typeof trap.activate === 'function') {
    trap.activate(root);
  }
}

function deactivateFocusTrap() {
  const trap = getUiCore().focusTrap;
  if (trap && typeof trap.deactivate === 'function') {
    trap.deactivate();
  }
}

  
// SUBMODULE: syncWebhook @extract-candidate - posts capture events batch to Supabase with fallbacks
async function pushPendingToRemote(){
  const url = await getConf("webhookUrl");
  if(!url) return { pushed:0, failed:0 };

  const all = await getAllEntries();
  const pending = all.filter(e => !e.remote_id);

  let pushed = 0, failed = 0;

  for (const e of pending){
    try{
      const uid = await getUserId();

      // 1) Legacy-Entry  0..N Events
      const events = toHealthEvents(e);
      if (!events.length) { 
        // nichts sendbar: als "abgearbeitet" markieren, damit wir nicht haengen bleiben
        await updateEntry(e.id, { remote_id: -1 });
        continue;
      }

      // 2) user_id anhaengen (RLS)
      const payload = uid ? events.map(ev => ({...ev, user_id: uid})) : events;

      // 3) Batch-POST (Array)
      const res = await fetchWithAuth(
        headers => fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        }),
        { tag: 'pending:post', maxAttempts: 2 }
      );
      if (!res.ok) { failed++; continue; }

      const json = await res.json();
      const firstId = json?.[0]?.id ?? null;

      // 4) Lokal markieren: irgendein Remote-Event existiert  Cloud-Icon ok
      if (firstId != null) {
        await updateEntry(e.id, { remote_id: firstId });
        pushed++;
      } else {
        failed++;
      }

      await sleep(50);
    } catch(err){
      failed++;
      if (err?.status === 401 || err?.status === 403) {
        diag.add?.('[push] auth error, abbrechen');
        break;
      }
    }
  }

  return { pushed, failed };
}

async function prefillSupabaseConfigForm(...args){
  return authUi.prefillSupabaseConfigForm(...args);
}


function setConfigStatus(...args){
  return authUi.setConfigStatus(...args);
}
window.setConfigStatus = setConfigStatus;

function showLoginOverlay(show = true){
  if (show) {
    return authUi.showLoginOverlay();
  }
  return authUi.hideLoginOverlay();
}
window.showLoginOverlay = showLoginOverlay;
function hideLoginOverlay(){
  return authUi.hideLoginOverlay();
}
window.hideLoginOverlay = hideLoginOverlay;
function setUserUi(email){
  return authUi.setUserUi(email);
}
function setDoctorAccess(enabled){
  return authGuard.setDoctorAccess(enabled);
}
window.setDoctorAccess = setDoctorAccess;

const AUTH_GRACE_MS = 400;
async function isLoggedInFast(options){
  return authCore.isLoggedInFast(options ?? {});
}

function clearAuthGrace(){
  if (supabaseState.authGraceTimer){
    clearTimeout(supabaseState.authGraceTimer);
    supabaseState.authGraceTimer = null;
  }
}

function applyAuthUi(logged){
  try { setAuthGuard(!!logged); } catch(_){}
  try { setDoctorAccess(!!logged); } catch(_){}
  if (logged){
    showLoginOverlay(false);
  } else if (supabaseState.authState !== 'unknown'){
    showLoginOverlay(true);
  }
}

function finalizeAuthState(logged){
  clearAuthGrace();
  supabaseState.authState = logged ? 'auth' : 'unauth';
  supabaseState.lastLoggedIn = logged;
  if (logged){
    supabaseState.pendingSignOut = null;
  } else if (typeof supabaseState.pendingSignOut === 'function'){
    Promise.resolve(supabaseState.pendingSignOut()).catch(()=>{}).finally(()=>{ supabaseState.pendingSignOut = null; });
  }
  applyAuthUi(logged);
}

function scheduleAuthGrace(){
  clearAuthGrace();
  supabaseState.authState = 'unknown';
  supabaseState.authGraceTimer = setTimeout(async ()=>{
    try{
      if (!supabaseState.sbClient){
        finalizeAuthState(false);
        return;
      }
      diag.add?.("[capture] guard: request session");
  const { data } = await supabaseState.sbClient.auth.getSession();
  diag.add?.("[capture] guard: session resp");
      finalizeAuthState(!!data?.session);
    }catch(_){
      finalizeAuthState(false);
    }
  }, AUTH_GRACE_MS);
}

// Buttons binden (einmalig, z. B. in main())
function bindAuthButtons(...args){
  return authUi.bindAuthButtons(...args);
}

window.bindAuthButtons = bindAuthButtons;

// Beim Start Session pruefen
async function requireSession(...args){
  return authCore.requireSession(...args);
}

window.requireSession = requireSession;

async function requireDoctorUnlock(...args){
  if (typeof authGuard.requireDoctorUnlock === 'function') {
    return authGuard.requireDoctorUnlock(...args);
  }
  return defaultRequireDoctorUnlock(...args);
}
window.requireDoctorUnlock = requireDoctorUnlock;

// Reagiert auch auf spaetere Logins (z. B. nach Redirect)
function watchAuthState(...args){
  return authCore.watchAuthState(...args);
}

window.watchAuthState = watchAuthState;

// Alles, was NACH Login laufen soll (deine bestehende Logik)

async function afterLoginBoot(...args){
  return authCore.afterLoginBoot(...args);
}

window.afterLoginBoot = afterLoginBoot;

/* ===== CSV/JSON export (Daily) ===== */
function dl(filename, content, mime){
const a = document.createElement("a");
a.href = URL.createObjectURL(new Blob([content], {type:mime}));
a.download = filename;
a.click();
URL.revokeObjectURL(a.href);
}

/* --- Button-Flash (nur Platzhalter, wie gehabt) --- */


function flashButtonOk(btn, successHtml){
  if (!btn) return;
  const base = btn.dataset.label || btn.innerHTML;
  btn.dataset.label = base;
  btn.disabled = true;
  btn.innerHTML = successHtml;
  const panel = btn.closest('.card, .card-nested');
  if (panel){
    panel.classList.remove('panel-flash');
    void panel.offsetWidth;
    panel.classList.add('panel-flash');
    setTimeout(()=>panel.classList.remove('panel-flash'), 480);
  }
  setTimeout(()=>{
    btn.innerHTML = btn.dataset.label;
    btn.disabled = false;
  }, 1200);
}

/** MODULE: UI / ROUTING / VIEWS - Navigation (Tabs/Resume/Focus)
 * intent: Tab- und Overlay-Routing, Resume-Listener, Fokusreparatur
 * exports: setTab, bindTabs
 * notes: Fortsetzung der Navigations-Hooks nach dem Chart-Block; keine DOM-Aenderungen
 */
/* ===== Tabs / Segments ===== */
// @refactor: moved to assets/js/ui-tabs.js (setTab, bindTabs, bindHeaderShadow)
/** END MODULE */








// SUBMODULE: deleteRemote @internal - deletes single health_event via REST endpoint
// Sync capture toggles with existing day flags from the cloud for the selected date
// SUBMODULE: syncCaptureToggles @internal - aligns capture toggles with remote day flags
async function syncCaptureToggles(){
  try{
    const uid = await getUserId();
    const dayIso = document.getElementById('date')?.value || todayStr();
    const rows = await loadFlagsFromView({ user_id: uid, from: dayIso, to: dayIso });
    const r = Array.isArray(rows) && rows.length ? rows[0] : null;
    // Apply or clear
    const f = r || { training:false, sick:false, low_intake:false, salt_high:false, protein_high90:false, valsartan_missed:false, forxiga_missed:false, nsar_taken:false };
    setTraining(!!f.training);
    setSick(!!f.sick);
    setLowIntake(!!f.low_intake);
    setSaltHigh(!!f.salt_high);
    setProteinHigh(!!f.protein_high90);
    setValsartanMiss(!!f.valsartan_missed);
    setForxigaMiss(!!f.forxiga_missed);
    setNsar(!!f.nsar_taken);
    const flagsCommentEl = document.getElementById("flagsComment");
    if (flagsCommentEl) flagsCommentEl.value = "";
  }catch(_){ /* non-blocking */ }
}


/* Server: alle Events eines Tages loeschen (RLS: nur eigene Records) */
// SUBMODULE: deleteRemoteDay @internal - entfernt alle Events eines Tages serverseitig
// SUBMODULE: baseUrlFromRest @internal - strips /rest prefix to find Supabase base URL
window.baseUrlFromRest = baseUrlFromRest;


// SUBMODULE: getUserId @public - resolves current Supabase auth user with timeout fallbacks
async function getUserId(...args){
  return authCore.getUserId(...args);
}

// Public Supabase API surface - intentional exports only
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
  syncWebhook,
  patchDayFlags,
  appendNoteRemote,
  deleteRemote,
  loadIntakeToday,
  saveIntakeTotals,
  saveIntakeTotalsRpc,
  cleanupOldIntake,
  loadBpFromView,
  loadBodyFromView,
  loadFlagsFromView,
  syncCaptureToggles,
  bindAuthButtons,
  fetchDailyOverview,
  deleteRemoteDay,
  afterLoginBoot,
  requireSession,
  watchAuthState,
  initAuth: authCore.initAuth,
  showLoginOverlay,
  hideLoginOverlay,
  setConfigStatus,
  setUserUi,
  setDoctorAccess,
  setupRealtime: setupRealtimeProxy,
  teardownRealtime: teardownRealtimeProxy,
  requireDoctorUnlock,
  resumeAfterUnlock: authGuard.resumeAfterUnlock,
  bindAppLockButtons: authGuard.bindAppLockButtons,
  authGuardState: authGuard.authGuardState,
  lockUi: authGuard.lockUi,
  resumeFromBackground: resumeFromBackgroundProxy,
  getUserId,
  isLoggedInFast
};
export const SupabaseAPI = supabaseApi;
window.AppModules = window.AppModules || {};
window.AppModules.supabase = SupabaseAPI;
window.SupabaseAPI = SupabaseAPI;
for (const key of Object.keys(supabaseApi)) {
  if (!(key in window)) {
    window[key] = supabaseApi[key];
  }
}

