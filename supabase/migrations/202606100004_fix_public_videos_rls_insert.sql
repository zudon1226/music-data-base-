-- Music Data Base - fix public.videos metadata insert RLS.
-- Run this in Supabase SQL Editor.
--
-- Storage upload is already direct and working. This only fixes the
-- public.videos row insert after the file reaches Supabase Storage.

alter table public.videos enable row level security;

alter table public.videos add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.videos add column if not exists artist_id text;
alter table public.videos add column if not exists producer_id text;
alter table public.videos add column if not exists video_url text;
alter table public.videos add column if not exists storage_path text;
alter table public.videos add column if not exists file_name text;
alter table public.videos add column if not exists file_size bigint;
alter table public.videos add column if not exists created_at timestamptz default now();

drop policy if exists "Anyone can read videos" on public.videos;
drop policy if exists "Authenticated users can insert videos" on public.videos;
drop policy if exists "Authenticated users can update videos" on public.videos;
drop policy if exists "Authenticated users can delete videos" on public.videos;
drop policy if exists "Music Data Base public read videos table" on public.videos;
drop policy if exists "Music Data Base authenticated insert video metadata" on public.videos;
drop policy if exists "Music Data Base authenticated update own videos" on public.videos;
drop policy if exists "Music Data Base authenticated delete own videos" on public.videos;

create policy "Music Data Base public read videos table"
on public.videos
for select
to public
using (true);

create policy "Music Data Base authenticated insert video metadata"
on public.videos
for insert
to authenticated
with check (user_id::text = auth.uid()::text);

create policy "Music Data Base authenticated update own videos"
on public.videos
for update
to authenticated
using (user_id::text = auth.uid()::text)
with check (user_id::text = auth.uid()::text);

create policy "Music Data Base authenticated delete own videos"
on public.videos
for delete
to authenticated
using (user_id::text = auth.uid()::text);

grant select on public.videos to anon, authenticated;
grant insert, update, delete on public.videos to authenticated;

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'videos'
  and column_name in ('user_id', 'artist_id', 'owner_id', 'created_by', 'producer_id', 'video_url', 'storage_path', 'file_name', 'file_size')
order by column_name;

select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'videos'
order by policyname;

select *
from public.videos
limit 1;
