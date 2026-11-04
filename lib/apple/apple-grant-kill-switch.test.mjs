import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stage1 = readFileSync(join(root, "lib/apple/apple-iap-stage1.ts"), "utf8");
const router = readFileSync(join(root, "lib/apple/apple-fulfillment-router.ts"), "utf8");
assert.match(stage1, /APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED\s*=\s*true/);
assert.match(router, /STAGE1_KILL_SWITCH/);
assert.match(router, /entitlementsGranted: false/);
assert.doesNotMatch(router, /grantEntitlementsForCompletedPurchases/);
assert.doesNotMatch(router, /applySuccessfulPayment/);

console.log("apple-grant-kill-switch.test.mjs passed.");
