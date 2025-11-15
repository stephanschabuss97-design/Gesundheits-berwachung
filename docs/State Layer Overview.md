# State Layer – Functional Overview

Dieses Dokument listet die zentralen globalen States, Timer und Cache-Objekte des Gesundheits-Loggers auf. Ziel ist eine klare Übersicht, wo welche Daten außerhalb von Komponenten gespeichert werden, um Debugging und Wartung zu erleichtern.

---

## 1. Capture / Intake State (`assets/js/capture/globals.js`)

| Variable | Beschreibung |
|----------|--------------|
| `captureIntakeState` | `{ logged: bool, dayIso: string, totals: { water_ml, salt_g, protein_g } }` – Tagesstatus. |
| `__lsTotals` | Kopie der Intake-Totals für Lifestyle-Seiten. |
| `__dateUserSelected` | Bool – ob Nutzer manuell ein anderes Datum gewählt hat (verhindert Auto-Reset). |
| `__lastKnownToday` | Letzter „heute“-String (für Day-Change Detection). |
| `__bpUserOverride` | Bool – ob Nutzer den BP-Kontext manuell eingestellt hat (Noon-Switch stoppt). |
| `__midnightTimer`, `__noonTimer`, `__dayHeartbeat` | Timer-IDs für Mitternacht-Reset, Noon-Switch, optional Heartbeat. |
| `__intakeResetDoneFor` | ISO-Day, für den Reset bereits ausgeführt wurde. |
| `__bpPanesCache` | Cache der BP-Panels (DOM-Refs) zur Performance. |
| `__lastUserId` | Letzter bekannter Supabase-User – für Reset bei Logout. |

Getter/Setter (`getDateUserSelected`, `setMidnightTimer`, …) gewährleisten, dass andere Module stets die aktuelle Referenz erhalten.

---

## 2. UI Refresh State (`assets/js/main.js`)

| State | Beschreibung |
|-------|--------------|
| `uiRefreshState` | `{ running, timer, docNeeded, chartNeeded, lifestyleNeeded, appointmentsNeeded, resolvers, lastReason }`. |
| `uiRefreshTimeoutSymbol` | Symbol für Timeout-Diagnose. |
| `uiRefreshState.reasons` | Set aller Gründe (z. B. `boot:initial`, `panel:bp`) – Hilft bei Logging. |

Dieser State sorgt dafür, dass mehrere Refresh-Requests zusammengeführt werden und Steps sequentiell laufen.

---

## 3. Arzt-Ansicht

| Variable | Beschreibung |
|----------|--------------|
| `__doctorScrollSnapshot` (`assets/js/doctor/index.js`) | `{ top, ratio }`, um nach Refresh zum vorherigen Scrollpunkt zu springen. |
| `trendpilotWrap.dataset.tpBound` | Flag, ob Trendpilot-Events bereits gebunden wurden. |

---

## 4. Trendpilot & Charts

| State | Beschreibung |
|-------|--------------|
| `lastStatus` (`trendpilot/index.js`) | Letzter Trendpilot-Run `{ severity, delta, day }`. |
| `latestSystemComment` | Zuletzt geladener Supabase-Systemkommentar (für Capture-Pill & Chart). |
| `trendpilotInitialized` / `dependencyWarned` | Flags für Init-Status. |
| `chartPanel.currentMeta`, `currentBpPairs` | Map aus BP-Meta (Punkte + Tooltips). |
| `chartPanel.currentBodyMeta` | Map mit Body-Notizen. |
| `chartPanel.currentTrendpilotBands` | Array der Trendpilot-Bänder für Chart-Rendering. |

---

## 5. Auth / Unlock

| State | Beschreibung |
|-------|--------------|
| `authGuardState` (Supabase) | Enthält `doctorUnlocked`, `pendingAfterUnlock`, evtl. weitere Flags. |
| `supabaseMissingLogged` (`main.js`) | Verhindert mehrfaches Loggen „SupabaseAPI nicht geladen“. |
| `__authState` (`main.js`) | Speichert `unknown/auth` etc., damit Save-Flows wissen, ob Login bereits erkannt wurde. |
| `__lastLoggedIn` | Bool – ob Nutzer vor kurzem eingeloggt war (für Unknown-Phase). |

---

## 6. Misc Timers / Flags

| State | Beschreibung |
|-------|--------------|
| `AppModules.captureGlobals.setBusy` | Zeigt Busy-Overlay für Capture (globaler Flag in DOM). |
| `AppModules.captureGlobals.setDateUserSelected` | Siehe Capture. |
| `window.AppModules.bp.updateBpCommentWarnings` | State, ob Kommentarfelder rot markiert werden (nicht global, aber setter-like). |
| `touchLog` (`#touchLog`) | DOM-Element, das diag-Log-Einträge anhäuft. |
| `AppModules.chartPanel.tipSticky` | Bool – ob Tooltip fixiert ist (z. B. nach Klick). |
| `AppModules.chartPanel.SHOW_CHART_ANIMATIONS` | Flag, ob Animationen laufen dürfen. |
| `AppModules.trendpilot.refreshLatestSystemComment` | Funktion, die den `latestSystemComment`-State aktualisiert (Event `trendpilot:latest`). |

---

## 7. Hinweise zur Pflege

- **Kein direktes Mutieren:** Möglichst über Getter/Setter gehen (`capture/globals`), damit Referenzen überall aktualisiert werden.
- **Timer aufräumen:** Bei `scheduleMidnightRefresh`/`scheduleNoonSwitch` immer alte Timer clearen.
- **Reset bei Logout:** `main.js` setzt `AppModules.captureGlobals.setLastKnownToday(todayStr())`, `setBpUserOverride(false)` etc. – muss synchron bleiben.
- **Trendpilot-Bänder:** Nach Save/ACK `refreshLatestSystemComment` aufrufen, damit Capture/Chart/Doctor denselben State sehen.

---

Aktualisiere dieses Dokument, sobald neue globale States oder Timer hinzukommen (z. B. weitere Module, die `AppModules` nutzen), damit Debugging-Teams schnell erkennen, wo sie eingreifen müssen.
