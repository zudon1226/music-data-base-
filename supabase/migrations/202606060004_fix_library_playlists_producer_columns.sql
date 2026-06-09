create extension if not exists pgcrypto;

create table if not exists public.library_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  item_type text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_id, item_type)
);

alter table public.library_saves add column if not exists id uuid default gen_random_uuid();
alter table public.library_saves add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.library_saves add column if not exists item_id uuid;
alter table public.library_saves add column if not exists item_type text;
alter table public.library_saves add column if not exists created_at timestamptz default now();

delete from public.library_saves
where user_id is null
   or item_id is null
   or item_type not in ('song', 'video', 'album');

alter table public.library_saves alter column user_id set not null;
alter table public.library_saves alter column item_id set not null;
alter table public.library_saves alter column item_type set not null;
alter table public.library_saves alter column created_at set default now();
alter table public.library_saves alter column created_at set not null;

alter table public.library_saves drop constraint if exists library_saves_item_type_check;
alter table public.library_saves
  add constraint library_saves_item_type_check check (item_type in ('song', 'video', 'album'));

alter table public.library_saves drop constraint if exists library_saves_user_item_type_key;
alter table public.library_saves
  add constraint library_saves_user_item_type_key unique (user_id, item_id, item_type);

create index if not exists library_saves_user_type_idx
on public.library_saves (user_id, item_type);

alter table public.library_saves enable row level security;

drop policy if exists "Users can read own library saves" on public.library_saves;
drop policy if exists "Users can insert own library saves" on public.library_saves;
drop policy if exists "Users can delete own library saves" on public.library_saves;

create policy "Users can read own library saves"
on public.library_saves
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own library saves"
on public.library_saves
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete own library saves"
on public.library_saves
for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on public.library_saves to authenticated;

alter table public.playlists add column if not exists playlist_type text default 'mixed';
update public.playlists
set playlist_type = 'mixed'
where playlist_type is null or playlist_type not in ('song', 'video', 'mixed');

alter table public.playlists drop constraint if exists playlists_playlist_type_check;
alter table public.playlists
  add constraint playlists_playlist_type_check check (playlist_type in ('song', 'video', 'mixed'));

create index if not exists playlists_user_type_idx
on public.playlists (user_id, playlist_type);

alter table public.producer_beats add column if not exists category text default 'Beats';
update public.producer_beats
set category = coalesce(nullif(category, ''), 'Beats');

create index if not exists producer_beats_category_idx
on public.producer_beats (category);
