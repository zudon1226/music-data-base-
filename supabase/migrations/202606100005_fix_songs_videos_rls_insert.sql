-- Music Data Base - fix song/video metadata insert RLS.
-- Run this in Supabase SQL Editor.
--
-- Storage uploads are already working. This only allows authenticated users
-- to save metadata rows they own in public.songs and public.videos.

alter table public.songs enable row level security;
alter table public.videos enable row level security;

alter table public.songs
add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.videos
add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists songs_user_id_idx on public.songs (user_id);
create index if not exists videos_user_id_idx on public.videos (user_id);

drop policy if exists "Anyone can read songs" on public.songs;
drop policy if exists "Authenticated users can insert songs" on public.songs;
drop policy if exists "Authenticated users can update songs" on public.songs;
drop policy if exists "Authenticated users can delete songs" on public.songs;
drop policy if exists "Music Data Base public read songs table" on public.songs;
drop policy if exists "Music Data Base authenticated insert song metadata" on public.songs;
drop policy if exists "Music Data Base authenticated update own songs" on public.songs;
drop policy if exists "Music Data Base authenticated delete own songs" on public.songs;

create policy "Music Data Base public read songs table"
on public.songs
for select
to public
using (true);

create policy "Music Data Base authenticated insert song metadata"
on public.songs
for insert
to authenticated
with check (user_id::text = auth.uid()::text);

create policy "Music Data Base authenticated update own songs"
on public.songs
for update
to authenticated
using (user_id::text = auth.uid()::text)
with check (user_id::text = auth.uid()::text);

create policy "Music Data Base authenticated delete own songs"
on public.songs
for delete
to authenticated
using (user_id::text = auth.uid()::text);

drop policy if exists "Anyone can read videos" on public.videos;
drop policy if exists "Authenticated users can insert videos" on public.videos;
drop policy if exists "Authenticated users can insert own videos" on public.videos;
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

grant select on public.songs to anon, authenticated;
grant insert, update, delete on public.songs to authenticated;

grant select on public.videos to anon, authenticated;
grant insert, update, delete on public.videos to authenticated;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('songs', 'videos')
order by tablename, policyname;
