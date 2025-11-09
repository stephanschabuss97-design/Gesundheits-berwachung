'use strict';
let supabaseMissingLogged = false;
const getSupabaseApi = () => {
  const api = window.SupabaseAPI;
  if (!api) {
    if (!supabaseMissingLogged) {
      console.error('[BOOT] SupabaseAPI nicht geladen – prüfe assets/js/supabase/index.js / Script-Reihenfolge.');
      supabaseMissingLogged = true;
    }
    return null;
  }
  supabaseMissingLogged = false;
  return api;
};
const SUPABASE_READY_EVENT = 'supabase:ready';
const hasSupabaseFn = (name) => typeof getSupabaseApi()?.[name] === 'function';
const createSupabaseFn = (name, { optional = false } = {}) => (...args) => {
  const fn = getSupabaseApi()?.[name];
  if (typeof fn !== 'function') {
    if (optional) return undefined;
    throw new Error(`SupabaseAPI.${name} fehlt`);
  }
  return fn(...args);
};

const fetchWithAuth = createSupabaseFn('fetchWithAuth');
const ensureSupabaseClient = createSupabaseFn('ensureSupabaseClient');
const getUserId = createSupabaseFn('getUserId');
const isLoggedInFast = createSupabaseFn('isLoggedInFast');
const syncWebhook = createSupabaseFn('syncWebhook');
const loadIntakeToday = createSupabaseFn('loadIntakeToday');
const saveIntakeTotalsRpc = createSupabaseFn('saveIntakeTotalsRpc');
const cleanupOldIntake = createSupabaseFn('cleanupOldIntake', { optional: true });
const fetchDailyOverview = createSupabaseFn('fetchDailyOverview');
const deleteRemoteDay = createSupabaseFn('deleteRemoteDay');
const syncCaptureToggles = createSupabaseFn('syncCaptureToggles');
const setupRealtime = createSupabaseFn('setupRealtime');
const setConfigStatus = createSupabaseFn('setConfigStatus');
const showLoginOverlay = createSupabaseFn('showLoginOverlay');
const requireSession = createSupabaseFn('requireSession');
const watchAuthState = createSupabaseFn('watchAuthState');
const bindAuthButtons = createSupabaseFn('bindAuthButtons');
const afterLoginBoot = createSupabaseFn('afterLoginBoot');
const baseUrlFromRest = createSupabaseFn('baseUrlFromRest');
const requireDoctorUnlock = createSupabaseFn('requireDoctorUnlock');
const bindAppLockButtons = createSupabaseFn('bindAppLockButtons');
const resumeFromBackground = createSupabaseFn('resumeFromBackground');
const pushPendingToRemote = createSupabaseFn('pushPendingToRemote', { optional: true });
const reconcileFromRemote = createSupabaseFn('reconcileFromRemote', { optional: true });

const getLockUi = () => {
  const fn = getSupabaseApi()?.lockUi;
  return typeof fn === 'function' ? fn : null;
};
const getAuthGuardState = () => {
  const state = getSupabaseApi()?.authGuardState;
  return state && typeof state === 'object' ? state : null;
};
const isDoctorUnlocked = () => !!getAuthGuardState()?.doctorUnlocked;
const setAuthPendingAfterUnlock = (value) => {
  const state = getAuthGuardState();
  if (state) {
    state.pendingAfterUnlock = value ?? null;
  }
};
const delay = (ms = 0) => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const waitForSupabaseApi = (() => {
  let pendingPromise = null;
  return ({ timeout = 6000, pollInterval = 25 } = {}) => {
    const ready = getSupabaseApi();
    if (ready) return Promise.resolve(ready);
    if (pendingPromise) return pendingPromise;

    pendingPromise = new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        document.removeEventListener(SUPABASE_READY_EVENT, onReady);
        clearInterval(pollId);
        if (timeoutId) clearTimeout(timeoutId);
        pendingPromise = null;
      };
      const onReady = () => {
        const api = getSupabaseApi();
        if (!api) return;
        cleanup();
        resolve(api);
      };
      const pollId = setInterval(onReady, pollInterval);
      document.addEventListener(SUPABASE_READY_EVENT, onReady, { once: false });
      let timeoutId = null;
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('SupabaseAPI not ready within timeout'));
        }, timeout);
      }
      // immediate check in case API became ready between Promise creation and listener setup
      onReady();
    });
    return pendingPromise;
  };
})();

/** MODULE: LOGGING & DIAGNOSTICS
 * intent: sammelt UI-/Runtime-Diagnosen, zeigt Fehler an, speist das Touch-Log
 * contracts: stellt diag-Logger, perfStats-Snapshots, uiError/uiInfo fuer UI-Module bereit
 * exports: diag, recordPerfStat, uiError, uiInfo
 * notes: rein beobachtend; Verhalten bleibt unveraendert
 */


/** MODULE: UI / ROUTING / VIEWS - Core (Refresh/Help)
 * intent: steuert Hilfspanel, UI Refresh Loop, Tabs & Fokusreparatur
 * contracts: stellt requestUiRefresh @public, maybeRefreshForTodayChange, setUnderlayInert fuer andere Module bereit
 * exports: requestUiRefresh, runUiRefresh, maybeRefreshForTodayChange, setUnderlayInert
 * notes: Fortsetzung des Kern-UI-Routings (Refresh/Help); DOM-Struktur unveraendert belassen
 */
// @refactor: moved to assets/js/ui.js (helpPanel)

/* ===== Helpers ===== */
const UI_REFRESH_TIMEOUT_MS = 8000;
const GET_USER_TIMEOUT_MS = 2000;
const uiRefreshState = {
  timer: null,
  running: false,
  docNeeded: false,
  chartNeeded: false,
  lifestyleNeeded: false,
  appointmentsNeeded: false,
  resolvers: [],
  lastReason: '',
  reasons: new Set()
};

const uiRefreshTimeoutSymbol = Symbol('ui-refresh-timeout');
const uiNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();

function getDoctorModule(){
  return window.AppModules?.doctor;
}

function getChartPanel(){
  return window.AppModules?.charts?.chartPanel;
}

// SUBMODULE: requestUiRefresh @public - debounces multi-surface refresh (doctor/chart/capture); mutex via uiRefreshState
function requestUiRefresh(opts = {}) {
  if (typeof opts === "string") {
    opts = { reason: opts };
  }
  const reason = opts.reason || '';
  const doctor = opts.doctor !== undefined ? !!opts.doctor : true;

  let chartDefault = false;
  const chartPanel = getChartPanel();
  try { chartDefault = !!(chartPanel?.open); } catch(_) {}
  const chart = opts.chart !== undefined ? !!opts.chart : chartDefault;

  let lifestyleDefault = false;
  try {
    const lifestyleEl = document.getElementById('lifestyle');
    lifestyleDefault = !!(lifestyleEl?.classList?.contains('active'));
  } catch(_) {}
  const lifestyle = opts.lifestyle !== undefined ? !!opts.lifestyle : lifestyleDefault;

  const appointments = opts.appointments !== undefined ? !!opts.appointments : false;

  uiRefreshState.docNeeded = uiRefreshState.docNeeded || doctor;
  uiRefreshState.chartNeeded = uiRefreshState.chartNeeded || chart;
  uiRefreshState.lifestyleNeeded = uiRefreshState.lifestyleNeeded || lifestyle;
  uiRefreshState.appointmentsNeeded = uiRefreshState.appointmentsNeeded || appointments;
  uiRefreshState.lastReason = reason || uiRefreshState.lastReason;
  if (reason) uiRefreshState.reasons.add(reason);

  const promise = new Promise(resolve => uiRefreshState.resolvers.push(resolve));

  if (!uiRefreshState.running && !uiRefreshState.timer) {
    uiRefreshState.timer = setTimeout(() => {
      uiRefreshState.timer = null;
      runUiRefresh().catch(err => {
        diag.add?.('[ui] refresh fatal: ' + (err?.message || err));
      });
    }, 0);
  }
  return promise;
}

// SUBMODULE: runUiSubStep @internal - executes gated refresh tasks with perf tracking
async function runUiSubStep(label, enabled, fn) {
  if (!enabled) return;
  const start = uiNow();
  diag.add?.(`[ui] step start ${label}`);
  let timeoutId;
  let timedOut = false;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(uiRefreshTimeoutSymbol);
    }, UI_REFRESH_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      (async () => {
        try {
          await fn();
        } catch (err) {
          if (!timedOut) throw err;
          diag.add?.(`[ui] step late error ${label}: ${err?.message || err}`);
        }
      })(),
      timeoutPromise
    ]);
    const duration = Math.round(uiNow() - start);
    diag.add?.(`[ui] step end ${label} (${duration} ms)`);
  } catch (err) {
    const duration = Math.round(uiNow() - start);
    if (err === uiRefreshTimeoutSymbol) {
      diag.add?.(`[ui] step timeout ${label} (${duration} ms)`);
    } else {
      diag.add?.(`[ui] step error ${label}: ${err?.message || err} (${duration} ms)`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// SUBMODULE: runUiRefresh @internal - orchestrates capture/doctor/chart refresh pipeline
async function runUiRefresh(){
  const state = uiRefreshState;
  if (state.timer){
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.running) return;
  state.running = true;
  const refreshStart = uiNow();
  const reasons = state.reasons.size ? Array.from(state.reasons) : (state.lastReason ? [state.lastReason] : []);
  state.reasons.clear();
  const reasonLabel = reasons.length ? reasons.join(',') : 'unspecified';
  diag.add?.(`[ui] refresh start reason=${reasonLabel}`);
  try {
    while (state.docNeeded || state.chartNeeded || state.lifestyleNeeded || state.appointmentsNeeded) {
      const doc = state.docNeeded;
      const chart = state.chartNeeded;
      const lifestyle = state.lifestyleNeeded;
      const appointments = state.appointmentsNeeded;
      state.docNeeded = false;
      state.chartNeeded = false;
      state.lifestyleNeeded = false;
      state.appointmentsNeeded = false;

      const doctorModule = getDoctorModule();
      const chartPanel = getChartPanel();

      await runUiSubStep('doctor', doc, async () => { await doctorModule?.renderDoctor?.(); });
      await runUiSubStep('appointments', appointments, async () => {
        await window.AppModules.appointments.refreshAppointments();
      });
      await runUiSubStep('lifestyle', lifestyle && typeof window.AppModules.capture?.renderLifestyle === 'function', async () => { await window.AppModules.capture.renderLifestyle(); });
      await runUiSubStep('chart', chart && !!chartPanel?.draw, async () => { await chartPanel?.draw?.(); });
    }
  } finally {
    state.running = false;
    const duration = Math.round(uiNow() - refreshStart);
    diag.add?.(`[ui] refresh end reason=${reasonLabel} (${duration} ms)`);
    const resolvers = state.resolvers;
    state.resolvers = [];
    resolvers.forEach(resolve => { try { resolve(); } catch(_){} });
    if ((state.docNeeded || state.chartNeeded || state.lifestyleNeeded || state.appointmentsNeeded) && !state.timer){
      state.timer = setTimeout(() => {
        uiRefreshState.timer = null;
        runUiRefresh().catch(err => diag.add?.('[ui] refresh fatal: ' + (err?.message || err)));
      }, 0);
    }
  }
}
// kleines visuelles Ping bei Realtime
// SUBMODULE: livePulse @internal - flashes heartbeat indicator for realtime events
function livePulse(){
  const el = document.getElementById('doctorLive');
  if (!el) return;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 900);
}

/** END MODULE */

// --- Service-Role-Schutz (NIEMALS im Browser) ---
// SUBMODULE: isServiceRoleKey @internal - blocks service_role keys in browser context
function isServiceRoleKey(raw){
  const tok = String(raw||"").trim().replace(/^Bearer\s+/i,'');
  try{
    const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return payload?.role === 'service_role';
  }catch{
    return false; // Fallback: lieber konservativ sein
  }
}

// ANCHOR: num-helper-de
function toNumDE(s) {
  if (s == null) return null;
  let v = String(s).trim();
  if (!v) return null;
  // strip trailing units/symbols
  v = v.replace(/\s*(?:%|\u2030|[A-Za-z]+|\u20AC|\$|\u00A3)\s*$/u, '');
  // normalize minus and spaces
  v = v.replace(/[\u2212\u2013\u2014]/g, '-').replace(/[\u00A0\u2009\u202F]/g, ' ').replace(/\s+/g, '');
  // decide decimal separator
  const lastComma = v.lastIndexOf(',');
  const lastDot   = v.lastIndexOf('.');
  let dec = null;
  if (lastComma !== -1 && lastDot !== -1) dec = (lastComma > lastDot) ? ',' : '.';
  else if (lastComma !== -1) dec = (v.length - lastComma - 1) <= 2 ? ',' : null;
  else if (lastDot   !== -1) dec = (v.length - lastDot   - 1) <= 2 ? '.' : null;
  if (dec) {
    // protect the chosen decimal (replace its last occurrence with placeholder)
    v = v.replace(new RegExp('\\' + dec + '(?=[^' + (dec === '.' ? '\\.' : ',') + ']*$)'), '#');
  }
  // remove remaining group separators (.,', and spaces)
  v = v.replace(/[.,'\s]/g, '');
  if (dec) v = v.replace('#', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// @refactor: moved to assets/js/diagnostics.js (uiError, uiInfo)

// @refactor: moved to assets/js/ui.js (debounce)

// @refactor: moved to assets/js/ui.js (setUnderlayInert)

// @refactor: moved to assets/js/ui-layout.js (updateStickyOffsets)

// @refactor: moved to assets/js/ui-layout.js (ensureNotObscured & focus handler)

// @refactor: moved to assets/js/ui.js (focusTrap)

// @refactor: moved to assets/js/ui-errors.js (restErrorMessage, uiRestError, withBusy)
  
/** MODULE: AUTH
 * intent: verwaltet Supabase-Sitzung, legt Auth-Locks frei, bindet Login-Overlay ein
 * contracts: stellt isLoggedIn @public, setAuthGuard, setDoctorAccess bereit und sichert spaeter Client/Header fuer DATA ACCESS
 * exports: isLoggedIn, isLoggedInFast, setAuthGuard, setDoctorAccess
 * notes: Seiteneffekte auf Auth-Surfaces beschraenken; Verhalten unveraendert lassen
 */
/* ===== Auth-Guard ===== */
// SUBMODULE: isLoggedIn @public - quick check to gate protected actions
async function isLoggedIn(){
  const client = (typeof sbClient !== 'undefined' && sbClient) || getSupabaseApi()?.sbClient || null;
  if (!client) return false;
  return await isLoggedInFast({ timeout: 800 });
}

/** Schaltet optisch auf "gesperrt" - ohne Controls hart zu deaktivieren */
// SUBMODULE: setAuthGuard - dims UI when auth session missing
function setAuthGuard(logged){
  // Nur visuelles Dimmen; die Save-Logik prueft isLoggedIn() ohnehin.
  document.body.classList.toggle('auth-locked', !logged);
  // Kein auto-boot mehr hier - Start erfolgt in main()/watchAuthState.
}

// SUBMODULE: setDoctorAccess - toggles doctor tab when auth state changes
function setDoctorAccess(enabled){
  // Tab-Button
  const tabBtn = document.getElementById('tab-doctor');
  if (tabBtn){
    tabBtn.disabled = !enabled;
    tabBtn.classList.toggle('ghost', !enabled);
    tabBtn.title = enabled ? '' : 'Bitte zuerst anmelden';
  }
  // "Werte anzeigen"-Button
  const chartBtn = document.getElementById('doctorChartBtn');
  if (chartBtn){
    chartBtn.disabled = !enabled;
    chartBtn.title = enabled ? 'Werte als Grafik' : 'Bitte zuerst anmelden';
  }
  // Lifestyle-Tab mitsteuern
  
}
  
/** END MODULE */
  
/** MODULE: UTILITIES
 * intent: generische DOM/Format Helper fuer das Monolith-Skript
 * contracts: stellt $, $$, fmtNum, todayStr, timeStr, esc/nl2br fuer UI-/Capture-Module bereit
 * exports: $, $$, fmtNum, todayStr, timeStr, esc, nl2br
 * notes: deterministische Hilfsfunktionen; rein funktional belassen
 */
// @refactor: moved to assets/js/utils.js ($, $$, fmtNum, pad2, todayStr, timeStr, esc, nl2br)

/** END MODULE */

/** MODULE: CAPTURE (Intake)
 * intent: steuert Intake-State, Mitternachts-Resets und Bindings fuer die Tageserfassung
 * contracts: nutzt DATA ACCESS.loadIntakeToday/saveIntakeTotals*, UI.requestUiRefresh, AUTH.isLoggedIn
 * exports: refreshCaptureIntake, scheduleMidnightRefresh, maybeResetIntakeForToday, bindIntakeCapture, updateCaptureIntakeStatus
 * notes: spiegelt CAPTURE UI Modul; reine Logik
 */
/** MODULE: DATA ACCESS (IndexedDB)
 * intent: lokale IndexedDB- und Konfig-Hilfen fuer Intake-/Doctor-Features
 * contracts: stellt initDB, Config-Lese/Schreibhelfer sowie Entry-Stores fuer CAPTURE/BP bereit
 * exports: initDB, putConf, getConf, addEntry, updateEntry, getAllEntries, getEntryByRemoteId, deleteEntryLocal, dayIsoToMidnightIso
 * notes: dient als Basis fuer Offline-Zwischenspeicher; keine Netz-Calls
 */
// @refactor: moved to assets/js/data-local.js (initDB, putConf, getConf, dayIsoToMidnightIso, addEntry, updateEntry, getAllEntries, getEntryByRemoteId, deleteEntryLocal)

/** END MODULE */

/* ===== Remote (Supabase REST) ===== */
/** MODULE: AUTH
 * intent: stellt Supabase JWT Header bereit und kapselt Service-Role-Schutz (Fortsetzung)
 * contracts: stellt getHeaders @public fuer DATA ACCESS.fetchWithAuth zur Verfuegung
 * exports: getHeaders
 * notes: kurzer Zwischenblock; Caching-Semantik unveraendert lassen
 */
const HEADER_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

const tryGetCachedHeaders = (supaApi, maxAgeMs = HEADER_CACHE_MAX_AGE_MS) => {
  try {
    const cached = supaApi.getCachedHeaders?.();
    const cachedAt = supaApi.getCachedHeadersAt?.();
    if (cached && cachedAt && (Date.now() - cachedAt) < maxAgeMs) {
      return cached;
    }
  } catch(_) { /* ignore cache errors */ }
  return null;
};

const getStaleCachedHeaders = (supaApi) => {
  try {
    return supaApi.getCachedHeaders?.() ?? null;
  } catch(_) {
    return null;
  }
};

const getInflightHeaderPromise = (supaApi) => supaApi.getHeaderPromise?.();
const setInflightHeaderPromise = (supaApi, value) => supaApi.setHeaderPromise?.(value);

async function validateWebhookKey(supaApi) {
  const key = await getConf("webhookKey");
  if (!key) {
    diag.add?.('Headers: kein Key (webhookKey)');
    supaApi.clearHeaderCache?.();
    return null;
  }
  if (isServiceRoleKey(key)) {
    diag.add?.('Headers: service_role Key blockiert');
    supaApi.clearHeaderCache?.();
    return null;
  }
  return key.replace(/^Bearer\s+/i, "");
}

async function getSessionWithTimeout(supa) {
  let timeoutId;
  let timedOut = false;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(new Error('getSession-timeout'));
    }, GET_USER_TIMEOUT_MS);
  });
  let sessionInfo = null;
  try {
    const result = await Promise.race([supa.auth.getSession(), timeoutPromise]);
    sessionInfo = result?.data?.session ?? null;
  } catch (err) {
    if (timedOut) {
      diag.add?.('[auth] getSession timeout');
    } else {
      diag.add?.('[auth] getSession error: ' + (err?.message || err));
    }
  } finally {
    clearTimeout(timeoutId);
  }
  return { session: sessionInfo, timedOut };
}

function buildAndCacheHeaders(supaApi, anonKey, jwt) {
  const headers = {
    "Content-Type": "application/json",
    "apikey": anonKey,
    "Authorization": `Bearer ${jwt}`,
    "Prefer": "return=representation"
  };
  supaApi.cacheHeaders?.(headers);
  diag.add?.('[headers] ok');
  return headers;
}

async function loadHeadersWithTimeout(supaApi) {
  const anonKey = await validateWebhookKey(supaApi);
  if (!anonKey) return null;

  const supa = await ensureSupabaseClient();
  if (!supa) {
    diag.add?.('Headers: Supabase-Client fehlt');
    supaApi.clearHeaderCache?.();
    return null;
  }

  const { session, timedOut } = await getSessionWithTimeout(supa);
  if (timedOut) {
    const cached = getStaleCachedHeaders(supaApi);
    if (cached) {
      diag.add?.('[headers] fallback cached (timeout)');
      return cached;
    }
  }

  const jwt = session?.access_token;
  if (!jwt) {
    diag.add?.('Headers: fehlende Session/JWT');
    supaApi.clearHeaderCache?.();
    return getStaleCachedHeaders(supaApi);
  }

  return buildAndCacheHeaders(supaApi, anonKey, jwt);
}

// SUBMODULE: getHeaders @public - resolved JWT/anon header bundle with timeout fallback
// Dep: expects SupabaseAPI helpers (assets/js/supabase/index.js) to be ready.
async function getHeaders({ forceRefresh = false } = {}) {
  const supaApi = getSupabaseApi();
  if (!supaApi) return null;

  if (!forceRefresh) {
    const cached = tryGetCachedHeaders(supaApi);
    if (cached) {
      diag.add?.('[headers] cache hit');
      return cached;
    }
    const inflight = getInflightHeaderPromise(supaApi);
    if (inflight) {
      diag.add?.('[headers] await inflight');
      return inflight;
    }
  }

  const loadPromise = loadHeadersWithTimeout(supaApi);
  setInflightHeaderPromise(supaApi, loadPromise);
  try {
    return await loadPromise;
  } finally {
    setInflightHeaderPromise(supaApi, null);
  }
}

/** END MODULE */

const REQUIRED_GLOBALS = [
  'diag',
  'recordPerfStat',
  'uiError',
  'uiInfo',
  '$',
  '$$',
  'fmtNum',
  'todayStr',
  'nl2br',
  'formatDateTimeDE',
  'toHealthEvents',
  'initDB',
  'getConf',
  'putConf',
  'addEntry',
  'updateEntry',
  'getAllEntries',
  'getEntryByRemoteId',
  'deleteEntryLocal',
  'fmtDE',
  'updateLifestyleBars',
  'AppModules.uiCore.helpPanel',
  'AppModules.uiCore.debounce',
  'AppModules.uiCore.setUnderlayInert',
  'AppModules.uiCore.focusTrap',
  'AppModules.uiLayout.updateStickyOffsets',
  'AppModules.uiLayout.ensureNotObscured'
];

const REQUIRED_SUPABASE_EXPORTS = [
  'fetchWithAuth',
  'ensureSupabaseClient',
  'getUserId',
  'isLoggedInFast',
  'syncWebhook',
  'loadIntakeToday',
  'saveIntakeTotalsRpc',
  'cleanupOldIntake',
  'fetchDailyOverview',
  'deleteRemoteDay',
  'syncCaptureToggles',
  'setupRealtime',
  'setConfigStatus',
  'showLoginOverlay',
  'requireSession',
  'watchAuthState',
  'bindAuthButtons',
  'afterLoginBoot',
  'baseUrlFromRest',
  'requireDoctorUnlock',
  'bindAppLockButtons',
  'resumeFromBackground'
];

function resolveGlobal(path) {
  return path.split('.').reduce((acc, part) => {
    if (acc == null) return undefined;
    return acc[part];
  }, window);
}

async function ensureModulesReady() {
  let supabaseReady = !!getSupabaseApi();
  if (!supabaseReady) {
    try {
      await waitForSupabaseApi({ timeout: 8000 });
      supabaseReady = !!getSupabaseApi();
    } catch (err) {
      console.warn('[BOOT] SupabaseAPI nicht rechtzeitig geladen', err);
    }
  }

  const missingGlobals = REQUIRED_GLOBALS.filter((name) => typeof resolveGlobal(name) === "undefined");
  const missingSupa = supabaseReady
    ? REQUIRED_SUPABASE_EXPORTS.filter((name) => !hasSupabaseFn(name)).map((name) => `SupabaseAPI.${name}`)
    : ['SupabaseAPI'];
  const missing = [...missingGlobals, ...missingSupa];
  if (!missing.length) return true;
  const message = `Fehler: Module fehlen (${missing.join(', ')})`;
  let displayed = false;
  if (document.readyState !== 'loading') {
    const errBox = document.getElementById('err');
    if (errBox) {
      errBox.textContent = message;
      errBox.style.display = 'block';
      displayed = true;
    } else if (document.body) {
      const div = document.createElement('div');
      div.textContent = message;
      div.style.background = '#ff6b6b';
      div.style.color = '#121417';
      div.style.padding = '12px';
      div.style.margin = '16px';
      div.style.borderRadius = '8px';
      div.style.fontWeight = '600';
      document.body.appendChild(div);
      displayed = true;
    }
  }
  if (!displayed) {
    console.error(message);
  }
  return false;
}

/** MODULE: DATA ACCESS (REST/RPC)
 * intent: kapselt Supabase REST/RPC Zugriffe fuer Intake/Doctor/Sync Flows
 * contracts: nutzt fetchWithAuth/getHeaders, befuellt CAPTURE/DOCTOR/CHART Pipelines
 * exports: deleteRemote, loadIntakeToday, saveIntakeTotals, saveIntakeTotalsRpc, fetchDailyOverview, deleteRemoteDay
 * notes: enthaelt Fallbacks fuer RPC/REST sowie Merge-Helper fuer Tagesansichten
 */
// @refactor: moved to assets/js/supabase.js (Supabase REST/RPC helpers)

/** END MODULE */

// SUBMODULE: setCaptureIntakeDisabled @internal - toggles intake inputs while syncing
function setCaptureIntakeDisabled(disabled){
  ['cap-water-add','cap-salt-add','cap-protein-add'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!disabled;
  });
  ['cap-water-add-btn','cap-salt-add-btn','cap-protein-add-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!disabled;
  });
}

// SUBMODULE: clearFieldError @internal - entfernt visuelle Fehlerzustaende von Intake-Feldern
function clearFieldError(el){
  if (!el) return;
  el.style.outline = '';
  el.removeAttribute('aria-invalid');
}

// SUBMODULE: setFieldError @internal - markiert Intake-Felder bei Validierungsfehlern
function setFieldError(el){
  if (!el) return;
  el.style.outline = '2px solid var(--danger)';
  el.setAttribute('aria-invalid','true');
}

// SUBMODULE: prepareIntakeStatusHeader @internal - ensures pills/status container exists
function prepareIntakeStatusHeader(){
  try {
    const wrap = document.getElementById('capturePillsRow');
    const nab = wrap ? wrap.querySelector('#nextApptBadge') : document.getElementById('nextApptBadge');
    if (nab) {
      nab.textContent = 'Kein Termin geplant';
      nab.title = 'Kein Termin geplant';
    }
    if (!wrap) return;

    wrap.style.gap = '8px';
    wrap.style.flexWrap = 'wrap';
    wrap.style.alignItems = 'center';

    let top = document.getElementById('cap-intake-status-top');
    if (!top) {
      top = document.createElement('div');
      top.id = 'cap-intake-status-top';
      top.className = 'small';
      top.style.opacity = '.8';
      top.setAttribute('role','group');
      top.setAttribute('aria-live','polite');
      top.setAttribute('tabindex','0');
    }

    if (top) {
      top.setAttribute('role','group');
      top.setAttribute('aria-live','polite');
      top.setAttribute('tabindex','0');
      top.style.display = 'flex';
      top.style.gap = '8px';
      top.style.flexWrap = 'wrap';
      top.style.alignItems = 'center';
    }

    if (wrap && nab && top) {
      wrap.insertBefore(top, nab);
    } else if (wrap && top && !top.parentElement) {
      wrap.appendChild(top);
    }
  } catch(_) {}
}

// SUBMODULE: updateCaptureIntakeStatus @internal - renders intake KPI pills with aria-friendly labels
const updateCaptureIntakeStatus = debounce(function(){
  const startedAt = (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : null;
  try {
    const statusEl = document.getElementById('cap-intake-status');
    let statusTop = document.getElementById('cap-intake-status-top');
    if (!statusEl && !statusTop) return;

    if (!statusTop) {
      prepareIntakeStatusHeader();
      statusTop = document.getElementById('cap-intake-status-top');
    }

    if (statusTop) {
      statusTop.setAttribute('role','group');
      statusTop.setAttribute('aria-live','polite');
      statusTop.setAttribute('tabindex','0');
    }

    if (!captureIntakeState.logged){
      if (statusEl) {
        statusEl.textContent = 'Bitte anmelden, um Intake zu erfassen.';
        statusEl.style.display = '';
      }
      if (statusTop) {
        statusTop.innerHTML = '';
        statusTop.style.display = 'none';
        statusTop.setAttribute('aria-label', 'Tagesaufnahme: Bitte anmelden, um Intake zu erfassen.');
      }
      return;
    }

    const t = captureIntakeState.totals || {};
    const waterVal = Math.round(t.water_ml || 0);
    const saltVal = Number(t.salt_g || 0);
    const proteinVal = Number(t.protein_g || 0);

    const waterRatio = LS_WATER_GOAL ? waterVal / LS_WATER_GOAL : 0;
    const waterCls = waterRatio >= 0.9 ? 'ok' : (waterRatio >= 0.5 ? 'warn' : 'bad');
    const saltCls = saltVal > LS_SALT_MAX ? 'bad' : (saltVal >= 5 ? 'warn' : 'ok');
    const proteinCls = (proteinVal >= 78 && proteinVal <= LS_PROTEIN_GOAL) ? 'ok' : (proteinVal > LS_PROTEIN_GOAL ? 'bad' : 'warn');

    const describe = (cls) => ({
      ok: 'Zielbereich',
      warn: 'Warnung',
      bad: 'kritisch',
      neutral: 'neutral'
    }[cls] || 'unbekannt');

    const pills = [
      { cls: waterCls, label: 'Wasser', value: `${waterVal} ml` },
      { cls: saltCls, label: 'Salz', value: `${fmtDE(saltVal,1)} g` },
      { cls: proteinCls, label: 'Protein', value: `${fmtDE(proteinVal,1)} g` },
    ];

    const summary = pills.map(p => `${p.label} ${p.value} (${describe(p.cls)})`).join(', ');
    const html = pills.map(p => {
      const statusText = describe(p.cls);
      const aria = `${p.label}: ${p.value}, Status: ${statusText}`;
      return `<span class="pill ${p.cls}" role="status" aria-label="${aria}"><span class="dot" aria-hidden="true"></span>${p.label}: ${p.value}</span>`;
    }).join(' ');

    if (statusEl) {
      statusEl.innerHTML = '';
      statusEl.style.display = 'none';
    }
    if (statusTop) {
      statusTop.innerHTML = html;
      statusTop.style.display = 'flex';
      statusTop.setAttribute('aria-label', `Tagesaufnahme: ${summary}`);
    }
  } finally {
    recordPerfStat('header_intake', startedAt);
  }
}, 150);

// SUBMODULE: millisUntilNextMidnight @internal - calculates next zero reset window
function millisUntilNextMidnight(){
  try {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 0, 10, 0);
    next.setDate(next.getDate() + 1);
    const diff = next.getTime() - now.getTime();
    return isNaN(diff) ? 3600_000 : Math.max(1000, diff);
  } catch { return 3600_000; }
}

// SUBMODULE: handleMidnightRefresh @internal - trigger capture refresh on new day
async function handleMidnightRefresh(){
  AppModules.captureGlobals.setMidnightTimer(null);
  try {
    await maybeRefreshForTodayChange({ force: true, source: 'midnight' });
  } finally {
    scheduleMidnightRefresh();
  }
}

// SUBMODULE: scheduleMidnightRefresh @internal - arms midnight timer loop
function scheduleMidnightRefresh(){
  try {
    const _mt = AppModules.captureGlobals.getMidnightTimer();
    if (_mt) clearTimeout(_mt);
    const delay = millisUntilNextMidnight();
    AppModules.captureGlobals.setMidnightTimer(setTimeout(handleMidnightRefresh, delay));
  } catch { /* noop */ }
}

// Fire-and-Forget: Intake-Totals beim echten Tageswechsel auf 0 setzen
// SUBMODULE: maybeResetIntakeForToday - ensures zeroed intake when day rolls over
async function maybeResetIntakeForToday(todayIso){
  try {
    const last = window?.localStorage?.getItem(LS_INTAKE_RESET_DONE_KEY) || '';
    if (AppModules.captureGlobals.getIntakeResetDoneFor() === todayIso || last === todayIso) return;
  } catch(_) { /* ignore storage */ }

  let guardSet = false;
  const loadTotalsWithRetry = async (uid) => {
    let attempt = 0;
    let lastErr = null;
    while (attempt < 3) {
      try {
        return await loadIntakeToday({ user_id: uid, dayIso: todayIso });
      } catch (err) {
        lastErr = err;
        diag.add?.(`[capture] reset intake lookup failed (attempt ${attempt + 1}): ${err?.message || err}`);
        attempt += 1;
        if (attempt < 3) {
          await delay(250 * attempt);
        }
      }
    }
    throw lastErr;
  };

  try {
    const logged = await isLoggedInFast();
    if (!logged) return;
    const uid = await getUserId();
    if (!uid) return;

    const existing = await loadTotalsWithRetry(uid);

    const hasTotals = !!(existing && (
      Number(existing.water_ml || 0) > 0 ||
      Number(existing.salt_g || 0) > 0 ||
      Number(existing.protein_g || 0) > 0
    ));

    if (hasTotals) {
      diag.add?.(`[capture] reset intake skip day=${todayIso} (existing totals)`);
      guardSet = true;
    } else {
      diag.add?.(`[capture] reset intake start day=${todayIso}`);
      const zeros = { water_ml: 0, salt_g: 0, protein_g: 0 };
      await saveIntakeTotalsRpc({ dayIso: todayIso, totals: zeros });
      diag.add?.('[capture] reset intake ok');
      guardSet = true;
    }
  } catch (e) {
    const message = e?.message || e;
    diag.add?.('[capture] reset intake error: ' + message);
    uiError?.('Intake konnte nicht automatisch zurueckgesetzt werden. Bitte erneut versuchen.');
    throw e;
  } finally {
    if (guardSet) {
      AppModules.captureGlobals.setIntakeResetDoneFor(todayIso);
      try { window?.localStorage?.setItem(LS_INTAKE_RESET_DONE_KEY, todayIso); } catch(_) {}
      try { window.AppModules.capture.refreshCaptureIntake(); } catch(_) {}
    }
  }
}

// SUBMODULE: millisUntilNoonGrace @internal - calculates midday cutoff for BP context
function millisUntilNoonGrace(){
  try {
    const now = new Date();
    const next = new Date(now);
    next.setHours(12, 5, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    const diff = next.getTime() - now.getTime();
    return Number.isFinite(diff) ? Math.max(1000, diff) : 3600_000;
  } catch {
    return 3600_000;
  }
}

// SUBMODULE: scheduleNoonSwitch @internal - toggles noon-based BP auto context timer
function scheduleNoonSwitch(){
  try {
    const _nt = AppModules.captureGlobals.getNoonTimer();
    if (_nt) clearTimeout(_nt);
    const delay = millisUntilNoonGrace();
    AppModules.captureGlobals.setNoonTimer(setTimeout(handleNoonSwitch, delay));
  } catch { /* noop */ }
}

function startDayHeartbeat(){ /* no-op: auf eventgetriebene Variante umgestellt */ }

// SUBMODULE: isAfterNoonGrace @internal - checks midday threshold for BP context
function isAfterNoonGrace(){
  try {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes >= (12 * 60 + 5);
  } catch {
    return false;
  }
}

// SUBMODULE: maybeAutoApplyBpContext @internal - flips BP panes based on time-of-day
function maybeAutoApplyBpContext({ force = false, source = '' } = {}){
  if (!force && AppModules.captureGlobals.getBpUserOverride()) return;
  const select = document.getElementById('bpContextSel');
  if (!select) return;
  const dateEl = document.getElementById('date');
  const todayIso = todayStr();
  const selected = dateEl?.value || '';
  if (selected && selected !== todayIso) return;

  const desired = isAfterNoonGrace() ? 'A' : 'M';
  if (select.value === desired) return;

  select.value = desired;
  applyBpContext(desired);
  updateBpCommentWarnings?.();
  diag.add?.(`bp:auto (${source || 'auto'}) -> ${desired}`);
}

// SUBMODULE: handleNoonSwitch @internal - noon timer callback to adjust BP context
function handleNoonSwitch(){
  AppModules.captureGlobals.setNoonTimer(null);
  try {
    maybeAutoApplyBpContext({ source: 'noon-timer' });
  } finally {
    scheduleNoonSwitch();
  }
}

// SUBMODULE: getBpPanes @internal - caches BP accordion panes for faster toggles
function getBpPanes(){
  let cache = AppModules.captureGlobals.getBpPanesCache();
  if (!cache || cache.length === 0) {
    cache = Array.from(document.querySelectorAll('.bp-pane'));
    AppModules.captureGlobals.setBpPanesCache(cache);
  }
  return cache;
}

// SUBMODULE: applyBpContext @internal - swaps visible BP pane
function applyBpContext(value){
  const ctx = value === 'A' ? 'A' : 'M';
  getBpPanes().forEach(pane => {
    const match = pane.getAttribute('data-context') === ctx;
    pane.classList.toggle('active', match);
  });
}

// SUBMODULE: maybeRefreshForTodayChange @extract-candidate - reconciles capture state across day changes
async function maybeRefreshForTodayChange({ force = false, source = '' } = {}){
  const todayIso = todayStr();
  const dateEl = document.getElementById('date');
  const selected = dateEl?.value || '';
  const todayChanged = AppModules.captureGlobals.getLastKnownToday() !== todayIso;
  if (!force && !todayChanged) return;

  const userPinnedOtherDay = AppModules.captureGlobals.getDateUserSelected() && selected && selected !== todayIso;
  if (!userPinnedOtherDay && dateEl) {
    if (selected !== todayIso) {
      dateEl.value = todayIso;
    }
    AppModules.captureGlobals.setDateUserSelected(false);
  }

  // Tageswechsel erkannt -> Intake ggf. automatisch auf 0 zuruecksetzen
  if (!userPinnedOtherDay) {
    try { await maybeResetIntakeForToday(todayIso); } catch(_) {}
  }

  try {
    await window.AppModules.capture.refreshCaptureIntake();
  } catch(_) {}

  AppModules.captureGlobals.setLastKnownToday(todayIso);
  if (!AppModules.captureGlobals.getMidnightTimer()) scheduleMidnightRefresh();
  scheduleNoonSwitch();
  if (!userPinnedOtherDay) {
    AppModules.captureGlobals.setBpUserOverride(false);
    maybeAutoApplyBpContext({ force: true, source: source || 'day-change' });
  }
  diag.add?.(`intake: day refresh (${source || 'auto'})`);
}

/** END MODULE */


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











/** MODULE: DATA ACCESS (Auth Helpers)
 * intent: Hilfsfunktionen fuer Netzwerk-Retries und Auth-gebundene Fetches
 * contracts: wird von BP/BODY/APPOINTMENTS Save-Flows genutzt, haengt von AUTH.ensureSupabaseClient ab
 * exports: withRetry, fetchWithAuth, syncWebhook
 * notes: Fortsetzung; reine Kommentare
 */
// @refactor: moved to assets/js/supabase.js (withRetry, fetchWithAuth, syncWebhook)

/** END MODULE */

/* ===== App-Lock (Passkey + PIN) ===== */
/* Doctor-Lock-Logik lebt in SupabaseAPI.guard (requireDoctorUnlock/bindAppLockButtons). */
/* ===== Main ===== */
async function main(){
  if (document.readyState === 'loading') {
    await new Promise((resolve) => {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }
  if (!(await ensureModulesReady())) {
    return;
  }
  diag.init();
  helpPanel?.init?.();
  await initDB();
  window.AppModules?.uiLayout?.updateStickyOffsets?.();
  bindHeaderShadow();
  try {
    await getConf("webhookUrl");
    await getConf("webhookKey");
  } catch (_) {}
  // Dep: chart panel and refresh flows expect Supabase client to exist beforehand.
  await ensureSupabaseClient();
  getChartPanel()?.init?.();
  bindTabs();
const todayIso = todayStr();
$("#date").value = todayIso;
AppModules.captureGlobals.setLastKnownToday(todayIso);
AppModules.captureGlobals.setDateUserSelected(false);
AppModules.captureGlobals.setBpUserOverride(false);
prepareIntakeStatusHeader();
$("#from").value = new Date(Date.now()-90*24*3600*1000).toISOString().slice(0,10);
$("#to").value = todayIso;
setTab("capture");
try{ window.AppModules.capture.resetCapturePanels(); updateBpCommentWarnings?.(); }catch(_){ }
try { addCapturePanelKeys?.(); } catch(_){ }
bindAuthButtons();
if (sbClient) watchAuthState()

// Wenn schon eingeloggt -> App starten, sonst Login-Leiste zeigen
const hasSession = await requireSession();
if (hasSession) {
  await afterLoginBoot(); // wichtig fuer Reload mit persistierter Session
      // Doctor-Unlock: nur bei Arzt-Ansicht (kein globaler App-Lock)  //  App-Lock direkt nach Boot pruefen/anzeigen
  await setupRealtime();  //  NEU: Realtime direkt aktivieren
  await requestUiRefresh();
}
  try {
    await window.AppModules.capture.refreshCaptureIntake();
  } catch(_) {}
await maybeRefreshForTodayChange({ force: true, source: 'boot' });
  AppModules.captureGlobals.setLastKnownToday(todayStr());
  scheduleMidnightRefresh();
  scheduleNoonSwitch();
  maybeAutoApplyBpContext({ source: 'boot-post-refresh' });
await window.AppModules.appointments.refreshAppointments();
bindAppLockButtons();     //  Buttons der Lock-Card binden

// Konfiguration laden
const savedUrl = await getConf("webhookUrl");
const savedKey = await getConf("webhookKey");
// Diagnose: aktive REST-URL und Key-Typ
diag.add?.('Config URL: ' + (savedUrl || '(none)'));
diag.add?.('Config Key: ' + (savedKey ? (isServiceRoleKey(savedKey) ? 'service_role(BLOCKED)' : 'anon/ok') : '(none)'));
if (!savedUrl || !savedKey) {
  setTab("capture"); // In Erfassung bleiben
}

// Sanfte Warnung
// === Live-Kommentar-Pflicht: sofort roter Rand bei Grenzwertueberschreitung ===
['#captureAmount','#diaM','#bpCommentM','#sysA','#diaA','#bpCommentA'].forEach(sel=>{
  const el = $(sel); if(!el) return;
  el.addEventListener('input', updateBpCommentWarnings);
});
window.AppModules.bp.updateBpCommentWarnings();


// Toggle-Handler
const bpContextSel = document.getElementById('bpContextSel');
AppModules.captureGlobals.setBpPanesCache(Array.from(document.querySelectorAll('.bp-pane')));
if (bpContextSel){
  applyBpContext(bpContextSel.value || 'M');
  maybeAutoApplyBpContext({ force: true, source: 'boot' });
  bpContextSel.addEventListener('change', (e)=>{
    AppModules.captureGlobals.setBpUserOverride(true);
    applyBpContext(e.target.value);
    window.AppModules.bp.updateBpCommentWarnings();
  });
}

const saveBpPanelBtn = document.getElementById('saveBpPanelBtn');
if (saveBpPanelBtn){
  saveBpPanelBtn.addEventListener('click', async (e)=>{
    try {
      const logged = await isLoggedInFast();
      if (!logged) {
        diag.add?.('[panel] bp save while auth unknown');
        // Diagnostics only: keep going so fetchWithAuth can recover auth state.
      }
    } catch(err) {
      console.error('isLoggedInFast check failed', err);
    }
    const btn = e.currentTarget;
    const ctxSel = document.getElementById('bpContextSel');
    const which = (ctxSel?.value === 'A') ? 'A' : 'M';
    window.AppModules.bp.updateBpCommentWarnings();
    if (window.AppModules.bp.requiresBpComment(which)){
      alert("Bitte Kommentar eingeben bei Grenzwertueberschreitung (Sys>130 oder Dia>90).");
      const target = document.getElementById(which === 'M' ? 'bpCommentM' : 'bpCommentA');
      if (target) target.focus();
      return;
    }
    withBusy(btn, true);
    let savedOk = false;
    try{
      const saved = await window.AppModules.bp.saveBlock(which === 'M' ? 'Morgen' : 'Abend', which, false, false);
      if (!saved){
        uiError('Keine Daten fuer diesen Messzeitpunkt eingegeben.');
      } else {
        savedOk = true;
        requestUiRefresh({ reason: 'panel:bp' }).catch(err => {
          diag.add?.('ui refresh err: ' + (err?.message || err));
        });
      }
    }catch(err){
      diag.add?.('Panel BP Fehler: ' + (err?.message || err));
      uiError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    }finally{
      withBusy(btn, false);
    }
    if (savedOk){
      window.AppModules.bp.updateBpCommentWarnings();
      window.AppModules.bp.resetBpPanel(which); flashButtonOk(btn, '&#x2705; Blutdruck gespeichert');
    }
  });
}

const saveBodyPanelBtn = document.getElementById('saveBodyPanelBtn');
if (saveBodyPanelBtn){
  saveBodyPanelBtn.addEventListener('click', async (e)=>{
    try {
      const logged = await isLoggedInFast();
      if (!logged) {
        diag.add?.('[panel] body save while auth unknown');
        // Diagnostics only: continue to let fetchWithAuth handle auth refresh.
      }
    } catch(err) {
      console.error('isLoggedInFast check failed', err);
    }
    const btn = e.currentTarget;
    withBusy(btn, true);
    let savedOk = false;
    try{
      const saved = await window.AppModules.body.saveDaySummary({ includeBody: true, includeFlags: false, includeFlagsComment: false });
      if (!saved){
        uiError('Keine Koerperdaten eingegeben.');
      } else {
        savedOk = true;
        requestUiRefresh({ reason: 'panel:body' }).catch(err => {
          diag.add?.('ui refresh err: ' + (err?.message || err));
        });
      }
    }catch(err){
      diag.add?.('Panel Koerper Fehler: ' + (err?.message || err));
      uiError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    }finally{
      withBusy(btn, false);
    }
    if (savedOk){
      window.AppModules.body.resetBodyPanel();
      diag.add?.('[body] cleared');
      flashButtonOk(btn, '&#x2705; Koerper gespeichert');
    }
  });
}

const saveFlagsPanelBtn = document.getElementById('saveFlagsPanelBtn');
if (saveFlagsPanelBtn){
  saveFlagsPanelBtn.addEventListener('click', async (e)=>{
    try {
      const logged = await isLoggedInFast();
      if (!logged) {
        diag.add?.('[panel] flags save while auth unknown');
        // Diagnostics only: request proceeds so auth wrapper can retry properly.
      }
    } catch(err) {
      console.error('isLoggedInFast check failed', err);
    }
    const btn = e.currentTarget;
    withBusy(btn, true);
    let savedOk = false;
    try{
      const saved = await window.AppModules.body.saveDaySummary({ includeBody: false, includeFlags: true, includeFlagsComment: true });
      if (!saved){
        uiError('Keine Flag-Daten eingegeben.');
      } else {
        savedOk = true;
        requestUiRefresh({ reason: 'panel:flags' }).catch(err => {
          diag.add?.('ui refresh err: ' + (err?.message || err));
        });
      }
    }catch(err){
      diag.add?.('Panel Flags Fehler: ' + (err?.message || err));
      uiError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    }finally{
      withBusy(btn, false);
    }
    if (savedOk){
      window.AppModules.capture.resetFlagsPanel(); flashButtonOk(btn, '&#x2705; Flags gespeichert');
    }
  });
}

const bindToggle = (id, setter, getVal)=>{
  const el = $(id);
  el.addEventListener("click", ()=>{
    setter(!getVal());
  });
};
const getCaptureFlagValue = (key) => {
  try {
    return !!getCaptureFlagsStateSnapshot()[key];
  } catch (_) {
    return false;
  }
};
bindToggle("#trainingToggle", window.AppModules.capture.setTraining, ()=>getCaptureFlagValue('trainingActive'));
bindToggle("#lowIntakeToggle", window.AppModules.capture.setLowIntake, ()=>getCaptureFlagValue('lowIntakeActive'));
bindToggle("#sickToggle", window.AppModules.capture.setSick, ()=>getCaptureFlagValue('sickActive'));
bindToggle("#valsartanMissToggle", window.AppModules.capture.setValsartanMiss, ()=>getCaptureFlagValue('valsartanMissed'));
bindToggle("#forxigaMissToggle", window.AppModules.capture.setForxigaMiss, ()=>getCaptureFlagValue('forxigaMissed'));
bindToggle("#nsarToggle", window.AppModules.capture.setNsar, ()=>getCaptureFlagValue('nsarTaken'));
bindToggle("#saltHighToggle", window.AppModules.capture.setSaltHigh, ()=>getCaptureFlagValue('saltHigh'));
bindToggle("#proteinHighToggle", window.AppModules.capture.setProteinHigh, ()=>getCaptureFlagValue('proteinHigh'));

// Sync toggles when the date changes in capture view
const dateEl = document.getElementById('date');
  if (dateEl) {
    dateEl.addEventListener('change', async () => {
      try {
        const todayIso = todayStr();
  AppModules.captureGlobals.setDateUserSelected((dateEl.value || '') !== todayIso);
        // was du beim Datum aendern haben willst:
        await window.AppModules.capture.refreshCaptureIntake();
        await syncCaptureToggles();
        window.AppModules.capture.resetCapturePanels();
        updateBpCommentWarnings?.();
        await window.AppModules.body.prefillBodyInputs();
      } catch(_) {}
    });
  }

// Apply Range -> Arztansicht neu rendern
const applyBtn = $("#applyRange");
if (applyBtn) {
  applyBtn.addEventListener("click", async () => {
    await requestUiRefresh({ reason: 'doctor:range' });
    getDoctorModule()?.setDocBadges?.({ visible: true });
  });
}

$("#doctorChartBtn").addEventListener("click", async ()=>{
  try {
    const logged = await isLoggedInFast();
    if (!logged) {
      diag.add?.('[doctor] chart open while auth unknown');
      // Diagnostics only: chart refresh still runs so auth flow can recover.
    }
  } catch(err) {
    console.error('isLoggedInFast check failed', err);
  }
  if (!isDoctorUnlocked()){
    setAuthPendingAfterUnlock('chart');
    const ok = await requireDoctorUnlock();
    if (!ok) return;
    setAuthPendingAfterUnlock(null);
  }
  getDoctorModule()?.setDocBadges?.({ visible: true });
  const chartPanel = getChartPanel();
  chartPanel?.show?.();
  await requestUiRefresh({ reason: 'doctor:chart-open', chart: true });
});

document.addEventListener('keydown', (e)=>{
  if (e.key !== 'Escape') return;

  try {
    const chartPanel = getChartPanel();
    if (chartPanel?.open) {
      chartPanel.hide();
      e.preventDefault();
      return;
    }
    if (helpPanel?.open) {
      helpPanel?.hide?.();
      e.preventDefault();
      return;
    }
    if (diag?.open) {
      diag.hide();
      e.preventDefault();
      return;
    }
  } catch(_){ }

  try {
    const appLock = document.getElementById('appLock');
    if (appLock && appLock.style.display !== 'none') {
      setAuthPendingAfterUnlock(null);
      const lockFn = getLockUi();
      if (lockFn) {
        lockFn(false);
      } else {
        document.body.classList.remove('app-locked');
        appLock.style.display = 'none';
      }
      e.preventDefault();
      return;
    }
    const login = document.getElementById('loginOverlay');
    if (login && login.style.display !== 'none') {
      showLoginOverlay(false);
      e.preventDefault();
      return;
    }
  } catch(_){ }
});

const resumeEventHandler = (source) => {
  (async () => {
    try {
      await resumeFromBackground(source);
    } catch (err) {
      diag.add?.(`[resume] handler error ${source}: ${err?.message || err}`);
    }
  })();
};
document.addEventListener('visibilitychange', () => {
  diag.add?.(`[event] visibilitychange -> ${document.visibilityState}`);
  if (document.visibilityState !== 'visible') return;
  resumeEventHandler('visibility');
});

window.addEventListener('pageshow', (event) => {
  diag.add?.(`[event] pageshow (persisted=${event.persisted ? 1 : 0})`);
  if (event.persisted || document.visibilityState === 'visible') {
    resumeEventHandler('pageshow');
  }
});

window.addEventListener('focus', () => {
  diag.add?.('[event] focus');
  resumeEventHandler('focus');
});

/** END MODULE */

// --- Arzt-Export ---
$("#doctorExportJson").addEventListener("click", async () => {
  await getDoctorModule()?.exportDoctorJson?.();
});

// --- Lifestyle binden und initial (falls bereits angemeldet) laden ---
window.AppModules.capture.bindIntakeCapture();
window.AppModules.appointments.bindAppointmentsPanel();
try {
  if (hasSupabaseFn('cleanupOldIntake') && await isLoggedInFast()) {
    await cleanupOldIntake();
  }
} catch(_) {}

// Initial Render
await requestUiRefresh({ reason: 'boot:initial', appointments: true });

// --- Failsafe: nach Reload alles sicher freigeben (falls etwas "disabled" haengen blieb)
$$('#appMain input, #appMain select, #appMain textarea, #appMain button, nav.tabs button').forEach(el=>{
el.disabled = false;
});
document.body.classList.remove('auth-locked');

// Auto-Push Pending sobald online
window.addEventListener('online', async ()=>{
  try {
    if (!hasSupabaseFn('pushPendingToRemote')) return;
    const resPush = await pushPendingToRemote();
    if(resPush?.pushed || resPush?.failed){
      diag.add?.('Online-Push: OK=' + (resPush.pushed || 0) + ', FAIL=' + (resPush.failed || 0));
      if (hasSupabaseFn('reconcileFromRemote')) {
        await reconcileFromRemote();
      }
    }
  } catch (err) {
    diag.add?.('[online] push failed: ' + (err?.message || err));
    console.error('[online] pushPendingToRemote failed', err);
  }
});
}

window.AppModules?.appointments?.resetAppointmentsUi?.();

/* boot */
if (!window.__bootDone) {
  window.__bootDone = true;
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", main);

    window.addEventListener('focus', () => {
      try { maybeRefreshForTodayChange({ source: 'focus' }); } catch(_){ }
    });
  } else {
    main();
  }
}

/** MODULE: FUTURE (placeholders)
 * intent: haelt geplante Assist/PWA/BLE-Refactors fuer die Zeit nach dem Annotations-Pass bereit
 * exports: (geplant) assistHooks, pwaBootstrap, bleIntegration
 * notes: Nur Kommentare; Logik folgt bei Modul-Extraction
 */
// SUBMODULE: assist hooks (planned) @internal - future foodcoach/health assistants
// SUBMODULE: pwa bootstrap (planned) @internal - manifest/service worker wiring
// SUBMODULE: ble integration (planned) @internal - GATT 0x1810 blood pressure bridge
/** END MODULE */

/* === Debug-Notizen
- V1.5: Realtime ueber supabase-js; Projekt-URL aus REST-URL abgeleitet.
- Auto-Sync: push pending ? reconcile (Entries) ohne Wipe.
- Realtime-Events: INSERT/UPDATE ? upsert, DELETE ? lokal entfernen.
- UI-Refresh: Arzt-Ansicht sofort; Charts nur, wenn Panel offen.
=== */



