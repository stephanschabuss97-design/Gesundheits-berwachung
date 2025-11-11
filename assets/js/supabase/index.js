'use strict';
/**
 * MODULE: supabase/index.js
 * Description: Aggregiert Supabase-Subsysteme (Core, Auth, API, Realtime) zu einem zentralen Exportobjekt.
 * Submodules:
 *  - imports (bindet alle Submodule)
 *  - aggregation (kombiniert Exporte & erkennt Konflikte)
 *  - export (stellt SupabaseAPI global & als ESM bereit)
 *  - notifySupabaseReady (sendet Ready-Event nach erfolgreicher Initialisierung)
 *  - scheduleSupabaseReady (koordiniert Ready-Dispatch mit DOM-Lifecycle)
 * Notes:
 *  - Prüft doppelte Exporte und protokolliert Konflikte.
 *  - Hybrid-kompatibel: global + modular.
 *  - Version: 1.8.2 (System Integration Layer, M.I.D.A.S.)
 */

// SUBMODULE: imports @internal - bindet Supabase-Submodule (Core, Auth, API)
import { SupabaseAPI as LegacySupabaseAPI } from '../supabase.js';

import * as state from './core/state.js';
import * as client from './core/client.js';
import * as http from './core/http.js';
import * as auth from './auth/index.js';
import * as realtime from './realtime/index.js';
import * as intake from './api/intake.js';
import * as vitals from './api/vitals.js';
import * as notes from './api/notes.js';
import * as select from './api/select.js';
import * as push from './api/push.js';

// SUBMODULE: aggregation @internal - kombiniert alle Module, erkennt doppelte Exporte
const MODULE_SOURCES = [
  ['legacy', LegacySupabaseAPI],
  ['state', state],
  ['client', client],
  ['http', http],
  ['auth', auth],
  ['realtime', realtime],
  ['intake', intake],
  ['vitals', vitals],
  ['notes', notes],
  ['select', select],
  ['push', push]
];

const owners = Object.create(null);
const aggregated = {};
const conflicts = [];

for (const [label, mod] of MODULE_SOURCES) {
  for (const [exportName, exportValue] of Object.entries(mod)) {
    if (exportName in aggregated) {
      const existingOwner = owners[exportName];
      // Neuere Module dürfen Legacy-Exports überschreiben, ohne Konfliktmeldung.
      if (existingOwner === 'legacy' && label !== 'legacy') {
        aggregated[exportName] = exportValue;
        owners[exportName] = label;
        continue;
      }
      if (aggregated[exportName] !== exportValue) {
        conflicts.push({ key: exportName, existingOwner, incomingOwner: label });
      }
      continue;
    }
    aggregated[exportName] = exportValue;
    owners[exportName] = label;
  }
}

if (conflicts.length) {
  const summary = conflicts
    .map((conflict) => `${conflict.key} (existing: ${conflict.existingOwner}, incoming: ${conflict.incomingOwner})`)
    .join(', ');
  console.warn(`[supabase/index] Duplicate export keys detected: ${summary}`);
}

// SUBMODULE: export @public - stellt SupabaseAPI als Aggregat bereit + globale Bindung
export const SupabaseAPI = aggregated;

const globalWindow = typeof window !== 'undefined' ? window : undefined;
if (globalWindow) {
  globalWindow.AppModules = globalWindow.AppModules || {};
  globalWindow.AppModules.supabase = SupabaseAPI;
  const PUBLIC_GLOBALS = {
    SupabaseAPI
  };
  for (const [name, value] of Object.entries(PUBLIC_GLOBALS)) {
    if (Object.prototype.hasOwnProperty.call(globalWindow, name)) continue;
    Object.defineProperty(globalWindow, name, {
      configurable: true,
      writable: true,
      value
    });
  }
}

// SUBMODULE: notifySupabaseReady @internal - löst CustomEvent 'supabase:ready' aus
const notifySupabaseReady = () => {
  const doc = globalWindow?.document;
  if (!doc || typeof doc.dispatchEvent !== 'function') return;
  const eventName = 'supabase:ready';
  try {
    doc.dispatchEvent(new CustomEvent(eventName));
    return;
  } catch (err) {
    globalWindow?.console?.debug?.(
      '[supabase/index] CustomEvent constructor missing, falling back to createEvent',
      err
    );
  }
  if (typeof doc.createEvent === 'function') {
    try {
      const evt = doc.createEvent('Event');
      evt.initEvent(eventName, false, false);
      doc.dispatchEvent(evt);
    } catch (_) {
      // ignore
    }
  }
};

// SUBMODULE: enqueueReadyDispatch @internal - führt Eventdispatch asynchron (microtask-basiert) aus
const enqueueReadyDispatch = (callback) => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
};

// SUBMODULE: scheduleSupabaseReady @internal - markiert SupabaseAPI als bereit und löst Event zum passenden Zeitpunkt aus
const scheduleSupabaseReady = () => {
  if (!globalWindow) return;
  SupabaseAPI.isReady = true;
  const doc = globalWindow.document;
  const dispatch = () => enqueueReadyDispatch(notifySupabaseReady);
  if (doc?.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', dispatch, { once: true });
  } else {
    dispatch();
  }
};

scheduleSupabaseReady();
