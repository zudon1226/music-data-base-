# Desktop regression lock

**Scope:** Desktop only. Use this checklist before and after any desktop glue change.
**Goal:** Stop fixing one area while breaking another. No feature work until every row passes.

---

## Rules of engagement

1. **One shared change at a time** — protected actions (like, follow, save, playlist, delete visibility, profile name, auth-gated nav) must all read from the same guard/runtime stack.
2. **Full clean replacement only** — replace entire modules; do not patch individual handlers in `app/page.tsx` for auth/fetch issues.
3. **Do not touch** (unless explicitly scoped in a separate task):
   - Auth flow core (`lib/auth-*.ts`, `lib/supabase-auth-*.ts`, `lib/repair-auth-session.ts`)
   - API routes (`app/api/**`)
   - Playback core (`playSong`, `togglePlay`, `audioRef`, track-ended handlers in `page.tsx`)
   - Upload core (`lib/supabase-storage-upload.ts`, upload API routes, upload form handlers)
   - Mobile UI blocks in `page.tsx` (`isMobilePlaybackEnvironment`, mobile queue/player)
   - Layouts (`app/layout.tsx`, `app/globals.css`)
   - Supabase env / config (`lib/supabase-config.ts`, `.env*`, Vercel env)

---

## Manual regression checklist

Run on **https://music-data-base.vercel.app** (or local `npm run dev`) with a **desktop browser** (≥1024px width). Sign in as `zudon1226@gmail.com` unless testing a non-owner account.

| # | Feature | Pass criteria | Fail signals |
|---|---------|---------------|--------------|
| 1 | **Login** | Email/password sign-in completes; login screen dismisses | Stuck on login, spinner forever, auth error toast |
| 2 | **Session persistence** | Hard refresh (F5) keeps user signed in; no login screen flash | Returned to login after refresh |
| 3 | **Home opens** | Home view renders hero/discovery after sign-in | Blank shell, infinite loading, bootstrap toast loop |
| 4 | **Sidebar navigation** | Home, Library, Liked, Following, Playlists, Profile, Queue all navigate | Click does nothing, wrong view, false "log in" toast |
| 5 | **Profile name `zudon1226`** | Profile header shows `zudon1226` (not "Music Data Base user" / "Z Music User") | Generic fallback name |
| 6 | **Play** | Click track → audio plays; play/pause toggles | No audio, player stuck |
| 7 | **Queue** | Add to queue; Queue sidebar/view shows items; order preserved | Empty queue, items missing |
| 8 | **Like** | Heart toggles; persists after refresh | "Log in before liking songs." or SSO redirect in Network tab |
| 9 | **Follow** | Follow artist toggles; Following view updates | "Log in before following artists." or SSO redirect |
| 10 | **Save** | Save to Library; Library view shows item | "Log in before saving to Library." or SSO redirect |
| 11 | **Add to playlist** | Add song/video to playlist; playlist view updates | "Log in before adding…" or SSO redirect |
| 12 | **Delete button visibility** | Delete control visible on own uploads (owner/admin/artist/producer) | Delete missing for eligible content |
| 13 | **Upload button visibility** | Upload button enabled for owner; blocked message for locked accounts | Upload missing for owner, or enabled when blocked |

### Network tab checks (protected actions only)

For like / follow / save / playlist / delete API calls:

- [ ] Request URL is **same-origin** (`/api/...`), never `vercel.com/sso-api`
- [ ] Request includes `Authorization: Bearer eyJ...` and `apikey` header
- [ ] Response is 200/201 (not 401 redirect to SSO)

---

## Feature → controlling files

### Shared stack (protected actions + auth-gated nav + profile/delete helpers)

```
app/page.tsx (wiring only)
  ├── lib/desktop-protected-action-auth-guard.ts   ← SINGLE auth guard for all protected actions
  ├── lib/desktop-action-runtime.ts              ← fetch facade, userId, display name, delete ACL
  │     └── lib/desktop-protected-action-client.ts ← same-origin /api fetch + token refresh
  │           └── lib/desktop-auth-recovery-gate.ts ← token validation (read-only dependency)
  └── lib/desktop-app-navigation.ts                ← sidebar access rules (uses guard)
        └── components/desktop-app-sidebar-nav.tsx
```

### Per-feature file map

| Feature | Primary files | Notes |
|---------|---------------|-------|
| Login | `lib/desktop-auth-state.tsx`, `app/page.tsx` (`handleAuthSubmit`, login UI) | **Do not replace auth flow** without separate task |
| Session persistence | `lib/desktop-auth-state.tsx`, `lib/supabase-auth-storage.ts`, `lib/auth-session.ts` | Storage layer is shared; touch only with auth task |
| Home opens | `lib/desktop-app-bootstrap.ts`, `lib/desktop-user-music-state-bootstrap.ts`, `app/page.tsx` shell gate | `canRenderDesktopApplicationShell` |
| Sidebar navigation | `lib/desktop-app-navigation.ts`, `components/desktop-app-sidebar-nav.tsx`, `app/page.tsx` `handleNav` | Auth-gated items use guard |
| Profile name | `lib/desktop-action-runtime.ts` (`resolveDesktopProfileDisplayName`), `app/page.tsx` (`getAccountDisplayName`, `reloadUserProfileFromSupabase`, `/api/user-profile`) | API route is **do not touch** |
| Play | `app/page.tsx` only (`playSong`, `togglePlay`, `audioRef`) | **Do not touch** playback block |
| Queue | `app/page.tsx` only (`queue` state, `addToQueue`, Queue view) | **Do not touch** queue/playback |
| Like | Guard + runtime + `page.tsx` `toggleLike` → `/api/song-likes` | Handler stays thin; auth via guard |
| Follow | Guard + runtime + `page.tsx` `toggleArtistFollow` → `/api/artist-follow` | Same |
| Save | Guard + runtime + `page.tsx` `saveLibraryItem` → `/api/library/save` | Same |
| Add to playlist | Guard + runtime + `page.tsx` playlist handlers → `/api/playlist-items` | Same |
| Delete visibility | `lib/desktop-action-runtime.ts` (`canDeleteDesktopUploadedItem`), `page.tsx` `canDeleteUploaded*` | Uses guard userId + session, not `isAuthenticated` boolean |
| Upload visibility | `app/page.tsx` (`uploadsBlockedForCurrentUser`, `toggleUploadPanel`), `lib/upload-lock.ts` | Upload **execution** is do not touch |

### Key wiring anchors in `app/page.tsx`

| Concern | Approx. lines | Symbol |
|---------|---------------|--------|
| Auth provider wrap | ~3413–3418 | `DesktopAuthProvider` |
| Guard + runtime setup | ~3532–3568 | `desktopActionAuthGuard`, `requireDesktopActionUserId` |
| Nav access | ~3560–3565 | `desktopNavAccess` |
| Profile display | ~5690–5698 | `getAccountDisplayName` |
| Upload gate | ~5052–5056 | `uploadsBlockedForCurrentUser` |
| Shell gate | ~14783+ | `canRenderDesktopApplicationShell` |
| Protected handlers | ~9022, ~9491, ~9552, ~9942+ | save, like, follow, playlist |

*(Line numbers drift; run `npm run verify:desktop` for current static checks.)*

---

## Safe to replace vs must not touch

### Safe to replace (desktop glue — full module replacement OK)

| File | Role |
|------|------|
| `lib/desktop-protected-action-auth-guard.ts` | Single auth guard for all protected desktop actions |
| `lib/desktop-protected-action-client.ts` | Same-origin protected `/api` client |
| `lib/desktop-action-runtime.ts` | Runtime facade: fetch, userId, profile name, delete ACL |
| `lib/desktop-protected-action-bindings.ts` | Re-export shim (optional consolidation) |
| `lib/desktop-app-navigation.ts` | Sidebar view keys and access rules |
| `lib/desktop-app-bootstrap.ts` | Shell gate and remote bootstrap queue |
| `lib/desktop-user-music-state-bootstrap.ts` | Non-blocking user-music-state bootstrap |
| `components/desktop-app-sidebar-nav.tsx` | Sidebar button UI |
| `lib/desktop-auth-recovery-gate.ts` | Token read/validation for protected fetch (desktop-only) |
| Desktop **wiring sections** in `app/page.tsx` | Imports, guard/runtime setup, `requireDesktopActionUserId`, `desktopNavAccess`, thin handler guards |

### Replace with extreme caution (auth UI gate — not the same as protected-action guard)

| File | Role |
|------|------|
| `lib/desktop-auth-state.tsx` | Login screen gate, session provider, `completeSignIn` |

Changing this affects login, session persistence, and shell render. Coordinate with auth regression rows 1–3.

### Must not touch (current regression lock)

| Area | Paths |
|------|-------|
| Auth flow core | `lib/auth-session.ts`, `lib/auth-boot.ts`, `lib/supabase-auth-client.ts`, `lib/supabase-auth-storage.ts`, `lib/repair-auth-session.ts`, `lib/sync-auth-user-metadata.ts`, `lib/request-auth.ts` |
| Supabase config | `lib/supabase-config.ts`, `lib/supabase.ts`, `lib/server-supabase.ts`, `.env*` |
| API routes | `app/api/**` |
| Playback | `app/page.tsx` `playSong`, `togglePlay`, `nextSong`, `previousSong`, `audioRef`, video player effects |
| Upload execution | `lib/supabase-storage-upload.ts`, `lib/song-storage-path.ts`, `lib/upload-lock-server.ts`, `app/api/upload-*`, upload submit handlers in `page.tsx` |
| Mobile | `page.tsx` mobile queue/player classes and `isMobilePlaybackEnvironment` branches |
| Layouts | `app/layout.tsx`, `app/globals.css` |
| Public pages | `app/artist/[id]`, `app/producer/[id]` |

### Orphan / unused (safe to delete or wire later, not required for regression)

- `lib/desktop-auth-session-flow.ts` — not imported anywhere

---

## Automated static verification

Before manual testing:

```bash
npm run verify:desktop
```

This script checks:

- Required desktop module files exist
- Expected exports are present
- `app/page.tsx` still wires the shared guard/runtime (no reversion to `isAuthenticated`-only gating for protected actions)
- Forbidden-path list is documented (informational)

**Static verification does not replace manual browser testing** for play, queue, and network behavior.

---

## Change workflow (after lock is in place)

1. Run `npm run verify:desktop`
2. Complete manual checklist (all 13 rows + network checks)
3. Make **one** scoped full replacement in a **safe-to-replace** file
4. Re-run verify + manual rows affected by that file
5. `npm run build` && `npm run lint` (note: repo has pre-existing lint warnings)
6. Deploy and re-run manual checklist
7. Commit only when all rows pass
