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

### Supabase public contract (Phase 0 inventory)

**Core / HTTP / state**
- `withRetry`
- `fetchWithAuth`
- `cacheHeaders`
- `clearHeaderCache`
- `getCachedHeaders`
- `getCachedHeadersAt`
- `getHeaderPromise`
- `setHeaderPromise`
- `setSupabaseDebugPii`
- `maskUid`
- `baseUrlFromRest`
- `ensureSupabaseClient`

**App / data APIs**
- `syncWebhook`
- `appendNoteRemote`
- `deleteRemote`
- `deleteRemoteDay`
- `loadIntakeToday`
- `saveIntakeTotals`
- `saveIntakeTotalsRpc`
- `cleanupOldIntake`
- `loadBpFromView`
- `loadBodyFromView`
- `fetchDailyOverview`
- `pushPendingToRemote`
- `bindAuthButtons`
- `prefillSupabaseConfigForm`
- `setConfigStatus`
- `showLoginOverlay`
- `hideLoginOverlay`
- `setUserUi`

**Auth / guard**
- `setDoctorAccess`
- `requireDoctorUnlock`
- `resumeAfterUnlock`
- `bindAppLockButtons`
- `authGuardState`
- `lockUi`
- `requireSession`
- `watchAuthState`
- `afterLoginBoot`
- `getUserId`
- `isLoggedInFast`
- `scheduleAuthGrace`
- `finalizeAuthState`

**Realtime**
- `setupRealtime`
- `teardownRealtime`
- `resumeFromBackground`
- `toEventsUrl`

**State globals mirrored on window**
- `window.sbClient`
- `window.__authState`
- `window.__lastLoggedIn`

2. **Compare with `app/supabase/index.js`**
   - Ensure the barrel exports (directly or via `AppModules.supabase`) cover the same functions.
   - If there is drift (functions only in proxy, not in barrel), decide:
     - either **add** them to the barrel, or
     - mark them as **deprecated** and schedule refactors.

**Deliverable:**  
A short API list in this document (“Supabase public contract”) and confirmed parity between barrel and proxy.

**Status (2025-11-24):**  
- `app/supabase/index.js` imports `{ SupabaseAPI as LegacySupabaseAPI }` from `../supabase.js` and aggregates it as the first module source, so every proxy key remains part of the barrel export (`MODULE_SOURCES` list).  
- The barrel adds newer modules (`select`, `systemComments`, etc.) on top, so modern consumers already see the superset surface via `AppModules.supabase`.  
- The three window state bindings (`sbClient`, `__authState`, `__lastLoggedIn`) no longer have production consumers after the refactors below; if we still need them for diagnostics we can recreate the bindings in the barrel (or drop them entirely) when the proxy disappears.

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

   **Status (2025-11-24): Current consumers of the legacy globals**
   - `assets/js/main.js:18-43` owns the shared boot helpers (`getSupabaseApi`, `createSupabaseFn`, `waitForSupabaseApi`) and now resolves everything exclusively via `window.AppModules.supabase`.
   - `app/modules/trendpilot/index.js`, `app/modules/hub/index.js`, `app/modules/doctor/index.js` und `app/modules/charts/index.js` were updated to drop `global.SupabaseAPI` access; they only read the API surface from `AppModules.supabase`.
   - No direct usages of `window.loadIntakeToday`, `window.saveIntakeTotals`, `window.requireSession`, etc. were found outside documentation. The real-world consumers go through the Supabase API object rather than individual globals.

2. **Identify state-level globals**
   - Search for:
     - `window.sbClient`
     - `window.__authState`
     - `window.__lastLoggedIn`.
   - Classify each usage:
     - **Read-only diagnostics** → can be migrated to a helper or `diag` module that imports `supabaseState`.
     - **Control logic** (e.g. checking auth state) → should be refactored to use `authCore` / barrel exports directly.

   **Status (2025-11-24): window state bindings still in use**
   - ✅ `assets/js/main.js:382-389,1153-1159` now calls `getSupabaseState()` (which resolves to `SupabaseAPI.supabaseState`) for login checks and `watchAuthState` bootstrap.
   - ✅ `app/supabase/auth/guard.js:262-266` imports `supabaseState` directly and reads `supabaseState.sbClient`.
   - ✅ `app/modules/capture/index.js:332-352` derives its “unknown” auth grace from `SupabaseAPI.supabaseState.authState/lastLoggedIn`.
   - No remaining production usage depends on `window.sbClient`, `window.__authState` oder `window.__lastLoggedIn`. We can recreate or drop those bindings inside the barrel when the proxy disappears.

3. **Update consumers**
   - Replace global calls with:
     - `createSupabaseFn('functionName')`, or
     - direct imports from `app/supabase/index.js` (preferred for new/clean modules).
   - For state:
     - Either:
       - introduce a small adapter in the barrel that keeps `window.sbClient` etc. alive *temporarily*, **or**
       - refactor all usages so they import `supabaseState` / `authCore` instead of reading window globals.

   **Status (2025-11-24):**
   - `assets/js/main.js` + Capture/Doctor/Trendpilot/Hub/Charts now exclusively access Supabase via `AppModules.supabase` / `createSupabaseFn`.
   - State-level consumers (main.js, guard.js, capture/index.js) now read `SupabaseAPI.supabaseState` directly. No code references `window.sbClient`, `window.__authState` oder `window.__lastLoggedIn`.
   - Remaining work: once all deployments include these changes, mirror (or drop) the `Object.defineProperties(window, …)` bindings inside the barrel so the proxy can be removed without breaking legacy diagnostics.

4. **Documentation**
   - Update module docs so they clearly state:
     - “Supabase access via barrel / `createSupabaseFn` only.”
     - No new code is allowed to depend on `window.*` Supabase globals.
   - Link this refactor plan from Supabase-related docs.

   **Status (2025-11-24):**
   - `docs/modules/Supabase Core Overview.md` now contains an “Access Policy” section that mandates barrel-only consumption and links back to this plan.
   - `docs/modules/State Layer Overview.md` documents that `authState` / `lastLoggedIn` must be read from `SupabaseAPI.supabaseState` (legacy `__authState`/`__lastLoggedIn` removed) and reiterates the “no window globals” rule with a link to this plan.

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

   **Status (2025-11-24):** `index.html` now loads both scripts back-to-back (legacy proxy first, then the barrel). The proxy is only kept as a fallback safety net; all modules already consume the barrel via `AppModules.supabase`.

2. **Activate `warnLegacy`**
   - Implement `warnLegacy(name)` in `app/supabase.js` to log when a legacy global is accessed, for example:
     - `console.warn('[supabase-proxy] Legacy global accessed:', name);`
     - optional: include a stack trace for easier tracking.

   **Status (2025-11-24):** `app/supabase.js` now logs once per legacy key via `warnLegacy(name)` (includes stack traces) whenever a window getter/setter is hit. This will highlight any straggling consumers while the proxy is loaded.

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

   **Status (2025-11-24):** Regression pass completed (login/intake/doctor/resume). Touch-Log shows only expected `[ui]` / `[auth]` entries, and the console stayed free of `[supabase-proxy] Legacy global accessed` warnings. Phase 2 can move toward proxy removal once this state holds across environments.

---

## Phase 3 – Controlled Proxy Removal

**Goal:**  
Physically remove the proxy from the boot path, keeping only the barrel.

1. **Remove proxy from `index.html`**
   - Comment out or delete the `<script>` tag loading `app/supabase.js`.
   - Ensure only `app/supabase/index.js` is loaded.

   **Status (2025-11-24):** `index.html` now only loads `app/supabase/index.js` (proxy script removed). From here on, the barrel is the sole source of Supabase globals.

2. **Build & bundle check**
   - Ensure the build output contains:
     - the barrel
     - no references to `app/supabase.js`.

   **Status (2025-11-24):** Full-text search (`rg "app/supabase.js"`) now only hits documentation/CHANGELOG entries; no runtime/bundle file references remain. `index.html` and assets load only `app/supabase/index.js`, so the production bundle consists solely of the barrel.

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
