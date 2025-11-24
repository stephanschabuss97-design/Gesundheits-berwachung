'use strict';
/**
 * MODULE: app/supabase.js
 * Description: Thin compatibility shim – re-exports SupabaseAPI from the barrel so legacy script tags keep working.
 * Notes:
 *  - The barrel (app/supabase/index.js) now handles all aggregation, window bindings, and legacy proxies.
 *  - This file exists only to satisfy script tags or bundles that still load `app/supabase.js`.
 */

import { SupabaseAPI } from './supabase/index.js';

window.AppModules = window.AppModules || {};
window.AppModules.supabase = SupabaseAPI;

export { SupabaseAPI };
