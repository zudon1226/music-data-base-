# Phase 29B — Expanded Mobile Feature Navigation

**Status:** Implemented locally — **not deployed to Production**  
**Branch:** `release/pwa-microsoft-store`  
**Date:** 2026-11-23

## Summary

Public guest discovery navigation was expanded from three links (Home, Mixtapes, Podcasts) to six feature-discovery destinations with touch-friendly horizontal scrolling, green active state, and honest beta labeling for ringtone purchases. Personal library items (My Library, Downloads, Recently Played, Favorites) remain in the authenticated listener shell only.

## Main navigation (public)

| Label | Route | SPA view (guest) | Readiness |
| --- | --- | --- | --- |
| Home | `/` | Public entry hub (COMING SOON) | Live |
| Music | `/music` | `Home` (trending catalog) | Live browse; login for saves |
| Videos | `/videos` | `Videos` | Live browse |
| Ringtones | `/ringtones` | `Ringtone Marketplace` | Browse/preview live; **paid purchase beta-locked** |
| Mixtapes | `/mixtapes` | `Mixtapes` | Live |
| Podcasts | `/podcast` | `Podcasts` | Live |

Routes `/music`, `/videos`, and `/ringtones` follow the same thin App shell pattern as existing `/mixtapes` and `/podcast` pages (`initialPublic*Discovery` props on `app/page.tsx`).

## Implementation touchpoints

- `components/public-guest/GuestPublicDiscoveryNav.tsx` — six real `<a href>` links, `aria-current="page"`, optional **Beta** pill on Ringtones when `isPublicBetaPaidRingtonePurchaseLocked()`.
- `components/public-guest/guest-public-discovery-nav.css` — horizontal scroller (`overflow-x: auto`, no wrap, 40px touch targets).
- `lib/public-guest-discovery.ts` — path registry, guest discovery gate, active section resolver.
- `app/page.tsx` — guest discovery listener bypasses login shell on discovery URLs; unified `GuestPublicDiscoveryNav` in top bar, mobile row, and desktop sidebar for signed-out discovery.
- New pages: `app/music/page.tsx`, `app/videos/page.tsx`, `app/ringtones/page.tsx`.

## Validation performed (local)

| Check | Result |
| --- | --- |
| `node scripts/verify-guest-public-discovery-nav.mjs` | **PASS** |
| Static contract: six routes, horizontal layout, i18n keys | **PASS** |
| Production deploy | **Skipped** (per phase scope) |

### Recommended manual checks before Production

1. **iPhone viewport (~390px):** swipe discovery row; confirm all six links visible without overflow clipping.
2. **Android viewport (~412px):** same as iPhone; confirm focus rings and `aria-current` on each destination.
3. **Desktop:** guest nav in sidebar and top bar on `/podcast`, `/mixtapes`, `/music`, `/videos`, `/ringtones`.
4. **Logged-out:** each destination loads content or empty-state; no Library/Downloads in guest nav.
5. **Logged-in:** full `MobileAppHorizontalNav` (includes personal items) on authenticated `/` shell.
6. **Ringtones:** marketplace loads; purchase CTA shows existing beta lock copy (no billing change).
7. **Deep links:** `/podcast/{uuid}`, `/mixtape/{uuid}` still guest-accessible; active section **Podcasts** / **Mixtapes**.

## Out of scope (unchanged)

- Billing, subscription, checkout, payout behavior.
- Creator dashboards (Artist / Producer Studio).
- Production migration or Vercel deploy.

## Sign-off gate

Deploy Phase 29B only after manual viewport and destination checks above pass on Preview or local `next dev`.