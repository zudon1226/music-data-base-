-- Phase 28J: production post-migration verification (read-only except service_role RPC probe in SQL editor).
-- Run after applying 202611231200_song_qualified_play_durable.sql inside a verified transaction.

select to_regclass('public.song_play_qualified_events') is not null as song_play_qualified_events,
       to_regclass('public.song_play_listener_throttle') is not null as song_play_listener_throttle,
       to_regproc('public.record_song_qualified_play(uuid,text,uuid)') is not null as record_song_qualified_play;

select policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'songs'
order by policyname;

select exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'songs' and policyname = 'public_catalog_read'
) as public_catalog_read_still_present;

select policyname, roles
from pg_policies
where schemaname = 'public' and tablename = 'songs'
  and policyname in (
    'Music Data Base anon read streaming songs',
    'Music Data Base authenticated read catalog and own songs'
  );

select relrowsecurity from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('song_play_qualified_events', 'song_play_listener_throttle');

select count(*) as event_rows from public.song_play_qualified_events;
select count(*) as throttle_rows from public.song_play_listener_throttle;

select id,
       coalesce(streaming_enabled, false) as streaming_enabled,
       coalesce(ringtone_enabled, false) as ringtone_enabled,
       coalesce(plays, 0) as plays
from public.songs
order by created_at desc nulls last;