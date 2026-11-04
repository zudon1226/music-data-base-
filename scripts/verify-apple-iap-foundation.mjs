/**
 * Static verification for Apple IAP Stage 1 server foundation.
 * Usage: node scripts/verify-apple-iap-foundation.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

function record(ok, label, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

const migration = read("supabase/migrations/202611031700_apple_iap_foundation.sql");
record(migration.includes("apple_catalog_skus"), "migration defines apple_catalog_skus");
record(migration.includes("apple_payment_events"), "migration defines apple_payment_events");
record(migration.includes("revoke all privileges on table public.apple_payment_events from authenticated"), "apple_payment_events service-role writes");
record(migration.includes("'apple'"), "payment_provider extended for apple");

const jws = read("lib/apple/app-store-jws.ts");
record(jws.includes("SignedDataVerifier"), "JWS uses SignedDataVerifier");
record(jws.includes("verifyAndDecodeTransaction"), "JWS calls verifyAndDecodeTransaction");
record(!jws.includes("JSON.parse(atob"), "no decode-only JWS trust path");

const verifyRoute = read("app/api/apple/transactions/verify/route.ts");
const forbidden = [
    "grantEntitlementsForCompletedPurchases",
    "confirmRingtonePurchasePayment",
    "applySuccessfulPayment",
    "sales-payment-fulfillment",
    "subscription-service",
];
for (const needle of forbidden) {
    record(!verifyRoute.includes(needle), `verify route does not import ${needle}`);
}
record(verifyRoute.includes("requireMatchingUserId"), "verify route requires matching user id");
record(verifyRoute.includes("entitlementsGranted: false"), "verify route forces entitlementsGranted false");

const orchestrator = read("lib/apple/apple-transaction-verify.ts");
record(orchestrator.includes("APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED"), "stage 1 grant kill switch");
record(orchestrator.includes("APPLE_IAP_STAGE1_VERIFY_OUTCOME"), "stage 1 records verified_no_grant outcome");
record(orchestrator.includes("validateAppAccountTokenForUser"), "appAccountToken validation wired");

const productsRoute = read("app/api/apple/products/route.ts");
record(productsRoute.includes("requireMatchingUserId"), "products route requires auth");

const notificationsRoute = read("app/api/apple/notifications/route.ts");
record(notificationsRoute.includes("processAppleServerNotification"), "ASN route wired");
record(notificationsRoute.includes("entitlementsGranted: false"), "ASN route never grants");

const restoreRoute = read("app/api/apple/transactions/restore/route.ts");
record(restoreRoute.includes("requireMatchingUserId"), "restore route requires auth");
record(restoreRoute.includes("entitlementsGranted: false"), "restore route never grants");

const fulfillment = read("lib/apple/apple-fulfillment-router.ts");
record(fulfillment.includes("APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED"), "fulfillment router respects kill switch");

const stage1 = read("lib/apple/apple-iap-stage1.ts");
record(stage1.includes("APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED = true"), "stage 1 grants permanently disabled");

const internalQaRoute = existsSync(join(root, "app/api/apple/internal-qa/storekit/route.ts"))
    ? read("app/api/apple/internal-qa/storekit/route.ts")
    : "";
if (internalQaRoute) {
    record(internalQaRoute.includes("entitlementsGranted: false"), "internal QA route never grants");
    record(read("lib/apple/apple-iap-internal-qa.ts").includes("PRODUCTION_SUPABASE_URL_BLOCKED"), "internal QA blocks production supabase");
}

if (process.exitCode) {
    console.error("\nApple IAP foundation verification failed.");
} else {
    console.log("\nApple IAP foundation verification passed.");
}
