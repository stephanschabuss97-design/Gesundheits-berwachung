# Trendpilot Roadmap (Manual First)

## 1) Zielbild
- Trendpilot überwacht Tages-Blutdrucktrends (Morgen + Abend), reagiert sofort (Capture), dokumentiert im Verlauf (Arztansicht, Chart) und speichert System-Kommentare.
- Stufe 1: komplett lokal/regelbasiert – keine OpenAI-Anbindung.
- Stufe 2 (optional, später): KI formuliert Texte, liefert Kontext, kann Fragen beantworten.

---

## 2) Phase 1 – Basis ohne KI (Ist-Stand)

### 2.1 Daten & Helpers
Status: ✔ erledigt.
1. `fetchBpSeries()` liefert Tagesmittel (Morgen+Abend) für 180 Tage.
2. Helper-Module (`trendpilot/data.js`) implementiert: `computeDailyBpStats`, `groupDailyStatsByWeek`, `calcMovingBaseline`, `calcLatestDelta`, `classifyTrendDelta`, `applyHysteresis`, `buildTrendWindow`.

### 2.2 Capture-Hook
Status: ⚙ in Arbeit.
1. `runTrendpilotAnalysis(day)` existiert (einschließlich Timeout, strenger ISO-Check, Pflichtdialog + Supabase-upsert).
2. Capture-BP-Save ruft Trendpilot noch nicht auf → TODO.
3. Dialog muss Ack-Fluss + system_comment-ID handling bekommen → TODO.

### 2.3 System Comments (Supabase)
Status: ✔ erledigt.
1. Neue Supabase-API `system-comments.js`: POST/PATCH, Ack/Doctor-Status bleiben erhalten.
2. Trendpilot ruft `upsertSystemCommentRemote` bereits für Warning/Critical (automatisch ack=false).
3. Dialog-Ack → TODO (Pending UI).

### 2.4 Arztansicht + Chart
1. Arztansicht: Tabelle/Abschnitt „Trendpilot-Hinweise“ mit Severity-Badge, Buttons „Arztabklärung geplant“/„Erledigt“.
2. Chart: Layer/Balken (gelb/orange/rot) für Zeiträume mit active warning/critical; Tooltip/Legend-Erklärung.
3. Capture: optional Hinweis „Letzte Trendpilot-Meldung.“ im Intake-Header.

### 2.5 Konfiguration & Diagnostics
Status: ⚙ teilweise.
1. Feature-Flag `TREND_PILOT_ENABLED` (config.js) vorhanden, liest aus global/localStorage/body-data.
2. Diagnostik (`diag.add`) vorhanden (severity + deltas).
3. QA-Sektion noch offen (Charts/Arzt/Save).

---

## 3) Phase 2 – KI-Integration (optional)

### 3.1 Textgenerierung
- Prompt mit Trend-Deltas, Messfrequenz, optional Symptomen → erhält formuliertes Feedback.
- Speichern in `system_comment.payload.text_llm`, fallback auf Rules-Text.

### 3.2 Conversational Layer
- PWA + Chat: User kann „Warum war das critical?“ fragen → LLM nutzt gespeicherte Trenddaten.
- Sicherheitsfilter (keine Therapieanweisungen).

### 3.3 Erweiterungen
- Multi-Metrik-Support (z. B. Gewichtstrends).
- Personalisierte Empfehlungen (z. B. „trinke mehr Wasser“) auf Basis deines Plans.

---

## 4) Umsetzungsvorschlag (Commits)
1. Helpers + Tests.
2. Capture-Hook + System-Comments + Dialoge.
3. Arztansicht/Chart/UI-Layer.
4. Flags, Diagnostics, Docs.
