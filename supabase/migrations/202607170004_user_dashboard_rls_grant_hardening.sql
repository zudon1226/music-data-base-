-- Harden Phase 1/2 dashboard table grants and policy roles to match platform RLS verifier.

-- ---------------------------------------------------------------------------
-- user_follows
-- ---------------------------------------------------------------------------
revoke all on table public.user_follows from anon, public;
revoke truncate, references, trigger on table public.user_follows from authenticated;
grant select, insert, delete on table public.user_follows to authenticated;
grant all on table public.user_follows to service_role;

drop policy if exists "users_read_own_follows" on public.user_follows;
drop policy if exists "users_insert_own_follows" on public.user_follows;
drop policy if exists "users_delete_own_follows" on public.user_follows;
drop policy if exists "owners_read" on public.user_follows;
drop policy if exists "owners_insert" on public.user_follows;
drop policy if exists "owners_delete" on public.user_follows;
drop policy if exists "platform_admin_full_access" on public.user_follows;

create policy "owners_read"
on public.user_follows for select
to authenticated
using (auth.uid() = follower_user_id or auth.uid() = following_user_id);

create policy "owners_insert"
on public.user_follows for insert
to authenticated
with check (auth.uid() = follower_user_id);

create policy "owners_delete"
on public.user_follows for delete
to authenticated
using (auth.uid() = follower_user_id);

create policy "platform_admin_full_access"
on public.user_follows for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- user_activity_events
-- ---------------------------------------------------------------------------
revoke all on table public.user_activity_events from anon, public;
revoke truncate, references, trigger on table public.user_activity_events from authenticated;
grant select, insert, delete on table public.user_activity_events to authenticated;
grant all on table public.user_activity_events to service_role;

drop policy if exists "users_read_own_activity" on public.user_activity_events;
drop policy if exists "users_insert_own_activity" on public.user_activity_events;
drop policy if exists "users_delete_own_activity" on public.user_activity_events;
drop policy if exists "owners_read" on public.user_activity_events;
drop policy if exists "owners_insert" on public.user_activity_events;
drop policy if exists "owners_delete" on public.user_activity_events;
drop policy if exists "platform_admin_full_access" on public.user_activity_events;

create policy "owners_read"
on public.user_activity_events for select
to authenticated
using (auth.uid() = actor_user_id or auth.uid() = recipient_user_id);

create policy "owners_insert"
on public.user_activity_events for insert
to authenticated
with check (auth.uid() = actor_user_id);

create policy "owners_delete"
on public.user_activity_events for delete
to authenticated
using (auth.uid() = actor_user_id);

create policy "platform_admin_full_access"
on public.user_activity_events for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- user_recently_played (Phase 1 hardening gap)
-- ---------------------------------------------------------------------------
revoke all on table public.user_recently_played from anon, public;
revoke truncate, references, trigger on table public.user_recently_played from authenticated;
grant select, insert, update, delete on table public.user_recently_played to authenticated;
grant all on table public.user_recently_played to service_role;

drop policy if exists "users_read_own_recently_played" on public.user_recently_played;
drop policy if exists "users_insert_own_recently_played" on public.user_recently_played;
drop policy if exists "users_update_own_recently_played" on public.user_recently_played;
drop policy if exists "users_delete_own_recently_played" on public.user_recently_played;
drop policy if exists "owners_read" on public.user_recently_played;
drop policy if exists "owners_insert" on public.user_recently_played;
drop policy if exists "owners_update" on public.user_recently_played;
drop policy if exists "owners_delete" on public.user_recently_played;
drop policy if exists "platform_admin_full_access" on public.user_recently_played;

create policy "owners_read"
on public.user_recently_played for select
to authenticated
using (auth.uid() = user_id);

create policy "owners_insert"
on public.user_recently_played for insert
to authenticated
with check (auth.uid() = user_id);

create policy "owners_update"
on public.user_recently_played for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "owners_delete"
on public.user_recently_played for delete
to authenticated
using (auth.uid() = user_id);

create policy "platform_admin_full_access"
on public.user_recently_played for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());
