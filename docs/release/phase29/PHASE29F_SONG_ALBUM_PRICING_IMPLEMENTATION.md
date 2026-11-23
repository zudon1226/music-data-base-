# Phase 29F — Song & Album Pricing (next implementation)

**Status:** Implemented (Preview) — creator upload pricing; checkout remains beta-locked  
**Depends on:** Phase 29 ringtone pricing audit (Preview deploy)  
**Constraint:** Reuse `lib/sales-catalog.ts` and existing DB columns — **no parallel price tables or duplicate checkout resolvers**.

---

## Goal

Ship creator-facing **Product Details** and listener-facing **catalog display** for paid songs and album bundles using fields that already exist, while beta payment locks remain **on** until explicitly unlocked.

---

## Existing database fields (source of truth)

| Entity | Table | Fields | Checkout resolver |
|--------|-------|--------|-------------------|
| Song (à la carte) | `songs` | `price_cents`, `currency` (if present), sale flags | `resolveSalesCatalogItem` → `item_type: song` |
| Album bundle | `albums` | `price_cents`, cover, metadata | `item_type: album` |
| Album tracks | `album_tracks` | `item_id`, `item_type`, `position` | Not sold separately in checkout today — access via bundle |
| Beat | `producer_beats` | `lease_price`, `exclusive_price`, `license` | Unchanged |

**Ringtone reference:** `ringtone_products.price_cents` + `songs.ringtone_sale_enabled` / `ringtone_price` — mirror the **split** between product row price and source-song permission flags when adding song/album UI validation.

---

## Work packages

### 29F-A — Creator Product Details (songs)

1. **Upload / edit surfaces** — persist `songs.price_cents` from server-validated input (mirror upload parsers; never trust client cart prices).
2. **Validation** — integer cents ≥ 0; optional max cap consistent with ringtone/sales guards.
3. **Display** — Artist library + public song cards read `price_cents`; free when `0` or streaming-only SKU.
4. **Beta** — `publicBetaPaidPurchaseLocked` continues to block checkout; UI may show “price set” without enabling pay.

### 29F-B — Creator Product Details (albums)

1. **Album create / edit** — `albums.price_cents` for bundle; tracks remain listed via `album_tracks`.
2. **Validation** — bundle price independent of sum of track à-la-carte prices (document in creator copy).
3. **Display** — album detail page shows bundle price; individual tracks show own `price_cents` when sold separately (future à-la-carte from album page).

### 29F-C — Entitlements (done in 29 audit — verify only)

- `lib/sales-album-entitlements.ts` + `grantEntitlementsForCompletedPurchases` expands album purchases into per-song vault rows (`license_type: album_bundle`).
- **29F task:** add integration test or staging script when beta checkout unlocks; until then static + fixture test against Supabase staging.

### 29F-D — Listener cart & catalog UX

1. Reuse sales cart components; prices from `GET` catalog APIs that call `sales-catalog` server-side.
2. Checkout CTA remains disabled when `paidCheckoutAvailable: false`.
3. No new Stripe paths — `requireLiveCheckoutProvider` / beta flags untouched.

---

## Out of scope (29F)

- Live Stripe checkout, charges, creator payouts
- Production deploy of monetization
- New pricing microservice or duplicate `price_cents` on client-only models
- Per-track checkout from album without explicit catalog support (defer unless product requests)

---

## Acceptance criteria

| Check | Method |
|-------|--------|
| Song price saved and shown | Creator edit → DB `songs.price_cents` |
| Album bundle price saved and shown | Creator edit → `albums.price_cents` |
| Checkout still locked | Existing verify scripts + manual Preview |
| Album purchase grants all tracks | Fulfillment unit test / staging vault rows |
| No Stripe charge | No change to `paymentMode: safely-disabled` |

---

## Suggested file touch list (when implementing)

- `lib/sales-catalog.ts` — only if new edge cases (currency, free bundles)
- `app/api/sales/**` — catalog/cart responses (display only while locked)
- Upload/edit routes for songs & albums — **not** new pricing libs
- i18n messages for price hints (follow ringtone pattern)
- `scripts/verify-sales-catalog-*.mjs` — extend existing sales verifiers if present

---

## Owner sequencing

1. Merge Preview ringtone + entitlement fix (this release).
2. Implement 29F-A/B on staging branch with feature flags if needed.
3. Owner sign-off on UI copy for bundle vs track pricing.
4. Enable checkout only in a dedicated monetization phase with explicit approval.