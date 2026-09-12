-- Subscription go-live wiring (Phase 1): Stripe Price ID backfill hooks.
-- Populate subscription_plans.stripe_price_id after creating Products/Prices in Stripe Dashboard.
-- Env fallbacks (server-side only): STRIPE_PRICE_ID_LISTENER_MONTHLY, STRIPE_PRICE_ID_ARTIST_MONTHLY, STRIPE_PRICE_ID_PRODUCER_MONTHLY

-- Canonical monthly plans (names must match lib/billing/plan-catalog.ts)
comment on column public.subscription_plans.stripe_price_id is
  'Stripe Price ID (price_...) for recurring checkout. Falls back to STRIPE_PRICE_ID_* env vars when null.';

-- Optional manual backfill example (replace placeholders before running):
-- update public.subscription_plans set stripe_price_id = 'price_ARTIST_MONTHLY' where name in ('Artist Pro', 'Artist Monthly') and price_cents = 999;
-- update public.subscription_plans set stripe_price_id = 'price_PRODUCER_MONTHLY' where name in ('Producer Pro', 'Producer Monthly') and price_cents = 1499;
-- update public.subscription_plans set stripe_price_id = 'price_LISTENER_MONTHLY' where name in ('Premium Listener', 'Listener Monthly') and price_cents = 699;

notify pgrst, 'reload schema';
