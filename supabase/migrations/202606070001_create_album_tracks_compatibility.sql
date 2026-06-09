create extension if not exists pgcrypto;

create table if not exists public.album_tracks (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  item_id uuid not null,
  item_type text not null check (item_type in ('song', 'video')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (album_id, item_id, item_type)
);

alter table public.album_tracks add column if not exists id uuid default gen_random_uuid();
alter table public.album_tracks add column if not exists album_id uuid references public.albums(id) on delete cascade;
alter table public.album_tracks add column if not exists item_id uuid;
alter table public.album_tracks add column if not exists item_type text;
alter table public.album_tracks add column if not exists position integer default 0;
alter table public.album_tracks add column if not exists created_at timestamptz default now();

delete from public.album_tracks
where album_id is null
   or item_id is null
   or item_type not in ('song', 'video');

alter table public.album_tracks alter column id set default gen_random_uuid();
alter table public.album_tracks alter column id set not null;
alter table public.album_tracks alter column album_id set not null;
alter table public.album_tracks alter column item_id set not null;
alter table public.album_tracks alter column item_type set not null;
alter table public.album_tracks alter column position set default 0;
alter table public.album_tracks alter column position set not null;
alter table public.album_tracks alter column created_at set default now();
alter table public.album_tracks alter column created_at set not null;

alter table public.album_tracks drop constraint if exists album_tracks_item_type_check;
alter table public.album_tracks
  add constraint album_tracks_item_type_check check (item_type in ('song', 'video'));

alter table public.album_tracks drop constraint if exists album_tracks_album_id_fkey;
alter table public.album_tracks
  add constraint album_tracks_album_id_fkey foreign key (album_id) references public.albums(id) on delete cascade;

with ranked_tracks as (
  select
    ctid,
    row_number() over (
      partition by album_id, item_id, item_type
      order by position asc, created_at asc, id asc
    ) as row_number
  from public.album_tracks
)
delete from public.album_tracks
using ranked_tracks
where public.album_tracks.ctid = ranked_tracks.ctid
  and ranked_tracks.row_number > 1;

alter table public.album_tracks drop constraint if exists album_tracks_album_item_type_key;
drop index if exists public.album_tracks_unique_item_idx;

alter table public.album_tracks
  add constraint album_tracks_album_item_type_key unique (album_id, item_id, item_type);

insert into public.album_tracks (album_id, item_id, item_type, position, created_at)
select album_id, item_id, item_type, position, created_at
from public.album_items
on conflict (album_id, item_id, item_type) do nothing;

create index if not exists album_tracks_album_id_idx on public.album_tracks (album_id);
create index if not exists album_tracks_item_idx on public.album_tracks (item_id, item_type);

alter table public.album_tracks enable row level security;

drop policy if exists "Album tracks are readable" on public.album_tracks;
drop policy if exists "Users can insert own album tracks" on public.album_tracks;
drop policy if exists "Users can delete own album tracks" on public.album_tracks;

create policy "Album tracks are readable"
on public.album_tracks
for select
to authenticated
using (true);

create policy "Users can insert own album tracks"
on public.album_tracks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.albums
    where albums.id = album_tracks.album_id
      and albums.user_id = auth.uid()
  )
);

create policy "Users can delete own album tracks"
on public.album_tracks
for delete
to authenticated
using (
  exists (
    select 1
    from public.albums
    where albums.id = album_tracks.album_id
      and albums.user_id = auth.uid()
  )
);

grant select, insert, delete on public.album_tracks to authenticated;
