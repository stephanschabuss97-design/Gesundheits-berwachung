# Trendpilot Module – Functional Overview

Dieses Dokument fasst die komplette Funktionsweise des Trendpilot-Subsystems zusammen. Es dient als „Single Source of Truth“, damit alle Mitwirkenden verstehen, wie das Feature aufgebaut ist, welche Dateien beteiligt sind und welche Abläufe/Abhängigkeiten bestehen – inklusive Integration in den MIDAS Hub.

---

## 1. Zielsetzung

Der Trendpilot überwacht mittel- bis langfristige Veränderungen im Blutdruckverlauf (Morgen/Abend). Statt einzelne Messspitzen zu melden, beobachtet er Wochenfenster, berechnet Deltas gegenüber einer Baseline und erzeugt System-Kommentare in Supabase. Diese Kommentare erscheinen in der Arzt-Ansicht (Hub-Overlay), im Capture-Header (Pill) und als Hintergrundstreifen im BP-Chart. Kritische Hinweise erzwingen einen Bestätigungsdialog.

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `app/modules/trendpilot/data.js` | Mathematischer Unterbau: Tagesdaten transformieren (`computeDailyBpStats`), Wochen gruppieren, Baselines/Deltas berechnen (`calcMovingBaseline`, `buildTrendWindow`). Enthält Defaults (`TREND_PILOT_DEFAULTS`). |
| `app/modules/trendpilot/index.js` | Orchestriert Trendanalyse: Hook nach Abend-Save, Supabase-Integration, Dialoganzeige, Pill/Legend Events. Registriert API (`AppModules.trendpilot`). |
| `app/supabase/api/system-comments.js` | REST-Client für `health_events`: erstellt/patcht `system_comment`-Einträge, verwaltet Ack/Doctor-Status im JSON-Payload (`context.ack`, `context.doctorStatus`). |
| `app/supabase/api/doctor.js` | Liefert Trendpilot-Bänder und Daily-Range für Chart/Doctor (REST Views). |
| `assets/js/main.js` | Bindet den Capture-Hook (`maybeRunTrendpilotAfterBpSave`) und loggt Fehler. |
| `app/modules/capture/index.js` | Zeigt im Hub-Header eine Trendpilot-Pill (Severity, Datum, Kurztext); reagiert auf `trendpilot:latest`. |
| `app/modules/doctor/index.js` | Rendert den Trendpilot-Hinweisblock im Hub-Overlay, lädt Range, bietet Status-Buttons. |
| `app/modules/charts/index.js` + Styles | Zeichnen Trendpilot-Hintergrundbänder und Legende im BP-Chart. |
| `docs/Trendpilot Roadmap (Manual).md` | Roadmap & QA-Checkliste. |

---

## 3. Ablauf / Speicherfluss

### 3.1 Feature-Flag

`TREND_PILOT_ENABLED` (Config oder `localStorage`) steuert, ob `app/modules/trendpilot/index.js` initialisiert. Ist das Flag aus, bleibt nur die Stub-API aktiv (keine Hinweise, keine Fehler).

### 3.2 Capture ? Hook

1. Nutzer erfasst Abendmessung und klickt „Blutdruck speichern“.
2. Nach erfolgreichem Save ruft `maybeRunTrendpilotAfterBpSave('A')` ? `runTrendpilotAnalysis(dayIso)`.
3. Analyse-Pipeline:
   - Normalisiert Datum (`normalizeDayIso`).
   - Holt Tages-/Wochenfenster via `loadDailyStats` ? `fetchDailyOverview` ? `buildTrendWindow`.
   - Berechnet Baseline vs. aktuelle Woche, prüft Mindestanzahl Wochen.
   - Severity-Einstufung über `classifyTrendDelta` (`info | warning | critical`).
   - `warning/critical`: `persistSystemComment` ? `upsertSystemCommentRemote` (Ack=false, DoctorStatus=none), danach Dialog ? `setSystemCommentAck`.
   - `info`: Toast „Trend stabil“ (kein System-Kommentar).

### 3.3 Supabase / System Comments

- Tabelle `health_events`, `type='system_comment'`.
- Ack/Doctor-Status liegen in `payload.context` (`{ ack: boolean, doctorStatus: 'none'|'planned'|'done' }`).
- API-Funktionen: `fetchSystemCommentsRange`, `upsertSystemCommentRemote`, `setSystemCommentAck`, `setSystemCommentDoctorStatus`.

### 3.4 Anzeige

1. **Capture-Pill (Hub-Header)**
   - `capture/index.js` hört auf `trendpilot:latest` Events (dispatch bei Init/Refresh).
   - Zeigt severitybasierte Pill (`warn`/`bad`), Datum, Kurztext; versteckt sich bei fehlendem Eintrag.

2. **Arzt-Ansicht (Hub-Overlay)**
   - `doctor/index.js` lädt `fetchSystemCommentsRange` für den ausgewählten Zeitraum.
   - Trendpilot-Sektion zeigt Einträge (Datum, Severity-Badge, Ack-/Doctor-Status). Buttons patchen Supabase.

3. **Chart**
   - `charts/index.js` ruft `loadTrendpilotBands` (API `doctor.js`), zeichnet transluzente Tag-Streifen + Legende.

4. **Dialog & Toasts**
   - Kritische Meldungen ? Modal mit Text, Deltas, „Zur Kenntnis genommen“ (Ack-Pflicht).
   - Stabil/not enough data ? Toast + `diag.add`.

---

## 4. Fehler-/Diagnoseverhalten

- Dependency Logging: Fehlen Supabase-Exports, schreibt `trendpilot/index.js` eine Warnung (`diag.add`).
- „Not enough data“: diag + Toast, kein Systemkommentar; läuft automatisch weiter, sobald genug Wochen vorhanden sind.
- REST/Netzwerkfehler: `[doctor] trendpilot fetch failed ...` oder `[trendpilot] persist failed ...` im Touch-Log.
- Hook-Fehler: `maybeRunTrendpilotAfterBpSave` fängt Exceptions, schreibt `[trendpilot] hook failed`.

---

## 5. Erweiterungspunkte / Zukunft

- KI-generierte Texte (Phase 2) – Supabase-`payload` könnte `text_llm` enthalten, orchestriert durch Zeus/LLM.
- Weitere Metriken (Gewicht, Waist) lassen sich analog einbinden (Trendpilot-API arbeitet pro Metric).
- Zusätzliche UI-Hinweise (z.?B. Einzelspitzen) über Toasts oder Chart-Layer.

---

## 6. Checkliste

1. **Flag aktiv?** (`TREND_PILOT_ENABLED = true`).
2. **Genug Wochen (>4)?** Sonst nur Toast und kein Kommentar.
3. **Supabase-Exports vorhanden?** `fetchSystemCommentsRange`, `upsertSystemCommentRemote`, `setSystemCommentAck`, `setSystemCommentDoctorStatus`.
4. **Netzwerk korrekt?** `webhookUrl`/`Key` vorhanden; 400er deuten meist auf Filter- oder JSON-Fehler hin.
5. **UI sync?** Nach neuem Kommentar `trendpilot:latest` dispatchen, damit Capture-Pill, Hub-Overlay und Chart aktualisiert werden.

---

Dieses Dokument bitte aktualisieren, sobald neue Metriken, KI-Texte oder Hub-spezifische Features hinzukommen.
