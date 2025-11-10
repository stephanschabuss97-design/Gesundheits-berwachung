﻿-- ============================================
-- 01_health_schema.sql  (v1.3.0)
-- PostgreSQL 15 | Supabase-kompatibel
-- Ziel: Minimal und robust – Eventschema + RLS + Validierung + Views(security_invoker) + Realtime
-- ============================================

-- (A) Extensions
create extension if not exists pgcrypto;

-- (B) User-Profil (optional)
create table public.user_profile (
  user_id    uuid primary key,
  height_cm  integer check (height_cm is null or height_cm between 120 and 230),
  created_at timestamptz not null default now()
);

alter table public.user_profile enable row level security;

create policy "profile_select_own"
  on public.user_profile for select
  using (user_id = auth.uid());

create policy "profile_insert_own"
  on public.user_profile for insert
  with check (user_id = auth.uid());

create policy "profile_update_own"
  on public.user_profile for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "profile_delete_own"
  on public.user_profile for delete
  using (user_id = auth.uid());

-- (C) Kern: Health-Events
-- Typen:
--  - 'bp'       : Blutdruck (sys/dia/pulse, pulse optional), ctx ∈ {Morgen,Abend}
--  - 'body'     : Gewicht/Bauchumfang (kg/cm), mind. eines Pflicht
--  - 'day_flags': Tages-Flags (booleans)
--  - 'note'     : Textnotiz (text, 1..2000)
--  - 'intake'   : Lifestyle-Intake (water_ml/salt_g/protein_g), kumulativ je Tag
create table public.health_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  ts         timestamptz not null default now(),
  day        date generated always as ((ts at time zone 'Europe/Vienna')::date) stored,
  type       text not null check (type in ('bp','body','day_flags','note','intake')),
  ctx        text null,       -- nur für bp; wird validiert
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.health_events enable row level security;

create policy "events_select_own"
  on public.health_events for select
  using (user_id = auth.uid());

create policy "events_insert_own"
  on public.health_events for insert
  with check (user_id = auth.uid());

create policy "events_update_own"
  on public.health_events for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "events_delete_own"
  on public.health_events for delete
  using (user_id = auth.uid());

-- (D) Indizes & Eindeutigkeit
create index if not exists idx_events_user_day on public.health_events (user_id, day);
create index if not exists idx_events_user_ts  on public.health_events (user_id, ts);
create index if not exists idx_events_type     on public.health_events (type);

-- body: max 1 pro Tag/User
create unique index if not exists uq_events_body_per_day
  on public.health_events (user_id, day, type)
  where type = 'body';

-- day_flags: max 1 pro Tag/User
create unique index if not exists uq_events_flags_per_day
  on public.health_events (user_id, day, type)
  where type = 'day_flags';

-- note: max 1 pro Tag/User
create unique index if not exists uq_events_note_per_day
  on public.health_events (user_id, day, type)
  where type = 'note';

-- intake: max 1 pro Tag/User
create unique index if not exists uq_events_intake_per_day
  on public.health_events (user_id, day, type)
  where type = 'intake';

-- bp: max 1 pro Tag/Kontext (Morgen/Abend)/User
create unique index if not exists uq_events_bp_per_day_ctx
  on public.health_events (user_id, day, type, ctx)
  where type = 'bp';

-- (E) Kontext-Regel (ctx nur bei bp; dort Pflicht und gültig)
alter table public.health_events
  add constraint chk_ctx_for_bp
  check (
    (type = 'bp'  and ctx in ('Morgen','Abend')) or
    (type <> 'bp' and ctx is null)
  );

-- (F) Payload-Validierung pro type (Pflichtfelder + Ranges + erlaubte Keys)
create or replace function public.trg_events_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  keys text[];
  has_kg boolean;
  has_cm boolean;
begin
  if new.ts is null then
    raise exception 'ts darf nicht NULL sein' using errcode = '23514';
  end if;

  if new.type = 'bp' then
    -- erlaubte Keys
    keys := array['sys','dia','pulse','ctx'];
    if exists (select 1 from jsonb_object_keys(new.payload) as t(k) where k <> all(keys)) then
      raise exception 'bp: payload enthält unbekannte Keys' using errcode = '22023';
    end if;

    -- Pflichtfelder: sys & dia sind Pflicht; pulse optional; ctx Pflicht
    if not (new.payload ? 'sys') then
      raise exception 'bp: payload.sys (Pflicht) fehlt' using errcode = '23502';
    end if;
    if not (new.payload ? 'dia') then
      raise exception 'bp: payload.dia (Pflicht) fehlt' using errcode = '23502';
    end if;
    if not (new.payload ? 'ctx') then
      raise exception 'bp: payload.ctx (Pflicht) fehlt' using errcode = '23502';
    end if;

    -- Ranges
    if (new.payload->>'sys') !~ '^\d+$' or (new.payload->>'sys')::int < 70 or (new.payload->>'sys')::int > 260 then
      raise exception 'bp.sys außerhalb Range 70–260' using errcode = '22003';
    end if;
    if (new.payload->>'dia') !~ '^\d+$' or (new.payload->>'dia')::int < 40 or (new.payload->>'dia')::int > 160 then
      raise exception 'bp.dia außerhalb Range 40–160' using errcode = '22003';
    end if;
    if (new.payload ? 'pulse') then
      if (new.payload->>'pulse') !~ '^\d+$' or (new.payload->>'pulse')::int < 35 or (new.payload->>'pulse')::int > 200 then
        raise exception 'bp.pulse außerhalb Range 35–200' using errcode = '22003';
      end if;
    end if;

    -- ctx Spiegelung in Spalte
    if (new.payload->>'ctx') not in ('Morgen','Abend') then
      raise exception 'bp.ctx muss "Morgen" oder "Abend" sein' using errcode = '22023';
    end if;
    new.ctx := new.payload->>'ctx';

  elsif new.type = 'body' then
    keys := array['kg','cm'];
    if exists (select 1 from jsonb_object_keys(new.payload) as t(k) where k <> all(keys)) then
      raise exception 'body: payload enthält unbekannte Keys' using errcode = '22023';
    end if;

    has_kg := new.payload ? 'kg';
    has_cm := new.payload ? 'cm';
    if not (has_kg or has_cm) then
      raise exception 'body: mind. einer von kg oder cm ist Pflicht' using errcode = '23502';
    end if;

    if has_kg then
      if (new.payload->>'kg') !~ '^\d+(\.\d+)?$' or (new.payload->>'kg')::numeric < 40 or (new.payload->>'kg')::numeric > 250 then
        raise exception 'body.kg außerhalb Range 40–250' using errcode = '22003';
      end if;
    end if;

    if has_cm then
      if (new.payload->>'cm') !~ '^\d+(\.\d+)?$' or (new.payload->>'cm')::numeric < 50 or (new.payload->>'cm')::numeric > 200 then
        raise exception 'body.cm außerhalb Range 50–200' using errcode = '22003';
      end if;
    end if;

  elsif new.type = 'day_flags' then
    keys := array['training','sick','low_intake','salt_high','protein_high90','valsartan_missed','forxiga_missed','nsar_taken'];
    if exists (select 1 from jsonb_object_keys(new.payload) as t(k) where k <> all(keys)) then
      raise exception 'day_flags: payload enthält unbekannte Keys' using errcode = '22023';
    end if;

    -- alle vorhandenen Keys müssen boolean sein
    if exists (
      select 1
      from jsonb_each(new.payload) as kv(k, v)
      where jsonb_typeof(v) <> 'boolean'
    ) then
      raise exception 'day_flags: alle Werte müssen boolean sein' using errcode = '22023';
    end if;

  elsif new.type = 'note' then
    keys := array['text'];
    if exists (select 1 from jsonb_object_keys(new.payload) as t(k) where k <> all(keys)) then
      raise exception 'note: payload enthält unbekannte Keys' using errcode = '22023';
    end if;

    if not (new.payload ? 'text') then
      raise exception 'note: payload.text fehlt' using errcode = '23502';
    end if;
    if length(new.payload->>'text') < 1 or length(new.payload->>'text') > 2000 then
      raise exception 'note.text Länge 1–2000 Zeichen' using errcode = '22023';
    end if;

  elsif new.type = 'intake' then
    keys := array['water_ml','salt_g','protein_g'];
    if exists (select 1 from jsonb_object_keys(new.payload) as t(k) where k <> all(keys)) then
      raise exception 'intake: payload enthält unbekannte Keys' using errcode = '22023';
    end if;

    if jsonb_typeof(new.payload) <> 'object' then
      raise exception 'intake: payload muss Objekt sein' using errcode = '23502';
    end if;
    if not ((new.payload ? 'water_ml') or (new.payload ? 'salt_g') or (new.payload ? 'protein_g')) then
      raise exception 'intake: mindestens ein Wert erforderlich' using errcode = '23502';
    end if;

    if (new.payload ? 'water_ml') then
      if (new.payload->>'water_ml') !~ '^\d+(\.\d+)?$' then
        raise exception 'intake.water_ml muss Zahl sein' using errcode = '22023';
      end if;
      if (new.payload->>'water_ml')::numeric < 0 or (new.payload->>'water_ml')::numeric > 6000 then
        raise exception 'intake.water_ml außerhalb Range 0–6000' using errcode = '22003';
      end if;
    end if;

    if (new.payload ? 'salt_g') then
      if (new.payload->>'salt_g') !~ '^\d+(\.\d+)?$' then
        raise exception 'intake.salt_g muss Zahl sein' using errcode = '22023';
      end if;
      if (new.payload->>'salt_g')::numeric < 0 or (new.payload->>'salt_g')::numeric > 30 then
        raise exception 'intake.salt_g außerhalb Range 0–30' using errcode = '22003';
      end if;
    end if;

    if (new.payload ? 'protein_g') then
      if (new.payload->>'protein_g') !~ '^\d+(\.\d+)?$' then
        raise exception 'intake.protein_g muss Zahl sein' using errcode = '22023';
      end if;
      if (new.payload->>'protein_g')::numeric < 0 or (new.payload->>'protein_g')::numeric > 300 then
        raise exception 'intake.protein_g außerhalb Range 0–300' using errcode = '22003';
      end if;
    end if;

  else
    raise exception 'unbekannter type: %', new.type using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger trg_events_validate_biu
  before insert or update on public.health_events
  for each row execute function public.trg_events_validate();

-- (G) Realtime-Publication idempotent bestücken
-- Damit listen wir health_events (und optional user_profile) für Realtime
-- Falls die Publication schon existiert, bleiben Fehler ignoriert (idempotent)
do $$
begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if not found then
    execute 'create publication supabase_realtime';
  end if;
  begin execute 'alter publication supabase_realtime add table public.health_events'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.user_profile';  exception when others then null; end;
end;
$$;

-- (H) Sichten (mit security_invoker = on)
create or replace view public.v_events_bp
  with (security_invoker = on)
as
select
  e.id,
  e.user_id,
  e.ts,
  e.day,
  e.ctx,
  (e.payload->>'sys')::int   as sys,
  (e.payload->>'dia')::int   as dia,
  (e.payload->>'pulse')::int as pulse
from public.health_events e
where e.type = 'bp';

create or replace view public.v_events_body
  with (security_invoker = on)
as
select
  e.id,
  e.user_id,
  e.ts,
  e.day,
  (e.payload->>'kg')::numeric         as kg,
  (e.payload->>'cm')::numeric         as cm,
  (e.payload->>'fat_pct')::numeric    as fat_pct,
  (e.payload->>'muscle_pct')::numeric as muscle_pct,
  case when e.payload ? 'kg' and e.payload ? 'fat_pct'
       then (e.payload->>'kg')::numeric * (e.payload->>'fat_pct')::numeric / 100
       else null end                   as fat_kg,
  case when e.payload ? 'kg' and e.payload ? 'muscle_pct'
       then (e.payload->>'kg')::numeric * (e.payload->>'muscle_pct')::numeric / 100
       else null end                   as muscle_kg
from public.health_events e
where e.type = 'body';


create or replace view public.v_events_day_flags
  with (security_invoker = on)
as
select
  e.id,
  e.user_id,
  e.ts,
  e.day,
  coalesce( (e.payload->>'training')::boolean, false)         as training,
  coalesce( (e.payload->>'sick')::boolean, false)              as sick,
  coalesce( (e.payload->>'low_intake')::boolean, false)        as low_intake,
  coalesce( (e.payload->>'salt_high')::boolean, false)         as salt_high,
  coalesce( (e.payload->>'protein_high90')::boolean, false)    as protein_high90,
  coalesce( (e.payload->>'valsartan_missed')::boolean, false)  as valsartan_missed,
  coalesce( (e.payload->>'forxiga_missed')::boolean, false)    as forxiga_missed,
  coalesce( (e.payload->>'nsar_taken')::boolean, false)        as nsar_taken
from public.health_events e
where e.type = 'day_flags';

-- (I) Doku-Kommentare
comment on table public.health_events is 'Event-Log (bp/body/day_flags/note/intake) mit RLS, Unique je Tag/Type(+ctx), Validierungs-Trigger und Europe/Vienna-Tageslogik.';
comment on view  public.v_events_bp is 'Blutdruck-Events (Morgen/Abend) mit sys/dia/pulse.';
comment on view  public.v_events_body is 'Körperwerte (Gewicht/Bauchumfang/Komposition) pro Tag.';
comment on view  public.v_events_day_flags is 'Tages-Flags (Training, Salz, Protein, etc.) pro Tag.';
