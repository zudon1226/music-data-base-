-- Podcaster creator account type.
-- Additive only: existing listener/artist/producer/admin values are preserved.
-- Podcaster grants Podcast Studio only; can_upload_creator_content (music/video/ringtone) is unchanged
-- and continues to treat podcaster as a non-uploading account type.

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
    'creator_free',
    'artist_pro',
    'producer_pro',
    'admin',
    'founding_artist',
    'founding_producer',
    'podcaster',
    'founding_podcaster'
  ));

alter table public.founding_members drop constraint if exists founding_members_founding_role_check;
alter table public.founding_members
  add constraint founding_members_founding_role_check
  check (founding_role in ('founding_artist', 'founding_producer', 'founding_podcaster'));

alter table public.founding_invites drop constraint if exists founding_invites_intended_role_check;
alter table public.founding_invites
  add constraint founding_invites_intended_role_check
  check (intended_role in ('founding_artist', 'founding_producer', 'founding_podcaster'));

-- Podcaster may create podcasts only after explicit creator approval.
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
      or (
        exists (
          select 1
          from public.profiles
          where (id = check_user_id or user_id = check_user_id)
            and lower(coalesce(account_type, '')) = 'podcaster'
        )
        and exists (
          select 1
          from public.founding_members
          where user_id = check_user_id
            and approval_status = 'approved'
        )
      )
    );
$$;

grant execute on function public.can_create_podcasts(uuid) to authenticated, service_role;
