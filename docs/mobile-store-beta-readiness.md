# Mobile store beta readiness (Apple + Google)

Prepared from repository evidence only. **Nothing in this document submits to Apple or Google.** Mobile shells load the live web app at production URL via Capacitor (`capacitor.config.ts`).

Last reviewed against repo: Capacitor iOS/Android foundations, public beta locks, legal/support/account-deletion flows.

---

## 1. App identity

| Field | Value |
|-------|--------|
| **App name** | Music Data Base |
| **Bundle ID (Apple)** | `com.digitalmusicdatabase.app` |
| **Package name (Google)** | `com.digitalmusicdatabase.app` |
| **Marketing version** | `1.0.0` (`ios/App/App.xcodeproj`, `android/app/build.gradle`) |
| **Build / version code** | `1` |
| **Production website** | `https://www.digitalmusicdatabase.com` (Capacitor `server.url`; docs also reference `https://digitalmusicdatabase.com` via `NEXT_PUBLIC_SITE_URL` in `docs/phase6-production-env.md`) |
| **Privacy Policy URL** | `https://www.digitalmusicdatabase.com/legal/privacy` (`lib/legal-policies.ts` → `publicPath: "/legal/privacy"`) |
| **Terms URL** | `https://www.digitalmusicdatabase.com/legal/terms` |
| **Support (in-app)** | Profile → **Support / Feedback** (`components/support/support-report-panel.tsx` on Profile in `app/page.tsx`) |
| **Support (email)** | `zudon1226@gmail.com` (`LEGAL_CONTACT_EMAIL` in `lib/legal-policies.ts`) |
| **Account deletion (in-app)** | Profile → **Account settings** → **Delete Account** (`components/account-delete-panel.tsx` in `components/user-profile-dashboard.tsx`) |
| **Account deletion (API)** | `POST /api/account/delete` (`app/api/account/delete/route.ts`; session auth only) |

**Feedback email for TestFlight / Play (placeholder):** use `zudon1226@gmail.com` unless owner assigns a dedicated beta address.

---

## 2. App description (store copy)

### Short description (Apple subtitle / Google short — ~80 chars)

Stream, discover, and create music and video with artists, producers, and podcasts.

### Full store description (Apple / Google long)

Music Data Base is a music and video platform for listeners, artists, and producers. Browse and play songs and videos, save music to your library, build playlists and queues, follow creators, and explore podcasts.

**Creators** can upload audio and video, manage artist/producer profiles, and use creator studio tools. **Listeners** can discover content, manage libraries, and create **personal ringtones** from eligible library songs (subject to creator permissions and platform rules).

**Public beta:** Account signup and core features are available. **Paid subscriptions, paid ringtone marketplace purchases, and sponsor paid checkout are locked during beta**—you may see pricing or billing UI, but live paid checkout is not enabled for general users. Stripe remains in **TEST** mode per deployment documentation; do not expect real charges during beta.

Report issues via **Profile → Support / Feedback**. Read our Privacy Policy and Terms in the app. You can **delete your account** from Profile account settings.

### TestFlight beta description

Music Data Base mobile beta wraps the live web app. Please exercise signup/login, playback, search, library, creator uploads (if applicable), podcasts, personal ringtone creation, support tickets, language settings, and account deletion. Paid checkout features are intentionally locked.

### What to Test (Apple)

1. Sign up / log in (Listener, Artist, Producer roles).
2. Search and open songs, videos, artists, producers.
3. Global music player (play, pause, queue; note playback may pause when app is backgrounded).
4. Video playback (inline).
5. Library, likes, playlists, following.
6. Podcast shows and episodes (if enabled for your account).
7. Personal ringtone creation and Android/iPhone download (personal use; not marketplace purchase).
8. Profile → Support / Feedback (submit a ticket; optional screenshot).
9. Profile → Account settings → Delete Account (use a disposable test account only).
10. Language selector (display language).

**Do not expect:** successful paid subscription checkout, paid ringtone marketplace purchase, or sponsor paid checkout during beta.

### Google Play short description (~80 chars)

Music & video platform: stream, create, podcasts, personal ringtones. Public beta.

### Google Play full description

Use the **Full store description** above (same accuracy rules for beta payment locks).

---

## 3. Apple App Privacy (App Store Connect questionnaire prep)

Label key: **COLLECTED** | **NOT COLLECTED** | **NEEDS MANUAL CONFIRMATION**

Evidence: `lib/legal-policy-content.ts` (privacy text), Supabase auth/profile tables, upload APIs, support tickets, `app/api/platform/errors`, Stripe integration docs, repo search (no ad SDK / no `getUserMedia` / no geolocation APIs in app TSX).

| Data category | Status | Repo evidence |
|---------------|--------|----------------|
| **Contact info — email** | COLLECTED | Account signup/auth (Supabase); privacy policy lists email. |
| **Contact info — name** | COLLECTED | Display name / profile fields (`profiles`, user dashboard). |
| **Contact info — phone** | NOT COLLECTED | No phone field found in core signup/profile flows reviewed. |
| **Contact info — physical address** | NOT COLLECTED | No address collection in reviewed profile fields. |
| **User content — audio/video/photos** | COLLECTED | Creator/listener uploads (`type="file"`, upload APIs); support screenshot attachments. |
| **User content — other (text)** | COLLECTED | Profile bio, support tickets, podcast episode comments (DB migrations), playlists/metadata. |
| **Identifiers — user ID** | COLLECTED | Supabase `auth.users` / session tokens. |
| **Identifiers — device ID for tracking** | NOT COLLECTED | No IDFA/ATT usage strings in `ios/App/App/Info.plist`; no tracking SDK grep hits in app source. |
| **Purchases / payment info** | NEEDS MANUAL CONFIRMATION | Privacy policy references Stripe; **beta locks block paid checkout** for typical users (`lib/public-beta-*-checkout*.ts`). Payment history may exist for owner/test paths; declare in Connect based on what production actually stores during beta. |
| **Usage data / analytics** | NEEDS MANUAL CONFIRMATION | Privacy policy mentions “logs” and “usage information”; `platform_errors` stores client-reported errors (`app/api/platform/errors/route.ts`). No third-party analytics SDK found in repo grep. Confirm whether Vercel/Supabase host logs are attributed to “analytics” in Apple’s form. |
| **Diagnostics — crash data** | NEEDS MANUAL CONFIRMATION | Client error reports to `platform_errors`; no Firebase/Crashlytics in mobile projects. |
| **Diagnostics — performance** | NOT COLLECTED | No performance SDK found in repo. |
| **Location — precise** | NOT COLLECTED | No geolocation API usage in app TS/TSX grep. |
| **Location — coarse** | NEEDS MANUAL CONFIRMATION | IP-derived location possible at infrastructure level (Supabase/Vercel); not exposed as an in-app feature in repo. |
| **Contacts** | NOT COLLECTED | No contacts API usage. |
| **Browsing history** | NOT COLLECTED | No cross-site tracking SDK; app loads first-party web app. |
| **Search history** | COLLECTED | In-app search queries processed server-side for catalog search (product behavior). |
| **Sensitive info** | NEEDS MANUAL CONFIRMATION | Depends on user-uploaded content; platform prohibits certain content in policies but UGC is allowed. |
| **Tracking (Apple definition)** | **NO** (repo evidence) | No App Tracking Transparency strings; no ad network SDKs in iOS/Android projects; privacy policy states “We do not sell personal information.” Confirm with owner if any future marketing pixels are added to web. |
| **Linked to user** | COLLECTED (for above collected types) | Account-tied storage in Supabase. |
| **Used for tracking** | NOT COLLECTED (repo evidence) | Same as Tracking row. |

**Encryption in transit:** COLLECTED data sent over HTTPS to production (`server.url` HTTPS; Supabase/TLS). Align Apple “Data encrypted in transit” with this.

---

## 4. Google Play Data safety matrix

| Data type | Collected? | Shared? | Required? | Purpose (repo-based) | Encrypted in transit? | Deletion available? |
|-----------|------------|---------|-----------|------------------------|-------------------------|------------------------|
| Email address | Yes | With processors (Supabase, Stripe per privacy policy) | Required for account | Account, auth, support | Yes (HTTPS) | Yes — account deletion + policy contact |
| Name / profile | Yes | Processors | Optional (profile) | Profile, creator identity | Yes | Yes |
| Photos / videos / audio files | Yes | Processors (storage) | Optional (uploads) | UGC, creator content, support attachments | Yes | Yes — deletion service removes owned media where applicable |
| App interactions (errors) | Yes | Not sold | Optional (when user triggers error report) | Debug/support (`platform_errors`) | Yes | NEEDS MANUAL CONFIRMATION — retention in `platform_errors` table |
| Purchase history | NEEDS MANUAL CONFIRMATION | Stripe | N/A during beta for most users | Billing when enabled | Yes | Policy + account deletion (partial retention rules in `lib/account-deletion-service.ts`) |
| Device or other IDs | NEEDS MANUAL CONFIRMATION | — | — | Session/auth tokens; no ad ID in manifest | Yes | Session ends on logout/deletion |
| Location | No (in-app) | — | — | — | — | — |
| Contacts | No | — | — | — | — | — |
| Messages | No (DM) | — | — | Podcast **comments** are public UGC, not 1:1 chat | — | — |
| Financial info (card) | NOT COLLECTED by app directly | Stripe | — | Privacy policy: card data processed by Stripe | Yes (Stripe) | Via Stripe/account policies |

**Data deletion:** In-app **Delete Account** documented; Google form should link Privacy Policy URL and describe in-app deletion.

---

## 5. User-generated content / moderation

| Control | Present? | Evidence |
|---------|----------|----------|
| Creator uploads (audio/video) | Yes | Upload routes, creator agreement `/legal/creator-upload` |
| Signup policy acceptance | Yes | `legal_acceptances` migration; signup validation in `lib/legal-signup-validation.mjs` |
| Copyright / DMCA | Yes | `/legal/dmca` |
| Terms / prohibited content | Yes | `/legal/terms`, sponsor terms reference prohibited content |
| Support / reporting | Yes | `SupportReportPanel`, `support_tickets` API |
| Trust category in support | Yes | Support categories include `trust` (`app/api/support/tickets`) |
| Platform error reporting | Yes | `/api/platform/errors` |
| Admin moderation | Yes | Platform Control Center, ringtone moderation (`lib/ringtone-moderation-log`, admin APIs) |
| Podcast episode comments | Yes | `podcast_episode_comments` (authenticated UGC) |
| Automated content scanning | NEEDS MANUAL CONFIRMATION | No ML moderation pipeline evident in grep; rely on admin/review queues for ringtones |
| Public chat / DMs | NOT COLLECTED as product | No DM table surfaced in this audit |
| **Gaps** | Document | In-app “report content” flow may be support-ticket-based rather than per-track one-tap report; confirm UX for store reviewers. UGC rating depends on live catalog content (**NEEDS OWNER CONFIRMATION**). |

---

## 6. Account deletion (compliance summary)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| In-app deletion | Yes | `AccountDeletePanel` under Profile account settings |
| User-initiated | Yes | Checkbox + type `DELETE`; `POST /api/account/delete` |
| Auth scoped to self | Yes | `resolveStrictRequestUserId`; rejects mismatched `userId` |
| Session invalidated | Yes | Client `onAccountDeleted` → logout (`app/page.tsx`) |
| Data / storage cleanup | Yes | `lib/account-deletion-service.ts` (media, tickets, ringtone lifecycle, storage prefixes, auth user delete) |
| Financial record retention | Documented in code | Payout rows anonymized / SET NULL; no Stripe API calls on delete |
| Owner/admin accounts | Blocked from self-delete | `assertAccountDeletionAllowed` |

Privacy policy also allows contact for account assistance (`lib/legal-policy-content.ts`).

---

## 7. Content rating questionnaire prep

Answer based on **product capabilities**, not on specific catalog entries. Use **NEEDS OWNER CONFIRMATION** where user-uploaded media could vary.

| Topic | Likely answer | Notes |
|-------|---------------|-------|
| Music streaming | Yes | Core product |
| Video streaming | Yes | Videos feature |
| Podcasts | Yes | Podcast phases in repo |
| User-generated content | Yes | Uploads, comments, profiles |
| Violence | NEEDS OWNER CONFIRMATION | Depends on uploaded/catalog video/audio |
| Sexual content | NEEDS OWNER CONFIRMATION | Policies prohibit adult sponsor content; UGC still possible |
| Gambling | No (product) | No gambling feature in repo |
| Alcohol / drugs | NEEDS OWNER CONFIRMATION | Possible in user-uploaded media |
| Unrestricted web access | NEEDS MANUAL CONFIRMATION | WebView loads fixed production origin; user profile websites / external links may open browser |
| Chat / messaging | No (1:1) | Episode comments only |
| Advertising | NEEDS MANUAL CONFIRMATION | Sponsor/ad features exist; paid sponsor checkout **locked** in beta |
| In-app purchases | NEEDS MANUAL CONFIRMATION | IAP not used; web/Stripe billing when unlocked at launch—stores may ask about digital purchases separately from beta state |

---

## 8. Screenshot plan (capture later on device/simulator)

Capture **phone** screenshots (6.7" and 5.5" iPhone; phone + 7" tablet for Google if required). Suggested views:

1. **Home** — logged-in or public landing with catalog rails  
2. **Search** — query + suggestions  
3. **Music player** — global player expanded with track info  
4. **Video** — video page or grid with playback  
5. **Artist dashboard** — Artist Studio entry  
6. **Producer dashboard** — Producer Studio entry  
7. **Podcast** — show or episode view  
8. **Ringtone Creator** — personal ringtone workflow  
9. **Support / Feedback** — support form on Profile  
10. **Profile / Account** — profile hero + settings  
11. **Account deletion** — Delete Account warning + confirmation (disposable account; do not use real PII)  
12. **Language selector** — Profile or topbar language control  

**Google Play feature graphic (1024×500):** not in repo — design separately using existing logo asset.

---

## 9. TestFlight / Google Play testing text

### Beta app description (both stores)

Music Data Base **public beta** (mobile wrapper). Core streaming, discovery, creator tools, podcasts, personal ringtones, support, and account deletion. **Paid subscriptions, paid ringtone purchases, and sponsor checkout are disabled** for general users during beta.

### Feedback email

`zudon1226@gmail.com` (or owner-provided beta alias)

### What to Test

Copy from **§2 What to Test (Apple)**.

### Tester instructions

1. Install the beta build.  
2. Create a **test account** (do not use your only personal email if you plan to test deletion).  
3. Confirm login persists after closing/reopening the app.  
4. File one support ticket from Profile if you find a bug.  
5. Do **not** attempt real-money checkout—beta locks should show “coming at full launch” style messaging.  

### Known beta limitations

- Paid **subscription** checkout locked (`NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED`, default locked).  
- Paid **ringtone marketplace purchase** locked (`NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED`).  
- **Sponsor** paid checkout locked (`NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED`).  
- **Stripe TEST** mode per `docs/phase6-production-env.md` — no live payment intent for production validation.  
- **Automated creator payouts / Connect transfers** not a beta tester action; payout features gated by product phase.  
- **Background audio** may stop when app is backgrounded (no native media session yet).  

---

## 10. Store compliance gaps

### CAN DO NOW (from any machine)

- Paste descriptions, URLs, and privacy matrices from this doc into App Store Connect / Play Console drafts.  
- Prepare screenshot shot list (§8).  
- Confirm legal URLs load on production.  
- Run `npm run verify:capacitor-ios` / `verify:capacitor-android`.  

### NEEDS MAC

- Xcode archive, iOS signing, TestFlight upload.  
- Validate iOS icons/splash on device.  
- Confirm WKWebView cookie/session behavior for Supabase auth.  

### NEEDS ANDROID BUILD / AAB

- Install JDK, set `JAVA_HOME`.  
- `cd android && ./gradlew bundleRelease` (or Android Studio).  
- Play App Signing + upload AAB to internal/closed testing.  

### NEEDS OWNER ACCOUNT ACTION

- Apple Developer Program enrollment, App ID registration for `com.digitalmusicdatabase.app`.  
- Google Play Developer account.  
- D-U-N-S / organization details if using company account.  
- Decide public beta feedback email vs `LEGAL_CONTACT_EMAIL`.  
- Complete Apple App Privacy and Google Data Safety forms using §3–§4 (with manual confirmations resolved).  
- Content rating questionnaires (§7).  
- Age rating for UGC music/video platform.  

### FULL-LAUNCH ONLY (not beta)

- Unlock subscription / ringtone / sponsor checkout env flags.  
- Stripe LIVE mode + live webhooks.  
- Creator Connect payouts go-live.  
- Background audio / lock-screen controls if required.  
- Universal Links / App Links for deep URLs.  

### TestFlight blockers (summary)

1. macOS/Xcode build + signing  
2. App Store Connect app record + privacy labels finalized  
3. Beta export compliance / encryption questions  
4. Device QA on physical iPhone  

### Google Play testing blockers (summary)

1. Signed AAB  
2. Play Console app + Data safety + content rating  
3. Feature graphic + screenshots  
4. Internal testing track upload  

---

## 11. Safety confirmation (this task)

- Payment systems: **not modified**  
- Beta locks: **unchanged** (documented ON by default in code)  
- Stripe: **TEST** per deployment docs  
- No store submissions, no new Apple/Google accounts, no production signing keys created in repo  

---

## 12. Reference commands

```bash
# Legal URLs (production)
# https://www.digitalmusicdatabase.com/legal/privacy
# https://www.digitalmusicdatabase.com/legal/terms

npm run verify:capacitor-ios
npm run verify:capacitor-android
```

Mobile shells: `docs/ios-capacitor-wrapper.md`, `docs/android-capacitor-wrapper.md`.
