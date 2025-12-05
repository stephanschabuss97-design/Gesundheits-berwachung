-- ============================================
-- 09_Appointments_v2.sql  (v4.2 proto)
-- Neues Terminmodul: freie Termine (medizinisch + privat), Repeat-Regel, RLS.
-- ============================================

create table if not exists public.appointments_v2 (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  start_at     timestamptz not null,
  location     text,
  notes        text,
  status       text not null default 'scheduled'
                check (status in ('scheduled','done','cancelled')),
  repeat_rule  text not null default 'none'
                check (repeat_rule in ('none','monthly','annual')),
  meta         jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_appt_v2_user_start
  on public.appointments_v2(user_id, start_at desc);

create index if not exists idx_appt_v2_status
  on public.appointments_v2(status)
  where status = 'scheduled';

create or replace function public.set_appointments_v2_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'set_appt_v2_updated_at') then
    execute 'drop trigger set_appt_v2_updated_at on public.appointments_v2';
  end if;
end $$;

create trigger set_appt_v2_updated_at
  before update on public.appointments_v2
  for each row execute function public.set_appointments_v2_updated_at();

alter table public.appointments_v2 enable row level security;

do $pl$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='appointments_v2' and policyname='appointments_v2_select'
  ) then
    execute 'create policy "appointments_v2_select" on public.appointments_v2 for select using (auth.uid() = user_id)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='appointments_v2' and policyname='appointments_v2_insert'
  ) then
    execute 'create policy "appointments_v2_insert" on public.appointments_v2 for insert with check (auth.uid() = user_id)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='appointments_v2' and policyname='appointments_v2_update'
  ) then
    execute 'create policy "appointments_v2_update" on public.appointments_v2 for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='appointments_v2' and policyname='appointments_v2_delete'
  ) then
    execute 'create policy "appointments_v2_delete" on public.appointments_v2 for delete using (auth.uid() = user_id)';
  end if;
end
$pl$;

do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.appointments_v2';
    exception when others then null;
    end;
  end if;
end $$;

create or replace view public.v_appointments_v2_upcoming as
select
  a.id,
  a.user_id,
  a.title,
  a.start_at,
  a.location,
  a.notes,
  a.status,
  a.repeat_rule,
  a.meta
from public.appointments_v2 a
where a.status = 'scheduled'
  and a.start_at >= now() - interval '1 day'
order by a.start_at asc;

comment on view public.v_appointments_v2_upcoming
  is 'Hilfsview f?r Apps: liefert kommende Termine ab gestern +1 Tag.';

alter view public.v_appointments_v2_upcoming
  set (security_invoker = true);

revoke all on public.v_appointments_v2_upcoming from public;
grant select on public.v_appointments_v2_upcoming to authenticated;
grant select on public.v_appointments_v2_upcoming to service_role;

