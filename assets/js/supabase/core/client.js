/** MODULE: supabase/core/client.js — extracted from supabase.js @v1.8.0 */

import { supabaseState } from './state.js';

const supabaseLog = { debugLogPii: false };
const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

const getConfSafe = (...args) => {
  const fn = globalWindow?.getConf;
  if (typeof fn !== 'function') {
    diag.add?.('Supabase client: window.getConf is not available');
    return null;
  }
  return fn(...args);
};

const setConfigStatusSafe = (msg, tone = 'info') => {
  const fn = globalWindow?.setConfigStatus;
  if (typeof fn === 'function') {
    fn(msg, tone);
  } else {
    diag.add?.(`[config] ${tone}: ${msg}`);
  }
};

export function maskUid(uid) {
  if (!uid) return 'anon';
  const str = String(uid);
  if (supabaseLog.debugLogPii) return str;
  if (str.length <= 4) return str;
  const head = str.slice(0, 4);
  const tail = str.slice(-4);
  return `${head}-${tail}`;
}

export function setSupabaseDebugPii(enabled) {
  supabaseLog.debugLogPii = !!enabled;
}

export function baseUrlFromRest(restUrl) {
  if (!restUrl) return null;
  const i = restUrl.indexOf('/rest/');
  return i > 0 ? restUrl.slice(0, i) : null;
}

export function isServiceRoleKey(raw) {
  const tok = String(raw || '').trim().replace(/^Bearer\s+/i, '');
  try {
    const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export async function ensureSupabaseClient() {
  if (supabaseState.sbClient) return supabaseState.sbClient;

  const rest = await getConfSafe('webhookUrl');
  const keyConf = await getConfSafe('webhookKey'); // ANON key (nicht service_role)
  if (!rest || !keyConf) {
    setConfigStatusSafe('Bitte REST-Endpoint und ANON-Key speichern.', 'error');
    diag.add('Supabase Auth: fehlende Konfiguration');
    return null;
  }

  // NEU: niemals mit service_role starten
  const trimmedKey = String(keyConf || '').trim();
  if (isServiceRoleKey(trimmedKey)) {
    setConfigStatusSafe('service_role Schluessel sind nicht erlaubt.', 'error');
    diag.add('Sicherheitsblock: service_role Key erkannt - Abbruch');
    return null;
  }

  const supabaseUrl = baseUrlFromRest(rest);
  const anonKey = trimmedKey.replace(/^Bearer\s+/i, '');
  if (!supabaseUrl) {
    setConfigStatusSafe('REST-Endpoint ist ungueltig.', 'error');
    diag.add('Supabase Auth: ungueltige URL');
    return null;
  }
  if (!anonKey) {
    setConfigStatusSafe('ANON-Key ist ungueltig.', 'error');
    diag.add('Supabase Auth: ungueltiger Key');
    return null;
  }

  if (!globalWindow?.supabase || typeof globalWindow.supabase.createClient !== 'function') {
    setConfigStatusSafe('Supabase Client SDK fehlt.', 'error');
    diag.add('Supabase Auth: window.supabase.createClient nicht verfuegbar');
    return null;
  }

  supabaseState.sbClient = globalWindow.supabase.createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true } // Session nur im RAM
  });
  diag.add('Supabase: Client (Auth) initialisiert');
  setConfigStatusSafe('', 'info');
  return supabaseState.sbClient;
}
