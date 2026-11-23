# Phase 28 — Music Play Persistence, Search Scope, and Explicit Publishing (Local)

**Report time:** 2026-11-22 (local, post-resumption)  
**Branch:** `release/pwa-microsoft-store` · **HEAD** `a036010` (unchanged — **no commit**)  
**Phase 27 input:** `docs/release/phase27/PRODUCTION_PLAYBACK_SEARCH_PUBLICATION_AUDIT.md`  
**Scope:** Local implementation and verification only. **No** Production deploy, commit, push, or changes to Roll Call (`497b9cfd-e752-4060-9528-5134a2ff7f37`, Tenor Saw, owner prefix `0148b237`).

**Preserved:** Phase 20 launch **NO-GO**; Production Roll Call metadata, audio, `streaming_enabled`, and `plays` **not** modified by this work.

---

## Final verdict: **CONDITIONAL** → **READY FOR PREVIEW** after scoped deploy + fixture E2E

| Area | Result |
|------|--------|
| Feature implementation (play / search / publish) | **Complete locally** |
| `npm run verify:phase28` | **PASS** (2026-11-22 resumption run) |
| `npm run verify:search` | **PASS** |
| ESLint (Phase 28 API/libs only) | **PASS** |
| ESLint (full repo `npm run lint`) | **FAIL** — Node heap OOM on `app/page.tsx` size |
| `next build` | **PARTIAL** — Turbopack compile **PASS**, TypeScript **PASS** (~45s); static generation **FAIL** — `NEXT_PUBLIC_SUPABASE_ANON_KEY is missing` in this shell (`.env.local` not exported to build worker; secrets not printed) |

**CONDITIONAL** until: (1) owner **scoped commit** of Phase 28 files, (2) Preview deploy with normal Vercel env, (3) fixture play/search/upload E2E (not Roll Call count mutation).

---

## 1. Root causes addressed (Phase 27)

| Issue | Resolution |
|-------|------------|
| Play count mismatch | Server `POST /api/songs/:id/play` after successful `audio.play()`; client updates `plays` from response; **no** optimistic `plays+1` on `playSong`/`togglePlay` |
| Library search empty | `librarySearchScope` + `usesLibrarySearchScope`; banner + toggle on Library view |
| Silent public upload | `publicationMode` required for new artist song uploads; `DEFAULT_NEW_UPLOAD_USAGE.streaming_enabled: false`; API error if mode missing |

---

## 2. Files changed and why

| Path | Role |
|------|------|
| `app/api/songs/[id]/play/route.ts` | **New** — HTTP entry for qualified play recording |
| `lib/song-play-server.ts` | UUID validation, eligibility, dedup, DB increment, duplicate responses return **DB** `plays` |
| `lib/song-play-engagement.shared.mjs` | In-process dedup (45s throttle, session dedup key) |
| `lib/song-play-engagement.test.mjs` | Regression tests (uses Roll Call ID as **fixture only**) |
| `lib/song-play-client.ts` | `recordQualifiedSongPlay`, `createSongPlaybackSessionId` |
| `lib/song-usage-permissions.ts` | `SONG_PUBLICATION_MODES`, `parseSongUsageFromBody`, draft defaults |
| `app/api/songs/route.ts` | `loadOwnerNonPublicSongs` for authenticated `?ownerUserId=` |
| `app/page.tsx` | Persist on play success; search scope UI; publication radios; `reloadSongLibraryFromSupabase` owner query |
| `scripts/verify-phase28-*.mjs` | Static regression locks |
| `package.json` | `verify:phase28` script |
| `scripts/verify-search.mjs` | Library/catalog scope banner lock |

**Database migrations:** **None** — uses existing `songs.plays` and usage columns from prior migrations.

**Git note:** `app/page.tsx` contains extensive unrelated WIP; Phase 28 commit must be **hunk-scoped**.

---

## 3. Play persistence — API and client

### `POST /api/songs/:id/play`

```json
{ "playbackSessionId": "<uuid>", "event": "qualified_start" }
```

| Step | Behavior |
|------|----------|
| Validation | Song UUID; `playbackSessionId` UUID; only `qualified_start` |
| Abuse controls | Dedup per `(songId, listenerKey, sessionId)`; **45s** throttle per `(songId, listenerKey)` |
| Listener key | `user:{id}` if authenticated; else `anon:{sha256(ip)}` |
| Eligibility | `songAllowsStreaming` or **owner** playing own draft |
| Persist | Service-role `plays + 1`; never trusts client counts |
| Failed playback | Client only calls API after **`audio.play()`** resolves |
| Duplicate/throttle | **200** + `duplicate: true` + current **DB** `plays` (no extra increment) |

### Client (`app/page.tsx`)

- `songPlaybackSessionRef` + `persistQualifiedSongPlay` after successful play (`useEffect` audio path + `togglePlay`).
- `applyPersistedSongPlayCount` updates `songs` → **Artist Studio** `musicPlays` follows same state; **refresh** loads DB via `GET /api/songs`.
- `savePlay` still handles Recently Played / `recent_plays` — separate from `songs.plays`.

### Guest vs authenticated

Both flows use the same qualified-start pipeline; listener key differs for throttling.

---

## 4. Search scope

| Context | Search pool |
|---------|-------------|
| Library view + search + scope **library** | `librarySongs` only |
| Library view + scope **catalog** | `audioSongs` (public catalog + owner private when authed) |
| Other views with search | Public catalog pool (`audioSongs` / `trendingSongs` logic unchanged) |

**UI:** `search-scope-bar` — *"Searching your saved library only."* vs *"Searching the public Music Data Base catalog."* Toggle: *Search all songs instead* / *Search my library only*.

**Roll Call (Phase 27 evidence):** Not in an empty library list; **catalog** scope (or non-Library views) finds Roll Call in loaded public catalog — **no Production API changes**.

**Not used:** `/api/discovery` stub.

---

## 5. Explicit publishing

### Artist song upload (non-beat)

- Required radio: **Private draft** (`draft`) or **Public streaming** (`public_streaming`).
- Help text explains catalog visibility.
- `uploadAudioToSupabase` sends `publicationMode` on `save-metadata`.

### Server (`parseSongUsageFromBody`)

- Missing mode → `{ error: "Select a publication choice: …" }`.
- **draft:** `streaming_enabled: false`, `ringtone_enabled: false`.
- **public_streaming:** `streaming_enabled: true`.
- **ringtone_only:** preserved with ringtone flags.

### Catalog exposure

- Anonymous `GET /api/songs`: `streaming_enabled = true` + `isPublicStreamingCatalogSong`.
- Owner `?ownerUserId=` (auth): merges **all** owner `streaming_enabled: false` rows (drafts + ringtone-only).

### Albums / beats / instrumentals

- Album tracks and producer beats still pass **`public_streaming`** explicitly (release workflow).
- **Limitation:** No per-track draft choice on multi-file album upload in this phase.

---

## 6. Security review

| Control | Status |
|---------|--------|
| Client cannot set `plays` | **PASS** |
| Private catalog leakage on play | **Blocked** (403) except owner |
| Upload auth / creator gates | **Unchanged** |
| Service role for play increment | **Server-only** (existing pattern) |
| RLS / billing / Stripe | **Not modified** |
| Roll Call Production row | **Not touched** |

---

## 7. Tests executed (this session)

```text
npm run verify:phase28
  song-play-engagement.test.mjs        PASS
  verify-phase28-song-play-api.mjs    PASS (8 checks)
  verify-phase28-search-scope.mjs    PASS (9 checks)
  verify-phase28-publication.mjs     PASS (8 checks)

npm run verify:search                  PASS (SEARCH_FAILS=0)

npx eslint app/api/songs/[id]/play/route.ts lib/song-play-server.ts
         lib/song-play-client.ts lib/song-usage-permissions.ts app/api/songs/route.ts
                                       PASS (exit 0)

npm run lint                           FAIL (JavaScript heap out of memory)

npm run build (NODE_OPTIONS=--max-old-space-size=8192)
  Compile + TypeScript                 PASS
  Static prerender /                   FAIL — NEXT_PUBLIC_SUPABASE_ANON_KEY is missing
```

---

## 8. Known limitations

1. **Dedup cache** is process-local — best-effort on multi-instance serverless (throttle may allow rare duplicate increments across instances).
2. Play increment is read-then-update, not a single SQL atomic increment RPC.
3. Full-repo ESLint OOM on this machine without raised heap / file scope.
4. Local `next build` static step needs full Next public Supabase env (Preview/Vercel typically has this).
5. No Playwright E2E in Phase 28 — static + unit locks only.
6. Album upload path does not offer draft vs public per track.
7. Production Roll Call `plays` **not** backfilled or artificially changed.

---

## 9. Remaining work (owner / Phase 29)

1. **Scoped git commit** of Phase 28 paths only (exclude unrelated `page.tsx` / i18n WIP hunks where possible).
2. **Preview deploy** (separate authorization) → staging Supabase.
3. **Fixture E2E:** play API increments DB; Library ↔ catalog search; draft upload invisible on public `GET /api/songs` but visible to owner query.
4. Optional: durable dedup table or `UPDATE plays = plays + 1` RPC.
5. Optional: publication choice for album batch uploads.

---

## 10. Operational boundaries

| Rule | Met |
|------|-----|
| Local only | **Yes** |
| No deploy / commit / push | **Yes** |
| No Production migrations | **Yes** |
| No Roll Call changes | **Yes** |
| No billing / role changes | **Yes** |

---

## Recommendation

Treat Phase 28 implementation as **code-complete locally** with **CONDITIONAL** gate for Preview: run targeted verification above, then deploy Preview with env vars and validate on **non–Roll Call** fixtures before promoting.