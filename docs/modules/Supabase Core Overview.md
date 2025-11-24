# Supabase Core – Functional Overview

Dieses Dokument beschreibt das Supabase-Kernsystem des Gesundheits-Loggers. Es dient als Referenz dafür, wie das Supabase-Barrel (`app/supabase/index.js`) aufgebaut ist, welche Untermodule existieren und wie externe Module (`main.js`, Hub, Trendpilot, Capture etc.) mit den APIs interagieren.

---

## 1. Zielsetzung

Das Supabase-Core-System bündelt alle Supabase-Funktionen (Auth, REST, RPC, Realtime) in einem gemeinsamen Namespace (`SupabaseAPI` / `AppModules.supabase`). Es soll:

- Einheitliche Wrapper (`fetchWithAuth`, `ensureSupabaseClient`) bereitstellen.
- Verschiedene API-Bereiche (Intake, Vitals, Notes, Doctor, System-Comments) aggregieren.
- Realtime/Resume-Mechaniken (Websocket, App-Lock) koordinieren.
- Ein globales Ready-Event (`supabase:ready`) auslösen, damit andere Module erst nach Initialisierung starten.

---

## 2. Modulaufbau (`app/supabase/index.js`)

### 2.1 Imports / Submodule

Das Barrel importiert folgende Bereiche:
- `../supabase.js` (Legacy Proxy – wird nach und nach entfernt).
- Core (`./core/state.js`, `./core/client.js`, `./core/http.js`).
- Auth (`./auth/index.js`).
- Realtime (`./realtime/index.js`).
- Domains: `api/intake.js`, `api/vitals.js`, `api/notes.js`, `api/select.js`, `api/push.js`, `api/system-comments.js`, `api/doctor.js`.

### 2.2 Aggregation

1. `MODULE_SOURCES` enthält Paare `(label, moduleExports)`.
2. Schleife über alle Exporte ? in `aggregated` schreiben. Bei Namenskonflikt ersetzt neuere Quelle Legacy-Eintrag (Warnung im Log).
3. Ergebnis = `SupabaseAPI` (Plain Object).

### 2.3 Global Bindings

- `globalWindow.AppModules.supabase = SupabaseAPI`.
- `window.SupabaseAPI` wird definiert (falls nicht vorhanden).
- `notifySupabaseReady()` dispatcht Event `supabase:ready`.
- `SupabaseAPI.isReady = true`, `scheduleSupabaseReady()` sorgt für DOMContentLoaded-Fallback.

### 2.4 Diagnose

- Bei Konflikten: `console.warn('[supabase/index] Duplicate export keys ...')`.
- Submodule loggen eigene Fehler (z.?B. `system-comments`).

---

## 3. Wichtige Exports

- **Core/HTTP:** `fetchWithAuth`, `getHeaders`, `cacheHeaders`, `baseUrlFromRest`.
- **Auth:** `requireSession`, `watchAuthState`, `afterLoginBoot`, `bindAuthButtons`, `authGuardState`, `setAuthPendingAfterUnlock`.
- **Realtime:** `setupRealtime`, `teardownRealtime`, `resumeFromBackground` (für Intake/Hub-Resume).
- **Intake APIs:** `loadIntakeToday`, `saveIntakeTotalsRpc`, `cleanupOldIntake`.
- **Vitals APIs:** `fetchDailyOverview`, `loadBpFromView`, `loadBodyFromView`.
- **Notes:** `appendNoteRemote`, `deleteRemoteDay`.
- **System Comments:** `upsertSystemCommentRemote`, `setSystemCommentAck`, `setSystemCommentDoctorStatus`, `fetchSystemCommentsRange`.
- **Doctor/Trendpilot:** `loadDoctorDailyRange`, `loadTrendpilotBands`, `setTrendpilotAck`.

Andere Module greifen über `createSupabaseFn(name)` (`assets/js/main.js`) darauf zu, sodass Aufrufe bei fehlender API sauber fehlschlagen.

---

## 4. Initialisierungsfluss

1. `app/supabase/index.js` wird nach Body/Doctor/Capture-Skripten geladen (aber vor Trendpilot/Hellfire).
2. Sobald das Module ausgeführt ist, ruft es `scheduleSupabaseReady()` ? `supabase:ready`.
3. Abhängige Module:
   - Hub (`app/modules/hub/index.js`) ruft `waitForSupabaseApi` bevor Orbit/Guards starten.
   - `trendpilot/index.js`: wartet auf `supabase:ready`.
   - `main.js`: nutzt `waitForSupabaseApi()` (Promise + Event).
   - Charts/Doctor/Capture verwenden `createSupabaseFn(...)`; wenn Supabase noch nicht ready ist, erscheint ein freundlicher Fehler.

---

## 5. Sicherheit & Fehler

- Supabase-Keys/URLs werden via App-Config (`getConf('webhookUrl'/'webhookKey')`) gelesen.
- `fetchWithAuth` erneuert Token bei 401 und loggt Fehler anonymisiert (`maskUid`).
- HTTP-Aufrufe markieren ihre Tags (z.?B. `systemComment:post`) für Logging/Retry.
- Guard/Unlock-Flows (`requireDoctorUnlock`, `lockUi`) leben ebenfalls unter Supabase-Core, damit Doctor-Overlay/KI später denselben Pfad nutzen.

---

## 6. Erweiterung / Wartung

1. Neue API-Bereiche (z.?B. KI-Proxy) dem `MODULE_SOURCES`-Array hinzufügen.
2. Legacy-Dateien (`../supabase.js`) nur noch solange beibehalten, bis Proxy/Hub komplett migriert ist.
3. Bei Breaking Changes (Supabase SDK, Auth Flow) muss nur das Barrel aktualisiert werden; alle Caller bleiben konstant.
4. Dokumentation in QA/Docs aktualisieren (z.?B. Trendpilot/Charts, sobald neue Supabase-Exports benötigt werden).

---

Halte dieses Overview aktuell, wenn weitere Submodule hinzugefügt, Legacy-Teile entfernt oder Initialisierungsflüsse geändert werden.
