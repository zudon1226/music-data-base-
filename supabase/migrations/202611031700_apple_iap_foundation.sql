-- Apple IAP Stage 1 foundation: SKU registry + payment event idempotency (additive only).

-- ---------------------------------------------------------------------------
-- 1) apple_catalog_skus — App Store product ID → MDB catalog mapping
-- ---------------------------------------------------------------------------

create table if not exists public.apple_catalog_skus (
  id uuid primary key default gen_random_uuid(),
  apple_product_id text not null,
  entity_type text not null
    check (entity_type in ('subscription', 'album', 'ringtone', 'beat_license')),
  entity_id uuid,
  plan_slug text,
  license_type text,
  billing_interval text
    check (billing_interval is null or billing_interval in ('month', 'year')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apple_catalog_skus_product_id_uidx unique (apple_product_id),
  constraint apple_catalog_skus_subscription_plan_check check (
    entity_type <> 'subscription'
    or (plan_slug is not null and entity_id is null)
  ),
  constraint apple_catalog_skus_entity_id_check check (
    entity_type = 'subscription'
    or entity_id is not null
  ),
  constraint apple_catalog_skus_beat_license_check check (
    entity_type <> 'beat_license'
    or license_type is not null
  )
);

create index if not exists apple_catalog_skus_active_entity_idx
  on public.apple_catalog_skus (entity_type, entity_id, license_type)
  where active = true;

create index if not exists apple_catalog_skus_active_plan_slug_idx
  on public.apple_catalog_skus (plan_slug)
  where active = true and entity_type = 'subscription';

alter table public.apple_catalog_skus enable row level security;

revoke all privileges on table public.apple_catalog_skus from public;
revoke all privileges on table public.apple_catalog_skus from anon;
grant select on table public.apple_catalog_skus to authenticated;
grant all privileges on table public.apple_catalog_skus to service_role;

drop policy if exists apple_catalog_skus_read_active on public.apple_catalog_skus;
create policy apple_catalog_skus_read_active
  on public.apple_catalog_skus
  for select
  to authenticated
  using (active = true);

drop policy if exists platform_admin_full_access on public.apple_catalog_skus;
create policy platform_admin_full_access
  on public.apple_catalog_skus
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2) apple_payment_events — client verify / ASN idempotency (service-role writes)
-- ---------------------------------------------------------------------------

create table if not exists public.apple_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'apple'
    check (provider = 'apple'),
  provider_event_id text not null,
  original_transaction_id text,
  notification_type text not null default 'client_verify'
    check (notification_type in ('client_verify', 'asn', 'restore')),
  user_id uuid not null,
  apple_product_id text not null,
  environment text not null
    check (environment in ('Sandbox', 'Production')),
  payload_hash text not null,
  outcome text not null
    check (outcome in ('verified_no_grant', 'fulfilled', 'duplicate', 'rejected')),
  commerce_locked boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint apple_payment_events_provider_event_uidx unique (provider, provider_event_id)
);

create index if not exists apple_payment_events_user_id_idx
  on public.apple_payment_events (user_id, processed_at desc);

create index if not exists apple_payment_events_original_tx_idx
  on public.apple_payment_events (original_transaction_id)
  where original_transaction_id is not null;

alter table public.apple_payment_events enable row level security;

revoke all privileges on table public.apple_payment_events from public;
revoke all privileges on table public.apple_payment_events from anon;
revoke all privileges on table public.apple_payment_events from authenticated;
grant all privileges on table public.apple_payment_events to service_role;

-- No authenticated/anon policies: clients cannot read or forge Apple payment events.

-- ---------------------------------------------------------------------------
-- 3) Extend payment_provider checks for future Apple fulfillment (Stage 2+)
-- ---------------------------------------------------------------------------

alter table public.purchase_history drop constraint if exists purchase_history_payment_provider_check;
alter table public.purchase_history
  add constraint purchase_history_payment_provider_check
  check (payment_provider is null or payment_provider in ('stripe', 'test', 'apple'));

alter table public.subscriptions drop constraint if exists subscriptions_payment_provider_check;
alter table public.subscriptions
  add constraint subscriptions_payment_provider_check
  check (payment_provider is null or payment_provider in ('stripe', 'paypal', 'test', 'apple'));

notify pgrst, 'reload schema';
