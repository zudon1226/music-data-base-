-- Launch RLS/grant catalog alignment (legal_acceptances + storage v2 podcast boundaries).
-- Additive hardening only; does not weaken existing owner or sponsor public-read policies.

-- ---------------------------------------------------------------------------
-- legal_acceptances: revoke unintended anon/default grants; admin audit path
-- ---------------------------------------------------------------------------
revoke all privileges on table public.legal_acceptances from anon;
revoke truncate, references, trigger on table public.legal_acceptances from authenticated;
grant select, insert on table public.legal_acceptances to authenticated;
grant all privileges on table public.legal_acceptances to service_role;

drop policy if exists platform_admin_full_access on public.legal_acceptances;
create policy platform_admin_full_access
  on public.legal_acceptances
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Sponsor / platform revenue: catalog dangerous-grant cleanup (RLS unchanged)
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'platform_revenue_events',
    'sponsor_applications',
    'sponsor_assets',
    'sponsor_packages'
  ]
  loop
    if to_regclass(format('public.%I', tbl)) is not null then
      execute format(
        'revoke truncate, references, trigger on table public.%I from authenticated',
        tbl
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- storage.objects v2: restore podcast-audio / podcast-video boundary lists
-- (matches 202608200002_podcast_storage_buckets.sql reviewed definitions)
-- ---------------------------------------------------------------------------
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
      'podcast-audio', 'podcast-video'
    )
    or bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'
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

  drop policy if exists app_bucket_insert_boundary_v2 on storage.objects;
  create policy app_bucket_insert_boundary_v2 on storage.objects
  as restrictive for insert to anon, authenticated
  with check (
    bucket_id not in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video'
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
      'podcast-audio', 'podcast-video'
    )
    or (storage.foldername(name))[1] = auth.uid()::text
    or public.is_platform_admin()
  )
  with check (
    bucket_id not in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video'
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
      'podcast-audio', 'podcast-video'
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
      'podcast-audio', 'podcast-video'
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
      'podcast-audio', 'podcast-video'
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
      'podcast-audio', 'podcast-video'
    )
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in (
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-downloads',
      'podcast-audio', 'podcast-video'
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
      'podcast-audio', 'podcast-video'
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
      'podcast-audio', 'podcast-video'
    )
    and public.is_platform_admin()
  )
  with check (
    bucket_id in (
      'songs', 'videos', 'covers', 'albums', 'producer-beats',
      'licenses', 'downloads', 'user-media-queues',
      'ringtone-source', 'ringtone-previews', 'ringtone-downloads',
      'podcast-audio', 'podcast-video'
    )
    and public.is_platform_admin()
  );
end
$$;

notify pgrst, 'reload schema';
