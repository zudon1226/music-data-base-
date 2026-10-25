-- PRODUCTION: Review + explicit approval before apply.
-- Platform admins retain manage access on songs/videos buckets but cannot SELECT
-- held/removed bytes through Storage RLS. Use /api/moderation/media-preview (service role) for review.

drop policy if exists app_bucket_platform_admin_full_access on storage.objects;
drop policy if exists app_bucket_platform_admin_full_access_v2 on storage.objects;
drop policy if exists app_platform_admin_songs_videos_manage_v2 on storage.objects;
drop policy if exists app_platform_admin_songs_videos_update_v2 on storage.objects;
drop policy if exists app_platform_admin_songs_videos_delete_v2 on storage.objects;

create policy app_bucket_platform_admin_full_access_v2 on storage.objects
for all to authenticated
using (
  bucket_id in (
    'covers', 'albums', 'producer-beats', 'licenses', 'downloads', 'user-media-queues',
    'ringtone-source', 'ringtone-previews', 'ringtone-downloads', 'podcast-audio', 'podcast-video'
  )
  and is_platform_admin()
)
with check (
  bucket_id in (
    'covers', 'albums', 'producer-beats', 'licenses', 'downloads', 'user-media-queues',
    'ringtone-source', 'ringtone-previews', 'ringtone-downloads', 'podcast-audio', 'podcast-video'
  )
  and is_platform_admin()
);

create policy app_platform_admin_songs_videos_manage_v2 on storage.objects
for insert to authenticated
with check (
  bucket_id in ('songs', 'videos')
  and is_platform_admin()
);

create policy app_platform_admin_songs_videos_update_v2 on storage.objects
for update to authenticated
using (
  bucket_id in ('songs', 'videos')
  and is_platform_admin()
)
with check (
  bucket_id in ('songs', 'videos')
  and is_platform_admin()
);

create policy app_platform_admin_songs_videos_delete_v2 on storage.objects
for delete to authenticated
using (
  bucket_id in ('songs', 'videos')
  and is_platform_admin()
);

notify pgrst, 'reload schema';
