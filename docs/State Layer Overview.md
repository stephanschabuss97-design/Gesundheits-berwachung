# State Layer â€“ Functional Overview

Dieses Dokument listet die zentralen globalen States, Timer und Cache-Objekte des Gesundheits-Loggers auf. Ziel ist eine klare Ãœbersicht, wo welche Daten auÃŸerhalb von Komponenten gespeichert werden, um Debugging und Wartung zu erleichtern.

---

## 1. Capture / Intake State (`app/core/capture-globals.js`)

| Variable | Beschreibung |
|----------|--------------|
| `captureIntakeState` | `{ logged: bool, dayIso: string, totals: { water_ml, salt_g, protein_g } }` â€“ Tagesstatus. |
| `__lsTotals` | Kopie der Intake-Totals fÃ¼r Lifestyle-Seiten. |
| `__dateUserSelected` | Bool â€“ ob Nutzer manuell ein anderes Datum gewÃ¤hlt hat (verhindert Auto-Reset). |
| `__lastKnownToday` | Letzter â€žheuteâ€œ-String (fÃ¼r Day-Change Detection). |
| `__bpUserOverride` | Bool â€“ ob Nutzer den BP-Kontext manuell eingestellt hat (Noon-Switch stoppt). |
| `__midnightTimer`, `__noonTimer`, `__dayHeartbeat` | Timer-IDs fÃ¼r Mitternacht-Reset, Noon-Switch, optional Heartbeat. |
| `__intakeResetDoneFor` | ISO-Day, fÃ¼r den Reset bereits ausgefÃ¼hrt wurde. |
| `__bpPanesCache` | Cache der BP-Panels (DOM-Refs) zur Performance. |
| `__lastUserId` | Letzter bekannter Supabase-User â€“ fÃ¼r Reset bei Logout. |

Getter/Setter (`getDateUserSelected`, `setMidnightTimer`, â€¦) gewÃ¤hrleisten, dass andere Module stets die aktuelle Referenz erhalten.

---

## 2. UI Refresh State (`assets/js/main.js`)

| State | Beschreibung |
|-------|--------------|
| `uiRefreshState` | `{ running, timer, docNeeded, chartNeeded, lifestyleNeeded, appointmentsNeeded, resolvers, lastReason }`. |
| `uiRefreshTimeoutSymbol` | Symbol fÃ¼r Timeout-Diagnose. |
| `uiRefreshState.reasons` | Set aller GrÃ¼nde (z.â€¯B. `boot:initial`, `panel:bp`) â€“ Hilft bei Logging. |

Dieser State sorgt dafÃ¼r, dass mehrere Refresh-Requests zusammengefÃ¼hrt werden und Steps sequentiell laufen.

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
| `latestSystemComment` | Zuletzt geladener Supabase-Systemkommentar (fÃ¼r Capture-Pill & Chart). |
| `trendpilotInitialized` / `dependencyWarned` | Flags fÃ¼r Init-Status. |
| `chartPanel.currentMeta`, `currentBpPairs` | Map aus BP-Meta (Punkte + Tooltips). |
| `chartPanel.currentBodyMeta` | Map mit Body-Notizen. |
| `chartPanel.currentTrendpilotBands` | Array der Trendpilot-BÃ¤nder fÃ¼r Chart-Rendering. |

---

## 5. Auth / Unlock

| State | Beschreibung |
|-------|--------------|
| `authGuardState` (Supabase) | EnthÃ¤lt `doctorUnlocked`, `pendingAfterUnlock`, evtl. weitere Flags. |
| `supabaseMissingLogged` (`main.js`) | Verhindert mehrfaches Loggen â€žSupabaseAPI nicht geladenâ€œ. |
| `__authState` (`main.js`) | Speichert `unknown/auth` etc., damit Save-Flows wissen, ob Login bereits erkannt wurde. |
| `__lastLoggedIn` | Bool â€“ ob Nutzer vor kurzem eingeloggt war (fÃ¼r Unknown-Phase). |

---

## 6. Misc Timers / Flags

| State | Beschreibung |
|-------|--------------|
| `AppModules.captureGlobals.setBusy` | Zeigt Busy-Overlay fÃ¼r Capture (globaler Flag in DOM). |
| `AppModules.captureGlobals.setDateUserSelected` | Siehe Capture. |
| `window.AppModules.bp.updateBpCommentWarnings` | State, ob Kommentarfelder rot markiert werden (nicht global, aber setter-like). |
| `touchLog` (`#touchLog`) | DOM-Element, das diag-Log-EintrÃ¤ge anhÃ¤uft. |
| `AppModules.chartPanel.tipSticky` | Bool â€“ ob Tooltip fixiert ist (z.â€¯B. nach Klick). |
| `AppModules.chartPanel.SHOW_CHART_ANIMATIONS` | Flag, ob Animationen laufen dÃ¼rfen. |
| `AppModules.trendpilot.refreshLatestSystemComment` | Funktion, die den `latestSystemComment`-State aktualisiert (Event `trendpilot:latest`). |

---

## 7. Hinweise zur Pflege

- **Kein direktes Mutieren:** MÃ¶glichst Ã¼ber Getter/Setter gehen (`capture/globals`), damit Referenzen Ã¼berall aktualisiert werden.
- **Timer aufrÃ¤umen:** Bei `scheduleMidnightRefresh`/`scheduleNoonSwitch` immer alte Timer clearen.
- **Reset bei Logout:** `main.js` setzt `AppModules.captureGlobals.setLastKnownToday(todayStr())`, `setBpUserOverride(false)` etc. â€“ muss synchron bleiben.
- **Trendpilot-BÃ¤nder:** Nach Save/ACK `refreshLatestSystemComment` aufrufen, damit Capture/Chart/Doctor denselben State sehen.

---

Aktualisiere dieses Dokument, sobald neue globale States oder Timer hinzukommen (z.â€¯B. weitere Module, die `AppModules` nutzen), damit Debugging-Teams schnell erkennen, wo sie eingreifen mÃ¼ssen.
