create extension if not exists pgcrypto;

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  category text,
  video_url text,
  storage_path text,
  thumbnail_url text,
  views integer default 0,
  likes integer default 0,
  created_at timestamptz default now()
);

alter table public.videos enable row level security;

drop policy if exists "Anyone can read videos" on public.videos;
drop policy if exists "Authenticated users can insert videos" on public.videos;
drop policy if exists "Authenticated users can update videos" on public.videos;
drop policy if exists "Authenticated users can delete videos" on public.videos;

create policy "Anyone can read videos"
on public.videos
for select
using (true);

create policy "Authenticated users can insert videos"
on public.videos
for insert
to authenticated
with check (true);

create policy "Authenticated users can update videos"
on public.videos
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete videos"
on public.videos
for delete
to authenticated
using (true);

create index if not exists videos_created_at_idx on public.videos (created_at desc);
