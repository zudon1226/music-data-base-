-- PRODUCTION: Review + explicit approval before apply.
-- Closes direct public Storage URL bypass for moderated songs/videos.
-- Requires app to serve bytes via guarded routes (/api/audio, /api/video-playback) and owner signed URLs.

-- 1) Ensure launch media buckets exist, then make them private (public URLs must not bypass moderation).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('songs', 'songs', false, 104857600, null),
  ('videos', 'videos', false, 2147483648, null)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

update storage.buckets
set public = false
where name in ('songs', 'videos');

-- 2) Helper: Storage SELECT allowed only for catalog-linked objects in clear moderation state.
-- Applies to anon and authenticated (owners/admins must use guarded app routes for held media).
create or replace function public.storage_catalog_object_may_be_read(
  p_bucket text,
  p_object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clean_name text := trim(both '/' from coalesce(p_object_name, ''));
  total_count integer := 0;
  clear_count integer := 0;
begin
  if clean_name = '' then
    return false;
  end if;

  if p_bucket = 'songs' then
    select count(*)::integer,
           count(*) filter (where s.moderation_state = 'clear')::integer
      into total_count, clear_count
    from public.songs s
    where trim(both '/' from coalesce(s.storage_path, '')) = clean_name;
  elsif p_bucket = 'videos' then
    select count(*)::integer,
           count(*) filter (where v.moderation_state = 'clear')::integer
      into total_count, clear_count
    from public.videos v
    where trim(both '/' from coalesce(v.storage_path, '')) = clean_name;
  else
    return false;
  end if;

  -- Exactly one catalog row, and that row must be clear.
  -- A held, removed, null, empty, or invalid row on the same path denies the object.
  return total_count = 1 and clear_count = 1;
end;
$$;

drop function if exists public.storage_catalog_object_is_anon_readable(text, text);

revoke all on function public.storage_catalog_object_may_be_read(text, text) from public;
grant execute on function public.storage_catalog_object_may_be_read(text, text) to anon, authenticated, service_role;

-- 3) Retire legacy blanket public-read policies (names vary by project history).
drop policy if exists "Allow public read songs" on storage.objects;
drop policy if exists "Allow public video reads" on storage.objects;
drop policy if exists "Allow public read vides 1livt5k_0" on storage.objects;
drop policy if exists "Public read songs" on storage.objects;
drop policy if exists "Users can read songs from their own folder" on storage.objects;
drop policy if exists "Users can read videos from their own folder 1livt5k_0" on storage.objects;
drop policy if exists app_public_bucket_read on storage.objects;
drop policy if exists app_bucket_select_boundary on storage.objects;
-- Names listed on storage.objects in 202607140003_harden_rls_security.sql.
drop policy if exists "Anyone can read songs" on storage.objects;
drop policy if exists "Anyone can read videos" on storage.objects;
drop policy if exists "Public read videos" on storage.objects;
drop policy if exists "Allow public read videos" on storage.objects;
drop policy if exists "Allow public read videos l1ivt5k_0" on storage.objects;
drop policy if exists "Users can read videos from their own folder" on storage.objects;
drop policy if exists "Users can read videos from their own folder l1ivt5k_0" on storage.objects;
drop policy if exists "Music Data Base public read videos" on storage.objects;
drop policy if exists "Authenticated users can manage videos" on storage.objects;
-- v1 admin ALL still included songs/videos on the isolated local database.
drop policy if exists app_bucket_platform_admin_full_access on storage.objects;

-- 4) Replace blanket anon/authenticated public-bucket read for songs/videos.
drop policy if exists app_public_bucket_read_v2 on storage.objects;

create policy app_public_bucket_read_v2 on storage.objects
for select to anon, authenticated
using (
  bucket_id in ('covers', 'albums', 'producer-beats', 'ringtone-previews')
  or (
    bucket_id in ('songs', 'videos')
    and public.storage_catalog_object_may_be_read(bucket_id, name)
  )
);

-- 5) Restrictive SELECT boundary must not bypass moderation for songs/videos.
drop policy if exists app_bucket_select_boundary_v2 on storage.objects;

create policy app_bucket_select_boundary_v2 on storage.objects
as restrictive for select to anon, authenticated
using (
  bucket_id not in (
    'songs', 'videos', 'covers', 'albums', 'producer-beats',
    'licenses', 'downloads', 'user-media-queues',
    'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
    'podcast-audio', 'podcast-video'
  )
  or bucket_id in ('covers', 'albums', 'producer-beats', 'ringtone-previews')
  or (
    bucket_id in ('songs', 'videos')
    and public.storage_catalog_object_may_be_read(bucket_id, name)
  )
  or (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads',
      'podcast-audio', 'podcast-video'
    )
    and case
      when auth.role() = 'authenticated' then
        (storage.foldername(name))[1] = auth.uid()::text
        or public.is_platform_admin()
      else false
    end
  )
);

notify pgrst, 'reload schema';
