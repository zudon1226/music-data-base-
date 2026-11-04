# Apple IAP — iOS / Xcode compile handoff

**Status:** Static checks pass (`npm run verify:apple-iap`, `npm run verify:capacitor-ios`). **No successful `xcodebuild` in CI or this workspace** — compile must be confirmed on a Mac.

## Plugin summary (`MDBStoreKitPlugin.swift`)

| Concern | Detail |
|--------|--------|
| Registration | `CAPBridgedPlugin` — `jsName = "MDBStoreKit"` (no manual `capacitor.config` entry) |
| StoreKit | StoreKit 2, `#available(iOS 15.0, *)` |
| Commerce lock | Native `purchaseProduct` returns `COMMERCE_LOCKED` when `commerceLocked: true` (JS passes lock from `isPublicBetaCommerceLocked()`) |
| Trust model | Returns `jwsRepresentation` / `signedTransactionInfo` — never decode-only JSON as “verified” |
| Purchase outcomes | `USER_CANCELLED`, `PENDING`, verified success with JWS, unverified rejection |
| Restore / entitlements | `Transaction.currentEntitlements` → `signedTransactionInfos[]` |

### Native ↔ JavaScript method parity

| Native (`pluginMethods`) | JS (`lib/ios/mdb-storekit-bridge.ts`) |
|--------------------------|----------------------------------------|
| `getStorefrontEnvironment` | (call via plugin if needed) |
| `loadProducts` | `loadIosStoreKitProducts` |
| `purchaseProduct` | `purchaseIosStoreKitProduct` (+ commerce lock) |
| `restorePurchases` | `restoreIosStoreKitPurchases` |
| `currentEntitlements` | Type on plugin; restore path used for server verify |

## Xcode project checks (repo state)

| Setting | Value |
|---------|--------|
| Project | `ios/App/App.xcodeproj` |
| Scheme | `App` (`ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`) |
| Target | `App` → `App.app` |
| Bundle ID | `com.digitalmusicdatabase.app` |
| Deployment target | **iOS 15.0** (target + project) |
| Swift | **5.0** (app target); CapApp-SPM uses Swift tools **5.9**, iOS **15** |
| Capacitor SPM | `@capacitor/swift-pm` **8.5.2** (`ios/App/CapApp-SPM/Package.swift`) |
| Signing | `CODE_SIGN_STYLE = Automatic`; **`DEVELOPMENT_TEAM` not committed** — set in Xcode for device builds |
| Plugin in build | `MDBStoreKitPlugin.swift` in **Compile Sources** |

## Mac runner

- **No** `.github/workflows` macOS job and **no** configured remote Mac runner in this repo.
- Builds are **local Mac** or a CI Mac you add later.

## Validation notes (2026-11-03)

- **`verify:capacitor-ios`:** 25/27 pass; two failures are **Android hygiene** (`@capacitor/android` in `package.json` + `android/` folder present), not StoreKit regressions. StoreKit bridge checks pass.
- **`verify:apple-iap`:** pass (includes internal QA static guards).
- **Compile proof:** still requires Mac `xcodebuild` log with `BUILD SUCCEEDED`.

## Pre-build (Mac)

From repository root:

```bash
npm ci
npm run build          # or your usual web build that populates `www` if required
npx cap sync ios
open ios/App/App.xcodeproj
```

In Xcode: **Signing & Capabilities** → select your Team for target **App**.

For **device sandbox QA** against a Vercel Preview (not production web), temporarily point Capacitor `server.url` in `capacitor.config.ts` to the preview origin, then `npx cap sync ios` again (do not commit that change unless authorized).

## Exact `xcodebuild` commands

Run from repo root. Adjust simulator name with `xcrun simctl list devices available`.

**Simulator — compile + link (typical dev):**

```bash
xcodebuild \
  -project "ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath "ios/App/build/DerivedData" \
  build
```

**Generic iOS device — compile only (no signing artifacts):**

```bash
xcodebuild \
  -project "ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  -derivedDataPath "ios/App/build/DerivedData" \
  build
```

**Release archive (TestFlight internal — requires team + profiles):**

```bash
xcodebuild \
  -project "ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "ios/App/build/MDB-App.xcarchive" \
  archive
```

**Success criterion:** log ends with `** BUILD SUCCEEDED **` (or archive succeeded). Save the log for staging sign-off.

## Optional helper

```bash
node scripts/print-apple-iap-xcode-build.mjs
```

Prints the commands above with paths resolved for the current OS.

## Failure triage

| Symptom | Likely fix |
|---------|------------|
| Signing errors | Set **Development Team**; use simulator or `CODE_SIGNING_ALLOWED=NO` for compile-only |
| Missing Capacitor | Run `npx cap sync ios`; open `.xcodeproj` (not a stale workspace path) |
| Swift / SPM resolve | Xcode **File → Packages → Resolve Package Versions** |
| StoreKit 2 on old sim | Use iOS 15+ simulator runtime |
