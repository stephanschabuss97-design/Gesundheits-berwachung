-- ============================================
-- 08_remove_appointments.sql  (v1.7.x)
-- Entfernt das alte Arzttermin-Modul (Tabellen, Policies, Realtime)
-- Idempotent: Mehrfach ausführbar ohne Fehler.
-- ============================================

-- 0) Termin-Daten optional löschen (nur falls noch vorhanden)
delete from public.appointments;

-- 1) Realtime-Publikation bereinigen
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointments'
  ) then
    execute 'alter publication supabase_realtime drop table public.appointments';
  end if;
end
$$;

-- 2) Trigger entfernen
drop trigger if exists set_app_updated_at on public.appointments;

-- 3) RLS-Policies löschen
drop policy if exists "appointments_select_own" on public.appointments;
drop policy if exists "appointments_insert_own" on public.appointments;
drop policy if exists "appointments_update_own" on public.appointments;
drop policy if exists "appointments_delete_own" on public.appointments;

-- 4) Tabelle + Indizes entfernen
drop table if exists public.appointments cascade;

-- 5) Admin-/QA-Checks werden separat aus sql/02_Admin Checks.sql entfernt.
