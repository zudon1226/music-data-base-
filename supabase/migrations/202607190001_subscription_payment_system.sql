-- Subscription + payment system (Listener / Artist / Producer).
-- Additive lifecycle fields, payment attempts, admin audit. Does not alter UI.

create extension if not exists pgcrypto;

-- Expand subscription status for billing lifecycle
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
update public.subscriptions
set status = 'cancelled'
where status = 'canceled';
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in (
    'pending',
    'active',
    'grace_period',
    'past_due',
    'suspended',
    'cancelled',
    'paused',
    'expired'
  ));

alter table public.subscriptions add column if not exists auto_renew boolean not null default true;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.subscriptions add column if not exists grace_period_ends_at timestamptz;
alter table public.subscriptions add column if not exists past_due_since timestamptz;
alter table public.subscriptions add column if not exists months_past_due integer not null default 0;
alter table public.subscriptions add column if not exists payment_provider text;
alter table public.subscriptions add column if not exists provider_customer_id text;
alter table public.subscriptions add column if not exists provider_subscription_id text;
alter table public.subscriptions add column if not exists last_payment_at timestamptz;
alter table public.subscriptions add column if not exists last_payment_failed_at timestamptz;
alter table public.subscriptions add column if not exists payment_retry_count integer not null default 0;
alter table public.subscriptions add column if not exists renewal_reminder_sent_at timestamptz;
alter table public.subscriptions add column if not exists admin_override_status text;
alter table public.subscriptions add column if not exists admin_override_note text;
alter table public.subscriptions add column if not exists admin_override_by uuid references auth.users(id) on delete set null;
alter table public.subscriptions add column if not exists admin_override_at timestamptz;

alter table public.subscriptions drop constraint if exists subscriptions_payment_provider_check;
alter table public.subscriptions
  add constraint subscriptions_payment_provider_check
  check (payment_provider is null or payment_provider in ('stripe', 'paypal', 'test'));

alter table public.subscriptions drop constraint if exists subscriptions_months_past_due_check;
alter table public.subscriptions
  add constraint subscriptions_months_past_due_check
  check (months_past_due >= 0);

create index if not exists subscriptions_status_idx
on public.subscriptions (status, current_period_end);

create index if not exists subscriptions_provider_sub_idx
on public.subscriptions (payment_provider, provider_subscription_id);

-- Payment attempt / invoice history
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded', 'retrying')),
  payment_provider text not null default 'test'
    check (payment_provider in ('stripe', 'paypal', 'test')),
  provider_payment_id text,
  failure_code text,
  failure_message text,
  attempt_number integer not null default 1 check (attempt_number >= 1),
  refunded_at timestamptz,
  refund_amount_cents integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_payments_user_idx
on public.subscription_payments (user_id, created_at desc);

create index if not exists subscription_payments_status_idx
on public.subscription_payments (status, created_at desc);

create index if not exists subscription_payments_provider_idx
on public.subscription_payments (payment_provider, provider_payment_id);

-- Audit / admin actions
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_events_sub_idx
on public.subscription_events (subscription_id, created_at desc);

create index if not exists subscription_events_type_idx
on public.subscription_events (event_type, created_at desc);

-- Ensure monthly Listener / Artist / Producer plans exist
insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order, description)
select 'Listener Monthly', 'listener', 699, 'USD', 'month',
  '["Unlimited streaming","Library","Playlists","Queue","Recommendations","Auto-renew by default","Cancel anytime"]'::jsonb,
  6, 'Monthly Listener subscription'
where not exists (
  select 1 from public.subscription_plans
  where lower(name) = lower('Listener Monthly') and billing_interval = 'month'
);

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order, description)
select 'Artist Monthly', 'artist', 999, 'USD', 'month',
  '["Creator dashboard","Earnings accumulate while subscribed","Withdrawals when current","Auto-renew by default","Cancel anytime"]'::jsonb,
  21, 'Monthly Artist creator subscription'
where not exists (
  select 1 from public.subscription_plans
  where lower(name) = lower('Artist Monthly') and billing_interval = 'month'
);

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order, description)
select 'Producer Monthly', 'producer', 1499, 'USD', 'month',
  '["Producer dashboard","Earnings accumulate while subscribed","Withdrawals when current","Auto-renew by default","Cancel anytime"]'::jsonb,
  31, 'Monthly Producer creator subscription'
where not exists (
  select 1 from public.subscription_plans
  where lower(name) = lower('Producer Monthly') and billing_interval = 'month'
);

alter table public.subscription_payments enable row level security;
alter table public.subscription_events enable row level security;

drop policy if exists "Users read own subscription payments" on public.subscription_payments;
create policy "Users read own subscription payments"
on public.subscription_payments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users read own subscription events" on public.subscription_events;
create policy "Users read own subscription events"
on public.subscription_events
for select
to authenticated
using (auth.uid() = user_id);

-- Service role / admin writes go through server APIs (bypass RLS).
