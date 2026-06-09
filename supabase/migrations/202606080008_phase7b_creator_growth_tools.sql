-- Phase 7B - Creator Growth Tools
-- Additive only. Supports saved growth snapshots and creator action history.

create extension if not exists pgcrypto;

create table if not exists public.creator_growth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  creator_type text not null check (creator_type in ('artist', 'producer')),
  creator_id text,
  creator_name text not null default '',
  follower_count integer not null default 0 check (follower_count >= 0),
  subscriber_count integer not null default 0 check (subscriber_count >= 0),
  audience_count integer not null default 0 check (audience_count >= 0),
  engagement_score integer not null default 0 check (engagement_score >= 0 and engagement_score <= 100),
  fan_conversion_rate numeric(8, 4) not null default 0 check (fan_conversion_rate >= 0),
  follower_growth_rate numeric(8, 4) not null default 0 check (follower_growth_rate >= 0),
  content_count integer not null default 0 check (content_count >= 0),
  metrics jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.creator_growth_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  creator_type text not null check (creator_type in ('artist', 'producer')),
  creator_id text,
  action_key text not null,
  title text not null,
  detail text not null default '',
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'dismissed')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_growth_snapshots_user_idx
on public.creator_growth_snapshots (user_id, creator_type, captured_at desc);

create index if not exists creator_growth_snapshots_creator_idx
on public.creator_growth_snapshots (creator_type, creator_id, captured_at desc);

create index if not exists creator_growth_actions_user_idx
on public.creator_growth_actions (user_id, creator_type, status, created_at desc);

alter table public.creator_growth_snapshots enable row level security;
alter table public.creator_growth_actions enable row level security;

drop policy if exists "Users can read own creator growth snapshots" on public.creator_growth_snapshots;
create policy "Users can read own creator growth snapshots"
on public.creator_growth_snapshots
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own creator growth snapshots" on public.creator_growth_snapshots;
create policy "Users can insert own creator growth snapshots"
on public.creator_growth_snapshots
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can read own creator growth actions" on public.creator_growth_actions;
create policy "Users can read own creator growth actions"
on public.creator_growth_actions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can manage own creator growth actions" on public.creator_growth_actions;
create policy "Users can manage own creator growth actions"
on public.creator_growth_actions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert on public.creator_growth_snapshots to authenticated;
grant select, insert, update, delete on public.creator_growth_actions to authenticated;
