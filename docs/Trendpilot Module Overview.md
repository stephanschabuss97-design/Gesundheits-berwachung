# Trendpilot Module – Functional Overview

Dieses Dokument fasst die komplette Funktionsweise des Trendpilot-Subsystems zusammen. Es dient als „Single Source of Truth“, damit andere Chats oder Mitwirkende verstehen, wie das Feature aufgebaut ist, welche Dateien beteiligt sind und welche Abläufe/Abhängigkeiten bestehen.

---

## 1. Zielsetzung

Der Trendpilot überwacht mittel- bis langfristige Veränderungen im Blutdruckverlauf (Morgen/Abend). Statt einzelne Messspitzen zu melden, beobachtet er Wochenfenster, berechnet Deltas gegenüber einer Baseline und erzeugt System-Kommentare in Supabase. Diese Kommentare erscheinen in der Arzt-Ansicht, im Capture-Header (Pill) und als Hintergrundstreifen im BP-Chart. Kritische Hinweise erzwingen einen Bestätigungsdialog.

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `assets/js/trendpilot/data.js` | Mathematischer Unterbau: transformiert Tagesdaten (`computeDailyBpStats`), gruppiert Wochen, berechnet gleitende Baselines und Deltas (`calcMovingBaseline`, `buildTrendWindow`), legt Defaults (`TREND_PILOT_DEFAULTS`) fest. |
| `assets/js/trendpilot/index.js` | Orchestriert Trendanalyse: Hook nach Abend-Save, Supabase-Integration, Dialoganzeige, Pill/Legend Events. Registriert API (`AppModules.trendpilot`). |
| `assets/js/supabase/api/system-comments.js` | REST-Client für `health_events`: erstellt/patcht `system_comment`-Einträge, verwaltet Ack/Doctor-Status im JSON-Payload. Exportiert `fetchSystemCommentsRange`, `upsertSystemCommentRemote`, `setSystemCommentAck`, `setSystemCommentDoctorStatus`. |
| `assets/js/main.js` | Bindet den Capture-Hook: Nach Abend-Save → `runTrendpilotAnalysis(day)`; Handles log + Fehlermeldung. |
| `assets/js/capture/index.js` | Zeigt im Capture-Header eine Trendpilot-Pill (Severity, Datum, Kurztext); reagiert auf `trendpilot:latest` Events. |
| `assets/js/doctor/index.js` | Rendert den Trendpilot-Hinweisblock, ruft `fetchSystemCommentsRange`, erlaubt Statusbuttons („geplant“, „erledigt“, „zurücksetzen“), loggt Fehler. |
| `assets/js/charts/index.js` & `assets/css/chart.css` | Zeichnen Trendpilot-Hintergrundbänder auf dem BP-Chart, ergänzen Legende. |
| `docs/QA_CHECKS.md` & `docs/Trendpilot Roadmap (Manual).md` | Dokumentation und QA-Guidelines. |

---

## 3. Ablauf / Speicherfluss

### 3.1 Feature-Flag

`config.js` liefert `TREND_PILOT_ENABLED`. Default: `true`. Besonderheiten:
- Flag lässt sich via `localStorage.TREND_PILOT_ENABLED` oder `data-trend-pilot-enabled` toggeln.
- `trendpilot/index.js` initialisiert nur, wenn Flag aktiv ist. Sonst bleibt die Stub-API aktiv (keine Warnungen).

### 3.2 Capture → Hook

1. Nutzer gibt Abendmessung ein, klickt „Blutdruck speichern“ (`assets/js/main.js`).
2. Nach erfolgreichem Save ruft `maybeRunTrendpilotAfterBpSave('A')`.
3. `runTrendpilotAnalysis(dayIso)`:
   - Normalisiert Datum (`normalizeDayIso`).
   - Holt Tages-/Wochenfenster via `loadDailyStats` → `fetchDailyOverview()` (Supabase) → `buildTrendWindow()`.
   - Berechnet `weekly` und `baseline` Serien, wendet Default-Minimum (mindestens 4, max. `TREND_PILOT_DEFAULTS.minWeeks`, nie mehr als vorhandene Wochen) an.
   - Zu wenige Wochen → `reason: 'not_enough_data'`, `diag.add` & Toast.
   - Deltas → `calcLatestDelta` → `classifyTrendDelta` (Severity: `info | warning | critical`).
   - `warning/critical`: `persistSystemComment` → `upsertSystemCommentRemote` (Ack=false, `context.ack=false`). Danach `showSeverityDialog()` → Pflichtbestätigung. Bei Erfolg: `acknowledgeSystemComment` (setzt `context.ack=true`).
   - `info`: Toast „Trend stabil. Weiter so!“, kein System-Kommentar.

### 3.3 Supabase / System Comments

- Tabelle `health_events`, `type='system_comment'`.
- Ack/Doctor-Status werden in `payload.context` gespeichert (`{ ack: boolean, doctorStatus: 'none'|'planned'|'done' }`).
- REST-Aufrufe (`system-comments.js`) greifen ausschließlich auf JSON-Attr zu (`payload->context->>ack`), sodass keine zusätzlichen Tabellen-Spalten nötig sind.
- API-Funktionen:
  - `fetchSystemCommentsRange({ from, to, metric })` – liefert normalisierte Einträge (Ack/DoctorStatus aus Kontext).
  - `upsertSystemCommentRemote` – Insert/Patch je Tag & Metric.
  - `setSystemCommentAck`, `setSystemCommentDoctorStatus` – laden Eintrag, aktualisieren `payload.context` und patchen.

### 3.4 Anzeige

1. **Capture-Pill (`assets/js/capture/index.js`):**
   - Hört auf `trendpilot:latest` Events (dispatch bei init und Refresh).
   - Zeigt severitybasierte Pill (`warn`/`bad`), Datum, Kurztext; versteckt sich bei fehlendem Eintrag.
   - ARIA/Tooltip enthalten Textvorschau.

2. **Arzt-Ansicht (`assets/js/doctor/index.js`):**
   - Beim Rendern: `loadTrendpilotEntries(from, to)` → `fetchSystemCommentsRange`.
   - Trendpilot-Sektion zeigt Einträge (Datum, Severity-Badge, Ack-Status, Arztstatus, Text). Buttons setzen `doctorStatus` via Supabase.
   - Fehler (z.B. fehlende Daten) werden einmalig geloggt (`logDoctorError` + Touch-Log).

3. **Chart (`assets/js/charts/index.js`):**
   - Beim BP-Draw: `loadTrendpilotBands({ from, to })`.
   - Für jedes Warning/Critical wird ein transluzenter Tag-Streifen gerendert (`<rect class="trendpilot-band ...">`), Legende ergänzt Swatches.

4. **Dialog & Toasts:**
   - Kritische Meldungen: Modal mit Text, Deltas, Button „Zur Kenntnis genommen“ – erst nach Ack wird Supabase gepatcht.
   - Info (stabil) und not_enough_data → Toast + `diag.add` (zur Fehlersuche im Touch-Log).

---

## 4. Fehler-/Diagnoseverhalten

- **Dependency Logging:** `trendpilot/index.js` loggt fehlende Abhängigkeiten (z.B. wenn Supabase-Exports noch fehlen). Das verhindert stille Fehler.
- **Not enough data:** diag + Toast, kein System-Kommentar. (Sobald mehr Wochen vorhanden sind, läuft es automatisch durch.)
- **Supabase-REST-Fehler:** `doctor/index.js` loggt `[doctor] trendpilot fetch failed ...`. Touch-Log zeigt `"[sbSelect] ... failed"`.
- **Hook-Fehler:** `maybeRunTrendpilotAfterBpSave` fängt Exceptions, schreibt `[trendpilot] hook failed`.

---

## 5. Erweiterungspunkte / Zukunft

- KI-gestützte Texte (Phase 2): `system_comment.payload.text_llm`, orchestriert durch künftige Zeus/LLM-Module.
- Weitere Metriken (Gewicht, Waist) könnten analog eingebunden werden (Trendpilot-API ist generisch pro Metric).
- Zusätzliche UI-Hinweise (z.B. akute Alerts bei Einzelspitzen) können über Toasts/Color-Coding ergänzt werden.

---

## 6. Checkliste

1. **Flag aktiv?** (`TREND_PILOT_ENABLED=true`)
2. **Genug Wochen (>4)?** Sonst nur Toast und kein Systemkommentar.
3. **Supabase-Exports vorhanden?** `fetchSystemCommentsRange`, `upsertSystemCommentRemote`, `setSystemCommentAck`, `setSystemCommentDoctorStatus`.
4. **Netzwerk:** REST-Endpoint (`webhookUrl`) korrekt; 400er zeigen meist JSON/Filter-Probleme.
5. **UI-Sync:** Nach neuem Kommentar immer `trendpilot:latest` Event → Capture-Pill + Chart/Doctor-Refresh.

---

Damit ist das Trendpilot-Modul dokumentiert. Änderungen an Logik, Flag oder Supabase-Integration sollten hier nachgetragen werden.
