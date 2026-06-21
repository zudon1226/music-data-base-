-- Rollback helper for 202606180001_strip_music_data_from_auth_metadata.sql
-- Removes ONLY rows recorded in public.auth_music_data_migration_log.
-- Does NOT modify auth.users. Re-run app login repair to refresh JWT metadata after rollback.

-- Optional: scope rollback to one batch
-- \set batch_id '00000000-0000-0000-0000-000000000000'

delete from public.song_likes sl
using public.auth_music_data_migration_log log
where log.target_table = 'song_likes'
  and log.user_id = sl.user_id
  and log.target_key = sl.song_id;
  -- and log.batch_id = :'batch_id'::uuid

delete from public.library_saves ls
using public.auth_music_data_migration_log log
where log.target_table = 'library_saves'
  and log.user_id = ls.user_id
  and log.target_key = ls.item_id::text
  and ls.item_type = 'song';
  -- and log.batch_id = :'batch_id'::uuid

delete from public.artist_follows af
using public.auth_music_data_migration_log log
where log.target_table = 'artist_follows'
  and log.user_id = af.user_id
  and log.target_key = af.artist_id;
  -- and log.batch_id = :'batch_id'::uuid

delete from public.user_music_state ums
using public.auth_music_data_migration_log log
where log.target_table = 'user_music_state'
  and log.user_id = ums.user_id
  and log.target_key = ums.user_id::text;
  -- and log.batch_id = :'batch_id'::uuid

-- Profiles are merged, not deleted, to avoid removing legitimate account rows.

delete from public.auth_music_data_migration_log log
where true;
  -- and log.batch_id = :'batch_id'::uuid
