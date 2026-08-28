-- Podcast Phase 2H: per-show follows, isolated from creator user_follows.
-- Additive only: existing song, video, album, ringtone, queue, auth, billing, and user_follows data are unchanged.

create table if not exists public.podcast_show_follows (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.podcast_shows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (show_id, user_id)
);

create index if not exists podcast_show_follows_show_id_idx
  on public.podcast_show_follows (show_id);
create index if not exists podcast_show_follows_user_id_idx
  on public.podcast_show_follows (user_id);

alter table public.podcast_show_follows enable row level security;

revoke all privileges on table public.podcast_show_follows from anon;
revoke insert, update, delete, truncate, references, trigger on table public.podcast_show_follows from authenticated;
grant select on table public.podcast_show_follows to authenticated;
grant all privileges on table public.podcast_show_follows to service_role;

drop policy if exists platform_admin_full_access on public.podcast_show_follows;
create policy platform_admin_full_access
on public.podcast_show_follows for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists podcast_show_follows_owner_read on public.podcast_show_follows;
create policy podcast_show_follows_owner_read
on public.podcast_show_follows for select to authenticated
using (user_id = auth.uid());

notify pgrst, 'reload schema';
