# Main.js / Router Flow – Functional Overview

Dieses Dokument beschreibt den Orchestrator `assets/js/main.js` inklusive Router-/Tab-Fluss, Event-Loops und den Zusammenhang zwischen `requestUiRefresh`, Touch-Log und den einzelnen UI-Modulen.

---

## 1. Zielsetzung

`main.js` fungiert als zentrale Steuereinheit:
- Verwaltet Tabs (`capture`, `doctor`), Router-Zustand und Unlock-Anforderungen.
- Kapselt `requestUiRefresh`/`runUiRefresh` – der Herzschlag für UI-Updates.
- Bindet Buttons/Events (Datum, Save, Chart, Delete).
- Koordiniert diag-/Touch-Log-Einträge und Fehlerbehandlung.

---

## 2. Kernkomponenten

| Bereich | Beschreibung |
|---------|--------------|
| `REQUIRED_GLOBALS` | Liste aller Funktionen/Variablen, die vor App-Start existieren müssen (diag, uiError, $ etc.). |
| `ensureModulesReady()` | Prüft Supabase + Globals, zeigt Fehlerbanner falls Module fehlen. |
| `requestUiRefresh(opts)` | Startet einen UI-Refresh (Promise-basiert) – hält eine Queue, damit mehrere Requests zusammenlaufen. |
| `runUiRefresh()` | Führt die eigentlichen Steps (Capture/Doctor/Charts) sequentiell aus, loggt Start/Ende. |
| Event-Bindings | Buttons (Save BP/Body, Chart, Export), Datum, Tabs, Unlock. |
| Helper | `withBusy`, `flashButtonOk`, `uiError`, `getCaptureDayIso`, `maybeRunTrendpilotAfterBpSave`. |

---

## 3. Router / Tabs

- Tabs werden mit `setTab(tabId)` (`assets/js/ui-tabs.js`) gesteuert.  
  - Beim Wechsel zu „Arzt-Ansicht“ → `requireDoctorUnlock`.  
  - Tab-Switch löst `requestUiRefresh({ doctor: true, chart: true? })` aus.
- Capture-View ist Standard (active).  
  - `bpContextSel` (Morgen/Abend) initialisiert.  
  - Datum `#date` reagiert auf Änderungen → `maybeRefreshForTodayChange`.

---

## 4. requestUiRefresh / runUiRefresh

### 4.1 requestUiRefresh(opts)

1. Receives Options (`doctor`, `chart`, `lifestyle` etc.). Setzt Flags (`uiRefreshState.docNeeded`, ...).
2. Erstellt Promise und speichert Resolver in `uiRefreshState.resolvers`.
3. Falls noch kein Refresh läuft, startet Timer → `runUiRefresh`.
4. Logging: `[ui] refresh start reason=...`.

### 4.2 runUiRefresh()

1. Setzt `uiRefreshState.running = true`.
2. Führt Steps nacheinander aus (`asyncMaybe` pattern):
   - `renderCapture` (z. B. `refreshCaptureIntake`).
   - `renderDoctor` (falls `docNeeded`).
   - `renderChart`, `renderLifestyle`, etc., abhängig von Flags.
3. Nach Abschluss: Resolvers auflösen (`Promise.resolve()`), Flags zurücksetzen, Logging `[ui] refresh end reason=...`.
4. Touch-Log enthält Step-Markierungen (`[ui] step start doctor`, `[ui] step end doctor`).

---

## 5. Event-Bindings (Auswahl)

- **Blutdruck Panel** – `saveBpPanelBtn` Click:  
  - Check Login, `withBusy`, Save (`bp.saveBlock`), `requestUiRefresh({ reason: 'panel:bp' })`, Trendpilot-Hook.
- **Körper Panel** – analog `saveBodyPanelBtn`.  
- **Datum** – `#date` change → Refresh Reset + Prefills.  
- **Chart Button** – `#doctorChartBtn` → `requestUiRefresh({ chart: true })` (Doctor-Fokus).  
- **Range Apply** – `#applyRange` → einfach Refresh mit `reason: 'doctor:range'`.
- **Delete Day** – in `doctor/index.js`, aber `main.js` loggt diag falls Buttons fehlen.  
- **Login Overlay, Unlock Buttons** – via `createSupabaseFn('showLoginOverlay')`, `requireDoctorUnlock`.

---

## 6. Touch-Log / Diagnostics

- `touchLog` (`<pre id="touchLog">`) sammelt diag-Einträge:
  - `[ui] refresh start/end reason=...`.
  - `[resume] ...`, `[capture] ...`, `[panel] ...`.
- `diag.add` in `main.js` und Submodulen, um Fehlerpfade nachzuvollziehen.
- `logDoctorError` (Doctor), `[chart] trendpilot bands failed` (Chart), etc., landen ebenfalls im Log.

---

## 7. Resume / Background Flow

- Supabase `setupRealtime` plus `resumeFromBackground` rufen `requestUiRefresh({ reason: 'resume' })`.
- `document.addEventListener('visibilitychange')`, `focus`, `pageshow` triggern diag + optional Refresh.  
- Touch-Log: `[resume] start`, `[resume] ui refresh requested`, `[resume] loggedFast=true`.

---

## 8. Sicherheitsmechanismen

- `getSupabaseApi` + `createSupabaseFn`: Verhindern API-Aufrufe, wenn Supabase nicht ready ist.
- Busy-Buttons: `withBusy(btn, true)` blockiert Mehrfachklicks.
- Unlock: `isDoctorUnlocked()` prüft Guard-State, `setAuthPendingAfterUnlock` hält Pending-Actions.
- Fehlerbanner: If `ensureModulesReady()` fails, UI zeigt Banner („Module fehlen ...“).

---

## 9. Erweiterungsideen

- Router-Historie (z. B. Hash oder URL Param, um Tab/Datum zu behalten).
- Bessere Toast/Notification bei Refresh-Resultaten (z. B. Chart aktualisiert).
- Modularisierung: einzelne Steps (Capture, Doctor, Chart) in separate Files extrahieren.

---

Dieses Overview bitte aktualisieren, wenn `main.js` neue Tabs, Flags oder Diagnose-Hooks erhält.
