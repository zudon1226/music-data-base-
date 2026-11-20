-- Mixtape Phase 1 private storage bucket and storage.objects v2 boundary extension.
-- Object layout: {user_id}/{mixtape_id}/cover.ext | {user_id}/{mixtape_id}/tracks/{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'mixtapes',
    'mixtapes',
    false,
    104857600,
    array[
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/m4a',
      'audio/x-m4a',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Extend v2 bucket boundaries (copy of 202609131001_align_launch_rls_grant_catalog.sql with `mixtapes`
-- added only to private/boundary lists — not to app_public_bucket_* — so existing bucket access is unchanged).
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  drop policy if exists app_bucket_select_boundary_v2 on storage.objects;
  create policy app_bucket_select_boundary_v2 on storage.objects
  as restrictive for select to anon, authenticated
  using (
    bucket_id not in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    or bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'
    )
    or (
      bucket_id in (
        'licenses', 'downloads', 'user-media-queues',
        'ringtone-source', 'ringtone-downloads',
        'podcast-audio', 'podcast-video', 'mixtapes'
      )
      and case
        when auth.role() = 'authenticated' then
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_platform_admin()
        else false
      end
    )
  );

  drop policy if exists app_bucket_insert_boundary_v2 on storage.objects;
  create policy app_bucket_insert_boundary_v2 on storage.objects
  as restrictive for insert to anon, authenticated
  with check (
    bucket_id not in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    or (storage.foldername(name))[1] = auth.uid()::text
    or public.is_platform_admin()
  );

  drop policy if exists app_bucket_update_boundary_v2 on storage.objects;
  create policy app_bucket_update_boundary_v2 on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id not in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    or (storage.foldername(name))[1] = auth.uid()::text
    or public.is_platform_admin()
  )
  with check (
    bucket_id not in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    or (storage.foldername(name))[1] = auth.uid()::text
    or public.is_platform_admin()
  );

  drop policy if exists app_bucket_delete_boundary_v2 on storage.objects;
  create policy app_bucket_delete_boundary_v2 on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id not in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    or (storage.foldername(name))[1] = auth.uid()::text
    or public.is_platform_admin()
  );

  drop policy if exists app_public_bucket_read_v2 on storage.objects;
  create policy app_public_bucket_read_v2 on storage.objects
  for select to anon, authenticated
  using (
    bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'
    )
  );

  drop policy if exists app_public_bucket_owner_insert_v2 on storage.objects;
  create policy app_public_bucket_owner_insert_v2 on storage.objects
  for insert to authenticated
  with check (
    bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_public_bucket_owner_update_v2 on storage.objects;
  create policy app_public_bucket_owner_update_v2 on storage.objects
  for update to authenticated
  using (
    bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_public_bucket_owner_delete_v2 on storage.objects;
  create policy app_public_bucket_owner_delete_v2 on storage.objects
  for delete to authenticated
  using (
    bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_private_bucket_owner_read_v2 on storage.objects;
  create policy app_private_bucket_owner_read_v2 on storage.objects
  for select to authenticated
  using (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_private_bucket_owner_insert_v2 on storage.objects;
  create policy app_private_bucket_owner_insert_v2 on storage.objects
  for insert to authenticated
  with check (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_private_bucket_owner_update_v2 on storage.objects;
  create policy app_private_bucket_owner_update_v2 on storage.objects
  for update to authenticated
  using (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_private_bucket_owner_delete_v2 on storage.objects;
  create policy app_private_bucket_owner_delete_v2 on storage.objects
  for delete to authenticated
  using (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_bucket_platform_admin_full_access_v2 on storage.objects;
  create policy app_bucket_platform_admin_full_access_v2 on storage.objects
  for all to authenticated
  using (
    bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    and public.is_platform_admin()
  )
  with check (
    bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video', 'mixtapes'
    )
    and public.is_platform_admin()
  );
end
$$;

notify pgrst, 'reload schema';