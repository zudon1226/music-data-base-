-- Podcast Phase 2D: allow podcast episode rows in the existing notifications table.
-- Additive only. Reuses notifications_user_event_key_uidx for durable
-- (recipient, event_key) uniqueness. Canonical event_key:
--   podcast_episode_published:{episodeId}
-- Do not add a second unique index.

alter table public.notifications drop constraint if exists notifications_item_type_check;
alter table public.notifications
  add constraint notifications_item_type_check
  check (
    item_type is null
    or item_type in (
      'song', 'video', 'album', 'artist', 'producer', 'playlist',
      'ringtone', 'ringtone_review', 'beat', 'system',
      'podcast_episode'
    )
  );
