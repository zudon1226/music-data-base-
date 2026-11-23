# Phase 29G — Creator & Listener Sales Experience

**Branch:** `release/pwa-microsoft-store`  
**Baseline commit:** `ca20a88` → **29G:** `7266fa7`  
**Preview:** https://music-data-base-pwa-clean-git-baseline-recovered-9vm66v86h.vercel.app  
**Inspector:** https://vercel.com/zudon1226-5137s-projects/music-data-base-pwa-clean-git-baseline-recovered/GV5Csqx3j2wbgMRGTNYrJBGi51tR  
**Production:** unchanged

---

## Phase 1 — Browser / staging verification

| Workflow | Method | Result |
|----------|--------|--------|
| Song upload pricing fields | Static UI + `verify-phase29f-sales-upload-pricing.mjs` | **PASS** — `salePriceDollars` → `songs.price_cents` |
| Album bundle + track defaults | Static UI + upload API | **PASS** — `bundlePriceDollars` / `trackSalePriceDollars` |
| Ringtone preview + process | `verify-phase29f-preview-ringtone-pricing.mjs` on Preview | **PASS** (staging Artist; `process` → `completed` after PLAN fix) |
| Save draft / submit | API via `vercel curl` | **PASS** — unauthorized paid blocked; authorized flow queues |
| Full browser screenshots | Vercel Deployment Protection + owner session | **BLOCKED** for agent — owner sign-off on Preview/local staging parity (`run-staging-dev.mjs`) |

**Screenshot paths (owner):** `docs/release/phase29/screenshots/phase29g-upload-pricing.png`, `phase29g-marketplace-prices.png`, `phase29g-ringtone-studio.png`

---

## Phase 2 — Listener catalog

| Item | Result |
|------|--------|
| Song marketplace price | **PASS** — `resolveSongDisplayPriceCents` (no hardcoded $1.29) |
| Album bundle price | **PASS** — `resolveAlbumDisplayPriceCents` |
| Beat lease/exclusive hint | **PASS** — `formatBeatLicensePriceHint` on marketplace cards |
| Album details bundle + track prices | **PASS** — modal shows bundle + per-track when `priceCents > 0` |
| Misleading Buy when checkout locked | **PASS** — `marketplacePurchaseEnabled` hides Buy; price + beta message shown |

---

## Phase 3 — Sales entitlements (no payment activation)

| Check | Result |
|-------|--------|
| Song catalog authority | **PASS** — `lib/sales-catalog.ts` |
| Album → track vault rows | **PASS** — `expandAlbumPurchaseVaultRows` in fulfillment |
| Paid checkout | **NOT ACTIVATED** — API returns 403 when beta lock on |
| Stripe session for paid cart | **BLOCKED** client + server |

---

## Phase 4 — Security / beta locks

| Lock | Result |
|------|--------|
| `publicBetaPaidPurchaseLocked` (ringtones) | **PASS** on Preview API |
| `isPublicBetaPaidSalesCheckoutLocked` | **PASS** — UI + `/api/sales/checkout` |
| Live charges / payouts | **OFF** |

---

## Phase 5 — Quality

| Check | Result |
|-------|--------|
| `tsc --noEmit` | Run in CI/local with staging env |
| `verify-phase29g-sales-experience.mjs` | **PASS** |
| `verify-phase29f-*` + ringtone scripts | Re-run on Preview URL |
| Full `npm run lint` | Known OOM — use focused file lint or CI |

---

## Outstanding blockers

1. Owner visual acceptance on protected Preview or localhost staging.
2. Listener catalog on **guest** `/music` public routes if separate from in-app Marketplace (currently Marketplace + album modal).
3. Full eslint on `app/page.tsx` in high-memory CI only.