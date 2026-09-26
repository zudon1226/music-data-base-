-- Founding Artist designation (recognition only; not a role or account_type).
-- Additive. Does not alter Stripe, subscriptions, or founding_members onboarding.

alter table public.profiles
  add column if not exists is_founding_artist boolean not null default false;

alter table public.profiles
  add column if not exists founding_artist_since timestamptz null;

create index if not exists profiles_founding_artist_active_idx
  on public.profiles (founding_artist_since desc nulls last)
  where is_founding_artist = true
    and account_type in ('artist', 'artist_pro');

comment on column public.profiles.is_founding_artist is
  'Recognition badge for Artist accounts; admin-granted only; does not change authorization.';

create or replace function public.protect_profiles_founding_artist_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_founding_artist, false) and not public.is_platform_admin() then
      new.is_founding_artist := false;
      new.founding_artist_since := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (new.is_founding_artist is distinct from old.is_founding_artist
        or new.founding_artist_since is distinct from old.founding_artist_since)
       and not public.is_platform_admin() then
      raise exception 'founding artist designation is admin-only';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profiles_founding_artist_columns on public.profiles;
create trigger protect_profiles_founding_artist_columns
  before insert or update on public.profiles
  for each row
  execute function public.protect_profiles_founding_artist_columns();
