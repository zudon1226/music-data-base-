# App Store Connect — sandbox setup checklist (manual)

**Authorization required.** Do not create products or live pricing from automation. Staging DB SKUs remain **`active = false`** until deliberate staging-only load tests.

## Preconditions

- [ ] Apple Developer Program access with App ID **`com.digitalmusicdatabase.app`**
- [ ] Staging Supabase **`jzlegcbotqfzevtczwhx`** — six registry rows present, inactive
- [ ] Vercel Preview deployed (when authorized) with staging env + Apple routes
- [ ] Mac **`xcodebuild`** succeeded (log archived)
- [ ] Sandbox testers created (not production Apple IDs)

## Subscription group

- [ ] Create group: **MDB Staging Subscriptions (DEV)** (name clearly non-production)
- [ ] Add three **auto-renewable** subscriptions (1 month), exact IDs:

| Product ID | Reference name (example) |
|------------|--------------------------|
| `com.digitalmusicdatabase.app.staging.subscription.listener.monthly` | STAGING DEV Listener Monthly |
| `com.digitalmusicdatabase.app.staging.subscription.artist.monthly` | STAGING DEV Artist Monthly |
| `com.digitalmusicdatabase.app.staging.subscription.producer.monthly` | STAGING DEV Producer Monthly |

- [ ] Map to MDB plans: `premium-listener`, `artist-pro`, `producer-pro`
- [ ] **Do not** submit for production sale or enable live pricing

## Non-consumables (one-time)

- [ ] `com.digitalmusicdatabase.app.staging.album.test` — STAGING DEV Test Album
- [ ] `com.digitalmusicdatabase.app.staging.ringtone.test` — STAGING DEV Test Ringtone
- [ ] `com.digitalmusicdatabase.app.staging.beat.basic.test` — STAGING DEV Beat Basic

## Server Notifications V2

- [ ] Sandbox URL: `https://<preview-host>/api/apple/notifications?environment=Sandbox`
- [ ] Preview env: `APPLE_IAP_WEBHOOK_ENVIRONMENT=Sandbox`
- [ ] Send Apple **test notification**; confirm `entitlementsGranted: false` in response

## Sandbox testers

- [ ] App Store Connect → Users and Access → Sandbox → Testers
- [ ] Create dedicated emails (e.g. `mdb-sandbox-qa+1@…`)
- [ ] Device: Settings → App Store → Sandbox Account
- [ ] Confirm no real payment method charged

## Align MDB catalog (staging DB only)

- [ ] Create Connect products **before** setting `active=true` on matching `apple_catalog_skus` rows
- [ ] Staging-only SQL (guarded): activate only `.staging.` product IDs for load tests
- [ ] Never activate production catalog or set `NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED=false`

## Internal QA (optional, Preview only)

- [ ] `APPLE_IAP_INTERNAL_QA_ENABLED=1` on **Preview** scope only
- [ ] `APPLE_IAP_INTERNAL_QA_USER_IDS=<qa-user-uuids>`
- [ ] Confirm ordinary beta users still get `storeKitPurchaseUiUnlocked: false`

## Sign-off

- [ ] `GET /api/apple/products` returns IDs only when SKUs active + user auth
- [ ] Verify/restore return `verified_no_grant` / `restored_no_grant`
- [ ] My Purchases shows “verified, no beta grant”
- [ ] No paid entitlements granted in Supabase roles/subscriptions

See also: [apple-iap-app-store-connect-setup.md](./apple-iap-app-store-connect-setup.md), [apple-iap-device-sandbox-qa-checklist.md](./apple-iap-device-sandbox-qa-checklist.md).
