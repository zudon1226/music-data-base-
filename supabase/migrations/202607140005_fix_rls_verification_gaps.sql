-- Targeted RLS verification gap fix.
-- 1) Ensure canonical media queue tables exist and are API-visible.
-- 2) Install Storage v2 policies and least-privilege storage.objects grants.
-- 3) Ensure user-media-queues bucket accepts queue JSON payloads.

create table if not exists public.user_media_queue_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_source_id text not null,
  media_type text not null check (media_type in ('song', 'video')),
  position integer not null check (position >= 0),
  title text not null default '',
  artist_name text not null default '',
  artwork_url text null,
  playable_url text not null default '',
  storage_path text null,
  owner_id text null,
  album_id text null,
  duration_seconds double precision null,
  source_created_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_type, media_source_id)
);

create index if not exists user_media_queue_items_user_position_idx
  on public.user_media_queue_items (user_id, position);

create table if not exists public.user_media_queue_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_index integer not null default -1,
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-media-queues', 'user-media-queues', false, 2097152, array['application/json'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  queue_table text;
  policy_row record;
begin
  foreach queue_table in array array['user_media_queue_items', 'user_media_queue_state']
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = queue_table
        and c.relkind in ('r', 'p')
        and pg_get_userbyid(c.relowner) = current_user
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', queue_table);

    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = queue_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_row.policyname,
        queue_table
      );
    end loop;

    execute format('revoke all privileges on table public.%I from anon', queue_table);
    execute format('revoke all privileges on table public.%I from authenticated', queue_table);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      queue_table
    );
    execute format('grant all privileges on table public.%I to service_role', queue_table);
    execute format(
      'create policy platform_admin_full_access on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      queue_table
    );
  end loop;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'user_media_queue_items'
      and pg_get_userbyid(c.relowner) = current_user
  ) then
    execute $policy$
      create policy owners_read on public.user_media_queue_items
      for select to authenticated using (user_id = auth.uid())
    $policy$;
    execute $policy$
      create policy owners_insert on public.user_media_queue_items
      for insert to authenticated with check (user_id = auth.uid())
    $policy$;
    execute $policy$
      create policy owners_update on public.user_media_queue_items
      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())
    $policy$;
    execute $policy$
      create policy owners_delete on public.user_media_queue_items
      for delete to authenticated using (user_id = auth.uid())
    $policy$;
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'user_media_queue_state'
      and pg_get_userbyid(c.relowner) = current_user
  ) then
    execute $policy$
      create policy owners_read on public.user_media_queue_state
      for select to authenticated using (user_id = auth.uid())
    $policy$;
    execute $policy$
      create policy owners_insert on public.user_media_queue_state
      for insert to authenticated with check (user_id = auth.uid())
    $policy$;
    execute $policy$
      create policy owners_update on public.user_media_queue_state
      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())
    $policy$;
    execute $policy$
      create policy owners_delete on public.user_media_queue_state
      for delete to authenticated using (user_id = auth.uid())
    $policy$;
  end if;
end
$$;

notify pgrst, 'reload schema';

-- Storage v2 policies and least-privilege grants (direct postgres path; no SET ROLE required).
do $$
declare
  p record;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  revoke all privileges on table storage.objects from anon;
  revoke all privileges on table storage.objects from authenticated;
  grant select on table storage.objects to anon;
  grant select, insert, update, delete on table storage.objects to authenticated;
  grant all privileges on table storage.objects to service_role;

  for p in
    select *
    from (values
      (
        'app_bucket_select_boundary_v2',
        'create policy app_bucket_select_boundary_v2 on storage.objects as restrictive for select to anon, authenticated using (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') or (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and case when auth.role() = ''authenticated'' then (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin() else false end))'
      ),
      (
        'app_bucket_insert_boundary_v2',
        'create policy app_bucket_insert_boundary_v2 on storage.objects as restrictive for insert to anon, authenticated with check (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())'
      ),
      (
        'app_bucket_update_boundary_v2',
        'create policy app_bucket_update_boundary_v2 on storage.objects as restrictive for update to authenticated using (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()) with check (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())'
      ),
      (
        'app_bucket_delete_boundary_v2',
        'create policy app_bucket_delete_boundary_v2 on storage.objects as restrictive for delete to authenticated using (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())'
      ),
      (
        'app_public_bucket_read_v2',
        'create policy app_public_bucket_read_v2 on storage.objects for select to anon, authenticated using (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats''))'
      ),
      (
        'app_public_bucket_owner_insert_v2',
        'create policy app_public_bucket_owner_insert_v2 on storage.objects for insert to authenticated with check (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text)'
      ),
      (
        'app_public_bucket_owner_update_v2',
        'create policy app_public_bucket_owner_update_v2 on storage.objects for update to authenticated using (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text)'
      ),
      (
        'app_public_bucket_owner_delete_v2',
        'create policy app_public_bucket_owner_delete_v2 on storage.objects for delete to authenticated using (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text)'
      ),
      (
        'app_private_bucket_owner_read_v2',
        'create policy app_private_bucket_owner_read_v2 on storage.objects for select to authenticated using (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text)'
      ),
      (
        'app_private_bucket_owner_insert_v2',
        'create policy app_private_bucket_owner_insert_v2 on storage.objects for insert to authenticated with check (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text)'
      ),
      (
        'app_private_bucket_owner_update_v2',
        'create policy app_private_bucket_owner_update_v2 on storage.objects for update to authenticated using (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text)'
      ),
      (
        'app_private_bucket_owner_delete_v2',
        'create policy app_private_bucket_owner_delete_v2 on storage.objects for delete to authenticated using (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text)'
      ),
      (
        'app_bucket_platform_admin_full_access_v2',
        'create policy app_bucket_platform_admin_full_access_v2 on storage.objects for all to authenticated using (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') and public.is_platform_admin()) with check (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') and public.is_platform_admin())'
      )
    ) as policies(policy_name, create_statement)
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = p.policy_name
    ) then
      execute p.create_statement;
    end if;
  end loop;

  drop policy if exists app_bucket_insert_boundary_v2 on storage.objects;
  execute $policy$
    create policy app_bucket_insert_boundary_v2 on storage.objects
    as restrictive for insert to anon, authenticated
    with check (
      bucket_id not in (
        'songs', 'videos', 'covers', 'albums', 'producer-beats',
        'licenses', 'downloads', 'user-media-queues'
      )
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_admin()
    )
  $policy$;
end
$$;

notify pgrst, 'reload schema';
