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
import * as systemComments from './api/system-comments.js';

// SUBMODULE: aggregation @internal - kombiniert alle Module, erkennt doppelte Exporte
const MODULE_SOURCES = [
  ['state', state],
  ['client', client],
  ['http', http],
  ['auth', auth],
  ['realtime', realtime],
  ['intake', intake],
  ['vitals', vitals],
  ['notes', notes],
  ['select', select],
  ['push', push],
  ['systemComments', systemComments]
];

const owners = Object.create(null);
const aggregated = {};
const conflicts = [];

for (const [label, mod] of MODULE_SOURCES) {
  for (const [exportName, exportValue] of Object.entries(mod)) {
    if (exportName in aggregated) {
      const existingOwner = owners[exportName];
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
const bindStateToWindow = () => {
  if (!globalWindow) return;
  Object.defineProperties(globalWindow, {
    sbClient: {
      configurable: true,
      get() {
        return state.supabaseState.sbClient;
      },
      set(value) {
        state.supabaseState.sbClient = value;
      }
    },
    __authState: {
      configurable: true,
      get() {
        return state.supabaseState.authState;
      },
      set(value) {
        state.supabaseState.authState = value;
      }
    },
    __lastLoggedIn: {
      configurable: true,
      get() {
        return state.supabaseState.lastLoggedIn;
      },
      set(value) {
        state.supabaseState.lastLoggedIn = value;
      }
    }
  });
};
const attachLegacyProxies = () => {
  if (!globalWindow) return;
  const warned = new Set();
  const isDevBuild =
    (typeof globalWindow.__DEV__ !== 'undefined' && !!globalWindow.__DEV__) ||
    (typeof process !== 'undefined' && process?.env?.NODE_ENV && process.env.NODE_ENV !== 'production');
  const warnLegacy = (name) => {
    if (warned.has(name)) return;
    warned.add(name);
    if (isDevBuild) {
      const stack = new Error().stack;
      globalWindow.console?.warn?.('[supabase/index] Legacy global accessed:', name, stack ? `\n${stack}` : '');
      return;
    }
    globalWindow.console?.warn?.('[supabase/index] Legacy global accessed:', name);
  };
  const legacyNames = [...Object.keys(SupabaseAPI), 'SupabaseAPI'];
  legacyNames.forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(globalWindow, name)) return;
    Object.defineProperty(globalWindow, name, {
      configurable: true,
      get() {
        warnLegacy(name);
        return name === 'SupabaseAPI' ? SupabaseAPI : SupabaseAPI[name];
      },
      set(value) {
        warnLegacy(name);
        if (name !== 'SupabaseAPI') {
          SupabaseAPI[name] = value;
        }
      }
    });
  });
};
if (globalWindow) {
  bindStateToWindow();
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
  attachLegacyProxies();
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
