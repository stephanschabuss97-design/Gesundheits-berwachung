# Assistant Appointments Module Overview

**Status**: Phase 4.2 (Termin- und Arztmodul abgeschlossen)
**Scope**: Supabase-gestütztes Terminpanel inkl. Butler-Snapshot, Wiederholungen (Nie/Monatlich/Jährlich) und Sync-Events für den Assistant.

## 1. Purpose
- Termine schnell erfassen (medizinisch oder privat) und sofort im Hub anzeigen.
- Upcoming-Liste im Assistant-Butler bereitstellen, damit Text-/Foto-Analysen Kontext haben.
- Grundlage für künftige Aktionen (z. B. Erinnerungen, Butler-Suggests) schaffen.

## 2. UI Surface
- Orbit Süd-Ost öffnet das Terminpanel #hubAppointmentsPanel.
- Formularfelder: Terminname, Datum, Wiederholen (Nie/Monatlich/Jährlich), Uhrzeit, Ort/Adresse, Notiz.
- Buttons: **Termin speichern** (POST/UPSERT) und **Übersicht anzeigen** (scrollt zur Liste).
- Übersicht zeigt alle Termine in Kartenform (Datum/Zeit, Ort, Status) mit Buttons *Erledigt/Zurücksetzen* und *Löschen*.
- Unter „Kommende Termine“ werden Live-Schnipsel angezeigt (ersetzt alte Mock-Placeholder).

## 3. Data Flow & Supabase
- Tabelle ppointments_v2 (SQL → sql/09_Appointments_v2.sql) mit Feldern id, user_id, 	itle, start_at, location, 
otes, status, epeat_rule, meta, Timestamps.
- View _appointments_v2_upcoming liefert geplante Termine ab gestern; View läuft mit security_invoker.
- RLS Policies (select/insert/update/delete) erlauben nur Zugriff auf die eigene user_id.
- Modul ruft Supabase via ensureSupabaseClient()/getUserId() und normalisiert alle Zeitzonen ins lokale Datum/Zeit-Paar.

## 4. Frontend Module (pp/modules/appointments/index.js)
- init() bindet Form/Buttons, startet syncAppointments({ reason: 'init' }) und hört auf supabase:ready.
- CRUD:
  - insertAppointmentRemote(payload)
  - updateAppointmentRemote(id, patch)
  - deleteAppointmentRemote(id)
- State (state.items) hält alle Termine; enderOverview() bzw. computeUpcomingFromState() treiben Panel + Butler.
- Öffnen des Panels triggert ppointments.sync({ reason: 'panel-open' }) (via Hub-Binding).
- Nach jedem Insert/Toggle/Delete feuert das Modul ppointments:changed (CustomEvent) ⇒ Butler aktualisiert Header.

## 5. Assistant Integration
- Butler ruft ppModules.appointments.getUpcoming(limit,{ reason }) (Promise). Rückgabe: Array { id, label, detail }.
- efreshAssistantContext() wartet auf Promise.all([intakeSnapshot, getUpcoming]) und rendert max. zwei Einträge.
- Keine Mockdaten mehr; QA prüft, dass „Keine Termine geladen.“ nur erscheint, wenn Supabase leer ist oder Credentials fehlen.

## 6. QA Notes
- Supabase 403 ⇒ Panel zeigt Toast/Diag [appointments] save failed …; Butler bleibt leer.
- Wiederholungen: Dropdown speichert epeat_rule (
one, monthly, nnual). Annuale Einträge bleiben als einzelne Zeile (Automatisierung folgt später).
- Buttons *Erledigt/Zurücksetzen* toggeln status (scheduled ↔ done); 
otifyChange('toggle') aktualisiert Butler sofort.
- Löschen entfernt Karte + Butler-Eintrag und feuert 
otifyChange('delete').
- Snapshot reagiert auch, wenn Termine aus anderen Geräten gelöscht werden (Realtime optional, aktuell Pull bei Panel-Open + Butler-Refresh).

## 7. Next Steps
- Reminder/Push (PWA) → Phase 8.
- Assistant Actions (Termin öffnen, Arzt-Routing) → Phase 5ff.
- Optional: Repeating-Cron (jährliche Termine automatisch kopieren) sobald Server-Jobs bereitstehen.
