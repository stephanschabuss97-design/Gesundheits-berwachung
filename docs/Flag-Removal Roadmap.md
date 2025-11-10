## 🧹 Flag-Removal Roadmap

### 1. Analyse & Vorbereitung
- Relevante Dateien/Module notieren:  
  `assets/js/charts/index.js`, `assets/js/doctor/index.js`, `assets/js/capture/*`,  
  Supabase-API-Layer (`assets/js/supabase/api/*`), CSS (`assets/css/chart.css`, `capture.css`), Markup (`index.html`).
- Liste der Flag-Felder (z. B. `trainingActive`, `saltHigh`, `valsartanMissed`, …) festhalten, damit später keine Reste bleiben.

---

### 2. Charts entflaggen
- In `assets/js/charts/index.js` alle Flag-spezifischen Strukturen entfernen:  
  `hasFlagsForDate`, Flag-Layer, Tooltip-Inhalte, Datenquellen.
- Prüfen, ob `chartPanel.draw()` noch Flag-Felder anfordert; ggf. Aggregationen (`fetchDailyOverview`) anpassen.
- CSS-Klassen/Icons für Flag-Overlay löschen.  
  **QA:** Diagramm öffnen → Tooltip triggern → darf keine Fehler werfen.

---

### 3. Arzt-Ansicht säubern
- Textblock + Pills aus dem Doctor-Template entfernen (`assets/js/doctor/index.js` + zugehörige CSS).
- State-Logik/Badges aktualisieren (`setDocBadges`, `renderDoctor`).
- Sicherstellen, dass Supabase-Abfragen zwar noch Flag-Felder liefern dürfen, sie aber ignoriert werden, bis das Backend angepasst ist.

---

### 4. Capture-UI demontieren
- Accordion-Markup und Buttons in `index.html` / `capture.css` löschen.
- Event-Handler & State (`capture.globals`, `capture.flags.js`, Toggle-Setter) entfernen.
- `refreshCaptureIntake`, `saveDaySummary`, etc. aufräumen, sodass keine Flag-Daten mehr gelesen/geschrieben werden.
- **QA:** Capture speichern → Tag wechseln → keine Flag-Fehlermeldungen.

---

### 5. Codebase Cleanup
- Volltextsuche nach `flag`, `training`, `valsartan`, `nsar`, `saltHigh`, `forxiga`, etc.  
  → verbleibende Referenzen löschen (inkl. Diagnose-Logs, Tests, Docs).
- CSS- & Translation-Dateien prüfen.
- Optional: `ESLint` / `TS-Lint` laufen lassen, um „unused variable“ zu finden.

---

### 6. Backend & Daten
- Supabase: Flag-Spalten oder -Tabellen via Migration/SQL droppen, sobald das Frontend keine Abhängigkeit mehr hat.
- Bei Bedarf einmaliges Skript oder `npx`-Task, der vorhandene Flag-Werte archiviert oder auf `NULL` setzt, bevor Spalten fallen.
- Nach Schema-Update API-Layer anpassen (Typdefinitionen, DTOs).
- **End-to-End-Test:** Capture speichern → Arzt-Ansicht öffnen → Diagramm ziehen → keine API-Errors.

---

### 7. Abschluss
- Dokumentation aktualisieren (`docs/QA_CHECKS.md`, Release Notes).
- Optional Feature-Flag für Anwenderdoku („Flags entfernt in Version …“).
- Finaler Smoke-Test: Login → Capture → Doctor → Chart.
