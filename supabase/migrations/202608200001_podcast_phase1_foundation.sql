-- Podcast Phase 1 foundation: shows, audio/video episodes, saving, recent playback, and RLS.
-- Additive only: existing song, video, album, ringtone, queue, auth, and billing data are unchanged.

create extension if not exists pgcrypto;

create or replace function public.can_create_podcasts(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    check_user_id is not null
    and (
      public.is_platform_admin(check_user_id)
      or exists (
        select 1
        from public.profiles
        where (id = check_user_id or user_id = check_user_id)
          and (
            is_admin = true
            or lower(coalesce(account_type, '')) in ('admin', 'artist', 'producer', 'creator')
          )
      )
    );
$$;

create or replace function public.touch_podcast_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

grant execute on function public.can_create_podcasts(uuid) to authenticated, service_role;

create table if not exists public.podcast_shows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  cover_image_url text not null default '',
  cover_storage_path text not null default ''
    check (cover_storage_path = '' or split_part(cover_storage_path, '/', 1) = user_id::text),
  category text not null default 'Podcast' check (char_length(category) <= 100),
  language_code text not null default 'en' check (char_length(language_code) between 2 and 20),
  explicit_content boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references public.podcast_shows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 8000),
  episode_number integer not null check (episode_number >= 1),
  season_number integer null check (season_number is null or season_number >= 1),
  episode_type text not null check (episode_type in ('audio', 'video')),
  media_url text not null default '',
  storage_path text not null default ''
    check (storage_path = '' or split_part(storage_path, '/', 1) = user_id::text),
  artwork_url text not null default '',
  artwork_storage_path text not null default ''
    check (artwork_storage_path = '' or split_part(artwork_storage_path, '/', 1) = user_id::text),
  thumbnail_url text not null default '',
  duration_seconds double precision null
    check (duration_seconds is null or duration_seconds >= 0),
  file_name text not null default '',
  file_size bigint null check (file_size is null or file_size >= 0),
  mime_type text not null default '',
  container text not null default '',
  video_codec text not null default '',
  audio_codec text not null default '',
  mobile_compatible boolean null,
  compatibility_status text not null default '',
  compatibility_reason text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'published', 'archived')),
  play_count bigint not null default 0 check (play_count >= 0),
  view_count bigint not null default 0 check (view_count >= 0),
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint podcast_episodes_show_owner_fk
    foreign key (podcast_id, user_id)
    references public.podcast_shows(id, user_id)
    on delete cascade
);

create unique index if not exists podcast_episodes_number_uidx
  on public.podcast_episodes (podcast_id, coalesce(season_number, 0), episode_number);
create unique index if not exists podcast_shows_cover_storage_uidx
  on public.podcast_shows (cover_storage_path)
  where cover_storage_path <> '';
create unique index if not exists podcast_episodes_media_storage_uidx
  on public.podcast_episodes (storage_path)
  where storage_path <> '';
create unique index if not exists podcast_episodes_artwork_storage_uidx
  on public.podcast_episodes (artwork_storage_path)
  where artwork_storage_path <> '';
create index if not exists podcast_shows_user_id_idx
  on public.podcast_shows (user_id);
create index if not exists podcast_shows_public_idx
  on public.podcast_shows (status, published_at desc nulls last)
  where status = 'published';
create index if not exists podcast_episodes_podcast_id_idx
  on public.podcast_episodes (podcast_id, published_at desc nulls last);
create index if not exists podcast_episodes_user_id_idx
  on public.podcast_episodes (user_id);
create index if not exists podcast_episodes_public_idx
  on public.podcast_episodes (episode_type, status, published_at desc nulls last)
  where status = 'published';

drop trigger if exists podcast_shows_touch_updated_at on public.podcast_shows;
create trigger podcast_shows_touch_updated_at
before update on public.podcast_shows
for each row execute function public.touch_podcast_updated_at();

drop trigger if exists podcast_episodes_touch_updated_at on public.podcast_episodes;
create trigger podcast_episodes_touch_updated_at
before update on public.podcast_episodes
for each row execute function public.touch_podcast_updated_at();

create or replace function public.increment_podcast_episode_metric(
  target_episode_id uuid,
  metric_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if metric_name not in ('play_count', 'view_count') then
    raise exception 'unsupported podcast metric';
  end if;

  update public.podcast_episodes
  set
    play_count = case when metric_name = 'play_count' then play_count + 1 else play_count end,
    view_count = case when metric_name = 'view_count' then view_count + 1 else view_count end
  where id = target_episode_id
    and status = 'published';
end;
$$;

revoke all on function public.increment_podcast_episode_metric(uuid, text) from public, anon, authenticated;
grant execute on function public.increment_podcast_episode_metric(uuid, text) to service_role;

alter table public.podcast_shows enable row level security;
alter table public.podcast_episodes enable row level security;

revoke all privileges on table public.podcast_shows from anon;
revoke all privileges on table public.podcast_episodes from anon;
revoke insert, update, delete, truncate, references, trigger on table public.podcast_shows from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.podcast_episodes from authenticated;
grant select on table public.podcast_shows to anon;
grant select on table public.podcast_episodes to anon;
grant select on table public.podcast_shows to authenticated;
grant select on table public.podcast_episodes to authenticated;
grant all privileges on table public.podcast_shows to service_role;
grant all privileges on table public.podcast_episodes to service_role;

drop policy if exists platform_admin_full_access on public.podcast_shows;
create policy platform_admin_full_access
on public.podcast_shows for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists podcast_shows_public_read on public.podcast_shows;
create policy podcast_shows_public_read
on public.podcast_shows for select to anon, authenticated
using (status = 'published');

drop policy if exists podcast_shows_owner_read on public.podcast_shows;
create policy podcast_shows_owner_read
on public.podcast_shows for select to authenticated
using (user_id = auth.uid());

drop policy if exists podcast_shows_owner_insert on public.podcast_shows;
create policy podcast_shows_owner_insert
on public.podcast_shows for insert to authenticated
with check (user_id = auth.uid() and public.can_create_podcasts(auth.uid()));

drop policy if exists podcast_shows_owner_update on public.podcast_shows;
create policy podcast_shows_owner_update
on public.podcast_shows for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.can_create_podcasts(auth.uid()));

drop policy if exists podcast_shows_owner_delete on public.podcast_shows;
create policy podcast_shows_owner_delete
on public.podcast_shows for delete to authenticated
using (user_id = auth.uid() and public.can_create_podcasts(auth.uid()));

drop policy if exists platform_admin_full_access on public.podcast_episodes;
create policy platform_admin_full_access
on public.podcast_episodes for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists podcast_episodes_public_read on public.podcast_episodes;
create policy podcast_episodes_public_read
on public.podcast_episodes for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1
    from public.podcast_shows s
    where s.id = podcast_id and s.status = 'published'
  )
);

drop policy if exists podcast_episodes_owner_read on public.podcast_episodes;
create policy podcast_episodes_owner_read
on public.podcast_episodes for select to authenticated
using (user_id = auth.uid());

drop policy if exists podcast_episodes_owner_insert on public.podcast_episodes;
create policy podcast_episodes_owner_insert
on public.podcast_episodes for insert to authenticated
with check (
  user_id = auth.uid()
  and public.can_create_podcasts(auth.uid())
  and exists (
    select 1 from public.podcast_shows s
    where s.id = podcast_id and s.user_id = auth.uid()
  )
);

drop policy if exists podcast_episodes_owner_update on public.podcast_episodes;
create policy podcast_episodes_owner_update
on public.podcast_episodes for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.can_create_podcasts(auth.uid())
  and exists (
    select 1 from public.podcast_shows s
    where s.id = podcast_id and s.user_id = auth.uid()
  )
);

drop policy if exists podcast_episodes_owner_delete on public.podcast_episodes;
create policy podcast_episodes_owner_delete
on public.podcast_episodes for delete to authenticated
using (user_id = auth.uid() and public.can_create_podcasts(auth.uid()));

-- Reuse the canonical library and recent-playback persistence systems.
alter table public.library_saves drop constraint if exists library_saves_item_type_check;
alter table public.library_saves
  add constraint library_saves_item_type_check
  check (item_type in ('song', 'video', 'album', 'podcast_show', 'podcast_episode'));

alter table public.user_recently_played
  drop constraint if exists user_recently_played_media_type_check;
alter table public.user_recently_played
  add constraint user_recently_played_media_type_check
  check (media_type in ('song', 'video', 'beat', 'album', 'ringtone', 'podcast_episode'));

notify pgrst, 'reload schema';
