-- ============================================
-- 04_Body_Comp_v1.6.6.sql
-- Delta-Migration: Body-Komposition (fat_pct/muscle_pct) + View-Erweiterung
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS
-- ============================================

-- 1) Trigger-Funktion aktualisieren (nur Body-Teil erweitert)
create or replace function public.trg_events_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  keys text[];
  has_kg boolean;
  has_cm boolean;
  has_fat_pct boolean;
  has_muscle_pct boolean;
begin
  if new.ts is null then
    raise exception 'ts darf nicht NULL sein' using errcode = '23514';
  end if;

  if new.type = 'bp' then
    keys := array['sys','dia','pulse','ctx'];
    if exists (select 1 from jsonb_object_keys(new.payload) as t(k) where k <> all(keys)) then
      raise exception 'bp: payload enthält unbekannte Keys' using errcode = '22023';
    end if;

    if not (new.payload ? 'sys') then
      raise exception 'bp: payload.sys (Pflicht) fehlt' using errcode = '23502';
    end if;
    if not (new.payload ? 'dia') then
      raise exception 'bp: payload.dia (Pflicht) fehlt' using errcode = '23502';
    end if;
    if not (new.payload ? 'ctx') then
      raise exception 'bp: payload.ctx (Pflicht) fehlt' using errcode = '23502';
    end if;

    if (new.payload->>'sys') !~ '^\d+$' or (new.payload->>'sys')::int < 70 or (new.payload->>'sys')::int > 260 then
      raise exception 'bp.sys außerhalb Range 70-260' using errcode = '22003';
    end if;
    if (new.payload->>'dia') !~ '^\d+$' or (new.payload->>'dia')::int < 40 or (new.payload->>'dia')::int > 160 then
      raise exception 'bp.dia außerhalb Range 40-160' using errcode = '22003';
    end if;
    if (new.payload ? 'pulse') then
      if (new.payload->>'pulse') !~ '^\d+$' or (new.payload->>'pulse')::int < 35 or (new.payload->>'pulse')::int > 200 then
        raise exception 'bp.pulse außerhalb Range 35-200' using errcode = '22003';
      end if;
    end if;

    if (new.payload->>'ctx') not in ('Morgen','Abend') then
      raise exception 'bp.ctx muss "Morgen" oder "Abend" sein' using errcode = '22023';
    end if;
    new.ctx := new.payload->>'ctx';

  elsif new.type = 'body' then
    keys := array['kg','cm','fat_pct','muscle_pct'];
    if exists (select 1 from jsonb_object_keys(new.payload) as t(k) where k <> all(keys)) then
      raise exception 'body: payload enthält unbekannte Keys' using errcode = '22023';
    end if;

    has_kg := new.payload ? 'kg';
    has_cm := new.payload ? 'cm';
    has_fat_pct := new.payload ? 'fat_pct';
    has_muscle_pct := new.payload ? 'muscle_pct';

    if not (has_kg or has_cm) then
      raise exception 'body: mind. einer von kg oder cm ist Pflicht' using errcode = '23502';
    end if;

    if has_kg then
      if (new.payload->>'kg') !~ '^\d+(\.\d+)?$' or (new.payload->>'kg')::numeric < 40 or (new.payload->>'kg')::numeric > 250 then
        raise exception 'body.kg außerhalb Range 40-250' using errcode = '22003';
      end if;
    end if;

    if has_cm then
      if (new.payload->>'cm') !~ '^\d+(\.\d+)?$' or (new.payload->>'cm')::numeric < 50 or (new.payload->>'cm')::numeric > 200 then
        raise exception 'body.cm außerhalb Range 50-200' using errcode = '22003';
      end if;
    end if;

    if has_fat_pct then
      if (new.payload->>'fat_pct') !~ '^\d+(\.\d+)?$' then
        raise exception 'body.fat_pct muss Zahl sein' using errcode = '22023';
      end if;
      if (new.payload->>'fat_pct')::numeric < 0 or (new.payload->>'fat_pct')::numeric > 100 then
        raise exception 'body.fat_pct außerhalb Range 0-100' using errcode = '22003';
      end if;
    end if;

    if has_muscle_pct then
      if (new.payload->>'muscle_pct') !~ '^\d+(\.\d+)?$' then
        raise exception 'body.muscle_pct muss Zahl sein' using errcode = '22023';
      end if;
      if (new.payload->>'muscle_pct')::numeric < 0 or (new.payload->>'muscle_pct')::numeric > 100 then
        raise exception 'body.muscle_pct außerhalb Range 0-100' using errcode = '22003';
      end if;
    end if;

  elsif new.type = 'day_flags' then
    keys := array['training','sick','low_intake','salt_high','protein_high90','valsartan_missed','forxiga_missed','nsar_taken'];
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
      raise exception 'note.text Länge 1-2000 Zeichen' using errcode = '22023';
    end if;

  elsif new.type = 'intake' then
    keys := array['water_ml','salt_g','protein_g'];
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
        raise exception 'intake.water_ml außerhalb Range 0-6000' using errcode = '22003';
      end if;
    end if;
    if (new.payload ? 'salt_g') then
      if (new.payload->>'salt_g') !~ '^\d+(\.\d+)?$' then
        raise exception 'intake.salt_g muss Zahl sein' using errcode = '22023';
      end if;
      if (new.payload->>'salt_g')::numeric < 0 or (new.payload->>'salt_g')::numeric > 30 then
        raise exception 'intake.salt_g außerhalb Range 0-30' using errcode = '22003';
      end if;
    end if;
    if (new.payload ? 'protein_g') then
      if (new.payload->>'protein_g') !~ '^\d+(\.\d+)?$' then
        raise exception 'intake.protein_g muss Zahl sein' using errcode = '22023';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 2) View erweitern: zusätzliche Spalten + Berechnung
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

comment on view public.v_events_body is 'Körperwerte (Gewicht/Bauchumfang/Komposition) pro Tag.';

-- 3) Optionaler Performance-Index
create index if not exists idx_events_user_type_ts
  on public.health_events (user_id, type, ts desc);

