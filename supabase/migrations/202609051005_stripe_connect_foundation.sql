-- Stripe Connect foundation for Artist/Producer payout onboarding (TEST/LIVE agnostic).
-- Stores only Stripe account IDs and sync status — never bank/identity data.

create table if not exists public.creator_payment_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_type text not null check (creator_type in ('artist', 'producer')),
  stripe_connect_account_id text,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'pending', 'complete', 'restricted', 'disabled')),
  payouts_enabled boolean not null default false,
  charges_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, creator_type)
);

create index if not exists creator_payment_profiles_user_idx
  on public.creator_payment_profiles (user_id);

create index if not exists creator_payment_profiles_stripe_account_idx
  on public.creator_payment_profiles (stripe_connect_account_id)
  where stripe_connect_account_id is not null;

alter table public.creator_payment_profiles enable row level security;

revoke all privileges on table public.creator_payment_profiles from anon;
revoke truncate, references, trigger on table public.creator_payment_profiles from authenticated;
grant select, insert, update on table public.creator_payment_profiles to authenticated;
grant all privileges on table public.creator_payment_profiles to service_role;

drop policy if exists creator_payment_profiles_owner_read on public.creator_payment_profiles;
create policy creator_payment_profiles_owner_read
  on public.creator_payment_profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists creator_payment_profiles_owner_insert on public.creator_payment_profiles;
create policy creator_payment_profiles_owner_insert
  on public.creator_payment_profiles for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists creator_payment_profiles_owner_update on public.creator_payment_profiles;
create policy creator_payment_profiles_owner_update
  on public.creator_payment_profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists platform_admin_full_access on public.creator_payment_profiles;
create policy platform_admin_full_access
  on public.creator_payment_profiles for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Earnings reversal audit trail (refunds/chargebacks).
alter table public.earnings_events
  add column if not exists reversal_of_source_id text;

alter table public.earnings_events
  add column if not exists is_reversal boolean not null default false;

create index if not exists earnings_events_creator_balance_idx
  on public.earnings_events (creator_user_id, creator_type, occurred_at desc)
  where creator_user_id is not null;

notify pgrst, 'reload schema';
