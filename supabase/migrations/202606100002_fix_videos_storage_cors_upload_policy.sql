-- Fix Supabase Storage direct video uploads.
-- Run this in Supabase SQL Editor.
--
-- This keeps uploads direct to Supabase Storage:
--   Supabase Storage resumable upload endpoint: /storage/v1/upload/resumable
--
-- Browser CORS origins are a Supabase project/dashboard setting, not a
-- storage.objects RLS policy. Add these origins in Supabase if your project
-- exposes an allowed origins / CORS setting:
--   http://localhost:3000
--   https://digitalmusicdatabase.com
--   https://www.digitalmusicdatabase.com
--   your active Vercel preview/deployment URL

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 1073741824, null)
on conflict (id) do update
set
  public = true,
  file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit),
  allowed_mime_types = null;

alter table storage.objects enable row level security;

grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

alter table public.videos add column if not exists file_name text;
alter table public.videos add column if not exists file_size bigint;

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
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Music Data Base authenticated own video deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Optional verification queries:
-- select id, name, public, file_size_limit, allowed_mime_types
-- from storage.buckets
-- where id = 'videos';
--
-- select policyname, roles, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'storage'
--   and tablename = 'objects'
--   and policyname ilike '%video%'
-- order by policyname;
