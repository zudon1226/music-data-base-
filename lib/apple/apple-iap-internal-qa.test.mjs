/**
 * Static guards for Apple IAP internal QA isolation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const qa = read("lib/apple/apple-iap-internal-qa.ts");
assert.match(qa, /APPLE_IAP_PRODUCTION_SUPABASE_REF/);
assert.match(qa, /STAGING_SUPABASE_REF_REQUIRED/);
assert.match(qa, /isProductionAppleIapRuntime/);
assert.match(qa, /isPublicBetaCommerceLocked/);
assert.match(qa, /APPLE_IAP_INTERNAL_QA_USER_IDS/);

const route = read("app/api/apple/internal-qa/storekit/route.ts");
assert.match(route, /entitlementsGranted: false/);
assert.match(route, /storeKitPurchaseUiUnlocked/);

const bridge = read("lib/ios/mdb-storekit-bridge.ts");
assert.match(bridge, /internal-qa\/storekit/);
assert.match(bridge, /isPublicBetaCommerceLocked/);

console.log("apple-iap-internal-qa.test.mjs passed.");
