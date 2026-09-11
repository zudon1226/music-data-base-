-- Launch RLS verification gap fix (payment + media + podcast tables).
-- Aligns grants/policies with scripts/verify-supabase-rls-security.mjs expectations.
-- Additive only; does not weaken existing owner-scoped policies.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'media_downloads',
    'subscription_payments',
    'subscription_events',
    'ringtone_download_tickets',
    'sales_payment_events'
  ]
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = tbl and c.relkind in ('r', 'p')
    ) then
      continue;
    end if;

    execute format('revoke all privileges on table public.%I from anon', tbl);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', tbl);

    if tbl = 'sales_payment_events' then
      execute format('revoke all privileges on table public.%I from authenticated', tbl);
      execute format('grant select on table public.%I to authenticated', tbl);
    else
      execute format('grant select, insert, update, delete on table public.%I to authenticated', tbl);
    end if;

    execute format('grant all privileges on table public.%I to service_role', tbl);

    execute format('drop policy if exists platform_admin_full_access on public.%I', tbl);
    execute format(
      'create policy platform_admin_full_access on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      tbl
    );
  end loop;
end $$;

-- ringtone_download_tickets: deny authenticated direct access; no anon-facing policy.
drop policy if exists ringtone_download_tickets_no_direct_access on public.ringtone_download_tickets;
create policy ringtone_download_tickets_no_direct_access
  on public.ringtone_download_tickets
  for all
  to authenticated
  using (false)
  with check (false);

-- subscription tables: preserve owner read policies (already exist from 202607190001).

-- media_downloads: preserve owner read + blocked insert policies (202607200002).

-- podcast_episode_comments: authenticated-only read (remove anon public read leak).
revoke all privileges on table public.podcast_episode_comments from anon;
revoke truncate, references, trigger on table public.podcast_episode_comments from authenticated;
grant select, insert, update, delete on table public.podcast_episode_comments to authenticated;
grant all privileges on table public.podcast_episode_comments to service_role;

drop policy if exists podcast_episode_comments_public_read on public.podcast_episode_comments;
create policy podcast_episode_comments_authenticated_read
  on public.podcast_episode_comments
  for select
  to authenticated
  using (true);

drop policy if exists podcast_episode_comments_owner_write on public.podcast_episode_comments;
create policy podcast_episode_comments_owner_write
  on public.podcast_episode_comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy podcast_episode_comments_owner_update
  on public.podcast_episode_comments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy podcast_episode_comments_owner_delete
  on public.podcast_episode_comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
