-- Separate Podcast episode likes from Library saves. Additive only.

create table if not exists public.podcast_episode_likes (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.podcast_episodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (episode_id, user_id)
);

create index if not exists podcast_episode_likes_episode_id_idx
  on public.podcast_episode_likes (episode_id);
create index if not exists podcast_episode_likes_user_id_idx
  on public.podcast_episode_likes (user_id);

alter table public.podcast_episode_likes enable row level security;

revoke all privileges on table public.podcast_episode_likes from anon;
revoke insert, update, delete, truncate, references, trigger on table public.podcast_episode_likes from authenticated;
grant select on table public.podcast_episode_likes to authenticated;
grant all privileges on table public.podcast_episode_likes to service_role;

drop policy if exists platform_admin_full_access on public.podcast_episode_likes;
create policy platform_admin_full_access
on public.podcast_episode_likes for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists podcast_episode_likes_owner_read on public.podcast_episode_likes;
create policy podcast_episode_likes_owner_read
on public.podcast_episode_likes for select to authenticated
using (user_id = auth.uid());

notify pgrst, 'reload schema';
