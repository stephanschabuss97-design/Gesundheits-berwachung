## Flag-Removal Roadmap (Updated)

### Status Recap
- **Step 1 – Charts**: Flag-Layer, Tooltip-Hinweise und Styles entfernt. Diagramm rendert nur Messwerte/Notizen.
- **Step 2 – Arzt-Ansicht**: Badge- und Flag-Spalten entfernt, Renderpfad verarbeitet keine Flag-Felder mehr.
- **Step 3 – Capture-UI**: Flags-Akkordeon, Toggle-State und Speicherung entfernt; Supabase-APIs synchronisiert.
- **Offen**: Inline-Style-Nutzung verhindert eine strenge CSP. Sicherheitsniveau muss wiederhergestellt werden, bevor Backend-Spalten fallen.

---

### Step 4 – UI Hardening & CSP Recovery
1. **Inline-Style-Inventar**  
   - Script-Suche nach `.style.` und dynamischen `style.cssText`.  
   - Gruppiere nach Komponenten (Login/App-Lock, Busy/Banner, Chart-Panel, PIN-Prompt, Diagnostics, Capture Status).
2. **Utility-Klassen & States**  
   - Ergänze generische Klassen (`.is-hidden`, `.is-flex`, `.is-inline-flex`, `.is-active`, `.has-error`, Tooltip-States).  
   - Für komplexere Komponenten (Chart-Tip, PIN-Dialog) dedizierte CSS-Blöcke anlegen, damit JS nur noch Klassen toggelt.
3. **Refactor JS-Module**  
   - `assets/js/supabase/auth/ui.js`, `auth/guard.js`, `main.js`, `charts/index.js`, `capture/index.js`, `diagnostics.js` etc. auf Klassenwechsel umstellen.  
   - Dynamische Stile (Positionierung) über CSS-Variablen oder Inline-Styles mit `<style nonce>` ersetzen, damit CSP-konform.
4. **CSP wieder verschärfen**  
   - Sobald alle sichtbaren Inline-Styles verschwunden sind, stelle `<meta http-equiv="Content-Security-Policy">` auf  
     `style-src 'self'; style-src-attr 'self'; style-src-elem 'self' https://cdn.jsdelivr.net` (oder analog) zurück.  
   - Optional: Nonce-basierten Mechanismus einführen, falls wenige dynamische Styles übrig bleiben.
5. **QA**  
   - Login-Overlay, App-Lock, Chart-Panel, Diagnose-Panel, PIN-Dialog, Capture-Speichern in allen States testen.  
   - DevTools müssen ohne „Applying inline style“ Warnungen bleiben.

---

### Step 5 – Codebase Cleanup
- Volltextsuche nach `flag`, `training`, `valsartan`, `nsar`, `saltHigh`, `forxiga`, `dayFlags`, `flagsComment`.  
  Entferne Restreferenzen in JS, CSS, Docs, Tests, Telemetrie.
- Entferne tote Module (z. B. `capture/flags.js`), die nach Step 3 übrig bleiben könnten.
- Linting laufen lassen (ESLint) und Build prüfen, um ungenutzte Variablen/Im-ports zu entdecken.

---

### Step 6 – Backend & Daten
1. **Schema-Aufräumung**  
   - Supabase-Migration vorbereiten: Flag-Spalten/Constraints aus `health_events` entfernen oder archivieren.  
   - Backup-Skript (SQL/CSV) erstellen, falls historische Flag-Daten benötigt werden.
2. **API-Contracts**  
   - PostgREST Policies/Views aktualisieren, damit Flag-Felder nicht mehr exposed werden.  
   - Frontend-DTOs anpassen (Typdefinitionen, Zod-Schemas, eventuell TS-Deklarationen).
3. **Integrationstest**  
   - Capture → Supabase → Doctor → Chart einmal komplett durchspielen, um sicherzustellen, dass keine Flag-Felder mehr erwartet werden.

---

### Step 7 – Dokumentation & Release
- `docs/QA_CHECKS.md`, `CHANGELOG.md`, README und Benutzerhilfen aktualisieren (Hinweis „Flags entfernt in Version …“).  
- Roadmap nach jedem abgeschlossenen Schritt anpassen, damit zukünftige Arbeiten nachvollziehbar bleiben.  
- Finaler Smoke-Test (Login → Capture → Doctor → Chart → Logout) unter strenger CSP.  
- Danach Tag/Release erstellen und ggf. Backend-Migration deployen.
