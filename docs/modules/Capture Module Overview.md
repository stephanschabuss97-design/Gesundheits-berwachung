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
| `app/modules/capture/bp.js` | Blutdruck-spezifische Funktionen (`saveBlock`, Kommentar-Pflicht, Panel-Reset). Nutzt `capture/entry.js` für gemeinsame Basisdatensätze. |
| `app/modules/capture/body.js` | Körperpanel (Gewicht, Bauchumfang) speichern/prefillen; greift auf denselben Entry-Helper zurück. |
| `app/modules/capture/entry.js` | Shared Helper `createBaseEntry` – stellt das Skelett für alle Capture-Einträge bereit. |
| `assets/js/main.js` | Bindet Buttons, Datum, Unlock-Logik, orchestriert `requestUiRefresh`. |
| `app/styles/capture.css` | (Legacy) Styles für Accordion-Ansicht; zentrale Hub-Styles liegen in `app/styles/hub.css`. |
| `app/core/config.js` | Flags (z.B. `TREND_PILOT_ENABLED` indirekt, `DEV_ALLOW_DEFAULTS`). |

---

## 3. Ablauf / Datenfluss

### 3.1 Panel-Struktur (Hub v2)

- Die klassischen Accordions wurden durch Hub-Panels ersetzt:
  1. **Intake-Panel (`data-hub-panel="intake"`)** – Overlay mit Wasser/Salz/Protein Inputs.
  2. **Vitals-Panel (`data-hub-panel="vitals"`)** – kombiniert Blutdruck (Morgens/Abends) und Körperdaten.
  3. **Doctor-Panel** – zeigt Werte/Trendpilot (zugriffsgeschützt).
  4. Weitere Panels (Help/Diag) sind placeholders, aber außerhalb dieses Moduls.
- Orbit-Buttons (`data-hub-module="…"`) in `hub/index.js` steuern die sichtbaren Panels (inkl. Biometrics-Flow für Doctor).

### 3.2 Datum & Auto-Reset

- Datum (`#date`) default = heute (`todayStr()`).
- `maybeRefreshForTodayChange` überwacht Wechsel, aktualisiert Panels + Flags (`__lastKnownToday`).
- `scheduleMidnightRefresh` & `scheduleNoonSwitch` (globals) sorgen für Tagesreset und BP-Kontext-Umschaltung.
- `capture/globals` speichern Timer-IDs, Busy-Status, `__bpUserOverride`.

### 3.3 Blutdruck Flow (`bp.js`) – unverändert, aber über Hub-Panel ausgelöst

1. Speichern-Button (`saveBpPanelBtn` in `main.js`) ruft `window.AppModules.bp.saveBlock`.
   - Validiert Eingaben (Sys & Dia erforderlich, Puls optional nur mit BP).
   - Speichert Event via `addEntry` (lokal) + `syncWebhook` (Supabase).
   - Kommentare via `appendNote`, separate Einträge.
2. Nach Save: Panel reset, `updateBpCommentWarnings` neu berechnet (Pflicht bei >130/>90). Das Vitals-Panel bleibt im Hub geöffnet; ein erneutes Öffnen läuft über den Orbit-Button.
3. Falls Abendmessung: `maybeRunTrendpilotAfterBpSave`.

### 3.4 Körper Flow (`body.js`)

1. `saveBodyPanelBtn` speichert Tagessummary (`saveDaySummary`), ruft `syncWebhook`.
2. `prefillBodyInputs` nutzt letzte Werte (z.B. Copy vom letzten Tag).
3. Buttons disabled, wenn nicht eingeloggt oder das Panel gerade gespeichert wird (`setBusy`).

> **Shared Entry Helper:** Sowohl `saveBlock` als auch `saveDaySummary` nutzen `app/modules/capture/entry.js` (`createBaseEntry`) um ein konsistentes Datensatz-Skelett (Date, Context, Notes) zu erzeugen. Damit bleibt die Struktur across BP/Körper identisch, egal welches Panel speichert.

### 3.5 Intake Flow

Siehe `docs/modules/Intake Module Overview.md`. Capture-Modul stellt Buttons, Timer und Pill-Status bereit.

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
- Touchlog Phase 0.5: `[capture] refresh start/done reason=?` erscheint pro Reason/Tag genau einmal; Mehrfachtrigger landen als `(xN)` am Done-Eintrag. Boot, manuelle Refreshs und Resume sind damit deterministisch pr?fbar.
- `diag.add` in allen Fehlerpfaden (RPC-Fails, Save-Fails, Auto-Refresh).
- `uiError` zeigt User-Feedback (Speichern fehlgeschlagen, keine Daten).

---

## 5. Sicherheits-/Edge Cases

- Eingabevalidierung bei allen Feldern (Zahl oder `toNumDE`).
- Mortg. vs. Abend: Kontext wählbar (`#bpContextSel`), Auto-Switch zur Mittagszeit.
- Kommentar-Pflicht: `requiresBpComment`/`updateBpCommentWarnings`.
- Locking: Buttons disabled bei `setBusy(true)`, `AppModules.captureGlobals.setBusy`.
- Undo/Reset: `resetCapturePanels` (Intake/Body/BP) – z.B. nach Tab-Wechsel oder Unlock.
- Boot-Flow Guard: Handler greifen erst zu, wenn `AppModules.bootFlow` mindestens `INIT_MODULES` erreicht; davor ignorieren sie Klicks und Timer-Callbacks, sodass der Hub während des Boot-Overlays nicht reagiert.

---

## 6. Erweiterungsvorschläge

- Quick Actions (z.B. +250 ml Voreinstellung).
- Mehr Metriken (z.B. Supplements).
- Inline-Notiz pro Intake (wie BP-Kommentar).
- Visualisierung (Mini-Chart) direkt im Capture.

---

Bei Änderungen an Capture (neue Felder, Timer, RPCs) sollte dieses Dokument aktualisiert werden, damit der Modulüberblick aktuell bleibt.
