-- Phase 4 - Monetization & Professional Artist Tools
-- Additive only. Does not delete or rewrite player, upload, library, album,
-- playlist, likes, follows, or dashboard data.

create extension if not exists pgcrypto;

alter table public.subscription_plans add column if not exists description text;
alter table public.subscription_plans add column if not exists stripe_price_id text;
alter table public.subscriptions add column if not exists subscription_type text default 'listener';
alter table public.subscriptions add column if not exists stripe_customer_id text;
alter table public.subscriptions add column if not exists stripe_subscription_id text;
alter table public.subscriptions add column if not exists canceled_at timestamptz;
alter table public.subscriptions add column if not exists trial_ends_at timestamptz;

alter table public.subscriptions drop constraint if exists subscriptions_subscription_type_check;
alter table public.subscriptions
  add constraint subscriptions_subscription_type_check check (subscription_type in ('free', 'listener', 'artist', 'producer', 'admin'));

alter table public.transactions drop constraint if exists transactions_item_type_check;
alter table public.transactions
  add constraint transactions_item_type_check check (item_type in ('song', 'video', 'album', 'beat', 'subscription', 'playlist', 'exclusive'));

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order, description)
select 'Free Listener', 'listener', 0, 'USD', 'month', '["Listen to free catalog", "Library saves", "Playlists"]'::jsonb, 1, 'Free listener account'
where not exists (select 1 from public.subscription_plans where lower(name) = lower('Free Listener') and billing_interval = 'month');

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order, description)
select 'Premium Listener', 'listener', 699, 'USD', 'month', '["Subscriber-only albums", "Subscriber-only videos", "Exclusive playlists", "Early releases"]'::jsonb, 5, 'Premium monthly listener account'
where not exists (select 1 from public.subscription_plans where lower(name) = lower('Premium Listener') and billing_interval = 'month');

create table if not exists public.creator_subscribers (
  id uuid primary key default gen_random_uuid(),
  subscriber_user_id uuid references auth.users(id) on delete cascade,
  creator_user_id uuid references auth.users(id) on delete cascade,
  creator_type text not null check (creator_type in ('artist', 'producer')),
  creator_name text,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'canceled', 'expired')),
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscriber_user_id, creator_user_id, creator_type)
);

create table if not exists public.earnings_events (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete set null,
  creator_type text not null check (creator_type in ('artist', 'producer', 'platform')),
  creator_name text,
  item_id text,
  item_type text not null check (item_type in ('song', 'video', 'album', 'beat', 'subscription', 'playlist', 'exclusive')),
  event_type text not null check (event_type in ('stream', 'view', 'purchase', 'download', 'subscription', 'license', 'payout')),
  source_id text,
  gross_amount_cents integer not null default 0 check (gross_amount_cents >= 0),
  artist_amount_cents integer not null default 0 check (artist_amount_cents >= 0),
  producer_amount_cents integer not null default 0 check (producer_amount_cents >= 0),
  platform_amount_cents integer not null default 0 check (platform_amount_cents >= 0),
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_statements (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete cascade,
  creator_type text not null check (creator_type in ('artist', 'producer', 'platform')),
  creator_name text,
  statement_month date not null,
  stream_count integer not null default 0,
  video_view_count integer not null default 0,
  beat_sale_count integer not null default 0,
  purchase_count integer not null default 0,
  subscriber_count integer not null default 0,
  gross_amount_cents integer not null default 0,
  artist_amount_cents integer not null default 0,
  producer_amount_cents integer not null default 0,
  platform_amount_cents integer not null default 0,
  paid_amount_cents integer not null default 0,
  pending_amount_cents integer not null default 0,
  currency text not null default 'USD',
  status text not null default 'draft' check (status in ('draft', 'final', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_user_id, creator_type, statement_month)
);

create table if not exists public.storefront_items (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete set null,
  creator_type text not null check (creator_type in ('artist', 'producer', 'platform')),
  creator_name text,
  item_id text not null,
  item_type text not null check (item_type in ('song', 'video', 'album', 'beat', 'playlist', 'exclusive')),
  title text not null,
  description text,
  cover_url text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'USD',
  digital_download_enabled boolean not null default true,
  subscriber_only boolean not null default false,
  exclusive boolean not null default false,
  early_release_until timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, item_type)
);

create table if not exists public.premium_content_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('song', 'video', 'album', 'playlist', 'exclusive')),
  access_type text not null check (access_type in ('subscription', 'purchase', 'admin_grant')),
  source_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, item_id, item_type, access_type)
);

alter table public.songs add column if not exists price_cents integer default 129;
alter table public.songs add column if not exists subscriber_only boolean default false;
alter table public.songs add column if not exists exclusive boolean default false;
alter table public.songs add column if not exists early_release_until timestamptz;
alter table public.videos add column if not exists price_cents integer default 199;
alter table public.videos add column if not exists subscriber_only boolean default false;
alter table public.videos add column if not exists exclusive boolean default false;
alter table public.videos add column if not exists early_release_until timestamptz;
alter table public.albums add column if not exists price_cents integer default 499;
alter table public.albums add column if not exists subscriber_only boolean default false;
alter table public.albums add column if not exists exclusive boolean default false;
alter table public.albums add column if not exists early_release_until timestamptz;
alter table public.playlists add column if not exists subscriber_only boolean default false;
alter table public.playlists add column if not exists exclusive boolean default false;

create index if not exists creator_subscribers_creator_idx on public.creator_subscribers (creator_user_id, creator_type, status);
create index if not exists creator_subscribers_subscriber_idx on public.creator_subscribers (subscriber_user_id, status);
create index if not exists earnings_events_creator_idx on public.earnings_events (creator_user_id, creator_type, occurred_at desc);
create index if not exists earnings_events_item_idx on public.earnings_events (item_type, item_id, event_type);
create index if not exists monthly_statements_creator_idx on public.monthly_statements (creator_user_id, creator_type, statement_month desc);
create index if not exists storefront_items_creator_idx on public.storefront_items (creator_user_id, creator_type, status);
create index if not exists storefront_items_item_idx on public.storefront_items (item_type, item_id);
create index if not exists premium_content_access_user_idx on public.premium_content_access (user_id, item_type, item_id);

alter table public.creator_subscribers enable row level security;
alter table public.earnings_events enable row level security;
alter table public.monthly_statements enable row level security;
alter table public.storefront_items enable row level security;
alter table public.premium_content_access enable row level security;

drop policy if exists "Users can read own creator subscriptions" on public.creator_subscribers;
create policy "Users can read own creator subscriptions"
on public.creator_subscribers
for select
to authenticated
using (subscriber_user_id = auth.uid() or creator_user_id = auth.uid());

drop policy if exists "Users can manage own creator subscriptions" on public.creator_subscribers;
create policy "Users can manage own creator subscriptions"
on public.creator_subscribers
for insert
to authenticated
with check (subscriber_user_id = auth.uid());

drop policy if exists "Creators can read own earnings events" on public.earnings_events;
create policy "Creators can read own earnings events"
on public.earnings_events
for select
to authenticated
using (creator_user_id = auth.uid());

drop policy if exists "Creators can read own monthly statements" on public.monthly_statements;
create policy "Creators can read own monthly statements"
on public.monthly_statements
for select
to authenticated
using (creator_user_id = auth.uid());

drop policy if exists "Anyone can read active storefront items" on public.storefront_items;
create policy "Anyone can read active storefront items"
on public.storefront_items
for select
to authenticated
using (status = 'active' or creator_user_id = auth.uid());

drop policy if exists "Creators can manage own storefront items" on public.storefront_items;
create policy "Creators can manage own storefront items"
on public.storefront_items
for insert
to authenticated
with check (creator_user_id = auth.uid());

drop policy if exists "Users can read own premium access" on public.premium_content_access;
create policy "Users can read own premium access"
on public.premium_content_access
for select
to authenticated
using (user_id = auth.uid());

grant select, insert on public.creator_subscribers to authenticated;
grant select on public.earnings_events to authenticated;
grant select on public.monthly_statements to authenticated;
grant select, insert on public.storefront_items to authenticated;
grant select on public.premium_content_access to authenticated;
