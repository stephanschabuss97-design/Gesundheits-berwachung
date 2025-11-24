# State Layer – Functional Overview

Dieses Dokument listet die zentralen globalen States, Timer und Cache-Objekte des Gesundheits-Loggers auf. Ziel ist eine klare Übersicht, wo welche Daten außerhalb der Komponenten gespeichert werden – insbesondere jetzt, da der MIDAS Hub Panels und Locks steuert, aber weiterhin auf die gleichen State-Layer zugreift.

---

## 1. Capture / Intake State (`app/core/capture-globals.js`)

| Variable / Helper | Beschreibung |
|-------------------|--------------|
| `captureIntakeState` | `{ logged, dayIso, totals: { water_ml, salt_g, protein_g } }` – Tagesstatus, den Hub-Panels und Pills lesen. |
| `__lsTotals` | Kopie der Intake-Totals für Lifestyle-/Trendpilot-Funktionen. |
| `__dateUserSelected` | Bool, ob der Nutzer ein anderes Datum gewählt hat (verhindert Auto-Reset). |
| `__lastKnownToday` | Zuletzt bekannter ISO-Tag „heute“ (für Day-Change Detection). |
| `__bpUserOverride` | Bool, ob BP-Kontext manuell gesetzt wurde (stoppt Noon-Switch). |
| `__midnightTimer`, `__noonTimer`, `__dayHeartbeat` | Timer-IDs für Midnight-Reset, Noon-Switch, optionalen Heartbeat. |
| `__intakeResetDoneFor` | ISO-Day, für den bereits ein Reset ausgeführt wurde. |
| `__bpPanesCache` | Cache der BP-Panels (DOM-Referenzen) zur Performance. |
| `__lastUserId` | Letzter bekannter Supabase-User – wichtig für Logout-Reset. |

Getter/Setter wie `setMidnightTimer`, `getDateUserSelected` usw. sorgen dafür, dass alle Module stets dieselbe Referenz verwenden (auch der Hub).

---

## 2. UI Refresh State (`assets/js/main.js`)

| State | Beschreibung |
|-------|--------------|
| `uiRefreshState` | `{ running, timer, docNeeded, chartNeeded, lifestyleNeeded, appointmentsNeeded, resolvers, lastReason }`. |
| `uiRefreshTimeoutSymbol` | Symbol für Timeout-Diagnose im Touch-Log. |
| `uiRefreshState.reasons` | Set aller Refresh-Gründe (z.?B. `boot:initial`, `panel:bp`). |

Dieser State bündelt Refresh-Requests (auch aus dem Hub) und führt die Steps sequentiell aus.

---

## 3. Arzt-Ansicht (Doctor Overlay)

| Variable | Beschreibung |
|----------|--------------|
| `__doctorScrollSnapshot` (`app/modules/doctor/index.js`) | `{ top, ratio }`, damit das Overlay nach einem Refresh wieder zur gleichen Position scrollt. |
| `trendpilotWrap.dataset.tpBound` | Flag, ob Trendpilot-Events schon gebunden wurden. |

---

## 4. Trendpilot & Charts

| State | Beschreibung |
|-------|--------------|
| `lastStatus` (`trendpilot/index.js`) | Letzter Trendpilot-Run `{ severity, delta, day }`. |
| `latestSystemComment` | Zuletzt geladener Supabase-Systemkommentar (für Capture-Pill & Charts). |
| `trendpilotInitialized` / `dependencyWarned` | Flags für Init-/Warnzustand. |
| `chartPanel.currentMeta`, `currentBpPairs` | Map aus BP-Daten + Tooltip-Meta. |
| `chartPanel.currentBodyMeta` | Map mit Körpernotizen. |
| `chartPanel.currentTrendpilotBands` | Array mit Trendpilot-Bändern für den Chart. |

---

## 5. Auth / Unlock

| State | Beschreibung |
|-------|--------------|
| `authGuardState` (`app/supabase/auth/guard.js`) | Enthält `doctorUnlocked`, `pendingAfterUnlock` etc.; Hub nutzt das, um Doctor-Panels direkt nach Biometrics zu öffnen. |
| `supabaseMissingLogged` (`main.js`) | Verhindert mehrfaches Loggen „SupabaseAPI nicht geladen“. |
| `__authState` (`main.js`) | Speichert `unknown/auth`, damit Save-Flows wissen, ob Login erkannt wurde. |
| `__lastLoggedIn` | Bool, ob der Nutzer vor kurzem eingeloggt war (für Unknown-Phase). |

---

## 6. Misc Timers / Flags

| State | Beschreibung |
|-------|--------------|
| `AppModules.captureGlobals.setBusy` | Steuert das Busy-Overlay global. |
| `AppModules.captureGlobals.setDateUserSelected` | Setter für Datum-Override (siehe Abschnitt 1). |
| `window.AppModules.bp.updateBpCommentWarnings` | Markiert Kommentarfelder rot, wenn Pflicht erfüllt werden muss. |
| `touchLog` (`#touchLog`) | DOM-Element, das Diag-Logs auffängt. |
| `AppModules.chartPanel.tipSticky` | Bool, ob Chart-Tooltip fixiert ist. |
| `AppModules.chartPanel.SHOW_CHART_ANIMATIONS` | Flag, ob Chart-Animationen laufen dürfen. |
| `AppModules.trendpilot.refreshLatestSystemComment` | Funktion, die `latestSystemComment` aktualisiert (Event `trendpilot:latest`). |

---

## 7. Hinweise zur Pflege

- **Nicht direkt mutieren:** Immer Getter/Setter aus `capture/globals` verwenden, damit Hub, Capture und Doctor denselben State sehen.
- **Timer aufräumen:** Bei `scheduleMidnightRefresh` / `scheduleNoonSwitch` alte Timer unbedingt clearen.
- **Reset bei Logout:** `main.js` setzt u.?a. `setLastKnownToday(todayStr())`, `setBpUserOverride(false)` – diese Reihenfolge muss beibehalten werden.
- **Trendpilot-Bänder:** Nach Save oder ACK `refreshLatestSystemComment` und `requestUiRefresh({ chart: true })`, damit alle Oberflächen synchron sind.

---

Dieses Dokument sollte angepasst werden, sobald neue globale States oder Timer hinzukommen (z.?B. KI-/PWA-Features oder zusätzliche Hub-Panels), damit Debugging-Teams schnell erkennen, wo sie eingreifen müssen.
