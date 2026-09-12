-- Sponsor platform foundation: packages, applications, assets, payment idempotency, platform revenue ledger.
-- Sponsor revenue is 100% platform — never mixed with creator earnings_events.

create extension if not exists pgcrypto;

create or replace function public.touch_sponsor_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- sponsor_packages (admin-configurable offerings)
-- ---------------------------------------------------------------------------
create table if not exists public.sponsor_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD' check (char_length(trim(currency)) = 3),
  duration_days integer check (duration_days is null or duration_days > 0),
  duration_label text not null default '',
  placement_type text not null default 'home_featured',
  active boolean not null default true,
  display_order integer not null default 100,
  stripe_product_id text,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsor_packages_active_order_idx
  on public.sponsor_packages (active, display_order, created_at desc);

-- ---------------------------------------------------------------------------
-- sponsor_applications (campaign / sponsorship records)
-- ---------------------------------------------------------------------------
create table if not exists public.sponsor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  business_name text not null default '',
  contact_name text not null default '',
  email text not null default '',
  phone text,
  website text,
  company_description text not null default '',
  package_id uuid references public.sponsor_packages(id) on delete set null,
  requested_placement text not null default 'home_featured',
  campaign_start_preference date,
  campaign_end_preference date,
  notes text not null default '',
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'under_review', 'approved', 'payment_pending',
    'paid', 'scheduled', 'active', 'expired', 'rejected', 'canceled'
  )),
  payment_status text not null default 'unpaid' check (payment_status in (
    'unpaid', 'pending', 'paid', 'failed', 'refunded', 'canceled'
  )),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'USD' check (char_length(trim(currency)) = 3),
  stripe_customer_id text,
  provider_checkout_session_id text,
  provider_payment_intent_id text,
  provider_payment_reference text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  activated_at timestamptz,
  expires_at timestamptz,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  headline text not null default '',
  destination_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsor_applications_user_idx
  on public.sponsor_applications (user_id, created_at desc);
create index if not exists sponsor_applications_status_idx
  on public.sponsor_applications (status, payment_status, created_at desc);
create index if not exists sponsor_applications_active_window_idx
  on public.sponsor_applications (status, scheduled_start_at, scheduled_end_at)
  where status in ('active', 'scheduled', 'paid');
create unique index if not exists sponsor_applications_checkout_session_uidx
  on public.sponsor_applications (provider_checkout_session_id)
  where provider_checkout_session_id is not null and provider_checkout_session_id <> '';

-- ---------------------------------------------------------------------------
-- sponsor_assets (logos, banners, creatives)
-- ---------------------------------------------------------------------------
create table if not exists public.sponsor_assets (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sponsor_applications(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  asset_type text not null default 'logo' check (asset_type in ('logo', 'banner', 'campaign_image')),
  storage_path text not null,
  mime_type text not null default '',
  file_size_bytes integer check (file_size_bytes is null or file_size_bytes >= 0),
  alt_text text not null default '',
  destination_url text,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsor_assets_application_idx
  on public.sponsor_assets (application_id, asset_type);

-- ---------------------------------------------------------------------------
-- sponsor_payment_events (webhook idempotency — service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.sponsor_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_event_id text not null,
  provider_checkout_session_id text,
  application_id uuid references public.sponsor_applications(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  constraint sponsor_payment_events_provider_event_uidx unique (provider, provider_event_id)
);

create index if not exists sponsor_payment_events_application_idx
  on public.sponsor_payment_events (application_id, processed_at desc);

alter table public.sponsor_payment_events enable row level security;
revoke all privileges on table public.sponsor_payment_events from public, anon, authenticated;
grant all privileges on table public.sponsor_payment_events to service_role;

-- ---------------------------------------------------------------------------
-- platform_revenue_events (platform-only ledger — NOT earnings_events)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_revenue_events (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'sponsor' check (source_type in ('sponsor', 'subscription', 'other')),
  source_id uuid not null,
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  net_amount_cents integer not null check (net_amount_cents >= 0),
  refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0),
  currency text not null default 'USD',
  payment_provider text not null default '',
  payment_reference text not null default '',
  status text not null default 'recorded' check (status in ('recorded', 'refunded', 'partial_refund', 'reversed')),
  is_reversal boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists platform_revenue_events_source_uidx
  on public.platform_revenue_events (source_type, source_id, payment_reference, is_reversal)
  where is_reversal = false and payment_reference <> '';

create index if not exists platform_revenue_events_occurred_idx
  on public.platform_revenue_events (occurred_at desc, source_type);

-- ---------------------------------------------------------------------------
-- Storage bucket for sponsor creatives (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sponsor-assets',
  'sponsor-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists sponsor_packages_touch_updated_at on public.sponsor_packages;
create trigger sponsor_packages_touch_updated_at
before update on public.sponsor_packages
for each row execute function public.touch_sponsor_updated_at();

drop trigger if exists sponsor_applications_touch_updated_at on public.sponsor_applications;
create trigger sponsor_applications_touch_updated_at
before update on public.sponsor_applications
for each row execute function public.touch_sponsor_updated_at();

drop trigger if exists sponsor_assets_touch_updated_at on public.sponsor_assets;
create trigger sponsor_assets_touch_updated_at
before update on public.sponsor_assets
for each row execute function public.touch_sponsor_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sponsor_packages enable row level security;
alter table public.sponsor_applications enable row level security;
alter table public.sponsor_assets enable row level security;
alter table public.platform_revenue_events enable row level security;

revoke all privileges on table public.sponsor_packages from anon;
revoke all privileges on table public.sponsor_applications from anon;
revoke all privileges on table public.sponsor_assets from anon;
revoke all privileges on table public.platform_revenue_events from anon;

grant select on table public.sponsor_packages to anon, authenticated;
grant select, insert, update on table public.sponsor_applications to authenticated;
grant select, insert, update on table public.sponsor_assets to authenticated;
grant select on table public.platform_revenue_events to authenticated;

grant all privileges on table public.sponsor_packages to service_role;
grant all privileges on table public.sponsor_applications to service_role;
grant all privileges on table public.sponsor_assets to service_role;
grant all privileges on table public.platform_revenue_events to service_role;

-- Packages: public read active only; admin full via is_platform_admin
drop policy if exists sponsor_packages_public_read_active on public.sponsor_packages;
create policy sponsor_packages_public_read_active
on public.sponsor_packages for select to anon, authenticated
using (active = true);

drop policy if exists sponsor_packages_admin_all on public.sponsor_packages;
create policy sponsor_packages_admin_all
on public.sponsor_packages for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Applications: owner read/write while editable; admin all
drop policy if exists sponsor_applications_owner_read on public.sponsor_applications;
create policy sponsor_applications_owner_read
on public.sponsor_applications for select to authenticated
using (user_id = auth.uid());

drop policy if exists sponsor_applications_owner_insert on public.sponsor_applications;
create policy sponsor_applications_owner_insert
on public.sponsor_applications for insert to authenticated
with check (user_id = auth.uid() and status in ('draft', 'submitted'));

drop policy if exists sponsor_applications_owner_update on public.sponsor_applications;
create policy sponsor_applications_owner_update
on public.sponsor_applications for update to authenticated
using (
  user_id = auth.uid()
  and status in ('draft', 'submitted', 'under_review')
)
with check (
  user_id = auth.uid()
  and status in ('draft', 'submitted', 'under_review')
);

drop policy if exists sponsor_applications_admin_all on public.sponsor_applications;
create policy sponsor_applications_admin_all
on public.sponsor_applications for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Public active placements (read-only metadata for display)
drop policy if exists sponsor_applications_public_active_read on public.sponsor_applications;
create policy sponsor_applications_public_active_read
on public.sponsor_applications for select to anon, authenticated
using (
  status = 'active'
  and payment_status = 'paid'
  and (scheduled_start_at is null or scheduled_start_at <= now())
  and (scheduled_end_at is null or scheduled_end_at > now())
);

-- Assets: owner via application ownership; admin all; public read approved assets on active campaigns
drop policy if exists sponsor_assets_owner_read on public.sponsor_assets;
create policy sponsor_assets_owner_read
on public.sponsor_assets for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.sponsor_applications a
    where a.id = sponsor_assets.application_id and a.user_id = auth.uid()
  )
);

drop policy if exists sponsor_assets_owner_insert on public.sponsor_assets;
create policy sponsor_assets_owner_insert
on public.sponsor_assets for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.sponsor_applications a
    where a.id = application_id
      and a.user_id = auth.uid()
      and a.status in ('draft', 'submitted', 'under_review', 'approved', 'payment_pending')
  )
);

drop policy if exists sponsor_assets_owner_update on public.sponsor_assets;
create policy sponsor_assets_owner_update
on public.sponsor_assets for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists sponsor_assets_admin_all on public.sponsor_assets;
create policy sponsor_assets_admin_all
on public.sponsor_assets for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists sponsor_assets_public_active_read on public.sponsor_assets;
create policy sponsor_assets_public_active_read
on public.sponsor_assets for select to anon, authenticated
using (
  approval_status = 'approved'
  and exists (
    select 1 from public.sponsor_applications a
    where a.id = sponsor_assets.application_id
      and a.status = 'active'
      and a.payment_status = 'paid'
      and (a.scheduled_start_at is null or a.scheduled_start_at <= now())
      and (a.scheduled_end_at is null or a.scheduled_end_at > now())
  )
);

-- Platform revenue: admin read only (writes via service role)
drop policy if exists platform_revenue_admin_read on public.platform_revenue_events;
create policy platform_revenue_admin_read
on public.platform_revenue_events for select to authenticated
using (public.is_platform_admin());

-- Storage: sponsor-assets private owner-scoped paths
drop policy if exists sponsor_assets_storage_owner_read on storage.objects;
create policy sponsor_assets_storage_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'sponsor-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists sponsor_assets_storage_owner_insert on storage.objects;
create policy sponsor_assets_storage_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'sponsor-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists sponsor_assets_storage_admin_all on storage.objects;
create policy sponsor_assets_storage_admin_all
on storage.objects for all to authenticated
using (bucket_id = 'sponsor-assets' and public.is_platform_admin())
with check (bucket_id = 'sponsor-assets' and public.is_platform_admin());

notify pgrst, 'reload schema';
