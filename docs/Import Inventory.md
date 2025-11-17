# Import Inventory – `assets/js/*`

Phase 0 / Schritt 2 der Repo-Roadmap: Übersicht aller Dateien, die aktuell direkte Pfade in Form von `assets/js/...` enthalten. Diese Liste dient als Ausgangspunkt für Pfad-Updates, sobald der Code nach `app/` migriert wird.

---

## Zusammenfassung

- **HTML:** `index.html` + Backup referenzieren zahlreiche `<script src="assets/js/...">` und `<link>`-Einträge.
- **Docs/Roadmaps:** 13 Markdown-Dateien erwähnen die alten Pfade (müssen nach jedem Modul-Move angepasst werden).
- **JS-Quellen:** 10 aktive Skripte importieren weitere `assets/js/...`-Dateien und müssen beim Move umgeschrieben werden.

---

## Datei-Liste (Stand 2025-11-15)

| Kategorie | Datei |
|-----------|-------|
| HTML      | `index.html`, `index.html.bak` |
| Dokumentation / Planung | `docs/modules/Capture Module Overview.md`, `docs/modules/Charts Module Overview.md`, `docs/modules/Doctor View Module Overview.md`, `docs/modules/Intake Module Overview.md`, `docs/modules/Main Router Flow Overview.md`, `docs/modules/Auth Module Overview.md`, `docs/modules/Trendpilot Module Overview.md`, `docs/modules/Unlock Flow Overview.md`, `docs/modules/State Layer Overview.md`, `docs/Repo Tree v2.md`, `docs/Repo Restructure Roadmap.md`, `docs/Appointment-Removal Roadmap.md`, `docs/QA_CHECKS.md` |
| Change/History | `CHANGELOG.md` |
| JS-Quellen | `assets/js/main.js`, `assets/js/main.js.bak`, `app/supabase/index.js`, `assets/js/ui.js`, `assets/js/ui-layout.js`, `assets/js/ui-errors.js`, `assets/js/ui-tabs.js`, `app/core/utils.js`, `assets/js/utils/debounce-fallback.js` |

---

## Hinweise für Phase 1/2

- Bei der Migration sollten zuerst `index.html` und `assets/js/main.js` angepasst werden; diese decken den Großteil der `<script>`-Imports ab.
- Die Dokumentationen können in Phase 1 parallel aktualisiert werden (Suche nach `assets/js` → ersetze durch neue `app/…`-Pfade, sobald bekannt).
- Für Phase 2 empfiehlt sich ein automatischer Check (`rg "assets/js"`) nach jedem Move, um sicherzustellen, dass keine Legacy-Pfade übrig bleiben.
