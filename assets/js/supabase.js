/**
 * MODULE: SUPABASE ACCESS
 * intent: kapselt Supabase REST/RPC und Auth-gebundene Fetch-Helper
 * exports: withRetry, fetchWithAuth, syncWebhook, patchDayFlags, appendNoteRemote, deleteRemote,
 *          loadIntakeToday, saveIntakeTotals, saveIntakeTotalsRpc, cleanupOldIntake,
 *          loadBpFromView, loadBodyFromView, loadFlagsFromView, syncCaptureToggles,
 *          fetchDailyOverview, deleteRemoteDay, baseUrlFromRest, ensureSupabaseClient
 * notes: Logik unveraendert aus index.html extrahiert
 */

;(function(window) {
  'use strict';

const supabaseState = {
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

const supabaseLog = { debugLogPii: false };

const defaultSetupRealtime = async () => undefined;
const defaultRequireDoctorUnlock = async () => true;
const defaultResumeFromBackground = async () => undefined;
function toEventsUrl(restUrl) {
  try {
    const url = String(restUrl || '').trim();
    if (!url) return null;
    return url.replace(/(\/rest\/v1\/)[^/?#]+/i, '$1health_events');
  } catch (_) {
    return restUrl;
  }
}

const noopRealtime = () => undefined;
if (typeof window.teardownRealtime !== 'function') {
  window.teardownRealtime = noopRealtime;
}


if (typeof window.setupRealtime !== 'function') {
  window.setupRealtime = defaultSetupRealtime;
}

function maskUid(uid) {
  if (!uid) return 'anon';
  const str = String(uid);
  if (supabaseLog.debugLogPii) return str;
  if (str.length <= 4) return str;
  const head = str.slice(0, 4);
  const tail = str.slice(-4);
  return `${head}-${tail}`;
}


function setSupabaseDebugPii(enabled) {
  supabaseLog.debugLogPii = !!enabled;
}

function cacheHeaders(headers) {
  supabaseState.cachedHeaders = headers;
  supabaseState.cachedHeadersAt = Date.now();
}

function clearHeaderCache() {
  supabaseState.cachedHeaders = null;
  supabaseState.cachedHeadersAt = 0;
  supabaseState.headerPromise = null;
}

function getCachedHeaders() {
  return supabaseState.cachedHeaders;
}

function getCachedHeadersAt() {
  return supabaseState.cachedHeadersAt;
}

function getHeaderPromise() {
  return supabaseState.headerPromise;
}

function setHeaderPromise(promise) {
  supabaseState.headerPromise = promise;
}

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

// SUBMODULE: withRetry @internal - retries transient 5xx requests with exponential backoff
async function withRetry(fn, {tries=3, base=300}={}) {
let lastErr;
for (let i=0;i<tries;i++){
try { return await fn(); }
catch (e) {
const code = e?.status ?? e?.response?.status ?? 0;
if (!(code >= 500 && code < 600)) throw e;
await new Promise(r => setTimeout(r, base * Math.pow(2,i)));
lastErr = e;
}
}
throw lastErr;
}

// SUBMODULE: fetchWithAuth @extract-candidate - wraps fetch with Supabase session headers and auto refresh
async function fetchWithAuth(makeRequest, { tag = '', retry401 = true, maxAttempts = 2 } = {}) {
  const supa = await ensureSupabaseClient();
  if (!supa) {
    const err = new Error('auth-client-missing');
    err.status = 401;
    try { showLoginOverlay(true); } catch(_) {}
    throw err;
  }

  const signalAuth = () => {
    try { showLoginOverlay(true); } catch(_) {}
  };

  const loadHeaders = async (forceRefresh = false) => {
    if (forceRefresh) {
      diag.add?.(`[auth] refresh start ${tag || 'request'}`);
      try {
        await supa.auth.refreshSession();
      } catch (refreshErr) {
        diag.add?.(`[auth] refresh error: ${refreshErr?.message || refreshErr}`);
      }
      diag.add?.(`[auth] refresh end ${tag || 'request'}`);
    }
    const cachedHeaders = getCachedHeaders();
    const cachedAt = getCachedHeadersAt();
    if (!forceRefresh && cachedHeaders && cachedAt && (Date.now() - cachedAt) < 5 * 60 * 1000) {
      diag.add?.('[headers] cache hit');
      return cachedHeaders;
    }
    return await getHeaders();
  };

  let headers = await loadHeaders(false);
  if (!headers) {
    headers = await loadHeaders(true);
  }
  if (!headers) {
    const err = new Error('auth-headers-missing');
    err.status = 401;
    signalAuth();
    throw err;
  }

  let attempts = 0;
  let refreshed = false;
  const max = Math.max(0, maxAttempts);

  while (true) {
    let res;
    try {
      // Per-request soft timeout to avoid hanging saves (e.g., after resume)
      const REQ_TIMEOUT_MS = 10000;
      const reqStart = (typeof performance!=="undefined" && typeof performance.now==="function") ? performance.now() : Date.now();
      diag.add?.(`[auth] request start ${tag || 'request'}`);
      let timeoutId; let timedOut = false;
      const timeoutPromise = new Promise((_,reject)=>{
        timeoutId = setTimeout(()=>{ timedOut = true; reject(new Error('request-timeout')); }, REQ_TIMEOUT_MS);
      });
      const fetchPromise = (async ()=>{
        try { return await makeRequest(headers); }
        catch(err){ if (!timedOut) throw err; diag.add?.(`[auth] late error ${tag || 'request'}: ${err?.message || err}`); return null; }
      })();
      try {
        res = await Promise.race([fetchPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
        const dur = (typeof performance!=="undefined" && typeof performance.now==="function") ? (performance.now()-reqStart) : (Date.now()-reqStart);
        if (timedOut) { diag.add?.(`[auth] ${tag || 'request'} timeout (${Math.round(dur)} ms)`); }
      }
    } catch (err) {
      if (attempts < max) {
        attempts += 1;
        await sleep(200 * attempts);
        continue;
      }
      throw err;
    }

    if (!res || typeof res.status !== 'number') {
      const err = new Error('invalid-response');
      err.status = 0;
      throw err;
    }

    if (res.status === 401 || res.status === 403) {
      if (retry401 && !refreshed) {
        refreshed = true;
        diag.add?.(`[auth] ${tag || 'request'} ${res.status} -> refresh`);
        headers = await loadHeaders(true);
        if (!headers) {
          const err = new Error('auth-headers-missing');
          err.status = res.status;
          signalAuth();
          throw err;
        }
        attempts = 0;
        continue;
      }
      const err = new Error('auth-http');
      err.status = res.status;
      err.response = res;
      signalAuth();
      throw err;
    }

    if (res.status >= 500 && res.status < 600 && attempts < max) {
      attempts += 1;
      await sleep(200 * attempts);
      continue;
    }

    return res;
  }
}
  
// SUBMODULE: syncWebhook @extract-candidate - posts capture events batch to Supabase with fallbacks
async function syncWebhook(entry, localId){
  const url = await getConf("webhookUrl");
  if(!url){
    const err = new Error("syncWebhook: missing webhookUrl");
    err.status = 401;
    showLoginOverlay(true);
    throw err;
  }

  try{
    const uid = await getUserId();
    const events = toHealthEvents(entry);
    if (!events.length){
      diag.add("Webhook: keine Events zu senden");
      return;
    }

    const payload = events.map(ev => (uid ? { ...ev, user_id: uid } : ev));
    const res = await fetchWithAuth(
      headers => fetch(url, { method:"POST", headers, body: JSON.stringify(payload) }),
      { tag: 'webhook:post', maxAttempts: 2 }
    );

    if(!res.ok){
      let details = "";
      try {
        const e = await res.clone().json();
        details = (e?.message || e?.details || "");
      } catch { /* plain text? */ }

      if (res.status === 409 || /duplicate|unique/i.test(details)) {
        const flagsEv = events.find(ev => ev.type === 'day_flags');
        try {
          if (flagsEv && uid) {
            const dayIso = entry.date;
            await patchDayFlags({ user_id: uid, dayIso, flags: flagsEv.payload });
            const others = events.filter(ev => ev.type !== 'day_flags');
            if (others.length) {
              const res2 = await fetchWithAuth(
                headers => fetch(url, { method: "POST", headers, body: JSON.stringify(others.map(ev => ({ ...ev, user_id: uid }))) }),
                { tag: 'webhook:fallback', maxAttempts: 2 }
              );
              if (!res2.ok) throw new Error(`rest-post-failed-${res2.status}`);
            }
            uiInfo("Flags aktualisiert.");
            diag.add("Fallback: day_flags via PATCH");
            return;
          }
        } catch (_) { /* fallback failed */ }
        const noteEv = events.find(ev => ev.type === 'note');
        try {
          if (noteEv && uid) {
            const dayIso = entry.date;
            const merged = await appendNoteRemote({ user_id: uid, dayIso, noteEvent: noteEv });
            await updateEntry(localId, { remote_id: merged?.id ?? -1 });
            uiInfo('Kommentar aktualisiert.');
            diag.add('Fallback: note via PATCH');
            return;
          }
        } catch (_) { /* fallback failed */ }
      }

      if (res.status === 409 || /duplicate|unique/i.test(details)) {
        uiError("Es gibt bereits einen Eintrag fuer diesen Tag/Kontext.");
      } else if (res.status === 422 || /invalid|range|pflicht|check constraint/i.test(details)) {
        uiError("Eingaben ungueltig - bitte Wertebereiche/Pflichtfelder pruefen.");
      } else {
        uiError(`Speichern fehlgeschlagen (HTTP ${res.status}).`);
      }

      diag.add(`Webhook-Fehler ${res.status}: ${details || "-"}`);
      const err = new Error(`save-failed-${res.status}`);
      err.status = res.status;
      err.details = details;
      throw err;
    }

    const json = await res.json();
    const firstId = json?.[0]?.id ?? null;
    if(firstId != null){
      await updateEntry(localId, { remote_id: firstId });
      uiInfo("Gespeichert.");
      diag.add(`Webhook: OK (${events.length} Event(s))`);
    } else {
      uiError("Unerwartete Antwort vom Server - kein Datensatz zurueckgegeben.");
    }
  }catch(e){
    if (e?.status === 401 || e?.status === 403) {
      uiError("Bitte erneut anmelden, um weiter zu speichern.");
    } else {
      uiError("Netzwerkfehler beim Speichern. Bitte spaeter erneut versuchen.");
    }
    diag.add("Webhook: Netzwerkfehler");
    throw e;
  }
}

// SUBMODULE: patchDayFlags @internal - updates day_flags row for given user/day with new payload
async function patchDayFlags({ user_id, dayIso, flags }){
  const url = await getConf("webhookUrl");
  if (!url || !user_id || !dayIso) {
    const err = new Error('patchDayFlags: missing params');
    err.status = 401;
    throw err;
  }

  const from = `${dayIso}T00:00:00Z`;
  const toNext = new Date(from); toNext.setUTCDate(toNext.getUTCDate()+1);
  const toIso = toNext.toISOString().slice(0,10);

  const q = `${url}?user_id=eq.${encodeURIComponent(user_id)}&type=eq.day_flags`+
            `&ts=gte.${encodeURIComponent(dayIso)}T00:00:00Z&ts=lt.${encodeURIComponent(toIso)}T00:00:00Z`;
  const res = await fetchWithAuth(
    headers => fetch(q, { method: 'PATCH', headers, body: JSON.stringify({ payload: flags }) }),
    { tag: 'flags:patch', maxAttempts: 2 }
  );
  if (!res.ok) {
    let details = '';
    try { const e = await res.json(); details = e?.message || e?.details || ''; } catch {}
    throw new Error(`patch day_flags failed ${res.status} - ${details}`);
  }
  return await res.json();
}

// SUBMODULE: appendNoteRemote @internal - upserts note events for a day via REST
async function appendNoteRemote(opts){
  const { user_id, dayIso, noteEvent } = opts || {};
  const url = await getConf("webhookUrl");
  if (!url || !user_id || !dayIso) {
    const err = new Error('appendNoteRemote: missing params');
    err.status = 401;
    throw err;
  }

  const from = `${dayIso}T00:00:00Z`;
  const toNext = new Date(from); toNext.setUTCDate(toNext.getUTCDate() + 1);
  const toIso = toNext.toISOString().slice(0, 10);
  const baseQuery = `${url}?user_id=eq.${encodeURIComponent(user_id)}&type=eq.note`
                  + `&ts=gte.${encodeURIComponent(dayIso)}T00:00:00Z&ts=lt.${encodeURIComponent(toIso)}T00:00:00Z`;

  const resGet = await fetchWithAuth(
    headers => fetch(baseQuery, { method: 'GET', headers }),
    { tag: 'note:get', maxAttempts: 2 }
  );
  if (!resGet.ok) throw new Error(`note-get-failed-${resGet.status}`);
  const rows = await resGet.json();
  const existing = Array.isArray(rows) && rows[0] ? rows[0] : null;

  const addition = (noteEvent?.payload?.text || '').trim();
  if (!addition) {
    return existing ? { id: existing.id, text: existing?.payload?.text || '' } : { id: null, text: '' };
  }

  const combineText = (prev, add) => {
    if (!prev) return add;
    return `${prev.trim()}
${add}`.trim();
  };

  if (existing) {
    const combined = combineText(existing?.payload?.text || '', addition);
    const patchRes = await fetchWithAuth(
      headers => fetch(`${url}?id=eq.${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ payload: { text: combined } })
      }),
      { tag: 'note:patch', maxAttempts: 2 }
    );
    if (!patchRes.ok) throw new Error(`note-patch-failed-${patchRes.status}`);
    const patched = await patchRes.json().catch(() => null);
    const patchedId = patched?.[0]?.id ?? existing.id;
    return { id: patchedId, text: combined };
  }

  const body = [{ ...noteEvent, user_id }];
  const postRes = await fetchWithAuth(
    headers => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }),
    { tag: 'note:post', maxAttempts: 2 }
  );
  if (!postRes.ok) throw new Error(`note-post-failed-${postRes.status}`);
  const created = await postRes.json().catch(() => null);
  const newId = created?.[0]?.id ?? null;
  return { id: newId, text: addition };
}

// SUBMODULE: pushPendingToRemote @internal - flushes unsynced local entries to Supabase
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

async function prefillSupabaseConfigForm(){
  try {
    setConfigStatus('', 'info');
    const restInput = document.getElementById('configRestUrl');
    const keyInput = document.getElementById('configAnonKey');
    const adv = document.getElementById('configAdv');
    const rest = await getConf('webhookUrl');
    const keyStored = await getConf('webhookKey');
    const restStored = rest && String(rest).trim() ? String(rest).trim() : '';
    const keyClean = keyStored && String(keyStored).trim()
      ? keyStored.replace(/^Bearer\s+/i, '').trim()
      : '';
    if (restInput) {
      const hasUserText = !!(restInput.value && restInput.value.trim());
      if (!hasUserText && restStored) {
        restInput.value = restStored;
      }
    }
    if (keyInput) {
      const hasUserText = !!(keyInput.value && keyInput.value.trim());
      if (!hasUserText && keyClean) {
        keyInput.value = keyClean;
      }
    }
    if (adv) {
      const hasRest = !!restStored;
      const hasKey = !!keyClean;
      adv.open = !(hasRest && hasKey);
    }
  } catch(_){ }
}

function setConfigStatus(msg, tone = 'info'){
  const el = document.getElementById('configStatus');
  if (!el) return;
  el.textContent = msg || '';
  const colors = { error: '#f87171', success: '#34d399', info: '#9aa3af' };
  el.style.color = colors[tone] || colors.info;
}

function showLoginOverlay(show){
  const ov = document.getElementById('loginOverlay');
  if (!ov) return;
  const dialog = ov.querySelector('[role="dialog"]') || ov;
  if (show){
    const alreadyVisible = ov.style.display === 'flex';
    ov.style.display = 'flex';
    if (!alreadyVisible) {
      prefillSupabaseConfigForm();
    }
    activateFocusTrap(dialog);
  } else {
    ov.style.display = 'none';
    deactivateFocusTrap();
  }
}
function setUserUi(email){
  const who = document.getElementById('whoAmI');
  if (who) who.textContent = email ? `Angemeldet als: ${email}` : '';
}

const AUTH_GRACE_MS = 400;
async function isLoggedInFast({ timeout = 400 } = {}) {
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
  } catch(_){
    if (timer) clearTimeout(timer);
    return supabaseState.lastLoggedIn;
  }
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
function bindAuthButtons(){
const gbtn = document.getElementById('googleLoginBtn');
const saveBtn = document.getElementById('configSaveBtn');

if (saveBtn) saveBtn.addEventListener('click', async ()=>{
  const restInput = document.getElementById('configRestUrl');
  const keyInput = document.getElementById('configAnonKey');
  const rawRest = (restInput?.value || '').trim();
  const rawKey = (keyInput?.value || '').trim();
  if (!rawRest || !rawKey){
    setConfigStatus('Bitte REST-Endpoint und ANON-Key eingeben.', 'error');
    return;
  }
  if (!/\/rest\/v1\//i.test(rawRest)){
    setConfigStatus('REST-Endpoint muss /rest/v1/ enthalten.', 'error');
    return;
  }
  if (!/\/rest\/v1\/health_events(?:[/?#]|$)/i.test(rawRest)){
    setConfigStatus('Endpoint muss auf /rest/v1/health_events zeigen.', 'error');
    return;
  }
  try {
    new URL(rawRest);
  } catch {
    setConfigStatus('REST-Endpoint ist keine gueltige URL.', 'error');
    return;
  }
  let anonKey = rawKey.startsWith('Bearer ') ? rawKey : `Bearer ${rawKey}`;
  if (isServiceRoleKey(anonKey)){
    setConfigStatus('service_role Schluessel sind nicht erlaubt.', 'error');
    return;
  }
  try {
    setConfigStatus('Speichere Konfiguration ...', 'info');
    await putConf('webhookUrl', rawRest);
    await putConf('webhookKey', anonKey);
    supabaseState.sbClient = null;
    await ensureSupabaseClient();
    await requireSession();
    setConfigStatus('Konfiguration gespeichert.', 'success');
  } catch (e){
    const message = restErrorMessage(e?.status || 0, e?.details || e?.message || '');
    setConfigStatus(message, 'error');
  }
});

if (gbtn) gbtn.addEventListener('click', async ()=>{
  const supa = await ensureSupabaseClient();
  if (!supa) {
    setConfigStatus('Konfiguration fehlt - bitte REST-Endpoint und ANON-Key speichern.', 'error');
    const adv = document.getElementById('configAdv');
    if (adv) adv.open = true;
    const restField = document.getElementById('configRestUrl');
    if (restField){
      restField.focus();
      restField.select?.();
    }
    return;
  }
  const { error } = await supa.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` }
  });
  if (error) setConfigStatus('Google-Login fehlgeschlagen: ' + error.message, 'error');
});
}

window.bindAuthButtons = bindAuthButtons;

// Beim Start Session pruefen
async function requireSession(){
if(!supabaseState.sbClient){
setUserUi('');
showLoginOverlay(true);
setAuthGuard(false);
setDoctorAccess(false);
supabaseState.lastLoggedIn = false;
return false;
}
try{
const { data: { session } } = await supabaseState.sbClient.auth.getSession();
const logged = !!session;
supabaseState.lastLoggedIn = logged;
setUserUi(session?.user?.email || '');
if (logged){
  supabaseState.authState = 'auth';
  clearAuthGrace();
} else if (!supabaseState.authGraceTimer){
  supabaseState.authState = 'unauth';
}
applyAuthUi(logged);
return logged;
}catch(_){
return false;
}
}

window.requireSession = requireSession;

// Reagiert auch auf spaetere Logins (z. B. nach Redirect)
function watchAuthState(){
  supabaseState.sbClient.auth.onAuthStateChange(async (event, session)=>{
    const logged = !!session;
    if (logged) {
      setUserUi(session?.user?.email || '');
      const newUid = session?.user?.id || null;
      if (newUid) {
        supabaseState.lastUserId = newUid;
        diag.add?.(`[auth] session uid=${maskUid(newUid)}`);
      }
      finalizeAuthState(true);
      await afterLoginBoot();
      await (window.setupRealtime || defaultSetupRealtime)();
      requestUiRefresh().catch(err => diag.add?.('ui refresh err: ' + (err?.message || err)));
      await refreshCaptureIntake();
      await refreshAppointments();
      return;
    }

    setUserUi('');
    supabaseState.lastLoggedIn = false;
    if (supabaseState.lastUserId) {
      diag.add?.('[auth] session cleared');
      supabaseState.lastUserId = null;
    }
    supabaseState.pendingSignOut = async () => {
      (window.teardownRealtime || noopRealtime)();
      await refreshCaptureIntake();
      await refreshAppointments();
    };

    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      finalizeAuthState(false);
    } else {
      scheduleAuthGrace();
    }
  });
}

window.watchAuthState = watchAuthState;

// Alles, was NACH Login laufen soll (deine bestehende Logik)

async function afterLoginBoot(){
  if (supabaseState.booted) return;
  supabaseState.booted = true;
  // Keine Auto-Sync/Realtime bis Arzt-Ansicht umgestellt ist
  requestUiRefresh({ reason: 'boot:afterLogin' }).catch(err => diag.add?.('ui refresh err: ' + (err?.message || err)));
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

/** MODULE: DOCTOR VIEW
 * intent: Zeitraumansicht fuer Aerzt:innen inklusive KPIs, Tagesrendering und Cloud-Aktionen
 * contracts: verwendet DATA ACCESS.fetchDailyOverview, AUTH.requireDoctorUnlock, UI.requestUiRefresh
 * exports: renderDoctor, setDocBadges, renderDoctorDay, exportDoctorJson
 * notes: Markup-Erzeugung stabil halten; @todo buildDoctorSummaryJson @extract-candidate @public fuer Export
 */
/* ===== Doctor view ===== */
// SUBMODULE: setDocBadges @internal - updates toolbar KPI badges for training/bad days
function setDocBadges({ training, bad, visible } = {}) {
  const t = document.getElementById('docTrainCnt');
  const b = document.getElementById('docBadCnt');
  if (!t || !b) return;

  if (training !== undefined) t.querySelector('.val').textContent = String(training);
  if (bad !== undefined)      b.querySelector('.val').textContent = String(bad);

  if (visible !== undefined) {
    t.classList.toggle('hidden', !visible);
    b.classList.toggle('hidden', !visible);
  }
}

const __t0 = performance.now();
// SUBMODULE: renderDoctor @extract-candidate - orchestrates gated render flow, fetches days, manages scroll state
async function renderDoctor(){
  const host = $("#doctorView");
  if (!host) return;

  const scroller = document.getElementById('doctorDailyWrap') || host.parentElement || host;
  if (!scroller.dataset.scrollWatcher) {
    scroller.addEventListener('scroll', () => {
      const h = scroller.scrollHeight || 1;
      __doctorScrollSnapshot.top = scroller.scrollTop;
      __doctorScrollSnapshot.ratio = h ? Math.min(1, scroller.scrollTop / h) : 0;
    }, { passive: true });
    scroller.dataset.scrollWatcher = "1";
  }

  if (!(await isLoggedIn())){
    host.innerHTML = `<div class="small" style="text-align:center;opacity:.7;padding:12px">Bitte anmelden, um die Arzt-Ansicht zu sehen.</div>`;
    setDocBadges({ visible: false });
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
    return;
  }
  // Nur sperren, wenn die Arzt-Ansicht wirklich aktiv angezeigt wird
  const doctorSection = document.getElementById('doctor');
  const isActive = !!doctorSection && doctorSection.classList.contains('active');
  if (!__doctorUnlocked){
    if (isActive){
      host.innerHTML = `<div class="small" style="text-align:center;opacity:.7;padding:12px">Bitte Arzt-Ansicht kurz entsperren.</div>`;
      setDocBadges({ visible: false });
      try { await (window.requireDoctorUnlock || defaultRequireDoctorUnlock)(); } catch(_) {}
      if (!__doctorUnlocked) return;
    } else {
      return;
    }
  }

  const prevScrollTop = (__doctorScrollSnapshot?.top ?? scroller.scrollTop ?? 0) || 0;
  const prevScrollRatio = (__doctorScrollSnapshot?.ratio ?? 0) || 0;
  host.innerHTML = "";

  // Anzeige-Helper
  const dash = v => (v === null || v === undefined || v === "" ? "-" : String(v));
  const onClass = b => (b ? "on" : "");
  const fmtDateDE = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("de-AT", { weekday:"short", day:"2-digit", month:"2-digit", year:"numeric" });
  };

  // Zeitraum lesen
  const from = $("#from").value;
  const to   = $("#to").value;
  if (!from || !to){
    host.innerHTML = `<div class="small" style="text-align:center;opacity:.7;padding:12px">Bitte Zeitraum waehlen.</div>`;
    setDocBadges({ visible: false });
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
    return;
  }

  //  Server lesen  Tagesobjekte
  let daysArr = [];
  try{
    daysArr = await fetchDailyOverview(from, to);
  }catch(_){
    host.innerHTML = `<div class="small" style="text-align:center;opacity:.7;padding:12px">Fehler beim Laden aus der Cloud.</div>`;
    setDocBadges({ visible: false });
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
    return;
  }

  daysArr.sort((a,b)=> b.date.localeCompare(a.date));

  // KPIs
  const trainingDays = daysArr.filter(d => !!d.flags.training).length;
  const badDays = daysArr.filter(d => {
    const f = d.flags;
    return !!(f.water_lt2 || f.salt_gt5 || f.protein_ge90 || f.sick || f.meds);
  }).length;
  setDocBadges({ training: trainingDays, bad: badDays, visible: true });

  // Renderer je Tag
  // SUBMODULE: renderDoctorDay @internal - templates per-day HTML card for doctor view
  const renderDoctorDay = (day) => `
<section class="doctor-day" data-date="${day.date}">
  <div class="col-date">
    <div class="date-top">
      <span class="date-label">${fmtDateDE(day.date)}</span>
      <span class="date-cloud" title="In Cloud gespeichert?">${day.hasCloud ? "&#9729;&#65039;" : ""}</span>
    </div>
    <div class="date-actions">
      <button class="btn ghost btn-xs" data-del-day="${day.date}">Loeschen</button>
    </div>
  </div>

  <div class="col-measure">
    <div class="measure-head">
      <div></div>
      <div>Sys</div><div>Dia</div><div>Puls</div><div>MAP</div>
    </div>
    <div class="measure-grid">
      <div class="measure-row">
        <div class="label">morgens</div>
        <div class="num ${ (day.morning.sys!=null && day.morning.sys>130) ? 'alert' : '' }">${dash(day.morning.sys)}</div>
        <div class="num ${ (day.morning.dia!=null && day.morning.dia>90)  ? 'alert' : '' }">${dash(day.morning.dia)}</div>
        <div class="num">${dash(day.morning.pulse)}</div>
        <div class="num ${ (day.morning.map!=null && day.morning.map>100) ? 'alert' : '' }">${dash(fmtNum(day.morning.map))}</div>
      </div>
      <div class="measure-row">
        <div class="label">abends</div>
        <div class="num ${ (day.evening.sys!=null && day.evening.sys>130) ? 'alert' : '' }">${dash(day.evening.sys)}</div>
        <div class="num ${ (day.evening.dia!=null && day.evening.dia>90)  ? 'alert' : '' }">${dash(day.evening.dia)}</div>
        <div class="num">${dash(day.evening.pulse)}</div>
        <div class="num ${ (day.evening.map!=null && day.evening.map>100) ? 'alert' : '' }">${dash(fmtNum(day.evening.map))}</div>
      </div>
    </div>
  </div>

  <div class="col-special">
    <div class="weight-line">
      <div>Gewicht</div>
      <div class="num">${dash(fmtNum(day.weight))}</div>
    </div>

    <div class="waist-line">
      <div>Bauchumfang (cm)</div>
      <div class="num">${dash(fmtNum(day.waist_cm))}</div>
    </div>

    <div class="flags">
      <div class="flag"><span class="flag-box ${onClass(day.flags.water_lt2)}"></span><span>&lt;2L Wasser</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.salt_gt5)}"></span><span>Salz &gt;5g</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.protein_ge90)}"></span><span>Protein &ge; 90 g</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.sick)}"></span><span>Krank</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.meds)}"></span><span>Medikamente</span></div>
      <div class="flag"><span class="flag-box ${onClass(day.flags.training)}"></span><span>Training</span></div>
    </div>

    <div class="notes">${nl2br((day.notes || "").trim() || "-")}</div>
  </div>
</section>
`;

  // Rendern / Leerzustand
  if (!daysArr.length){
    host.innerHTML = `<div class="small" style="text-align:center;opacity:.7;padding:12px">Keine Eintraege im Zeitraum</div>`;
    if (scroller) scroller.scrollTop = 0;
    __doctorScrollSnapshot = { top: 0, ratio: 0 };
  } else {
    host.innerHTML = daysArr.map(renderDoctorDay).join("");

    const restoreScroll = () => {
      const targetEl = scroller || host;
      const height = targetEl.scrollHeight || 1;
      const maxScroll = Math.max(0, height - targetEl.clientHeight);
      const fromTop = Math.max(0, Math.min(prevScrollTop, maxScroll));
      const fromRatio = Math.max(0, Math.min(Math.round(prevScrollRatio * height), maxScroll));
      const target = prevScrollTop ? fromTop : fromRatio;
      targetEl.scrollTop = target;
      const h = targetEl.scrollHeight || 1;
      __doctorScrollSnapshot.top = targetEl.scrollTop;
      __doctorScrollSnapshot.ratio = h ? Math.min(1, targetEl.scrollTop / h) : 0;
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(restoreScroll);
    } else {
      setTimeout(restoreScroll, 0);
    }

    //  Loeschen: alle Server-Events des Tages entfernen
    host.querySelectorAll('[data-del-day]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const date = btn.getAttribute('data-del-day');
        if (!date) return;
        if (!confirm(`Alle Eintraege in der Cloud fuer ${date} loeschen?`)) return;

        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = 'Loesche...';
        try{
          const r = await deleteRemoteDay(date);
          if (!r.ok){
            alert(`Server-Loeschung fehlgeschlagen (${r.status||"?"}).`);
          }
          await requestUiRefresh({ reason: 'doctor:delete' });
        } finally {
          btn.disabled = false; btn.textContent = old;
        }
      });
    });
  }
}

/** MODULE: CHARTS (SVG/Canvas)
 * intent: rendert Tages-Charts (BP/Body) inkl. KPI-Leiste, Flags-Overlay und Tooltips
 * contracts: haengt von DATA ACCESS.fetchDailyOverview, UTILITIES esc/fmtNum, PERF.diag Logging ab
 * exports: chartPanel
 * notes: drawing/scaling pipelines sind @extract-candidate fuer spaetere Auslagerung
 */
/* ===== Simple SVG Chart (Daily) - final, ohne Doppel-Helper & mit WHO-Ampel ===== */

/* Fallbacks nur, wenn extern nicht verfuegbar */
const safeEnsureSupabaseClient = async () => {
  try { if (typeof ensureSupabaseClient === "function") return await ensureSupabaseClient(); } catch(_) {}
  return null;
};
const safeGetConf = async (k) => {
  try { if (typeof getConf === "function") return await getConf(k); } catch(_) {}
  return null;
};

// SUBMODULE: chartPanel controller @extract-candidate - steuert Panel-Lifecycle, Datenbeschaffung und Zeichnung
const chartPanel = {
  el: null,
  svg: null,
  legend: null,
  open: false,
  tip: null,
  tipSticky: false,
  hoverSeries: null,
  SHOW_BODY_COMP_BARS: true,

  // SUBMODULE: chartPanel.init @internal - richtet Panel, Tooltip und Event-Handler ein
  init() {
    this.el = $("#chart");
    this.svg = $("#chartSvg");
    this.legend = $("#chartLegend");

    // Panel initial nicht anzeigen
    if (this.el) this.el.style.display = "none";

    // Close + Metric-Select
    const closeBtn = $("#chartClose");
    if (closeBtn) closeBtn.addEventListener("click", () => this.hide());
    const metricSel = $("#metricSel");
    if (metricSel) metricSel.addEventListener("change", () => this.draw());

    // Tooltip (hover/click)
    const contentHost = this.el?.querySelector(".content") || this.el || document.body;
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.id = "chartTip";
    contentHost.style.position = "relative";
    contentHost.appendChild(tip);
    this.tip = tip;
    this.tipHideTimer = null;

    // ARIA Live-Region (nur Text, fuer Screenreader)
    const live = document.createElement("div");
    live.id = "chartAria";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("role", "status");
    Object.assign(live.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: 0,
      border: 0,
      margin: "-1px",
      clip: "rect(0 0 0 0)",
      overflow: "hidden",
      whiteSpace: "nowrap",
    });
    contentHost.appendChild(live);
    this.live = live;

    // Interaktivitaet
    if (this.svg) {
      this.svg.addEventListener("pointermove", (e) => {
        if (this.tipSticky) return;
        const tgt = e.target;
        const isPt  = !!(tgt && tgt.classList?.contains("pt"));
        const isHit = !!(tgt && tgt.classList?.contains("chart-hit"));
        if (!(isPt || isHit)) { this.hideTip(); return; }
        const date = tgt.getAttribute("data-date") || "";
        const hasNote = !!(tgt.getAttribute("data-note"));
        const hasFlags = this.hasFlagsForDate?.(date);
        if (!(hasNote || hasFlags)) { this.hideTip(); return; }
        this.fillTipFromTarget(tgt);
        this.positionTip(e);
      });

      this.svg.addEventListener("pointerleave", () => {
        if (this.tipSticky) return;
        this.hideTip();
      });

      // Click/Tap: Tooltip toggeln (mobil-freundlich)
      this.svg.addEventListener("click", (e) => {
        const tgt = e.target;
        const isPt  = !!(tgt && tgt.classList?.contains("pt"));
        const isHit = !!(tgt && tgt.classList?.contains("chart-hit"));
        if (!(isPt || isHit)) { if (this.tipSticky) { this.tipSticky = false; this.hideTip(); } return; }
        const date = tgt.getAttribute("data-date") || "";
        const hasNote = !!(tgt.getAttribute("data-note"));
        const hasFlags = this.hasFlagsForDate?.(date);
        if (!(hasNote || hasFlags)) { if (this.tipSticky) { this.tipSticky = false; this.hideTip(); } return; }
        this.fillTipFromTarget(tgt);
        this.tipSticky = !this.tipSticky;
        this.positionTip(e);
      });

      // Keyboard: Enter/Space toggelt Tooltip, ESC schliesst
      this.svg.addEventListener("keydown", (e) => {
        const tgt = e.target;
        const isPt  = !!(tgt && tgt.classList?.contains("pt"));
        const isHit = !!(tgt && tgt.classList?.contains("chart-hit"));
        if (!(isPt || isHit)) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const date = tgt.getAttribute("data-date") || "";
          const hasNote = !!(tgt.getAttribute("data-note"));
          const hasFlags = this.hasFlagsForDate?.(date);
          if (!(hasNote || hasFlags)) return;
          this.fillTipFromTarget(tgt);
          this.tipSticky = !this.tipSticky;
        } else if (e.key === "Escape") {
          this.tipSticky = false; this.hideTip();
        }
      });
    }

    // Redraw bei Resize/Orientation
    if (this.el) {
      const ro = new ResizeObserver(() => { if (this.open) this.draw(); });
      ro.observe(this.el);
      this._ro = ro;
    }
    window.addEventListener("orientationchange", () => {
      setTimeout(() => { if (this.open) this.draw(); }, 150);
    });

    // KPI-Box: Felder sicherstellen
    this.ensureKpiFields();
  },

  // SUBMODULE: chartPanel.toggle @internal - schaltet Chart-Panel an/aus inkl. Fokus
  toggle() {
    if (this.open) {
      this.hide();
    } else {
      this.show();
    }
  },

  // SUBMODULE: chartPanel.show @internal - oeffnet Panel und aktiviert focusTrap
  show() {
    this.open = true;
    if (this.el) {
      this.el.style.display = "block";
      activateFocusTrap(this.el);
    }
  },

  // SUBMODULE: chartPanel.hide @internal - schliesst Panel, deaktiviert focusTrap und Tooltips
  hide() {
    this.open = false;
    if (this.el) {
      this.el.style.display = "none";
      deactivateFocusTrap();
    }
    this.tipSticky = false;
    this.hideTip();
  },
  // ----- Helpers -----
  // SUBMODULE: chartPanel.getFiltered @extract-candidate - aggregiert Cloud/Local Daten fuer Zeichnung
async getFiltered() {
  const from = $("#from")?.value;
  const to   = $("#to")?.value;

  // Wenn eingeloggt: Cloud nehmen (Events -> Daily), sonst fallback: lokale Entries
  if (await isLoggedIn()) {
    // gleiche Aggregation wie Arzt-Ansicht
    const days = await fetchDailyOverview(from, to);
    // Fuer die Chart-Logik bauen wir flache "entry"-aehnliche Objekte
    const flat = [];
    for (const d of days) {
      // Morgen
      if (d.morning.sys != null || d.morning.dia != null || d.morning.pulse != null) {
        const ts = Date.parse(d.date + "T07:00:00Z"); // Fix-Zeit am Tag
        flat.push({
          date: d.date,
          dateTime: new Date(ts).toISOString(),
          ts,
          context: "Morgen",
          sys: d.morning.sys,
          dia: d.morning.dia,
          pulse: d.morning.pulse,
          weight: null,
          waist_cm: null,
          notes: d.notes || "",
          training: d.flags.training,
          low_intake: d.flags.water_lt2,
          sick: d.flags.sick,
          valsartan_missed: !!d.flags.valsartan_missed,
          forxiga_missed:   !!d.flags.forxiga_missed,
          nsar_taken:       !!d.flags.nsar_taken,
          salt_high: d.flags.salt_gt5,
          protein_high90: d.flags.protein_ge90,
          fat_kg: null,
          muscle_kg: null
        });
      }
      // Abend
      if (d.evening.sys != null || d.evening.dia != null || d.evening.pulse != null) {
        const ts = Date.parse(d.date + "T19:00:00Z");
        flat.push({
          date: d.date,
          dateTime: new Date(ts).toISOString(),
          ts,
          context: "Abend",
          sys: d.evening.sys,
          dia: d.evening.dia,
          pulse: d.evening.pulse,
          weight: null,
          waist_cm: null,
          notes: d.notes || "",
          training: d.flags.training,
          low_intake: d.flags.water_lt2,
          sick: d.flags.sick,
          valsartan_missed: !!d.flags.valsartan_missed,
          forxiga_missed:   !!d.flags.forxiga_missed,
          nsar_taken:       !!d.flags.nsar_taken,
          salt_high: d.flags.salt_gt5,
          protein_high90: d.flags.protein_ge90,
          fat_kg: null,
          muscle_kg: null
        });
      }
      // Body (Gewicht/Bauch)
      if (d.weight != null || d.waist_cm != null) {
        const ts = Date.parse(d.date + "T12:00:00Z");
        flat.push({
          date: d.date,
          dateTime: new Date(ts).toISOString(),
          ts,
          context: "Tag",
          sys: null, dia: null, pulse: null,
          weight: d.weight,
          waist_cm: d.waist_cm,
          notes: d.notes || "",
          training: d.flags.training,
          low_intake: d.flags.water_lt2,
          sick: d.flags.sick,
          valsartan_missed: !!d.flags.valsartan_missed,
          forxiga_missed:   !!d.flags.forxiga_missed,
          nsar_taken:       !!d.flags.nsar_taken,
          salt_high: d.flags.salt_gt5,
          protein_high90: d.flags.protein_ge90,
          fat_kg: d.fat_kg,
          muscle_kg: d.muscle_kg
        });
      }
    }
    // Ergaenze Tage mit ausschliesslich Flags (ohne BP/Body), damit Flags-Overlay immer angezeigt wird
    for (const d of days) {
      const hasFlags = !!(d?.flags?.training || d?.flags?.sick || d?.flags?.water_lt2 || d?.flags?.salt_gt5 || d?.flags?.protein_ge90 || d?.flags?.meds);
      if (!hasFlags) continue;
      const already = flat.some(e => e?.date === d.date);
      if (!already) {
        const ts = Date.parse(d.date + "T12:00:00Z");
        flat.push({
          date: d.date,
          dateTime: new Date(ts).toISOString(),
          ts,
          context: "Tag",
          sys: null, dia: null, pulse: null,
          weight: null,
          waist_cm: null,
          notes: d.notes || "",
          training: d.flags.training,
          low_intake: d.flags.water_lt2,
          sick: d.flags.sick,
          valsartan_missed: !!d.flags.valsartan_missed,
          forxiga_missed:   !!d.flags.forxiga_missed,
          nsar_taken:       !!d.flags.nsar_taken,
          salt_high: d.flags.salt_gt5,
          protein_high90: d.flags.protein_ge90,
          fat_kg: null,
          muscle_kg: null
        });
      }
    }
    return flat.sort((a,b) => (a.ts ?? Date.parse(a.dateTime)) - (b.ts ?? Date.parse(b.dateTime)));
  }

  // Fallback: lokal (wenn nicht eingeloggt)
  const entries = typeof getAllEntries === "function" ? await getAllEntries() : [];
  return entries
    .filter(e => {
      if (from && e.date < from) return false;
      if (to   && e.date > to)   return false;
      return true;
  })
    .sort((a,b) => (a.ts ?? Date.parse(a.dateTime)) - (b.ts ?? Date.parse(b.dateTime)));
},

  // Hoehe laden (Konfig oder Fallback 183 cm)
  // SUBMODULE: chartPanel.getHeightCm @internal - liest Nutzerkoerpergroesse aus Supabase/Lokal
  async getHeightCm() {
    // 1) Supabase-Profil
    const supa = await safeEnsureSupabaseClient();
    if (supa) {
      try {
        const { data, error } = await supa.from("user_profile").select("height_cm").single();
        if (!error && data?.height_cm) return Number(data.height_cm);
      } catch(_) {}
    }
    // 2) lokale Konfig
    const v = await safeGetConf("height_cm");
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    return 183;
  },

  // Tooltip
  hideTip() {
    if (this.tip) {
      this.tip.dataset.visible = "0";
      this.tip.style.opacity = "0";
      clearTimeout(this.tipHideTimer);
      this.tipHideTimer = setTimeout(() => {
        if (!this.tip || this.tip.dataset.visible === "1") return;
        this.tip.style.display = "none";
        this.tip.textContent = "";
      }, 160);
    }
    this.setHoverSeries(null);
  },
  // SUBMODULE: chartPanel.setHoverSeries @internal - hebt aktuelle Serie in Chart/Legende hervor
  setHoverSeries(seriesKey) {
    if (!this.svg && !this.legend) return;
    const nextKey = seriesKey || null;
    if (this.hoverSeries === nextKey) return;
    this.hoverSeries = nextKey;

    const svgNodes = this.svg ? Array.from(this.svg.querySelectorAll('[data-series]')) : [];
    const legendNodes = this.legend ? Array.from(this.legend.querySelectorAll('[data-series]')) : [];
    [...svgNodes, ...legendNodes].forEach(node => {
      node.classList.remove('is-hover', 'is-dim');
    });

    if (!nextKey) return;
    svgNodes.forEach(node => {
      const key = node.getAttribute('data-series');
      if (!key) return;
      node.classList.add(key === nextKey ? 'is-hover' : 'is-dim');
    });
    legendNodes.forEach(node => {
      const key = node.getAttribute('data-series');
      if (!key) return;
      node.classList.add(key === nextKey ? 'is-hover' : 'is-dim');
    });
  },
  // SUBMODULE: chartPanel.positionTip @internal - positioniert Tooltip relativ zum Cursor
  positionTip(e) {
    if (!this.tip || !this.el) return;
    const hostRect = (this.el.querySelector(".content") || this.el).getBoundingClientRect();
    const x = e.clientX - hostRect.left;
    const y = e.clientY - hostRect.top;
    this.tip.style.left = `${x + 10}px`;
    this.tip.style.top  = `${y + 10}px`;
    if (this.tip.dataset.visible !== "1") {
      this.tip.style.display = "block";
      this.tip.style.opacity = "0";
      requestAnimationFrame(() => {
        if (!this.tip) return;
        this.tip.dataset.visible = "1";
        this.tip.style.opacity = "1";
      });
    } else {
      this.tip.dataset.visible = "1";
      this.tip.style.display = "block";
      this.tip.style.opacity = "1";
    }
  },
  // SUBMODULE: chartPanel.fillTipFromTarget @internal - generiert Tooltip-Inhalt inkl. Flags
  fillTipFromTarget(tgt) {
    if (!this.tip) return;
    this.setHoverSeries(tgt?.getAttribute("data-series") || null);
    const note = tgt.getAttribute("data-note") || "";
    const date = tgt.getAttribute("data-date") || "";
    const ctx  = tgt.getAttribute("data-ctx")  || "";
    const flags = (typeof this.flagsByDate?.get === 'function') ? this.flagsByDate.get(date) : null;
    const items = [];
    if (flags) {
      if (flags.training)         items.push("Training");
      if (flags.sick)             items.push("Krank");
      if (flags.low_intake)       items.push("< 2 L Wasser");
      if (flags.salt_high)        items.push("> 5 g Salz");
      if (flags.protein_high90)   items.push("Protein  90 g");
      if (flags.valsartan_missed) items.push("Valsartan vergessen");
      if (flags.forxiga_missed)   items.push("Forxiga vergessen");
      if (flags.nsar_taken)       items.push("NSAR genommen");
      if (!flags.valsartan_missed && !flags.forxiga_missed && !flags.nsar_taken && flags.meds) items.push("Medikamente");
    }

    const parts = [];
    const hdr = (date || ctx) ? `<div style="opacity:.85;margin-bottom:4px">${esc([date, ctx].filter(Boolean).join(" . "))}</div>` : "";
    if (hdr) parts.push(hdr);
    if (note) parts.push(`<div style="white-space:pre-wrap;margin-bottom:${items.length? '6' : '0'}px">${esc(note)}</div>`);
    if (items.length) {
      const lis = items.map(esc).map(t => `<li>${t}</li>`).join("");
      parts.push(`<div style="margin-top:${note? '0' : '2'}px"><strong>Flags:</strong><ul style="margin:4px 0 0 16px; padding:0">${lis}</ul></div>`);
    }
    if (!parts.length) { this.hideTip(); return; }
    this.tip.innerHTML = parts.join("");
    this.tip.dataset.visible = "1";
    this.tip.style.display = "block";
    this.tip.style.opacity = "1";
    if (this.live) this.live.textContent = `${date || ''} ${ctx || ''} ${note ? 'Notiz vorhanden. ' : ''}${items.length ? 'Flags: ' + items.join(', ') : ''}`.trim();
  },

  /* ---------- KPI-Felder + WHO-Ampellogik ---------- */
  // SUBMODULE: chartPanel.ensureKpiFields @internal - stellt KPI-Marker im UI bereit
  ensureKpiFields() {
    const box = $("#chartAverages");
    if (!box) return;
    const need = [
      { k: "sys",  label: "Durchschnitt Sys: -" },
      { k: "dia",  label: "Durchschnitt Dia: -" },
      { k: "map",  label: "Durchschnitt MAP: -" },
      { k: "bmi",  label: "BMI (letzter): -" },
      { k: "whtr", label: "WHtR (letzter): -" },
    ];
    need.forEach((n) => {
      if (!box.querySelector(`[data-k="${n.k}"]`)) {
        const span = document.createElement("span");
        span.setAttribute("data-k", n.k);
        span.textContent = n.label;
        box.appendChild(span);
      }
    });
  },

  // WHO-Farben
  // SUBMODULE: chartPanel.kpiColorBMI @internal - mappt BMI auf WHO-Farben
  kpiColorBMI(v) {
    if (v == null) return "#9aa3af";        // unknown
    if (v < 18.5) return "#60a5fa";         // untergew.
    if (v < 25)   return "#10b981";         // normal
    if (v < 30)   return "#f59e0b";         // uebergew.
    return "#ef4444";                        // adipoes
  },
  // SUBMODULE: chartPanel.kpiColorWHtR @internal - mappt WHtR auf WHO-Farben
  kpiColorWHtR(v) {
    if (v == null) return "#9aa3af";
    if (v < 0.5)   return "#10b981";        // ok
    if (v <= 0.6)  return "#f59e0b";        // erhoeht
    return "#ef4444";                        // hoch
  },

  // Ein Punkt pro KPI, korrekt eingefaerbt; saubere Separatoren
  // SUBMODULE: chartPanel.layoutKpis @internal - zeichnet KPI-Dots/Sep dynamisch
  layoutKpis() {
    const box = $("#chartAverages");
    if (!box) return;

    // 1) Alle alten Deko-Elemente entfernen (auch statische .sep aus dem HTML!)
    [...box.querySelectorAll(".kpi-dot, .kpi-sep, .sep")].forEach(n => n.remove());

    // 2) Sichtbare KPI-Spans ermitteln (display != "none")
    const items = [...box.querySelectorAll('[data-k]')].filter(el => el.style.display !== "none");

    // 3) Pro Item farbigen Punkt einsetzen + exakt einen Separator zwischen Items
    const makeDot = (color) => {
      const d = document.createElement("span");
      d.className = "kpi-dot";
      Object.assign(d.style, {
        display: "inline-block",
        width: "9px", height: "9px",
        borderRadius: "50%",
        margin: "0 8px 0 12px",
        background: color,
        verticalAlign: "middle",
        boxShadow: "0 0 4px rgba(0,0,0,.35)"
      });
      return d;
    };
    const makeSep = () => {
      const s = document.createElement("span");
      s.className = "kpi-sep";
      s.textContent = "*";
      Object.assign(s.style, {
        color: "#6b7280",
        margin: "0 10px",
        userSelect: "none"
      });
      return s;
    };

    items.forEach((el, idx) => {
      let color = "#9aa3af";
      const k = el.getAttribute("data-k");

      // Wert aus Text extrahieren (erste Zahl im Text)
      const m = el.textContent.match(/([\d.]+)/);
      const v = m ? parseFloat(m[1]) : null;

      if (k === "bmi") {
        color = this.kpiColorBMI(Number.isFinite(v) ? v : null);
      } else if (k === "whtr") {
        color = this.kpiColorWHtR(Number.isFinite(v) ? v : null);
      } else {
        // BP-KPIs neutral blau
        color = "#60a5fa";
      }

      el.before(makeDot(color));
      if (idx < items.length - 1) el.after(makeSep());
    });

    box.style.display = items.length ? "inline-flex" : "none";
    box.style.alignItems = "center";
  },

  // ----- Zeichnen -----
  // SUBMODULE: chartPanel.draw @extract-candidate - berechnet Scales, Flags und rendert SVG Layer
  async draw() {
    const t0 = performance.now?.() ?? Date.now();
if (!(await isLoggedIn())) {
  if (this.svg) this.svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#9aa3af" font-size="14">Bitte anmelden</text>';
  if (this.legend) this.legend.innerHTML = "";
  return;
}
const metric = $("#metricSel")?.value || "bp";

    const data   = await this.getFiltered();

    // X-Basis
    const xsAll = data.map(e => e.ts ?? Date.parse(e.dateTime));
    let series = [];
    let barSeries = [];
    let X = xsAll;
    let pendingBodyHitsSvg = "";

    // KPI-Box
    const avgBox = $("#chartAverages");

    // Schwellen (nur BP)
    const TH_SYS = 130;
    const TH_DIA = 90;

    // Tagesstempel (UTC, 00:00)
    const toDayTs = (isoDate /* "YYYY-MM-DD" */) => {
      if (!isoDate) return NaN;
      const [y, m, d] = isoDate.split("-").map(Number);
      return Date.UTC(y, (m || 1) - 1, d || 1);
    };

    // Tageskommentare (erste Zeile)
    const notesByDate = new Map();
    for (const e of data) {
      const hasDayLike = e?.context === "Tag" || isWeightOnly(e);
      const txt = (e?.notes || "").trim();
      if (hasDayLike && txt) {
        const firstLine = txt.split(/\r?\n/)[0].trim();
        if (firstLine) notesByDate.set(e.date, firstLine);
      }
    }

    // Fuer BP benoetigen wir Meta je Punkt
    let meta = null;

    if (metric === "bp") {
      // Nur echte Messungen
      const mData = data.filter(
        e => (e.context === "Morgen" || e.context === "Abend") && (e.sys != null || e.dia != null)
      );

      // Meta
      meta = mData.map(e => ({
        date: e.date,
        ctx:  e.context,
        sys:  e.sys != null ? Number(e.sys) : null,
        dia:  e.dia != null ? Number(e.dia) : null,
        note: notesByDate.get(e.date) || "",
      }));

      // X auf Tage normalisieren
      const xsBP = mData.map(e => toDayTs(e.date));

      // Werte-Reihen (Index passend zu meta)
      const sysM = mData.map(e => (e.context === "Morgen" && e.sys != null) ? Number(e.sys) : null);
      const sysA = mData.map(e => (e.context === "Abend"  && e.sys != null) ? Number(e.sys) : null);
      const diaM = mData.map(e => (e.context === "Morgen" && e.dia != null) ? Number(e.dia) : null);
      const diaA = mData.map(e => (e.context === "Abend"  && e.dia != null) ? Number(e.dia) : null);

      // KPIs ( ueber alle Messungen)
      const avg = (arr) => {
        const v = arr.filter(x => x != null);
        return v.length ? v.reduce((p,c) => p + c, 0) / v.length : null;
      };
      const mapArr = mData.map(e =>
        e.sys != null && e.dia != null
          ? Number(e.dia) + (Number(e.sys) - Number(e.dia)) / 3
          : null
      );

      if (avgBox) {
        const avgSys = avg(mData.map(e => (e.sys != null ? Number(e.sys) : null)));
        const avgDia = avg(mData.map(e => (e.dia != null ? Number(e.dia) : null)));
        const avgMap = avg(mapArr);

        const f0 = (v) => (v == null ? "-" : Math.round(v).toString());

        // Zeige BP-KPIs, blende BMI/WHtR aus
        const sEl  = avgBox.querySelector('[data-k="sys"]');
        const dEl  = avgBox.querySelector('[data-k="dia"]');
        const mEl  = avgBox.querySelector('[data-k="map"]');
        const bmiEl  = avgBox.querySelector('[data-k="bmi"]');
        const whtrEl = avgBox.querySelector('[data-k="whtr"]');
        if (sEl)  { sEl.style.display  = ""; sEl.textContent  = "Durchschnitt Sys: " + f0(avgSys); }
        if (dEl)  { dEl.style.display  = ""; dEl.textContent  = "Durchschnitt Dia: " + f0(avgDia); }
        if (mEl)  { mEl.style.display  = ""; mEl.textContent  = "Durchschnitt MAP: " + f0(avgMap); }
        if (bmiEl)  bmiEl.style.display  = "none";
        if (whtrEl) whtrEl.style.display = "none";

        avgBox.style.display = (avgSys != null || avgDia != null || avgMap != null) ? "inline-flex" : "none";
        this.layoutKpis();
      }

      // Serien definieren
      series = [
        { key: "bp-sys-m", name: "Sys Morgens", values: sysM, color: "var(--chart-line-secondary)", type: "sys" },
        { key: "bp-sys-a", name: "Sys Abends",  values: sysA, color: "var(--chart-line-primary)", type: "sys" },
        { key: "bp-dia-m", name: "Dia Morgens", values: diaM, color: "var(--chart-line-tertiary, var(--chart-line-secondary))", type: "dia" },
        { key: "bp-dia-a", name: "Dia Abends",  values: diaA, color: "var(--chart-line-dia)", type: "dia" },
      ];

      X = xsBP; // wichtig
} else if (metric === "weight") {
  // Serien: Gewicht + Bauchumfang
  series = [
    {
      key: "body-weight",
      name: "Gewicht (kg)",
      values: data.map(e => e.weight != null ? Number(e.weight) : null),
      color: "var(--chart-line-weight)",
      type: "misc",
    },
    {
      key: "body-waist",
      name: "Bauchumfang (cm)",
      values: data.map(e => e.waist_cm != null ? Number(e.waist_cm) : null),
      color: "var(--chart-line-waist)",
      type: "misc",
    }
  ];

  // KPI-Leiste: BMI & WHtR aus dem LETZTEN verfuegbaren Wert
  if (avgBox) {
    // BP-KPIs ausblenden
    ["sys","dia","map"].forEach(k => {
      const el = avgBox.querySelector(`[data-k="${k}"]`);
      if (el) el.style.display = "none";
    });

    // letzten Weight/Bauchumfang finden (data ist aufsteigend sortiert)
    let lastWeight = null, lastWaist = null;
    for (let i = data.length - 1; i >= 0; i--) {
      if (lastWeight == null && data[i].weight   != null) lastWeight = Number(data[i].weight);
      if (lastWaist  == null && data[i].waist_cm != null) lastWaist  = Number(data[i].waist_cm);
      if (lastWeight != null && lastWaist != null) break;
    }

    const heightCm = await this.getHeightCm();
    const hM = heightCm > 0 ? heightCm / 100 : null;

    const bmi  = (lastWeight != null && hM)         ? lastWeight / (hM * hM) : null;
    const whtr = (lastWaist  != null && heightCm>0) ? lastWaist  / heightCm  : null;

    const bmiEl  = avgBox.querySelector('[data-k="bmi"]');
    const whtrEl = avgBox.querySelector('[data-k="whtr"]');

    if (bmiEl)  { bmiEl.textContent  = `BMI (letzter): ${bmi  == null ? "-" : bmi.toFixed(1)}`;  bmiEl.style.display  = ""; }
    if (whtrEl) { whtrEl.textContent = `WHtR (letzter): ${whtr == null ? "-" : whtr.toFixed(2)}`; whtrEl.style.display = ""; }

    avgBox.style.display = "inline-flex";
    this.layoutKpis();
  }

  const muscleKg = data.map(e => e.muscle_kg != null ? Number(e.muscle_kg) : null);
  const fatKg    = data.map(e => e.fat_kg    != null ? Number(e.fat_kg)    : null);
  barSeries = [
    { key: "body-muscle", name: "Muskelmasse (kg)", values: muscleKg, color: "var(--chart-bar-muscle)" },
    { key: "body-fat",    name: "Fettmasse (kg)",   values: fatKg,    color: "var(--chart-bar-fat)" },
  ];
}

  // --- Render-Prep ---
    if (this.svg) {
      this.svg.innerHTML = "";
      this.svg.classList.remove("chart-refresh");
      void this.svg.offsetWidth;
      this.svg.classList.add("chart-refresh");
    }
    if (this.legend) this.legend.innerHTML = "";
    if (!this.tipSticky) this.hideTip();

    // Wenn es Flags gibt, soll das Chart nicht fruehzeitig abbrechen
    const hasBarData = barSeries.some(s => s.values.some(v => v != null));
    const hasAnyFlagsData = (metric !== "weight") && Array.isArray(data) && data.some(e => !!(e?.training || e?.low_intake || e?.sick || e?.salt_high || e?.protein_high90 || e?.valsartan_missed || e?.forxiga_missed || e?.nsar_taken));
    const hasAny = series.some(s => s.values.some(v => v != null)) || hasBarData || hasAnyFlagsData;
    if (!hasAny) {
      if (this.svg) this.svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#9aa3af" font-size="14">Keine darstellbaren Werte</text>';
      return;
    }

    // Dynamische Groesse
    const bbox = this.svg?.getBoundingClientRect?.() || { width: 640, height: 280 };
    const W = Math.max(300, Math.floor(bbox.width  || 640));
    const H = Math.max(200, Math.floor(bbox.height || 280));
    if (this.svg) this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const PL = 48, PR = 16, PT = 12, PB = 28;
    const innerW = W - PL - PR, innerH = H - PT - PB;

    // === Flags -> X-Bereich erweitern (immer) + Lookup fuer Tooltip ===
    let flagTs = [];
    if (metric === "weight") {
      this.flagsByDate = new Map();
      this.hasFlagsForDate = () => false;
    } else {
      const dayFlagsTmp = new Map(); // date -> { training:bool, badCount:int, seen:{} }
      const flagsByDate = new Map(); // date -> detailed flags for tooltip
      for (const e of data) {
        if (!e?.date) continue;
        let rec = dayFlagsTmp.get(e.date);
        if (!rec) {
          rec = {
            training: false,
            badCount: 0,
            seen: { water:false, salt:false, protein:false, sick:false, meds:false },
          };
          dayFlagsTmp.set(e.date, rec);
        }
        if (e.training) rec.training = true;
        const meds = !!(e.valsartan_missed || e.forxiga_missed || e.nsar_taken);
        const flags = {
          water: !!e.low_intake,
          salt:  !!e.salt_high,
          protein: !!e.protein_high90,
          sick:  !!e.sick,
          meds,
        };
        for (const k of Object.keys(flags)) {
          if (flags[k] && !rec.seen[k]) { rec.seen[k] = true; rec.badCount++; }
        }

        // Tooltip-Detailflags sammeln
        let f = flagsByDate.get(e.date);
        if (!f) f = { training:false, sick:false, low_intake:false, salt_high:false, protein_high90:false, valsartan_missed:false, forxiga_missed:false, nsar_taken:false, meds:false };
        f.training = f.training || !!e.training;
        f.sick = f.sick || !!e.sick;
        f.low_intake = f.low_intake || !!e.low_intake;
        f.salt_high = f.salt_high || !!e.salt_high;
        f.protein_high90 = f.protein_high90 || !!e.protein_high90;
        f.valsartan_missed = f.valsartan_missed || !!e.valsartan_missed;
        f.forxiga_missed   = f.forxiga_missed   || !!e.forxiga_missed;
        f.nsar_taken       = f.nsar_taken       || !!e.nsar_taken;
        f.meds = f.meds || meds;
        flagsByDate.set(e.date, f);
      }
      flagTs = [...dayFlagsTmp.keys()].map(d => Date.parse(d + "T00:00:00Z"));
      this.flagsByDate = flagsByDate;
      this.hasFlagsForDate = (dayIso) => {
        if (!dayIso || !this.flagsByDate) return false;
        const f = this.flagsByDate.get(dayIso);
        if (!f) return false;
        return !!(f.training || f.sick || f.low_intake || f.salt_high || f.protein_high90 || f.valsartan_missed || f.forxiga_missed || f.nsar_taken || f.meds);
      };
    }

    // Skalen
    const xVals = X.filter(t => Number.isFinite(t));
    let xmin = Math.min(...xVals);
    let xmax = Math.max(...xVals);

    if (!Number.isFinite(xmin) || !Number.isFinite(xmax)) {
      // Fallback
      xmin = Date.now() - 7 * 864e5;
      xmax = Date.now();
    }

    // Union mit Flag-Tagen (immer)
    if (flagTs.length) {
      xmin = Math.min(xmin, Math.min(...flagTs));
      xmax = Math.max(xmax, Math.max(...flagTs));
    }

    // Padding (2%)
    const xPad = xmax > xmin ? (xmax - xmin) * 0.02 : 0;
    xmin -= xPad; xmax += xPad;

    const lineVals = series.flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
    const barVals  = metric === "weight"
      ? []
      : barSeries.flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
    let allY = [...lineVals, ...barVals];
    if (metric === "weight") {
      const weightValsOnly = series
        .filter(s => s.key === "body-weight" || s.key === "body-waist")
        .flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
      allY = weightValsOnly.length ? weightValsOnly : [75, 110];
    }
    if (!allY.length) allY = [0];
    let yminRaw = Math.min(...allY);
    let ymaxRaw = Math.max(...allY);
    const ensureSpan = (min, max, minSpan) => {
      if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
      if ((max - min) < minSpan) {
        const mid = (max + min) / 2;
        return [mid - minSpan / 2, mid + minSpan / 2];
      }
      return [min, max];
    };
    let yPad = 1;
    if (metric === "weight") {
      const baseMin = 75;
      const baseMax = 110;
      const belowBase = yminRaw < baseMin;
      const aboveBase = ymaxRaw > baseMax;
      if (!belowBase && !aboveBase) {
        yminRaw = baseMin;
        ymaxRaw = baseMax;
      } else {
        yminRaw = belowBase ? Math.min(yminRaw, baseMin) : baseMin;
        ymaxRaw = aboveBase ? Math.max(ymaxRaw, baseMax) : baseMax;
        [yminRaw, ymaxRaw] = ensureSpan(yminRaw, ymaxRaw, 6);
      }
      yPad = Math.max((ymaxRaw - yminRaw) * 0.08, 0.5);
    } else {
      [yminRaw, ymaxRaw] = ensureSpan(yminRaw, ymaxRaw, 2);
      yPad = Math.max((ymaxRaw - yminRaw) * 0.08, 1);
    }
    const y0 = yminRaw - yPad;
    const y1 = ymaxRaw + yPad;

    const x = (t) => PL + ((t - xmin) / Math.max(1, xmax - xmin)) * innerW;
    const y = (v) => PT + (1 - (v - y0) / Math.max(1, y1 - y0)) * innerH;

    const line = (x1,y1_,x2,y2,stroke,dash="") =>
      `<line x1="${x1}" y1="${y1_}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1" ${dash ? `stroke-dasharray="${dash}"` : ""} />`;
    const text = (tx,ty,str,anchor="end") =>
      `<text x="${tx}" y="${ty}" fill="#9aa3af" font-size="11" text-anchor="${anchor}">${esc(str)}</text>`;

    // Zielbereiche (BP)
    if (this.svg) {
    }
    if (this.svg && metric === "bp") {
      const band = (min, max, cls) => {
        const top = Math.min(y(min), y(max));
        const height = Math.abs(y(max) - y(min));
        return `<rect class="goal-band ${cls}" x="${PL}" y="${top.toFixed(1)}" width="${innerW.toFixed(1)}" height="${height.toFixed(1)}" />`;
      };
      const goalLayers =
        band(110, 130, "goal-sys") +
        band(70, 85, "goal-dia");
      this.svg.insertAdjacentHTML("beforeend", goalLayers);
    }

    // Grid + Labels
    let grid = "";
    const ticks = 9;
    for (let i=0; i<=ticks; i++) {
      const vv = y0 + (i * (y1 - y0)) / ticks;
      const yy = y(vv);
      grid += line(PL, yy, W-PR, yy, "#2a3140");
      grid += text(PL - 6, yy + 4, Math.round(vv).toString());
    }
    // vertikale Wochenlinien + Datum
    const week = 7 * 24 * 3600 * 1000;
    let start = xmin - (xmin % week) + week;
    for (let t = start; t < xmax; t += week) {
      const xx = x(t);
      grid += line(xx, PT, xx, H - PB, "#1b1f28", "3 3");
      const d = new Date(t);
      const lbl = `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.`;
      grid += text(xx, H - 8, lbl, "middle");
    }
    // Achsen
    grid += line(PL, PT, PL, H - PB, "#2b2f3a");
    grid += line(PL, H - PB, W - PR, H - PB, "#2b2f3a");

    // Schwellenlinien (BP)
    if (metric === "bp") {
      const ySys = y(TH_SYS);
      const yDia = y(TH_DIA);
      grid += line(PL, ySys, W - PR, ySys, "#ef4444", "6 4");
      grid += line(PL, yDia, W - PR, yDia, "#ef4444", "6 4");
grid += text(W - PR - 2, ySys + 4, "Sys 130", "end");
grid += text(W - PR - 2, yDia  + 4, "Dia 90",  "end");
    }

    if (this.svg) this.svg.insertAdjacentHTML("beforeend", grid);

    // === Flags Overlay (nur fuer BP) ===
    if (this.svg && metric !== "weight") {
      const dayFlags = new Map(); // date -> { training:bool, badCount:int, seen:{} }
      for (const e of data) {
        if (!e?.date) continue;
        let rec = dayFlags.get(e.date);
        if (!rec) {
          rec = { training:false, badCount:0, seen:{ water:false, salt:false, protein:false, sick:false, meds:false } };
          dayFlags.set(e.date, rec);
        }
        if (e.training) rec.training = true;
        const meds = !!(e.valsartan_missed || e.forxiga_missed || e.nsar_taken);
        const flags = {
          water: !!e.low_intake, salt: !!e.salt_high, protein: !!e.protein_high90, sick: !!e.sick, meds
        };
        for (const k of Object.keys(flags)) {
          if (flags[k] && !rec.seen[k]) { rec.seen[k] = true; rec.badCount++; }
        }
      }

      const toDayTsLocal = (iso) => Date.parse(iso + "T00:00:00Z");
      const flaggedDays = [...dayFlags.keys()]
        .filter(d => {
          const r = dayFlags.get(d);
          return r && (r.training || r.badCount > 0);
        })
        .sort();

      if (flaggedDays.length) {
        const g = document.createElementNS("http://www.w3.org/2000/svg","g");
        g.setAttribute("class","flags");
        g.setAttribute("pointer-events","auto");
        g.setAttribute("aria-hidden","true");

        const uniqDays = [...new Set([...flaggedDays.map(d => toDayTsLocal(d)), ...X.filter(Boolean)])].sort((a,b)=>a-b);
        const dayXs = uniqDays.map(t => x(t));
        const minStep = dayXs.length > 1 ? Math.min(...dayXs.slice(1).map((v,i)=>v - dayXs[i])) : innerW;
        const bandW   = Math.max(10, Math.floor(minStep * 0.45));
        const yBottom = PT + innerH;
        const slotH   = innerH / 6; // 1 Training + bis zu 5 Bad

        for (const d of flaggedDays) {
          const t = toDayTsLocal(d);
          const cx = x(t), xLeft = Math.round(cx - bandW/2);
          const rec = dayFlags.get(d);
          let used = 0;

          // Training (gruen)
          if (rec.training) {
            const yTop = Math.round(yBottom - (used + 1) * slotH);
            const r = document.createElementNS("http://www.w3.org/2000/svg","rect");
            r.setAttribute("x", xLeft); r.setAttribute("y", yTop);
            r.setAttribute("width", bandW); r.setAttribute("height", Math.ceil(slotH));
            r.setAttribute("fill", "#10b981"); r.setAttribute("fill-opacity","0.22");
            r.setAttribute("stroke", "#fff");  r.setAttribute("stroke-opacity","0.06");
            r.setAttribute("shape-rendering","crispEdges");
            g.appendChild(r);
            used++;
          }
          // Bad-Flags (rot gestapelt)
          for (let i=0; i<rec.badCount; i++) {
            const yTop = Math.round(yBottom - (used + 1) * slotH);
            const r = document.createElementNS("http://www.w3.org/2000/svg","rect");
            r.setAttribute("x", xLeft); r.setAttribute("y", yTop);
            r.setAttribute("width", bandW); r.setAttribute("height", Math.ceil(slotH));
            r.setAttribute("fill", "#ef4444"); r.setAttribute("fill-opacity","0.18");
            r.setAttribute("stroke", "#fff");  r.setAttribute("stroke-opacity","0.06");
            r.setAttribute("shape-rendering","crispEdges");
            g.appendChild(r);
            used++;
          }

          // Interaktiver Hit-Bereich pro Tag ueber alle Slots
          const totalSlots = used;
          if (totalSlots > 0) {
            const yTopAll = Math.round(yBottom - totalSlots * slotH);
            const hit = document.createElementNS("http://www.w3.org/2000/svg","rect");
            hit.setAttribute("x", xLeft); hit.setAttribute("y", yTopAll);
            hit.setAttribute("width", bandW); hit.setAttribute("height", Math.ceil(totalSlots * slotH));
            hit.setAttribute("fill", "transparent");
            hit.setAttribute("pointer-events", "all");
            hit.setAttribute("class", "flag-hit chart-hit");
            hit.setAttribute("data-date", d);
            hit.setAttribute("role", "button");
            hit.setAttribute("tabindex", "0");
            // ARIA-Label aus Flags ableiten
            try {
              const f = this.flagsByDate?.get?.(d);
              if (f) {
                const items = [];
                if (f.training) items.push("Training");
                if (f.sick) items.push("Krank");
                if (f.low_intake) items.push("< 2 L Wasser");
                if (f.salt_high) items.push("> 5 g Salz");
                if (f.protein_high90) items.push("Protein  90 g");
                if (f.valsartan_missed) items.push("Valsartan vergessen");
                if (f.forxiga_missed) items.push("Forxiga vergessen");
                if (f.nsar_taken) items.push("NSAR genommen");
                if (!f.valsartan_missed && !f.forxiga_missed && !f.nsar_taken && f.meds) items.push("Medikamente");
                if (items.length) hit.setAttribute("aria-label", `Flags: ${items.join(", ")}`);
              }
            } catch(_){}
            g.appendChild(hit);
          }
        }
        this.svg.appendChild(g); // hinter den Linien/Punkten
      }
    }

    // Koerper: Kompositionsbalken (Muskel/Fett) als hinterer Layer
    if (metric === "weight" && this.SHOW_BODY_COMP_BARS && this.svg) {
      const baseLineValue = 75;
      const baseline = y(baseLineValue);
      const muscleSeries = barSeries[0] || { values: [] };
      const fatSeries    = barSeries[1] || { values: [] };
      const entries = data.map((entry, idx) => {
        const ts = X[idx];
        if (!Number.isFinite(ts)) return null;
        const muscle = muscleSeries.values[idx];
        const fat = fatSeries.values[idx];
        if (muscle == null && fat == null) return null;
        return { ts, muscle, fat, src: data[idx], idx };
      }).filter(Boolean);

      if (entries.length) {
        const uniqTs = [...new Set(entries.map(e => e.ts))].sort((a,b)=>a-b);
        const dayXs = uniqTs.map(t => x(t));
        const baseStep = dayXs.length > 1
          ? Math.min(...dayXs.slice(1).map((v,i) => v - dayXs[i]))
          : innerW / Math.max(1, uniqTs.length);
        const groupWidth = Math.max(12, Math.min(36, Math.floor(baseStep * 0.5)));
        const gap = Math.max(2, Math.floor(groupWidth * 0.12));
        const barWidth = Math.max(4, Math.floor((groupWidth - gap) / 2));

        if (barWidth > 0 && Number.isFinite(baseline)) {
          const formatKg = (val) => {
            if (val == null) return null;
            const num = Number(val);
            if (!Number.isFinite(num)) return null;
            return (typeof fmtNum === "function" ? fmtNum(num, 1) : num.toFixed(1));
          };
          let barsSvg = '<g class="body-bars" aria-hidden="true">';
          let hitsSvg = '<g class="body-bar-hits">';
          for (const { ts, muscle, fat, src } of entries) {
            const center = x(ts);
            const start = center - groupWidth / 2;
            const raw = src || {};
            const dayIso = raw?.date || (raw?.dateTime ? raw.dateTime.slice(0, 10) : new Date(ts).toISOString().slice(0, 10));
            const weightVal = formatKg(raw?.weight);
            const muscleNum = muscle != null ? Number(muscle) : null;
            const fatNum = fat != null ? Number(fat) : null;
            const hasMuscle = muscleNum != null && Number.isFinite(muscleNum);
            const hasFat = fatNum != null && Number.isFinite(fatNum);
            let muscleX = start;
            let fatX = start + barWidth + gap;
            if (hasMuscle && !hasFat) {
              muscleX = center - barWidth / 2;
            }
            if (!hasMuscle && hasFat) {
              fatX = center - barWidth / 2;
            }

            if (hasMuscle) {
              const yVal = y(baseLineValue + muscleNum);
              if (Number.isFinite(yVal)) {
                const h = Math.abs(baseline - yVal);
                if (h > 0.5) {
                  const top = Math.min(baseline, yVal);
                  barsSvg += `<rect class="body-bar" data-series="body-muscle" x="${muscleX.toFixed(1)}" y="${top.toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" fill="var(--chart-bar-muscle)" fill-opacity="0.55" stroke="none" pointer-events="none" />`;
                  let hitHeight = Math.max(h, 14);
                  let hitTop = Math.min(top, baseline - hitHeight);
                  if (hitTop < PT) {
                    hitTop = PT;
                    hitHeight = Math.max(4, baseline - hitTop);
                  }
                  if (hitHeight > 0.5) {
                    const muscleVal = formatKg(muscleNum);
                    const parts = [];
                    if (muscleVal) parts.push(`Muskelmasse: ${muscleVal} kg`);
                    if (weightVal) parts.push(`Gewicht: ${weightVal} kg`);
                    const note = parts.join('\n');
                    const aria = `${dayIso || ''} Muskel ${muscleVal ? muscleVal + ' kg' : ''}`.trim();
                    hitsSvg += `<rect class="body-hit chart-hit" x="${muscleX.toFixed(1)}" y="${hitTop.toFixed(1)}" width="${barWidth}" height="${hitHeight.toFixed(1)}" fill="transparent" pointer-events="all"
                      data-series="body-muscle" data-date="${esc(dayIso || '')}" data-ctx="Muskel" data-note="${esc(note)}"
                      aria-label="${esc(aria)}" title="${esc(aria)}" role="button" tabindex="0"></rect>`;
                  }
                }
              }
            }

            if (hasFat) {
              const yVal = y(baseLineValue + fatNum);
              if (Number.isFinite(yVal)) {
                const h = Math.abs(baseline - yVal);
                if (h > 0.5) {
                  const top = Math.min(baseline, yVal);
                  barsSvg += `<rect class="body-bar" data-series="body-fat" x="${fatX.toFixed(1)}" y="${top.toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" fill="var(--chart-bar-fat)" fill-opacity="0.55" stroke="none" pointer-events="none" />`;
                  let hitHeight = Math.max(h, 14);
                  let hitTop = Math.min(top, baseline - hitHeight);
                  if (hitTop < PT) {
                    hitTop = PT;
                    hitHeight = Math.max(4, baseline - hitTop);
                  }
                  if (hitHeight > 0.5) {
                    const fatVal = formatKg(fatNum);
                    const parts = [];
                    if (fatVal) parts.push(`Fettmasse: ${fatVal} kg`);
                    if (weightVal) parts.push(`Gewicht: ${weightVal} kg`);
                    const note = parts.join('\n');
                    const aria = `${dayIso || ''} Fett ${fatVal ? fatVal + ' kg' : ''}`.trim();
                    hitsSvg += `<rect class="body-hit chart-hit" x="${fatX.toFixed(1)}" y="${hitTop.toFixed(1)}" width="${barWidth}" height="${hitHeight.toFixed(1)}" fill="transparent" pointer-events="all"
                      data-series="body-fat" data-date="${esc(dayIso || '')}" data-ctx="Fett" data-note="${esc(note)}"
                      aria-label="${esc(aria)}" title="${esc(aria)}" role="button" tabindex="0"></rect>`;
                  }
                }
              }
            }
          }
          barsSvg += '</g>';
          hitsSvg += '</g>';
          this.svg.insertAdjacentHTML("beforeend", barsSvg);
          pendingBodyHitsSvg = hitsSvg;
        }
      }
    }

    // Linien + Punkte
const isFiniteTs = (t) => Number.isFinite(t);

const mkPath = (seriesItem) => {
  const { values = [], color = "#fff", key } = seriesItem || {};
  let d = "";
  values.forEach((v,i) => {
    if (v == null || !isFiniteTs(X[i])) return; // statt !X[i]
    d += (d === "" ? "M" : "L") + `${x(X[i]).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const seriesAttr = key ? ` data-series="${esc(key)}"` : "";
  return `<path${seriesAttr} d="${d}" fill="none" stroke="${color}" stroke-width="2.2" pointer-events="none" />`;
};

const mkDots = (seriesItem) => {
  const { values = [], color = "#fff", type, key } = seriesItem || {};
  const kind = (type === "sys" || type === "dia") ? type : "misc";
  let out = "";
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(X[i])) return;
    const cx = x(X[i]).toFixed(1);
    const cy = y(v).toFixed(1);

    // Tooltip-Infos (nur bei BP vorhanden)
    const m = (kind === "sys" || kind === "dia") ? (meta?.[i] || {}) : {};
    const date = (m.date || (data?.[i]?.date || ""));
    const ctx  = (m.ctx  || (kind === "misc" ? "Tag" : ""));
    const note = (m.note || "");
    const labelBase = (kind === "sys" || kind === "dia") ? `${kind.toUpperCase()} ${v}` : `${v}`;
    const aria = `${date} ${ctx} ${labelBase}`.trim();

    const seriesAttr = key ? ` data-series="${esc(key)}"` : "";
    out += `<circle class="pt" cx="${cx}" cy="${cy}" r="2.6" fill="${color}"
                data-kind="${esc(kind)}" data-val="${v}"
                data-date="${esc(date)}" data-ctx="${esc(ctx)}"
               data-note="${esc(note)}"${seriesAttr} tabindex="0" role="button" aria-label="${esc(aria)}" title="${esc(aria)}"
               stroke="rgba(0,0,0,0)" stroke-width="12" pointer-events="stroke" />`;
  });
  return out;
};

const mkAlertDots = (seriesItem) => {
  if (metric !== "bp") return "";
  const isSys = seriesItem.type === "sys";
  const thr   = isSys ? TH_SYS : TH_DIA;
  const kind  = isSys ? "sys" : "dia";
  let out = "";
  seriesItem.values.forEach((v, i) => {
    if (v == null || !isFiniteTs(X[i])) return;
    if (v > thr) {
      const cx = x(X[i]).toFixed(1), cy = y(v).toFixed(1);
      const m = meta?.[i] || {};
      const seriesAttr = seriesItem?.key ? ` data-series="${esc(seriesItem.key)}"` : "";
      out += `<circle class="pt" cx="${cx}" cy="${cy}" r="5.2" fill="#ef4444" stroke="#000" stroke-width="0.8"
               data-kind="${kind}" data-val="${v}"
               data-date="${esc(m.date || "")}" data-ctx="${esc(m.ctx || "")}"
               data-note="${esc(m.note || "")}"${seriesAttr} />`;
    }
  });
  return out;
};

    // Zeichnen
    series.forEach((s) => {
      if (!this.svg) return;
      this.svg.insertAdjacentHTML("beforeend", mkPath(s));
      this.svg.insertAdjacentHTML("beforeend", mkDots(s));
      if (metric === "bp") {
        this.svg.insertAdjacentHTML("beforeend", mkAlertDots(s));
      }
      // Legende
      if (this.legend) {
        const wrap = document.createElement("span");
        wrap.style.display = "inline-flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "6px";
        if (s.key) wrap.setAttribute("data-series", s.key);
        const dot = Object.assign(document.createElement("span"), { className: "dot" });
        dot.style.background = s.color;
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.borderRadius = "50%";
        const label = document.createElement("span");
        label.textContent = s.name;
        wrap.append(dot, label);
        this.legend.appendChild(wrap);
      }
    });

    if (pendingBodyHitsSvg && this.svg) {
      this.svg.insertAdjacentHTML("beforeend", pendingBodyHitsSvg);
    }

    if (metric === "weight" && this.legend) {
      barSeries.forEach((s) => {
        if (!s.values.some(v => v != null)) return;
        const wrap = document.createElement("span");
        wrap.style.display = "inline-flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "6px";
        if (s.key) wrap.setAttribute("data-series", s.key);
        const dot = Object.assign(document.createElement("span"), { className: "dot" });
        dot.style.background = s.color;
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.borderRadius = "50%";
        const label = document.createElement("span");
        label.textContent = s.name;
        wrap.append(dot, label);
        this.legend.appendChild(wrap);
      });
    }

    if (this.tipSticky) { this.tipSticky = false; this.hideTip(); }

    const sPerf = (perfStats.add?.("drawChart", (performance.now?.() ?? Date.now()) - t0), perfStats.snap?.("drawChart")) || {p50:0,p90:0,p95:0,p99:0,count:0};
    if (sPerf && typeof sPerf.count === 'number' && (sPerf.count % 25 === 0)) {
      diag.add?.(`[perf] drawChart p50=${sPerf.p50|0}ms p90=${sPerf.p90|0}ms p95=${sPerf.p95|0}ms p99=${sPerf.p99|0}ms (n=${sPerf.count})`);
    }
  },
};

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

/** MODULE: CAPTURE (Intake)
 * intent: Panel hotkeys, save/reset flows und flag handling (Fortsetzung)
 * contracts: interagiert mit DATA ACCESS.saveBlock, UI.requestUiRefresh, AUTH Guards
 * exports: setProteinHigh, setTraining, setLowIntake, setSaltHigh
 * notes: Fortsetzung fuer Panel-Operationen (Hotkeys/Speichern)
 */

/* ===== Save flows ===== */
// Replace sugar toggle with protein (runtime migration for legacy layouts)
// Migration entfernt: Markup nutzt direkt #proteinHighToggle
// SUBMODULE: captureFlagToggles @internal - manages capture flag buttons and state cache
function setProteinHigh(on){
  proteinHigh = !!on;
  setToggle($("#proteinHighToggle"), proteinHigh, "&#x1F969; Protein >= 90 g (aktiv)", "&#x1F969; Protein >= 90 g");
}
let trainingActive=false, lowIntakeActive=false, sickActive=false, valsartanMissed=false, forxigaMissed=false, nsarTaken=false,
saltHigh=false, proteinHigh=false;
function setToggle(el, on, activeText, baseText){
el = el || null;
if (!el) return;
el.classList.toggle("active", !!on);
el.setAttribute("aria-pressed", on ? "true" : "false");
el.innerHTML = on ? activeText : baseText;
}
function setTraining(on){ trainingActive=!!on; setToggle($("#trainingToggle"), trainingActive, "&#x1F3CB;&#xFE0F; Training heute (aktiv)", "&#x1F3CB;&#xFE0F; Training heute"); }
function setLowIntake(on){ lowIntakeActive=!!on; setToggle($("#lowIntakeToggle"), lowIntakeActive, "&#x1F4A7; < 2 L (aktiv)", "&#x1F4A7; < 2 L getrunken"); }
function setSaltHigh(on){ saltHigh = !!on; setToggle($("#saltHighToggle"), saltHigh, "&#x1F9C2; > 5 g Salz (aktiv)", "&#x1F9C2; > 5 g Salz"); }
// Kommentar-Pflicht fuer BP: Grenzwerte markieren
/** END MODULE */

/** MODULE: BP (Blood Pressure)
 * intent: BP-spezifische Validierungen, Kontextumschaltung und Panel-Reset
 * contracts: arbeitet mit CAPTURE UI, DATA ACCESS.saveBlock, CHARTS-Schwellenwerten
 * exports: requiresBpComment, updateBpCommentWarnings, resetBpPanel
 * notes: UI-Validierung strikt halten; keine DOM-Umbauten
 */
// SUBMODULE: requiresBpComment @internal - enforces comment when vitals exceed thresholds
function requiresBpComment(which){
  const sys = Number($(bpSelector('sys', which)).value);
  const dia = Number($(`#dia${which}`).value);
  const el = document.getElementById(which === "M" ? "bpCommentM" : "bpCommentA");
  const comment = (el?.value || "").trim();
  return ((sys > 130) || (dia > 90)) && !comment;
}
// SUBMODULE: updateBpCommentWarnings @internal - highlights comment fields requiring input
function updateBpCommentWarnings(){
  ['M','A'].forEach(which => {
    const el = document.getElementById(which === "M" ? "bpCommentM" : "bpCommentA");
    if (!el) return;
    const needs = requiresBpComment(which);
    el.style.outline = needs ? "2px solid var(--danger)" : "";
    if (needs) el.setAttribute("aria-invalid","true");
    else el.removeAttribute("aria-invalid");
  });
}

/* === Panel Reset Helpers (V1.5.7) === */
// SUBMODULE: bpFieldId @internal - maps BP field ids for capture contexts
function bpFieldId(base, ctx){
  if (base === 'sys' && ctx === 'M') return 'captureAmount';
  return base + ctx;
}

// SUBMODULE: bpSelector @internal - resolves selector for BP inputs
function bpSelector(base, ctx){
  return base === 'sys' && ctx === 'M' ? '#captureAmount' : `#${base}${ctx}`;
}

// SUBMODULE: resetBpPanel @internal - clears BP inputs per context
function resetBpPanel(which, opts = {}) {
  const { focus = true } = opts;
  const ctx = which === 'A' ? 'A' : 'M';
  ['sys','dia','pulse','bpComment'].forEach(id => {
    const el = document.getElementById(bpFieldId(id, ctx));
    if (el) el.value = '';
  });
  try { updateBpCommentWarnings?.(); } catch(_){}
  if (focus) {
    const target = document.getElementById(bpFieldId('sys', ctx));
    if (target) target.focus();
  }
}
/** END MODULE */

/** MODULE: CAPTURE (Intake)
 * intent: Panel Resets, Flag-Hooks und Tastatur-Shortcuts (Fortsetzung)
 * contracts: verbindet BP-/BODY-Panels, nutzt CAPTURE State Toggles
 * exports: resetBodyPanel, resetFlagsPanel, resetCapturePanels, addCapturePanelKeys, setSick, setValsartanMiss, setForxigaMiss, setNsar
 * notes: Fortsetzung fuer Capture-Hilfsfunktionen (Resets/Toggles)
 */
// SUBMODULE: resetBodyPanel @internal - leert Body-Eingaben und stellt optional den Fokus wieder her
function resetBodyPanel(opts = {}) {
  const { focus = true } = opts;
  const weightEl = document.getElementById('weightDay');
  const waistEl = document.getElementById('input-waist-cm');
  const fatEl = document.getElementById('fatPctDay');
  const muscleEl = document.getElementById('musclePctDay');
  if (weightEl) weightEl.value = '';
  if (waistEl) waistEl.value = '';
  if (fatEl) { fatEl.value = ''; clearFieldError(fatEl); }
  if (muscleEl) { muscleEl.value = ''; clearFieldError(muscleEl); }
  if (focus && weightEl) weightEl.focus();
}
// SUBMODULE: resetFlagsPanel @internal - setzt Flag-Toggles und Kommentar auf Ausgangszustand
function resetFlagsPanel(opts = {}) {
  const { focus = true } = opts;
  try {
    setTraining(false);
    setLowIntake(false);
    setSick(false);
    setValsartanMiss(false);
    setForxigaMiss(false);
    setNsar(false);
    setSaltHigh(false);
    if (typeof setProteinHigh === 'function') setProteinHigh(false);
  } catch(_){ }
  const commentEl = document.getElementById('flagsComment');
  if (commentEl) commentEl.value = '';
  if (focus && commentEl) commentEl.focus();
}
// SUBMODULE: resetCapturePanels @internal - kombiniert Panel-Resets (BP/Body/Flags) und setzt Kontext zur├â┬╝ck
function resetCapturePanels(opts = {}) {
  const { focus = true } = opts;
  resetBpPanel('M', { focus: false });
  resetBpPanel('A', { focus: false });
  resetBodyPanel({ focus: false });
  resetFlagsPanel({ focus: false });
  const ctxSel = document.getElementById('bpContextSel');
  if (ctxSel) ctxSel.value = 'M';
  document.querySelectorAll('.bp-pane').forEach(pane => {
    pane.classList.toggle('active', pane.dataset.context === 'M');
  });
  try { updateBpCommentWarnings?.(); } catch(_){ }
  if (focus) {
    const first = document.getElementById('captureAmount');
    if (first) first.focus();
  }
}
// SUBMODULE: addCapturePanelKeys @internal - registriert Tastaturk├â┬╝rzel fuer Save-/Reset-Flows
function addCapturePanelKeys(){
  const bind = (selectors, onEnter, onEsc) => {
    document.querySelectorAll(selectors).forEach(el => {
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); }
        if (e.key === 'Escape') { e.preventDefault(); onEsc?.(); }
      });
    });
  };
  bind('#captureAmount, #diaM, #pulseM, #bpCommentM', () => document.getElementById('saveBpPanelBtn')?.click(), () => resetBpPanel('M'));
  bind('#sysA, #diaA, #pulseA, #bpCommentA', () => document.getElementById('saveBpPanelBtn')?.click(), () => resetBpPanel('A'));
  bind('#weightDay, #input-waist-cm, #fatPctDay, #musclePctDay', () => document.getElementById('saveBodyPanelBtn')?.click(), () => resetBodyPanel());
  bind('#flagsComment', () => document.getElementById('saveFlagsPanelBtn')?.click(), () => resetFlagsPanel());
}
// SUBMODULE: setSick @internal - setzt Krank-Flag und sperrt Forxiga-Toggle bei Bedarf
function setSick(on){
sickActive=!!on; setToggle($("#sickToggle"), sickActive, "&#x1F912; Krank (Forxiga pausiert) (aktiv)", "&#x1F912; Krank (Forxiga pausiert)");
if(sickActive){ setForxigaMiss(true); $("#forxigaMissToggle").disabled=true; $("#forxigaMissToggle").style.opacity=0.6; }
else { $("#forxigaMissToggle").disabled=false; $("#forxigaMissToggle").style.opacity=1; }
}
// SUBMODULE: setValsartanMiss @internal - pflegt Valsartan-vergessen Status und UI-Text
function setValsartanMiss(on){ valsartanMissed=!!on; setToggle($("#valsartanMissToggle"), valsartanMissed, "&#x1F48A; Valsartan vergessen (aktiv)", "&#x1F48A; Valsartan vergessen"); }
// SUBMODULE: setForxigaMiss @internal - pflegt Forxiga-vergessen Status inkl. Label
function setForxigaMiss(on){ forxigaMissed=!!on; setToggle($("#forxigaMissToggle"), forxigaMissed, "&#x23F0; Forxiga vergessen (aktiv)", "&#x23F0; Forxiga vergessen"); }
// SUBMODULE: setNsar @internal - pflegt NSAR-Flag und Screenreader-Label
function setNsar(on){ nsarTaken=!!on; setToggle($("#nsarToggle"), nsarTaken, "&#x1F489; NSAR genommen (aktiv)", "&#x1F489; NSAR genommen"); }

/** END MODULE */

/** MODULE: BP (Blood Pressure)
 * intent: verarbeitet Blutdruck-Erfassung, Validation und Persistierung
 * contracts: interagiert mit DATA ACCESS.addEntry/syncWebhook, CAPTURE Toggles, UI-Warnungen
 * exports: saveBlock, appendNote, allocateNoteTimestamp
 * notes: Validierungslogik unveraendert dokumentieren; nur Kommentare
 */
// SUBMODULE: blockHasData @internal - detects if BP panel has any input before saving
function blockHasData(which){
  const getVal = (sel) => document.querySelector(sel)?.value?.trim();
  const sys = getVal(bpSelector('sys', which));
  const dia = getVal(`#dia${which}`);
  const pulse = getVal(`#pulse${which}`);
  const commentEl = document.getElementById(which === "M" ? "bpCommentM" : "bpCommentA");
  const comment = (commentEl?.value || "").trim();
  return !!(sys || dia || pulse || comment);
}
// SUBMODULE: saveBlock @internal - persists BP measurements and optional comments
async function saveBlock(contextLabel, which, includeWeight=false, force=false){
const date = $("#date").value || todayStr();
const time = which === 'M' ? '07:00' : '22:00';

const sys   = $(bpSelector('sys', which)).value   ? toNumDE($(bpSelector('sys', which)).value)   : null;
const dia   = $(`#dia${which}`).value   ? toNumDE($(`#dia${which}`).value)   : null;
const pulse = $(`#pulse${which}`).value ? toNumDE($(`#pulse${which}`).value) : null;

const commentEl = document.getElementById(which === 'M' ? 'bpCommentM' : 'bpCommentA');
const comment = (commentEl?.value || '').trim();

const hasAny = (sys != null) || (dia != null) || (pulse != null);
const hasComment = comment.length > 0;

if (!force && !hasAny && !hasComment) return false;

if (hasAny){
  if ((sys != null && dia == null) || (dia != null && sys == null)){
    uiError('Bitte beide Blutdruck-Werte (Sys und Dia) eingeben.');
    return false;
  }
  if (pulse != null && (sys == null || dia == null)){
    uiError('Puls kann nur mit Sys und Dia zusammen gespeichert werden.');
    return false;
  }

  const currentISO = new Date(date + "T" + time).toISOString();
  const ts = new Date(date + "T" + time).getTime();

  const entry = {
    date, time, dateTime: currentISO, ts,
    context: contextLabel,
    sys, dia, pulse,
    weight: null,
    map: (sys!=null && dia!=null) ? calcMAP(sys, dia) : null,
    notes: '',
    training: false,
    low_intake: false,
    sick: false,
    valsartan_missed: false,
    forxiga_missed: false,
    nsar_taken: false,
    salt_high: false,
    protein_high90: false
  };

  const localId = await addEntry(entry);
  await syncWebhook(entry, localId);
}

if (hasComment){
  try {
    await appendNote(date, which === 'M' ? '[Morgens] ' : '[Abends] ', comment);
    if (commentEl) commentEl.value = '';
    updateBpCommentWarnings();
  } catch(err) {
    diag.add?.('BP-Kommentar Fehler: ' + (err?.message || err));
  }
}

return hasAny || hasComment;
}

// SUBMODULE: baseEntry @internal - composes canonical intake/bp entry skeleton
function baseEntry(date, time, contextLabel){
const iso = new Date(date + "T" + time).toISOString();
const ts = new Date(date + "T" + time).getTime();
return {
date, time, dateTime: iso, ts,
context: contextLabel, 
sys: null, dia: null, pulse: null, weight: null, map: null,
notes: ($("#notesDay")?.value || "").trim(),
training: trainingActive,
low_intake: lowIntakeActive,
sick: sickActive,
valsartan_missed: valsartanMissed,
forxiga_missed: forxigaMissed,
nsar_taken: nsarTaken,
salt_high: saltHigh,
protein_high90: proteinHigh
};
}

// SUBMODULE: appendNote @internal - stores supplemental note entries for BP/flags
async function appendNote(date, prefix, text){
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  const stamp = allocateNoteTimestamp(date);
  const entry = baseEntry(date, stamp.time, 'Tag');
  entry.dateTime = stamp.iso;
  entry.ts = stamp.ts;
  entry.notes = prefix + trimmed;
  entry.training = false;
  entry.low_intake = false;
  entry.sick = false;
  entry.valsartan_missed = false;
  entry.forxiga_missed = false;
  entry.nsar_taken = false;
  entry.salt_high = false;
  entry.protein_high90 = false;
  const localId = await addEntry(entry);
  await syncWebhook(entry, localId);
}

// SUBMODULE: allocateNoteTimestamp @internal - generates staggered timestamps for notes
function allocateNoteTimestamp(date){
  const base = new Date(date + "T22:30:00");
  const now = Date.now();
  const minuteOffset = now % 60;
  const secondOffset = Math.floor(now / 1000) % 60;
  base.setMinutes(base.getMinutes() + minuteOffset);
  base.setSeconds(base.getSeconds() + secondOffset);
  const iso = base.toISOString();
  return { iso, ts: base.getTime(), time: iso.slice(11,16) };
}

// SUBMODULE: saveFlagsCommentNote @internal - persists capture flags note
async function saveFlagsCommentNote(date, text){
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  await appendNote(date, '[Flags] ', trimmed);
  return true;
}

/** END MODULE */

/** MODULE: BODY (Koerperwerte)
 * intent: verarbeitet Tageszusammenfassung, Flags und Body-Werte Validierung
 * contracts: nutzt DATA ACCESS.saveDaySummary/saveFlagsCommentNote, CAPTURE Toggles
 * exports: saveDaySummary, saveFlagsCommentNote
 * notes: Body- und Flag-Eintraege konsistent dokumentieren; nur Kommentare
 */
// SUBMODULE: saveDaySummary @internal - validates and saves body/flags daily summary
async function saveDaySummary(options = {}){
  const { includeBody = true, includeFlags = true, includeFlagsComment = true } = options;
  const date = $("#date")?.value || todayStr();
  const time = "12:00";

  const entry = baseEntry(date, time, "Tag");
  let validationFailed = false;

  const notesRaw = ($("#notesDay")?.value || "").trim();
  if (includeBody){
    entry.notes = notesRaw;
    const w = $("#weightDay")?.value?.trim();
    entry.weight = w ? Number((w||"").replace(',', '.')) : null;
    const waistRaw = $("#input-waist-cm")?.value?.trim();
    entry.waist_cm = waistRaw ? toNumDE(waistRaw) : null;

    const fatPctEl = document.getElementById('fatPctDay');
    const musclePctEl = document.getElementById('musclePctDay');
    const parsePct = (el, label) => {
      if (!el) return null;
      const raw = (el.value || '').trim();
      if (!raw){
        clearFieldError(el);
        return null;
      }
      const pct = toNumDE(raw);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100){
        setFieldError(el);
        uiError(`Bitte gueltigen Wert fuer ${label} (0-100 %) eingeben.`);
        if (!validationFailed) el.focus();
        validationFailed = true;
        return null;
      }
      clearFieldError(el);
      return pct;
    };

    const fatPct = parsePct(fatPctEl, 'Fett');
    const musclePct = parsePct(musclePctEl, 'Muskel');
    entry.fat_pct = fatPct;
    entry.muscle_pct = musclePct;
  } else {
    entry.notes = '';
    entry.weight = null;
    entry.waist_cm = null;
    entry.fat_pct = null;
    entry.muscle_pct = null;
    clearFieldError(document.getElementById('fatPctDay'));
    clearFieldError(document.getElementById('musclePctDay'));
  }

  if (validationFailed) return false;

  if (includeFlags){
    entry.training = trainingActive;
    entry.low_intake = lowIntakeActive;
  entry.sick = sickActive;
  entry.valsartan_missed = valsartanMissed;
  entry.forxiga_missed = forxigaMissed;
  entry.nsar_taken = nsarTaken;
  entry.salt_high = saltHigh;
  entry.protein_high90 = proteinHigh;
} else {
  entry.training = null;
  entry.low_intake = null;
  entry.sick = null;
  entry.valsartan_missed = null;
  entry.forxiga_missed = null;
  entry.nsar_taken = null;
  entry.salt_high = null;
  entry.protein_high90 = null;
}

  const flagsComment = includeFlagsComment ? ($("#flagsComment")?.value || "").trim() : "";
let saved = false;

const hasBodyContent = includeBody && ((entry.weight != null) || (entry.waist_cm != null) || !!entry.notes);
const hasFlagContent = includeFlags && !!(trainingActive || lowIntakeActive || sickActive ||
  valsartanMissed || forxigaMissed || nsarTaken ||
  saltHigh || proteinHigh);

if (hasBodyContent || hasFlagContent){
  const localId = await addEntry(entry);
  await syncWebhook(entry, localId);
  saved = true;
}

if (includeFlagsComment && flagsComment){
  const savedNote = await saveFlagsCommentNote(date, flagsComment);
  if (savedNote){
    const el = document.getElementById('flagsComment');
    if (el) el.value = '';
    diag.add('Flags-Kommentar gespeichert');
    saved = true;
  }
}

return saved;
}

/** END MODULE */


// SUBMODULE: deleteRemote @internal - deletes single health_event via REST endpoint
async function deleteRemote(remote_id){
  const url = await getConf("webhookUrl");
  if(!url || !remote_id) return {ok:false};
  const q = `${url}?id=eq.${encodeURIComponent(remote_id)}`;
  try{
    const res = await fetchWithAuth(headers => fetch(q, { method:"DELETE", headers }), { tag: 'remote:delete', maxAttempts: 2 });
    return {ok: res.ok, status: res.status};
  }catch(e){
    return {ok:false, status: e?.status ?? 0};
  }
}

// SUBMODULE: loadIntakeToday @internal - holt Tagesintake via REST health_events view
async function loadIntakeToday({ user_id, dayIso }){
  if (!user_id) return null;
  diag.add?.(`[capture] loadIntakeToday start uid=${maskUid(user_id)} day=${dayIso||''}`);
  const baseDay = /^\d{4}-\d{2}-\d{2}$/.test(String(dayIso || '')) ? dayIso : todayStr();

  const rows = await sbSelect({
    table: 'health_events',
    select: 'id,payload',
    filters: [
      ['user_id', `eq.${user_id}`],
      ['type', 'eq.intake'],
      ['day', `eq.${baseDay}`]
    ],
    order: 'ts.desc',
    limit: 1
  });
  const r = Array.isArray(rows) && rows.length ? rows[0] : null;
  const p = r?.payload || {};
  diag.add?.(`[capture] loadIntakeToday done id=${r?.id || 'null'} payload=${JSON.stringify(p)}`);
  return {
    id: r?.id ?? null,
    water_ml: Number(p.water_ml || 0),
    salt_g: Number(p.salt_g || 0),
    protein_g: Number(p.protein_g || 0)
  };
}

// SUBMODULE: saveIntakeTotals @public - legacy POST fallback wenn RPC fehlt
async function saveIntakeTotals({ dayIso, totals }){
  const url = await getConf("webhookUrl");
  const uid = await getUserId();
  if (!url || !uid) {
    const errMissing = new Error("saveIntakeTotals: missing config/auth");
    errMissing.status = 401;
    throw errMissing;
  }

  const dayIsoNorm = /^\d{4}-\d{2}-\d{2}$/.test(String(dayIso||"")) ? dayIso : todayStr();
  const ts = dayIsoToMidnightIso(dayIsoNorm) || new Date().toISOString();
  const payloadTotals = {
    water_ml: Number(totals?.water_ml || 0),
    salt_g: Number(totals?.salt_g || 0),
    protein_g: Number(totals?.protein_g || 0),
  };
  const payload = [{ ts, type: 'intake', payload: payloadTotals, user_id: uid }];

  diag.add?.('[capture] fetch start intake:post');
  const res = await fetchWithAuth(
    headers => fetch(url, { method:'POST', headers, body: JSON.stringify(payload) }),
    { tag: 'intake:post', maxAttempts: 2 }
  );

  if (res.ok) {
    return await res.json();
  }

  let details = '';
  try { const e = await res.clone().json(); details = e?.message || e?.details || ''; } catch{}

  if (!(res.status === 409 || /duplicate|unique/i.test(details))) {
    diag.add?.(`[intake] POST failed ${res.status} ${details||''}`);
    const errRes = new Error('intake-post-failed');
    errRes.status = res.status;
    errRes.details = details;
    throw errRes;
  }

  const patchUrl = `${url}?user_id=eq.${encodeURIComponent(uid)}&type=eq.intake`
            + `&day=eq.${encodeURIComponent(dayIsoNorm)}`;
  diag.add?.('[capture] fetch start intake:patch');
  const res2 = await fetchWithAuth(
    headers => fetch(patchUrl, { method:'PATCH', headers, body: JSON.stringify({ payload: payloadTotals }) }),
    { tag: 'intake:patch', maxAttempts: 2 }
  );
  if (!res2.ok){
    let d2='';
    try{ const e2 = await res2.clone().json(); d2 = e2?.message || e2?.details || ''; }catch{}
    const errPatch = new Error('intake-patch-failed');
    errPatch.status = res2.status;
    errPatch.details = d2;
    throw errPatch;
  }
  return await res2.json();
}

// Neuer atomarer RPC/UPSERT-Save (ein Request)
// SUBMODULE: saveIntakeTotalsRpc @public - RPC upsert_intake Pfad fuer Intake-Summen
async function saveIntakeTotalsRpc({ dayIso, totals }){
  const restUrl = await getConf("webhookUrl");
  const base    = baseUrlFromRest(restUrl);
  if (!base) {
    setConfigStatus('Bitte REST-Endpoint konfigurieren.', 'error');
    const err = new Error("REST-Basis fehlt");
    err.status = 0;
    throw err;
  }

  if (supabaseState.intakeRpcDisabled) {
    diag.add?.('[capture] rpc missing, fallback to legacy');
    return await saveIntakeTotals({ dayIso, totals });
  }

  const dayIsoNorm = /^\d{4}-\d{2}-\d{2}$/.test(String(dayIso||"")) ? dayIso : todayStr();
  const payloadTotals = {
    water_ml: Number(totals?.water_ml || 0),
    salt_g: Number(totals?.salt_g || 0),
    protein_g: Number(totals?.protein_g || 0),
  };

  const url = new URL(`${base}/rest/v1/rpc/upsert_intake`);
  const body = JSON.stringify({
    p_day: dayIsoNorm,
    p_water_ml: payloadTotals.water_ml,
    p_salt_g: payloadTotals.salt_g,
    p_protein_g: payloadTotals.protein_g,
  });

  diag.add?.('[capture] fetch start intake:rpc');
  const res = await fetchWithAuth(
    headers => fetch(url.toString(), { method: 'POST', headers, body }),
    { tag: 'intake:rpc', maxAttempts: 2 }
  );

  if (res.status === 404 || res.status === 405) {
    supabaseState.intakeRpcDisabled = true;
    diag.add?.('[capture] rpc missing, fallback to legacy');
    return await saveIntakeTotals({ dayIso: dayIsoNorm, totals: payloadTotals });
  }

  if (!res.ok) {
    let details = '';
    try { const e = await res.clone().json(); details = e?.message || e?.details || ''; } catch{}
    const err = new Error('intake-rpc-failed');
    err.status = res.status;
    err.details = details;
    throw err;
  }

  let json;
  try { json = await res.json(); } catch { json = null; }
  const row = Array.isArray(json) ? (json?.[0] ?? null) : (json || null);
  if (!row || typeof row !== 'object') {
    const err = new Error('rpc-empty');
    err.status = 200;
    throw err;
  }
  return row;
}

// SUBMODULE: cleanupOldIntake @internal - prunes stale intake events prior to today
async function cleanupOldIntake(){
  try{
    const rawUrl = await getConf('webhookUrl');
    const url = toEventsUrl(rawUrl);
    const uid = await getUserId();
    if (!url || !uid) return;
    const today = todayStr();
    const q = `${url}?user_id=eq.${encodeURIComponent(uid)}&type=eq.intake`+
              `&ts=lt.${encodeURIComponent(today)}T00:00:00Z`;
    await fetchWithAuth(headers => fetch(q, { method:'DELETE', headers }), { tag: 'intake:cleanup', maxAttempts: 2 });
  }catch(e){
    diag.add?.('cleanupOldIntake error: ' + (e?.message || e));
  }
}

/* === Remote-Fetch Arzt-Ansicht (Views) === */
// SUBMODULE: loadBpFromView @internal - queries v_events_bp view for doctor data
async function loadBpFromView({ user_id, from, to }) {
  const filters = [['user_id', `eq.${user_id}`]];
  if (from) filters.push(['day', `gte.${from}`]);
  if (to)   filters.push(['day', `lte.${to}`]);
  return await sbSelect({
    table: 'v_events_bp',
    select: 'day,ctx,sys,dia,pulse',
    filters,
    order: 'day.asc'
  });
}

// SUBMODULE: loadBodyFromView @internal - reads body composition view entries
async function loadBodyFromView({ user_id, from, to }) {
  const filters = [['user_id', `eq.${user_id}`]];
  if (from) filters.push(['day', `gte.${from}`]);
  if (to)   filters.push(['day', `lte.${to}`]);
  return await sbSelect({
    table: 'v_events_body',
    select: 'day,kg,cm,fat_pct,muscle_pct,fat_kg,muscle_kg',
    filters,
    order: 'day.asc'
  });
}

// SUBMODULE: loadFlagsFromView @internal - fetches daily flag states from view
async function loadFlagsFromView({ user_id, from, to }) {
  const filters = [['user_id', `eq.${user_id}`]];
  if (from) filters.push(['day', `gte.${from}`]);
  if (to)   filters.push(['day', `lte.${to}`]);
  return await sbSelect({
    table: 'v_events_day_flags',
    select: 'day,training,sick,low_intake,salt_high,protein_high90,valsartan_missed,forxiga_missed,nsar_taken',
    filters,
    order: 'day.asc'
  });
}

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

async function prefillBodyInputs(){
  const weightEl = document.getElementById('weightDay');
  const waistEl = document.getElementById('input-waist-cm');
  const fatEl = document.getElementById('fatPctDay');
  const muscleEl = document.getElementById('musclePctDay');
  const applyValues = (row) => {
    if (weightEl) weightEl.value = row?.kg != null ? fmtNum(row.kg, 1) : '';
    if (waistEl) waistEl.value = row?.cm != null ? fmtNum(row.cm, 1).replace('.', ',') : '';
    if (fatEl) {
      clearFieldError(fatEl);
      fatEl.value = row?.fat_pct != null ? fmtNum(row.fat_pct, 1).replace('.', ',') : '';
    }
    if (muscleEl) {
      clearFieldError(muscleEl);
      muscleEl.value = row?.muscle_pct != null ? fmtNum(row.muscle_pct, 1).replace('.', ',') : '';
    }
  };

  const dateEl = document.getElementById('date');
  const dayIso = dateEl?.value || todayStr();
  try {
    const uid = await getUserId();
    if (!uid) {
      applyValues(null);
      return;
    }
    const rows = await loadBodyFromView({ user_id: uid, from: dayIso, to: dayIso });
    const row = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
    applyValues(row);
  } catch(_) {
    applyValues(null);
  }
}

/* Optional: Notes (aus health_events, falls keine View v_events_note existiert) */
// SUBMODULE: loadNotesLastPerDay @internal - grabs latest note per day for doctor exports
async function loadNotesLastPerDay({ user_id, from, to }) {
  const filters = [['user_id', `eq.${user_id}`], ['type', 'eq.note']];
  if (from) filters.push(['day', `gte.${from}`]);
  if (to)   filters.push(['day', `lte.${to}`]);
  const rows = await sbSelect({
    table: 'health_events',
    select: 'day,ts,payload',
    filters,
    order: 'ts.asc',
  });
  const grouped = new Map();
  for (const r of rows) {
    const text = (r?.payload?.text || '').trim();
    if (!text) continue;
    if (!grouped.has(r.day)) grouped.set(r.day, []);
    grouped.get(r.day).push({ ts: r.ts, text });
  }
  const out = [];
  for (const [day, entries] of grouped.entries()) {
    entries.sort((a,b)=> (a.ts||0) - (b.ts||0));
    const lastTs = entries.length ? entries[entries.length-1].ts : null;
    out.push({ day, ts: lastTs, text: entries.map(e=>e.text).join(' ') });
  }
  return out;
}
// SUBMODULE: joinViewsToDaily @internal - merges view rows into doctor daily aggregate shape
/* View-Zeilen  Tagesobjekte (kompatibel zu renderDoctor/chartPanel) */
function joinViewsToDaily({ bp, body, flags, notes = [] }) {
  const days = new Map();
  const ensure = (day) => {
    let d = days.get(day);
    if (!d) {
      d = {
        date: day,
        morning: { sys:null, dia:null, pulse:null, map:null },
        evening: { sys:null, dia:null, pulse:null, map:null },
        weight: null,
        waist_cm: null,
        fat_pct: null,
        muscle_pct: null,
        fat_kg: null,
        muscle_kg: null,
        notes: "",
        flags: { water_lt2:false, salt_gt5:false, protein_ge90:false, sick:false, meds:false, training:false },
        remoteIds: [],
        hasCloud: true
      };
      days.set(day, d);
    }
    return d;
  };

  // body (1x/Tag)
  for (const r of body) {
    const d = ensure(r.day);
    if (r.kg != null) d.weight   = Number(r.kg);
    if (r.cm != null) d.waist_cm = Number(r.cm);
    if (r.fat_pct != null) d.fat_pct = Number(r.fat_pct);
    if (r.muscle_pct != null) d.muscle_pct = Number(r.muscle_pct);
    if (r.fat_kg != null) d.fat_kg = Number(r.fat_kg);
    if (r.muscle_kg != null) d.muscle_kg = Number(r.muscle_kg);
  }

  // bp (max 2x/Tag - Morgen/Abend)
  for (const r of bp) {
    const d = ensure(r.day);
    const blk = r.ctx === 'Morgen' ? d.morning : (r.ctx === 'Abend' ? d.evening : null);
    if (blk) {
      if (r.sys   != null) blk.sys   = Number(r.sys);
      if (r.dia   != null) blk.dia   = Number(r.dia);
      if (r.pulse != null) blk.pulse = Number(r.pulse);
      if (blk.sys != null && blk.dia != null) blk.map = calcMAP(blk.sys, blk.dia);
    }
  }

  // flags (1x/Tag)
  for (const r of flags) {
    const d = ensure(r.day);
    d.flags.training   = !!r.training;
    d.flags.sick       = !!r.sick;
    d.flags.water_lt2  = !!r.low_intake;
    d.flags.salt_gt5   = !!r.salt_high;
    d.flags.protein_ge90 = !!r.protein_high90;
    d.flags.meds       = !!(r.valsartan_missed || r.forxiga_missed || r.nsar_taken);
    // Detail-Medikamentenflags (fuer Tooltip)
    d.flags.valsartan_missed = !!r.valsartan_missed;
    d.flags.forxiga_missed   = !!r.forxiga_missed;
    d.flags.nsar_taken       = !!r.nsar_taken;
  }

  // notes: alle Texte eines Tages zusammenfassen
  for (const n of notes) {
    const d = ensure(n.day);
    d.notes = n.text || "";
  }

  return Array.from(days.values()).sort((a,b)=> b.date.localeCompare(a.date));
}

/* Neues fetchDailyOverview: liest direkt aus den Views */
// SUBMODULE: fetchDailyOverview @public - kombiniert Views fuer Arzt-Daily UIs
async function fetchDailyOverview(fromIso, toIso){
  const user_id = await getUserId();
  if (!user_id) return [];

  const [bp, body, flags, notes] = await Promise.all([
    loadBpFromView({ user_id, from: fromIso, to: toIso }),
    loadBodyFromView({ user_id, from: fromIso, to: toIso }),
    loadFlagsFromView({ user_id, from: fromIso, to: toIso }),
    loadNotesLastPerDay({ user_id, from: fromIso, to: toIso }) // optional
  ]);

  return joinViewsToDaily({ bp, body, flags, notes });
}

/* Server: alle Events eines Tages loeschen (RLS: nur eigene Records) */
// SUBMODULE: deleteRemoteDay @internal - entfernt alle Events eines Tages serverseitig
async function deleteRemoteDay(dateIso /*YYYY-MM-DD*/){
  const url = await getConf("webhookUrl");
  if (!url) return { ok:false, status:0 };

  const from = `${dateIso}T00:00:00Z`;
  const toNext = new Date(from); toNext.setUTCDate(toNext.getUTCDate()+1);
  const toIso = toNext.toISOString().slice(0,10);

  const q = `${url}?ts=gte.${encodeURIComponent(dateIso)}T00:00:00Z&ts=lt.${encodeURIComponent(toIso)}T00:00:00Z`;
  try{
    const res = await fetchWithAuth(headers => fetch(q, { method:"DELETE", headers }), { tag: 'remote:delete-day', maxAttempts: 2 });
    return { ok: res.ok, status: res.status };
  }catch(e){
    return { ok:false, status: e?.status ?? 0 };
  }
}

// SUBMODULE: baseUrlFromRest @internal - strips /rest prefix to find Supabase base URL
function baseUrlFromRest(restUrl){
if(!restUrl) return null;
const i = restUrl.indexOf("/rest/");
return i>0 ? restUrl.slice(0, i) : null;
}
window.baseUrlFromRest = baseUrlFromRest;


// SUBMODULE: getUserId @public - resolves current Supabase auth user with timeout fallbacks
async function getUserId(){
try{
diag.add?.('[auth] getUserId start');
const supa = await ensureSupabaseClient();
if(!supa) {
  if ((supabaseState.authState === 'auth' || supabaseState.authState === 'unknown') && supabaseState.lastUserId) {
    diag.add?.(`[auth] getUserId fallback (no client) ${maskUid(supabaseState.lastUserId)}`);
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
    if ((supabaseState.authState === 'auth' || supabaseState.authState === 'unknown') && supabaseState.lastUserId) {
      diag.add?.(`[auth] getUserId fallback (timeout) ${maskUid(supabaseState.lastUserId)}`);
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
if ((supabaseState.authState === 'auth' || supabaseState.authState === 'unknown') && supabaseState.lastUserId) {
  diag.add?.(`[auth] getUserId fallback (no uid) ${maskUid(supabaseState.lastUserId)}`);
  return supabaseState.lastUserId;
}
diag.add?.('[auth] getUserId done null');
return null;
}catch(e){
diag.add?.('[auth] getUserId error: ' + (e?.message || e));
if ((supabaseState.authState === 'auth' || supabaseState.authState === 'unknown') && supabaseState.lastUserId) {
  diag.add?.(`[auth] getUserId fallback (error) ${maskUid(supabaseState.lastUserId)}`);
  return supabaseState.lastUserId;
}
return null;
}
}

// SUBMODULE: ensureSupabaseClient @extract-candidate - lazy-inits Supabase client with config guards
async function ensureSupabaseClient(){
if (supabaseState.sbClient) return supabaseState.sbClient;

const rest = await getConf("webhookUrl");
const keyConf = await getConf("webhookKey"); // ANON key (nicht service_role)
if (!rest || !keyConf) {
  setConfigStatus('Bitte REST-Endpoint und ANON-Key speichern.', 'error');
  diag.add("Supabase Auth: fehlende Konfiguration");
  return null;
}

// NEU: niemals mit service_role starten
const trimmedKey = String(keyConf || '').trim();
if (isServiceRoleKey(trimmedKey)) {
  setConfigStatus('service_role Schluessel sind nicht erlaubt.', 'error');
  diag.add("Sicherheitsblock: service_role Key erkannt - Abbruch");
  return null;
}

const supabaseUrl = baseUrlFromRest(rest);
const anonKey = trimmedKey.replace(/^Bearer\s+/i,"");
if (!supabaseUrl) {
  setConfigStatus('REST-Endpoint ist ungueltig.', 'error');
  diag.add("Supabase Auth: ungueltige URL");
  return null;
}
if (!anonKey) {
  setConfigStatus('ANON-Key ist ungueltig.', 'error');
  diag.add("Supabase Auth: ungueltiger Key");
  return null;
}

supabaseState.sbClient = window.supabase.createClient(supabaseUrl, anonKey, {
auth: { persistSession:false, autoRefreshToken:true, detectSessionInUrl:true } // Session nur im RAM
});
diag.add("Supabase: Client (Auth) initialisiert");
setConfigStatus('', 'info');
return supabaseState.sbClient;
}
const supabaseApi = {
  withRetry,
  fetchWithAuth,
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
  baseUrlFromRest,
  deleteRemoteDay,
  ensureSupabaseClient,
  afterLoginBoot,
  requireSession,
  watchAuthState,
  setupRealtime: (...args) => (window.setupRealtime || defaultSetupRealtime)(...args),
  requireDoctorUnlock: (...args) => (window.requireDoctorUnlock || defaultRequireDoctorUnlock)(...args),
  resumeFromBackground: (...args) => (window.resumeFromBackground || defaultResumeFromBackground)(...args),
  getUserId,
  isLoggedInFast,
  cacheHeaders,
  clearHeaderCache,
  getCachedHeaders,
  getCachedHeadersAt,
  getHeaderPromise,
  setHeaderPromise,
  setSupabaseDebugPii,
  maskUid
};
window.AppModules = window.AppModules || {};
window.AppModules.supabase = supabaseApi;
window.SupabaseAPI = supabaseApi;
for (const key of Object.keys(supabaseApi)) {
  if (!(key in window)) {
    window[key] = supabaseApi[key];
  }
}
})(window);
