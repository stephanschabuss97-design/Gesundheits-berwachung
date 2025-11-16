## Appointment-Removal Roadmap

### 1. Analyse & Vorbereitung
- Relevante Assets sammeln: `index.html` (Capture-Bereich), `app/modules/capture/index.js`, `assets/js/appointments.js`, evtl. `assets/js/main.js`.
- Backend: `sql/03_Appointments.sql`, Checks in `sql/02_Admin Checks.sql`, Policies aus `sql/06_Security.sql`.
- Diagnose/Docs notieren (`README.md`, `docs/QA_CHECKS.md`) â€“ alles, was Termine erwÃ¤hnt, markiert fÃ¼r spÃ¤teren Cleanup.

---

### 2. Frontend UI stilllegen
1. Capture-Markup:
   - Termin-Panel aus `index.html` entfernen oder als Feature-Flag ausblenden.
   - CSS-Klassen (`.appointments-panel` o.â€¯Ã¤.) lÃ¶schen.
2. JS-Logik:
   - Event-Bindings und Status-Badges in `app/modules/capture/index.js` neutralisieren.
   - Diagnose-/Badge-Aufrufe (`setAppointmentBadge`, `nextApptBadge`) entfernen.
3. Smoke-Test:
   - App laden â†’ Capture-View â†’ keine Termin-Buttons/Badges und keine JS-Fehler im DevTool.

---

### 3. Appointments-Modul entfernen
1. `assets/js/appointments.js` + zugehÃ¶rige Imports aus `main.js` deaktivieren oder Datei lÃ¶schen.
2. Telemetrie/Logs (`diag.add('[appointments] ...')`) bereinigen.
3. README / UI-Hinweise anpassen (keine Termin-Funktion mehr erwÃ¤hnen).

---

### 4. Supabase-Backend bereinigen
1. Neue Migration: drop `public.appointments`, zugehÃ¶rige Trigger, Policies, Realtime-Publikationen.
2. Admin-/QA-Skripte aktualisieren (`02_Admin Checks.sql` â†’ Termin-Checks streichen).
3. `sql/06_Security.sql` auf alte Policies prÃ¼fen und entfernen.
4. Datenbank testen (z.â€¯B. `select * from public.appointments` â†’ sollte Fehler werfen).

---

### 5. Dokumentation & Release
- `docs/QA_CHECKS.md`, `CHANGELOG.md`, README aktualisieren (Termin-Funktion entfernt, neues Modul geplant).
- Finaler Smoke-Test: Login â†’ Capture â†’ Doctor â†’ Chart â†’ Logout (ohne Termin-Flows).
- Release-Tag setzen und ggf. Branch fÃ¼r zukÃ¼nftiges Termin-Modul vorbereiten.
