/**
 * UNIT TESTS — paid ringtone files require a purchase entitlement.
 * No Stripe calls and no database access.
 *
 * Run: node --import ./scripts/register-cleanup-protection-test.mjs lib/public-beta-ringtone-download-entitlement.test.mjs
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

const { assertMarketplaceRingtoneDownloadAllowed } = await import("./public-beta-ringtone-purchase.ts");

const listenerId = "11111111-1111-4111-8111-111111111111";
const creatorId = "33333333-3333-4333-8333-333333333333";
const adminId = "22222222-2222-4222-8222-222222222222";
const ownerId = "1996c17b-121e-4592-a0a0-ccae6d289ccd";

setEnv(undefined);
for (const userId of [listenerId, creatorId, adminId, ownerId]) {
    const denied = await assertMarketplaceRingtoneDownloadAllowed({
        userId,
        priceCents: 199,
        hasPaidPurchase: false,
        ownerTesting: true,
        creatorTesting: true,
    });
    assert.equal(denied.ok, false, `unpurchased paid download stays closed for ${userId}`);
    assert.equal(denied.status, 403);
    assert.equal(denied.code, "PURCHASING_UNAVAILABLE");
}

const purchaser = await assertMarketplaceRingtoneDownloadAllowed({
    userId: listenerId,
    priceCents: 199,
    hasPaidPurchase: true,
    ownerTesting: true,
    creatorTesting: true,
});
assert.equal(purchaser.ok, true);

const freeEntitlement = await assertMarketplaceRingtoneDownloadAllowed({
    userId: listenerId,
    priceCents: 0,
    hasPaidPurchase: true,
});
assert.equal(freeEntitlement.ok, true);

const freeWithoutEntitlement = await assertMarketplaceRingtoneDownloadAllowed({
    userId: creatorId,
    priceCents: 0,
    hasPaidPurchase: false,
    creatorTesting: true,
});
assert.equal(freeWithoutEntitlement.ok, false);
assert.equal(freeWithoutEntitlement.code, "PURCHASE_REQUIRED");

const downloadRoute = readFileSync(path.join(root, "app/api/ringtones/[id]/download/route.ts"), "utf8");
const ticketRoute = readFileSync(path.join(root, "app/api/ringtones/[id]/download-ticket/route.ts"), "utf8");
const gateSource = readFileSync(path.join(root, "lib/public-beta-ringtone-purchase.ts"), "utf8");
for (const source of [downloadRoute, ticketRoute, gateSource]) {
    assert.doesNotMatch(source, /ownerTesting/);
    assert.doesNotMatch(source, /creatorTesting/);
}
assert.match(downloadRoute, /hasPaidPurchase: Boolean\(purchase\)/);
assert.match(ticketRoute, /hasPaidPurchase: Boolean\(purchase\)/);

if (previous === undefined) delete process.env[envName];
else process.env[envName] = previous;

console.log("public-beta-ringtone-download-entitlement.test.mjs passed");
