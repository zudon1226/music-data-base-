/**
 * Apple IAP Stage 1 verify logic unit checks.
 * Run: node lib/apple/apple-transaction-verify-logic.test.mjs
 */
import assert from "node:assert/strict";
import { PUBLIC_BETA_COMMERCE_LOCK_CODE } from "../public-beta-commerce-lock.ts";
import {
    assertTransactionOwnershipAllowed,
    hashAppleSignedPayload,
    resolveStage1AppleVerifyOutcome,
    shouldRejectSandboxAppleVerifyInProduction,
    validateAppAccountTokenForUser,
} from "./apple-transaction-verify-logic.mjs";

const userA = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const userB = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";

assert.equal(hashAppleSignedPayload("abc"), hashAppleSignedPayload("abc"));
assert.notEqual(hashAppleSignedPayload("abc"), hashAppleSignedPayload("abcd"));

assert.deepEqual(validateAppAccountTokenForUser(undefined, userA), { ok: true });
assert.deepEqual(validateAppAccountTokenForUser(userA, userA), { ok: true });
assert.equal(validateAppAccountTokenForUser(userB, userA).ok, false);
assert.equal(validateAppAccountTokenForUser("not-a-uuid", userA).code, "APP_ACCOUNT_TOKEN_INVALID");

assert.deepEqual(assertTransactionOwnershipAllowed(null, userA), { ok: true });
assert.deepEqual(assertTransactionOwnershipAllowed(userA, userA), { ok: true });
assert.equal(assertTransactionOwnershipAllowed(userB, userA).code, "TRANSACTION_OWNERSHIP_CONFLICT");

assert.equal(shouldRejectSandboxAppleVerifyInProduction("Sandbox", true), true);
assert.equal(shouldRejectSandboxAppleVerifyInProduction("Production", true), false);
assert.equal(shouldRejectSandboxAppleVerifyInProduction("Sandbox", false), false);

const locked = resolveStage1AppleVerifyOutcome(true);
assert.equal(locked.outcome, "verified_no_grant");
assert.equal(locked.entitlementsGranted, false);
assert.equal(locked.code, PUBLIC_BETA_COMMERCE_LOCK_CODE);

const unlocked = resolveStage1AppleVerifyOutcome(false);
assert.equal(unlocked.outcome, "verified_no_grant");
assert.equal(unlocked.entitlementsGranted, false);
assert.equal(unlocked.code, undefined);

console.log("apple-transaction-verify-logic.test.mjs passed.");
