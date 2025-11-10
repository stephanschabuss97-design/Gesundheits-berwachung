-- ============================================
-- 03_Appointments.sql  (v1.6.0)
-- Arzttermine: Tabelle + RLS + Indizes + Trigger
-- ============================================

-- Tabelle: appointments
create table if not exists public.appointments (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('nephro','internal','urology','dentist','ophtha','physio')),
  dt          timestamptz not null,
  status      text not null check (status in ('scheduled','done')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Ein geplanter Termin pro (user, role)
create unique index if not exists uq_appointments_scheduled_per_role
  on public.appointments(user_id, role)
  where status = 'scheduled';

-- Hilfsindexe (optional, lesefreundlich)
create index if not exists idx_appointments_user_status_dt
  on public.appointments(user_id, status, dt desc);
create index if not exists idx_appointments_scheduled_dt
  on public.appointments(dt)
  where status = 'scheduled';

-- Trigger: updated_at aktualisieren
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='appointments' and t.tgname='set_app_updated_at') then
    execute 'drop trigger set_app_updated_at on public.appointments';
  end if;
end $$;

create trigger set_app_updated_at
  before update on public.appointments
  for each row execute function public.set_current_timestamp_updated_at();

-- RLS aktivieren
alter table public.appointments enable row level security;

-- Policies: nur eigene Zeilen lesen/schreiben
do $pl$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='appointments' and policyname='appointments_select_own'
  ) then
    execute 'create policy "appointments_select_own" on public.appointments for select using (auth.uid() = user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='appointments' and policyname='appointments_insert_own'
  ) then
    execute 'create policy "appointments_insert_own" on public.appointments for insert with check (auth.uid() = user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='appointments' and policyname='appointments_update_own'
  ) then
    execute 'create policy "appointments_update_own" on public.appointments for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='appointments' and policyname='appointments_delete_own'
  ) then
    execute 'create policy "appointments_delete_own" on public.appointments for delete using (auth.uid() = user_id)';
  end if;
end
$pl$;

-- Realtime-Veröffentlichung (falls vorhanden)
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.appointments';
    exception when others then
      -- bereits enthalten oder keine Berechtigung -> ignorieren
      null;
    end;
  end if;
end $$;

-- Hinweise:
--  - Rollenliste kann später erweitert werden (CHECK anpassen).
--  - Optional: View v_appt_summary für kompaktes Laden (next_dt/last_dt je Rolle).
