-- Dedicated listener launch-notification waitlist (separate from launch_checklist).

create table if not exists public.launch_listener_notify (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  constraint launch_listener_notify_email_not_empty check (char_length(trim(email)) > 0),
  constraint launch_listener_notify_email_max_len check (char_length(email) <= 320)
);

create unique index if not exists launch_listener_notify_email_uidx
  on public.launch_listener_notify (lower(trim(email)));

alter table public.launch_listener_notify enable row level security;

-- Remove synthetic checklist row created by the interim GET NOTIFIED implementation only.
delete from public.launch_checklist
where area = 'Listener launch notifications';

revoke all on table public.launch_listener_notify from anon;
revoke all on table public.launch_listener_notify from authenticated;
grant select on table public.launch_listener_notify to authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.launch_listener_notify from authenticated;
grant all on table public.launch_listener_notify to service_role;

drop policy if exists launch_listener_notify_admin_select on public.launch_listener_notify;
create policy launch_listener_notify_admin_select
  on public.launch_listener_notify
  for select
  to authenticated
  using (public.is_platform_admin());

notify pgrst, 'reload schema';
