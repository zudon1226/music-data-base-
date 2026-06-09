-- Phase 7D - Trust and Moderation
-- Additive foundation for community reports, takedowns, copyright claims,
-- blocked users, and admin-controlled verification review.

create extension if not exists pgcrypto;

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_name text not null default '',
  item_type text not null check (item_type in ('song', 'video', 'album', 'comment', 'artist', 'producer', 'beat', 'playlist')),
  item_id text not null,
  item_title text not null default '',
  reason text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewing', 'takedown_pending', 'removed', 'dismissed', 'resolved')),
  target_user_id text,
  target_user_name text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.copyright_claims (
  id uuid primary key default gen_random_uuid(),
  claimant_id uuid references auth.users(id) on delete set null,
  claimant_name text not null default '',
  item_type text not null check (item_type in ('song', 'video', 'album', 'beat')),
  item_id text not null,
  item_title text not null default '',
  creator_name text not null default '',
  evidence_notes text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id text not null,
  blocked_user_name text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_user_id)
);

create table if not exists public.verification_review_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references auth.users(id) on delete set null,
  creator_type text not null check (creator_type in ('artist', 'producer')),
  creator_id text not null,
  creator_name text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_type, creator_id, requester_id)
);

create index if not exists moderation_reports_status_idx
on public.moderation_reports (status, created_at desc);

create index if not exists moderation_reports_item_idx
on public.moderation_reports (item_type, item_id);

create index if not exists copyright_claims_status_idx
on public.copyright_claims (status, created_at desc);

create index if not exists copyright_claims_item_idx
on public.copyright_claims (item_type, item_id);

create index if not exists blocked_users_blocker_idx
on public.blocked_users (blocker_id, created_at desc);

create index if not exists verification_review_requests_status_idx
on public.verification_review_requests (status, created_at desc);

create index if not exists verification_review_requests_creator_idx
on public.verification_review_requests (creator_type, creator_id);

alter table public.moderation_reports enable row level security;
alter table public.copyright_claims enable row level security;
alter table public.blocked_users enable row level security;
alter table public.verification_review_requests enable row level security;

drop policy if exists "Users can create own moderation reports" on public.moderation_reports;
create policy "Users can create own moderation reports"
on public.moderation_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "Users can read own moderation reports or admins read all" on public.moderation_reports;
create policy "Users can read own moderation reports or admins read all"
on public.moderation_reports
for select
to authenticated
using (reporter_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Admins can update moderation reports" on public.moderation_reports;
create policy "Admins can update moderation reports"
on public.moderation_reports
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Admins can delete moderation reports" on public.moderation_reports;
create policy "Admins can delete moderation reports"
on public.moderation_reports
for delete
to authenticated
using (public.is_platform_admin());

drop policy if exists "Users can create own copyright claims" on public.copyright_claims;
create policy "Users can create own copyright claims"
on public.copyright_claims
for insert
to authenticated
with check (claimant_id = auth.uid());

drop policy if exists "Users can read own copyright claims or admins read all" on public.copyright_claims;
create policy "Users can read own copyright claims or admins read all"
on public.copyright_claims
for select
to authenticated
using (claimant_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Admins can update copyright claims" on public.copyright_claims;
create policy "Admins can update copyright claims"
on public.copyright_claims
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Admins can delete copyright claims" on public.copyright_claims;
create policy "Admins can delete copyright claims"
on public.copyright_claims
for delete
to authenticated
using (public.is_platform_admin());

drop policy if exists "Users can manage own blocked users" on public.blocked_users;
create policy "Users can manage own blocked users"
on public.blocked_users
for all
to authenticated
using (blocker_id = auth.uid() or public.is_platform_admin())
with check (blocker_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Users can create own verification requests" on public.verification_review_requests;
create policy "Users can create own verification requests"
on public.verification_review_requests
for insert
to authenticated
with check (requester_id = auth.uid());

drop policy if exists "Users can read own verification requests or admins read all" on public.verification_review_requests;
create policy "Users can read own verification requests or admins read all"
on public.verification_review_requests
for select
to authenticated
using (requester_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Admins can update verification requests" on public.verification_review_requests;
create policy "Admins can update verification requests"
on public.verification_review_requests
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Admins can delete verification requests" on public.verification_review_requests;
create policy "Admins can delete verification requests"
on public.verification_review_requests
for delete
to authenticated
using (public.is_platform_admin());

grant select, insert, update, delete on public.moderation_reports to authenticated;
grant select, insert, update, delete on public.copyright_claims to authenticated;
grant select, insert, update, delete on public.blocked_users to authenticated;
grant select, insert, update, delete on public.verification_review_requests to authenticated;
