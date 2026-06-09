create extension if not exists pgcrypto;

alter table public.videos add column if not exists likes integer default 0;

create table if not exists public.video_likes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (video_id, user_id)
);

alter table public.video_likes enable row level security;

drop policy if exists "Users can read their video likes" on public.video_likes;
drop policy if exists "Users can insert their video likes" on public.video_likes;
drop policy if exists "Users can delete their video likes" on public.video_likes;

create policy "Users can read their video likes"
on public.video_likes
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their video likes"
on public.video_likes
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete their video likes"
on public.video_likes
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists video_likes_video_id_idx on public.video_likes (video_id);
create index if not exists video_likes_user_id_idx on public.video_likes (user_id);
