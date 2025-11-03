/** MODULE: supabase/api/intake.js — extracted from supabase.js @v1.8.1 */

import { supabaseState } from '../core/state.js';
import { baseUrlFromRest, maskUid } from '../core/client.js';
import { fetchWithAuth } from '../core/http.js';
import { setConfigStatus } from '../auth/ui.js';
import { getUserId } from '../auth/core.js';
import { toEventsUrl } from '../realtime/index.js';

const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

const getConf = (...args) => {
  const fn = globalWindow?.getConf;
  if (typeof fn !== 'function') return Promise.resolve(null);
  try {
    return Promise.resolve(fn(...args));
  } catch (err) {
    return Promise.reject(err);
  }
};

const todayStr = () => {
  const fn = globalWindow?.todayStr;
  if (typeof fn !== 'function') {
    throw new Error('todayStr is not available');
  }
  return fn();
};

const dayIsoToMidnightIso = (dayIso, timeZone) => {
  const fn = globalWindow?.dayIsoToMidnightIso;
  if (typeof fn !== 'function') {
    throw new Error('dayIsoToMidnightIso is not available');
  }
  return fn(dayIso, timeZone);
};

const isValidDayIso = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const sbSelect = async ({ table, select, filters = [], order = null, limit = null }) => {
  const restUrl = await getConf('webhookUrl');
  const base = baseUrlFromRest(restUrl);
  if (!base) {
    setConfigStatus('Bitte REST-Endpoint konfigurieren.', 'error');
    const err = new Error('REST-Basis fehlt');
    err.status = 0;
    throw err;
  }

  const url = new URL(`${base}/rest/v1/${table}`);
  if (select) url.searchParams.set('select', select);
  for (const [key, value] of filters) url.searchParams.set(key, value);
  if (order) url.searchParams.set('order', order);
  if (limit) url.searchParams.set('limit', String(limit));

  const res = await fetchWithAuth(
    (headers) => fetch(url.toString(), { headers }),
    { tag: `sbSelect:${table}`, maxAttempts: 2 }
  );
  if (!res.ok) {
    let details = '';
    try {
      const errJson = await res.json();
      details = errJson?.message || errJson?.details || '';
    } catch (_) {
      /* ignore */
    }
    throw new Error(`REST ${table} failed ${res.status} - ${details}`);
  }
  return await res.json();
};

export async function loadIntakeToday({ user_id, dayIso }) {
  if (!user_id) return null;
  diag.add?.(`[capture] loadIntakeToday start uid=${maskUid(user_id)} day=${dayIso || ''}`);
  const baseDay = isValidDayIso(dayIso) ? dayIso : todayStr();

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
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const payload = row?.payload || {};
  diag.add?.(
    `[capture] loadIntakeToday done id=${row?.id || 'null'} payload=${JSON.stringify(payload)}`
  );
  return {
    id: row?.id ?? null,
    water_ml: Number(payload.water_ml || 0),
    salt_g: Number(payload.salt_g || 0),
    protein_g: Number(payload.protein_g || 0)
  };
}

export async function saveIntakeTotals({ dayIso, totals }) {
  const url = await getConf('webhookUrl');
  const uid = await getUserId();
  if (!url || !uid) {
    const errMissing = new Error('saveIntakeTotals: missing config/auth');
    errMissing.status = 401;
    throw errMissing;
  }

  const dayIsoNorm = isValidDayIso(dayIso) ? dayIso : todayStr();
  const ts = dayIsoToMidnightIso(dayIsoNorm) || new Date().toISOString();
  const payloadTotals = {
    water_ml: Number(totals?.water_ml || 0),
    salt_g: Number(totals?.salt_g || 0),
    protein_g: Number(totals?.protein_g || 0)
  };
  const payload = [{ ts, type: 'intake', payload: payloadTotals, user_id: uid }];

  diag.add?.('[capture] fetch start intake:post');
  const res = await fetchWithAuth(
    (headers) => fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) }),
    { tag: 'intake:post', maxAttempts: 2 }
  );

  if (res.ok) {
    return await res.json();
  }

  let details = '';
  try {
    const errJson = await res.clone().json();
    details = errJson?.message || errJson?.details || '';
  } catch (_) {
    /* ignore */
  }
  diag.add?.(`[intake] POST failed ${res.status} ${details || ''}`);

  if (res.status === 404) {
    return { ok: false, status: res.status };
  }

  const dayIsoNorm2 = dayIsoNorm;
  const patchUrl =
    `${url}?user_id=eq.${encodeURIComponent(uid)}&type=eq.intake` +
    `&day=eq.${encodeURIComponent(dayIsoNorm2)}`;
  diag.add?.('[capture] fetch start intake:patch');
  const res2 = await fetchWithAuth(
    (headers) =>
      fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ payload: payloadTotals })
      }),
    { tag: 'intake:patch', maxAttempts: 2 }
  );
  if (!res2.ok) {
    let detailsPatch = '';
    try {
      const errPatchJson = await res2.clone().json();
      detailsPatch = errPatchJson?.message || errPatchJson?.details || '';
    } catch (_) {
      /* ignore */
    }
    const errPatch = new Error('intake-patch-failed');
    errPatch.status = res2.status;
    errPatch.details = detailsPatch;
    throw errPatch;
  }
  return await res2.json();
}

export async function saveIntakeTotalsRpc({ dayIso, totals }) {
  const restUrl = await getConf('webhookUrl');
  const base = baseUrlFromRest(restUrl);
  if (!base) {
    setConfigStatus('Bitte REST-Endpoint konfigurieren.', 'error');
    const err = new Error('REST-Basis fehlt');
    err.status = 0;
    throw err;
  }

  if (supabaseState.intakeRpcDisabled) {
    diag.add?.('[capture] rpc missing, fallback to legacy');
    return await saveIntakeTotals({ dayIso, totals });
  }

  const dayIsoNorm = isValidDayIso(dayIso) ? dayIso : todayStr();
  const payloadTotals = {
    water_ml: Number(totals?.water_ml || 0),
    salt_g: Number(totals?.salt_g || 0),
    protein_g: Number(totals?.protein_g || 0)
  };

  const url = new URL(`${base}/rest/v1/rpc/upsert_intake`);
  const body = JSON.stringify({
    p_day: dayIsoNorm,
    p_water_ml: payloadTotals.water_ml,
    p_salt_g: payloadTotals.salt_g,
    p_protein_g: payloadTotals.protein_g
  });

  diag.add?.('[capture] fetch start intake:rpc');
  const res = await fetchWithAuth(
    (headers) => fetch(url.toString(), { method: 'POST', headers, body }),
    { tag: 'intake:rpc', maxAttempts: 2 }
  );

  if (res.status === 404 || res.status === 405) {
    supabaseState.intakeRpcDisabled = true;
    diag.add?.('[capture] rpc missing, fallback to legacy');
    return await saveIntakeTotals({ dayIso: dayIsoNorm, totals: payloadTotals });
  }

  if (!res.ok) {
    let details = '';
    try {
      const errJson = await res.clone().json();
      details = errJson?.message || errJson?.details || '';
    } catch (_) {
      /* ignore */
    }
    const err = new Error('intake-rpc-failed');
    err.status = res.status;
    err.details = details;
    throw err;
  }

  let json;
  try {
    json = await res.json();
  } catch (_) {
    json = null;
  }
  const row = Array.isArray(json) ? json?.[0] ?? null : json || null;
  if (!row || typeof row !== 'object') {
    const err = new Error('rpc-empty');
    err.status = 200;
    throw err;
  }
  return row;
}

export async function cleanupOldIntake() {
  try {
    const rawUrl = await getConf('webhookUrl');
    const url = toEventsUrl(rawUrl);
    const uid = await getUserId();
    if (!url || !uid) return;
    const todayIso = todayStr();
    const query =
      `${url}?user_id=eq.${encodeURIComponent(uid)}&type=eq.intake` +
      `&ts=lt.${encodeURIComponent(todayIso)}T00:00:00Z`;
    await fetchWithAuth(
      (headers) => fetch(query, { method: 'DELETE', headers }),
      { tag: 'intake:cleanup', maxAttempts: 2 }
    );
  } catch (err) {
    diag.add?.('cleanupOldIntake error: ' + (err?.message || err));
  }
}

