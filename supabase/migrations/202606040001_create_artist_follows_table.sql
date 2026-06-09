create extension if not exists pgcrypto;

create table if not exists public.artist_follows (
  id uuid primary key default gen_random_uuid(),
  artist_id text not null,
  artist_name text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (artist_id, user_id)
);

alter table public.artist_follows enable row level security;

drop policy if exists "Users can read their artist follows" on public.artist_follows;
drop policy if exists "Users can insert their artist follows" on public.artist_follows;
drop policy if exists "Users can delete their artist follows" on public.artist_follows;

create policy "Users can read their artist follows"
on public.artist_follows
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their artist follows"
on public.artist_follows
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete their artist follows"
on public.artist_follows
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists artist_follows_user_id_idx on public.artist_follows (user_id);
create index if not exists artist_follows_artist_id_idx on public.artist_follows (artist_id);
