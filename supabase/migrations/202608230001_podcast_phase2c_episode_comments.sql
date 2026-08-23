-- Podcast Phase 2C: episode comments + duplicate comment-report prevention.
-- Additive only. Reuses public.moderation_reports. Does not alter music comments.

create table if not exists public.podcast_episode_comments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.podcast_episodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint podcast_episode_comments_body_not_blank check (length(btrim(body)) > 0)
);

create index if not exists podcast_episode_comments_episode_created_idx
  on public.podcast_episode_comments (episode_id, created_at desc);
create index if not exists podcast_episode_comments_user_id_idx
  on public.podcast_episode_comments (user_id);

drop trigger if exists podcast_episode_comments_touch_updated_at on public.podcast_episode_comments;
create trigger podcast_episode_comments_touch_updated_at
before update on public.podcast_episode_comments
for each row execute function public.touch_podcast_updated_at();

alter table public.podcast_episode_comments enable row level security;

revoke all privileges on table public.podcast_episode_comments from anon;
revoke insert, update, delete, truncate, references, trigger on table public.podcast_episode_comments from authenticated;
grant select on table public.podcast_episode_comments to anon;
grant select on table public.podcast_episode_comments to authenticated;
grant all privileges on table public.podcast_episode_comments to service_role;

drop policy if exists platform_admin_full_access on public.podcast_episode_comments;
create policy platform_admin_full_access
on public.podcast_episode_comments for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists podcast_episode_comments_public_read on public.podcast_episode_comments;
create policy podcast_episode_comments_public_read
on public.podcast_episode_comments for select to anon, authenticated
using (true);

create unique index if not exists moderation_reports_comment_reporter_uidx
  on public.moderation_reports (reporter_id, item_type, item_id)
  where item_type = 'comment' and reporter_id is not null;

notify pgrst, 'reload schema';
