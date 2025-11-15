# Trendpilot Roadmap (Manual First)

## 1) Zielbild
- Trendpilot überwacht Tages-Blutdrucktrends (Morgen + Abend), reagiert sofort (Capture), dokumentiert im Verlauf (Arztansicht, Chart) und speichert System-Kommentare.
- Stufe 1: komplett lokal/regelbasiert – keine OpenAI-Anbindung.
- Stufe 2 (optional, später): KI formuliert Texte, liefert Kontext, kann Fragen beantworten.

---

## 2) Phase 1 – Basis ohne KI

### 2.1 Daten & Helpers
1. `fetchBpSeries()` erweitern: liefert 180 Tage Tagesmittel (Morgen+Abend, wenn verfügbar) + Wochenaggregation (Median sys/dia, Count).
2. Helper-Module: `groupBpByWeek`, `calcBaseline`, `calcDelta`, `classifyTrend`, `applyHysteresis`.
3. Tests für Aggregation & Klassifikation.

### 2.2 Capture-Hook
1. Nach jedem Abend-Save `runTrendpilotAnalysis(day)` triggern (Analyse nutzt den Tagesmittelwert aus Morgen+Abend).
2. Wenn <8 Wochen Daten → `info` → Toast nur.
3. `warning`/`critical`: Dialog mit Text + Button „Zur Kenntnis genommen“.

### 2.3 System Comments (Supabase)
1. `system_comment` POST/PATCH Helper (`createSystemComment`, `updateSystemComment`, `findSystemCommentByDay`).
2. Warning/Critical → DB-Eintrag (ack=false, doctorStatus="none").
3. Dialog-Ack setzt ack=true via PATCH.

### 2.4 Arztansicht + Chart
1. Arztansicht: Tabelle/Abschnitt „Trendpilot-Hinweise“ mit Severity-Badge, Buttons „Arztabklärung geplant“/„Erledigt“.
2. Chart: Layer/Balken (gelb/orange/rot) für Zeiträume mit active warning/critical; Tooltip/Legend-Erklärung.
3. Capture: optional Hinweis „Letzte Trendpilot-Meldung.“ im Intake-Header.

### 2.5 Konfiguration & Diagnostics
1. Feature-Flag `TREND_PILOT_ENABLED`, Parameter (`windowDays`, Schwellen, hysteresisWeeks).
2. `diag`-Log-Einträge (`[trendpilot] classification=warning delta_sys=...`).
3. QA: Save-Flows, Arzt-Buttons, Chart-Overlay.

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
