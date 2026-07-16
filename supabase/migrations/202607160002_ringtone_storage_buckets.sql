-- Ringtone Platform Phase 1 storage buckets and boundary-policy refresh.
-- Paths must begin with auth.uid() for owner-scoped access.
-- Protected download files never grant anon/public select.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'ringtone-source',
    'ringtone-source',
    false,
    52428800,
    array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a']
  ),
  (
    'ringtone-previews',
    'ringtone-previews',
    true,
    20971520,
    array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a']
  ),
  (
    'ringtone-downloads',
    'ringtone-downloads',
    false,
    20971520,
    array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/m4a']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  -- Recreate v2 boundaries including ringtone buckets.
  -- postgres can create/replace these policies without SET ROLE to
  -- supabase_storage_admin; do not skip on ownership membership checks.
  drop policy if exists app_bucket_select_boundary_v2 on storage.objects;
  create policy app_bucket_select_boundary_v2 on storage.objects
  as restrictive for select to anon, authenticated
  using (
    bucket_id not in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads'
    )
    or bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'
    )
    or (
      bucket_id in (
        'licenses', 'downloads', 'user-media-queues',
        'ringtone-source', 'ringtone-downloads'
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
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads'
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
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads'
    )
    or (storage.foldername(name))[1] = auth.uid()::text
    or public.is_platform_admin()
  )
  with check (
    bucket_id not in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads'
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
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads'
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
      'ringtone-source', 'ringtone-downloads'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_private_bucket_owner_insert_v2 on storage.objects;
  create policy app_private_bucket_owner_insert_v2 on storage.objects
  for insert to authenticated
  with check (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_private_bucket_owner_update_v2 on storage.objects;
  create policy app_private_bucket_owner_update_v2 on storage.objects
  for update to authenticated
  using (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  drop policy if exists app_private_bucket_owner_delete_v2 on storage.objects;
  create policy app_private_bucket_owner_delete_v2 on storage.objects
  for delete to authenticated
  using (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads'
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
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads'
    )
    and public.is_platform_admin()
  )
  with check (
    bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads'
    )
    and public.is_platform_admin()
  );
end
$$;

-- Keep is_platform_admin executable for authenticated/service_role only (hardened).
revoke execute on function public.is_platform_admin(uuid) from anon;
grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
