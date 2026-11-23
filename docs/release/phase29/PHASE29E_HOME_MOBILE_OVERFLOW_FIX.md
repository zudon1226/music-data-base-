# Phase 29E — Guest Home Mobile Overflow Fix

**Date:** 2026-11-23  
**Branch:** `release/pwa-microsoft-store`  
**Production:** unchanged — **`ee675362803ccd0b0f3b42e21a8a90be02bc7812`**

---

## Summary

Guest **Home** (`/`) on mobile reported `document.documentElement.scrollWidth` **627** on **390px** viewports. Root cause: the **public entry hub** (`MdbPublicEntryHub`) hosts a **horizontal six-link** `GuestPublicDiscoveryNav` without width containment; the pill row (**~596px**) expanded `.mdb-public-entry-panel` to **~611px**, widening the document. Fix: constrain the hub page/panel and **`mdb-public-entry-discovery-nav`** scroller to **`max-width: 100%`** so links scroll inside the panel. **No** blanket `overflow-x: hidden` on `body`.

---

## Root cause

| Finding | Detail |
|---------|--------|
| Surface | Signed-out **`/`** renders `data-login-render-phase="public-hub"` (`MdbPublicEntryHub`), not `zml-app` |
| Offender (Playwright) | `.mdb-public-entry-panel` width **611px**; `.guest-public-discovery-nav__list` **~596px** |
| Why other routes passed | `/music`, `/videos`, etc. use app shell routes with different layout |

---

## Fix (scoped CSS)

**File:** `components/public-beta/mdb-public-entry.css`

- `.mdb-public-entry-page`: `width: 100%; max-width: 100vw`
- `.mdb-public-entry-panel`: `max-width: 100%; min-width: 0`
- `.mdb-public-entry-discovery-nav` + scroller: `width/max-width: 100%; min-width: 0` (horizontal scroll retained)
- `.mdb-public-entry-card h2`: `overflow-wrap: anywhere` (long card titles)

**File:** `components/public-guest/guest-public-discovery-nav.css` (companion, prior 29D)

- Hide duplicate sidebar/topbar guest nav below **720px** when the dedicated horizontal row is shown (app-shell routes only).

---

## Before / after viewport measurements

**Method:** Playwright on `localhost:3010` (`/` guest hub), `scrollWidth` vs `clientWidth`.

| Viewport | Before `scrollWidth` | After `scrollWidth` | After `clientWidth` | Panel width |
|----------|----------------------|---------------------|---------------------|-------------|
| 390×844 | **627** | **390** | 390 | ~358 |
| 375×667 | **627** | **375** | 375 | ~343 |
| 412×915 | **627** | **412** | 412 | ~380 |
| 1440×900 | 1440 | **1440** | 1440 | 720 (unchanged) |

Nav scroller inner `scrollWidth` **569** on mobile — **intentional** touch scroll inside panel.

---

## Verification

| Check | Result |
|-------|--------|
| `verify-phase29d-ui-mobile-acceptance.mjs` (4 viewports, 6 routes) | **PASS** (incl. Home overflow) |
| `verify-guest-public-discovery-nav.mjs` | **PASS** |
| `verify-podcast-guest-navigation.mjs` | **PASS** |
| `verify-upload-audio-save-metadata-auth-order.mjs` | **PASS** |
| `tsc --noEmit` | **PASS** |
| `npm run lint` (full tree) | **Not run** — OOM in this environment |
| ESLint on changed `.css` | No errors (CSS not in eslint config) |

Preserved: six destinations, active state, click/history, Ringtone **Beta** pill, Library/Downloads absent from guest nav.

---

## Preview deployment

| Field | Value |
|-------|-------|
| Commit | **`88311ce`** — `fix(phase29e): contain guest hub nav width on mobile Home` |
| Deployment ID | `dpl_ABQmE4DTE4md4Uwe1ueFGsaf4ABM` |
| Preview URL | https://music-data-base-pwa-clean-git-baseline-recovered-43ha1u3ht.vercel.app |
| Status | **Ready** |
| Protection | `vercel_authentication` (enabled) |
| Target | **preview** only — `music-data-base-pwa-clean-git-baseline-recovered` |

### Post-deploy checks (`verify-phase29d-preview-api.mjs`)

| Check | Result |
|-------|--------|
| `/`, `/music`, `/videos`, `/ringtones`, `/mixtapes`, `/podcast` | **200** |
| `/api/songs` staging ref `jzlegcbotqfzevtczwhx` | **PASS** |
| Ringtone locks | `publicBetaPaidPurchaseLocked: true`, `paidCheckoutAvailable: false` |
| Guest `POST /api/upload-audio` | **401** |

---

## Production safety

| Check | Result |
|-------|--------|
| Production deploy | **Not run** |
| Runtime baseline | **`ee67536`** |
| Roll Call / DB | **No changes** (per Phase 29C/29D) |
| Monetization locks | Unchanged on Production; Preview locks re-checked post-deploy |

---

## Remaining blockers

- **Preview UI** on CDN hostname still requires owner **Vercel SSO** (Deployment Protection on).
- **Authenticated** listener Library/Downloads and Artist Studio: owner manual (unchanged from 29D).

---

## Verdict

**Guest Home mobile overflow:** **FIXED** locally; **Preview Ready** after deploy with same commit.