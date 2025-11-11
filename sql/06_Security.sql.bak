-- 06_Security_v1.7.5.3.sql
-- Advisor-Fixes: search_path hardening + RLS InitPlan Optimierung
-- * public.set_current_timestamp_updated_at -> fixer search_path
-- * public.upsert_intake -> fixer search_path + bestehende Logik beibehalten
-- * RLS-Policies ersetzen auth.uid() durch (select auth.uid()) fuer bessere Planausnutzung
-- Hinweis: Dieser Patch ist idempotent; erneutes Ausfuehren setzt identische Werte.

begin;

create or replace function public.set_current_timestamp_updated_at()
  returns trigger
  set search_path = pg_catalog, public
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.upsert_intake(
  p_day         date,
  p_water_ml    numeric,
  p_salt_g      numeric,
  p_protein_g   numeric
)
returns public.health_events
set search_path = pg_catalog, public
language plpgsql
security invoker
as $$
declare
  v_user    uuid;
  v_ts      timestamptz;
  v_payload jsonb;
  v_row     public.health_events;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_day is not null then
    v_ts := (p_day + time '12:00')::timestamp at time zone 'Europe/Vienna';
  else
    v_ts := (now() at time zone 'Europe/Vienna')::date + time '12:00';
    v_ts := v_ts::timestamp at time zone 'Europe/Vienna';
  end if;

  v_payload := jsonb_build_object(
    'water_ml',  coalesce(p_water_ml, 0),
    'salt_g',    coalesce(p_salt_g, 0),
    'protein_g', coalesce(p_protein_g, 0)
  );

  insert into public.health_events as e (user_id, ts, type, payload)
  values (v_user, v_ts, 'intake', v_payload)
  on conflict (user_id, day, type)
  where type = 'intake'
  do update set payload = excluded.payload
  returning e.* into v_row;

  return v_row;
end;
$$;

alter policy "profile_select_own" on public.user_profile
  using ((select auth.uid()) = user_id);

alter policy "profile_insert_own" on public.user_profile
  with check ((select auth.uid()) = user_id);

alter policy "profile_update_own" on public.user_profile
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "profile_delete_own" on public.user_profile
  using ((select auth.uid()) = user_id);

alter policy "events_select_own" on public.health_events
  using ((select auth.uid()) = user_id);

alter policy "events_insert_own" on public.health_events
  with check ((select auth.uid()) = user_id);

alter policy "events_update_own" on public.health_events
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "events_delete_own" on public.health_events
  using ((select auth.uid()) = user_id);

alter policy "appointments_select_own" on public.appointments
  using ((select auth.uid()) = user_id);

alter policy "appointments_insert_own" on public.appointments
  with check ((select auth.uid()) = user_id);

alter policy "appointments_update_own" on public.appointments
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "appointments_delete_own" on public.appointments
  using ((select auth.uid()) = user_id);

commit;
