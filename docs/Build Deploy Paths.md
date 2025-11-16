# Build & Deploy Paths

Phase 0 / Schritt 3 der Repo-Roadmap. Dieses Dokument fasst zusammen, wie der Gesundheits-Logger aktuell ausgeliefert wird und welche Anpassungen erforderlich sind, damit der geplante `app/`-Baum mit GitHub Pages und eventuellen Service-Worker-Erweiterungen kompatibel bleibt.

---

## 1. Hosting / Deploy (Ist-Zustand)

- **Deployment-Ziel:** GitHub Pages (Projekt-Page).  
  - `.nojekyll` im Repo-Root sorgt dafÃ¼r, dass GitHub Pages keine Jekyll-Pipeline verwendet und statische Dateien 1:1 bereitstellt.
  - Es existiert kein Build-Skript; `main`/`gh-pages` (je nach Repo-Einstellung) wird direkt ausgeliefert.
- **Offline-Nutzung:** Aktuell ohne Service Worker. README weist darauf hin, dass das Projekt â€žkein Build benÃ¶tigtâ€œ und `index.html` direkt geÃ¶ffnet werden kann.
- **Manifest/Service Worker:** Nicht vorhanden (nur Planung in Repo Tree v2). Browser greifen ausschlieÃŸlich auf `index.html`, CSS, JS unter `assets/`.

### Deploy-Prozess heute
1. Ã„nderungen committen und pushen.
2. GitHub Pages baut automatisch (statisches Kopieren).
3. Anwender Ã¶ffnen `https://<user>.github.io/Gesundheits-Logger/` (oder lokale Datei).

---

## 2. Asset-/Import-Pfade

`index.html` lÃ¤dt inzwischen den gemischten Satz aus `app/` (neue Struktur) und den verbleibenden Legacy-Modulen unter `assets/`:

### CSS (`<head>`)
- `app/app.css` (Composer, importiert `app/styles/*` + `app/modules/charts/chart.css`)

### JavaScript (`</body>` vor Abschluss)
- `app/core/diag.js`
- `assets/js/ui.js`
- `assets/js/ui-layout.js`
- `assets/js/ui-errors.js`
- `app/core/utils.js`
- `assets/js/format.js`
- `app/core/config.js`
- `app/core/capture-globals.js`
- `assets/js/data-local.js`
- `app/modules/capture/index.js`
- `app/modules/capture/bp.js`
- `app/modules/capture/body.js`
- `app/modules/trendpilot/data.js`
- `app/supabase/index.js`
- `assets/js/ui-tabs.js`
- `app/modules/trendpilot/index.js`
- `app/modules/doctor/index.js`
- `app/modules/charts/index.js`
- `assets/js/main.js`

Diese Liste zeigt den aktuellen Mischbetrieb (Phaseâ€¯2). Verbleibende `assets/js/*`-Module werden in spÃ¤teren Phasen in `app/modules/**` Ã¼berfÃ¼hrt; bis dahin stellt GitHub Pages beide Pfadtypen unverÃ¤ndert bereit.

---

## 3. Auswirkungen des neuen `app/`-Bundles

1. **Struktur:**  
   - CSS wandert nach `app/styles/`, JavaScript nach `app/{core,supabase,modules}/â€¦`.  
   - `index.html` wird weiterhin im Repo-Root bleiben und relative Pfade (`./app/...`) verwenden.
2. **KompatibilitÃ¤t:**  
   - GitHub Pages unterstÃ¼tzt beliebige Unterordner â†’ keine KonfigurationsÃ¤nderung nÃ¶tig.  
   - Bei lokalen â€ždate://â€œ-Ã–ffnungen funktionieren relative Pfade ebenfalls, solange Struktur beibehalten wird.
3. **Service Worker (Zukunft):**  
   - Sobald ein SW ergÃ¤nzt wird, sollte er ebenfalls im Root liegen (z.â€¯B. `sw.js`) oder Ã¼ber `navigator.serviceWorker.register("./sw.js")` registriert werden.  
   - Preload-Listen (Assets, Module) kÃ¶nnen direkt aus der neuen `app/`-Struktur befÃ¼llt werden, weil GitHub Pages Cache-Control nicht restriktiv setzt.
4. **Manifest (Zukunft):**  
   - `manifest.json` kann im Root oder unter `public/` leben; `index.html` muss `<link rel="manifest" href="manifest.json">` hinzufÃ¼gen.  
   - Icons sollten nach `public/img/icons/` verschoben werden; GitHub Pages liefert sie unverÃ¤ndert.

---

## 4. Empfehlungen fÃ¼r Phase 2+

- Nach jedem Move `rg "assets/js"` / `rg "assets/css"` laufen lassen, bis keine Legacy-Pfade mehr existieren.
- Wenn ein Service Worker eingefÃ¼hrt wird:
  - Pfad auf Root-Ebene halten, damit Scope = `/`.
  - Cache-Liste dynamisch generieren (z.â€¯B. im SW `const CORE_ASSETS = [ "./", "./index.html", "./app/app.css", ... ]`).
- FÃ¼r GitHub Pages ggf. README/Docs aktualisieren: neuer Startpfad `app/app.js`, `app/app.css`.
- QA-Checkliste ergÃ¤nzen: â€žApp lÃ¤dt auf GitHub Pages nach Struktur-Moveâ€œ + â€žOffline (optional)â€œ.

---

Damit ist geklÃ¤rt, wie der aktuelle Deploy lÃ¤uft und dass das geplante `app/`-Bundle keine speziellen Anpassungen an GitHub Pages oder kÃ¼nftige SW/Manifest-Dateien erfordert â€“ es genÃ¼gt, `index.html`+SW auf die neuen Pfade zu verweisen.

