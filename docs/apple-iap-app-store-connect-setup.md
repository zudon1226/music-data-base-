# App Store Connect — staging sandbox setup (manual)

**Do not** create products, enable production pricing, or activate live sales from this repo. Use this as an operator checklist when you have App Store Connect access.

**Bundle ID:** `com.digitalmusicdatabase.app`  
**Staging DB registry:** `public.apple_catalog_skus` on `jzlegcbotqfzevtczwhx` (all six rows **`active = false`**, `mdb_catalog_tier = staging_dev_only`).

## Six product IDs (exact)

| # | App Store product ID | MDB `entity_type` | App Store Connect product type | Subscription group |
|---|----------------------|-------------------|--------------------------------|--------------------|
| 1 | `com.digitalmusicdatabase.app.staging.subscription.listener.monthly` | `subscription` | **Auto-renewable subscription** | **MDB Staging — Listener** (new group) |
| 2 | `com.digitalmusicdatabase.app.staging.subscription.artist.monthly` | `subscription` | **Auto-renewable subscription** | **MDB Staging — Creator** (same group as artist/producer or separate — recommend **one group** “MDB Staging Subscriptions”) |
| 3 | `com.digitalmusicdatabase.app.staging.subscription.producer.monthly` | `subscription` | **Auto-renewable subscription** | Same group as #2 |
| 4 | `com.digitalmusicdatabase.app.staging.album.test` | `album` | **Non-consumable** (or Non-renewing if you prefer; match StoreKit product type in Connect) | — |
| 5 | `com.digitalmusicdatabase.app.staging.ringtone.test` | `ringtone` | **Non-consumable** | — |
| 6 | `com.digitalmusicdatabase.app.staging.beat.basic.test` | `beat_license` (`Basic`) | **Non-consumable** | — |

### MDB plan / entity mapping

| Product ID | `plan_slug` / entity |
|------------|----------------------|
| listener monthly | `premium-listener`, billing `month` |
| artist monthly | `artist-pro`, billing `month` |
| producer monthly | `producer-pro`, billing `month` |
| album test | fixture album UUID `11111111-1111-4111-8111-111111111101` |
| ringtone test | fixture UUID `11111111-1111-4111-8111-111111111102` |
| beat basic test | fixture UUID `11111111-1111-4111-8111-111111111103`, license `Basic` |

## Subscription group layout (recommended)

1. Create subscription group: **“MDB Staging Subscriptions (DEV)”**
2. Add three subscriptions (IDs above) — **duration 1 month**, reference names prefixed `STAGING DEV`.
3. Do **not** submit for App Review for production sale; use **Sandbox** testing only.
4. Pricing: use minimum / placeholder tiers for sandbox; **no production go-live**.

## One-time products

Create three **Non-consumable** IAPs with the exact product IDs for album, ringtone, and beat license. Display names should clearly say **STAGING DEV**.

## Server notifications (after preview URL exists)

- **Version:** App Store Server Notifications **V2**
- **Sandbox URL:** `https://<preview-host>/api/apple/notifications?environment=Sandbox`
- Test with Apple’s “Send Test Notification” in Connect.

## Sandbox testers

1. App Store Connect → **Users and Access** → **Sandbox** → **Testers**.
2. Create dedicated testers (e.g. `mdb-sandbox-listener@…`, `mdb-sandbox-artist@…`) — **not** production Apple IDs used for real purchases.
3. On device: **Settings → App Store → Sandbox Account** (iOS) — sign in with sandbox tester.
4. Install app via Xcode debug or TestFlight **internal** only.
5. Purchases bill **sandbox**; no real money.

## Aligning Connect with MDB catalog

- StoreKit `loadProducts` only returns IDs that exist in Connect **and** are listed from `GET /api/apple/products`.
- That API returns **`active = true`** rows only. For sandbox load tests on staging, an operator may set specific rows to `active = true` **only on staging DB** — never enable production sales or flip SKUs on production.

```sql
-- STAGING ONLY example (run via guarded scripts / staging SQL editor):
-- update public.apple_catalog_skus set active = true
-- where apple_product_id like 'com.digitalmusicdatabase.app.staging.%';
```

Keep `metadata.production_sales_blocked = true` and beta commerce lock in the app.

## What not to do

- No production pricing activation or “Ready for Sale” for staging IDs on the live app listing.
- No removal of `APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED`.
- No `NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED=false` for public beta QA.
