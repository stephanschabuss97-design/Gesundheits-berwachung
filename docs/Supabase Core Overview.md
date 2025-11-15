# Supabase Core – Functional Overview

Dieses Dokument beschreibt das Supabase-Kernsystem des Gesundheits-Loggers. Es dient als Referenz dafür, wie das Supabase-Barrel (`assets/js/supabase/index.js`) aufgebaut ist, welche Untermodule existieren und wie externe Module (`main.js`, Trendpilot, Capture etc.) mit den APIs interagieren.

---

## 1. Zielsetzung

Das Supabase-Core-System bündelt alle Supabase-Funktionen (Auth, REST, RPC, Realtime) in einem gemeinsamen Namespace (`SupabaseAPI` / `AppModules.supabase`). Es soll:

- Einheitliche Wrapper (`fetchWithAuth`, `ensureSupabaseClient`) bereitstellen.
- Verschiedene API-Bereiche (intake, vitals, notes, system-comments) aggregieren.
- Realtime/Resume-Mechaniken (Websocket, App-Lock) koordinieren.
- Ein globales Ready-Event (`supabase:ready`) auslösen, damit andere Module erst nach Initialisierung starten.

---

## 2. Modulaufbau (`assets/js/supabase/index.js`)

### 2.1 Imports / Submodule

Das Barrel importiert folgende Bereiche:
- `../supabase.js` (Legacy API, falls vorhanden).
- Core (`./core/state.js`, `./core/client.js`, `./core/http.js`).
- Auth (`./auth/index.js`).
- Realtime (`./realtime/index.js`).
- Domains: `api/intake.js`, `api/vitals.js`, `api/notes.js`, `api/select.js`, `api/push.js`, `api/system-comments.js`.

### 2.2 Aggregation

1. `MODULE_SOURCES` enthält Paare `(label, moduleExports)`.
2. Schleife über alle Exporte → in `aggregated` schreiben. Bei Namenskonflikt ersetzt neuere Quelle Legacy-Eintrag.
3. Ergebnis = `SupabaseAPI`.

### 2.3 Global Bindings

- `globalWindow.AppModules.supabase = SupabaseAPI`.
- `window.SupabaseAPI` wird definert (falls nicht vorhanden).
- `notifySupabaseReady()` dispatcht Event `supabase:ready` (CustomEvent).
- `SupabaseAPI.isReady = true`, `scheduleSupabaseReady()` sorgt für DOMContentLoaded-Version.

### 2.4 Diagnose

- Bei Konflikten: `console.warn('[supabase/index] Duplicate export keys ...')`.
- Normalerweise keine weiteren Logs, aber Submodule loggen bei Bedarf.

---

## 3. Wichtige Exports

Eine Auswahl (nicht vollständig):
- **Core/HTTP:** `fetchWithAuth`, `getHeaders`, `cacheHeaders`, `baseUrlFromRest`.
- **Auth:** `requireSession`, `watchAuthState`, `afterLoginBoot`, `bindAuthButtons`.
- **Realtime:** `setupRealtime`, `teardownRealtime`, `resumeFromBackground`.
- **Intake APIs:** `loadIntakeToday`, `saveIntakeTotalsRpc`, `cleanupOldIntake`.
- **Vitals APIs:** `fetchDailyOverview`, `loadBpFromView`, `loadBodyFromView`.
- **Notes:** `appendNoteRemote`, `deleteRemoteDay`.
- **System Comments:** `upsertSystemCommentRemote`, `setSystemCommentAck`, `setSystemCommentDoctorStatus`, `fetchSystemCommentsRange`.
- **State/Lock:** `requireDoctorUnlock`, `bindAppLockButtons`, `authGuardState`, `lockUi`.

Andere Module greifen über `createSupabaseFn(name)` (`assets/js/main.js`) darauf zu, sodass Aufrufe bei fehlender API sauber fehlschlagen.

---

## 4. Initialisierungsfluss

1. `assets/js/supabase/index.js` wird nach Body/Doctor/Capture-Skripten geladen (aber vor Trendpilot).
2. Sobald das Module ausgeführt ist, ruft es `scheduleSupabaseReady()` → `supabase:ready`.
3. Abhängige Module:
   - `trendpilot/index.js`: wartet auf `supabase:ready`, init erst danach.
   - `main.js`: nutzt `waitForSupabaseApi()` (Promise + Event).
   - Chart/Doctor/Capture rufen sofort `createSupabaseFn(...)`; falls Supabase noch nicht ready ist, wirft der Wrapper user-freundliche Errors.

---

## 5. Sicherheit & Fehler

- Supabase-Keys/URLs werden via App-Config (`getConf('webhookUrl'/'webhookKey')`) gelesen.
- `fetchWithAuth` erneuert Token bei 401 und loggt Fehler anonymisiert (`maskUid`).
- HTTP-Aufrufe markieren ihre „tags“ (z. B. `systemComment:post`) für Logging/Retry.
- Das Barrel selbst wirft keine Errors, aber Submodule (z. B. `system-comments`) enthalten Fallbacks in `diag`.

---

## 6. Erweiterung / Wartung

- Neue API-Bereiche (z. B. `api/comments.js`) einfach dem `MODULE_SOURCES`-Array hinzufügen.
- Bei Breaking Changes (z. B. Supabase V3) muss nur das Barrel aktualisiert werden; alle Caller bleiben konstant.
- Dokumentation in QA/Docs aktualisieren (z. B. Trendpilot/Charts, sobald neue Supabase-Exports benötigt werden).

---

Halte dieses Overview aktuell, wenn weitere Submodule hinzugefügt oder Initialisierungsflüsse geändert werden.
