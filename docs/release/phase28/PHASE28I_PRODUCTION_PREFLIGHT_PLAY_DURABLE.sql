-- Phase 28I: read-only production preflight for 202611231200_song_qualified_play_durable.sql
-- Safe to run with: npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy -f <this file>

select 'song_play_qualified_events' as object,
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'song_play_qualified_events' and c.relkind = 'r'
  ) as present;

select 'song_play_listener_throttle' as object,
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'song_play_listener_throttle' and c.relkind = 'r'
  ) as present;

select 'record_song_qualified_play' as object,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_song_qualified_play'
  ) as present;

select policyname, roles, cmd, qual::text as using_expr
from pg_policies
where schemaname = 'public' and tablename = 'songs'
order by policyname;

select count(*) filter (where coalesce(streaming_enabled, false) = false) as non_streaming_songs,
       count(*) filter (where coalesce(streaming_enabled, false) = true) as streaming_songs,
       count(*) as total_songs
from public.songs;