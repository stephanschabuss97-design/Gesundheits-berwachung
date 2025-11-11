## Appointment-Removal Roadmap

### 1. Analyse & Vorbereitung
- Relevante Assets sammeln: `index.html` (Capture-Bereich), `assets/js/capture/index.js`, `assets/js/appointments.js`, evtl. `assets/js/main.js`.
- Backend: `sql/03_Appointments.sql`, Checks in `sql/02_Admin Checks.sql`, Policies aus `sql/06_Security.sql`.
- Diagnose/Docs notieren (`README.md`, `docs/QA_CHECKS.md`) – alles, was Termine erwähnt, markiert für späteren Cleanup.

---

### 2. Frontend UI stilllegen
1. Capture-Markup:
   - Termin-Panel aus `index.html` entfernen oder als Feature-Flag ausblenden.
   - CSS-Klassen (`.appointments-panel` o. ä.) löschen.
2. JS-Logik:
   - Event-Bindings und Status-Badges in `assets/js/capture/index.js` neutralisieren.
   - Diagnose-/Badge-Aufrufe (`setAppointmentBadge`, `nextApptBadge`) entfernen.
3. Smoke-Test:
   - App laden → Capture-View → keine Termin-Buttons/Badges und keine JS-Fehler im DevTool.

---

### 3. Appointments-Modul entfernen
1. `assets/js/appointments.js` + zugehörige Imports aus `main.js` deaktivieren oder Datei löschen.
2. Telemetrie/Logs (`diag.add('[appointments] ...')`) bereinigen.
3. README / UI-Hinweise anpassen (keine Termin-Funktion mehr erwähnen).

---

### 4. Supabase-Backend bereinigen
1. Neue Migration: drop `public.appointments`, zugehörige Trigger, Policies, Realtime-Publikationen.
2. Admin-/QA-Skripte aktualisieren (`02_Admin Checks.sql` → Termin-Checks streichen).
3. `sql/06_Security.sql` auf alte Policies prüfen und entfernen.
4. Datenbank testen (z. B. `select * from public.appointments` → sollte Fehler werfen).

---

### 5. Dokumentation & Release
- `docs/QA_CHECKS.md`, `CHANGELOG.md`, README aktualisieren (Termin-Funktion entfernt, neues Modul geplant).
- Finaler Smoke-Test: Login → Capture → Doctor → Chart → Logout (ohne Termin-Flows).
- Release-Tag setzen und ggf. Branch für zukünftiges Termin-Modul vorbereiten.
