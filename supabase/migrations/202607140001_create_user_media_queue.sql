-- Canonical per-user shared media queue (songs + videos).
-- Authoritative store for refresh / logout / browser restart survival.

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

alter table public.user_media_queue_items enable row level security;
alter table public.user_media_queue_state enable row level security;

drop policy if exists "Users can read own media queue items" on public.user_media_queue_items;
drop policy if exists "Users can insert own media queue items" on public.user_media_queue_items;
drop policy if exists "Users can update own media queue items" on public.user_media_queue_items;
drop policy if exists "Users can delete own media queue items" on public.user_media_queue_items;

create policy "Users can read own media queue items"
on public.user_media_queue_items
for select
using (auth.uid() = user_id);

create policy "Users can insert own media queue items"
on public.user_media_queue_items
for insert
with check (auth.uid() = user_id);

create policy "Users can update own media queue items"
on public.user_media_queue_items
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own media queue items"
on public.user_media_queue_items
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own media queue state" on public.user_media_queue_state;
drop policy if exists "Users can insert own media queue state" on public.user_media_queue_state;
drop policy if exists "Users can update own media queue state" on public.user_media_queue_state;
drop policy if exists "Users can delete own media queue state" on public.user_media_queue_state;

create policy "Users can read own media queue state"
on public.user_media_queue_state
for select
using (auth.uid() = user_id);

create policy "Users can insert own media queue state"
on public.user_media_queue_state
for insert
with check (auth.uid() = user_id);

create policy "Users can update own media queue state"
on public.user_media_queue_state
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own media queue state"
on public.user_media_queue_state
for delete
using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_media_queue_items to authenticated;
grant select, insert, update, delete on public.user_media_queue_state to authenticated;
grant all on public.user_media_queue_items to service_role;
grant all on public.user_media_queue_state to service_role;
