-- Music Data Base - verify and fix direct Supabase video uploads.
-- Run this whole file in the Supabase SQL Editor.
--
-- Confirmed app upload path:
--   Browser -> Supabase Storage bucket "videos"
--   Browser -> public.videos metadata insert
--
-- This file does not create or use any app upload endpoint.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 1073741824, null)
on conflict (id) do update
set
  public = true,
  file_size_limit = 1073741824,
  allowed_mime_types = null;

alter table storage.objects enable row level security;

grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

drop policy if exists "Public read videos" on storage.objects;
drop policy if exists "Authenticated users can insert own videos" on storage.objects;
drop policy if exists "Authenticated users can update own videos" on storage.objects;
drop policy if exists "Authenticated users can delete own videos" on storage.objects;
drop policy if exists "Music Data Base public read videos" on storage.objects;
drop policy if exists "Music Data Base authenticated video uploads" on storage.objects;
drop policy if exists "Music Data Base authenticated video updates" on storage.objects;
drop policy if exists "Music Data Base authenticated video deletes" on storage.objects;
drop policy if exists "Music Data Base authenticated videos bucket uploads" on storage.objects;
drop policy if exists "Music Data Base authenticated own video updates" on storage.objects;
drop policy if exists "Music Data Base authenticated own video deletes" on storage.objects;

create policy "Music Data Base public read videos"
on storage.objects
for select
to public
using (bucket_id = 'videos');

create policy "Music Data Base authenticated videos bucket uploads"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'videos');

create policy "Music Data Base authenticated own video updates"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'videos'
  and owner = auth.uid()
)
with check (
  bucket_id = 'videos'
  and owner = auth.uid()
);

create policy "Music Data Base authenticated own video deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'videos'
  and owner = auth.uid()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text,
  artist_name text,
  producer_id text,
  video_url text,
  storage_path text,
  file_name text,
  file_size bigint,
  created_at timestamptz default now()
);

alter table public.videos add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.videos add column if not exists title text;
alter table public.videos add column if not exists artist_name text;
alter table public.videos add column if not exists producer_id text;
alter table public.videos add column if not exists video_url text;
alter table public.videos add column if not exists storage_path text;
alter table public.videos add column if not exists file_name text;
alter table public.videos add column if not exists file_size bigint;
alter table public.videos add column if not exists created_at timestamptz default now();

alter table public.videos enable row level security;

drop policy if exists "Music Data Base public read videos table" on public.videos;
drop policy if exists "Music Data Base authenticated insert video metadata" on public.videos;

create policy "Music Data Base public read videos table"
on public.videos
for select
to public
using (true);

create policy "Music Data Base authenticated insert video metadata"
on public.videos
for insert
to authenticated
with check (user_id is null or user_id = auth.uid());

select
  'videos bucket' as check_name,
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'videos';

select
  'storage.objects video policies' as check_name,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname ilike '%video%'
order by policyname;

select
  'public.videos policies' as check_name,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'videos'
order by policyname;
