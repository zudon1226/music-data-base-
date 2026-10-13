-- Lock founding_members.social_link signup account-type markers against client tampering.
-- Server signup, legal lock, and approval flows use service_role (same pattern as profiles.account_type).

create or replace function public.has_signup_account_type_marker_prefix(value text)
returns boolean
language sql
immutable
as $$
  select coalesce(trim(value), '') like 'mdb_signup_account_type=%';
$$;

create or replace function public.is_signup_account_type_marker(value text)
returns boolean
language sql
immutable
as $$
  select coalesce(trim(value), '') ~ '^mdb_signup_account_type=(listener|artist|producer|artist_producer|podcaster)$';
$$;

create or replace function public.prevent_client_founding_signup_marker_tamper()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.has_signup_account_type_marker_prefix(new.social_link) then
      raise exception 'signup account type marker cannot be set by client';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if public.has_signup_account_type_marker_prefix(old.social_link)
       and new.social_link is distinct from old.social_link then
      raise exception 'signup account type marker cannot be changed by client';
    end if;
    if public.has_signup_account_type_marker_prefix(new.social_link)
       and not public.has_signup_account_type_marker_prefix(old.social_link) then
      raise exception 'signup account type marker cannot be set by client';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_client_founding_signup_marker_tamper on public.founding_members;
create trigger prevent_client_founding_signup_marker_tamper
  before insert or update on public.founding_members
  for each row
  execute function public.prevent_client_founding_signup_marker_tamper();
