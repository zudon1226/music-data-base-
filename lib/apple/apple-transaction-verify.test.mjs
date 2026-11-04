/**
 * Apple IAP Stage 1 orchestration checks (mocked JWS + Supabase).
 * Run: node lib/apple/apple-transaction-verify.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    assertTransactionOwnershipAllowed,
    buildMappedEntityFromSku,
    resolveStage1AppleVerifyOutcome,
} from "./apple-transaction-verify-logic.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stage1 = readFileSync(join(root, "lib/apple/apple-iap-stage1.ts"), "utf8");
assert.match(stage1, /APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED\s*=\s*true/);

const userId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const productId = "com.digitalmusicdatabase.app.test.product";
const sku = {
    apple_product_id: productId,
    entity_type: "ringtone",
    entity_id: "c1b2c3d4-e5f6-7890-abcd-ef1234567890",
    plan_slug: null,
    license_type: null,
    billing_interval: null,
    active: true,
};

const stage1Outcome = resolveStage1AppleVerifyOutcome(true);
assert.equal(stage1Outcome.entitlementsGranted, false);
assert.equal(buildMappedEntityFromSku(sku).entityType, "ringtone");

const duplicateSameUser = assertTransactionOwnershipAllowed(userId, userId);
assert.equal(duplicateSameUser.ok, true);

const conflict = assertTransactionOwnershipAllowed("b1b2c3d4-e5f6-7890-abcd-ef1234567890", userId);
assert.equal(conflict.code, "TRANSACTION_OWNERSHIP_CONFLICT");

const verifySource = readFileSync(join(root, "lib/apple/apple-transaction-verify.ts"), "utf8");
assert.match(verifySource, /entitlementsGranted:\s*false/);
assert.match(verifySource, /APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED/);

console.log("apple-transaction-verify.test.mjs passed.");
