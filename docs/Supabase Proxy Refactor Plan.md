# Supabase Proxy Refactor Plan

Goal: remove `app/supabase.js` legacy proxy and rely solely on the modular barrel (`app/supabase/index.js`). This document describes the phases required to migrate all consumers, test the flow, and finally delete the proxy. Keep this plan updated as the refactor proceeds.

---

## Current Situation
- `app/supabase.js` re-exports every module under `window.AppModules.supabase` and defines legacy globals on `window.*`.
- `app/supabase/index.js` already aggregates the same modules and dispatches `supabase:ready`.
- Many modern modules (`hub/index.js`, trendpilot, capture) already consume the barrel via `createSupabaseFn`, but there may still be legacy callers relying on globals (`window.loadIntakeToday`, etc.).
- Proxy must remain until all consumers switch to the barrel.

---

## Phase 1 – Inventory & Migration
1. **Identify legacy consumers**
   - Search for direct references to `window.SupabaseAPI`, `window.loadIntakeToday`, etc.
   - Common spots: `assets/js/*`, old UI tabs, QA scripts.
2. **Update consumers**
   - Replace global calls with `createSupabaseFn('functionName')` or direct imports where possible.
   - Ensure Hub/Trendpilot/Doctor already go through barrel (verify `createSupabaseFn` path).
3. **Documentation**
   - Update module docs (done) and add link to this plan.

Deliverable: all production code uses barrel exports (no direct global access).

---

## Phase 2 – Dual Loading & Testing
1. Load both `app/supabase/index.js` (barrel) and `app/supabase.js` (proxy) in `index.html`.
2. Introduce a development warning inside `app/supabase.js` (optional) to detect any remaining legacy accesses (e.g., log when `warnLegacy(name)` fires).
3. Run regression tests (manual + QA scripts) to ensure no feature relies on the proxy-specific behavior.

---

## Phase 3 – Controlled Removal
1. Remove proxy script reference from `index.html` (keep barrel).
2. In build output, ensure only `app/supabase/index.js` is bundled.
3. Delete `app/supabase.js` and clean up imports.
4. Update `CHANGELOG.md` with the removal.

---
## Phase 4 – Post-Removal Validation
1. Validate production build (Hub, Doctor, Trendpilot, Realtime, Unlock) without proxy.
2. Monitor Touch-Log and `diag` for missing Supabase functions.
3. Once stable, close the task.

---

## Notes / Risks
- Legacy QA tools or scripts may still rely on globals; include them in the inventory.
- Guard/Unlock flow uses `authGuardState` heavily; verify it comes from barrel after removal.
- If we need a fallback for external scripts, consider a minimal compatibility shim (but avoid reintroducing full proxy).

---

Document owners: Supabase/Backend team. Update this plan whenever tasks are completed (phase by phase).
