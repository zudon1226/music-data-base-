-- Owner-safe replacement for 202607140003_harden_rls_security.sql.
-- Supabase-managed auth and storage tables are inventory-only. Public changes are
-- limited to BASE/PARTITIONED tables owned by the role running this migration.

drop table if exists pg_temp.rls_migration_preflight;
create temp table rls_migration_preflight (
  schema_name text not null,
  table_name text not null,
  current_owner text not null,
  rls_enabled boolean not null,
  migration_action text not null check (migration_action in ('MODIFY', 'SKIP')),
  exact_reason text not null
);

insert into rls_migration_preflight (
  schema_name,
  table_name,
  current_owner,
  rls_enabled,
  migration_action,
  exact_reason
)
select
  n.nspname,
  c.relname,
  pg_get_userbyid(c.relowner),
  c.relrowsecurity,
  case
    when n.nspname = 'public' and pg_get_userbyid(c.relowner) = current_user then 'MODIFY'
    else 'SKIP'
  end,
  case
    when n.nspname = 'public' and pg_get_userbyid(c.relowner) = current_user
      then 'current_user owns this public table; enable RLS and reset its policies and table grants'
    when n.nspname = 'public'
      then 'public table is not owned by current_user; skip all ALTER, policy, and grant operations'
    when n.nspname = 'auth'
      then 'Supabase-managed auth table; skip all migration operations'
    else
      'Supabase-managed storage table; skip all ALTER/ENABLE/FORCE RLS, ownership, GRANT/REVOKE, and DROP POLICY operations'
  end
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage', 'auth')
  and c.relkind in ('r', 'p');

-- Record whether the documented CREATE POLICY-only Storage path can run.
do $$
declare
  objects_owner text;
  migration_user text := current_user;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  select pg_get_userbyid(c.relowner)
  into objects_owner
  from pg_class c
  where c.oid = 'storage.objects'::regclass;

  if pg_has_role(migration_user, objects_owner, 'SET') then
    update rls_migration_preflight
    set exact_reason =
      format(
        'Supabase-managed storage.objects; skip all ALTER/ENABLE/FORCE RLS, ownership, GRANT/REVOKE, and DROP POLICY operations; guarded CREATE POLICY-only v2 changes run as owner %s',
        objects_owner
      )
    where schema_name = 'storage' and table_name = 'objects';
  else
    update rls_migration_preflight
    set exact_reason =
      format(
        'Supabase-managed storage.objects; current_user lacks SET authority for owner role %s; create the v2 policies manually in the Storage Policies UI as the table owner; no ALTER/ENABLE/FORCE RLS, ownership, GRANT/REVOKE, or DROP POLICY operations will be attempted',
        objects_owner
      )
    where schema_name = 'storage' and table_name = 'objects';
  end if;
end
$$;

-- Reset only current_user-owned public tables. Unknown tables intentionally retain
-- only platform_admin_full_access, making authenticated access admin-only.
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
      and pg_get_userbyid(c.relowner) = current_user
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
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      table_row.table_name
    );
    execute format('grant all privileges on table public.%I to service_role', table_row.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      'platform_admin_full_access',
      table_row.table_name
    );
  end loop;
end
$$;

-- Preserve the failed migration's sequence privilege design, but only for owned
-- public sequences.
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
      and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('revoke all privileges on sequence public.%I from anon', sequence_row.sequence_name);
    execute format('revoke all privileges on sequence public.%I from authenticated', sequence_row.sequence_name);
    execute format('grant usage, select on sequence public.%I to authenticated', sequence_row.sequence_name);
    execute format('grant all privileges on sequence public.%I to service_role', sequence_row.sequence_name);
  end loop;
end
$$;

-- Exact reviewed least-privilege policy design from the failed migration.
do $$
declare
  p record;
  statement text;
begin
  for p in
    select *
    from (values
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
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = p.table_name
        and c.relkind in ('r', 'p')
        and pg_get_userbyid(c.relowner) = current_user
    ) then
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

-- Optional playlist policies are also owner-scoped.
do $$
begin
  if exists (
       select 1
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'playlists'
         and c.relkind in ('r', 'p')
         and pg_get_userbyid(c.relowner) = current_user
     )
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

  if exists (
       select 1
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'playlist_items'
         and c.relkind in ('r', 'p')
         and pg_get_userbyid(c.relowner) = current_user
     )
     and to_regclass('public.playlists') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'playlist_items' and column_name = 'playlist_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'playlists' and column_name = 'user_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'playlists' and column_name = 'id'
     )
  then
    execute 'create policy parent_owners_read on public.playlist_items for select to authenticated using (exists (select 1 from public.playlists p where p.id = playlist_items.playlist_id and p.user_id = auth.uid()))';
    execute 'create policy parent_owners_insert on public.playlist_items for insert to authenticated with check (exists (select 1 from public.playlists p where p.id = playlist_items.playlist_id and p.user_id = auth.uid()))';
    execute 'create policy parent_owners_delete on public.playlist_items for delete to authenticated using (exists (select 1 from public.playlists p where p.id = playlist_items.playlist_id and p.user_id = auth.uid()))';
  end if;
end
$$;

-- Preserve the exact anon SELECT allowlist, limited to owned public tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'songs', 'videos', 'artist_profiles', 'producer_profiles', 'producer_beats'
  ]
  loop
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and c.relkind in ('r', 'p')
        and pg_get_userbyid(c.relowner) = current_user
    ) then
      execute format('grant select on table public.%I to anon', table_name);
    end if;
  end loop;
end
$$;

-- Storage is additive CREATE POLICY-only. Existing policies are never replaced or
-- dropped. SET LOCAL ROLE is used only with exact PostgreSQL 16+ SET authority.
-- Every existing/new v2 policy must exactly match the reviewed definition.
do $$
declare
  migration_user text := current_user;
  objects_owner text;
  p record;
  actual record;
  actual_using text;
  actual_check text;
  expected_using text;
  expected_check text;
  pending_error text;
  unexpected_policies text;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  select pg_get_userbyid(c.relowner)
  into objects_owner
  from pg_class c
  where c.oid = 'storage.objects'::regclass;

  if not pg_has_role(migration_user, objects_owner, 'SET') then
    return;
  end if;

  execute format('set local role %I', objects_owner);
  begin
    for p in
      select *
      from (values
        (
          'app_bucket_select_boundary_v2',
          'select',
          false,
          array['anon', 'authenticated']::text[],
          'bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') or (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and case when auth.role() = ''authenticated'' then (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin() else false end)',
          null,
          'create policy app_bucket_select_boundary_v2 on storage.objects as restrictive for select to anon, authenticated using (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') or (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and case when auth.role() = ''authenticated'' then (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin() else false end))'
        ),
        (
          'app_bucket_insert_boundary_v2',
          'insert',
          false,
          array['authenticated']::text[],
          null,
          'bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()',
          'create policy app_bucket_insert_boundary_v2 on storage.objects as restrictive for insert to authenticated with check (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())'
        ),
        (
          'app_bucket_update_boundary_v2',
          'update',
          false,
          array['authenticated']::text[],
          'bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()',
          'bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()',
          'create policy app_bucket_update_boundary_v2 on storage.objects as restrictive for update to authenticated using (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()) with check (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())'
        ),
        (
          'app_bucket_delete_boundary_v2',
          'delete',
          false,
          array['authenticated']::text[],
          'bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()',
          null,
          'create policy app_bucket_delete_boundary_v2 on storage.objects as restrictive for delete to authenticated using (bucket_id not in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') or (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())'
        ),
        (
          'app_public_bucket_read_v2',
          'select',
          true,
          array['anon', 'authenticated']::text[],
          'bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'')',
          null,
          'create policy app_public_bucket_read_v2 on storage.objects for select to anon, authenticated using (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats''))'
        ),
        (
          'app_public_bucket_owner_insert_v2',
          'insert',
          true,
          array['authenticated']::text[],
          null,
          'bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text',
          'create policy app_public_bucket_owner_insert_v2 on storage.objects for insert to authenticated with check (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text)'
        ),
        (
          'app_public_bucket_owner_update_v2',
          'update',
          true,
          array['authenticated']::text[],
          'bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text',
          'bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text',
          'create policy app_public_bucket_owner_update_v2 on storage.objects for update to authenticated using (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text)'
        ),
        (
          'app_public_bucket_owner_delete_v2',
          'delete',
          true,
          array['authenticated']::text[],
          'bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text',
          null,
          'create policy app_public_bucket_owner_delete_v2 on storage.objects for delete to authenticated using (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'') and (storage.foldername(name))[1] = auth.uid()::text)'
        ),
        (
          'app_private_bucket_owner_read_v2',
          'select',
          true,
          array['authenticated']::text[],
          'bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text',
          null,
          'create policy app_private_bucket_owner_read_v2 on storage.objects for select to authenticated using (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text)'
        ),
        (
          'app_private_bucket_owner_insert_v2',
          'insert',
          true,
          array['authenticated']::text[],
          null,
          'bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text',
          'create policy app_private_bucket_owner_insert_v2 on storage.objects for insert to authenticated with check (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text)'
        ),
        (
          'app_private_bucket_owner_update_v2',
          'update',
          true,
          array['authenticated']::text[],
          'bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text',
          'bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text',
          'create policy app_private_bucket_owner_update_v2 on storage.objects for update to authenticated using (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text)'
        ),
        (
          'app_private_bucket_owner_delete_v2',
          'delete',
          true,
          array['authenticated']::text[],
          'bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text',
          null,
          'create policy app_private_bucket_owner_delete_v2 on storage.objects for delete to authenticated using (bucket_id in (''licenses'', ''downloads'', ''user-media-queues'') and (storage.foldername(name))[1] = auth.uid()::text)'
        ),
        (
          'app_bucket_platform_admin_full_access_v2',
          'all',
          true,
          array['authenticated']::text[],
          'bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') and public.is_platform_admin()',
          'bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') and public.is_platform_admin()',
          'create policy app_bucket_platform_admin_full_access_v2 on storage.objects for all to authenticated using (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') and public.is_platform_admin()) with check (bucket_id in (''songs'', ''videos'', ''covers'', ''albums'', ''producer-beats'', ''licenses'', ''downloads'', ''user-media-queues'') and public.is_platform_admin())'
        )
      ) as policies(
        policy_name,
        command_name,
        is_permissive,
        role_names,
        using_expr,
        check_expr,
        create_statement
      )
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

      select
        policyname,
        lower(cmd) as command_name,
        permissive = 'PERMISSIVE' as is_permissive,
        (select array_agg(role_name order by role_name) from unnest(roles::text[]) role_name) as role_names,
        qual as using_expr,
        with_check as check_expr
      into strict actual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = p.policy_name;

      actual_using := regexp_replace(regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(actual.using_expr, '')), '::text|public\.|[[:space:]()"]', '', 'g'),
          '=anyarray\[', 'in[', 'g'
        ),
        '<>allarray\[', 'notin[', 'g'
      ), '\[|\]', '', 'g');
      actual_check := regexp_replace(regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(actual.check_expr, '')), '::text|public\.|[[:space:]()"]', '', 'g'),
          '=anyarray\[', 'in[', 'g'
        ),
        '<>allarray\[', 'notin[', 'g'
      ), '\[|\]', '', 'g');
      expected_using := regexp_replace(
        regexp_replace(lower(coalesce(p.using_expr, '')), '::text|public\.|[[:space:]()"]', '', 'g'),
        '\[|\]', '', 'g'
      );
      expected_check := regexp_replace(
        regexp_replace(lower(coalesce(p.check_expr, '')), '::text|public\.|[[:space:]()"]', '', 'g'),
        '\[|\]', '', 'g'
      );

      if actual.command_name <> p.command_name
         or actual.is_permissive <> p.is_permissive
         or actual.role_names <> (select array_agg(role_name order by role_name) from unnest(p.role_names) role_name)
         or actual_using <> expected_using
         or actual_check <> expected_check
      then
        raise exception
          'Existing Storage policy "%" has a mismatched definition (expected command=%, mode=%, roles=%, using=%, check=%; actual command=%, mode=%, roles=%, using=%, check=%)',
          p.policy_name,
          upper(p.command_name),
          case when p.is_permissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
          p.role_names,
          p.using_expr,
          p.check_expr,
          upper(actual.command_name),
          case when actual.is_permissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
          actual.role_names,
          actual.using_expr,
          actual.check_expr;
      end if;
    end loop;

    select string_agg(policyname, ', ' order by policyname)
    into unexpected_policies
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like '%\_v2' escape '\'
      and policyname <> all (array[
        'app_bucket_select_boundary_v2',
        'app_bucket_insert_boundary_v2',
        'app_bucket_update_boundary_v2',
        'app_bucket_delete_boundary_v2',
        'app_public_bucket_read_v2',
        'app_public_bucket_owner_insert_v2',
        'app_public_bucket_owner_update_v2',
        'app_public_bucket_owner_delete_v2',
        'app_private_bucket_owner_read_v2',
        'app_private_bucket_owner_insert_v2',
        'app_private_bucket_owner_update_v2',
        'app_private_bucket_owner_delete_v2',
        'app_bucket_platform_admin_full_access_v2'
      ]);
    if unexpected_policies is not null then
      raise exception 'Unexpected Storage v2 policies exist on storage.objects: %', unexpected_policies;
    end if;
  exception
    when others then
      pending_error := format('[%s] %s', sqlstate, sqlerrm);
      begin
        execute format('set local role %I', migration_user);
      exception
        when others then
          raise exception
            'Storage policy failure: %. Failed restoring migration role "%" [%] %',
            pending_error, migration_user, sqlstate, sqlerrm;
      end;
      raise exception 'Storage policy failure: %', pending_error;
  end;
  begin
    execute format('set local role %I', migration_user);
  exception
    when others then
      raise exception
        'Storage policies validated, but failed restoring migration role "%" [%] %',
        migration_user, sqlstate, sqlerrm;
  end;
end
$$;

-- Harden the admin predicate only when this migration role owns it.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    where p.oid = to_regprocedure('public.is_platform_admin(uuid)')
      and pg_get_userbyid(p.proowner) = current_user
  ) then
    revoke all on function public.is_platform_admin(uuid) from public;
    revoke all on function public.is_platform_admin(uuid) from anon;
    grant execute on function public.is_platform_admin(uuid) to authenticated;
    grant execute on function public.is_platform_admin(uuid) to service_role;
  end if;
end
$$;

-- Fail only when a current_user-owned public BASE/PARTITIONED table remains unsecured.
do $$
declare
  unsecured_tables text;
begin
  select string_agg(format('public.%I', c.relname), ', ' order by c.relname)
  into unsecured_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and pg_get_userbyid(c.relowner) = current_user
    and not c.relrowsecurity;

  if unsecured_tables is not null then
    raise exception 'RLS self-audit failed for current_user-owned public tables: %', unsecured_tables;
  end if;
end
$$;

-- Keep this as the final statement so SQL Editor displays the complete decision report.
select
  schema_name,
  table_name,
  current_owner,
  rls_enabled,
  migration_action,
  exact_reason
from rls_migration_preflight
order by schema_name, table_name;
