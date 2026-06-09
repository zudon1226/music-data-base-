-- Phase 4 - Creator Monetization Foundation
-- Safe additive migration. No player, upload, album, playlist, library, like, follow,
-- or existing dashboard behavior is removed or rewritten.

create extension if not exists pgcrypto;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  audience text not null default 'creator' check (audience in ('listener', 'artist', 'producer', 'creator', 'admin')),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'USD',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year', 'one_time')),
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription_plans add column if not exists id uuid default gen_random_uuid();
alter table public.subscription_plans add column if not exists name text;
alter table public.subscription_plans add column if not exists audience text default 'creator';
alter table public.subscription_plans add column if not exists price_cents integer default 0;
alter table public.subscription_plans add column if not exists currency text default 'USD';
alter table public.subscription_plans add column if not exists billing_interval text default 'month';
alter table public.subscription_plans add column if not exists features jsonb default '[]'::jsonb;
alter table public.subscription_plans add column if not exists active boolean default true;
alter table public.subscription_plans add column if not exists sort_order integer default 0;
alter table public.subscription_plans add column if not exists created_at timestamptz default now();
alter table public.subscription_plans add column if not exists updated_at timestamptz default now();

update public.subscription_plans set name = 'Creator Free' where name is null or btrim(name) = '';
update public.subscription_plans set audience = 'creator' where audience is null or audience not in ('listener', 'artist', 'producer', 'creator', 'admin');
update public.subscription_plans set price_cents = 0 where price_cents is null or price_cents < 0;
update public.subscription_plans set currency = 'USD' where currency is null or btrim(currency) = '';
update public.subscription_plans set billing_interval = 'month' where billing_interval is null or billing_interval not in ('month', 'year', 'one_time');
update public.subscription_plans set features = '[]'::jsonb where features is null;
update public.subscription_plans set active = true where active is null;
update public.subscription_plans set sort_order = 0 where sort_order is null;
update public.subscription_plans set created_at = now() where created_at is null;
update public.subscription_plans set updated_at = created_at where updated_at is null;

alter table public.subscription_plans alter column id set default gen_random_uuid();
alter table public.subscription_plans alter column name set not null;
alter table public.subscription_plans alter column audience set default 'creator';
alter table public.subscription_plans alter column audience set not null;
alter table public.subscription_plans alter column price_cents set default 0;
alter table public.subscription_plans alter column price_cents set not null;
alter table public.subscription_plans alter column currency set default 'USD';
alter table public.subscription_plans alter column currency set not null;
alter table public.subscription_plans alter column billing_interval set default 'month';
alter table public.subscription_plans alter column billing_interval set not null;
alter table public.subscription_plans alter column features set default '[]'::jsonb;
alter table public.subscription_plans alter column features set not null;
alter table public.subscription_plans alter column active set default true;
alter table public.subscription_plans alter column active set not null;
alter table public.subscription_plans alter column sort_order set default 0;
alter table public.subscription_plans alter column sort_order set not null;
alter table public.subscription_plans alter column created_at set default now();
alter table public.subscription_plans alter column created_at set not null;
alter table public.subscription_plans alter column updated_at set default now();
alter table public.subscription_plans alter column updated_at set not null;

alter table public.subscription_plans drop constraint if exists subscription_plans_audience_check;
alter table public.subscription_plans
  add constraint subscription_plans_audience_check check (audience in ('listener', 'artist', 'producer', 'creator', 'admin'));

alter table public.subscription_plans drop constraint if exists subscription_plans_price_cents_check;
alter table public.subscription_plans
  add constraint subscription_plans_price_cents_check check (price_cents >= 0);

alter table public.subscription_plans drop constraint if exists subscription_plans_billing_interval_check;
alter table public.subscription_plans
  add constraint subscription_plans_billing_interval_check check (billing_interval in ('month', 'year', 'one_time'));

create unique index if not exists subscription_plans_name_interval_idx
on public.subscription_plans (lower(name), billing_interval);

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order)
select 'Creator Free', 'creator', 0, 'USD', 'month', '["Upload music and videos", "Library, likes, follows", "Basic dashboard"]'::jsonb, 10
where not exists (select 1 from public.subscription_plans where lower(name) = lower('Creator Free') and billing_interval = 'month');

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order)
select 'Artist Pro', 'artist', 999, 'USD', 'month', '["Creator payout dashboard", "Revenue split tracking", "Download and purchase foundation", "Priority analytics"]'::jsonb, 20
where not exists (select 1 from public.subscription_plans where lower(name) = lower('Artist Pro') and billing_interval = 'month');

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order)
select 'Producer Pro', 'producer', 1499, 'USD', 'month', '["Beat license tracking", "Producer payout dashboard", "Revenue split tracking", "Download and purchase foundation"]'::jsonb, 30
where not exists (select 1 from public.subscription_plans where lower(name) = lower('Producer Pro') and billing_interval = 'month');

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order)
select 'Platform Admin', 'admin', 0, 'USD', 'month', '["Payout review queue", "Transaction review", "Monetization oversight"]'::jsonb, 40
where not exists (select 1 from public.subscription_plans where lower(name) = lower('Platform Admin') and billing_interval = 'month');

alter table public.subscriptions add column if not exists plan_id uuid references public.subscription_plans(id) on delete set null;
alter table public.subscriptions add column if not exists creator_type text check (creator_type in ('listener', 'artist', 'producer', 'admin'));
alter table public.subscriptions add column if not exists creator_id text;
alter table public.subscriptions add column if not exists metadata jsonb default '{}'::jsonb;

update public.subscriptions set metadata = '{}'::jsonb where metadata is null;

alter table public.transactions add column if not exists creator_user_id uuid references auth.users(id) on delete set null;
alter table public.transactions add column if not exists creator_type text check (creator_type in ('artist', 'producer', 'platform'));
alter table public.transactions add column if not exists creator_name text;
alter table public.transactions add column if not exists gross_amount_cents integer default 0;
alter table public.transactions add column if not exists platform_fee_cents integer default 0;
alter table public.transactions add column if not exists artist_amount_cents integer default 0;
alter table public.transactions add column if not exists producer_amount_cents integer default 0;
alter table public.transactions add column if not exists payout_id uuid;

update public.transactions set gross_amount_cents = amount_cents where gross_amount_cents is null or gross_amount_cents = 0;
update public.transactions set platform_fee_cents = 0 where platform_fee_cents is null;
update public.transactions set artist_amount_cents = 0 where artist_amount_cents is null;
update public.transactions set producer_amount_cents = 0 where producer_amount_cents is null;

alter table public.transactions alter column gross_amount_cents set default 0;
alter table public.transactions alter column platform_fee_cents set default 0;
alter table public.transactions alter column artist_amount_cents set default 0;
alter table public.transactions alter column producer_amount_cents set default 0;

create table if not exists public.revenue_splits (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  item_type text not null check (item_type in ('song', 'video', 'album', 'beat')),
  artist_user_id uuid references auth.users(id) on delete set null,
  producer_id uuid references public.producer_profiles(id) on delete set null,
  producer_user_id uuid references auth.users(id) on delete set null,
  artist_name text,
  producer_name text,
  artist_share integer not null default 70 check (artist_share >= 0 and artist_share <= 100),
  producer_share integer not null default 20 check (producer_share >= 0 and producer_share <= 100),
  platform_share integer not null default 10 check (platform_share >= 0 and platform_share <= 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.revenue_splits add column if not exists id uuid default gen_random_uuid();
alter table public.revenue_splits add column if not exists item_id text;
alter table public.revenue_splits add column if not exists item_type text;
alter table public.revenue_splits add column if not exists artist_user_id uuid references auth.users(id) on delete set null;
alter table public.revenue_splits add column if not exists producer_id uuid references public.producer_profiles(id) on delete set null;
alter table public.revenue_splits add column if not exists producer_user_id uuid references auth.users(id) on delete set null;
alter table public.revenue_splits add column if not exists artist_name text;
alter table public.revenue_splits add column if not exists producer_name text;
alter table public.revenue_splits add column if not exists artist_share integer default 70;
alter table public.revenue_splits add column if not exists producer_share integer default 20;
alter table public.revenue_splits add column if not exists platform_share integer default 10;
alter table public.revenue_splits add column if not exists notes text;
alter table public.revenue_splits add column if not exists created_at timestamptz default now();
alter table public.revenue_splits add column if not exists updated_at timestamptz default now();

update public.revenue_splits set item_type = 'song' where item_type is null or item_type not in ('song', 'video', 'album', 'beat');
update public.revenue_splits set item_id = id::text where item_id is null or btrim(item_id) = '';
update public.revenue_splits set artist_share = 70 where artist_share is null or artist_share < 0 or artist_share > 100;
update public.revenue_splits set producer_share = 20 where producer_share is null or producer_share < 0 or producer_share > 100;
update public.revenue_splits set platform_share = 10 where platform_share is null or platform_share < 0 or platform_share > 100;
update public.revenue_splits set created_at = now() where created_at is null;
update public.revenue_splits set updated_at = created_at where updated_at is null;

alter table public.revenue_splits alter column id set default gen_random_uuid();
alter table public.revenue_splits alter column item_id set not null;
alter table public.revenue_splits alter column item_type set not null;
alter table public.revenue_splits alter column artist_share set default 70;
alter table public.revenue_splits alter column artist_share set not null;
alter table public.revenue_splits alter column producer_share set default 20;
alter table public.revenue_splits alter column producer_share set not null;
alter table public.revenue_splits alter column platform_share set default 10;
alter table public.revenue_splits alter column platform_share set not null;
alter table public.revenue_splits alter column created_at set default now();
alter table public.revenue_splits alter column created_at set not null;
alter table public.revenue_splits alter column updated_at set default now();
alter table public.revenue_splits alter column updated_at set not null;

alter table public.revenue_splits drop constraint if exists revenue_splits_item_type_check;
alter table public.revenue_splits
  add constraint revenue_splits_item_type_check check (item_type in ('song', 'video', 'album', 'beat'));

alter table public.revenue_splits drop constraint if exists revenue_splits_artist_share_check;
alter table public.revenue_splits
  add constraint revenue_splits_artist_share_check check (artist_share >= 0 and artist_share <= 100);

alter table public.revenue_splits drop constraint if exists revenue_splits_producer_share_check;
alter table public.revenue_splits
  add constraint revenue_splits_producer_share_check check (producer_share >= 0 and producer_share <= 100);

alter table public.revenue_splits drop constraint if exists revenue_splits_platform_share_check;
alter table public.revenue_splits
  add constraint revenue_splits_platform_share_check check (platform_share >= 0 and platform_share <= 100);

alter table public.revenue_splits drop constraint if exists revenue_splits_total_check;
alter table public.revenue_splits
  add constraint revenue_splits_total_check check ((artist_share + producer_share + platform_share) = 100);

alter table public.revenue_splits drop constraint if exists revenue_splits_item_key;
alter table public.revenue_splits
  add constraint revenue_splits_item_key unique (item_id, item_type);

create index if not exists revenue_splits_artist_user_idx on public.revenue_splits (artist_user_id);
create index if not exists revenue_splits_producer_idx on public.revenue_splits (producer_id);
create index if not exists revenue_splits_producer_user_idx on public.revenue_splits (producer_user_id);

alter table public.payouts add column if not exists creator_type text check (creator_type in ('artist', 'producer', 'platform'));
alter table public.payouts add column if not exists creator_name text;
alter table public.payouts add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.payouts add column if not exists reviewed_at timestamptz;
alter table public.payouts add column if not exists notes text;

create index if not exists payouts_creator_type_status_idx on public.payouts (creator_type, status);
create index if not exists transactions_creator_user_idx on public.transactions (creator_user_id, created_at desc);
create index if not exists transactions_creator_type_idx on public.transactions (creator_type, created_at desc);

alter table public.subscription_plans enable row level security;
alter table public.revenue_splits enable row level security;

drop policy if exists "Anyone can read active subscription plans" on public.subscription_plans;
create policy "Anyone can read active subscription plans"
on public.subscription_plans
for select
to authenticated
using (active = true);

drop policy if exists "Users can read revenue splits connected to them" on public.revenue_splits;
create policy "Users can read revenue splits connected to them"
on public.revenue_splits
for select
to authenticated
using (
  artist_user_id = auth.uid()
  or producer_user_id = auth.uid()
  or exists (
    select 1 from public.producer_profiles pp
    where pp.id = revenue_splits.producer_id
      and pp.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own subscription requests" on public.subscriptions;
create policy "Users can insert own subscription requests"
on public.subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can insert own transactions" on public.transactions;
create policy "Users can insert own transactions"
on public.transactions
for insert
to authenticated
with check (user_id = auth.uid() or creator_user_id = auth.uid());

drop policy if exists "Users can insert own payout requests" on public.payouts;
create policy "Users can insert own payout requests"
on public.payouts
for insert
to authenticated
with check (user_id = auth.uid());

grant select on public.subscription_plans to authenticated;
grant select on public.revenue_splits to authenticated;
grant select, insert on public.subscriptions to authenticated;
grant select, insert on public.transactions to authenticated;
grant select, insert on public.payouts to authenticated;
