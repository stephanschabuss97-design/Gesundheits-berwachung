# Build & Deploy Paths

Phase 0 / Schritt 3 der Repo-Roadmap. Dieses Dokument fasst zusammen, wie der Gesundheits-Logger aktuell ausgeliefert wird und welche Anpassungen erforderlich sind, damit der geplante `app/`-Baum mit GitHub Pages und eventuellen Service-Worker-Erweiterungen kompatibel bleibt.

---

## 1. Hosting / Deploy (Ist-Zustand)

- **Deployment-Ziel:** GitHub Pages (Projekt-Page).  
  - `.nojekyll` im Repo-Root sorgt dafür, dass GitHub Pages keine Jekyll-Pipeline verwendet und statische Dateien 1:1 bereitstellt.
  - Es existiert kein Build-Skript; `main`/`gh-pages` (je nach Repo-Einstellung) wird direkt ausgeliefert.
- **Offline-Nutzung:** Aktuell ohne Service Worker. README weist darauf hin, dass das Projekt „kein Build benötigt“ und `index.html` direkt geöffnet werden kann.
- **Manifest/Service Worker:** Nicht vorhanden (nur Planung in Repo Tree v2). Browser greifen ausschließlich auf `index.html`, CSS, JS unter `assets/`.

### Deploy-Prozess heute
1. Änderungen committen und pushen.
2. GitHub Pages baut automatisch (statisches Kopieren).
3. Anwender öffnen `https://<user>.github.io/Gesundheits-Logger/` (oder lokale Datei).

---

## 2. Asset-/Import-Pfade

`index.html` lädt derzeit ausschließlich relative Ressourcen aus `assets/`:

### CSS (`<head>`)
- `assets/css/base.css`
- `assets/css/layout.css`
- `assets/css/capture.css`
- `assets/css/doctor.css`
- `assets/css/chart.css`
- `assets/css/auth.css`
- `assets/css/utilities.css`
- `assets/css/app.css`

### JavaScript (`</body>` vor Abschluss)
- `assets/js/diagnostics.js`
- `assets/js/ui.js`
- `assets/js/ui-layout.js`
- `assets/js/ui-errors.js`
- `assets/js/utils.js`
- `assets/js/format.js`
- `assets/js/config.js`
- `assets/js/capture/globals.js`
- `assets/js/data-local.js`
- `assets/js/capture/index.js`
- `assets/js/bp.js`
- `assets/js/body.js`
- `assets/js/trendpilot/data.js`
- `assets/js/ui-tabs.js`
- `assets/js/trendpilot/index.js`
- `assets/js/doctor/index.js`
- `assets/js/charts/index.js`
- `assets/js/main.js`

Diese Liste deckt alle Ressourcen ab, die später nach `app/` verschoben werden sollen. Sobald die Dateien migriert sind, müssen die `<link>`/`<script>`-Pfade angepasst werden (z. B. `app/styles/base.css`, `app/modules/capture/index.js`, …). GitHub Pages stellt auch diese Pfade statisch bereit, solange `index.html` sie korrekt referenziert.

---

## 3. Auswirkungen des neuen `app/`-Bundles

1. **Struktur:**  
   - CSS wandert nach `app/styles/`, JavaScript nach `app/{core,supabase,modules}/…`.  
   - `index.html` wird weiterhin im Repo-Root bleiben und relative Pfade (`./app/...`) verwenden.
2. **Kompatibilität:**  
   - GitHub Pages unterstützt beliebige Unterordner → keine Konfigurationsänderung nötig.  
   - Bei lokalen „date://“-Öffnungen funktionieren relative Pfade ebenfalls, solange Struktur beibehalten wird.
3. **Service Worker (Zukunft):**  
   - Sobald ein SW ergänzt wird, sollte er ebenfalls im Root liegen (z. B. `sw.js`) oder über `navigator.serviceWorker.register("./sw.js")` registriert werden.  
   - Preload-Listen (Assets, Module) können direkt aus der neuen `app/`-Struktur befüllt werden, weil GitHub Pages Cache-Control nicht restriktiv setzt.
4. **Manifest (Zukunft):**  
   - `manifest.json` kann im Root oder unter `public/` leben; `index.html` muss `<link rel="manifest" href="manifest.json">` hinzufügen.  
   - Icons sollten nach `public/img/icons/` verschoben werden; GitHub Pages liefert sie unverändert.

---

## 4. Empfehlungen für Phase 2+

- Nach jedem Move `rg "assets/js"` / `rg "assets/css"` laufen lassen, bis keine Legacy-Pfade mehr existieren.
- Wenn ein Service Worker eingeführt wird:
  - Pfad auf Root-Ebene halten, damit Scope = `/`.
  - Cache-Liste dynamisch generieren (z. B. im SW `const CORE_ASSETS = [ "./", "./index.html", "./app/app.css", ... ]`).
- Für GitHub Pages ggf. README/Docs aktualisieren: neuer Startpfad `app/app.js`, `app/app.css`.
- QA-Checkliste ergänzen: „App lädt auf GitHub Pages nach Struktur-Move“ + „Offline (optional)“.

---

Damit ist geklärt, wie der aktuelle Deploy läuft und dass das geplante `app/`-Bundle keine speziellen Anpassungen an GitHub Pages oder künftige SW/Manifest-Dateien erfordert – es genügt, `index.html`+SW auf die neuen Pfade zu verweisen.

