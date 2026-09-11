-- Align creator upload RLS with lib/resolved-account-role.ts:
-- profiles.account_type is primary; stale user_roles are ignored for listener profiles.

create or replace function public.can_upload_creator_content(check_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_account_type text := '';
  v_is_admin boolean := false;
  v_primary_role text := 'listener';
  v_role text;
  v_normalized text;
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

  if v_account_type in ('artist', 'founding_artist', 'artist_pro', 'creator') then
    v_primary_role := 'artist';
  elsif v_account_type in ('producer', 'founding_producer', 'producer_pro') then
    v_primary_role := 'producer';
  else
    v_primary_role := 'listener';
  end if;

  if v_primary_role in ('artist', 'producer') then
    return true;
  end if;

  for v_role in
    select lower(trim(role))
    from public.user_roles
    where user_id = check_user_id
      and status = 'active'
  loop
    if v_role in ('admin', 'founding_artist', 'artist_pro', 'creator') then
      v_normalized := 'artist';
    elsif v_role in ('founding_producer', 'producer_pro') then
      v_normalized := 'producer';
    elsif v_role = 'artist' then
      v_normalized := 'artist';
    elsif v_role = 'producer' then
      v_normalized := 'producer';
    elsif v_role = 'admin' then
      v_normalized := 'admin';
    else
      v_normalized := 'listener';
    end if;

    if v_primary_role = 'listener'
       and v_normalized in ('artist', 'producer', 'admin') then
      continue;
    end if;

    if v_normalized in ('artist', 'producer', 'admin') then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.can_create_ringtones(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.can_upload_creator_content(check_user_id);
$$;

grant execute on function public.can_upload_creator_content(uuid) to authenticated, service_role;
grant execute on function public.can_create_ringtones(uuid) to authenticated, service_role;

drop policy if exists owners_insert on public.songs;
create policy owners_insert on public.songs
  for insert
  to authenticated
  with check (
    user_id::text = auth.uid()::text
    and public.can_upload_creator_content(auth.uid())
  );

drop policy if exists owners_insert on public.videos;
create policy owners_insert on public.videos
  for insert
  to authenticated
  with check (
    user_id::text = auth.uid()::text
    and public.can_upload_creator_content(auth.uid())
  );
