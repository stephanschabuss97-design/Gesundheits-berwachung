# Trendpilot Module â€“ Functional Overview

Dieses Dokument fasst die komplette Funktionsweise des Trendpilot-Subsystems zusammen. Es dient als â€žSingle Source of Truthâ€œ, damit andere Chats oder Mitwirkende verstehen, wie das Feature aufgebaut ist, welche Dateien beteiligt sind und welche AblÃ¤ufe/AbhÃ¤ngigkeiten bestehen.

---

## 1. Zielsetzung

Der Trendpilot Ã¼berwacht mittel- bis langfristige VerÃ¤nderungen im Blutdruckverlauf (Morgen/Abend). Statt einzelne Messspitzen zu melden, beobachtet er Wochenfenster, berechnet Deltas gegenÃ¼ber einer Baseline und erzeugt System-Kommentare in Supabase. Diese Kommentare erscheinen in der Arzt-Ansicht, im Capture-Header (Pill) und als Hintergrundstreifen im BP-Chart. Kritische Hinweise erzwingen einen BestÃ¤tigungsdialog.

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `assets/js/trendpilot/data.js` | Mathematischer Unterbau: transformiert Tagesdaten (`computeDailyBpStats`), gruppiert Wochen, berechnet gleitende Baselines und Deltas (`calcMovingBaseline`, `buildTrendWindow`), legt Defaults (`TREND_PILOT_DEFAULTS`) fest. |
| `assets/js/trendpilot/index.js` | Orchestriert Trendanalyse: Hook nach Abend-Save, Supabase-Integration, Dialoganzeige, Pill/Legend Events. Registriert API (`AppModules.trendpilot`). |
| `app/supabase/api/system-comments.js` | REST-Client fÃ¼r `health_events`: erstellt/patcht `system_comment`-EintrÃ¤ge, verwaltet Ack/Doctor-Status im JSON-Payload. Exportiert `fetchSystemCommentsRange`, `upsertSystemCommentRemote`, `setSystemCommentAck`, `setSystemCommentDoctorStatus`. |
| `assets/js/main.js` | Bindet den Capture-Hook: Nach Abend-Save â†’ `runTrendpilotAnalysis(day)`; Handles log + Fehlermeldung. |
| `app/modules/capture/index.js` | Zeigt im Capture-Header eine Trendpilot-Pill (Severity, Datum, Kurztext); reagiert auf `trendpilot:latest` Events. |
| `app/modules/doctor/index.js` | Rendert den Trendpilot-Hinweisblock, ruft `fetchSystemCommentsRange`, erlaubt Statusbuttons (â€žgeplantâ€œ, â€žerledigtâ€œ, â€žzurÃ¼cksetzenâ€œ), loggt Fehler. |
| `app/modules/charts/index.js` & `app/modules/charts/chart.css` | Zeichnen Trendpilot-HintergrundbÃ¤nder auf dem BP-Chart, ergÃ¤nzen Legende. |
| `docs/QA_CHECKS.md` & `docs/Trendpilot Roadmap (Manual).md` | Dokumentation und QA-Guidelines. |

---

## 3. Ablauf / Speicherfluss

### 3.1 Feature-Flag

`config.js` liefert `TREND_PILOT_ENABLED`. Default: `true`. Besonderheiten:
- Flag lÃ¤sst sich via `localStorage.TREND_PILOT_ENABLED` oder `data-trend-pilot-enabled` toggeln.
- `trendpilot/index.js` initialisiert nur, wenn Flag aktiv ist. Sonst bleibt die Stub-API aktiv (keine Warnungen).

### 3.2 Capture â†’ Hook

1. Nutzer gibt Abendmessung ein, klickt â€žBlutdruck speichernâ€œ (`assets/js/main.js`).
2. Nach erfolgreichem Save ruft `maybeRunTrendpilotAfterBpSave('A')`.
3. `runTrendpilotAnalysis(dayIso)`:
   - Normalisiert Datum (`normalizeDayIso`).
   - Holt Tages-/Wochenfenster via `loadDailyStats` â†’ `fetchDailyOverview()` (Supabase) â†’ `buildTrendWindow()`.
   - Berechnet `weekly` und `baseline` Serien, wendet Default-Minimum (mindestens 4, max. `TREND_PILOT_DEFAULTS.minWeeks`, nie mehr als vorhandene Wochen) an.
   - Zu wenige Wochen â†’ `reason: 'not_enough_data'`, `diag.add` & Toast.
   - Deltas â†’ `calcLatestDelta` â†’ `classifyTrendDelta` (Severity: `info | warning | critical`).
   - `warning/critical`: `persistSystemComment` â†’ `upsertSystemCommentRemote` (Ack=false, `context.ack=false`). Danach `showSeverityDialog()` â†’ PflichtbestÃ¤tigung. Bei Erfolg: `acknowledgeSystemComment` (setzt `context.ack=true`).
   - `info`: Toast â€žTrend stabil. Weiter so!â€œ, kein System-Kommentar.

### 3.3 Supabase / System Comments

- Tabelle `health_events`, `type='system_comment'`.
- Ack/Doctor-Status werden in `payload.context` gespeichert (`{ ack: boolean, doctorStatus: 'none'|'planned'|'done' }`).
- REST-Aufrufe (`system-comments.js`) greifen ausschlieÃŸlich auf JSON-Attr zu (`payload->context->>ack`), sodass keine zusÃ¤tzlichen Tabellen-Spalten nÃ¶tig sind.
- API-Funktionen:
  - `fetchSystemCommentsRange({ from, to, metric })` â€“ liefert normalisierte EintrÃ¤ge (Ack/DoctorStatus aus Kontext).
  - `upsertSystemCommentRemote` â€“ Insert/Patch je Tag & Metric.
  - `setSystemCommentAck`, `setSystemCommentDoctorStatus` â€“ laden Eintrag, aktualisieren `payload.context` und patchen.

### 3.4 Anzeige

1. **Capture-Pill (`app/modules/capture/index.js`):**
   - HÃ¶rt auf `trendpilot:latest` Events (dispatch bei init und Refresh).
   - Zeigt severitybasierte Pill (`warn`/`bad`), Datum, Kurztext; versteckt sich bei fehlendem Eintrag.
   - ARIA/Tooltip enthalten Textvorschau.

2. **Arzt-Ansicht (`app/modules/doctor/index.js`):**
   - Beim Rendern: `loadTrendpilotEntries(from, to)` â†’ `fetchSystemCommentsRange`.
   - Trendpilot-Sektion zeigt EintrÃ¤ge (Datum, Severity-Badge, Ack-Status, Arztstatus, Text). Buttons setzen `doctorStatus` via Supabase.
   - Fehler (z.B. fehlende Daten) werden einmalig geloggt (`logDoctorError` + Touch-Log).

3. **Chart (`app/modules/charts/index.js`):**
   - Beim BP-Draw: `loadTrendpilotBands({ from, to })`.
   - FÃ¼r jedes Warning/Critical wird ein transluzenter Tag-Streifen gerendert (`<rect class="trendpilot-band ...">`), Legende ergÃ¤nzt Swatches.

4. **Dialog & Toasts:**
   - Kritische Meldungen: Modal mit Text, Deltas, Button â€žZur Kenntnis genommenâ€œ â€“ erst nach Ack wird Supabase gepatcht.
   - Info (stabil) und not_enough_data â†’ Toast + `diag.add` (zur Fehlersuche im Touch-Log).

---

## 4. Fehler-/Diagnoseverhalten

- **Dependency Logging:** `trendpilot/index.js` loggt fehlende AbhÃ¤ngigkeiten (z.B. wenn Supabase-Exports noch fehlen). Das verhindert stille Fehler.
- **Not enough data:** diag + Toast, kein System-Kommentar. (Sobald mehr Wochen vorhanden sind, lÃ¤uft es automatisch durch.)
- **Supabase-REST-Fehler:** `doctor/index.js` loggt `[doctor] trendpilot fetch failed ...`. Touch-Log zeigt `"[sbSelect] ... failed"`.
- **Hook-Fehler:** `maybeRunTrendpilotAfterBpSave` fÃ¤ngt Exceptions, schreibt `[trendpilot] hook failed`.

---

## 5. Erweiterungspunkte / Zukunft

- KI-gestÃ¼tzte Texte (Phase 2): `system_comment.payload.text_llm`, orchestriert durch kÃ¼nftige Zeus/LLM-Module.
- Weitere Metriken (Gewicht, Waist) kÃ¶nnten analog eingebunden werden (Trendpilot-API ist generisch pro Metric).
- ZusÃ¤tzliche UI-Hinweise (z.B. akute Alerts bei Einzelspitzen) kÃ¶nnen Ã¼ber Toasts/Color-Coding ergÃ¤nzt werden.

---

## 6. Checkliste

1. **Flag aktiv?** (`TREND_PILOT_ENABLED=true`)
2. **Genug Wochen (>4)?** Sonst nur Toast und kein Systemkommentar.
3. **Supabase-Exports vorhanden?** `fetchSystemCommentsRange`, `upsertSystemCommentRemote`, `setSystemCommentAck`, `setSystemCommentDoctorStatus`.
4. **Netzwerk:** REST-Endpoint (`webhookUrl`) korrekt; 400er zeigen meist JSON/Filter-Probleme.
5. **UI-Sync:** Nach neuem Kommentar immer `trendpilot:latest` Event â†’ Capture-Pill + Chart/Doctor-Refresh.

---

Damit ist das Trendpilot-Modul dokumentiert. Ã„nderungen an Logik, Flag oder Supabase-Integration sollten hier nachgetragen werden.
