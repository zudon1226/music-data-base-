-- Run this in the Supabase SQL editor for the Z Music project.
-- Audio files upload to songs. Video files upload to videos/{auth.uid()}/{uuid}.mp4.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('songs', 'songs', true, 104857600, null),
  ('videos', 'videos', true, null, null)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text,
  artist text,
  description text,
  category text,
  type text,
  audio_url text,
  storage_path text,
  cover_url text,
  avatar_url text,
  duration integer,
  plays integer default 0,
  likes integer default 0,
  created_at timestamptz default now()
);

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

drop policy if exists "Anyone can read songs" on storage.objects;
drop policy if exists "Public read songs" on storage.objects;
drop policy if exists "Users can upload songs to their folder" on storage.objects;
drop policy if exists "Authenticated users can upload songs" on storage.objects;
drop policy if exists "Users can update their songs" on storage.objects;
drop policy if exists "Users can delete their songs" on storage.objects;

drop policy if exists "Anyone can read videos" on storage.objects;
drop policy if exists "Public read videos" on storage.objects;
drop policy if exists "Allow public read videos" on storage.objects;
drop policy if exists "Allow public read videos l1ivt5k_0" on storage.objects;
drop policy if exists "Users can read videos from their own folder" on storage.objects;
drop policy if exists "Users can read videos from their own folder l1ivt5k_0" on storage.objects;
drop policy if exists "Authenticated users can upload videos" on storage.objects;
drop policy if exists "Authenticated users can upload videos t9jwe_0" on storage.objects;
drop policy if exists "Authenticated users can upload videos l1ivt5k_0" on storage.objects;
drop policy if exists "Allow logged in uploads to videos" on storage.objects;
drop policy if exists "Allow logged in uploads to videos l1ivt5k_0" on storage.objects;
drop policy if exists "TEMP allow all uploads videos" on storage.objects;
drop policy if exists "TEMP allow all uploads videos l1ivt5k_0" on storage.objects;
drop policy if exists "Authenticated users can manage videos" on storage.objects;
drop policy if exists "Users can update their videos" on storage.objects;
drop policy if exists "Users can delete their videos" on storage.objects;
drop policy if exists "Authenticated users can insert own videos" on storage.objects;
drop policy if exists "Authenticated users can update own videos" on storage.objects;
drop policy if exists "Authenticated users can delete own videos" on storage.objects;

create policy "Public read songs"
on storage.objects
for select
using (bucket_id = 'songs');

create policy "Authenticated users can upload songs"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'songs');

create policy "Users can update their songs"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'songs'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'songs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their songs"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'songs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Public read videos"
on storage.objects
for select
using (bucket_id = 'videos');

create policy "Authenticated users can insert own videos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated users can update own videos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated users can delete own videos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
