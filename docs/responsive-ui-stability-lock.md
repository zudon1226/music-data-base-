# Responsive UI stability lock

**Status:** Frozen (visually approved desktop + mobile).  
**Goal:** Stop future feature work from accidentally changing shared responsive layout.  
**Verify:** `npm run verify:layout` (included in `npm run verify:ui-all`).

---

## Freeze rules

Do **not** change the following unless the task is an explicit layout/chrome change and the lock + verify script are updated in the same PR:

| Frozen area | Approved contract |
|-------------|-------------------|
| Desktop breakpoint | `min-width: 821px` (`DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX`) |
| Mobile breakpoint | `max-width: 820px` |
| Narrow mobile | `max-width: 768px` |
| Tiny mobile | `max-width: 340px` (Profile actions only) |
| Sidebar width / position | Desktop `188px` fixed left; mobile `--mobile-sidebar-width: 64px` |
| Content offset | Desktop `margin-left: 188px` |
| Top navigation | Sticky topbar grid `minmax(0, 1.15fr) minmax(0, 0.7fr) auto` |
| Search bar | Height `41px`, radius `8px` |
| Language selector | Trigger height `41px`; class `topbar-language-selector` |
| Grid/List toggle | Height `41px`, 2 columns, gap `6px` |
| Global player | Expanded `88px`, collapsed `52px`; collapse behavior unchanged |
| Hero banner | Desktop `min-height: 210px`; mobile compact hero block preserved |
| Home recommendation cards | Grid `220px` / art `96px`; List `92px` / art `116×92` |
| Profile Edit/Logout | Desktop flex `gap: 10px`; mobile 2-col grid `gap: 8px` |

Canonical numeric freeze: `lib/ui/responsive-stability-lock.ts`.

---

## Feature work policy

If a future feature needs layout changes:

1. Isolate changes to that feature’s component / scoped CSS only.
2. Do **not** modify shared layout, page containers, global CSS, or responsive breakpoints.
3. Do **not** change sidebar, topbar, search, language selector, Grid/List toggle, hero, Home discovery card geometry, or global player height/behavior.
4. Re-run `npm run verify:ui-all` before review.

---

## Shared touch zones (do not edit for features)

- `app/page.tsx` shell CSS (`.sidebar`, `.content`, `.topbar`, `.hero`, `.player`, breakpoints)
- `lib/desktop-content-scroll.ts`
- `app/globals.css` player / mobile chrome
- `lib/ui/app-ui-shell.ts` shared shell tokens
- `lib/i18n/i18n-styles.ts` language selector chrome sizing
- `lib/app-header-offset.ts` / `lib/navigation-scroll.ts`

---

## Related verification

| Script | Covers |
|--------|--------|
| `verify:layout` | This freeze (breakpoints + chrome + cards + profile) |
| `verify:desktop` | Desktop module / wiring lock |
| `verify:ui` | UI polish / shell tokens |
| `verify:playback` | Global player clearance |
| `verify:carousel` | Rail / card height stretch guard |
| `verify:mobile-layout` | Mobile RP / Queue / Profile |
| `verify:mobile-topbar` | Mobile topbar actions |
| `verify:nav` | Navigation scroll |
| `verify:ui-all` | Runs all of the above |

Also see: `docs/desktop-regression-lock.md`.
