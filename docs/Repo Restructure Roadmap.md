# Repo Restructure Roadmap

Diese Roadmap beschreibt, wie das bestehende Repository schrittweise in den modularen Baum aus `Repo Tree v2.md` überführt wird. Ziel ist, die Codebasis iterativ umzubauen – von dokumentarischen Vorarbeiten bis hin zu echten Modul-Moves – ohne laufende Features zu blockieren.

---

## Leitplanken

- **Safety first:** Jede Phase endet mit einem lauffähigen Stand (Charts/Trendpilot/Capture müssen immer funktionieren).
- **Docs & QA pflegen:** Nach jedem Step `CHANGELOG.md` und relevante Modul-Overviews aktualisieren.
- **Kleine PRs bevorzugen:** Lieber viele überschaubare Moves statt eines Big-Bang-Rewrites.
- **Lessons learned:** Beim nächsten Versuch erst eine Deploy-Pipeline aufsetzen, die `app/` → `assets/` spiegelt (bis GitHub Pages die neue Struktur direkt bedient). Chart mit kleinem Smoke-Test absichern (Linien + Punkte).

---

## Phase 0 – Analyse & Vorbereitung (leicht)

1. ✅ `Repo Tree v2.md` erstellen und mit Team reviewen.
2. ✅ Inventar der aktuellen Imports erstellen (`rg "assets/js"`), um Refactor-Impact abzuschätzen. → siehe `docs/Import Inventory.md`.
3. ✅ Build-/Deploy-Pfade dokumentieren (GitHub Pages, SW preload) → sichergestellt, dass künftiges `app/`-Bundle kompatibel ist (siehe `docs/Build Deploy Paths.md`).
4. ✅ QA/Docs anweisen, neue Struktur spätestens nach Phase 2 zu spiegeln (Reminder siehe `docs/QA_Notes.md`).

### Deliverables
- Liste aller Top-Level-Dateien + Import-Abhängigkeiten.
- Klarheit, welche Skripte direkt in `index.html` eingebunden werden.
- **Arbeitsprinzip für alle weiteren Phasen:** Neue Dateien/Strukturen immer parallel aufbauen, vollständig testen (Capture/Doctor/Chart Smoke), auf GitHub Pages kontrollieren – erst wenn alles stabil läuft, alte Pfade/Assets entfernen.
- **Code-Stil:** Jede neue Datei erhält sofort einen MODULE-Header (Name, Description, Submodules, Notes) und kommentierte `// SUBMODULE:`-Abschnitte – so bleibt die spätere Doku konsistent.
- **Neu angelegte/aktualisierte Docs:** `docs/Repo Tree v2.md`, `docs/Import Inventory.md`, `docs/Build Deploy Paths.md`, `docs/QA_Notes.md`.

---

## Phase 1 – Dokumentation & Namespace-Alignment (leicht → mittel)

1. ✅ **Docs nachziehen:** `docs/modules/*` zeigen nun die künftigen `app/...`-Pfade statt der alten `assets/...`-Referenzen.
2. ✅ **Namespace vorbereiten:** Übersicht der `AppModules.*`-Belegungen dokumentiert (siehe `docs/AppModules Namespace.md`); Soft-Aliase bleiben beim Move erhalten.
3. ✅ **Lint/Format:** BOM-Check für neue Docs durchgeführt; `docs/QA_Notes.md` neu geschrieben (UTF-8 ohne BOM), alle übrigen Dateien bereits konform.
4. ✅ **Touch-Log & diag:** aktuelles Verhalten dokumentiert (`docs/Core Diagnostics.md`); Move nach `app/core/diag.js` vorbereitet.

### Go/No-Go
- Sobald alle Overviews die neuen Modulnamen kennen und `AppModules.*` konsistent ist, Phase 2 starten.
- Reminder: Bei jedem Schritt zuerst neue Dateien/Namespaces aufsetzen, parallel testen/deployen, erst danach die alten Referenzen ausbauen.
- Neue Dateien immer direkt mit vollständigem MODULE-Header + `// SUBMODULE:` Kommentaren anlegen (gleiches Pattern wie `assets/js/ui-tabs.js`), damit Phase 1–5 nicht nachdokumentieren müssen.

---

## Phase 2 – Assets → App (CSS + JS Basisschicht) (mittel)

1. 🔲 **Styles verschoben:**  
   - Kern-CSS liegt jetzt unter `app/styles/` (inkl. ehemaligem `assets/css/app.css` → `ui.css`).  
   - Chart-Styles unter `app/modules/charts/chart.css`.  
   - Neuer Composer `app/app.css` importiert alle Teilstyles; `index.html` lädt nur noch diesen Pfad.
   - **Lessons learned:** Beim nächsten Versuch erst eine Deploy-Pipeline aufsetzen, die `app/` → `assets/` spiegelt (bis GitHub Pages die neue Struktur direkt bedient). Chart mit kleinem Smoke-Test absichern (Linien + Punkte).
2. 🔲 **Core JS verschieben:**  
- `assets/js/config.js`, `utils.js`, `diag.js`, `capture/globals.js` → `app/core/…`.  
- Beim Move `import`/`require` Pfade aktualisieren (zunächst relative Pfade, später optional bundler).
3. ✅ **Supabase Barrel angleichen:**  
   - `assets/js/supabase/index.js` + Submodule nach `app/supabase/` gespiegelt (inkl. `core/`, `auth/`, `api/`, `realtime/`).  
   - Exporte unverändert lassen, damit bestehende Module weiter funktionieren.
4. 🔲 Smoke-Tests (manuell): Capture-Eingaben, Chart öffnen, Trendpilot kommentieren.

### Erfolgskriterien
- Alle `<script src="...">` und `<link rel="stylesheet" href="...">` zeigen auf `app/...`.
- Keine 404 im Browser-Log; Touch-Log läuft wie gehabt.

---

## Phase 3 – Feature-Module migrieren (mittel → schwer)

1. 🔲 **Capture Modul:**  
   - `assets/js/capture/*.js`, `bp.js`, `body.js`, `intake.js` nach `app/modules/capture/`.  
   - Update der Imports (z. B. `import { saveBlock } from '../capture/bloodpressure/index.js'`).  
   - Tests: Wasser/Salt/Protein, BP-Save, Body-Save.
2. 🔲 **Doctor Modul:**  
   - `assets/js/doctor/index.js`, CSS nach `app/modules/doctor/`.  
   - Trendpilot-Block isolieren (`trendpilot-block.js`).  
   - Scroll-Restore prüfen.
3. 🔲 **Charts Modul:**  
   - `assets/js/charts/index.js` splitten (render/scales/legend).  
   - Chart-spezifische CSS importieren.  
   - Regressionstest: Tooltip, Trendpilot-Bänder, Keyboard.
4. 🔲 **Trendpilot Modul:**  
   - `assets/js/trendpilot/index.js` + helper nach `app/modules/trendpilot/`.  
   - Event-Namen dokumentieren (`trendpilot:latest`).  
   - Supabase-API bleibt unverändert (Phase 2).

### Tipps
- Nach jedem Modul-Move `docs/modules/<Modul>.md` aktualisieren.
- Git-Verlauf beibehalten (z. B. `git mv` nutzen).
- Lessons learned: Vorher einen Chart-Snapshot testen (Linien + Punkte) und sicherstellen, dass `app/`-Dateien wirklich deployed werden (Cache-Buster + Pages-Build). Erst dann Pfade umstellen.
- Neue Module zuerst in `app/...` hinzufügen, parallel testen/deployen und erst nach erfolgreicher Verifikation die alten `assets/...`-Quellen entfernen.

---

## Phase 4 – Neue Module & Future-Proofing (schwer)

1. 🔲 **Appointments/Training Re-Enable:** Verzeichnis anlegen, Placeholder-Dateien + TODO-Markierungen setzen.  
2. 🔲 **Assistant (KI):** Unter `app/modules/assistant/` API + Prompt-Struktur vorbereiten; Keys via Supabase Functions, damit keine Secrets im Client landen.
3. 🔲 **Diagnostics:** `app/diagnostics/` nur im Dev-Build laden (Feature-Flag in `app/core/config.js`).
4. 🔲 **PWA/TWA-Feinschliff:**  
   - Service Worker aktualisieren (`app/` + `public/` cache).  
   - Optional TWA Skeleton (`twa/android/`).  
   - Lighthouse-Check (PWA score ≥ 90).
- Reminder: Auch hier neue Ordner (assistant, diagnostics, etc.) zunächst parallel anlegen und verifizieren, bevor alte Reste gelöscht werden.

---

## Phase 5 – Cleanup & Final Switch (schwer)

1. 🔲 **Assets-Ordner aufräumen:** Entferne alte `assets/`-Reste, sobald alle Pfade angepasst sind.  
2. 🔲 **README & Onboarding:** Neue Struktur erklären, Setup-Schritte aktualisieren.  
3. 🔲 **Automatisierte Tests:** falls vorhanden (z. B. Playwright), Pfade anpassen.  
4. 🔲 **Release Checklist:**  
   - `CHANGELOG.md` zusammenfassen.  
   - QA-Run (Unlock, Capture, Doctor, Trendpilot, Chart, Offline).  
   - Tag/Release (z. B. `vNext-restructure`).
- Im Cleanup weiterhin das „Neu zuerst, dann Entfernen“-Prinzip anwenden (z. B. `assets/` erst löschen, wenn GitHub Pages definitiv nur noch `app/` benötigt).

---

## Tracking & Pflege

- Diese Roadmap im Blick behalten (`docs/Repo Restructure Roadmap.md`), Häkchen setzen und ggf. Abschnitte erweitern.
- Größere Entscheidungen (z. B. bundler einführen) vor Phase 3 separat diskutieren.
- Bei Blockern frühzeitig Alternativpfad einschlagen (z. B. CSS-Move pausieren, wenn Chart-Styles Probleme machen).

---

Durch das schrittweise Vorgehen können wir jederzeit stoppen, ohne eine halbfertige Codebasis zu hinterlassen. Sobald Phase 3 abgeschlossen ist, entspricht die Struktur bereits grob dem gewünschten Baum; Phase 4+5 sorgen für zukünftige Features und finale Aufräumarbeiten.
- **Neu angelegte/aktualisierte Docs:** `docs/Trendpilot Module Overview.md`, `docs/Charts Module Overview.md`, `docs/Doctor View Module Overview.md`, `docs/Intake Module Overview.md`, `docs/Capture Module Overview.md`, `docs/Supabase Core Overview.md`, `docs/Auth Module Overview.md`, `docs/Main Router Flow Overview.md`, `docs/Unlock Flow Overview.md`, `docs/State Layer Overview.md`, `docs/AppModules Namespace.md`, `docs/Core Diagnostics.md`.
