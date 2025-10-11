[QA_CHECKS.md](https://github.com/user-attachments/files/22867087/QA_CHECKS.md)
# QA Checklists

## v1.7.0 – Release Freeze

**Smoke**
- Capture-Header zeigt Intake-Pills + Termin-Badge nach Login < 50 ms; Werte passen zum gewählten Datum.
- Diagramm (Körper) ohne %Werte → keine Bars; mit Werten → Muskel-/Fettbalken erscheinen hinter den Linien.
- BP-Auto-Switch: vor 12:05 → Morgens, nach 12:05 → Abends, User-Override bleibt bis Tageswechsel.

**Sanity**
- Screenreader liest Intake-Gruppe und Pill-Status korrekt (NVDA/VoiceOver Quickcheck).
- Termin-Badge reagiert auf Termin-Änderung (Speichern/Done) via Realtime.
- Tooltip Darkmode-Kontrast ausreichend (WCAG ~AAA) auf Desktop + Mobile.

**Regression**
- Flags-Overlay erscheint nur im Blutdruck-Chart (Daily & Arzt-Ansicht unverändert).
- Unlock-Flows (Passkey/PIN) funktionieren; Telemetrie-Log erzeugt keine Fehlermeldungen.

---

## v1.6.9 – A11y & Micro Polish

**Smoke**
- Intake-Pills fokusieren → Screenreader-Ansage „Tagesaufnahme: …“.
- Termin-Badge ist per Tab erreichbar und hat korrektes aria-label.
- Tooltip bleibt lesbar, KPI-Dots sichtbar (Darkmode, 100 %/125 % Zoom).

**Sanity**
- `perfStats.snap('header_intake')` und `'header_appt'` zeigen p50/p90/p95 nach mehrfachem Refresh.
- Keine Layout-Verschiebungen in Capture-Header bei kleinen Viewports.

**Regression**
- Intake/Add-Buttons, Termin-Speichern/Done arbeiten wie in 1.6.8.
- drawChart() Performance-Log erscheint höchstens alle ~25 Aufrufe (kein spam).

---

## v1.6.8 – Körper-Chart Balken

**Smoke**
- Mit Kompositionsdaten: Muskel-/Fettbalken (kg) rendern nebeneinander; Bars verschwinden ohne Daten.
- Legende ergänzt „Muskelmasse/Fettmasse“ nur bei aktiven Werten.

**Sanity**
- Flags-Overlay bleibt im BP-Chart verfügbar; keine Klickblocker im Körper-Chart.
- Feature-Flag `SHOW_BODY_COMP_BARS` = false → Bars verschwinden vollständig.

**Regression**
- Arzt-Ansicht (tägliche Karten) zeigt weiterhin Gewicht/Flags korrekt.
- Chart-Tooltip, KPI-Anzeige, Zoom/Resize funktionieren unverändert.

---

## v1.6.7 – Körper-Prozente in Capture

**Smoke**
- Prozente (0–100) akzeptiert; ungültige Werte (z. B. 101, Text) zeigen Fehlermeldung und blocken Save.
- Werte werden nach Speichern + Reload in Capture vorbefüllt; Arzt-Ansicht zeigt entsprechende kg-Berechnung.

**Sanity**
- REST-Events enthalten `fat_pct`/`muscle_pct`; IndexedDB-Eintrag sauber.
- Datumswechsel leert Felder; Flags-Kommentar bleibt unverändert.

**Regression**
- Body-Save ohne Prozente unverändert möglich.
- Chart/Arzt-Ansicht laden weiterhin aus Views ohne Fehler.

---

## v1.6.6 – Body-Views Backend

**Smoke**
- View `v_events_body` liefert `kg/cm/fat_pct/muscle_pct/fat_kg/muscle_kg` für Testdaten.

**Sanity**
- RLS: Query mit fremder `user_id` → 0 Zeilen.
- Index-Plan: `health_events` (user_id, type, ts) genutzt.

**Regression**
- Bestehende Auswertungen (Gewicht ohne Prozente) kommen unverändert zurück.

---

## v1.6.5 – Blutdruck Kontext Auto-Switch

**Smoke**
- Auto-Switch triggert um 12:05 (plus Grace); erkennbar an Dropdown + aktivem Panel.
- Mit manueller Auswahl (User-Override) bleibt gesetzter Kontext bis Tageswechsel.

**Sanity**
- Sichtwechsel (Visibility API) refresht Datum + Kontext ohne Flackern.
- Diagnose-Log meldet „bp:auto (source) -> A/M“.

**Regression**
- BP-Save, Kommentare, Warnung bei Grenzwert bleiben unverändert.
- Midnight Refresh setzt Kontext zurück auf Morgens.

---

## v1.6.4 – Header Intake & Termin-Badge

**Smoke**
- Nach Login: Header zeigt Wasser/Salz/Protein + Badge „Kein Termin geplant“.
- Termin speichern (z. B. Nephrologe) → Badge aktualisiert sich, Done setzt Badge zurück.

**Sanity**
- Mobile (≤ 414 px): Pills umbrechen, Badge bleibt sichtbar.
- Zeitzone Europe/Vienna: Anzeige + Vergleiche korrekt (12h/24h Test).

**Regression**
- Capture-Speichern, Tab-Wechsel und Realtime unverändert.
- Intake-Pills im Accordion behalten Style/Interaktion.

---

## v1.6.0 – Arzttermine

**Smoke**
- Pro Rolle Termin speichern, Seite neu laden → „Nächster Termin“ zeigt Wert, „Letzter Termin“ nach Done.
- Zweite Session: Realtime aktualisiert UI ohne Reload.

**Sanity**
- Done-Button nur sichtbar, wenn geplanter Termin existiert; Tastaturfokus bleibt sinnvoll.
- Datum/Uhrzeit Validierung (leer/Format/409) zeigt passende Fehlermeldungen.

**Regression**
- `requestUiRefresh` orchestriert Arzt/Lifestyle/Chart ohne Doppel-Render.
- Login/Logout/App-Lock funktionieren unverändert mit neuem Panel.

---

## v1.5.7 – Intake im Capture

**Smoke**
- Intake/Add-Buttons (Wasser/Salz/Protein) aktualisieren Pill + Balken.
- Lifestyle-Tab entfernt – alle Werte im Capture sichtbar.

**Sanity**
- Datumswechsel aktualisiert __lsTotals und Bars; Realtime-Sync intakt.

**Regression**
- Flags/Body/BP Panels unbeeinflusst; Keine Duplicate-Events.

---

## v1.5.6 – Intake UI Refresh

**Smoke**
- Fortschrittsbalken zeigen Gradient + Glow; Pill-Farben stimmen mit Zielbereich.

**Sanity**
- `refreshCaptureIntake` und `handleCaptureIntake` verfügbar (window Scope).

**Regression**
- Add-Buttons, Save-Flows, Tabs unverändert.

---

## v1.5.5 – Intake Accordion

**Smoke**
- Capture-Accordion „Flüssigkeit & Intake“ öffnet/schließt; Buttons speichern in Supabase + IndexedDB.

**Sanity**
- Zeitstempel = `<day>T12:00:00Z`; REST PATCH/POST funktioniert.

**Regression**
- Reconnect nur bei vorhandenem `reconcileFromRemote` → keine Fehler.

---

## v1.5.4 – Cleanup

**Smoke**
- Schnelltest: Tabs nach Resume bleiben klickbar; kein `session-timeout` im Log.

**Sanity**
- Flags-Panel Reset ohne Legacy-Aufruf; Busy/Timeout Cleanups greifen.

**Regression**
- `isLoggedInFast` weiterhin fallback-fähig; Unlock/Intent-Flows stabil.

---

## v1.5.3 – Fast Login

Siehe v1.5.4 Ergänzung: Fokus auf Timeout-Fixes und Session-Fallback (Smoke/Sanity/Regression analog).

---

## v1.5.2 – Resume Tabs

Siehe ursprüngliche Checks (Tabs nach App-/Tab-Wechsel, Unlock-Intent).

---

## v1.5.1 – Visibility Resume

Siehe ursprüngliche Checks (Overlay schließt, Passkey/PIN nach Resume, Capture erreichbar).

---

## v1.5.0 – Panel Saves & Refresh

Siehe ursprüngliche Checks (panelweises Speichern, `requestUiRefresh` orchestration, Legacy Cleanup).
