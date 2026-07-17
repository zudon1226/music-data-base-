-- User Dashboard Phase 1: profile fields, notifications routing, recently played rows,
-- queue playback prefs, and private avatar storage. Additive only.

-- ---------------------------------------------------------------------------
-- Profiles: username / location / website already partially present
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists country text;

-- website + bio already exist from phase3; keep lengths enforced in app layer
create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null and btrim(username) <> '';

create index if not exists profiles_username_lookup_idx
  on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- Notifications: kind + href for destination links
-- ---------------------------------------------------------------------------
alter table public.notifications add column if not exists kind text;
alter table public.notifications add column if not exists href text;
alter table public.notifications add column if not exists updated_at timestamptz not null default now();

alter table public.notifications drop constraint if exists notifications_item_type_check;
alter table public.notifications
  add constraint notifications_item_type_check
  check (
    item_type is null
    or item_type in (
      'song', 'video', 'album', 'artist', 'producer', 'playlist',
      'ringtone', 'ringtone_review', 'beat', 'system'
    )
  );

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read, created_at desc);

-- ---------------------------------------------------------------------------
-- Recently played: normalized rows (user_music_state JSON remains for bootstrap)
-- ---------------------------------------------------------------------------
create table if not exists public.user_recently_played (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('song', 'video', 'beat', 'album', 'ringtone')),
  media_id text not null,
  last_played_at timestamptz not null default now(),
  playback_position_seconds double precision not null default 0,
  completed boolean not null default false,
  title text not null default '',
  creator_name text not null default '',
  artwork_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_type, media_id)
);

create index if not exists user_recently_played_user_last_idx
  on public.user_recently_played (user_id, last_played_at desc);

alter table public.user_recently_played enable row level security;

drop policy if exists "users_read_own_recently_played" on public.user_recently_played;
drop policy if exists "users_insert_own_recently_played" on public.user_recently_played;
drop policy if exists "users_update_own_recently_played" on public.user_recently_played;
drop policy if exists "users_delete_own_recently_played" on public.user_recently_played;

create policy "users_read_own_recently_played"
on public.user_recently_played for select
using (auth.uid() = user_id);

create policy "users_insert_own_recently_played"
on public.user_recently_played for insert
with check (auth.uid() = user_id);

create policy "users_update_own_recently_played"
on public.user_recently_played for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users_delete_own_recently_played"
on public.user_recently_played for delete
using (auth.uid() = user_id);

drop policy if exists "platform_admin_full_access" on public.user_recently_played;
create policy "platform_admin_full_access"
on public.user_recently_played for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select, insert, update, delete on public.user_recently_played to authenticated;
grant all on public.user_recently_played to service_role;
revoke all on public.user_recently_played from anon, public;

-- ---------------------------------------------------------------------------
-- Queue state: shuffle / repeat persistence
-- ---------------------------------------------------------------------------
alter table public.user_media_queue_state
  add column if not exists shuffle_on boolean not null default false;
alter table public.user_media_queue_state
  add column if not exists repeat_mode text not null default 'off';

alter table public.user_media_queue_state drop constraint if exists user_media_queue_state_repeat_mode_check;
alter table public.user_media_queue_state
  add constraint user_media_queue_state_repeat_mode_check
  check (repeat_mode in ('off', 'one', 'all'));

-- ---------------------------------------------------------------------------
-- Private avatars bucket (owner-only read/write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_owners_read" on storage.objects;
drop policy if exists "avatars_owners_insert" on storage.objects;
drop policy if exists "avatars_owners_update" on storage.objects;
drop policy if exists "avatars_owners_delete" on storage.objects;

create policy "avatars_owners_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_owners_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_owners_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_owners_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
