-- Catalog moderation hold for Apple App Review 1.2 takedowns.
-- Additive only: reversible unpublish via moderation_state. Does not delete media files.

alter table public.songs
  add column if not exists moderation_state text not null default 'clear';

alter table public.videos
  add column if not exists moderation_state text not null default 'clear';

alter table public.albums
  add column if not exists moderation_state text not null default 'clear';

alter table public.podcast_episodes
  add column if not exists moderation_state text not null default 'clear';

alter table public.songs drop constraint if exists songs_moderation_state_check;
alter table public.songs
  add constraint songs_moderation_state_check
  check (moderation_state in ('clear', 'takedown_pending', 'removed'));

alter table public.videos drop constraint if exists videos_moderation_state_check;
alter table public.videos
  add constraint videos_moderation_state_check
  check (moderation_state in ('clear', 'takedown_pending', 'removed'));

alter table public.albums drop constraint if exists albums_moderation_state_check;
alter table public.albums
  add constraint albums_moderation_state_check
  check (moderation_state in ('clear', 'takedown_pending', 'removed'));

alter table public.podcast_episodes drop constraint if exists podcast_episodes_moderation_state_check;
alter table public.podcast_episodes
  add constraint podcast_episodes_moderation_state_check
  check (moderation_state in ('clear', 'takedown_pending', 'removed'));

create index if not exists songs_moderation_state_hold_idx
  on public.songs (moderation_state)
  where moderation_state <> 'clear';

create index if not exists videos_moderation_state_hold_idx
  on public.videos (moderation_state)
  where moderation_state <> 'clear';

create index if not exists albums_moderation_state_hold_idx
  on public.albums (moderation_state)
  where moderation_state <> 'clear';

create index if not exists podcast_episodes_moderation_state_hold_idx
  on public.podcast_episodes (moderation_state)
  where moderation_state <> 'clear';

alter table public.moderation_reports
  drop constraint if exists moderation_reports_item_type_check;

alter table public.moderation_reports
  add constraint moderation_reports_item_type_check
  check (item_type in (
    'song',
    'video',
    'album',
    'comment',
    'artist',
    'producer',
    'beat',
    'playlist',
    'podcast_episode'
  ));

notify pgrst, 'reload schema';
