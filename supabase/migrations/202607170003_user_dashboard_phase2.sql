-- User Dashboard Phase 2: user follows, activity feed, public playlist flag.
-- Additive only. Preserves existing artist_follows.

-- ---------------------------------------------------------------------------
-- Public playlists flag
-- ---------------------------------------------------------------------------
alter table public.playlists add column if not exists is_public boolean not null default false;
create index if not exists playlists_public_user_idx
  on public.playlists (user_id, is_public)
  where is_public = true;

-- ---------------------------------------------------------------------------
-- User follows (auth user graph; mutual status derived)
-- ---------------------------------------------------------------------------
create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  following_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_follows_not_self check (follower_user_id <> following_user_id),
  unique (follower_user_id, following_user_id)
);

create index if not exists user_follows_follower_idx
  on public.user_follows (follower_user_id, created_at desc);
create index if not exists user_follows_following_idx
  on public.user_follows (following_user_id, created_at desc);

alter table public.user_follows enable row level security;

drop policy if exists "users_read_own_follows" on public.user_follows;
drop policy if exists "users_insert_own_follows" on public.user_follows;
drop policy if exists "users_delete_own_follows" on public.user_follows;
drop policy if exists "platform_admin_full_access" on public.user_follows;

-- Followers can read their outgoing follows; targets can read who follows them.
create policy "users_read_own_follows"
on public.user_follows for select
using (
  auth.uid() = follower_user_id
  or auth.uid() = following_user_id
);

create policy "users_insert_own_follows"
on public.user_follows for insert
with check (auth.uid() = follower_user_id);

create policy "users_delete_own_follows"
on public.user_follows for delete
using (auth.uid() = follower_user_id);

create policy "platform_admin_full_access"
on public.user_follows for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select, insert, delete on public.user_follows to authenticated;
grant all on public.user_follows to service_role;
revoke all on public.user_follows from anon, public;

-- ---------------------------------------------------------------------------
-- Activity feed events
-- ---------------------------------------------------------------------------
create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'upload_song',
    'upload_video',
    'upload_beat',
    'upload_album',
    'like_song',
    'like_video',
    'playlist_add',
    'new_follower',
    'release',
    'approval'
  )),
  title text not null default '',
  body text not null default '',
  href text not null default 'Home',
  item_type text null,
  item_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_events_actor_created_idx
  on public.user_activity_events (actor_user_id, created_at desc);
create index if not exists user_activity_events_recipient_created_idx
  on public.user_activity_events (recipient_user_id, created_at desc)
  where recipient_user_id is not null;
create index if not exists user_activity_events_kind_created_idx
  on public.user_activity_events (kind, created_at desc);

alter table public.user_activity_events enable row level security;

drop policy if exists "users_read_own_activity" on public.user_activity_events;
drop policy if exists "users_insert_own_activity" on public.user_activity_events;
drop policy if exists "users_delete_own_activity" on public.user_activity_events;
drop policy if exists "platform_admin_full_access" on public.user_activity_events;

-- Actors can read their own events; recipients can read events addressed to them.
create policy "users_read_own_activity"
on public.user_activity_events for select
using (
  auth.uid() = actor_user_id
  or auth.uid() = recipient_user_id
);

create policy "users_insert_own_activity"
on public.user_activity_events for insert
with check (auth.uid() = actor_user_id);

create policy "users_delete_own_activity"
on public.user_activity_events for delete
using (auth.uid() = actor_user_id);

create policy "platform_admin_full_access"
on public.user_activity_events for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select, insert, delete on public.user_activity_events to authenticated;
grant all on public.user_activity_events to service_role;
revoke all on public.user_activity_events from anon, public;
