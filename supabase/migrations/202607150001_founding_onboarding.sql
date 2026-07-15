-- Controlled beta onboarding: founding artist/producer invites and approvals.
-- Additive only. Does not weaken existing RLS or storage policies.

create extension if not exists pgcrypto;

-- Extend role enums used by profiles + user_roles.
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
    'founding_producer'
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
    'founding_producer'
  ));

create table if not exists public.founding_invites (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null,
  intended_role text not null check (intended_role in ('founding_artist', 'founding_producer')),
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'revoked')),
  created_by uuid references auth.users(id) on delete set null,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint founding_invites_code_unique unique (invite_code)
);

create index if not exists founding_invites_status_idx
  on public.founding_invites (status, expires_at);

create index if not exists founding_invites_created_by_idx
  on public.founding_invites (created_by, created_at desc);

create table if not exists public.founding_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  founding_role text not null check (founding_role in ('founding_artist', 'founding_producer')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  invite_id uuid references public.founding_invites(id) on delete set null,
  display_name text,
  social_link text,
  profile_image_url text,
  badge_label text not null default 'Founding Member',
  joined_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists founding_members_approval_status_idx
  on public.founding_members (approval_status, joined_at desc);

create index if not exists founding_members_founding_role_idx
  on public.founding_members (founding_role, approval_status);

alter table public.founding_invites enable row level security;
alter table public.founding_members enable row level security;

drop policy if exists founding_invites_admin_all on public.founding_invites;
create policy founding_invites_admin_all
on public.founding_invites
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists founding_members_select_own on public.founding_members;
create policy founding_members_select_own
on public.founding_members
for select
to authenticated
using (auth.uid() = user_id or public.is_platform_admin());

drop policy if exists founding_members_update_own_profile on public.founding_members;
create policy founding_members_update_own_profile
on public.founding_members
for update
to authenticated
using (
  auth.uid() = user_id
  and approval_status = 'approved'
)
with check (
  auth.uid() = user_id
  and approval_status = 'approved'
  and founding_role = founding_role
  and approval_status = approval_status
);

drop policy if exists founding_members_admin_all on public.founding_members;
create policy founding_members_admin_all
on public.founding_members
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select, insert, update, delete on public.founding_invites to authenticated;
grant select, insert, update, delete on public.founding_members to authenticated;
grant all on public.founding_invites to service_role;
grant all on public.founding_members to service_role;
