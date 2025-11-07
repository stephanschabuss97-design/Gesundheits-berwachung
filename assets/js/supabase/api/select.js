'use strict';
/**
 * MODULE: supabase/api/select.js
 * intent: Generische REST-Abfrage-Schnittstelle (sbSelect) für Supabase-Tabellen
 * exports: sbSelect
 * version: 1.8.2
 * compat: ESM + Monolith (Hybrid)
 * notes:
 *   - Baut REST-URLs dynamisch basierend auf Tabellenname, Filter, Order, Limit
 *   - Nutzt fetchWithAuth für autorisierte Requests
 *   - Meldet Fehler über Diagnostics und UI-Status
 * author: System Integration Layer (M.I.D.A.S. v1.8)
 */

// SUBMODULE: imports @internal - REST- und Auth-Abhängigkeiten
import { baseUrlFromRest } from '../core/client.js';
import { fetchWithAuth } from '../core/http.js';
import { setConfigStatus } from '../auth/ui.js';

// SUBMODULE: globals @internal - Diagnose-Hook und globale Konfiguration
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

// SUBMODULE: sbSelect @public - generische Supabase-Select-Abfrage (REST)
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
