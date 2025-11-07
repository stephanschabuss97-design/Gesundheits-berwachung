'use strict';
/**
 * MODULE: supabase/index.js
 * intent: Zentraler Barrel für Supabase-APIs (Core, Auth, Realtime, API-Layer)
 * exports: SupabaseAPI (aggregated)
 * version: 1.8.2
 * compat: ESM + Monolith (Hybrid)
 * notes:
 *   - Aggregiert alle Submodule aus core/, api/, auth/, realtime/
 *   - Prüft Konflikte bei gleichnamigen Exports und loggt Warnungen
 *   - Bindet SupabaseAPI global unter window.AppModules.supabase für Legacy-Kompatibilität
 * author: System Integration Layer (M.I.D.A.S. v1.8)
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

// SUBMODULE: aggregation @internal - kombiniert Exporte, erkennt Konflikte
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
  ['select', select]
];

const owners = Object.create(null);
const aggregated = {};
const conflicts = [];

for (const [label, mod] of MODULE_SOURCES) {
  for (const [exportName, exportValue] of Object.entries(mod)) {
    if (exportName in aggregated) {
      if (aggregated[exportName] !== exportValue) {
        conflicts.push({ key: exportName, existingOwner: owners[exportName], incomingOwner: label });
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

// SUBMODULE: export @public - zentraler Aggregat-Export & globale Bindung
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
