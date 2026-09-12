-- Artist/Producer annual subscription tiers (Listener remains monthly-only).
-- Preserves existing monthly rows; adds one annual plan per creator role.

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order, description)
select 'Artist Annual', 'artist', 9999, 'USD', 'year',
  '["Creator dashboard","Earnings accumulate while subscribed","Withdrawals when current","Auto-renew by default","Cancel anytime"]'::jsonb,
  22, 'Annual Artist creator subscription ($99.99/year)'
where not exists (
  select 1 from public.subscription_plans
  where lower(name) = lower('Artist Annual') and billing_interval = 'year'
);

insert into public.subscription_plans (name, audience, price_cents, currency, billing_interval, features, sort_order, description)
select 'Producer Annual', 'producer', 14999, 'USD', 'year',
  '["Producer dashboard","Earnings accumulate while subscribed","Withdrawals when current","Auto-renew by default","Cancel anytime"]'::jsonb,
  32, 'Annual Producer creator subscription ($149.99/year)'
where not exists (
  select 1 from public.subscription_plans
  where lower(name) = lower('Producer Annual') and billing_interval = 'year'
);

notify pgrst, 'reload schema';
