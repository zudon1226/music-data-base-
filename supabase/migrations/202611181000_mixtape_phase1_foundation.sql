-- Mixtape Phase 1 foundation: isolated catalog, engagement, categories, reports, and RLS.
-- Additive only: does not alter songs, videos, albums, playlists, podcasts, or billing tables.
-- Object keys in bucket `mixtapes` use: {user_id}/{mixtape_id}/cover.ext and {user_id}/{mixtape_id}/tracks/{file}
-- Playback: service_role APIs issue mixtape_playback_sessions; qualified plays dedupe on (track_id, user_id, playback_session_id).
-- Client listen hints do not prove playback — advance_mixtape_playback_session credits server wall-clock time since last_progress_at only.

create extension if not exists pgcrypto;

-- DJ creator roles for mixtape eligibility (artists/producers already exist).
alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in (
    'listener',
    'premium_listener',
    'artist',
    'producer',
    'creator_free',
    'artist_pro',
    'producer_pro',
    'admin',
    'founding_artist',
    'founding_producer',
    'podcaster',
    'founding_podcaster',
    'dj',
    'founding_dj'
  ));

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check
  check (role in (
    'listener',
    'premium_listener',
    'artist',
    'producer',
    'creator_free',
    'artist_pro',
    'producer_pro',
    'admin',
    'founding_artist',
    'founding_producer',
    'podcaster',
    'founding_podcaster',
    'dj',
    'founding_dj'
  ));

create or replace function public.touch_mixtape_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Verified artists/producers (founding-approved) or approved DJs may create mixtapes.
create or replace function public.can_create_mixtapes(check_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_approved boolean := false;
begin
  if check_user_id is null then
    return false;
  end if;

  if public.is_platform_admin(check_user_id) then
    return true;
  end if;

  if public.can_upload_creator_content(check_user_id) then
    return true;
  end if;

  select exists (
    select 1
    from public.founding_members fm
    where fm.user_id = check_user_id
      and fm.approval_status = 'approved'
  )
  into v_approved;

  if not v_approved then
    return false;
  end if;

  if exists (
    select 1
    from public.profiles p
    where (p.id = check_user_id or p.user_id = check_user_id)
      and lower(coalesce(p.account_type, '')) in ('dj', 'founding_dj')
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.user_roles ur
    where ur.user_id = check_user_id
      and ur.status = 'active'
      and lower(trim(ur.role)) in ('dj', 'founding_dj')
  ) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.can_create_mixtapes(uuid) to authenticated, service_role;

create table if not exists public.mixtape_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(trim(slug)) between 1 and 80),
  label text not null check (char_length(trim(label)) between 1 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mixtapes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 8000),
  category_id uuid null references public.mixtape_categories(id) on delete set null,
  genre text not null default '' check (char_length(genre) <= 100),
  explicit_content boolean not null default false,
  cover_image_url text not null default '',
  cover_storage_path text not null default ''
    check (
      cover_storage_path = ''
      or (
        split_part(cover_storage_path, '/', 1) = user_id::text
        and split_part(cover_storage_path, '/', 2) = id::text
      )
    ),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  moderation_state text not null default 'clear'
    check (moderation_state in ('clear', 'takedown_pending', 'removed')),
  is_featured boolean not null default false,
  release_date date null,
  published_at timestamptz null,
  play_count bigint not null default 0 check (play_count >= 0),
  favorite_count bigint not null default 0 check (favorite_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.mixtape_tracks (
  id uuid primary key default gen_random_uuid(),
  mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 1),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  storage_path text not null default ''
    check (
      storage_path = ''
      or (
        split_part(storage_path, '/', 1) = user_id::text
        and split_part(storage_path, '/', 2) = mixtape_id::text
        and split_part(storage_path, '/', 3) = 'tracks'
      )
    ),
  media_url text not null default '',
  file_name text not null default '',
  file_size bigint null check (file_size is null or file_size >= 0),
  mime_type text not null default '',
  duration_seconds double precision null check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'published', 'archived')),
  moderation_state text not null default 'clear'
    check (moderation_state in ('clear', 'takedown_pending', 'removed')),
  play_count bigint not null default 0 check (play_count >= 0),
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mixtape_tracks_owner_fk
    foreign key (mixtape_id, user_id)
    references public.mixtapes(id, user_id)
    on delete cascade,
  unique (mixtape_id, position),
  unique (id, mixtape_id, user_id)
);

create unique index if not exists mixtapes_cover_storage_uidx
  on public.mixtapes (cover_storage_path)
  where cover_storage_path <> '';
create unique index if not exists mixtape_tracks_storage_uidx
  on public.mixtape_tracks (storage_path)
  where storage_path <> '';
create index if not exists mixtapes_user_id_idx on public.mixtapes (user_id);
create index if not exists mixtapes_public_idx
  on public.mixtapes (status, published_at desc nulls last, release_date desc nulls last)
  where status = 'published' and moderation_state = 'clear';
create index if not exists mixtapes_category_idx on public.mixtapes (category_id);
create index if not exists mixtapes_featured_idx
  on public.mixtapes (is_featured, published_at desc)
  where status = 'published' and is_featured = true;
create index if not exists mixtape_tracks_mixtape_id_idx
  on public.mixtape_tracks (mixtape_id, position);
create index if not exists mixtape_tracks_public_idx
  on public.mixtape_tracks (mixtape_id, status, position)
  where status = 'published' and moderation_state = 'clear';
create index if not exists mixtapes_moderation_hold_idx
  on public.mixtapes (moderation_state)
  where moderation_state <> 'clear';
create index if not exists mixtape_tracks_moderation_hold_idx
  on public.mixtape_tracks (moderation_state)
  where moderation_state <> 'clear';

create table if not exists public.mixtape_favorites (
  id uuid primary key default gen_random_uuid(),
  mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (mixtape_id, user_id)
);

create index if not exists mixtape_favorites_user_id_idx on public.mixtape_favorites (user_id);
create index if not exists mixtape_favorites_mixtape_id_idx on public.mixtape_favorites (mixtape_id);

-- Server-issued playback sessions bind listener identity and monotonic progress (API/service_role only).
create table if not exists public.mixtape_playback_sessions (
  id uuid primary key default gen_random_uuid(),
  mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
  track_id uuid not null references public.mixtape_tracks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listened_seconds double precision not null default 0 check (listened_seconds >= 0),
  status text not null default 'active'
    check (status in ('active', 'qualified', 'expired')),
  expires_at timestamptz not null,
  qualified_at timestamptz null,
  last_progress_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mixtape_playback_sessions_user_track_idx
  on public.mixtape_playback_sessions (user_id, track_id, created_at desc);
create index if not exists mixtape_playback_sessions_active_idx
  on public.mixtape_playback_sessions (track_id, status, expires_at)
  where status = 'active';

create table if not exists public.mixtape_plays (
  id uuid primary key default gen_random_uuid(),
  mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
  track_id uuid not null references public.mixtape_tracks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  playback_session_id uuid not null references public.mixtape_playback_sessions(id) on delete cascade,
  listened_seconds double precision not null check (listened_seconds >= 0),
  qualified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (track_id, user_id, playback_session_id)
);

create index if not exists mixtape_plays_track_id_idx on public.mixtape_plays (track_id, created_at desc);
create index if not exists mixtape_plays_mixtape_id_idx on public.mixtape_plays (mixtape_id, created_at desc);
create index if not exists mixtape_plays_user_id_idx on public.mixtape_plays (user_id, created_at desc);
create index if not exists mixtape_plays_playback_session_id_idx on public.mixtape_plays (playback_session_id);

create table if not exists public.mixtape_reports (
  id uuid primary key default gen_random_uuid(),
  mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason_code text not null default 'other' check (char_length(reason_code) <= 80),
  details text not null default '' check (char_length(details) <= 4000),
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mixtape_reports_mixtape_id_idx on public.mixtape_reports (mixtape_id);
create index if not exists mixtape_reports_status_idx on public.mixtape_reports (status, created_at desc);

drop trigger if exists mixtape_categories_touch_updated_at on public.mixtape_categories;
create trigger mixtape_categories_touch_updated_at
before update on public.mixtape_categories
for each row execute function public.touch_mixtape_updated_at();

drop trigger if exists mixtapes_touch_updated_at on public.mixtapes;
create trigger mixtapes_touch_updated_at
before update on public.mixtapes
for each row execute function public.touch_mixtape_updated_at();

drop trigger if exists mixtape_tracks_touch_updated_at on public.mixtape_tracks;
create trigger mixtape_tracks_touch_updated_at
before update on public.mixtape_tracks
for each row execute function public.touch_mixtape_updated_at();

drop trigger if exists mixtape_reports_touch_updated_at on public.mixtape_reports;
create trigger mixtape_reports_touch_updated_at
before update on public.mixtape_reports
for each row execute function public.touch_mixtape_updated_at();

drop trigger if exists mixtape_playback_sessions_touch_updated_at on public.mixtape_playback_sessions;
create trigger mixtape_playback_sessions_touch_updated_at
before update on public.mixtape_playback_sessions
for each row execute function public.touch_mixtape_updated_at();

create or replace function public.enforce_mixtape_track_publish_duration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'published' and coalesce(new.duration_seconds, 0) <= 0 then
    raise exception 'mixtape_tracks require positive duration_seconds before publish';
  end if;
  return new;
end;
$$;

drop trigger if exists mixtape_tracks_enforce_publish_duration on public.mixtape_tracks;
create trigger mixtape_tracks_enforce_publish_duration
before insert or update of status, duration_seconds on public.mixtape_tracks
for each row execute function public.enforce_mixtape_track_publish_duration();

-- Play counting: 30 seconds minimum, or 25% of track duration when shorter than 30 seconds (strict ratio, no 1s floor).
create or replace function public.mixtape_play_qualification_threshold(duration_seconds double precision)
returns double precision
language sql
immutable
as $$
  select case
    when coalesce(duration_seconds, 0) <= 0 then 30::double precision
    when duration_seconds < 30 then 0.25 * duration_seconds
    else 30::double precision
  end;
$$;

-- Upper bound on wall-clock seconds credited per advance tick (mitigates idle tab gaps between heartbeats).
create or replace function public.mixtape_playback_session_max_tick_seconds()
returns double precision
language sql
immutable
as $$
  select 30::double precision;
$$;

create or replace function public.begin_mixtape_playback_session(
  target_track_id uuid,
  caller_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mixtape_id uuid;
  v_duration double precision;
  v_session_id uuid;
begin
  if target_track_id is null or caller_user_id is null then
    return null;
  end if;

  select t.mixtape_id, t.duration_seconds
  into v_mixtape_id, v_duration
  from public.mixtape_tracks t
  inner join public.mixtapes m on m.id = t.mixtape_id
  where t.id = target_track_id
    and t.status = 'published'
    and t.moderation_state = 'clear'
    and m.status = 'published'
    and m.moderation_state = 'clear'
    and coalesce(t.duration_seconds, 0) > 0;

  if v_mixtape_id is null then
    return null;
  end if;

  insert into public.mixtape_playback_sessions (
    mixtape_id,
    track_id,
    user_id,
    expires_at,
    last_progress_at
  )
  values (
    v_mixtape_id,
    target_track_id,
    caller_user_id,
    now() + interval '4 hours',
    clock_timestamp()
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.advance_mixtape_playback_session(
  playback_session_id uuid,
  caller_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_duration double precision;
  v_current double precision;
  v_last_progress_at timestamptz;
  v_wall_elapsed double precision;
  v_increment double precision;
  v_next double precision;
begin
  if playback_session_id is null or caller_user_id is null then
    return false;
  end if;

  select
    coalesce(t.duration_seconds, 0),
    coalesce(s.listened_seconds, 0),
    coalesce(s.last_progress_at, s.created_at)
  into v_duration, v_current, v_last_progress_at
  from public.mixtape_playback_sessions s
  inner join public.mixtape_tracks t on t.id = s.track_id
  inner join public.mixtapes m on m.id = s.mixtape_id
  where s.id = playback_session_id
    and s.user_id = caller_user_id
    and s.status = 'active'
    and s.expires_at > now()
    and t.status = 'published'
    and t.moderation_state = 'clear'
    and m.status = 'published'
    and m.moderation_state = 'clear'
    and coalesce(t.duration_seconds, 0) > 0
  for update of s;

  if v_duration is null or v_duration <= 0 then
    return false;
  end if;

  v_wall_elapsed := greatest(
    0,
    extract(epoch from (v_now - v_last_progress_at))
  );
  v_increment := least(
    v_wall_elapsed,
    public.mixtape_playback_session_max_tick_seconds()
  );
  v_next := least(v_current + v_increment, v_duration);

  update public.mixtape_playback_sessions
  set
    listened_seconds = v_next,
    last_progress_at = v_now,
    updated_at = now()
  where id = playback_session_id
    and status = 'active';

  return found;
end;
$$;

create or replace function public.record_mixtape_qualified_play(
  playback_session_id uuid,
  caller_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.mixtape_playback_sessions%rowtype;
  v_duration double precision;
  v_threshold double precision;
  v_effective_seconds double precision;
  v_play_id uuid;
begin
  if playback_session_id is null or caller_user_id is null then
    return false;
  end if;

  select s.*
  into v_session
  from public.mixtape_playback_sessions s
  inner join public.mixtape_tracks t on t.id = s.track_id
  inner join public.mixtapes m on m.id = s.mixtape_id
  where s.id = playback_session_id
    and s.user_id = caller_user_id
    and s.expires_at > now()
    and t.status = 'published'
    and t.moderation_state = 'clear'
    and m.status = 'published'
    and m.moderation_state = 'clear'
  for update of s;

  if v_session.id is null or v_session.user_id <> caller_user_id then
    return false;
  end if;

  if v_session.status = 'qualified' then
    return false;
  end if;

  select t.duration_seconds
  into v_duration
  from public.mixtape_tracks t
  where t.id = v_session.track_id;

  if coalesce(v_duration, 0) <= 0 then
    return false;
  end if;

  v_threshold := public.mixtape_play_qualification_threshold(v_duration);
  v_effective_seconds := least(greatest(0, coalesce(v_session.listened_seconds, 0)), v_duration);

  if v_effective_seconds < v_threshold then
    return false;
  end if;

  update public.mixtape_playback_sessions
  set
    status = 'qualified',
    qualified_at = now(),
    listened_seconds = v_effective_seconds,
    updated_at = now()
  where id = playback_session_id
    and status = 'active';

  if not found then
    return false;
  end if;

  insert into public.mixtape_plays (
    mixtape_id,
    track_id,
    user_id,
    playback_session_id,
    listened_seconds,
    qualified
  )
  values (
    v_session.mixtape_id,
    v_session.track_id,
    v_session.user_id,
    v_session.id,
    v_effective_seconds,
    true
  )
  on conflict on constraint mixtape_plays_track_id_user_id_playback_session_id_key do nothing
  returning id into v_play_id;

  if v_play_id is null then
    return false;
  end if;

  update public.mixtape_tracks
  set play_count = play_count + 1
  where id = v_session.track_id;

  update public.mixtapes
  set play_count = play_count + 1
  where id = v_session.mixtape_id;

  return true;
end;
$$;

revoke all on function public.mixtape_play_qualification_threshold(double precision) from public, anon;
grant execute on function public.mixtape_play_qualification_threshold(double precision) to authenticated, service_role;

revoke all on function public.mixtape_playback_session_max_tick_seconds() from public, anon;
grant execute on function public.mixtape_playback_session_max_tick_seconds() to service_role;

revoke all on function public.begin_mixtape_playback_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_mixtape_playback_session(uuid, uuid) to service_role;

revoke all on function public.advance_mixtape_playback_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.advance_mixtape_playback_session(uuid, uuid) to service_role;

revoke all on function public.record_mixtape_qualified_play(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_mixtape_qualified_play(uuid, uuid) to service_role;

insert into public.mixtape_categories (slug, label, sort_order)
values
  ('hip-hop', 'Hip-Hop', 10),
  ('r-and-b', 'R&B', 20),
  ('dj-mix', 'DJ Mix', 30),
  ('trap', 'Trap', 40),
  ('drill', 'Drill', 50),
  ('soul', 'Soul', 60),
  ('experimental', 'Experimental', 70),
  ('other', 'Other', 100)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: catalog mutations via service_role APIs only; guests read published only.
-- ---------------------------------------------------------------------------

alter table public.mixtape_categories enable row level security;
alter table public.mixtapes enable row level security;
alter table public.mixtape_tracks enable row level security;
alter table public.mixtape_favorites enable row level security;
alter table public.mixtape_playback_sessions enable row level security;
alter table public.mixtape_plays enable row level security;
alter table public.mixtape_reports enable row level security;

revoke all privileges on table public.mixtape_categories from anon;
revoke insert, update, delete, truncate, references, trigger on table public.mixtape_categories from authenticated;
grant select on table public.mixtape_categories to anon, authenticated;
grant all privileges on table public.mixtape_categories to service_role;

revoke all privileges on table public.mixtapes from anon;
revoke insert, update, delete, truncate, references, trigger on table public.mixtapes from authenticated;
grant select on table public.mixtapes to anon, authenticated;
grant all privileges on table public.mixtapes to service_role;

revoke all privileges on table public.mixtape_tracks from anon;
revoke insert, update, delete, truncate, references, trigger on table public.mixtape_tracks from authenticated;
grant select on table public.mixtape_tracks to anon, authenticated;
grant all privileges on table public.mixtape_tracks to service_role;

revoke all privileges on table public.mixtape_favorites from anon;
revoke insert, update, delete, truncate, references, trigger on table public.mixtape_favorites from authenticated;
grant select on table public.mixtape_favorites to authenticated;
grant all privileges on table public.mixtape_favorites to service_role;

revoke all privileges on table public.mixtape_playback_sessions from anon, authenticated;
grant all privileges on table public.mixtape_playback_sessions to service_role;

revoke all privileges on table public.mixtape_plays from anon, authenticated;
grant all privileges on table public.mixtape_plays to service_role;

revoke all privileges on table public.mixtape_reports from anon;
revoke insert, update, delete, truncate, references, trigger on table public.mixtape_reports from authenticated;
grant select on table public.mixtape_reports to authenticated;
grant all privileges on table public.mixtape_reports to service_role;

drop policy if exists platform_admin_full_access on public.mixtape_categories;
create policy platform_admin_full_access
on public.mixtape_categories for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists mixtape_categories_public_read on public.mixtape_categories;
create policy mixtape_categories_public_read
on public.mixtape_categories for select to anon, authenticated
using (is_active = true);

drop policy if exists platform_admin_full_access on public.mixtapes;
create policy platform_admin_full_access
on public.mixtapes for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists mixtapes_public_read on public.mixtapes;
create policy mixtapes_public_read
on public.mixtapes for select to anon, authenticated
using (
  status = 'published'
  and moderation_state = 'clear'
);

drop policy if exists mixtapes_owner_read on public.mixtapes;
create policy mixtapes_owner_read
on public.mixtapes for select to authenticated
using (user_id = auth.uid());

drop policy if exists platform_admin_full_access on public.mixtape_tracks;
create policy platform_admin_full_access
on public.mixtape_tracks for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists mixtape_tracks_public_read on public.mixtape_tracks;
create policy mixtape_tracks_public_read
on public.mixtape_tracks for select to anon, authenticated
using (
  status = 'published'
  and moderation_state = 'clear'
  and exists (
    select 1
    from public.mixtapes m
    where m.id = mixtape_id
      and m.status = 'published'
      and m.moderation_state = 'clear'
  )
);

drop policy if exists mixtape_tracks_owner_read on public.mixtape_tracks;
create policy mixtape_tracks_owner_read
on public.mixtape_tracks for select to authenticated
using (user_id = auth.uid());

drop policy if exists platform_admin_full_access on public.mixtape_favorites;
create policy platform_admin_full_access
on public.mixtape_favorites for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists mixtape_favorites_owner_read on public.mixtape_favorites;
create policy mixtape_favorites_owner_read
on public.mixtape_favorites for select to authenticated
using (user_id = auth.uid());

drop policy if exists platform_admin_full_access on public.mixtape_reports;
create policy platform_admin_full_access
on public.mixtape_reports for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists mixtape_reports_owner_read on public.mixtape_reports;
create policy mixtape_reports_owner_read
on public.mixtape_reports for select to authenticated
using (reporter_user_id = auth.uid());

notify pgrst, 'reload schema';