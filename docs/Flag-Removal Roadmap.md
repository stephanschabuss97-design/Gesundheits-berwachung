## Flag-Removal Roadmap

### Status Recap
- **Step 1 – Charts** ✅  
  Flag-Layer, Tooltip-Badges und Styles sind entfernt; das Diagramm verarbeitet nur Messwerte und Notizen.
- **Step 2 – Arzt-Ansicht** ✅  
  Flag-Pills, KPI-Badges und zugehörige Styles/Logs wurden entfernt; Renderpfad ignoriert Flag-Felder.
- **Step 3 – Capture-UI** ✅  
  Flags-Akkordeon, Toggle-State und Supabase-Sync entfallen; Capture speichert ausschließlich BP/Body/Intake-Daten.
- **Step 4 – UI Hardening & CSP Recovery** ⏳ (optional / noch nicht gestartet)  
  Nur relevant, wenn wir künftig eine strengere CSP ohne Inline-Styles erzwingen wollen.
- **Step 5 – Codebase Cleanup** ✅  
  Volltextsuche (`rg -n "flag" assets/ docs/`) liefert keine Treffer mehr außerhalb der SQL-Skripte; tote Module wie `capture/flags.js` existieren nicht mehr.
- **Next up: Step 6 – Backend & Daten**  
  Die Supabase-SQL-Skripte enthalten weiterhin `day_flags`. Dort setzen wir als nächstes an.

---

### Step 4 – UI Hardening & CSP Recovery (Backlog)
1. Inline-Style-Inventur (`rg ".style"`), gruppiert nach Komponenten (Login/App-Lock, Busy/Banner, Chart-Panel, PIN-Prompt, Diagnostics, Capture-Status).
2. Utility-Klassen ergänzen (z. B. `.is-hidden`, `.is-flex`, Tooltip-/Dialog-States) und Komponenten-spezifische CSS-Blöcke anlegen.
3. JS-Module (`assets/js/supabase/auth/ui.js`, `auth/guard.js`, `main.js`, `charts/index.js`, `capture/index.js`, `diagnostics.js`, …) so refactoren, dass nur noch Klassen oder CSS-Variablen gesetzt werden.
4. CSP wieder verschärfen (`style-src 'self'; style-src-attr 'self'; style-src-elem 'self' https://cdn.jsdelivr.net`) sobald keine Inline-Styles mehr nötig sind.
5. QA: Alle Overlays/Panels triggern; DevTools dürfen keine „Applying inline style“-Warnungen anzeigen.

---

### Step 5 – Codebase Cleanup (Erledigt)
- `rg -n "flag" assets/` liefert keine Funde mehr; README ist ebenfalls sauber.  
  `CHANGELOG.md` behält historische Hinweise auf `day_flags`, die für Release-Notizen relevant bleiben.  
  Aktive Referenzen existieren nur noch in den SQL-Skripten (siehe Step 6).
- Entfernte Dateien: `assets/js/capture/flags.js`, Supabase `api/toggles.js`, Flag-spezifische CSS-Blöcke.
- Empfohlen: gelegentlich `npm run lint` (falls vorhanden) ausführen, um ungenutzte Exporte nach weiteren Refactors aufzuspüren.

---

### Step 6 – Backend & Daten (Als nächstes)
1. **Schema-Aufräumung**  
   - Supabase-Migration schreiben: `day_flags`-Spalten/Constraints/Views (`v_events_day_flags`) entfernen oder archivieren.  
   - Backup/Export für historische Flag-Daten bereitstellen (SQL/CSV).
2. **API-Contracts**  
   - PostgREST Policies und Views aktualisieren, damit Flag-Felder nicht länger exposed werden.  
   - Frontend-Typdefinitionen (sofern vorhanden) anpassen.
3. **Integrationstest**  
   - Capture → Supabase → Doctor → Chart durchspielen, um sicherzustellen, dass das Backend ohne `day_flags` funktioniert.

---

### Step 7 – Dokumentation & Release
- `docs/QA_CHECKS.md`, `CHANGELOG.md`, README, Benutzerhilfen auf den Flag-Abbau aktualisieren.  
- Nach Step 6 finalen Smoke-Test (Login → Capture → Doctor → Chart → Logout) durchführen.  
- Release-Tag/Migrations-Hinweise schreiben und Deployment anstoßen.
