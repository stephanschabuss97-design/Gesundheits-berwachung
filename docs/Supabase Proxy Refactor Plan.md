# Supabase Proxy Refactor Plan

**Goal:**  
Remove `app/supabase.js` legacy proxy and rely solely on the modular barrel (`app/supabase/index.js`).  
This document describes the phases required to migrate all consumers, test the flow, and finally delete the proxy. Keep this plan updated as the refactor proceeds.

---

## Current Situation

- `app/supabase.js` acts as a **transition proxy**:
  - Aggregates Supabase modules into a single `SupabaseAPI` object.
  - Exposes `SupabaseAPI` under `window.AppModules.supabase`.
  - Creates individual legacy globals on `window.*` for all Supabase functions  
    (e.g. `window.loadIntakeToday`, `window.requireSession`, etc.).
  - Binds Supabase state onto the global window:
    - `window.sbClient`        ⇄ `supabaseState.sbClient`
    - `window.__authState`     ⇄ `supabaseState.authState`
    - `window.__lastLoggedIn`  ⇄ `supabaseState.lastLoggedIn`.
- `app/supabase/index.js` already aggregates the same modules and dispatches `supabase:ready`.
- Modern modules (Hub, Trendpilot, Capture, Doctor) are intended to consume the barrel via `createSupabaseFn(...)` or direct imports, but some legacy callers may still rely on window globals.
- The proxy must remain until:
  - All function consumers are redirected to the barrel.
  - All `window.*` state usages (`sbClient`, `__authState`, `__lastLoggedIn`) are migrated or consciously re-implemented in the barrel.

---

## Phase 0 – API Contract & Parity Check

**Goal:**  
Make sure barrel and proxy expose the *same* public API before we start cutting.

1. **Define the "official" Supabase API surface**
   - List all keys in `SupabaseAPI` from `app/supabase.js`:
     - Core: `withRetry`, `fetchWithAuth`, `cacheHeaders`, `getCachedHeaders`, ...
     - Auth: `requireSession`, `watchAuthState`, `afterLoginBoot`, ...
     - Realtime: `setupRealtime`, `resumeFromBackground`, ...
     - App: `loadIntakeToday`, `saveIntakeTotals`, `loadBpFromView`, ...
   - Include state globals:
     - `window.sbClient`
     - `window.__authState`
     - `window.__lastLoggedIn`.

2. **Compare with `app/supabase/index.js`**
   - Ensure the barrel exports (directly or via `AppModules.supabase`) cover the same functions.
   - If there is drift (functions only in proxy, not in barrel), decide:
     - either **add** them to the barrel, or
     - mark them as **deprecated** and schedule refactors.

**Deliverable:**  
A short API list in this document (“Supabase public contract”) and confirmed parity between barrel and proxy.

---

## Phase 1 – Inventory & Migration

**Goal:**  
Find and migrate all consumers that still rely on proxy-specific behavior or window globals.

1. **Identify legacy function consumers**
   - Grep the codebase for:
     - `SupabaseAPI`
     - `window.SupabaseAPI`
     - `window.loadIntakeToday`, `window.saveIntakeTotals`, `window.requireSession`, …
     - any direct `window.<supabaseFn>` usage.
   - Check especially:
     - `assets/js/*`
     - old UI tabs
     - QA tools, diag/TouchLog helpers
     - inline scripts (if any).

2. **Identify state-level globals**
   - Search for:
     - `window.sbClient`
     - `window.__authState`
     - `window.__lastLoggedIn`.
   - Classify each usage:
     - **Read-only diagnostics** → can be migrated to a helper or `diag` module that imports `supabaseState`.
     - **Control logic** (e.g. checking auth state) → should be refactored to use `authCore` / barrel exports directly.

3. **Update consumers**
   - Replace global calls with:
     - `createSupabaseFn('functionName')`, or
     - direct imports from `app/supabase/index.js` (preferred for new/clean modules).
   - For state:
     - Either:
       - introduce a small adapter in the barrel that keeps `window.sbClient` etc. alive *temporarily*, **or**
       - refactor all usages so they import `supabaseState` / `authCore` instead of reading window globals.

4. **Documentation**
   - Update module docs so they clearly state:
     - “Supabase access via barrel / `createSupabaseFn` only.”
     - No new code is allowed to depend on `window.*` Supabase globals.
   - Link this refactor plan from Supabase-related docs.

**Deliverable:**  
All production code (Hub, Capture, Doctor, Trendpilot, Realtime, Unlock) uses barrel exports / `createSupabaseFn`.  
No feature *requires* `window.<supabaseFn>` any more.

---

## Phase 2 – Dual Loading & Legacy Detection

**Goal:**  
Run proxy + barrel in parallel, but actively detect remaining legacy usage.

1. **Keep both scripts in `index.html`**
   - Load:
     - `app/supabase/index.js` (barrel)
     - `app/supabase.js` (proxy)
   - The proxy should now be a safety net, not the primary integration point.

2. **Activate `warnLegacy`**
   - Implement `warnLegacy(name)` in `app/supabase.js` to log when a legacy global is accessed, for example:
     - `console.warn('[supabase-proxy] Legacy global accessed:', name);`
     - optional: include a stack trace for easier tracking.

3. **Run regression tests**
   - Manually:
     - Login / Logout
     - Intake flows
     - Vitals / Body views
     - Doctor unlock & guard
     - Realtime updates, background resume.
   - While testing, watch:
     - console logs for `[supabase-proxy] Legacy global accessed`
     - existing diag / TouchLog tooling for errors.

**Deliverable:**  
In dev mode, *no* `warnLegacy` logs appear anymore during normal flows.

---

## Phase 3 – Controlled Proxy Removal

**Goal:**  
Physically remove the proxy from the boot path, keeping only the barrel.

1. **Remove proxy from `index.html`**
   - Comment out or delete the `<script>` tag loading `app/supabase.js`.
   - Ensure only `app/supabase/index.js` is loaded.

2. **Build & bundle check**
   - Ensure the build output contains:
     - the barrel
     - no references to `app/supabase.js`.

3. **Delete proxy source**
   - Once runtime tests pass:
     - Remove `app/supabase.js`.
     - Clean up any leftover imports or references.

4. **Update `CHANGELOG.md`**
   - Add an entry like:
     - “Removed legacy Supabase proxy (`app/supabase.js`), all consumers now use `app/supabase/index.js` barrel.”

**Deliverable:**  
Project builds and runs without `app/supabase.js` present. All Supabase usage goes through the barrel.

---

## Phase 4 – Post-Removal Validation

**Goal:**  
Verify that the system behaves correctly in real-world usage without the proxy.

1. **End-to-end validation**
   - Validate all major flows:
     - Hub
     - Capture
     - Doctor view
     - Trendpilot / charts
     - Realtime / background resume
     - Unlock / guard / auth grace.

2. **Monitor diag & Touch-Log**
   - Watch for:
     - missing Supabase functions
     - auth-related issues (session loss, broken unlock flows)
     - realtime disconnects.

3. **External scripts / QA tools**
   - Confirm that any external or QA scripts have been updated or consciously retired.
   - If something absolutely must keep a global:
     - introduce a tiny, explicit compatibility shim (e.g. attach 1–2 functions on `window.AppModules.supabase`) instead of bringing back the full proxy pattern.

4. **Close the refactor task**
   - Mark proxy removal as complete.
   - Optionally, remove temporary dev-only logging from the barrel.

---

## Notes / Risks

- **Legacy QA tools** may still rely on window globals; they must be part of the inventory and either updated or consciously dropped.
- The **guard/unlock flow** (`authGuardState`, `requireDoctorUnlock`, `resumeAfterUnlock`, `lockUi`, etc.) must be tested thoroughly after the migration to the barrel.
- If we ever need to reintroduce a global for external integration, use a **minimal explicit shim** (e.g. attach 1–2 functions on `window.AppModules.supabase`) instead of bringing back the full proxy pattern.

---

Document owners: Supabase/Backend team.  
Update this plan whenever tasks are completed (phase by phase).
