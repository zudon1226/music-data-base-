-- Video-only Creator account type (distinct from Artist music publisher).
-- Additive: does not convert existing artist/producer accounts.

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in (
    'listener',
    'premium_listener',
    'artist',
    'producer',
    'creator',
    'creator_free',
    'artist_pro',
    'producer_pro',
    'admin',
    'founding_artist',
    'founding_producer',
    'founding_creator',
    'podcaster',
    'founding_podcaster'
  ));

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check
  check (role in (
    'listener',
    'premium_listener',
    'artist',
    'producer',
    'creator',
    'creator_free',
    'artist_pro',
    'producer_pro',
    'admin',
    'founding_artist',
    'founding_producer',
    'founding_creator',
    'podcaster',
    'founding_podcaster'
  ));

alter table public.founding_members drop constraint if exists founding_members_founding_role_check;
alter table public.founding_members
  add constraint founding_members_founding_role_check
  check (founding_role in ('founding_artist', 'founding_producer', 'founding_podcaster', 'founding_creator'));

alter table public.founding_invites drop constraint if exists founding_invites_intended_role_check;
alter table public.founding_invites
  add constraint founding_invites_intended_role_check
  check (intended_role in ('founding_artist', 'founding_producer', 'founding_podcaster', 'founding_creator'));

create or replace function public.can_upload_music_content(check_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_account_type text := '';
  v_is_admin boolean := false;
  v_approved boolean := false;
begin
  if check_user_id is null then
    return false;
  end if;
  if public.is_platform_admin(check_user_id) then
    return true;
  end if;

  select lower(coalesce(account_type, '')), coalesce(is_admin, false)
  into v_account_type, v_is_admin
  from public.profiles
  where id = check_user_id or user_id = check_user_id
  limit 1;

  if v_is_admin or v_account_type = 'admin' then
    return true;
  end if;

  if v_account_type in ('creator', 'founding_creator', 'creator_free', 'podcaster', 'founding_podcaster', 'listener', 'premium_listener') then
    return false;
  end if;

  select exists (
    select 1 from public.founding_members fm
    where fm.user_id = check_user_id and fm.approval_status = 'approved'
  ) into v_approved;

  if not v_approved then
    return false;
  end if;

  if v_account_type in ('artist', 'founding_artist', 'artist_pro', 'producer', 'founding_producer', 'producer_pro') then
    return true;
  end if;

  return exists (
    select 1 from public.user_roles ur
    where ur.user_id = check_user_id
      and ur.status = 'active'
      and lower(ur.role) in ('artist', 'founding_artist', 'artist_pro', 'producer', 'founding_producer', 'producer_pro', 'admin')
  );
end;
$$;

create or replace function public.can_upload_video_content(check_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_account_type text := '';
  v_is_admin boolean := false;
  v_approved boolean := false;
begin
  if check_user_id is null then
    return false;
  end if;
  if public.is_platform_admin(check_user_id) then
    return true;
  end if;

  select lower(coalesce(account_type, '')), coalesce(is_admin, false)
  into v_account_type, v_is_admin
  from public.profiles
  where id = check_user_id or user_id = check_user_id
  limit 1;

  if v_is_admin or v_account_type = 'admin' then
    return true;
  end if;

  if v_account_type in ('podcaster', 'founding_podcaster', 'listener', 'premium_listener') then
    return false;
  end if;

  select exists (
    select 1 from public.founding_members fm
    where fm.user_id = check_user_id and fm.approval_status = 'approved'
  ) into v_approved;

  if not v_approved then
    return false;
  end if;

  if v_account_type in (
    'artist', 'founding_artist', 'artist_pro',
    'producer', 'founding_producer', 'producer_pro',
    'creator', 'founding_creator'
  ) then
    return true;
  end if;

  return exists (
    select 1 from public.user_roles ur
    where ur.user_id = check_user_id
      and ur.status = 'active'
      and lower(ur.role) in (
        'artist', 'founding_artist', 'artist_pro',
        'producer', 'founding_producer', 'producer_pro',
        'creator', 'founding_creator', 'admin'
      )
  );
end;
$$;

create or replace function public.can_upload_creator_content(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.can_upload_music_content(check_user_id);
$$;

grant execute on function public.can_upload_music_content(uuid) to authenticated, service_role;
grant execute on function public.can_upload_video_content(uuid) to authenticated, service_role;

drop policy if exists owners_insert on public.songs;
create policy owners_insert on public.songs
  for insert to authenticated
  with check (
    user_id::text = auth.uid()::text
    and public.can_upload_music_content(auth.uid())
  );

drop policy if exists owners_insert on public.videos;
create policy owners_insert on public.videos
  for insert to authenticated
  with check (
    user_id::text = auth.uid()::text
    and public.can_upload_video_content(auth.uid())
  );

drop policy if exists app_songs_insert_music_creator on storage.objects;
create policy app_songs_insert_music_creator
  on storage.objects as restrictive
  for insert to authenticated
  with check (
    bucket_id <> 'songs'
    or public.can_upload_music_content(auth.uid())
  );

drop policy if exists app_videos_insert_video_creator on storage.objects;
create policy app_videos_insert_video_creator
  on storage.objects as restrictive
  for insert to authenticated
  with check (
    bucket_id <> 'videos'
    or public.can_upload_video_content(auth.uid())
  );

drop policy if exists app_producer_beats_insert_music on storage.objects;
create policy app_producer_beats_insert_music
  on storage.objects as restrictive
  for insert to authenticated
  with check (
    bucket_id <> 'producer-beats'
    or public.can_upload_music_content(auth.uid())
  );