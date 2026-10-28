-- Privilege boundary for profiles and admin roles.
-- Row policies do not restrict columns. Authenticated clients keep ordinary
-- profile edits and lose the ability to write admin flags, account type,
-- identity, or admin role rows. Signup and owner tools use service_role.

create or replace function public.prevent_client_profile_privilege_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) then
      raise exception 'is_admin cannot be set by client insert';
    end if;
    if coalesce(new.account_type, 'listener') is distinct from 'listener' then
      raise exception 'account_type cannot be set by client insert';
    end if;
    new.is_admin := false;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin cannot be changed by client update';
    end if;
    if new.account_type is distinct from old.account_type then
      raise exception 'account_type cannot be changed by client update';
    end if;
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
      raise exception 'profile identity cannot be changed by client update';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_client_account_type_change on public.profiles;
drop trigger if exists prevent_client_profile_privilege_change on public.profiles;
create trigger prevent_client_profile_privilege_change
  before insert or update on public.profiles
  for each row
  execute function public.prevent_client_profile_privilege_change();

revoke insert, update, delete on table public.profiles from public;
revoke insert, update, delete on table public.profiles from anon;
revoke insert, update, delete on table public.profiles from authenticated;

grant insert (
  id,
  user_id,
  display_name,
  username,
  avatar_url,
  banner_url,
  bio,
  website,
  social_links,
  city,
  country,
  public_slug,
  preferred_language,
  created_at,
  updated_at
) on table public.profiles to authenticated;

grant update (
  display_name,
  username,
  avatar_url,
  banner_url,
  bio,
  website,
  social_links,
  city,
  country,
  public_slug,
  preferred_language,
  updated_at
) on table public.profiles to authenticated;

grant select on table public.profiles to authenticated;

create or replace function public.prevent_client_admin_role_grant()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.role = 'admin' then
    raise exception 'admin role cannot be granted by client insert';
  end if;

  if tg_op = 'UPDATE' and (
    new.role = 'admin'
    or old.role = 'admin'
  ) and (
    new.role is distinct from old.role
    or new.status is distinct from old.status
  ) then
    raise exception 'admin role cannot be changed by client update';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_client_admin_role_grant on public.user_roles;
create trigger prevent_client_admin_role_grant
  before insert or update on public.user_roles
  for each row
  execute function public.prevent_client_admin_role_grant();

revoke insert, update, delete on table public.user_roles from public;
revoke insert, update, delete on table public.user_roles from anon;
revoke insert, update, delete on table public.user_roles from authenticated;
grant select on table public.user_roles to authenticated;

comment on column public.profiles.is_admin is
  'Service-role only. Authenticated clients have no insert or update privilege on this column.';

notify pgrst, 'reload schema';
