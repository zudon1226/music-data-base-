-- Ringtone Platform Phase 4: processing jobs, revisions, moderation log, publication gates.

-- Public catalog / purchase visibility: published only (approved awaits admin publish).
create or replace function public.is_public_ringtone_status(status text)
returns boolean
language sql
immutable
as $$
  select status = 'published';
$$;

drop index if exists public.ringtone_products_public_catalog_idx;
create index if not exists ringtone_products_public_catalog_idx
  on public.ringtone_products (status, is_featured, published_at desc)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- Product revision / processing metadata
-- ---------------------------------------------------------------------------

alter table public.ringtone_products
  add column if not exists revision_number integer not null default 1
    check (revision_number >= 1);

alter table public.ringtone_products
  add column if not exists current_revision_id uuid null;

alter table public.ringtone_products
  add column if not exists source_checksum text not null default '';

alter table public.ringtone_products
  add column if not exists processing_version text not null default '';

alter table public.ringtone_products
  add column if not exists last_processing_error text not null default '';

alter table public.ringtone_products
  add column if not exists last_processing_error_code text not null default '';

-- ---------------------------------------------------------------------------
-- Revisions (immutable purchase-linked snapshots)
-- ---------------------------------------------------------------------------

create table if not exists public.ringtone_revisions (
  id uuid primary key default gen_random_uuid(),
  ringtone_id uuid not null references public.ringtone_products(id) on delete cascade,
  revision_number integer not null check (revision_number >= 1),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  artwork_url text not null default '',
  duration_seconds numeric(6,3) not null
    check (duration_seconds >= 15 and duration_seconds <= 30),
  clip_start_seconds numeric(10,3) not null check (clip_start_seconds >= 0),
  clip_end_seconds numeric(10,3) not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  is_explicit boolean not null default false,
  ownership_confirmed boolean not null default false,
  source_kind text not null default 'upload',
  source_storage_path text not null default '',
  source_checksum text not null default '',
  preview_storage_path text not null default '',
  iphone_storage_path text not null default '',
  android_storage_path text not null default '',
  download_storage_path text not null default '',
  preview_url text not null default '',
  processing_version text not null default '',
  processing_result jsonb not null default '{}'::jsonb,
  status_at_snapshot text not null default 'draft',
  created_at timestamptz not null default now(),
  unique (ringtone_id, revision_number),
  constraint ringtone_revisions_clip_window_check check (clip_end_seconds > clip_start_seconds)
);

create index if not exists ringtone_revisions_ringtone_id_idx
  on public.ringtone_revisions (ringtone_id);

alter table public.ringtone_products
  drop constraint if exists ringtone_products_current_revision_id_fkey;

alter table public.ringtone_products
  add constraint ringtone_products_current_revision_id_fkey
  foreign key (current_revision_id) references public.ringtone_revisions(id)
  on delete set null;

alter table public.ringtone_purchases
  add column if not exists revision_id uuid null references public.ringtone_revisions(id) on delete restrict;

alter table public.ringtone_purchases
  add column if not exists revision_number integer null;

create index if not exists ringtone_purchases_revision_id_idx
  on public.ringtone_purchases (revision_id);

-- ---------------------------------------------------------------------------
-- Processing jobs
-- ---------------------------------------------------------------------------

create table if not exists public.ringtone_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  ringtone_id uuid not null references public.ringtone_products(id) on delete cascade,
  revision_number integer not null default 1 check (revision_number >= 1),
  creator_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'failed', 'canceled')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1 and max_attempts <= 10),
  processing_version text not null default 'ringtone-ffmpeg-v1',
  source_storage_path text not null default '',
  source_checksum text not null default '',
  source_bucket text not null default 'ringtone-source',
  clip_start_seconds numeric(10,3) not null,
  clip_end_seconds numeric(10,3) not null,
  duration_seconds numeric(6,3) not null
    check (duration_seconds >= 15 and duration_seconds <= 30),
  preview_storage_path text not null default '',
  iphone_storage_path text not null default '',
  android_storage_path text not null default '',
  preview_mime_type text not null default '',
  iphone_mime_type text not null default '',
  android_mime_type text not null default '',
  preview_byte_length integer not null default 0,
  iphone_byte_length integer not null default 0,
  android_byte_length integer not null default 0,
  output_duration_seconds numeric(6,3) null,
  error_code text not null default '',
  error_message text not null default '',
  result jsonb not null default '{}'::jsonb,
  idempotency_key text not null default '',
  queued_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  canceled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ringtone_processing_jobs_ringtone_id_idx
  on public.ringtone_processing_jobs (ringtone_id);
create index if not exists ringtone_processing_jobs_status_idx
  on public.ringtone_processing_jobs (status);
create index if not exists ringtone_processing_jobs_creator_id_idx
  on public.ringtone_processing_jobs (creator_id);

-- One active job per ringtone revision (queued or processing).
create unique index if not exists ringtone_processing_jobs_active_revision_uidx
  on public.ringtone_processing_jobs (ringtone_id, revision_number)
  where status in ('queued', 'processing');

create unique index if not exists ringtone_processing_jobs_idempotency_uidx
  on public.ringtone_processing_jobs (idempotency_key)
  where idempotency_key <> '';

drop trigger if exists ringtone_processing_jobs_touch_updated_at on public.ringtone_processing_jobs;
create trigger ringtone_processing_jobs_touch_updated_at
before update on public.ringtone_processing_jobs
for each row execute function public.touch_ringtone_updated_at();

-- ---------------------------------------------------------------------------
-- Immutable moderation audit log
-- ---------------------------------------------------------------------------

create table if not exists public.ringtone_moderation_logs (
  id uuid primary key default gen_random_uuid(),
  ringtone_id uuid not null references public.ringtone_products(id) on delete cascade,
  revision_id uuid null references public.ringtone_revisions(id) on delete set null,
  revision_number integer null,
  action text not null check (char_length(trim(action)) between 1 and 80),
  previous_status text not null default '',
  new_status text not null default '',
  actor_id uuid not null references auth.users(id) on delete cascade,
  actor_role text not null default 'admin' check (char_length(trim(actor_role)) between 1 and 40),
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ringtone_moderation_logs_ringtone_id_idx
  on public.ringtone_moderation_logs (ringtone_id, created_at desc);
create index if not exists ringtone_moderation_logs_actor_id_idx
  on public.ringtone_moderation_logs (actor_id);

-- Prevent updates/deletes via trigger (immutable for authenticated clients).
create or replace function public.forbid_ringtone_moderation_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ringtone_moderation_logs is immutable';
end;
$$;

drop trigger if exists ringtone_moderation_logs_forbid_update on public.ringtone_moderation_logs;
create trigger ringtone_moderation_logs_forbid_update
before update on public.ringtone_moderation_logs
for each row execute function public.forbid_ringtone_moderation_log_mutation();

drop trigger if exists ringtone_moderation_logs_forbid_delete on public.ringtone_moderation_logs;
create trigger ringtone_moderation_logs_forbid_delete
before delete on public.ringtone_moderation_logs
for each row execute function public.forbid_ringtone_moderation_log_mutation();

-- ---------------------------------------------------------------------------
-- Notifications: allow ringtone item types + dedupe helper column
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notifications'
  ) then
    alter table public.notifications drop constraint if exists notifications_item_type_check;
    alter table public.notifications
      add constraint notifications_item_type_check
      check (item_type in (
        'song', 'video', 'album', 'artist', 'producer', 'playlist', 'ringtone', 'ringtone_review'
      ));

    alter table public.notifications
      add column if not exists event_key text not null default '';

    create unique index if not exists notifications_user_event_key_uidx
      on public.notifications (user_id, event_key)
      where event_key <> '';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.ringtone_revisions enable row level security;
alter table public.ringtone_processing_jobs enable row level security;
alter table public.ringtone_moderation_logs enable row level security;

revoke all privileges on table public.ringtone_revisions from anon;
revoke all privileges on table public.ringtone_processing_jobs from anon;
revoke all privileges on table public.ringtone_moderation_logs from anon;

grant select on table public.ringtone_revisions to authenticated;
grant select on table public.ringtone_processing_jobs to authenticated;
grant select, insert on table public.ringtone_moderation_logs to authenticated;

revoke insert, update, delete on table public.ringtone_revisions from authenticated;
revoke insert, update, delete on table public.ringtone_processing_jobs from authenticated;
revoke update, delete on table public.ringtone_moderation_logs from authenticated;
revoke truncate, references, trigger on table public.ringtone_revisions from authenticated;
revoke truncate, references, trigger on table public.ringtone_processing_jobs from authenticated;
revoke truncate, references, trigger on table public.ringtone_moderation_logs from authenticated;

grant all privileges on table public.ringtone_revisions to service_role;
grant all privileges on table public.ringtone_processing_jobs to service_role;
grant all privileges on table public.ringtone_moderation_logs to service_role;

drop policy if exists platform_admin_full_access on public.ringtone_revisions;
create policy platform_admin_full_access
on public.ringtone_revisions
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists platform_admin_full_access on public.ringtone_processing_jobs;
create policy platform_admin_full_access
on public.ringtone_processing_jobs
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists platform_admin_full_access on public.ringtone_moderation_logs;
create policy platform_admin_full_access
on public.ringtone_moderation_logs
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Revisions: creator or admin can read; buyers with paid purchase for that revision can read.
drop policy if exists ringtone_revisions_select on public.ringtone_revisions;
create policy ringtone_revisions_select
on public.ringtone_revisions
for select
to authenticated
using (
  public.is_platform_admin()
  or creator_id = auth.uid()
  or exists (
    select 1
    from public.ringtone_purchases p
    where p.revision_id = ringtone_revisions.id
      and p.buyer_id = auth.uid()
      and p.payment_status = 'paid'
  )
);

drop policy if exists ringtone_processing_jobs_select on public.ringtone_processing_jobs;
create policy ringtone_processing_jobs_select
on public.ringtone_processing_jobs
for select
to authenticated
using (
  public.is_platform_admin()
  or creator_id = auth.uid()
);

-- Moderation logs: admins full read; creators see only rejection-safe rows for their products.
drop policy if exists ringtone_moderation_logs_admin_select on public.ringtone_moderation_logs;
create policy ringtone_moderation_logs_admin_select
on public.ringtone_moderation_logs
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists ringtone_moderation_logs_creator_rejection_select on public.ringtone_moderation_logs;
create policy ringtone_moderation_logs_creator_rejection_select
on public.ringtone_moderation_logs
for select
to authenticated
using (
  action = 'reject'
  and exists (
    select 1
    from public.ringtone_products rp
    where rp.id = ringtone_moderation_logs.ringtone_id
      and rp.creator_id = auth.uid()
  )
);

drop policy if exists ringtone_moderation_logs_admin_insert on public.ringtone_moderation_logs;
create policy ringtone_moderation_logs_admin_insert
on public.ringtone_moderation_logs
for insert
to authenticated
with check (public.is_platform_admin() and actor_id = auth.uid());

-- Service-role workers write jobs/revisions; no authenticated insert policies for those tables.
