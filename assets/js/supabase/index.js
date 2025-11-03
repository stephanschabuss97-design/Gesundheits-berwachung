/** MODULE: supabase/index.js — Barrel @v1.8.1 */

import { SupabaseAPI as LegacySupabaseAPI } from '../supabase.js';

import * as state from './core/state.js';
import * as client from './core/client.js';
import * as http from './core/http.js';
import * as auth from './auth/index.js';
import * as realtime from './realtime/index.js';
import * as intake from './api/intake.js';
import * as vitals from './api/vitals.js';
import * as notes from './api/notes.js';

export const SupabaseAPI = {
  ...LegacySupabaseAPI,
  ...state,
  ...client,
  ...http,
  ...auth,
  ...realtime,
  ...intake,
  ...vitals,
  ...notes
};

const globalWindow = typeof window !== 'undefined' ? window : undefined;
if (globalWindow) {
  globalWindow.AppModules = globalWindow.AppModules || {};
  globalWindow.AppModules.supabase = SupabaseAPI;
  globalWindow.SupabaseAPI = SupabaseAPI;
  for (const key of Object.keys(SupabaseAPI)) {
    if (!(key in globalWindow)) {
      globalWindow[key] = SupabaseAPI[key];
    }
  }
}
