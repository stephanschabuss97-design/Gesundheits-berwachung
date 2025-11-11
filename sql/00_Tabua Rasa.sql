-- ============================================
-- 00_tabula_rasa.sql  (v1.3.0)
-- Entfernt Health-bezogene Objekte sicher & idempotent
-- PostgreSQL 15 | Supabase-kompatibel
-- ============================================

do $$
declare
  pol record; trg record; vw record; tbl record;
begin
  -- 1) Realtime-Publication bereinigen (falls vorhanden)
  begin
    for tbl in
      select schemaname, tablename
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename in ('health_events','user_profile',
                          'v_events_bp','v_events_body')
    loop
      execute format('alter publication supabase_realtime drop table %I.%I',
                     tbl.schemaname, tbl.tablename);
    end loop;
  exception when others then
    raise notice 'Publication cleanup Hinweis: %', sqlerrm;
  end;

  -- 2) Views droppen
  for vw in
    select schemaname, viewname
    from pg_views
    where schemaname = 'public'
      and viewname in ('v_events_bp','v_events_body')
  loop
    execute format('drop view if exists %I.%I cascade', vw.schemaname, vw.viewname);
  end loop;

  -- 3) Trigger droppen (health_events)
  if to_regclass('public.health_events') is not null then
    for trg in
      select tgname from pg_trigger
      where tgrelid = 'public.health_events'::regclass and not tgisinternal
    loop
      execute format('drop trigger if exists %I on public.health_events', trg.tgname);
    end loop;
  end if;

  -- 4) Policies droppen
  if to_regclass('public.health_events') is not null then
    for pol in select policyname from pg_policies
               where schemaname='public' and tablename='health_events'
    loop
      execute format('drop policy if exists %I on public.health_events', pol.policyname);
    end loop;
  end if;
  if to_regclass('public.user_profile') is not null then
    for pol in select policyname from pg_policies
               where schemaname='public' and tablename='user_profile'
    loop
      execute format('drop policy if exists %I on public.user_profile', pol.policyname);
    end loop;
  end if;

  -- 5) Funktionen droppen (idempotent)
  begin execute 'drop function if exists public.trg_events_validate() cascade'; end;
  begin execute 'drop function if exists public.trg_events_set_day() cascade'; end;

  -- 6) Tabellen droppen
  begin execute 'drop table if exists public.health_events cascade'; end;
  begin execute 'drop table if exists public.user_profile cascade'; end;

  raise notice 'Tabula Rasa: Alle Health-Objekte entfernt.';
end
$$;

comment on schema public is 'Tabula Rasa ausgeführt: keine Health-Objekte vorhanden.';

