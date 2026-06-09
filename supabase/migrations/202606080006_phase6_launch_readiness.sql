-- Phase 6 - Public Launch Readiness
-- Additive security, role, audit, backup, and launch checklist foundation.
-- Does not rewrite player, upload, library, album, playlist, marketplace, or revenue logic.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists public_slug text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists launch_notes text;
alter table public.profiles add column if not exists last_seen_at timestamptz;

update public.profiles
set account_type = 'listener'
where account_type is null
   or account_type not in (
    'listener',
    'premium_listener',
    'artist',
    'producer',
    'creator_free',
    'artist_pro',
    'producer_pro',
    'admin'
  );

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
    'admin'
  ));

create unique index if not exists profiles_public_slug_unique_idx
on public.profiles (lower(public_slug))
where public_slug is not null and btrim(public_slug) <> '';

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in (
    'listener',
    'premium_listener',
    'artist',
    'producer',
    'creator_free',
    'artist_pro',
    'producer_pro',
    'admin'
  )),
  status text not null default 'active' check (status in ('active', 'disabled')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists user_roles_user_status_idx
on public.user_roles (user_id, status);

create index if not exists user_roles_role_status_idx
on public.user_roles (role, status);

insert into public.user_roles (user_id, role, status)
select coalesce(user_id, id), account_type, 'active'
from public.profiles
where coalesce(user_id, id) is not null
  and account_type in (
    'listener',
    'premium_listener',
    'artist',
    'producer',
    'creator_free',
    'artist_pro',
    'producer_pro',
    'admin'
  )
on conflict (user_id, role) do nothing;

create or replace function public.is_platform_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role = 'admin'
      and status = 'active'
  )
  or exists (
    select 1
    from public.profiles
    where (id = check_user_id or user_id = check_user_id)
      and (is_admin = true or account_type = 'admin')
  );
$$;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_actor_idx
on public.admin_audit_logs (actor_user_id, created_at desc);

create index if not exists admin_audit_logs_target_idx
on public.admin_audit_logs (target_type, target_id, created_at desc);

create table if not exists public.launch_checklist (
  id uuid primary key default gen_random_uuid(),
  area text not null unique,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'passed', 'blocked')),
  details text,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.launch_checklist (area, status, details)
values
  ('Security/RLS audit', 'pending', 'Confirm every public/private table has intentional policies.'),
  ('User roles and admin permissions', 'pending', 'Confirm admin-only routes and dashboards are guarded server-side.'),
  ('Production environment setup', 'pending', 'Confirm production env vars, auth redirects, and domain settings.'),
  ('Storage bucket policy audit', 'pending', 'Confirm media upload, playback, premium download, and cleanup policies.'),
  ('Error handling and loading states', 'pending', 'Confirm no blank states or production-impacting overlays.'),
  ('Mobile responsive polish', 'pending', 'Confirm mobile, tablet, laptop, and desktop layouts.'),
  ('Public artist/producer profile pages', 'pending', 'Confirm public profile URLs, metadata, and share previews.'),
  ('SEO/social share previews', 'pending', 'Confirm Open Graph and Twitter card metadata.'),
  ('Backup/export routine', 'pending', 'Confirm backup/export route and admin usage.'),
  ('Final launch checklist', 'pending', 'Run final lint, build, API, upload, playback, and dashboard checks.')
on conflict (area) do nothing;

create table if not exists public.storage_policy_audits (
  id uuid primary key default gen_random_uuid(),
  bucket_name text not null,
  policy_area text not null,
  status text not null default 'needs_review' check (status in ('needs_review', 'passed', 'blocked')),
  notes text,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_name, policy_area)
);

insert into public.storage_policy_audits (bucket_name, policy_area, notes)
values
  ('songs', 'public playback and creator upload', 'Verify uploaded audio is playable and upload/update/delete is creator/admin only.'),
  ('videos', 'public playback and creator upload', 'Verify uploaded video is playable and upload/update/delete is creator/admin only.'),
  ('covers', 'public artwork', 'Verify cover images are public read and creator/admin write.'),
  ('albums', 'album artwork and bundles', 'Verify album artwork and future bundles are protected correctly.'),
  ('producer-beats', 'beat playback and licensing downloads', 'Verify beat previews are public and licensed downloads are protected.'),
  ('licenses', 'private license PDFs', 'Verify license PDFs are private to purchaser/creator/admin.'),
  ('downloads', 'purchase download vault', 'Verify paid downloads are private and never public by accident.')
on conflict (bucket_name, policy_area) do nothing;

create table if not exists public.backup_exports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  export_scope text not null default 'user' check (export_scope in ('user', 'platform')),
  status text not null default 'completed' check (status in ('started', 'completed', 'failed')),
  file_name text,
  record_counts jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists backup_exports_requested_by_idx
on public.backup_exports (requested_by, created_at desc);

create table if not exists public.storage_cleanup_delete_logs (
  id uuid primary key default gen_random_uuid(),
  deleted_by uuid references auth.users(id) on delete set null,
  bucket_name text not null,
  file_path text not null,
  file_name text,
  file_size bigint,
  status_before_delete text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists storage_cleanup_delete_logs_user_idx
on public.storage_cleanup_delete_logs (deleted_by, created_at desc);

alter table public.user_roles enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.launch_checklist enable row level security;
alter table public.storage_policy_audits enable row level security;
alter table public.backup_exports enable row level security;
alter table public.storage_cleanup_delete_logs enable row level security;

drop policy if exists "Users can read own roles" on public.user_roles;
create policy "Users can read own roles"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Admins can manage roles" on public.user_roles;
create policy "Admins can manage roles"
on public.user_roles
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Admins can read audit logs" on public.admin_audit_logs;
create policy "Admins can read audit logs"
on public.admin_audit_logs
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can insert audit logs" on public.admin_audit_logs;
create policy "Admins can insert audit logs"
on public.admin_audit_logs
for insert
to authenticated
with check (public.is_platform_admin());

drop policy if exists "Admins can manage launch checklist" on public.launch_checklist;
create policy "Admins can manage launch checklist"
on public.launch_checklist
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Admins can manage storage policy audits" on public.storage_policy_audits;
create policy "Admins can manage storage policy audits"
on public.storage_policy_audits
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Users can read own backup exports" on public.backup_exports;
create policy "Users can read own backup exports"
on public.backup_exports
for select
to authenticated
using (requested_by = auth.uid() or public.is_platform_admin());

drop policy if exists "Users can insert own backup exports" on public.backup_exports;
create policy "Users can insert own backup exports"
on public.backup_exports
for insert
to authenticated
with check (requested_by = auth.uid() or public.is_platform_admin());

drop policy if exists "Admins can read cleanup delete logs" on public.storage_cleanup_delete_logs;
create policy "Admins can read cleanup delete logs"
on public.storage_cleanup_delete_logs
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can insert cleanup delete logs" on public.storage_cleanup_delete_logs;
create policy "Admins can insert cleanup delete logs"
on public.storage_cleanup_delete_logs
for insert
to authenticated
with check (public.is_platform_admin());

drop policy if exists "Admins can read all payouts" on public.payouts;
create policy "Admins can read all payouts"
on public.payouts
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can update payouts" on public.payouts;
create policy "Admins can update payouts"
on public.payouts
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Admins can read all transactions" on public.transactions;
create policy "Admins can read all transactions"
on public.transactions
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "Admins can read all subscriptions" on public.subscriptions;
create policy "Admins can read all subscriptions"
on public.subscriptions
for select
to authenticated
using (public.is_platform_admin());

grant execute on function public.is_platform_admin(uuid) to authenticated;
grant select on public.artist_profiles to anon, authenticated;
grant select on public.producer_profiles to anon, authenticated;
grant select on public.producer_beats to anon, authenticated;
grant select on public.songs to anon, authenticated;
grant select on public.videos to anon, authenticated;
grant select on public.albums to anon, authenticated;
grant select on public.launch_checklist to authenticated;
grant select on public.storage_policy_audits to authenticated;
grant select, insert on public.backup_exports to authenticated;
grant select, insert on public.storage_cleanup_delete_logs to authenticated;
grant select on public.admin_audit_logs to authenticated;
grant select on public.user_roles to authenticated;
