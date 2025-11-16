# Doctor View Module â€“ Functional Overview

Dieses Dokument beschreibt die Arzt-Ansicht (Doktor-Tab) im Gesundheits-Logger. Ziel ist eine vollstÃ¤ndige Referenz Ã¼ber UI-Struktur, DatenflÃ¼sse, Supabase-AbhÃ¤ngigkeiten sowie Diagnose- und Sicherheitsmechanismen.

---

## 1. Zielsetzung & Funktionen

Die Arzt-Ansicht konsolidiert Tagesdaten, Trendpilot-Hinweise und Management-Aktionen fÃ¼r Ã„rzt:innen oder Patienten im â€žDoctorâ€œ-Modus. Kerneigenschaften:

- Zeitraumfilter (Von/Bis) mit Anbindung an Supabase `fetchDailyOverview`.
- Darstellung aller Tage (Blutdruck Morgen/Abend, Puls, MAP, KÃ¶rperwerte, Notizen).
- Trendpilot-Hinweisblock (Severity, Ack, Arztstatus samt Buttons).
- JSON-Export und Remote-LÃ¶schen einzelner Tage.
- Integration mit Chart-Panel (`Werte anzeigen`).
- Zugriffsschutz via Doctor-Unlock (Finger/PIN).

---

## 2. Kernkomponenten & Dateien

| Datei | Zweck |
|-------|-------|
| `app/modules/doctor/index.js` | Hauptlogik: Rendern, Scroll-Restore, Trendpilot-Block, Delete/Export, Chart-Button. |
| `app/styles/doctor.css` | Layout/Stil (Toolbar, Badge, Trendpilot-Karten, Tagesgrid). |
| `assets/js/main.js` | Bindet Tab-Wechsel, Unlock-Flow, `requestUiRefresh({ doctor: true })`. |
| `app/supabase/api/vitals.js` & `app/supabase/api/system-comments.js` | REST-Fetch fÃ¼r Tageswerte und Trendpilot-Kommentare. |
| `assets/js/trendpilot/index.js` | Liefert `trendpilot:latest` Events, Ack-Patching etc. |
| `assets/js/charts/index.js` | Chart-Button nutzt das gleiche Range, um Diagramm zu Ã¶ffnen. |
| `docs/QA_CHECKS.md` | EnthÃ¤lt Tests (Unlock, Trendpilot-Block, Delete, Chart). |

---

## 3. Ablauf / Datenfluss

### 3.1 Unlock & Setup

1. Beim Tab-Wechsel zu â€žArzt-Ansichtâ€œ (`setTab('doctor')`) prÃ¼ft `requireDoctorUnlock`. Ohne Freigabe bleibt Ansicht verborgen.
2. Nach Unlock ruft `requestUiRefresh({ doctor: true })` die Renderlogik.

### 3.2 Render (`renderDoctor`)

1. Liest `from/to` Felder, validiert sie (sonst Placeholder â€žBitte Zeitraum wÃ¤hlenâ€œ).
2. Ruft `fetchDailyOverview(from, to)` â†’ Supabase `v_events_bp`, `v_events_body`, `notes`.
3. Sortiert Tage absteigend, mappt in DOM-BlÃ¶cke:
   - Datum + Cloud/Actions (LÃ¶schen).
   - Messgrid (Sys/Dia/Puls/MAP morgens/abends, rot markiert bei Schwellen).
   - KÃ¶rperwerte (Gewicht/Bauchumfang) & Notizen.

4. Scroll-Restore: Merkt Scroll-Position (`__doctorScrollSnapshot`), setzt sie nach Render zurÃ¼ck.

### 3.3 Aktionen

- **LÃ¶schen:** Button `data-del-day` ruft `deleteRemoteDay(date)` (Supabase RPC) â†’ anschl. `requestUiRefresh`.
- **JSON-Export:** `exportDoctorJson()` ruft `getAllEntries()` (lokal) und lÃ¤dt `gesundheitslog.json` herunter.
- **Chart-Button:** `#doctorChartBtn` Ã¶ffnet Chart-Panel, nutzt dieselben Range-Felder.

### 3.4 Trendpilot-Hinweise

1. `loadTrendpilotEntries(from, to)` ruft `fetchSystemCommentsRange`.
2. Trendpilot-Sektion zeigt jede Meldung (Datum, Severity-Badge, Ack-Status, Text, Buttons).
3. Buttons patchen `doctorStatus` via `setSystemCommentDoctorStatus`.
4. Ack-Status wird aus `payload.context.ack` gelesen; falls acked, Pill `is-ack`.
5. Fehler beim Laden loggt `logDoctorError('[doctor] trendpilot fetch failed ...')` + Touch-Log.

---

## 4. Styling / Layout (Kurz)

- Toolbar: Titel, Range, Buttons (Apply, Chart, Export).
- Trendpilot-Block (`.doctor-trendpilot`): Card mit Head + List; List â†’ `.tp-row` pro Eintrag.
- Tagescards (`.doctor-day`): Grid (Datum / Messungen / Spezial).
- Badge/Buttons nutzen App-Design-Token (`var(--color-...)`).

---

## 5. Diagnose & Logging

- `logDoctorError` schreibt Fehler in `diag` + Konsole (z.â€¯B. Supabase 400/401).
- Touch-Log-EintrÃ¤ge (`[doctor] ...`, `[sbSelect] ... failed`) zeigen REST-Probleme.
- Unlock-Warnungen: `[doctor] requireDoctorUnlock missing` etc., falls Guard nicht konfiguriert.
- Trendpilot-Button-Fehler (Patch) werden als `alert` + diag gemeldet.

---

## 6. Speicherfluss & AbhÃ¤ngigkeiten

1. `main.js` orchestriert Unlock, Tab, Refresh.
2. `doctor/index.js` ruft Supabase APIs (Vitals, System-Comments).
3. `trendpilot/index.js` sorgt dafÃ¼r, dass `fetchSystemCommentsRange`/`setSystemCommentAck`/`setSystemCommentDoctorStatus` bereitstehen; Capture-Hook sendet `trendpilot:latest`, was an die Arzt-Ansicht weitergegeben wird.
4. Chart-Benutzung (gleicher Zeitraum) -> `assets/js/charts/index.js`.

---

## 7. ErweiterungsvorschlÃ¤ge

- Filter auf Serien (nur Morgen/Abend, nur Tage mit Kommentaren).
- Bulk-Aktionen (alle acken, CSV-Export) oder Tagging.
- Medikation / Symptome Spalten, falls Supabase-Datenmodell erweitert wird.

---

Aktualisiere dieses Dokument bei Ã„nderungen (z.â€¯B. weitere Buttons, neue Felder oder Supabase-Integrationen), damit alle Beteiligten denselben Wissenstand haben.
