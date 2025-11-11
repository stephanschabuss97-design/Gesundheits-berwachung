-- ============================================
-- 02_admin_checks.sql  (v1.0)
-- Admin- & QA-Script: zeigt alle Checks, jeder Block eigener Output
-- ============================================

-- 1) Duplikate-Checks
-- Erwartung: 0 Zeilen
       user_id, day, type,
       null::text as ctx,
       count(*) as c
from public.health_events
where type in ('body','note','intake')
group by user_id, day, type
having count(*) > 1;

select 'Duplikate bp' as check,
       user_id, day, type,
       ctx,
       count(*) as c
from public.health_events
where type = 'bp'
group by user_id, day, type, ctx
having count(*) > 1;

-- 2) Wertebereichs-Checks
-- Erwartung: 0 Zeilen
select 'Out-of-range bp' as check, e.id, e.user_id, e.day,
       (e.payload->>'sys')::int   as sys,
       (e.payload->>'dia')::int   as dia,
       (e.payload->>'pulse')::int as pulse
from public.health_events e
where e.type='bp' and (
  (e.payload ? 'sys'   and ((e.payload->>'sys')::int   < 70 or (e.payload->>'sys')::int   > 260)) or
  (e.payload ? 'dia'   and ((e.payload->>'dia')::int   < 40 or (e.payload->>'dia')::int   > 160)) or
  (e.payload ? 'pulse' and ((e.payload->>'pulse')::int < 35 or (e.payload->>'pulse')::int > 200))
);

select 'Out-of-range intake' as check, e.id, e.user_id, e.day,
       (e.payload->>'water_ml')::numeric as water_ml,
       (e.payload->>'salt_g')::numeric as salt_g,
       (e.payload->>'protein_g')::numeric as protein_g
from public.health_events e
where e.type='intake' and (
  (e.payload ? 'water_ml' and ((e.payload->>'water_ml')::numeric < 0 or (e.payload->>'water_ml')::numeric > 6000)) or
  (e.payload ? 'salt_g' and ((e.payload->>'salt_g')::numeric < 0 or (e.payload->>'salt_g')::numeric > 30)) or
  (e.payload ? 'protein_g' and ((e.payload->>'protein_g')::numeric < 0 or (e.payload->>'protein_g')::numeric > 300))
);

-- 3) Unbekannte Keys-Checks
-- Erwartung: 0 Zeilen
select 'Unknown keys bp' as check, e.id, k.key
from public.health_events e
cross join lateral jsonb_object_keys(e.payload) as k(key)
where e.type='bp'
  and k.key not in ('sys','dia','pulse','ctx');

select 'Unknown keys body' as check, e.id, k.key
from public.health_events e
cross join lateral jsonb_object_keys(e.payload) as k(key)
where e.type='body'
  and k.key not in ('kg','cm');

from public.health_events e
cross join lateral jsonb_object_keys(e.payload) as k(key)
  and k.key not in ('training','sick','low_intake','salt_high','protein_high90',
                    'valsartan_missed','forxiga_missed','nsar_taken');

select 'Unknown keys note' as check, e.id, k.key
from public.health_events e
cross join lateral jsonb_object_keys(e.payload) as k(key)
where e.type='note'
  and k.key not in ('text');

select 'Unknown keys intake' as check, e.id, k.key
from public.health_events e
cross join lateral jsonb_object_keys(e.payload) as k(key)
where e.type='intake'
  and k.key not in ('water_ml','salt_g','protein_g');

-- 4) Tagesübersicht für einen User (Admin-Tool)
-- :uid und :day nach Bedarf ersetzen
select 'Tagesübersicht' as check, e.*
from public.health_events e
where e.user_id = '00000000-0000-0000-0000-000000000001'
  and e.day = current_date;

-- 5) Event gezielt löschen (Admin-Tool)
-- Beispiel (ID anpassen):
-- delete from public.health_events where id = '...';

-- 6) Realtime-Check
select 'Realtime tables' as check, p.pubname, count(t.tablename) as tables
from pg_publication p
left join pg_publication_tables t on p.pubname = t.pubname
where p.pubname = 'supabase_realtime'
group by p.pubname;

-- 7) User-Übersicht (Auth)
select 'Users' as check, u.id, u.email
from auth.users u;





-- 8) Appointments Checks (v1.6.0)
-- Erwartung: 0 Zeilen, sofern alles konsistent ist

-- Mehr als 1 'scheduled' pro Rolle/User? (sollte 0 liefern)
select 'appointments duplicate scheduled' as check,
       a.user_id, a.role, count(*) as c
from public.appointments a
where a.status = 'scheduled'
group by a.user_id, a.role
having count(*) > 1;

-- Geplante Termine in der Vergangenheit (�berf�llig)
select 'appointments overdue scheduled' as check,
       a.user_id, a.role, a.dt
from public.appointments a
where a.status = 'scheduled'
  and a.dt < now();

-- Done ohne Zeitpunkt (sollte 0 liefern, dt ist NOT NULL)
select 'appointments done without dt' as check,
       a.user_id, a.role, a.id
from public.appointments a
where a.status = 'done'
  and a.dt is null;
