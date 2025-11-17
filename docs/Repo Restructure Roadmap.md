# Repo Restructure Roadmap

Diese Roadmap beschreibt, wie das bestehende Repository schrittweise in den modularen Baum aus `Repo Tree v2.md` �berf�hrt wird. Ziel ist, die Codebasis iterativ umzubauen � von dokumentarischen Vorarbeiten bis hin zu echten Modul-Moves � ohne laufende Features zu blockieren.

---

## Leitplanken

- **Safety first:** Jede Phase endet mit einem lauff�higen Stand (Charts/Trendpilot/Capture m�ssen immer funktionieren).
- **Docs & QA pflegen:** Nach jedem Step `CHANGELOG.md` und relevante Modul-Overviews aktualisieren.
- **Kleine PRs bevorzugen:** Lieber viele �berschaubare Moves statt eines Big-Bang-Rewrites.
- **Lessons learned:** Beim n�chsten Versuch erst eine Deploy-Pipeline aufsetzen, die `app/` ? `assets/` spiegelt (bis GitHub Pages die neue Struktur direkt bedient). Chart mit kleinem Smoke-Test absichern (Linien + Punkte).

---

## Phase 0 � Analyse & Vorbereitung (leicht)

1. ?? `Repo Tree v2.md` erstellen und mit Team reviewen.
2. ?? Inventar der aktuellen Imports erstellen (`rg "assets/js"`), um Refactor-Impact abzusch�tzen. ? siehe `docs/Import Inventory.md`.
3. ?? Build-/Deploy-Pfade dokumentieren (GitHub Pages, SW preload) ? sichergestellt, dass zuk�nftiges `app/`-Bundle kompatibel ist (siehe `docs/Build Deploy Paths.md`).
4. ?? QA/Docs anweisen, neue Struktur sp�testens nach Phase 2 zu spiegeln (Reminder siehe `docs/QA_Notes.md`).

### Deliverables
- Liste aller Top-Level-Dateien + Import-Abh�ngigkeiten.
- Klarheit, welche Skripte direkt in `index.html` eingebunden werden.
- **Arbeitsprinzip f�r alle weiteren Phasen:** Neue Dateien/Strukturen immer parallel aufbauen, vollst�ndig testen (Capture/Doctor/Chart Smoke), auf GitHub Pages kontrollieren � erst wenn alles stabil l�uft, alte Pfade/Assets entfernen.
- **Code-Stil:** Jede neue Datei erh�lt sofort einen MODULE-Header (Name, Description, Submodules, Notes) und kommentierte `// SUBMODULE:`-Abschnitte � so bleibt die sp�tere Doku konsistent.
- **Neu angelegte/aktualisierte Docs:**  
  `docs/Repo Tree v2.md`,  
  `docs/Import Inventory.md`,  
  `docs/Build Deploy Paths.md`,  
  `docs/QA_Notes.md`.

---

## Phase 1 � Dokumentation & Namespace-Alignment (leicht ? mittel)

1. ?? **Docs nachziehen:** `docs/modules/*` zeigen nun die k�nftigen `app/...`-Pfade statt der alten `assets/...`-Referenzen.
2. ?? **Namespace vorbereiten:** �bersicht der `AppModules.*`-Belegungen dokumentiert (siehe `docs/AppModules Namespace.md`); Soft-Aliase bleiben beim Move erhalten.
3. ?? **Lint/Format:** BOM-Check f�r neue Docs durchgef�hrt; `docs/QA_Notes.md` neu geschrieben (UTF-8 ohne BOM), alle �brigen Dateien bereits konform.
4. ?? **Touch-Log & diag:** aktuelles Verhalten dokumentiert (`docs/Core Diagnostics.md`); Move nach `app/core/diag.js` vorbereitet.

### Go/No-Go
- Sobald alle Overviews die neuen Modulnamen kennen und `AppModules.*` konsistent ist, Phase 2 starten.
- Reminder: Bei jedem Schritt zuerst neue Dateien/Namespaces aufsetzen, parallel testen/deployen, erst danach die alten Referenzen ausbauen.
- Neue Dateien immer direkt mit vollst�ndigem MODULE-Header + `// SUBMODULE:` Kommentaren anlegen (gleiches Pattern wie `assets/js/ui-tabs.js`), damit Phase 1�5 nicht nachdokumentieren m�ssen.

---

## Phase 2 � Assets ? App (CSS + JS Basisschicht) (mittel)

1. ?? **Styles verschoben:**
   - Kern-CSS liegt jetzt unter `app/styles/` (inkl. ui.css).
   - Chart-Styles unter `app/modules/charts/chart.css`.
   - Neuer Composer `app/app.css` importiert alle Teilstyles.
   - Lessons learned: Deploy-Pipeline vorbereiten, Chart-Snapshots testen bevor Pfade umgestellt werden.

2. ?? **Core JS verschieben:**
   - `assets/js/config.js`, `utils.js`, `diag.js`, `capture/globals.js` ? `app/core/...`.

3. ?? **Supabase Barrel angleichen:**
   - `assets/js/supabase/index.js` + Submodule (core/, auth/, api/, realtime/) nach `app/supabase/` kopiert.

4. ? **Smoke-Tests & Pages-Check:**
   - msedge --headless --dump-dom file://.../index.html gegen das neue App-Bundle ausgef�hrt (Capture/Doctor/Chart/Trendpilot DOM vorhanden, keine konsolenrelevanten Fehler).
   - Mini-Pages-Check �ber python -m http.server + Invoke-WebRequest http://127.0.0.1:8765/app/app.css best�tigt, dass relative pp/...-Pfade auf einem GitHub-Pages-�quivalenten Static-Server funktionieren.
   - MODULE-/SUBMODULE-Header der migrierten Dateien mit den Legacy-Pendants gehasht (Parity-Log siehe QA-Notes).

5. ? **Referenzen umstellen:**
   - Head-Link referenziert jetzt pp/app.css als Composer.
   - Script-Stack bindet pp/core/{diag,utils,config,capture-globals} sowie pp/supabase/index.js; ssets/js/boot-auth.js importiert ../../app/supabase/index.js.
   - ssets/js/main.js-Logtext sowie Build-/Roadmap-Dokumentation wurden aktualisiert.

6. ? **Altbest�nde abbauen:**
   - ssets/css/ entfernt (Base/Layout/Capture/Doctor/Chart/Auth/Utilities/App).
   - ssets/js/{config.js,utils.js,diagnostics.js,capture/globals.js,supabase.js,supabase/**} gel�scht; Kommentare verweisen auf pp/core/*.
   - QA-/Roadmap-Notizen erg�nzt, damit keine neuen ssets/...-Pfade entstehen.

### Erg�nzung: Neu ? Test ? Umschalten ? Entfernen
- Neue CSS/JS-Dateien **immer zuerst vollst�ndig unter `app/` vorbereiten**, ohne bestehende Abl�ufe zu gef�hrden.
- Dann **parallel testen** (local + Pages, Cache disabled).
- Erst wenn alle Smoke-Tests sauber laufen: **Referenzen umschalten**.
- Danach: **alte `assets/...` entfernen**, aber nur nach vollst�ndiger Verifikation.

### Erfolgskriterien
- Alle `<script src="...">` und `<link rel="stylesheet" href="...">` zeigen dauerhaft auf `app/...`; GitHub-Pages-Check ohne 404.
- Smoke-Tests (Capture, Doctor, Chart, Trendpilot) laufen mit neuen Pfaden; Touch-Log zeigt keine Fehler.

### Tipps
- Nach jedem Modul-Move `docs/modules/<Modul>.md` aktualisieren.
- Git-Verlauf beibehalten (z. B. `git mv` nutzen).
- Lessons learned: Vorher einen Chart-Snapshot testen (Linien + Punkte) und sicherstellen, dass `app/`-Dateien wirklich deployed werden (Cache-Buster + Pages). Erst dann Pfade umstellen.
- Neue Module zuerst in `app/...` hinzuf�gen, parallel testen/deployen und erst nach erfolgreicher Verifikation die alten `assets/...`-Quellen entfernen.

---

## Phase 3 � Feature-Module migrieren (mittel ? schwer)

1. ?? **Capture Modul:**  
   - `app/modules/capture/*.js`, `bp.js`, `body.js`, `intake.js` nach `app/modules/capture/`.  
   - Update der Imports.  
   - Tests: Wasser/Salt/Protein, BP-Save, Body-Save.  
   - Hinweis: Solange `ui-tabs.js`, `main.js` & Co. noch globale Symbole (`resetBpPanel`, `resetBodyPanel`, `saveBlock` �) erwarten, behalten wir tempor�re Fallback-Exports in `app/modules/capture/{bp,body}.js`. Sp�ter m�ssen die Aufrufer auf `AppModules.bp.*`/`AppModules.body.*` umgestellt werden, damit die Globals endg�ltig entfallen k�nnen.

2. ?? **Doctor Modul:**  
   - `app/modules/doctor/index.js`, CSS nach `app/modules/doctor/`.  
   - Trendpilot-Block isolieren (`trendpilot-block.js`).  
   - Scroll-Restore pr�fen.

3. ?? **Charts Modul:**  
   - `assets/js/charts/index.js` splitten (render/scales/legend).  
   - Chart-spezifische CSS importieren.  
   - Regressionstest: Tooltip, Trendpilot-B�nder, Keyboard.

4. ?? **Trendpilot Modul:**  
   - `app/modules/trendpilot/index.js` + helper liegen nun unter `app/modules/trendpilot/`.  
   - Trendpilot-Legacy aufr�umen (Bands, UI-Hooks) nach Migration.
   - Tests: Trendpilot-Hinweise, Status-Buttons, Chart-Pill.
   - Event-Namen dokumentieren (`trendpilot:latest`).  
   - Supabase-API bleibt unver�ndert (Phase 2).
   - Danach sofort Phase 4 anstoßen: Diagnostics vorbereiten (einziger Code-Step), Assistant/PWA/TWA nur strukturieren/checken.

### Erg�nzung: Neu ? Test ? Umschalten ? Entfernen
- **Neue Modulordner vollst�ndig vorbereiten**, inklusive MODULE-Header und SUBMODULE-Struktur.
- Neue JS/CSS-Module **parallel einbauen**, aber noch nicht als aktive Imports nutzen (Soft-Migration).
- **Parallel testen** (Capture/Doctor/Charts/Trendpilot vollst�ndig).
- Erst wenn alle Tests gr�n:  
  **Import-Pfade auf `app/modules/...` umstellen.**
- Danach: **alte `assets/js/<Modul>/` entfernen**.

### Tipps
- Nach jedem Modul-Move `docs/modules/<Modul>.md` aktualisieren.
- Git-Verlauf beibehalten.
- Lessons learned: Chart-Snapshot testen, Pages-Build verifizieren.
- Neue Module zuerst in `app/...` hinzuf�gen, parallel testen/deployen und erst danach alte `assets/...` entfernen.

---

## Phase 4 - Neue Module & Future-Proofing (schwer)

1. ?? **Diagnostics:**
   - `app/diagnostics/` vorbereiten (Feature-Flag in `app/core/config.js`).
   - Nur Struktur + Readiness-Check; Implementierung folgt separat.
   - Step 1/3 erledigt: Verzeichnis `app/diagnostics/{logger,perf,monitor}.js` angelegt, `DIAGNOSTICS_ENABLED`-Flag in `app/core/config.js` eingeführt und `index.html` lädt die neuen Platzhalter parallel zum bestehenden `app/core/diag.js`.
   - Step 2/3 erledigt: `app/core/diag.js` forwardet diag-Logs, Perf-Samples und Panel-Toggles an `appModules.diagnosticsLayer.{logger,perf,monitor}` (inkl. Heartbeat), QA-/Changelog-Notizen ergänzt.
   - Step 3/3 erledigt: Legacy-perfStats-Sampler aus `app/core/diag.js` entfernt; `window.perfStats.{add,snap}` proxyt jetzt direkt auf `app/diagnostics/perf.js` (kein doppelter Speicher mehr).

2. ?? **Assistant (KI) Readiness:**
   - Ordner `app/modules/assistant/` anlegen, Readiness dokumentieren (Hooks, Roadmap).
   - Keine Logik implementieren (eigene Roadmap sp�ter).
   - Step erledigt: Platzhalter `app/modules/assistant/index.js` + `docs/Assistant Module Overview.md` beschreiben Struktur/Next Steps.

3. ?? **PWA/TWA Readiness:**
   - public//SW-Struktur pr�fen, Ordner f�r PWA/TWA vorbereiten (z. B. 	wa/android/).
   - Noch keine SW/TWA-Dateien schreiben (eigene Roadmap folgt).
   - Step erledigt: `public/sw/`, `public/manifest-placeholder.json`, `public/twa/Android/` + Readme (`docs/PWA-TWA Readiness.md`).
## Phase 5 � Cleanup & Final Switch (schwer)

1. ?? **Assets-Ordner aufr�umen:** Entferne alte `assets/`-Reste, sobald alle Pfade angepasst sind.  
2. ?? **README & Onboarding:** Neue Struktur erkl�ren, Setup-Schritte aktualisieren.  
3. ?? **Automatisierte Tests:** falls vorhanden (z. B. Playwright), Pfade anpassen.  
4. ?? **Release Checklist:**  
   - `CHANGELOG.md` zusammenfassen.  
   - QA-Run (Unlock, Capture, Doctor, Trendpilot, Chart, Offline).  
   - Tag/Release (z. B. `vNext-restructure`).

### Erg�nzung: Neu ? Test ? Umschalten ? Entfernen
- Vor dem finalen Cleanup sicherstellen: **Alle ben�tigten Dateien existieren unter `app/`**.
- Dann: **Paralleltest ? Pages-Build ? Offline-Test**.
- Erst anschlie�end: **kompletten `assets/`-Ordner entfernen**.

- Im Cleanup weiterhin das �Neu zuerst, dann Entfernen�-Prinzip anwenden (z. B. `assets/` erst l�schen, wenn GitHub Pages definitiv nur noch `app/` ben�tigt).

---

## Tracking & Pflege

- Diese Roadmap im Blick behalten (`docs/Repo Restructure Roadmap.md`), H�kchen setzen und ggf. Abschnitte erweitern.
- Gr��ere Entscheidungen (z. B. bundler einf�hren) vor Phase 3 separat diskutieren.
- Bei Blockern fr�hzeitig Alternativpfad einschlagen (z. B. CSS-Move pausieren, wenn Chart-Styles Probleme machen).

---

Durch das schrittweise Vorgehen k�nnen wir jederzeit stoppen, ohne eine halbfertige Codebasis zu hinterlassen. Sobald Phase 3 abgeschlossen ist, entspricht die Struktur bereits grob dem gew�nschten Baum; Phase 4+5 sorgen f�r zuk�nftige Features und finale Aufr�umarbeiten.

- **Neu angelegte/aktualisierte Docs:**  
  `docs/Trendpilot Module Overview.md`,  
  `docs/Charts Module Overview.md`,  
  `docs/Doctor View Module Overview.md`,  
  `docs/Intake Module Overview.md`,  
  `docs/Capture Module Overview.md`,  
  `docs/Supabase Core Overview.md`,  
  `docs/Auth Module Overview.md`,  
  `docs/Main Router Flow Overview.md`,  
  `docs/Unlock Flow Overview.md`,  
  `docs/State Layer Overview.md`,  
  `docs/AppModules Namespace.md`,  
  `docs/Core Diagnostics.md`.

