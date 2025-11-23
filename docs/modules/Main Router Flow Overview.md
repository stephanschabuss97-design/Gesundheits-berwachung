# Main Router Flow – Functional Overview

Dieses Dokument beschreibt den aktuellen Stand des zentralen Orchestrators `assets/js/main.js`. Obwohl die UI inzwischen über den MIDAS Hub (Orbit + Panels) läuft, bleibt `main.js` der „Herzschlag“, der Capture-, Doctor- und Chart-Module refreshed, Logs schreibt und Supabase/Guard-States verwaltet.

---

## 1. Zielsetzung

`main.js` kümmert sich um
- `requestUiRefresh` / `runUiRefresh`: koordiniert sequentielle Updates der Module (Capture, Doctor, Charts, Trendpilot).
- Event-Bindings für Datum, Save-Buttons, Range-Actions, Export usw.
- Busy/Diag-Handling (`withBusy`, `diag.add`, Touch-Log).
- Lock-/Unlock-Flows (Doctor biometrics, Guard Pending Actions).
- Resume-/Visibility-Hooks (Browser Fokus, App Resume).

Der alte Tab-Router bleibt vorhanden, wird jedoch nur noch für Fallbacks/Legacy genutzt; der Hub ruft die gleichen Refresh-Hooks auf.

---

## 2. Kernkomponenten

| Bereich | Beschreibung |
|---------|--------------|
| `REQUIRED_GLOBALS` | Liste von Funktionen/Variablen, die vor App-Start vorhanden sein müssen (diag, uiError, captureModule, doctorModule …). |
| `ensureModulesReady()` | Prüft Supabase + Globals; zeigt Fehlerbanner, falls Module fehlen. |
| `requestUiRefresh(opts)` | Public Entry: setzt Flags (`docNeeded`, `chartNeeded`, …), bündelt Requests in einer Promise-Queue. |
| `runUiRefresh()` | Fährt die Steps nacheinander (Capture ? Doctor ? Charts ? Trendpilot). Erzeugt Touch-Log-Einträge `[ui] step start ...`. |
| Event-Bindings | Datum (`#date`), Range/Export Buttons, Save Buttons (BP, Körper, Intake-Shortcuts), Chart/Trendpilot-Actions. |
| Helper | `withBusy`, `flashButtonOk`, `uiError`, `getCaptureDayIso`, `maybeRunTrendpilotAfterBpSave`, `setAuthPendingAfterUnlock`. |

---

## 3. Hub-Integration vs. Router

- Der Hub-Orbit öffnet Panels, aber ruft intern weiterhin `requestUiRefresh` (z.?B. nach Intake Save oder Vital-Speicherungen).
- `setTab(tabId)` (aus `assets/js/ui-tabs.js`) existiert noch für Legacy (Capture/Doctor). Doctor-Tab ruft zusätzlich `requireDoctorUnlock` auf. Nach Unlock ? `requestUiRefresh({ doctor: true })`.
- Capture bleibt der Default-State; Hub-Panels nutzen dieselben Render-Funktionen (`refreshCaptureIntake`, `refreshDoctorDaily`, `renderChart`).

---

## 4. requestUiRefresh / runUiRefresh

### 4.1 requestUiRefresh(opts)
1. Optionen (z.?B. `{ reason: 'hub:intake-save', doctor: true }`) setzen Flags im `uiRefreshState`.
2. Erstellt eine Promise, speichert Resolver (`uiRefreshState.resolvers`).
3. Wenn kein Refresh läuft, startet Timer ? `runUiRefresh()`.
4. Logging: `[ui] refresh start reason=...` plus Touch-Log.

### 4.2 runUiRefresh()
1. Markiert `running = true` und liest die gesetzten Flags.
2. Führt Steps nacheinander aus (jeweils `await`):
   - Capture (`renderCapture`, ruft `refreshCaptureIntake`, `refreshVitals`, …).
   - Doctor (`renderDoctor`) falls Flag gesetzt.
   - Charts / Trendpilot („chartNeeded“, „trendpilotNeeded“).
3. Nach Abschluss werden Resolver resolved, Flags zurückgesetzt, `[ui] refresh end reason=...` geloggt.
4. Fehler werden via `diag.add` + `uiError` gemeldet; Touch-Log enthält Step-start/-end-Einträge.

---

## 5. Event-Bindings (Auswahl)

- **Blutdruck speichern** (`#saveBpPanelBtn`):
  - Prüft Login, nutzt `withBusy`, ruft `bp.saveBlock` ? `requestUiRefresh({ reason: 'panel:bp', doctor: true })` ? Trendpilot-Check.
- **Körper speichern** (`#saveBodyPanelBtn`): analog; Refresh-Reason `panel:body`.
- **Datum (`#date`)**: `change` ? `maybeRefreshForTodayChange` ? Refresh.
- **Range Apply / Export** (`#applyRange`, `#doctorExportJson`): triggern Doctor/Chart-Refresh, Logging `[doctor] range apply`.
- **Trendpilot Chart Buttons** (`#doctorChartBtn`, `#doctorShowBands`) ? `requestUiRefresh({ chart: true })`.
- **Login/Unlock Buttons**: `createSupabaseFn('showLoginOverlay')`, `requireDoctorUnlock()`; nach erfolgreichem Unlock wird `resumeAfterUnlock` aufgerufen.

---

## 6. Touch-Log / Diagnostics

- Touch-Log (DOM `<pre id="touchLog">`) sammelt Events:
  - `[ui] refresh start/end reason=...`
  - `[resume] ...`, `[capture] ...`, `[panel] ...`
- `diag.add` für Fehlerpfade (`capture intake save error`, `chart trendpilot fail`, …).
- `logDoctorError`, `logChartError` etc. leiten ihre Meldungen an `diag` weiter.

---

## 7. Resume / Background Flow

- Hooks (`visibilitychange`, `focus`, `pageshow`) schreiben `[resume]` Logs und rufen `requestUiRefresh({ reason: 'resume' })`.
- Supabase `setupRealtime` + `resumeFromBackground` (Intake-Live-Updates) hängen ebenfalls an `requestUiRefresh`.
- Guard/Unlock: `resumeAfterUnlock` verwendet `setAuthPendingAfterUnlock`, damit die ursprünglich gewünschte Aktion (z.?B. Doctor Overlay öffnen) sofort ausgeführt wird.

---

## 8. Sicherheitsmechanismen

- `getSupabaseApi` + `createSupabaseFn` verhindern Aufrufe, solange Supabase nicht bereit ist.
- Buttons benutzen `withBusy(btn, true)` gegen Mehrfachklicks.
- Guard Flow: `requireDoctorUnlock` setzt Pending-Action; nach erfolgreichem Unlock ruft `main.js` erneut `requestUiRefresh({ doctor: true, reason: 'unlock:doctor' })`.
- Fehlerbanner (`ensureModulesReady`) weist auf fehlende Globals hin.

---

## 9. Erweiterungsideen

- Echten Router-State (History/Hash) einführen, damit Panel/Orbit-Status geteilt werden kann.
- Bessere Notifications für Refresh-Ergebnisse (z.?B. Toast „Doctor-Daten aktualisiert“).
- `runUiRefresh` in einzelne Module splitten (Capture/Doctor/Chart), um Supabase/KI-Features isoliert hinzuzufügen.

---

Dieses Dokument sollte aktualisiert werden, sobald `main.js` neue Panels, Flags oder Diagnose-Hooks erhält. Besonders wichtig wird eine weitere Überarbeitung, wenn der Supabase-Proxy neu strukturiert oder KI-/PWA-Flows integriert werden.
