# Capture Module – Functional Overview

Dieses Dokument beschreibt das Capture-Modul des Gesundheits-Loggers. Es umfasst die komplette Tageserfassung (Intake, Blutdruck, Körper) inklusive Bedienlogik, Datenflüsse zu Supabase und die wichtigsten Diagnose-/Reset-Mechanismen.

---

## 1. Zielsetzung

Das Capture-Modul ist die primäre Oberfläche für tägliche Eingaben:
- Wasser/Salz/Protein (siehe Intake).
- Blutdruck morgens/abends inkl. Kommentare, Pflichtlogik.
- Körperwerte (Gewicht, Bauchumfang, Fett/Muskelprozent/-kg).
- Datumsauswahl, automatische Resets/Prefills, Verknüpfung mit Trendpilot/Charts.


---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `app/modules/capture/index.js` | Kernlogik: Handlers für Intake/Blutdruck/Body, Timer, Status-Pills, UI-Reset. |
| `app/core/capture-globals.js` | Shared State (`captureIntakeState`, Timer, Flags), Utility `setBusy`, `softWarnRange`. |
| `app/modules/capture/bp.js` | Blutdruck-spezifische Funktionen (`saveBlock`, Kommentar-Pflicht, Panel-Reset). |
| `app/modules/capture/body.js` | Körperpanel (Gewicht, Bauchumfang) speichern/prefillen. |
| `assets/js/main.js` | Bindet Buttons, Datum, Unlock-Logik, orchestriert `requestUiRefresh`. |
| `app/styles/capture.css` | Styles für Accordion, Buttons, Pill-Reihe, Responsive Layout (eingebunden via `app/app.css`). |
| `app/core/config.js` | Flags (z.B. `TREND_PILOT_ENABLED` indirekt, `DEV_ALLOW_DEFAULTS`). |

---

## 3. Ablauf / Datenfluss

### 3.1 Panel-Struktur

- Capture-View (`#capture`) enthält Cards:
  1. **Intake (`#captureIntake`)** – Buttons für Wasser/Salz/Protein.
  2. **Blutdruck (`#bodyAccordion`)** – Tabs Morgens/Abends, Felder Sys/Dia/Puls, Kommentartextareas, Speichern-Button.
  3. **Körper** – Gewicht/Bauchumfang/Fett%/Muskel%.
  4. (formerly appts, nun entfernt).

### 3.2 Datum & Auto-Reset

- Datum (`#date`) default = heute (`todayStr()`).
- `maybeRefreshForTodayChange` überwacht Wechsel, aktualisiert Panels + Flags (`__lastKnownToday`).
- `scheduleMidnightRefresh` & `scheduleNoonSwitch` (globals) sorgen für Tagesreset und BP-Kontext-Umschaltung.
- `capture/globals` speichern Timer-IDs, Busy-Status, `__bpUserOverride`.

### 3.3 Blutdruck Flow (`bp.js`)

1. Speichern-Button (`saveBpPanelBtn` in `main.js`) ruft `window.AppModules.bp.saveBlock`.
   - Validiert Eingaben (Sys & Dia erforderlich, Puls optional nur mit BP).
   - Speichert Event via `addEntry` (lokal) + `syncWebhook` (Supabase).
   - Kommentare via `appendNote`, separate Einträge.
2. Nach Save: Panel reset, `updateBpCommentWarnings` neu berechnet (Pflicht bei >130/>90).
3. Falls Abendmessung: `maybeRunTrendpilotAfterBpSave`.

### 3.4 Körper Flow (`body.js`)

1. `saveBodyPanelBtn` speichert Tagessummary (`saveDaySummary`), ruft `syncWebhook`.
2. `prefillBodyInputs` nutzt letzte Werte (z.B. Copy vom letzten Tag).
3. Buttons disabled, wenn nicht eingeloggt.

### 3.5 Intake Flow

Siehe `docs/Intake Module Overview.md`. Capture-Modul stellt Buttons, Timer und Pill-Status bereit.

### 3.6 Verbindung zu anderen Modulen

- **Charts:** KPIs/Charts zielen auf denselben Datumskontext; `requestUiRefresh({ chart: ... })`.
- **Trendpilot:** Hook im BP-Save; Pill (Trendpilot) im Header.
- **Doctor:** Datum/Range synchronisiert, `refreshCaptureIntake` nach Range-Wechsel.

---

## 4. Diagnose / Logging

- Touch-Log-Einträge:
  - `[capture] loadIntakeToday ...`
  - `[capture] reset intake ...`
  - `[panel] bp save while auth unknown`
  - `[body] cleared`, `[bp:auto ...]`
- `diag.add` in allen Fehlerpfaden (RPC-Fails, Save-Fails, Auto-Refresh).
- `uiError` zeigt User-Feedback (Speichern fehlgeschlagen, keine Daten).

---

## 5. Sicherheits-/Edge Cases

- Eingabevalidierung bei allen Feldern (Zahl oder `toNumDE`).
- Mortg. vs. Abend: Kontext wählbar (`#bpContextSel`), Auto-Switch zur Mittagszeit.
- Kommentar-Pflicht: `requiresBpComment`/`updateBpCommentWarnings`.
- Locking: Buttons disabled bei `setBusy(true)`, `AppModules.captureGlobals.setBusy`.
- Undo/Reset: `resetCapturePanels` (Intake/Body/BP) – z.B. nach Tab-Wechsel oder Unlock.

---

## 6. Erweiterungsvorschläge

- Quick Actions (z.B. +250 ml Voreinstellung).
- Mehr Metriken (z.B. Supplements).
- Inline-Notiz pro Intake (wie BP-Kommentar).
- Visualisierung (Mini-Chart) direkt im Capture.

---

Bei Änderungen an Capture (neue Felder, Timer, RPCs) sollte dieses Dokument aktualisiert werden, damit der Modulüberblick aktuell bleibt.
