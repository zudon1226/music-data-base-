-- Phase 7E - Support and Operations
-- Additive foundation for launch support tickets, user feedback,
-- incident status, release notes, and admin support review.

create extension if not exists pgcrypto;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null default '',
  category text not null default 'general' check (category in ('account', 'upload', 'billing', 'playback', 'marketplace', 'trust', 'general')),
  title text not null,
  body text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_user', 'resolved', 'closed')),
  assigned_admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null default '',
  message text not null,
  is_admin_reply boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  area text not null check (area in ('api', 'storage', 'auth', 'player', 'marketplace', 'database')),
  severity text not null default 'minor' check (severity in ('minor', 'major', 'critical')),
  status text not null default 'investigating' check (status in ('investigating', 'identified', 'monitoring', 'resolved')),
  message text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.release_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  version text not null default '',
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now()
);

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null default '',
  sentiment text not null default 'neutral' check (sentiment in ('positive', 'neutral', 'issue')),
  area text not null default 'general' check (area in ('dashboard', 'upload', 'player', 'marketplace', 'mobile', 'general')),
  message text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_status_idx
on public.support_tickets (user_id, status, created_at desc);

create index if not exists support_tickets_status_priority_idx
on public.support_tickets (status, priority, created_at desc);

create index if not exists support_ticket_messages_ticket_idx
on public.support_ticket_messages (ticket_id, created_at);

create index if not exists platform_incidents_status_idx
on public.platform_incidents (status, severity, created_at desc);

create index if not exists release_notes_published_idx
on public.release_notes (published_at desc);

create index if not exists user_feedback_area_sentiment_idx
on public.user_feedback (area, sentiment, created_at desc);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.platform_incidents enable row level security;
alter table public.release_notes enable row level security;
alter table public.user_feedback enable row level security;

drop policy if exists "Users can create own support tickets" on public.support_tickets;
create policy "Users can create own support tickets"
on public.support_tickets
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can read own support tickets or admins read all" on public.support_tickets;
create policy "Users can read own support tickets or admins read all"
on public.support_tickets
for select
to authenticated
using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Users can update own open tickets or admins update all" on public.support_tickets;
create policy "Users can update own open tickets or admins update all"
on public.support_tickets
for update
to authenticated
using (user_id = auth.uid() or public.is_platform_admin())
with check (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Admins can delete support tickets" on public.support_tickets;
create policy "Admins can delete support tickets"
on public.support_tickets
for delete
to authenticated
using (public.is_platform_admin());

drop policy if exists "Users can create messages on visible tickets" on public.support_ticket_messages;
create policy "Users can create messages on visible tickets"
on public.support_ticket_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.support_tickets t
    where t.id = ticket_id
      and (t.user_id = auth.uid() or public.is_platform_admin())
  )
);

drop policy if exists "Users can read messages on visible tickets" on public.support_ticket_messages;
create policy "Users can read messages on visible tickets"
on public.support_ticket_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_tickets t
    where t.id = ticket_id
      and (t.user_id = auth.uid() or public.is_platform_admin())
  )
);

drop policy if exists "Admins can delete support messages" on public.support_ticket_messages;
create policy "Admins can delete support messages"
on public.support_ticket_messages
for delete
to authenticated
using (public.is_platform_admin());

drop policy if exists "Authenticated users can read platform incidents" on public.platform_incidents;
create policy "Authenticated users can read platform incidents"
on public.platform_incidents
for select
to authenticated
using (true);

drop policy if exists "Admins can manage platform incidents" on public.platform_incidents;
create policy "Admins can manage platform incidents"
on public.platform_incidents
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Authenticated users can read release notes" on public.release_notes;
create policy "Authenticated users can read release notes"
on public.release_notes
for select
to authenticated
using (true);

drop policy if exists "Admins can manage release notes" on public.release_notes;
create policy "Admins can manage release notes"
on public.release_notes
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Users can create own feedback" on public.user_feedback;
create policy "Users can create own feedback"
on public.user_feedback
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can read own feedback or admins read all" on public.user_feedback;
create policy "Users can read own feedback or admins read all"
on public.user_feedback
for select
to authenticated
using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Admins can delete feedback" on public.user_feedback;
create policy "Admins can delete feedback"
on public.user_feedback
for delete
to authenticated
using (public.is_platform_admin());

grant select, insert, update, delete on public.support_tickets to authenticated;
grant select, insert, delete on public.support_ticket_messages to authenticated;
grant select, insert, update, delete on public.platform_incidents to authenticated;
grant select, insert, update, delete on public.release_notes to authenticated;
grant select, insert, delete on public.user_feedback to authenticated;
