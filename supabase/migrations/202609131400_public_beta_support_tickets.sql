-- Public beta: extend support_tickets + private support-attachments bucket

create sequence if not exists public.support_ticket_number_seq start with 1001 increment by 1;

alter table public.support_tickets
  add column if not exists ticket_number text,
  add column if not exists account_type text,
  add column if not exists subject text,
  add column if not exists description text,
  add column if not exists severity text not null default 'medium',
  add column if not exists page_path text,
  add column if not exists device_type text,
  add column if not exists browser text,
  add column if not exists app_error_code text,
  add column if not exists request_id text,
  add column if not exists upload_type text,
  add column if not exists file_type text,
  add column if not exists file_size bigint,
  add column if not exists upload_stage text,
  add column if not exists screenshot_path text,
  add column if not exists admin_notes text,
  add column if not exists resolved_at timestamptz;

update public.support_tickets
set
  subject = coalesce(nullif(trim(subject), ''), title),
  description = coalesce(nullif(trim(description), ''), body),
  severity = coalesce(nullif(trim(severity), ''), priority, 'medium')
where subject is null or description is null or severity is null or severity = '';

update public.support_tickets
set status = case status
  when 'open' then 'new'
  when 'in_progress' then 'reviewing'
  when 'waiting_on_user' then 'need_more_info'
  when 'resolved' then 'fixed'
  else status
end
where status in ('open', 'in_progress', 'waiting_on_user', 'resolved');

alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets
  add constraint support_tickets_status_check check (
    status in ('new', 'reviewing', 'need_more_info', 'fixed', 'closed')
  );

alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets
  add constraint support_tickets_category_check check (
    category in (
      'upload', 'playback', 'account', 'podcast', 'ringtone', 'billing',
      'navigation', 'bug', 'suggestion', 'other',
      'marketplace', 'trust', 'general'
    )
  );

alter table public.support_tickets drop constraint if exists support_tickets_severity_check;
alter table public.support_tickets
  add constraint support_tickets_severity_check check (
    severity in ('low', 'medium', 'high', 'urgent')
  );

create unique index if not exists support_tickets_ticket_number_uidx
  on public.support_tickets (ticket_number)
  where ticket_number is not null;

create index if not exists support_tickets_category_status_idx
  on public.support_tickets (category, status, created_at desc);

create or replace function public.assign_support_ticket_number()
returns trigger
language plpgsql
as $$
begin
  if new.ticket_number is null or trim(new.ticket_number) = '' then
    new.ticket_number := 'MDB-' || nextval('public.support_ticket_number_seq')::text;
  end if;
  if new.subject is null or trim(new.subject) = '' then
    new.subject := coalesce(nullif(trim(new.title), ''), 'Support request');
  end if;
  if new.description is null then
    new.description := coalesce(new.body, '');
  end if;
  new.title := coalesce(nullif(trim(new.title), ''), new.subject);
  new.body := coalesce(new.description, new.body, '');
  new.priority := coalesce(nullif(trim(new.priority), ''), new.severity, 'medium');
  new.severity := coalesce(nullif(trim(new.severity), ''), new.priority, 'medium');
  new.updated_at := now();
  if new.status in ('fixed', 'closed') and new.resolved_at is null then
    new.resolved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_assign_number on public.support_tickets;
create trigger support_tickets_assign_number
before insert or update on public.support_tickets
for each row execute function public.assign_support_ticket_number();

-- Users must not set admin_notes on insert/update (server uses service role for admin)
create or replace function public.support_tickets_block_user_admin_notes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.admin_notes := null;
  else
    new.admin_notes := old.admin_notes;
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_block_user_admin_notes on public.support_tickets;
create trigger support_tickets_block_user_admin_notes
before insert or update on public.support_tickets
for each row execute function public.support_tickets_block_user_admin_notes();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists support_attachments_owner_select on storage.objects;
create policy support_attachments_owner_select
on storage.objects for select to authenticated
using (
  bucket_id = 'support-attachments'
  and (
    public.is_platform_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists support_attachments_owner_insert on storage.objects;
create policy support_attachments_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'support-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists support_attachments_owner_delete on storage.objects;
create policy support_attachments_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'support-attachments'
  and (
    public.is_platform_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);
