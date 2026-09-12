# Phase 6 Production Environment

Set these before public launch.

## Required Environment Variables
- `NEXT_PUBLIC_SITE_URL`: `https://digitalmusicdatabase.com`.
- `NEXT_PUBLIC_SUPABASE_URL`: production Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: production Supabase anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: production service role key. Server only. Never expose this in the browser.
- `NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED`: **`true` during public beta** (or omit — defaults to locked). Set to `false` only at full launch to enable paid sponsor checkout.
- `NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED`: **`true` during public beta** (or omit — defaults to locked). Set to `false` only at full launch to enable Artist/Producer/Listener paid subscription checkout.

## Billing / Stripe (server-only secrets — never expose client-side)
- `STRIPE_SECRET_KEY`: Stripe secret key for Checkout, Customers, and webhooks.
- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret for **subscriptions only**. Register endpoint (TEST mode for validation; LIVE only at full launch):
  - Subscriptions: `POST /api/subscriptions/webhooks/stripe`
    - Events: `checkout.session.completed` (subscription mode), `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `STRIPE_MARKETPLACE_WEBHOOK_SECRET`: Separate signing secret for marketplace/Connect webhooks (`POST /api/marketplace/webhooks/stripe`). Must not be reused for subscription webhooks.
- `BILLING_PAYMENT_PROVIDER`: `stripe` | `paypal` | `test` (test blocked in production).
- `CRON_SECRET`: Authorizes `/api/subscriptions/jobs` renewal/reminder cron.
- `STRIPE_PRICE_ID_LISTENER_MONTHLY`: Stripe Price ID for Premium/Listener Monthly ($6.99).
- `STRIPE_PRICE_ID_ARTIST_MONTHLY`: Stripe Price ID for Artist Pro + Artist Monthly ($9.99/month, shared price).
- `STRIPE_PRICE_ID_ARTIST_ANNUAL`: Stripe Price ID for Artist Annual ($99.99/year).
- `STRIPE_PRICE_ID_PRODUCER_MONTHLY`: Stripe Price ID for Producer Pro + Producer Monthly ($14.99/month, shared price).
- `STRIPE_PRICE_ID_PRODUCER_ANNUAL`: Stripe Price ID for Producer Annual ($149.99/year).

## Stripe TEST MODE validation (public beta)
1. Add `STRIPE_SECRET_KEY=sk_test_…` and `STRIPE_WEBHOOK_SECRET=whsec_…` to `.env.local` only (never commit).
2. Set `BILLING_PAYMENT_PROVIDER=stripe`.
3. Run `node scripts/apply-subscription-foundation-migrations.mjs` (subscription catalog migrations only).
4. Run `node scripts/apply-connect-foundation-migrations.mjs` (Connect payout foundation migrations only).
4. Use existing NEW Music Data Base TEST catalog price IDs in env / `subscription_plans.stripe_price_id` — do not create new Stripe products during controlled deploy.
5. Forward webhooks locally: `stripe listen --forward-to localhost:3000/api/subscriptions/webhooks/stripe`.
6. Run `node scripts/report-stripe-configuration.mjs` and subscription verify scripts in `npm run verify:billing`.
7. Keep `NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED=true` during public beta.
8. Use Stripe test cards only. Do not enable live payments.

## Supabase Auth Settings
- Add the production domain to Site URL.
- Add production callback URLs.
- Add local development callback URLs only for development.
- Confirm email login and session refresh work after deployment.

Production values:
- Site URL: `https://digitalmusicdatabase.com`
- Redirect URL: `https://digitalmusicdatabase.com`
- Optional www redirect URL: `https://www.digitalmusicdatabase.com`

## Required SQL
Run these in Supabase SQL Editor, in order:
1. `supabase/migrations/202606080006_phase6_launch_readiness.sql`
2. `supabase/migrations/202606080007_phase6_storage_buckets.sql`

## Launch Health Checks
- `/api/launch/status`
- `/api/launch/checklist`
- `/api/launch/admin?userId=<admin-user-id>`
- `/api/sales`
- `/api/licenses`
- `/api/songs`
- `/api/videos`
- `/api/albums`
- `/api/playlists`
- `/api/library-saves?userId=<user-id>`

## Admin Setup
To make a user an admin after running Phase 6 SQL:

```sql
update public.profiles
set account_type = 'admin',
    is_admin = true,
    updated_at = now()
where user_id = '<USER_ID>' or id = '<USER_ID>';

insert into public.user_roles (user_id, role, status)
values ('<USER_ID>', 'admin', 'active')
on conflict (user_id, role)
do update set status = 'active', updated_at = now();
```

## Storage Buckets
Expected buckets:
- `songs`
- `videos`
- `covers`
- `albums`
- `producer-beats`
- `licenses`
- `downloads`

Use `/api/launch/status` to confirm they exist.
