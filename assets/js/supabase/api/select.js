/** MODULE: supabase/api/select.js — extracted from supabase.js @v1.8.1 */

import { baseUrlFromRest } from '../core/client.js';
import { fetchWithAuth } from '../core/http.js';
import { setConfigStatus } from '../auth/ui.js';

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

export async function sbSelect({ table, select, filters = [], order = null, limit = null }) {
  const tableName = typeof table === 'string' ? table.trim() : '';
  if (!tableName) {
    setConfigStatus('Bitte Tabelle konfigurieren.', 'error');
    const err = new Error('REST-Tabelle fehlt');
    err.status = 0;
    throw err;
  }

  const restUrl = await getConf('webhookUrl');
  const base = baseUrlFromRest(restUrl);
  if (!base) {
    setConfigStatus('Bitte REST-Endpoint konfigurieren.', 'error');
    const err = new Error('REST-Basis fehlt');
    err.status = 0;
    throw err;
  }

  const url = new URL(`${base}/rest/v1/${tableName}`);
  if (select) url.searchParams.set('select', select);
  for (const [key, value] of filters) url.searchParams.set(key, value);
  if (order) url.searchParams.set('order', order);
  if (limit) url.searchParams.set('limit', String(limit));

  const res = await fetchWithAuth(
    (headers) => fetch(url.toString(), { headers }),
    { tag: `sbSelect:${tableName}`, maxAttempts: 2 }
  );
  if (!res.ok) {
    let details = '';
    try {
      const errJson = await res.json();
      details = errJson?.message || errJson?.details || '';
    } catch (_) {
      /* ignore */
    }
    diag.add?.(`[sbSelect] REST ${tableName} failed ${res.status} ${details || ''}`);
    throw new Error(`REST ${tableName} failed ${res.status} - ${details}`);
  }
  return await res.json();
}
