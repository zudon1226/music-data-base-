# Real-device Apple Sandbox QA checklist

**Beta invariants (every test):**

- `NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED` unset or `true` → purchases blocked in UI/native layer.
- `APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED` → all verify/restore/ASN paths return **`entitlementsGranted: false`**; no paid tier unlock.
- Staging SKUs default **`active = false`** → `/api/apple/products` may return **empty** until staging activation for load tests.

**Legend:**  
🟢 **StoreKit UI** — needs unlocked commerce *or* native purchase path (blocked today).  
🔵 **Signed JWS / API** — can test with StoreKit entitlements, restore, or Apple test vectors while commerce locked.  
🟣 **Connect / Apple** — external setup.

---

## 0. Prerequisites

- [ ] 🟣 Six products created in App Store Connect (sandbox) matching exact IDs.
- [ ] Staging Supabase `jzlegcbotqfzevtczwhx` migrated + SKUs seeded.
- [ ] Vercel Preview deployed with staging env (see `apple-iap-staging-preview-config.md`) — **when authorized**.
- [ ] iOS app built on Mac (`xcodebuild` **BUILD SUCCEEDED**).
- [ ] Device signed in with **Sandbox** Apple ID.
- [ ] App web context = preview URL if testing end-to-end from device.

---

## 1. Product retrieval

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 1.1 | 🔵 | `GET /api/apple/products?userId=<uuid>` with user JWT | `commerceLocked: true`; `productIds` matches active staging SKUs (empty if all inactive) |
| 1.2 | 🔵 | Set **staging-only** SKU(s) `active=true` for one test ID | Same GET returns that product ID |
| 1.3 | 🔵 | `MDBStoreKit.loadProducts({ productIds })` with Connect IDs | Products metadata returned when Connect + active SKU align |
| 1.4 | 🟢 | Load products in UI purchase flow | Same as 1.3 when commerce unlocked; **today UI purchase blocked** |

---

## 2. Purchase cancellation

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 2.1 | 🟢 | Tap purchase → cancel sheet | Native `ok: false`, `code: USER_CANCELLED` |
| 2.2 | 🔵 | With commerce locked, call `purchaseProduct` | `COMMERCE_LOCKED` without StoreKit sheet |

**Today:** perform **2.2** only unless commerce unlock is explicitly authorized for a closed QA environment.

---

## 3. Pending transactions

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 3.1 | 🟢 | Trigger Ask to Buy / pending (family sandbox) | Native `code: PENDING` |
| 3.2 | 🔵 | Verify no server grant | No `fulfilled` outcome; kill switch prevents grants |

---

## 4. Valid signed transactions

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 4.1 | 🟢 | Complete sandbox purchase (commerce unlocked QA only) | JWS in response |
| 4.2 | 🔵 | `POST /api/apple/transactions/verify` with JWS, `environment: Sandbox`, matching `userId` / `appAccountToken` | `verified_no_grant`, `entitlementsGranted: false` |
| 4.3 | 🔵 | Check `apple_payment_events` on staging | Row inserted, outcome `verified_no_grant` |

**Today:** use **4.2** with JWS from restore/entitlements (4.x below) or prior sandbox purchase on a dev build with commerce unlocked in **internal QA only**.

---

## 5. Invalid signed transactions

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 5.1 | 🔵 | POST verify with `signedTransactionInfo: "a.b.c"` | `422` / `JWS_VERIFICATION_FAILED` |
| 5.2 | 🔵 | Tamper one segment of valid JWS | Verification failure, no row or `rejected` |
| 5.3 | 🔵 | Valid JWS but `environment: Production` while sandbox payload | Environment mismatch / rejection |

---

## 6. Restore

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 6.1 | 🔵 | `restorePurchases` / `currentEntitlements` on device | `signedTransactionInfos[]` |
| 6.2 | 🔵 | `POST /api/apple/transactions/restore` with array | `restored_no_grant`, `entitlementsGranted: false` |
| 6.3 | 🟢 | Restore on **second device** same sandbox account | Same original transaction IDs map to same user if `appAccountToken` consistent |

---

## 7. Duplicate transaction

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 7.1 | 🔵 | POST verify twice with same `transactionId` | Second response `duplicate: true`, idempotent |
| 7.2 | 🔵 | DB | Single logical event; no duplicate grants (grants disabled anyway) |

---

## 8. Cross-account transaction

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 8.1 | 🔵 | User A verifies transaction; User B verifies same `originalTransactionId` | `409` / `TRANSACTION_OWNERSHIP_CONFLICT` |
| 8.2 | 🔵 | Restore as User B for A’s transaction | Same conflict |

---

## 9. Refund and revocation notifications

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 9.1 | 🟣 | App Store Connect / Apple test notification → preview ASN URL | HTTP 200, `entitlementsGranted: false` |
| 9.2 | 🔵 | Refund/revoke notification types | Outcome `revoked_no_grant` or `asn_no_grant` |
| 9.3 | 🔵 | My Purchases | Revoked lines show revoked/verified status; **no** entitlement unlock |

---

## 10. My Purchases display

| Step | Mode | Action | Expected |
|------|------|--------|----------|
| 10.1 | 🔵 | After verify/restore, open listener My Purchases | Apple line: “verified, no beta grant”; `totalCents: 0` |
| 10.2 | 🔵 | Stripe/history | Unchanged by Apple sandbox tests |
| 10.3 | 🔵 | No paid tier | User role/plan unchanged (kill switch) |

---

## 11. Beta protection confirmation (required sign-off)

- [ ] Purchase UI shows commerce lock message when attempting buy.
- [ ] All verify/restore/ASN JSON includes `entitlementsGranted: false`.
- [ ] No `fulfilled` grant path executed (grep logs / outcomes).
- [ ] Production Supabase untouched.
- [ ] Production SKUs not activated for sale.

---

## Automated static coverage (local)

```bash
npm run verify:apple-iap
node scripts/verify-public-beta-commerce-lock.mjs
```

Manual sections above remain required for sandbox sign-off.
