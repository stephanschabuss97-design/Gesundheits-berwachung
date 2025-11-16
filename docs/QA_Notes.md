# QA & Docs Reminder – Repo Restructure

- **Datum:** 2025-11-15T19:45:38.1865464+01:00
- **Kontext:** Phase 0 Schritt 4 der Repo-Roadmap.
- **Hinweis:** QA-Checklisten und Modul-Docs sollen spätestens nach Abschluss von Phase 2 auf die neue pp/-Ordnerstruktur (laut Repo Tree v2.md) umgestellt werden. Bis dahin darf weiterhin auf ssets/js/... verwiesen werden, aber alle kommenden Pull Requests sollten prüfen, ob betroffene Dokumente bereits neue Pfade brauchen.

Empfohlene ToDos:
1. QA_CHECKS.md mit Abschnitt "Struktur-Refactor" ergänzen (Track: Tab-Läufe funktionieren nach Move, CSS-/JS-Pfade aktualisiert).
2. docs/modules/* vorbereiten: Hinweise einfügen, dass Pfadangaben nach Phase 2 auf pp/ aktualisiert werden.
3. Bei jedem QA-Run g "assets/js" als Kontrollpunkt aufnehmen.

---

## 2025-11-16 – Phase 2 Step 4 (Smoke & Pages-Check)

- msedge --headless --disable-gpu --dump-dom file://.../index.html gegen den App-Build gefahren – Capture/Doctor/Chart/Trendpilot DOM vorhanden, keine neuen Konsolenfehler im Dump.
- Mini-Pages-Probe mit python -m http.server 8765 + Invoke-WebRequest http://127.0.0.1:8765/app/app.css bestätigt, dass pp/...-Pfade unter einem statischen Server (GitHub-Pages-Äquivalent) erreichbar sind.
- Hash-Parity: Compare-Object über ssets/css/* vs. pp/styles/* sowie ssets/js/{config,utils,diagnostics,capture/globals}.js → keine Divergenzen (Log in QA_CHECKS).
- Ergebnis: Freigabe für Step 5 (Pfadumschaltung) erteilt.
