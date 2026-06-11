-- Fix direct browser video uploads to Supabase Storage.
-- Run this in Supabase SQL Editor for the Music Data Base project.
-- CORS allowed origins are configured in Supabase project settings, not in storage.objects RLS.
-- Add these allowed origins in Supabase:
--   https://digitalmusicdatabase.com
--   https://www.digitalmusicdatabase.com
--   https://music-data-base-meyzv5bh0-zudon1226-5137s-projects.vercel.app
--   http://localhost:3000
--   http://localhost:3001

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  true,
  1073741824,
  null
)
on conflict (id) do update
set
  public = true,
  file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit),
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

create policy "Music Data Base public read videos"
on storage.objects
for select
using (bucket_id = 'videos');

create policy "Music Data Base authenticated video uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Music Data Base authenticated video updates"
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

create policy "Music Data Base authenticated video deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
