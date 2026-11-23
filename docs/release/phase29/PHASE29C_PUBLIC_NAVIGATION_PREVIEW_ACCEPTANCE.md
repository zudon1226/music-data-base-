# Phase 29C — Public Navigation Preview Acceptance

**Date:** 2026-11-23  
**Branch:** `release/pwa-microsoft-store`  
**Preview project:** `music-data-base-pwa-clean-git-baseline-recovered`  
**Production project:** `music-data-base` (**unchanged** — no promote, no prod deploy)

---

## Verdict: **CONDITIONAL**

Preview build is **Ready** with Phase 29B/29C commits, six discovery routes return **HTTP 200** through authenticated `vercel curl`, staging Supabase and payment locks verified on API probes. **Full guest UI acceptance (nav pills, mobile scroll, incognito)** is **blocked by Vercel Deployment Protection** on the Preview URL (browser and unauthenticated `fetch` hit SSO / bot challenge). Owner should run a short **protection-off smoke window** or use **Vercel SSO–authenticated browser** before Production review.

---

## 1. Git and scoped commits

| Commit | Description |
|--------|-------------|
| `552b927bddeebe8017f2ae499774cbc91a855b19` | Phase 29B: six-link guest nav, empty states, upload auth order |
| `443bef94456a0792ae2492fa612740591a3b5219` | Docs: 29B acceptance commit hash |
| `fd976c669889f442e3544d688f62f476f5f8d6dc` | i18n keys for all locales + `patch-guest-nav-i18n.mjs` |

### Files in `552b927` (implementation)

- `lib/public-guest-discovery.ts`
- `app/music/page.tsx`, `app/videos/page.tsx`, `app/ringtones/page.tsx`
- `app/page.tsx`
- `components/public-guest/GuestPublicDiscoveryNav.tsx`, `guest-public-discovery-nav.css`
- `components/public-beta/mdb-public-entry.tsx`
- `components/mixtapes/MixtapeDiscoveryWorkspace.tsx`
- `components/podcasts/PodcastDiscoveryWorkspace.tsx`
- `app/api/upload-audio/route.ts` (auth before validation)
- `lib/i18n/messages/en.ts`
- `scripts/verify-guest-public-discovery-nav.mjs`
- `scripts/verify-upload-audio-save-metadata-auth-order.mjs`
- `docs/release/phase29/PHASE29B_*.md`

### Files in `fd976c6`

- `lib/i18n/messages/*.ts` (56 locales) — `music`, `ringtones`, `betaBrowseOnly`, `ringtonesBetaPurchasesLocked`
- `scripts/patch-guest-nav-i18n.mjs`

**Unrelated WIP** left unstaged (album APIs, billing, other docs).

### Pre-push checks

| Check | Result |
|-------|--------|
| `node scripts/verify-guest-public-discovery-nav.mjs` | **PASS** |
| `node scripts/verify-podcast-guest-navigation.mjs` | **PASS** |
| `node scripts/verify-upload-audio-save-metadata-auth-order.mjs` | **PASS** |
| ESLint (29B TSX/TS paths) | **PASS** |
| `npx tsc --noEmit` | **PASS** (after locale patch) |

---

## 2. Preview deployment

| Field | Value |
|-------|-------|
| Deployment ID | `dpl_HLDS5mo64h2NGsqsWNP76Yayifyo` |
| **Preview URL** | https://music-data-base-pwa-clean-git-baseline-recovered-87wa50fw8.vercel.app |
| Inspector | https://vercel.com/zudon1226-5137s-projects/music-data-base-pwa-clean-git-baseline-recovered/HLDS5mo64h2NGsqsWNP76Yayifyo |
| Target | **preview** (`productionUrl: null`) |
| Ready state | **Ready** (~1m 32s build) |
| CLI deploy | `npx vercel deploy --yes --project music-data-base-pwa-clean-git-baseline-recovered` |
| Git push | `origin/release/pwa-microsoft-store` @ `fd976c6` |

### Supabase environment (Preview)

| Signal | Value |
|--------|-------|
| Staging ref (API) | `jzlegcbotqfzevtczwhx` |
| Evidence | `vercel curl …/api/songs` returns `audio_url` on `jzlegcbotqfzevtczwhx.supabase.co` |
| Production ref (control) | `aehuszoadgqtbkxsliyy` — **www** still serves Roll Call only (`plays: 1`) |

### Production isolation

| Check | Result |
|-------|--------|
| `music-data-base` prod deploy list | Latest prod Ready ~30m pre-29C push; **no** `vercel deploy --prod` in 29C |
| www catalog | Still **Roll Call**, Production storage host |
| Preview vs prod | Separate Vercel project names confirmed |

### Payment locks (Preview API via `vercel curl`)

```json
"publicBetaPaidPurchaseLocked": true,
"paidCheckoutAvailable": false,
"paymentMode": "safely-disabled"
```

---

## 3. Six destinations — logged-out HTTP (vercel curl)

| Destination | Path | HTTP | Notes |
|-------------|------|------|-------|
| Home | `/` | **200** | Shell loads |
| Music | `/music` | **200** | Guest discovery shell |
| Videos | `/videos` | **200** | Guest discovery shell |
| Ringtones | `/ringtones` | **200** | Marketplace view |
| Mixtapes | `/mixtapes` | **200** | Existing pattern |
| Podcasts | `/podcast` | **200** | Existing pattern |

**UI/nav acceptance:** `data-guest-discovery-link` is client-rendered; **not** present in curl HTML without hydration. **BLOCKED** for anonymous browser due to Deployment Protection login wall.

**Recommended owner pass:** Disable protection temporarily or sign in via Vercel SSO, then verify:

- Six pills visible, `aria-current` per section
- No login wall on `/music`, `/videos`, `/ringtones`, `/mixtapes`, `/podcast`
- `/` shows COMING SOON hub with six-link nav
- Back/forward between real hrefs
- Deep links: `/podcast/{uuid}`, `/mixtape/{uuid}`

---

## 4. Mobile and desktop

| Test | Status |
|------|--------|
| iPhone ~390px nav scroll | **NOT VERIFIED** (protection) — CSS: horizontal scroller, 40px pills @ `guest-public-discovery-nav.css` |
| Android ~412px | **NOT VERIFIED** (protection) |
| Desktop sidebar + topbar guest nav | **NOT VERIFIED** (protection) |
| Horizontal page overflow | **NOT VERIFIED** (protection) |

---

## 5. Authentication regression

| Check | Evidence / status |
|-------|-------------------|
| Guest six-link nav vs authenticated mobile nav | Code: `anonymousPublicGuestDiscoveryListener` swaps in `GuestPublicDiscoveryNav`; signed-in uses `MobileAppHorizontalNav` |
| Library / Downloads not in guest nav | Six-link config only in `GUEST_PUBLIC_DISCOVERY_SECTION_ORDER` |
| Creator studios | Unchanged — auth-gated in existing shell |
| Mixtape/podcast deep links | **HTTP 200** on Preview; guest path helpers unchanged + extended |

---

## 6. Ringtone beta messaging

| Check | Result |
|-------|--------|
| Marketplace loads on Preview | **200** |
| Purchase lock | **true** |
| Checkout | **false** |
| UI Beta pill | Implemented when `isPublicBetaPaidRingtonePurchaseLocked()` — **UI not verified** behind protection |

---

## 7. Guest upload auth (Preview)

| Probe | Result |
|-------|--------|
| `POST /api/upload-audio` `{}` (local + code order) | **401** expected per `552b927` |
| Preview API via unauthenticated `fetch` | Often **HTML challenge** (protection) |
| Production www (control) | Still **400** publication error @ `ee67536` |

---

## 8. Automation added

`scripts/verify-phase29c-public-navigation-preview.mjs` — set `PREVIEW_BASE_URL` to Preview host. Page routes work with plain `fetch`; APIs may need `vercel curl` when protection is on.

---

## 9. Remaining issues

1. **Deployment Protection** blocks true incognito / guest browser QA on Preview.
2. **No screenshot evidence** in this run (login redirect to vercel.com).
3. **Production** still on pre-29B nav until a separate controlled prod release.
4. **Authenticated regression** on Preview not executed (no test listener session in agent).

---

## Sign-off

| Outcome | When |
|---------|------|
| **READY FOR PRODUCTION REVIEW** | After owner completes protected Preview UI pass (six destinations + mobile widths) |
| **CONDITIONAL** | **Now** — build + HTTP smoke OK, UI QA blocked |
| **NO-GO** | If owner finds broken routes or nav after protection bypass |