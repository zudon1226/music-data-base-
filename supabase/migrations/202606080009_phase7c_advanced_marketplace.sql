-- Phase 7C - Advanced Marketplace
-- Additive foundation for featured stores, storefront customization,
-- discounts, bundles, limited releases, and preorders.

create extension if not exists pgcrypto;

create table if not exists public.marketplace_storefront_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  creator_type text not null check (creator_type in ('artist', 'producer')),
  creator_id text,
  display_name text not null default '',
  banner_url text,
  avatar_url text,
  bio text,
  theme_color text not null default '#22d3ee',
  promo_message text,
  featured_release_id text,
  social_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, creator_type, creator_id)
);

create table if not exists public.marketplace_featured_placements (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete set null,
  creator_type text not null check (creator_type in ('artist', 'producer', 'platform')),
  creator_id text,
  creator_name text not null default '',
  title text not null,
  description text not null default '',
  cover_url text,
  placement_area text not null default 'marketplace_home',
  sort_order integer not null default 100,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_discount_codes (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete cascade,
  creator_type text not null default 'platform' check (creator_type in ('artist', 'producer', 'platform')),
  code text not null unique,
  label text not null default '',
  discount_type text not null default 'percent' check (discount_type in ('percent', 'fixed')),
  percent_off integer not null default 0 check (percent_off >= 0 and percent_off <= 100),
  amount_off_cents integer not null default 0 check (amount_off_cents >= 0),
  applies_to text not null default 'store' check (applies_to in ('songs', 'albums', 'beats', 'store')),
  max_redemptions integer,
  redemption_count integer not null default 0 check (redemption_count >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'expired')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_bundles (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete cascade,
  creator_type text not null check (creator_type in ('artist', 'producer', 'platform')),
  creator_name text not null default '',
  title text not null,
  description text not null default '',
  cover_url text,
  price_cents integer not null default 0 check (price_cents >= 0),
  original_price_cents integer not null default 0 check (original_price_cents >= 0),
  currency text not null default 'USD',
  limited_quantity integer,
  sold_count integer not null default 0 check (sold_count >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'sold_out', 'archived')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.marketplace_bundles(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('song', 'video', 'album', 'beat')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (bundle_id, item_id, item_type)
);

create table if not exists public.marketplace_preorders (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete cascade,
  buyer_user_id uuid references auth.users(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('song', 'video', 'album', 'beat')),
  title text not null,
  creator_name text not null default '',
  cover_url text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'USD',
  release_date date,
  status text not null default 'reserved' check (status in ('reserved', 'paid', 'fulfilled', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_user_id, item_id, item_type)
);

create index if not exists marketplace_storefront_settings_user_idx
on public.marketplace_storefront_settings (user_id, creator_type, active);

create index if not exists marketplace_featured_placements_active_idx
on public.marketplace_featured_placements (active, placement_area, sort_order, starts_at desc);

create index if not exists marketplace_discount_codes_status_idx
on public.marketplace_discount_codes (status, applies_to, starts_at desc);

create index if not exists marketplace_bundles_creator_idx
on public.marketplace_bundles (creator_user_id, creator_type, status, created_at desc);

create index if not exists marketplace_bundle_items_bundle_idx
on public.marketplace_bundle_items (bundle_id, sort_order);

create index if not exists marketplace_preorders_buyer_idx
on public.marketplace_preorders (buyer_user_id, status, created_at desc);

alter table public.marketplace_storefront_settings enable row level security;
alter table public.marketplace_featured_placements enable row level security;
alter table public.marketplace_discount_codes enable row level security;
alter table public.marketplace_bundles enable row level security;
alter table public.marketplace_bundle_items enable row level security;
alter table public.marketplace_preorders enable row level security;

drop policy if exists "Anyone can read active marketplace storefronts" on public.marketplace_storefront_settings;
create policy "Anyone can read active marketplace storefronts"
on public.marketplace_storefront_settings
for select
to authenticated
using (active = true or user_id = auth.uid());

drop policy if exists "Creators can manage own marketplace storefronts" on public.marketplace_storefront_settings;
create policy "Creators can manage own marketplace storefronts"
on public.marketplace_storefront_settings
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Anyone can read active featured placements" on public.marketplace_featured_placements;
create policy "Anyone can read active featured placements"
on public.marketplace_featured_placements
for select
to authenticated
using (active = true or creator_user_id = auth.uid());

drop policy if exists "Creators can manage own featured placements" on public.marketplace_featured_placements;
create policy "Creators can manage own featured placements"
on public.marketplace_featured_placements
for all
to authenticated
using (creator_user_id = auth.uid())
with check (creator_user_id = auth.uid());

drop policy if exists "Anyone can read active discount codes" on public.marketplace_discount_codes;
create policy "Anyone can read active discount codes"
on public.marketplace_discount_codes
for select
to authenticated
using (status = 'active' or creator_user_id = auth.uid());

drop policy if exists "Creators can manage own discount codes" on public.marketplace_discount_codes;
create policy "Creators can manage own discount codes"
on public.marketplace_discount_codes
for all
to authenticated
using (creator_user_id = auth.uid())
with check (creator_user_id = auth.uid());

drop policy if exists "Anyone can read active marketplace bundles" on public.marketplace_bundles;
create policy "Anyone can read active marketplace bundles"
on public.marketplace_bundles
for select
to authenticated
using (status = 'active' or creator_user_id = auth.uid());

drop policy if exists "Creators can manage own marketplace bundles" on public.marketplace_bundles;
create policy "Creators can manage own marketplace bundles"
on public.marketplace_bundles
for all
to authenticated
using (creator_user_id = auth.uid())
with check (creator_user_id = auth.uid());

drop policy if exists "Anyone can read marketplace bundle items" on public.marketplace_bundle_items;
create policy "Anyone can read marketplace bundle items"
on public.marketplace_bundle_items
for select
to authenticated
using (
  exists (
    select 1
    from public.marketplace_bundles b
    where b.id = bundle_id
      and (b.status = 'active' or b.creator_user_id = auth.uid())
  )
);

drop policy if exists "Creators can manage own marketplace bundle items" on public.marketplace_bundle_items;
create policy "Creators can manage own marketplace bundle items"
on public.marketplace_bundle_items
for all
to authenticated
using (
  exists (
    select 1
    from public.marketplace_bundles b
    where b.id = bundle_id
      and b.creator_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.marketplace_bundles b
    where b.id = bundle_id
      and b.creator_user_id = auth.uid()
  )
);

drop policy if exists "Users can read own marketplace preorders" on public.marketplace_preorders;
create policy "Users can read own marketplace preorders"
on public.marketplace_preorders
for select
to authenticated
using (buyer_user_id = auth.uid() or creator_user_id = auth.uid());

drop policy if exists "Users can create own marketplace preorders" on public.marketplace_preorders;
create policy "Users can create own marketplace preorders"
on public.marketplace_preorders
for insert
to authenticated
with check (buyer_user_id = auth.uid());

grant select, insert, update, delete on public.marketplace_storefront_settings to authenticated;
grant select, insert, update, delete on public.marketplace_featured_placements to authenticated;
grant select, insert, update, delete on public.marketplace_discount_codes to authenticated;
grant select, insert, update, delete on public.marketplace_bundles to authenticated;
grant select, insert, update, delete on public.marketplace_bundle_items to authenticated;
grant select, insert on public.marketplace_preorders to authenticated;
