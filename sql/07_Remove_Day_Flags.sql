-- ============================================
-- 07_remove_day_flags.sql  (v1.7.x)
-- Zweck: Entfernt die veralteten Event-Typen 'day_flags'
--        aus Schema + Views + Triggerfunktion.
-- Idempotent ausführbar.
-- ============================================

-- 1) Alt-Daten optional löschen (nur falls noch vorhanden)
delete from public.health_events where type = 'day_flags';

-- 2) View & Index entfernen
drop view if exists public.v_events_day_flags cascade;
drop index if exists public.uq_events_flags_per_day;

-- 3) type-Constraint korrigieren
alter table public.health_events
  drop constraint if exists health_events_type_check;

alter table public.health_events
  add constraint health_events_type_check
  check (type in ('bp','body','note','intake'));

-- 4) Triggerfunktion aktualisieren (ohne day_flags-Branch)
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
      if (new.payload->>'protein_g')::numeric < 0 or (new.payload->>'protein_g')::numeric > 300 then
        raise exception 'intake.protein_g außerhalb Range 0-300' using errcode = '22003';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on table public.health_events is 'Event-Log (bp/body/note/intake) mit RLS, Unique je Tag/Type(+ctx), Validierungs-Trigger und Europe/Vienna-Tageslogik.';
