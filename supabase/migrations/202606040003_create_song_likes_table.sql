create extension if not exists pgcrypto;

create table if not exists public.song_likes (
  id uuid primary key default gen_random_uuid(),
  song_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (song_id, user_id)
);

alter table public.song_likes enable row level security;

drop policy if exists "Users can read their song likes" on public.song_likes;
drop policy if exists "Users can insert their song likes" on public.song_likes;
drop policy if exists "Users can delete their song likes" on public.song_likes;

create policy "Users can read their song likes"
on public.song_likes
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their song likes"
on public.song_likes
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete their song likes"
on public.song_likes
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists song_likes_song_id_idx on public.song_likes (song_id);
create index if not exists song_likes_user_id_idx on public.song_likes (user_id);
