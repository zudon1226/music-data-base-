create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid()
);

alter table public.songs add column if not exists title text;
alter table public.songs add column if not exists artist text;
alter table public.songs add column if not exists description text;
alter table public.songs add column if not exists category text;
alter table public.songs add column if not exists type text;
alter table public.songs add column if not exists audio_url text;
alter table public.songs add column if not exists storage_path text;
alter table public.songs add column if not exists cover_url text;
alter table public.songs add column if not exists avatar_url text;
alter table public.songs add column if not exists duration integer;
alter table public.songs add column if not exists plays integer default 0;
alter table public.songs add column if not exists likes integer default 0;
alter table public.songs add column if not exists created_at timestamptz default now();

alter table public.songs enable row level security;

drop policy if exists "Anyone can read songs" on public.songs;
drop policy if exists "Authenticated users can insert songs" on public.songs;
drop policy if exists "Authenticated users can update songs" on public.songs;
drop policy if exists "Authenticated users can delete songs" on public.songs;

create policy "Anyone can read songs"
on public.songs
for select
using (true);

create policy "Authenticated users can insert songs"
on public.songs
for insert
to authenticated
with check (true);

create policy "Authenticated users can update songs"
on public.songs
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete songs"
on public.songs
for delete
to authenticated
using (true);

create index if not exists songs_created_at_idx on public.songs (created_at desc);

notify pgrst, 'reload schema';
