-- Ringtone Platform Phase 1 foundation: normalized tables, lifecycle, helpers, and RLS.
-- Does not mutate existing music/video marketplace data.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_public_ringtone_status(status text)
returns boolean
language sql
immutable
as $$
  select status in ('approved', 'published');
$$;

create or replace function public.can_create_ringtones(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    check_user_id is not null
    and (
      public.is_platform_admin(check_user_id)
      or exists (
        select 1
        from public.user_roles
        where user_id = check_user_id
          and status = 'active'
          and role in ('admin', 'artist', 'producer', 'creator')
      )
      or exists (
        select 1
        from public.profiles
        where (id = check_user_id or user_id = check_user_id)
          and (
            is_admin = true
            or lower(coalesce(account_type, '')) in ('admin', 'artist', 'producer', 'creator')
          )
      )
      or exists (
        select 1
        from public.artist_profiles
        where user_id = check_user_id
      )
      or exists (
        select 1
        from public.producer_profiles
        where user_id = check_user_id
      )
    );
$$;

create or replace function public.touch_ringtone_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_ringtone_clip_bounds()
returns trigger
language plpgsql
as $$
begin
  if new.duration_seconds is null
     or new.duration_seconds < 15
     or new.duration_seconds > 30 then
    raise exception 'ringtone duration_seconds must be between 15 and 30';
  end if;

  if new.clip_start_seconds is null or new.clip_start_seconds < 0 then
    raise exception 'ringtone clip_start_seconds must be >= 0';
  end if;

  if new.clip_end_seconds is null or new.clip_end_seconds <= new.clip_start_seconds then
    raise exception 'ringtone clip_end_seconds must be greater than clip_start_seconds';
  end if;

  if round((new.clip_end_seconds - new.clip_start_seconds)::numeric, 3) <> round(new.duration_seconds::numeric, 3) then
    raise exception 'ringtone duration_seconds must equal clip_end_seconds - clip_start_seconds';
  end if;

  if new.price_cents is null or new.price_cents < 0 then
    raise exception 'ringtone price_cents must be >= 0';
  end if;

  if new.currency is null or length(trim(new.currency)) <> 3 then
    raise exception 'ringtone currency must be a 3-letter code';
  end if;

  new.currency = upper(trim(new.currency));
  return new;
end;
$$;

grant execute on function public.is_public_ringtone_status(text) to anon, authenticated, service_role;
grant execute on function public.can_create_ringtones(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.ringtone_products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  source_song_id uuid null references public.songs(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  artwork_url text not null default '',
  preview_url text not null default '',
  ringtone_file_url text not null default '',
  iphone_file_url text not null default '',
  android_file_url text not null default '',
  duration_seconds numeric(6,3) not null default 30
    check (duration_seconds >= 15 and duration_seconds <= 30),
  clip_start_seconds numeric(10,3) not null default 0
    check (clip_start_seconds >= 0),
  clip_end_seconds numeric(10,3) not null default 30,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  status text not null default 'draft' check (
    status in (
      'draft',
      'processing',
      'pending_review',
      'approved',
      'rejected',
      'published',
      'suspended',
      'archived'
    )
  ),
  is_featured boolean not null default false,
  is_explicit boolean not null default false,
  ownership_confirmed boolean not null default false,
  source_kind text not null default 'upload' check (source_kind in ('owned_song', 'upload')),
  source_storage_path text not null default '',
  preview_storage_path text not null default '',
  download_storage_path text not null default '',
  iphone_storage_path text not null default '',
  android_storage_path text not null default '',
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  constraint ringtone_products_clip_window_check check (clip_end_seconds > clip_start_seconds),
  constraint ringtone_products_duration_matches_clip_check check (
    round((clip_end_seconds - clip_start_seconds)::numeric, 3) = round(duration_seconds::numeric, 3)
  )
);

create index if not exists ringtone_products_creator_id_idx
  on public.ringtone_products (creator_id);
create index if not exists ringtone_products_status_idx
  on public.ringtone_products (status);
create index if not exists ringtone_products_source_song_id_idx
  on public.ringtone_products (source_song_id);
create index if not exists ringtone_products_published_at_idx
  on public.ringtone_products (published_at desc nulls last);
create index if not exists ringtone_products_public_catalog_idx
  on public.ringtone_products (status, is_featured, published_at desc)
  where status in ('approved', 'published');

drop trigger if exists ringtone_products_touch_updated_at on public.ringtone_products;
create trigger ringtone_products_touch_updated_at
before update on public.ringtone_products
for each row execute function public.touch_ringtone_updated_at();

drop trigger if exists ringtone_products_validate_clip on public.ringtone_products;
create trigger ringtone_products_validate_clip
before insert or update on public.ringtone_products
for each row execute function public.validate_ringtone_clip_bounds();

create table if not exists public.ringtone_purchases (
  id uuid primary key default gen_random_uuid(),
  ringtone_id uuid not null references public.ringtone_products(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  creator_earnings_cents integer not null default 0 check (creator_earnings_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  payment_status text not null default 'pending' check (
    payment_status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')
  ),
  payment_provider text not null default '',
  payment_reference text not null default '',
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ringtone_purchases_fee_split_check check (
    platform_fee_cents + creator_earnings_cents = amount_cents
  )
);

create index if not exists ringtone_purchases_ringtone_id_idx
  on public.ringtone_purchases (ringtone_id);
create index if not exists ringtone_purchases_buyer_id_idx
  on public.ringtone_purchases (buyer_id);
create index if not exists ringtone_purchases_creator_id_idx
  on public.ringtone_purchases (creator_id);
create index if not exists ringtone_purchases_payment_status_idx
  on public.ringtone_purchases (payment_status);
create unique index if not exists ringtone_purchases_paid_buyer_ringtone_uidx
  on public.ringtone_purchases (buyer_id, ringtone_id)
  where payment_status = 'paid';

drop trigger if exists ringtone_purchases_touch_updated_at on public.ringtone_purchases;
create trigger ringtone_purchases_touch_updated_at
before update on public.ringtone_purchases
for each row execute function public.touch_ringtone_updated_at();

create table if not exists public.ringtone_downloads (
  id uuid primary key default gen_random_uuid(),
  ringtone_id uuid not null references public.ringtone_products(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.ringtone_purchases(id) on delete cascade,
  device_type text not null check (device_type in ('iphone', 'android', 'other')),
  downloaded_at timestamptz not null default now()
);

create index if not exists ringtone_downloads_ringtone_id_idx
  on public.ringtone_downloads (ringtone_id);
create index if not exists ringtone_downloads_buyer_id_idx
  on public.ringtone_downloads (buyer_id);
create index if not exists ringtone_downloads_purchase_id_idx
  on public.ringtone_downloads (purchase_id);

create table if not exists public.ringtone_favorites (
  id uuid primary key default gen_random_uuid(),
  ringtone_id uuid not null references public.ringtone_products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (ringtone_id, user_id)
);

create index if not exists ringtone_favorites_user_id_idx
  on public.ringtone_favorites (user_id);

create table if not exists public.ringtone_reviews (
  id uuid primary key default gen_random_uuid(),
  ringtone_id uuid not null references public.ringtone_products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review text not null default '' check (char_length(review) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ringtone_id, user_id)
);

create index if not exists ringtone_reviews_ringtone_id_idx
  on public.ringtone_reviews (ringtone_id);

drop trigger if exists ringtone_reviews_touch_updated_at on public.ringtone_reviews;
create trigger ringtone_reviews_touch_updated_at
before update on public.ringtone_reviews
for each row execute function public.touch_ringtone_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------

alter table public.ringtone_products enable row level security;
alter table public.ringtone_purchases enable row level security;
alter table public.ringtone_downloads enable row level security;
alter table public.ringtone_favorites enable row level security;
alter table public.ringtone_reviews enable row level security;

revoke all privileges on table public.ringtone_products from anon;
revoke all privileges on table public.ringtone_purchases from anon;
revoke all privileges on table public.ringtone_downloads from anon;
revoke all privileges on table public.ringtone_favorites from anon;
revoke all privileges on table public.ringtone_reviews from anon;

grant select on table public.ringtone_products to anon;
grant select on table public.ringtone_reviews to anon;
grant select, insert, update, delete on table public.ringtone_products to authenticated;
grant select, insert, update, delete on table public.ringtone_purchases to authenticated;
grant select, insert, update, delete on table public.ringtone_downloads to authenticated;
grant select, insert, update, delete on table public.ringtone_favorites to authenticated;
grant select, insert, update, delete on table public.ringtone_reviews to authenticated;

revoke truncate, references, trigger on table public.ringtone_products from authenticated;
revoke truncate, references, trigger on table public.ringtone_purchases from authenticated;
revoke truncate, references, trigger on table public.ringtone_downloads from authenticated;
revoke truncate, references, trigger on table public.ringtone_favorites from authenticated;
revoke truncate, references, trigger on table public.ringtone_reviews from authenticated;

grant all privileges on table public.ringtone_products to service_role;
grant all privileges on table public.ringtone_purchases to service_role;
grant all privileges on table public.ringtone_downloads to service_role;
grant all privileges on table public.ringtone_favorites to service_role;
grant all privileges on table public.ringtone_reviews to service_role;

-- Admin full access
drop policy if exists platform_admin_full_access on public.ringtone_products;
create policy platform_admin_full_access
on public.ringtone_products
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists platform_admin_full_access on public.ringtone_purchases;
create policy platform_admin_full_access
on public.ringtone_purchases
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists platform_admin_full_access on public.ringtone_downloads;
create policy platform_admin_full_access
on public.ringtone_downloads
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists platform_admin_full_access on public.ringtone_favorites;
create policy platform_admin_full_access
on public.ringtone_favorites
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists platform_admin_full_access on public.ringtone_reviews;
create policy platform_admin_full_access
on public.ringtone_reviews
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Products: public catalog metadata for approved/published only
drop policy if exists ringtone_products_public_catalog_read on public.ringtone_products;
create policy ringtone_products_public_catalog_read
on public.ringtone_products
for select
to anon, authenticated
using (public.is_public_ringtone_status(status));

drop policy if exists ringtone_products_creator_read_own on public.ringtone_products;
create policy ringtone_products_creator_read_own
on public.ringtone_products
for select
to authenticated
using (creator_id = auth.uid());

drop policy if exists ringtone_products_creator_insert_own on public.ringtone_products;
create policy ringtone_products_creator_insert_own
on public.ringtone_products
for insert
to authenticated
with check (
  creator_id = auth.uid()
  and public.can_create_ringtones(auth.uid())
  and status in ('draft', 'processing', 'pending_review')
);

drop policy if exists ringtone_products_creator_update_own on public.ringtone_products;
create policy ringtone_products_creator_update_own
on public.ringtone_products
for update
to authenticated
using (
  creator_id = auth.uid()
  and status in ('draft', 'processing', 'pending_review', 'rejected')
)
with check (
  creator_id = auth.uid()
  and status in ('draft', 'processing', 'pending_review', 'rejected')
);

drop policy if exists ringtone_products_creator_delete_own_drafts on public.ringtone_products;
create policy ringtone_products_creator_delete_own_drafts
on public.ringtone_products
for delete
to authenticated
using (
  creator_id = auth.uid()
  and status in ('draft', 'rejected', 'archived')
);

-- Purchases: buyers and creators can read their rows; no client insert/update/delete of money rows
drop policy if exists ringtone_purchases_buyer_read on public.ringtone_purchases;
create policy ringtone_purchases_buyer_read
on public.ringtone_purchases
for select
to authenticated
using (buyer_id = auth.uid());

drop policy if exists ringtone_purchases_creator_read_earnings on public.ringtone_purchases;
create policy ringtone_purchases_creator_read_earnings
on public.ringtone_purchases
for select
to authenticated
using (creator_id = auth.uid());

-- Downloads: buyers read/write only their own download logs tied to a paid purchase
drop policy if exists ringtone_downloads_buyer_read on public.ringtone_downloads;
create policy ringtone_downloads_buyer_read
on public.ringtone_downloads
for select
to authenticated
using (buyer_id = auth.uid());

drop policy if exists ringtone_downloads_buyer_insert_owned on public.ringtone_downloads;
create policy ringtone_downloads_buyer_insert_owned
on public.ringtone_downloads
for insert
to authenticated
with check (
  buyer_id = auth.uid()
  and exists (
    select 1
    from public.ringtone_purchases p
    where p.id = purchase_id
      and p.buyer_id = auth.uid()
      and p.ringtone_id = ringtone_id
      and p.payment_status = 'paid'
  )
);

-- Favorites: only for publicly listed ringtones
drop policy if exists ringtone_favorites_owner_read on public.ringtone_favorites;
create policy ringtone_favorites_owner_read
on public.ringtone_favorites
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists ringtone_favorites_owner_insert on public.ringtone_favorites;
create policy ringtone_favorites_owner_insert
on public.ringtone_favorites
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ringtone_products r
    where r.id = ringtone_id
      and public.is_public_ringtone_status(r.status)
  )
);

drop policy if exists ringtone_favorites_owner_delete on public.ringtone_favorites;
create policy ringtone_favorites_owner_delete
on public.ringtone_favorites
for delete
to authenticated
using (user_id = auth.uid());

-- Reviews: owners manage own reviews on public ringtones; public can read reviews for public products
drop policy if exists ringtone_reviews_public_read on public.ringtone_reviews;
create policy ringtone_reviews_public_read
on public.ringtone_reviews
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.ringtone_products r
    where r.id = ringtone_id
      and public.is_public_ringtone_status(r.status)
  )
);

drop policy if exists ringtone_reviews_owner_insert on public.ringtone_reviews;
create policy ringtone_reviews_owner_insert
on public.ringtone_reviews
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ringtone_products r
    where r.id = ringtone_id
      and public.is_public_ringtone_status(r.status)
  )
);

drop policy if exists ringtone_reviews_owner_update on public.ringtone_reviews;
create policy ringtone_reviews_owner_update
on public.ringtone_reviews
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists ringtone_reviews_owner_delete on public.ringtone_reviews;
create policy ringtone_reviews_owner_delete
on public.ringtone_reviews
for delete
to authenticated
using (user_id = auth.uid());

notify pgrst, 'reload schema';
