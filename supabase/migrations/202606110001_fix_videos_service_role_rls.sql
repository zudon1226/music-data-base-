-- Music Data Base - videos metadata insert RLS hardening.
-- This keeps browser/authenticated ownership rules, and also allows the
-- server upload route to insert video metadata with the Supabase service role.

alter table public.videos enable row level security;

alter table public.videos
add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists videos_user_id_idx on public.videos (user_id);

drop policy if exists "Authenticated users can insert own videos" on public.videos;
drop policy if exists "Music Data Base authenticated insert video metadata" on public.videos;
drop policy if exists "Music Data Base authenticated update own videos" on public.videos;
drop policy if exists "Music Data Base authenticated delete own videos" on public.videos;
drop policy if exists "Music Data Base service role manages videos" on public.videos;

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

create policy "Music Data Base service role manages videos"
on public.videos
for all
to service_role
using (true)
with check (true);

grant select on public.videos to anon, authenticated;
grant insert, update, delete on public.videos to authenticated;
grant all on public.videos to service_role;

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
  and tablename = 'videos'
order by policyname;
