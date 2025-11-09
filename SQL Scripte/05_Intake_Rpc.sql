-- ============================================
-- 05_Intake_Rpc_v1.7.3.7.sql
-- RPC: upsert_intake(day, water_ml, salt_g, protein_g)
--  - RLS-konform (user_id = auth.uid())
--  - Upsert via unique index (user_id, day) where type='intake'
--  - Gibt genau eine Zeile (health_events) zurück
-- ============================================

create or replace function public.upsert_intake(
  p_day         date,
  p_water_ml    numeric,
  p_salt_g      numeric,
  p_protein_g   numeric
)
returns public.health_events
language plpgsql
security invoker
as $$
declare
  v_user    uuid;
  v_ts      timestamptz;
  v_payload jsonb;
  v_row     public.health_events;
begin
  -- RLS: erzwinge gültige Authentifizierung
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Tageszeitpunkt lokal (Europe/Vienna) auf 12:00, damit day sicher passt
  if p_day is not null then
    v_ts := (p_day + time '12:00')::timestamp at time zone 'Europe/Vienna';
  else
    v_ts := (now() at time zone 'Europe/Vienna')::date + time '12:00';
    v_ts := (v_ts)::timestamp at time zone 'Europe/Vienna';
  end if;

  -- Payload bauen (0 ist erlaubt, Ranges werden durch Trigger validiert)
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

-- Ausführung für anonyme/angemeldete User erlauben (RLS bleibt aktiv)
grant execute on function public.upsert_intake(date, numeric, numeric, numeric) to anon, authenticated;

comment on function public.upsert_intake(date, numeric, numeric, numeric)
  is 'Atomarer UPSERT der Intake-Totals pro Tag (RLS via auth.uid).';
