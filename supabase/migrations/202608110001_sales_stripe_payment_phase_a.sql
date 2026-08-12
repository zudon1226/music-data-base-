-- Sales Stripe payment Phase A schema (additive).
-- Supports: pending purchase_history -> Stripe Checkout session bind ->
-- signed webhook event idempotency -> completed + entitlement (app layer).
-- No backfill. No destructive data changes. Compatible with current app before Stripe code ships.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) purchase_history: payment identity (nullable; historical rows stay NULL)
-- ---------------------------------------------------------------------------

-- Expand allowed sale statuses for unpaid terminal outcomes (no entitlement).
alter table public.purchase_history drop constraint if exists purchase_history_status_check;
alter table public.purchase_history
  add constraint purchase_history_status_check
  check (status in ('pending', 'completed', 'refunded', 'cancelled', 'failed'));

alter table public.purchase_history
  add column if not exists payment_provider text;

alter table public.purchase_history
  add column if not exists provider_checkout_session_id text;

alter table public.purchase_history
  add column if not exists provider_payment_intent_id text;

alter table public.purchase_history
  add column if not exists payment_confirmed_at timestamptz;

alter table public.purchase_history drop constraint if exists purchase_history_payment_provider_check;
alter table public.purchase_history
  add constraint purchase_history_payment_provider_check
  check (payment_provider is null or payment_provider in ('stripe', 'test'));

-- Multi-line checkout: one session may bind many sale lines — index only, NOT unique.
create index if not exists purchase_history_checkout_session_idx
  on public.purchase_history (provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create index if not exists purchase_history_payment_intent_idx
  on public.purchase_history (provider_payment_intent_id)
  where provider_payment_intent_id is not null;

-- Preserve existing client posture: authenticated has SELECT/INSERT, no UPDATE grant.
-- Strip provider-controlled columns on non-service-role writes so clients cannot forge them.
create or replace function public.purchase_history_clear_client_provider_fields()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    new.payment_provider := null;
    new.provider_checkout_session_id := null;
    new.provider_payment_intent_id := null;
    new.payment_confirmed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_history_clear_client_provider_fields on public.purchase_history;
create trigger purchase_history_clear_client_provider_fields
before insert or update on public.purchase_history
for each row
execute function public.purchase_history_clear_client_provider_fields();

-- Trigger must remain executable for authenticated inserts (fields are cleared for non-service-role).
revoke all on function public.purchase_history_clear_client_provider_fields() from public;
grant execute on function public.purchase_history_clear_client_provider_fields() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) sales_payment_events: webhook idempotency (server/service-role only)
-- ---------------------------------------------------------------------------

create table if not exists public.sales_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in ('stripe', 'test')),
  provider_event_id text not null,
  provider_checkout_session_id text,
  processed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sales_payment_events_provider_event_uidx unique (provider, provider_event_id)
);

create index if not exists sales_payment_events_checkout_session_idx
  on public.sales_payment_events (provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create index if not exists sales_payment_events_processed_at_idx
  on public.sales_payment_events (processed_at desc);

alter table public.sales_payment_events enable row level security;

revoke all privileges on table public.sales_payment_events from public;
revoke all privileges on table public.sales_payment_events from anon;
revoke all privileges on table public.sales_payment_events from authenticated;
grant all privileges on table public.sales_payment_events to service_role;

-- No authenticated/anon policies: ordinary clients cannot read or forge payment events.
-- service_role bypasses RLS for server webhook processing.
