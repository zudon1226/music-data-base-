# Pricing & Ringtone / Song / Album Workflow Audit

**Date:** 2026-11-23  
**Scope:** Ringtone Creator failure investigation, Product Details pricing, cross-product pricing reference, album bundle entitlements, beta payment locks preserved.

---

## Executive summary

| Area | Finding | Fix / status |
|------|---------|--------------|
| **Ringtone preview unavailable** | Owned-song sources used `/api/audio?…` URLs; `<audio>` cannot send Bearer auth → metadata load fails | **Fixed** — `POST /api/ringtones/source-songs/play-url` returns short-lived **signed storage URL**; studio preview + duration probe use it |
| **Save / submit “Failed”** | Default Product Details price **$0.99** triggered `assertSourceSongAllowsRingtoneSale` on **draft POST** when source song lacks `ringtone_sale_enabled` → **403** `RINGTONE_SALE_NOT_AUTHORIZED` | **Fixed** — drafts **clamp to $0** when resale not authorized; **submit/process** still enforces sale permission |
| **Product Details pricing** | Documented below (ringtone `price_cents` on `ringtone_products`; song `ringtone_price` / flags on `songs`) | UI seeds price from source song when sale enabled |
| **Song / album sales pricing** | `lib/sales-catalog.ts` authoritative `price_cents` on `songs` / `albums` / beats | Reused; no duplicate catalog |
| **Album bundle track access** | Vault only stored album row | **Fixed** — `lib/sales-album-entitlements.ts` adds **per-song vault rows** on album fulfillment |
| **Beta payment locks** | Unchanged | No checkout, Stripe charge, or payout path enabled |

---

## 1. Ringtone Creator failure (root cause)

### Symptoms (screenshot / UI)
- **Preview audio unavailable** (`ringtones.previewUnavailable`)
- **Save** or **Submit** → generic **Failed** (`ringtones.saveFailed` / `ringtones.submitFailed`)

### Preview — failing path (before fix)

| Step | Detail |
|------|--------|
| API | `GET /api/ringtones/source-songs` returns `audioUrl` often as `/api/audio?path=…&songId=…` |
| Client | `previewCurrentClip()` → `new Audio(url)` / clip player |
| Server | `GET /api/audio` requires **Authorization** bearer (`resolveAudioPlaybackViewer`) |
| Result | Audio element gets **404 JSON**, not audio → **preview unavailable** |

### Save — failing path (before fix)

| Step | Detail |
|------|--------|
| UI default | `createEmptyRingtoneForm().priceDollars = "0.99"` (Product Details) |
| API | `POST /api/ringtones` with `priceCents: 99` |
| Guard | `assertSourceSongAllowsRingtoneSale` when `price_cents > 0` |
| DB | `songs.ringtone_sale_enabled` must be **true** (and `ringtone_enabled`) |
| Result | **403** `RINGTONE_SALE_NOT_AUTHORIZED` → UI **Save failed** |

Submit could fail for the same reason after a successful save at **$0** if user re-raised price without sale permission, or at process time (now enforced in `lib/ringtone-jobs.ts`).

### Fixes (this audit)

1. **`app/api/ringtones/source-songs/play-url/route.ts`** — creator studio signed read URL (`songs` bucket, 300s).
2. **`fetchOwnedSongStudioPlayUrl` + `resolveStudioSourceAudioUrl()`** — preview and duration probe.
3. **Draft pricing** — `POST /api/ringtones` and `PATCH` draft/rejected clamp unauthorized resale price to **0**; **submit** still blocked without `ringtone_sale_enabled`.
4. **`ringtone-jobs.ts`** — sale check before processing when `price_cents > 0`.
5. **Source songs API** — exposes `ringtoneSaleEnabled`, `ringtonePriceDollars` for Product Details seeding.

---

## 2. Ringtone Product Details — pricing architecture

| Layer | Storage | Validation | Display |
|-------|---------|------------|---------|
| **Ringtone product** | `ringtone_products.price_cents`, `currency` | `validateRingtonePriceCents` (integer ≥ 0); resale gated by `assertSourceSongAllowsRingtoneSale` on submit | Creator workspace step 3; marketplace after publish |
| **Source song (official)** | `songs.ringtone_price` (numeric dollars), `ringtone_sale_enabled`, `ringtone_creation_enabled`, `ringtone_enabled` | Set at upload via `parseSongUsageFromBody` / publication `ringtone_only` | Suggested price when selecting owned source |
| **Personal ringtones** | `price_cents` forced **0**, `is_personal` true | DB constraint `ringtone_products_personal_marketplace_guard` | `personalNoSaleHint` |

**Paid ringtone checkout (beta):** `GET /api/ringtones/marketplace` → `publicBetaPaidPurchaseLocked: true`, `paidCheckoutAvailable: false` — **unchanged**.

---

## 3. Reference model for song & album pricing (existing)

Reuse **`lib/sales-catalog.ts`** (`resolveSalesCatalogItem`):

| Type | Table | Price field | Client price trusted? |
|------|-------|-------------|------------------------|
| **Song** | `songs` | `price_cents` | **No** — server resolves at checkout |
| **Album bundle** | `albums` | `price_cents` | **No** |
| **Beat** | `producer_beats` | `lease_price` / `exclusive_price` | **No** — license type required |

Fulfillment: `lib/sales-payment-fulfillment.ts` + `lib/sales-stripe-checkout.ts` (beta: safely disabled at runtime).

**Individual album track pricing:** Tracks inherit access via **album purchase**; per-track list prices remain on `songs.price_cents` for à-la-carte sales. After this audit, album purchase also inserts **vault rows for each `album_tracks` song** (`license_type: album_bundle`, `price_cents: 0`).

---

## 4. Beta payment restrictions (verified)

| Control | Mechanism | Result |
|---------|-----------|--------|
| Ringtone paid purchase | `isPublicBetaPaidRingtonePurchaseLocked()` | **Locked** |
| Stripe checkout | `paymentMode: safely-disabled` / sales gates | **No live charges** |
| Creator payouts | Earnings recording only on fulfilled Stripe sessions | **No new payouts** without checkout |

No changes opened checkout, subscriptions, sponsorship, or Production monetization.

---

## 5. Workflow test results

### Automated (this run)

| Script | Result |
|--------|--------|
| `tsc --noEmit` | **PASS** |
| `verify-ringtone-save-error-messages.mjs` | **PASS** (7/7) |
| `verify-listener-personal-ringtone.mjs` | **PASS** |
| `verify-ringtone-submit-source-duration.mjs` | **CONDITIONAL** (5/7 — pre-existing static checks on PATCH/enqueue copy) |

### Ringtone creator (logical E2E expectations)

| Step | Expected after fix |
|------|---------------------|
| Select owned song | Studio play URL resolves; preview works |
| Save draft @ $0.99 without `ringtone_sale_enabled` | **Saves** with `price_cents: 0` (UI may still show $0.99 until reload) |
| Submit with price > 0 without sale flag | **403** clear message at process |
| Submit with sale-enabled source | Process queue (staging credentials required for full E2E) |

### Song / album sales (beta)

| Workflow | Result |
|----------|--------|
| Catalog resolve song/album/beat | **PASS** (static `sales-catalog.ts`) |
| Checkout session create | **BLOCKED** by beta locks (by design) |
| Album → track vault expansion | **Implemented** (runs only when purchase status = completed) |

**Owner-led:** Re-test Ringtone Creator on Preview after deploy with an Artist session and a song with `ringtone_creation_enabled: true`.

---

## 6. Files changed (scoped)

- `app/api/ringtones/source-songs/play-url/route.ts` (new)
- `app/api/ringtones/route.ts`, `app/api/ringtones/[id]/route.ts`
- `app/api/ringtones/source-songs/route.ts`
- `lib/ringtone-creator-client.ts`
- `lib/ringtone-jobs.ts`
- `components/ringtone-creator/ringtone-creator-workspace.tsx`
- `lib/sales-album-entitlements.ts` (new)
- `lib/sales-payment-fulfillment.ts`

---

## 7. Remaining recommendations

1. Deploy Preview and verify preview + draft save with a real owned song (signed URL path).
2. Enable `ringtone_sale_enabled` + `ringtone_price` on source songs intended for **paid** ringtones before submit.
3. Align UI to show when draft price was **clamped** (optional toast when `price_cents` saved as 0).
4. When beta unlocks checkout, regression-test album bundle vault rows against `download_vault` RLS.