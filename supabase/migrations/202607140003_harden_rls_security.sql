-- Security baseline for every current and future-discovered public base table.
-- Intent: anon is denied by default; authenticated users only receive rows allowed
-- by the explicit policies below; platform admins and service_role retain full access.

do $$
declare
  table_row record;
  policy_row record;
begin
  for table_row in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', table_row.table_name);

    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = table_row.table_name
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_row.policyname,
        table_row.table_name
      );
    end loop;

    execute format('revoke all privileges on table public.%I from anon', table_row.table_name);
    execute format('revoke all privileges on table public.%I from authenticated', table_row.table_name);
    -- authenticated needs table privileges for admin access; RLS remains the row/operation authority.
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_row.table_name);
    execute format('grant all privileges on table public.%I to service_role', table_row.table_name);

    -- This is the only policy retained for unknown/legacy tables and for sensitive
    -- control tables (user_roles, audit/checklist/storage logs, and
    -- auth_music_data_migration_log). Non-admin clients therefore default-deny.
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      'platform_admin_full_access',
      table_row.table_name
    );
  end loop;
end
$$;

-- Sequences are never exposed to anon. Authenticated sequence access is needed for
-- permitted inserts; table RLS still decides whether the associated row may be created.
do $$
declare
  sequence_row record;
begin
  for sequence_row in
    select c.relname as sequence_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
  loop
    execute format('revoke all privileges on sequence public.%I from anon', sequence_row.sequence_name);
    execute format('grant usage, select on sequence public.%I to authenticated', sequence_row.sequence_name);
    execute format('grant all privileges on sequence public.%I to service_role', sequence_row.sequence_name);
  end loop;
end
$$;

-- Install a policy only when its table exists. This keeps the migration safe for
-- partially deployed environments while unknown/legacy tables remain admin-only.
do $$
declare
  p record;
  statement text;
begin
  for p in
    select *
    from (values
      -- Intentional public catalog reads. Public users never receive mutation policies.
      ('songs', 'public_catalog_read', 'select', 'anon, authenticated', 'true', null),
      ('videos', 'public_catalog_read', 'select', 'anon, authenticated', 'true', null),
      ('albums', 'authenticated_catalog_read', 'select', 'authenticated', 'true', null),
      ('album_items', 'authenticated_catalog_read', 'select', 'authenticated', 'true', null),
      ('album_tracks', 'authenticated_catalog_read', 'select', 'authenticated', 'true', null),
      ('artist_profiles', 'public_catalog_read', 'select', 'anon, authenticated', 'true', null),
      ('producer_profiles', 'public_catalog_read', 'select', 'anon, authenticated', 'true', null),
      ('producer_beats', 'public_catalog_read', 'select', 'anon, authenticated', 'true', null),
      ('content_comments', 'authenticated_comments_read', 'select', 'authenticated', 'true', null),
      ('comment_likes', 'authenticated_comment_likes_read', 'select', 'authenticated', 'true', null),
      ('subscription_plans', 'authenticated_active_plans_read', 'select', 'authenticated', 'active = true', null),
      ('storefront_items', 'authenticated_active_storefront_read', 'select', 'authenticated', 'status = ''active''', null),
      ('marketplace_storefront_settings', 'authenticated_active_storefront_settings_read', 'select', 'authenticated', 'active = true', null),
      ('marketplace_featured_placements', 'authenticated_active_placements_read', 'select', 'authenticated', 'active = true and starts_at <= now() and (ends_at is null or ends_at > now())', null),
      ('marketplace_discount_codes', 'authenticated_active_discount_codes_read', 'select', 'authenticated', 'status = ''active'' and starts_at <= now() and (ends_at is null or ends_at > now())', null),
      ('marketplace_bundles', 'authenticated_active_bundles_read', 'select', 'authenticated', 'status = ''active'' and starts_at <= now() and (ends_at is null or ends_at > now())', null),
      ('marketplace_bundle_items', 'authenticated_active_bundle_items_read', 'select', 'authenticated', 'exists (select 1 from public.marketplace_bundles b where b.id = marketplace_bundle_items.bundle_id and b.status = ''active'' and b.starts_at <= now() and (b.ends_at is null or b.ends_at > now()))', null),

      -- Catalog ownership. Existing insert/update/delete operation scope is preserved.
      ('songs', 'owners_insert', 'insert', 'authenticated', null, 'user_id::text = auth.uid()::text'),
      ('songs', 'owners_update', 'update', 'authenticated', 'user_id::text = auth.uid()::text', 'user_id::text = auth.uid()::text'),
      ('songs', 'owners_delete', 'delete', 'authenticated', 'user_id::text = auth.uid()::text', null),
      ('videos', 'owners_insert', 'insert', 'authenticated', null, 'user_id::text = auth.uid()::text'),
      ('videos', 'owners_update', 'update', 'authenticated', 'user_id::text = auth.uid()::text', 'user_id::text = auth.uid()::text'),
      ('videos', 'owners_delete', 'delete', 'authenticated', 'user_id::text = auth.uid()::text', null),
      ('albums', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('albums', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('albums', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('album_items', 'parent_owners_insert', 'insert', 'authenticated', null, 'exists (select 1 from public.albums a where a.id = album_items.album_id and a.user_id = auth.uid())'),
      ('album_items', 'parent_owners_delete', 'delete', 'authenticated', 'exists (select 1 from public.albums a where a.id = album_items.album_id and a.user_id = auth.uid())', null),
      ('album_tracks', 'parent_owners_insert', 'insert', 'authenticated', null, 'exists (select 1 from public.albums a where a.id = album_tracks.album_id and a.user_id = auth.uid())'),
      ('album_tracks', 'parent_owners_delete', 'delete', 'authenticated', 'exists (select 1 from public.albums a where a.id = album_tracks.album_id and a.user_id = auth.uid())', null),
      ('artist_profiles', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('artist_profiles', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('artist_profiles', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('producer_profiles', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('producer_profiles', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('producer_profiles', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('producer_beats', 'owners_insert', 'insert', 'authenticated', null, 'producer_user_id = auth.uid()'),
      ('producer_beats', 'owners_update', 'update', 'authenticated', 'producer_user_id = auth.uid()', 'producer_user_id = auth.uid()'),
      ('producer_beats', 'owners_delete', 'delete', 'authenticated', 'producer_user_id = auth.uid()', null),

      -- Private account state, reactions, follows, library, comments, and queues.
      ('profiles', 'owners_read', 'select', 'authenticated', 'id = auth.uid() and (user_id is null or user_id = auth.uid())', null),
      ('profiles', 'owners_insert', 'insert', 'authenticated', null, 'id = auth.uid() and (user_id is null or user_id = auth.uid())'),
      ('profiles', 'owners_update', 'update', 'authenticated', 'id = auth.uid() and (user_id is null or user_id = auth.uid())', 'id = auth.uid() and (user_id is null or user_id = auth.uid())'),
      ('song_likes', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('song_likes', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('song_likes', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('video_likes', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('video_likes', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('video_likes', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('artist_follows', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('artist_follows', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('artist_follows', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('library_saves', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('library_saves', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('library_saves', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('user_music_state', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('user_music_state', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('user_music_state', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('user_media_queue_items', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('user_media_queue_items', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('user_media_queue_items', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('user_media_queue_items', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('user_media_queue_state', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('user_media_queue_state', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('user_media_queue_state', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('user_media_queue_state', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('notifications', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('notifications', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('notifications', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('notifications', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('content_comments', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('content_comments', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('content_comments', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('comment_likes', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('comment_likes', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),

      -- Monetization, purchases, licensing, and creator growth.
      ('subscriptions', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('subscriptions', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('transactions', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid() or creator_user_id = auth.uid()', null),
      ('transactions', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid() or creator_user_id = auth.uid()'),
      ('payouts', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('payouts', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('revenue_splits', 'connected_creators_read', 'select', 'authenticated', 'artist_user_id = auth.uid() or producer_user_id = auth.uid() or exists (select 1 from public.producer_profiles pp where pp.id = revenue_splits.producer_id and pp.user_id = auth.uid())', null),
      ('creator_subscribers', 'participants_read', 'select', 'authenticated', 'subscriber_user_id = auth.uid() or creator_user_id = auth.uid()', null),
      ('creator_subscribers', 'subscribers_insert', 'insert', 'authenticated', null, 'subscriber_user_id = auth.uid()'),
      ('earnings_events', 'creators_read', 'select', 'authenticated', 'creator_user_id = auth.uid()', null),
      ('monthly_statements', 'creators_read', 'select', 'authenticated', 'creator_user_id = auth.uid()', null),
      ('storefront_items', 'creators_read_own', 'select', 'authenticated', 'creator_user_id = auth.uid()', null),
      ('storefront_items', 'creators_insert', 'insert', 'authenticated', null, 'creator_user_id = auth.uid()'),
      ('premium_content_access', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('sales_cart_items', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('sales_cart_items', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('sales_cart_items', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('sales_cart_items', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('purchase_history', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('purchase_history', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('download_vault', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('download_vault', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('download_vault', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('license_records', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('license_records', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('license_records', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('license_records', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('creator_growth_snapshots', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('creator_growth_snapshots', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('creator_growth_actions', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('creator_growth_actions', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('creator_growth_actions', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('creator_growth_actions', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),

      -- Marketplace ownership; child rows follow their parent bundle owner.
      ('marketplace_storefront_settings', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('marketplace_storefront_settings', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('marketplace_storefront_settings', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('marketplace_storefront_settings', 'owners_delete', 'delete', 'authenticated', 'user_id = auth.uid()', null),
      ('marketplace_featured_placements', 'owners_read', 'select', 'authenticated', 'creator_user_id = auth.uid()', null),
      ('marketplace_featured_placements', 'owners_insert', 'insert', 'authenticated', null, 'creator_user_id = auth.uid()'),
      ('marketplace_featured_placements', 'owners_update', 'update', 'authenticated', 'creator_user_id = auth.uid()', 'creator_user_id = auth.uid()'),
      ('marketplace_featured_placements', 'owners_delete', 'delete', 'authenticated', 'creator_user_id = auth.uid()', null),
      ('marketplace_discount_codes', 'owners_read', 'select', 'authenticated', 'creator_user_id = auth.uid()', null),
      ('marketplace_discount_codes', 'owners_insert', 'insert', 'authenticated', null, 'creator_user_id = auth.uid()'),
      ('marketplace_discount_codes', 'owners_update', 'update', 'authenticated', 'creator_user_id = auth.uid()', 'creator_user_id = auth.uid()'),
      ('marketplace_discount_codes', 'owners_delete', 'delete', 'authenticated', 'creator_user_id = auth.uid()', null),
      ('marketplace_bundles', 'owners_read', 'select', 'authenticated', 'creator_user_id = auth.uid()', null),
      ('marketplace_bundles', 'owners_insert', 'insert', 'authenticated', null, 'creator_user_id = auth.uid()'),
      ('marketplace_bundles', 'owners_update', 'update', 'authenticated', 'creator_user_id = auth.uid()', 'creator_user_id = auth.uid()'),
      ('marketplace_bundles', 'owners_delete', 'delete', 'authenticated', 'creator_user_id = auth.uid()', null),
      ('marketplace_bundle_items', 'parent_owners_read', 'select', 'authenticated', 'exists (select 1 from public.marketplace_bundles b where b.id = marketplace_bundle_items.bundle_id and b.creator_user_id = auth.uid())', null),
      ('marketplace_bundle_items', 'parent_owners_insert', 'insert', 'authenticated', null, 'exists (select 1 from public.marketplace_bundles b where b.id = marketplace_bundle_items.bundle_id and b.creator_user_id = auth.uid())'),
      ('marketplace_bundle_items', 'parent_owners_update', 'update', 'authenticated', 'exists (select 1 from public.marketplace_bundles b where b.id = marketplace_bundle_items.bundle_id and b.creator_user_id = auth.uid())', 'exists (select 1 from public.marketplace_bundles b where b.id = marketplace_bundle_items.bundle_id and b.creator_user_id = auth.uid())'),
      ('marketplace_bundle_items', 'parent_owners_delete', 'delete', 'authenticated', 'exists (select 1 from public.marketplace_bundles b where b.id = marketplace_bundle_items.bundle_id and b.creator_user_id = auth.uid())', null),
      ('marketplace_preorders', 'participants_read', 'select', 'authenticated', 'buyer_user_id = auth.uid() or creator_user_id = auth.uid()', null),
      ('marketplace_preorders', 'buyers_insert', 'insert', 'authenticated', null, 'buyer_user_id = auth.uid()'),

      -- Trust, support, and operational rows. Review mutations remain admin-only.
      ('moderation_reports', 'reporters_insert', 'insert', 'authenticated', null, 'reporter_id = auth.uid()'),
      ('moderation_reports', 'reporters_read', 'select', 'authenticated', 'reporter_id = auth.uid()', null),
      ('copyright_claims', 'claimants_insert', 'insert', 'authenticated', null, 'claimant_id = auth.uid()'),
      ('copyright_claims', 'claimants_read', 'select', 'authenticated', 'claimant_id = auth.uid()', null),
      ('blocked_users', 'owners_read', 'select', 'authenticated', 'blocker_id = auth.uid()', null),
      ('blocked_users', 'owners_insert', 'insert', 'authenticated', null, 'blocker_id = auth.uid()'),
      ('blocked_users', 'owners_update', 'update', 'authenticated', 'blocker_id = auth.uid()', 'blocker_id = auth.uid()'),
      ('blocked_users', 'owners_delete', 'delete', 'authenticated', 'blocker_id = auth.uid()', null),
      ('verification_review_requests', 'requesters_insert', 'insert', 'authenticated', null, 'requester_id = auth.uid()'),
      ('verification_review_requests', 'requesters_read', 'select', 'authenticated', 'requester_id = auth.uid()', null),
      ('support_tickets', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('support_tickets', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('support_tickets', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('support_ticket_messages', 'parent_owners_insert', 'insert', 'authenticated', null, 'exists (select 1 from public.support_tickets t where t.id = support_ticket_messages.ticket_id and t.user_id = auth.uid())'),
      ('support_ticket_messages', 'parent_owners_read', 'select', 'authenticated', 'exists (select 1 from public.support_tickets t where t.id = support_ticket_messages.ticket_id and t.user_id = auth.uid())', null),
      ('platform_incidents', 'authenticated_read', 'select', 'authenticated', 'true', null),
      ('release_notes', 'authenticated_read', 'select', 'authenticated', 'true', null),
      ('user_feedback', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('user_feedback', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('backup_exports', 'owners_read', 'select', 'authenticated', 'requested_by = auth.uid()', null),
      ('backup_exports', 'owners_insert', 'insert', 'authenticated', null, 'requested_by = auth.uid()'),
      ('platform_errors', 'owners_read', 'select', 'authenticated', 'user_id = auth.uid()', null),
      ('platform_errors', 'owners_insert', 'insert', 'authenticated', null, 'user_id = auth.uid()'),
      ('platform_errors', 'owners_update', 'update', 'authenticated', 'user_id = auth.uid()', 'user_id = auth.uid()'),
      ('profile_verifications', 'authenticated_read', 'select', 'authenticated', 'true', null)
    ) as policies(table_name, policy_name, command_name, role_list, using_expr, check_expr)
  loop
    if to_regclass(format('public.%I', p.table_name)) is null then
      continue;
    end if;

    statement := format(
      'create policy %I on public.%I for %s to %s',
      p.policy_name,
      p.table_name,
      p.command_name,
      p.role_list
    );
    if p.using_expr is not null then
      statement := statement || format(' using (%s)', p.using_expr);
    end if;
    if p.check_expr is not null then
      statement := statement || format(' with check (%s)', p.check_expr);
    end if;
    execute statement;
  end loop;
end
$$;

-- Optional live playlist tables were not created by the checked-in migration history.
-- Add policies only when the expected ownership columns are present; never create them.
do $$
begin
  if to_regclass('public.playlists') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'playlists' and column_name = 'user_id'
     )
  then
    execute 'create policy owners_read on public.playlists for select to authenticated using (user_id = auth.uid())';
    execute 'create policy owners_insert on public.playlists for insert to authenticated with check (user_id = auth.uid())';
    execute 'create policy owners_update on public.playlists for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
    execute 'create policy owners_delete on public.playlists for delete to authenticated using (user_id = auth.uid())';
  end if;

  if to_regclass('public.playlist_items') is not null
     and to_regclass('public.playlists') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'playlist_items' and column_name = 'playlist_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'playlists' and column_name = 'user_id'
     )
  then
    execute 'create policy parent_owners_read on public.playlist_items for select to authenticated using (exists (select 1 from public.playlists p where p.id = playlist_items.playlist_id and p.user_id = auth.uid()))';
    execute 'create policy parent_owners_insert on public.playlist_items for insert to authenticated with check (exists (select 1 from public.playlists p where p.id = playlist_items.playlist_id and p.user_id = auth.uid()))';
    execute 'create policy parent_owners_delete on public.playlist_items for delete to authenticated using (exists (select 1 from public.playlists p where p.id = playlist_items.playlist_id and p.user_id = auth.uid()))';
  end if;
end
$$;

-- Only the intended catalog tables receive anon SELECT at the SQL privilege layer.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'songs', 'videos', 'artist_profiles', 'producer_profiles', 'producer_beats'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('grant select on table public.%I to anon', table_name);
    end if;
  end loop;
end
$$;

-- Storage intent: public playback/artwork reads; authenticated writes only in the
-- caller's first path segment; private buckets are readable/writable only by owner.
do $$
declare
  p record;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'alter table storage.objects enable row level security';
  execute 'revoke all privileges on table storage.objects from anon';
  execute 'revoke all privileges on table storage.objects from authenticated';
  execute 'grant select on table storage.objects to anon';
  execute 'grant select, insert, update, delete on table storage.objects to authenticated';
  execute 'grant all privileges on table storage.objects to service_role';

  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = any (array[
        'app_public_bucket_read',
        'app_public_bucket_owner_insert',
        'app_public_bucket_owner_update',
        'app_public_bucket_owner_delete',
        'app_private_bucket_owner_read',
        'app_private_bucket_owner_insert',
        'app_private_bucket_owner_update',
        'app_private_bucket_owner_delete',
        'app_bucket_platform_admin_full_access',
        'app_bucket_select_boundary',
        'app_bucket_insert_boundary',
        'app_bucket_update_boundary',
        'app_bucket_delete_boundary',
        'Public read launch artwork buckets',
        'Users can upload launch artwork to own folder',
        'Users can update launch artwork in own folder',
        'Users can delete launch artwork in own folder',
        'Users can read private launch files in own folder',
        'Users can upload private launch files to own folder',
        'Users can update private launch files in own folder',
        'Users can delete private launch files in own folder',
        'Anyone can read songs',
        'Public read songs',
        'Users can upload songs to their folder',
        'Authenticated users can upload songs',
        'Users can update their songs',
        'Users can delete their songs',
        'Anyone can read videos',
        'Public read videos',
        'Allow public read videos',
        'Allow public read videos l1ivt5k_0',
        'Users can read videos from their own folder',
        'Users can read videos from their own folder l1ivt5k_0',
        'Authenticated users can upload videos',
        'Authenticated users can upload videos t9jwe_0',
        'Authenticated users can upload videos l1ivt5k_0',
        'Allow logged in uploads to videos',
        'Allow logged in uploads to videos l1ivt5k_0',
        'TEMP allow all uploads videos',
        'TEMP allow all uploads videos l1ivt5k_0',
        'Authenticated users can manage videos',
        'Users can update their videos',
        'Users can delete their videos',
        'Authenticated users can insert own videos',
        'Authenticated users can update own videos',
        'Authenticated users can delete own videos',
        'Music Data Base public read videos',
        'Music Data Base authenticated video uploads',
        'Music Data Base authenticated video updates',
        'Music Data Base authenticated video deletes',
        'Music Data Base authenticated videos bucket uploads',
        'Music Data Base authenticated own video updates',
        'Music Data Base authenticated own video deletes'
      ])
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;

  -- Restrictive boundaries are ANDed with every permissive policy. They prevent
  -- retained policies for unrelated buckets from bypassing app-bucket ownership.
  execute $policy$
    create policy app_bucket_select_boundary
    on storage.objects as restrictive
    for select to anon, authenticated
    using (
      bucket_id not in (
        'songs', 'videos', 'covers', 'albums', 'producer-beats',
        'licenses', 'downloads', 'user-media-queues'
      )
      or bucket_id in ('songs', 'videos', 'covers', 'albums', 'producer-beats')
      or (
        bucket_id in ('licenses', 'downloads', 'user-media-queues')
        and case
          when auth.role() = 'authenticated'
          then (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()
          else false
        end
      )
    )
  $policy$;
  execute $policy$
    create policy app_bucket_insert_boundary
    on storage.objects as restrictive
    for insert to authenticated
    with check (
      bucket_id not in (
        'songs', 'videos', 'covers', 'albums', 'producer-beats',
        'licenses', 'downloads', 'user-media-queues'
      )
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_admin()
    )
  $policy$;
  execute $policy$
    create policy app_bucket_update_boundary
    on storage.objects as restrictive
    for update to authenticated
    using (
      bucket_id not in (
        'songs', 'videos', 'covers', 'albums', 'producer-beats',
        'licenses', 'downloads', 'user-media-queues'
      )
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_admin()
    )
    with check (
      bucket_id not in (
        'songs', 'videos', 'covers', 'albums', 'producer-beats',
        'licenses', 'downloads', 'user-media-queues'
      )
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_admin()
    )
  $policy$;
  execute $policy$
    create policy app_bucket_delete_boundary
    on storage.objects as restrictive
    for delete to authenticated
    using (
      bucket_id not in (
        'songs', 'videos', 'covers', 'albums', 'producer-beats',
        'licenses', 'downloads', 'user-media-queues'
      )
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_admin()
    )
  $policy$;

  execute $policy$
    create policy app_public_bucket_read
    on storage.objects for select to anon, authenticated
    using (bucket_id in ('songs', 'videos', 'covers', 'albums', 'producer-beats'))
  $policy$;
  execute $policy$
    create policy app_public_bucket_owner_insert
    on storage.objects for insert to authenticated
    with check (
      bucket_id in ('songs', 'videos', 'covers', 'albums', 'producer-beats')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;
  execute $policy$
    create policy app_public_bucket_owner_update
    on storage.objects for update to authenticated
    using (
      bucket_id in ('songs', 'videos', 'covers', 'albums', 'producer-beats')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id in ('songs', 'videos', 'covers', 'albums', 'producer-beats')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;
  execute $policy$
    create policy app_public_bucket_owner_delete
    on storage.objects for delete to authenticated
    using (
      bucket_id in ('songs', 'videos', 'covers', 'albums', 'producer-beats')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;
  execute $policy$
    create policy app_private_bucket_owner_read
    on storage.objects for select to authenticated
    using (
      bucket_id in ('licenses', 'downloads', 'user-media-queues')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;
  execute $policy$
    create policy app_private_bucket_owner_insert
    on storage.objects for insert to authenticated
    with check (
      bucket_id in ('licenses', 'downloads', 'user-media-queues')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;
  execute $policy$
    create policy app_private_bucket_owner_update
    on storage.objects for update to authenticated
    using (
      bucket_id in ('licenses', 'downloads', 'user-media-queues')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id in ('licenses', 'downloads', 'user-media-queues')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;
  execute $policy$
    create policy app_private_bucket_owner_delete
    on storage.objects for delete to authenticated
    using (
      bucket_id in ('licenses', 'downloads', 'user-media-queues')
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  $policy$;
  execute $policy$
    create policy app_bucket_platform_admin_full_access
    on storage.objects for all to authenticated
    using (
      bucket_id in (
        'songs', 'videos', 'covers', 'albums', 'producer-beats',
        'licenses', 'downloads', 'user-media-queues'
      )
      and public.is_platform_admin()
    )
    with check (
      bucket_id in (
        'songs', 'videos', 'covers', 'albums', 'producer-beats',
        'licenses', 'downloads', 'user-media-queues'
      )
      and public.is_platform_admin()
    )
  $policy$;
end
$$;

-- The admin predicate must not become an anon privilege-escalation oracle.
revoke all on function public.is_platform_admin(uuid) from public;
revoke all on function public.is_platform_admin(uuid) from anon;
grant execute on function public.is_platform_admin(uuid) to authenticated;
grant execute on function public.is_platform_admin(uuid) to service_role;

-- Self-audit: abort atomically if any public base/partitioned table escaped RLS.
do $$
declare
  unsecured_tables text;
begin
  select string_agg(format('%I', c.relname), ', ' order by c.relname)
  into unsecured_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if unsecured_tables is not null then
    raise exception 'RLS security migration failed; public tables without RLS: %', unsecured_tables;
  end if;
end
$$;
