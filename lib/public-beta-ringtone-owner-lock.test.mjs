/**
 * UNIT TESTS — paid ringtone purchases stay locked for every account.
 * No Stripe calls and no database access.
 *
 * Run: node --import ./scripts/register-cleanup-protection-test.mjs lib/public-beta-ringtone-owner-lock.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envName = "NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED";
const previous = process.env[envName];

function setEnv(value) {
    if (value === undefined) delete process.env[envName];
    else process.env[envName] = value;
}

const { canBuyerBypassPublicBetaPaidRingtoneLock } = await import("./public-beta-ringtone-purchase.ts");
const { canBuyerStartPaidRingtonePurchase } = await import("./ringtone-purchase.ts");

const ownerId = "1996c17b-121e-4592-a0a0-ccae6d289ccd";
const adminId = "22222222-2222-4222-8222-222222222222";
const listenerId = "11111111-1111-4111-8111-111111111111";
const buyers = [ownerId, adminId, listenerId];

for (const value of [undefined, "", "1", "true", "yes", "on", "maybe"]) {
    setEnv(value);
    for (const buyerId of buyers) {
        assert.equal(await canBuyerBypassPublicBetaPaidRingtoneLock(buyerId), false, `bypass stays closed for ${buyerId} when ${String(value)}`);
        assert.equal(await canBuyerStartPaidRingtonePurchase(buyerId), false, `paid start stays closed for ${buyerId} when ${String(value)}`);
    }
}

setEnv("false");
for (const buyerId of buyers) {
    assert.equal(await canBuyerBypassPublicBetaPaidRingtoneLock(buyerId), false);
}

const purchaseSource = readFileSync(path.join(root, "lib/ringtone-purchase.ts"), "utf8");
const freeGate = purchaseSource.indexOf("const isFree = split.amountCents === 0;");
const paidGate = purchaseSource.indexOf("if (!isFree && !(await canBuyerStartPaidRingtonePurchase(input.buyerId)))");
assert.ok(freeGate > -1 && paidGate > freeGate);
assert.match(purchaseSource, /pendingAmountCents > 0 && isPublicBetaPaidRingtonePurchaseLocked\(\)/);
assert.match(purchaseSource, /canBuyerBypassPublicBetaPaidRingtoneLock\(input\.buyerId\)/);

const lockSource = readFileSync(path.join(root, "lib/public-beta-ringtone-purchase.ts"), "utf8");
assert.doesNotMatch(lockSource, /isPlatformOwnerUserId/);
assert.match(lockSource, /return false;/);

if (previous === undefined) delete process.env[envName];
else process.env[envName] = previous;

console.log("public-beta-ringtone-owner-lock.test.mjs passed");
