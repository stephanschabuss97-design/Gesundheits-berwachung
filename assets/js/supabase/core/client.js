'use strict';
/**
 * MODULE: supabase/core/client.js
 * Description: Initialisiert und verwaltet den Supabase-Client, prüft Konfiguration, sichert Auth-Setup und verhindert service_role Keys.
 * Submodules:
 *  - imports (State-Verwaltung)
 *  - constants & globals (globale Handles und Log-Objekt)
 *  - safe accessors (sichere Wrapper für window.getConf / setConfigStatus)
 *  - maskUid (PII-Schutz für User-IDs)
 *  - setSupabaseDebugPii (Debug-Flag für Logging sensibler Daten)
 *  - baseUrlFromRest (Extraktion der Basis-URL)
 *  - isServiceRoleKey (Validierung gegen verbotene Keys)
 *  - ensureSupabaseClient (Client-Erstellung mit Sicherheitsprüfungen)
 * Notes:
 *  - Hybrid-kompatibel (Browser/PWA/Node)
 *  - Verhindert versehentliche Initialisierung mit service_role Key
 *  - Version: 1.8.2 (System Integration Layer, M.I.D.A.S.)
 */

// SUBMODULE: imports @internal - Supabase State-Verwaltung
import { supabaseState } from './state.js';

// SUBMODULE: constants & globals @internal - globale Handles und Logging
const supabaseLog = { debugLogPii: false };
const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

// SUBMODULE: safe accessors @internal - gesicherter Zugriff auf window.getConf / setConfigStatus
const getConfSafe = (...args) => {
  const fn = globalWindow?.getConf;
  if (typeof fn !== 'function') {
    diag.add?.('Supabase Client: window.getConf ist nicht verfuegbar');
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

// SUBMODULE: maskUid @public - schützt User-IDs vor vollständigem Logging
export function maskUid(uid) {
  if (!uid) return 'anon';
  const str = String(uid);
  if (supabaseLog.debugLogPii) return str;
  if (str.length <= 4) return str;
  const head = str.slice(0, 4);
  const tail = str.slice(-4);
  return `${head}-${tail}`;
}

// SUBMODULE: setSupabaseDebugPii @public - toggelt Logging sensibler Daten
export function setSupabaseDebugPii(enabled) {
  supabaseLog.debugLogPii = !!enabled;
}

// SUBMODULE: baseUrlFromRest @public - extrahiert Basis-URL aus REST-Endpunkt
export function baseUrlFromRest(restUrl) {
  if (!restUrl) return null;
  const i = restUrl.indexOf('/rest/');
  return i > 0 ? restUrl.slice(0, i) : null;
}

// SUBMODULE: isServiceRoleKey @public - prüft JWT-Payload auf service_role
export function isServiceRoleKey(raw) {
  const tok = String(raw || '').trim().replace(/^Bearer\s+/i, '');
  try {
    const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

// SUBMODULE: ensureSupabaseClient @public - erstellt oder cached den Supabase-Client
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
