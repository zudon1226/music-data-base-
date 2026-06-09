create extension if not exists pgcrypto;

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  creator_name text,
  owner_type text default 'artist',
  artist_name text,
  artist_id uuid,
  producer_name text,
  producer_id uuid,
  producer_profile_id uuid,
  cover_url text,
  category text,
  release_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.albums add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.albums add column if not exists title text;
alter table public.albums add column if not exists creator_name text;
alter table public.albums add column if not exists owner_type text default 'artist';
alter table public.albums add column if not exists artist_name text;
alter table public.albums add column if not exists artist_id uuid;
alter table public.albums add column if not exists producer_name text;
alter table public.albums add column if not exists producer_id uuid;
alter table public.albums add column if not exists producer_profile_id uuid;
alter table public.albums add column if not exists cover_url text;
alter table public.albums add column if not exists category text;
alter table public.albums add column if not exists release_date date;
alter table public.albums add column if not exists created_at timestamptz default now();
alter table public.albums add column if not exists updated_at timestamptz default now();

update public.albums
set creator_name = coalesce(creator_name, artist_name, producer_name, 'Unknown creator')
where creator_name is null or btrim(creator_name) = '';

update public.albums
set owner_type = 'artist'
where owner_type is null or owner_type not in ('artist', 'producer');

update public.albums set cover_url = coalesce(cover_url, '/music-data-base-logo.png') where cover_url is null;
update public.albums set category = coalesce(category, 'Album') where category is null;
update public.albums set created_at = coalesce(created_at, now());
update public.albums set updated_at = coalesce(updated_at, created_at, now());

alter table public.albums alter column title set not null;
alter table public.albums alter column owner_type set default 'artist';
alter table public.albums alter column created_at set default now();
alter table public.albums alter column updated_at set default now();

alter table public.albums drop constraint if exists albums_owner_type_check;
alter table public.albums
  add constraint albums_owner_type_check check (owner_type in ('artist', 'producer'));

create table if not exists public.album_items (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  item_id uuid not null,
  item_type text not null check (item_type in ('song', 'video')),
  position integer default 0,
  created_at timestamptz default now(),
  unique (album_id, item_id, item_type)
);

alter table public.album_items add column if not exists album_id uuid references public.albums(id) on delete cascade;
alter table public.album_items add column if not exists item_id uuid;
alter table public.album_items add column if not exists item_type text;
alter table public.album_items add column if not exists position integer default 0;
alter table public.album_items add column if not exists created_at timestamptz default now();

delete from public.album_items
where album_id is null
   or item_id is null
   or item_type not in ('song', 'video');

alter table public.album_items alter column album_id set not null;
alter table public.album_items alter column item_id set not null;
alter table public.album_items alter column item_type set not null;
alter table public.album_items alter column position set default 0;
alter table public.album_items alter column created_at set default now();

alter table public.album_items drop constraint if exists album_items_item_type_check;
alter table public.album_items
  add constraint album_items_item_type_check check (item_type in ('song', 'video'));

alter table public.album_items drop constraint if exists album_items_album_item_type_key;
alter table public.album_items
  add constraint album_items_album_item_type_key unique (album_id, item_id, item_type);

create index if not exists albums_user_id_idx on public.albums (user_id);
create index if not exists albums_artist_id_idx on public.albums (artist_id);
create index if not exists albums_producer_id_idx on public.albums (producer_id);
create index if not exists album_items_album_id_idx on public.album_items (album_id);
create index if not exists album_items_item_idx on public.album_items (item_id, item_type);

alter table public.albums enable row level security;
alter table public.album_items enable row level security;

drop policy if exists "Albums are readable" on public.albums;
drop policy if exists "Users can insert own albums" on public.albums;
drop policy if exists "Users can update own albums" on public.albums;
drop policy if exists "Users can delete own albums" on public.albums;

create policy "Albums are readable"
on public.albums
for select
to authenticated
using (true);

create policy "Users can insert own albums"
on public.albums
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own albums"
on public.albums
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own albums"
on public.albums
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Album items are readable" on public.album_items;
drop policy if exists "Users can insert own album items" on public.album_items;
drop policy if exists "Users can delete own album items" on public.album_items;

create policy "Album items are readable"
on public.album_items
for select
to authenticated
using (true);

create policy "Users can insert own album items"
on public.album_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.albums
    where albums.id = album_items.album_id
      and albums.user_id = auth.uid()
  )
);

create policy "Users can delete own album items"
on public.album_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.albums
    where albums.id = album_items.album_id
      and albums.user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.albums to authenticated;
grant select, insert, delete on public.album_items to authenticated;
