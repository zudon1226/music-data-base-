/**
 * UNIT TESTS — payout and sponsor beta freezes.
 * No Stripe calls and no database access.
 *
 * Run: node --import ./scripts/register-cleanup-protection-test.mjs lib/public-beta-payment-freeze.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const payoutEnv = "NEXT_PUBLIC_PUBLIC_BETA_PAYOUT_REQUESTS_LOCKED";
const sponsorEnv = "NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED";
const previousPayout = process.env[payoutEnv];
const previousSponsor = process.env[sponsorEnv];

function setEnv(key, value) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
}

const { isPublicBetaPayoutRequestsLocked, payoutRequestsLockedResult } = await import("./public-beta-payout-requests.ts");
const { canUserStartSponsorCheckout, assertSponsorCheckoutAllowed } = await import("./public-beta-sponsor-checkout.ts");
const { getAccessTokenFromRequest, getRefreshTokenFromRequest } = await import("./request-auth.ts");

const ownerId = "1996c17b-121e-4592-a0a0-ccae6d289ccd";
const listenerId = "11111111-1111-4111-8111-111111111111";

for (const value of [undefined, "", "1", "true", "yes", "on", "maybe"]) {
    setEnv(payoutEnv, value);
    assert.equal(isPublicBetaPayoutRequestsLocked(), true, `payouts stay locked for ${String(value)}`);
}
setEnv(payoutEnv, "false");
assert.equal(isPublicBetaPayoutRequestsLocked(), false);
const locked = payoutRequestsLockedResult();
assert.equal(locked.status, 403);
assert.equal(locked.code, "PAYOUT_REQUESTS_LOCKED");

const payoutRoute = readFileSync(path.join(root, "app/api/payouts/route.ts"), "utf8");
const payoutLock = payoutRoute.indexOf("isPublicBetaPayoutRequestsLocked()");
const payoutInsert = payoutRoute.indexOf('.from("payouts")');
assert.ok(payoutLock > -1 && payoutInsert > payoutLock);
assert.match(payoutRoute, /payoutRequestsLockedResult\(\)/);
assert.doesNotMatch(payoutRoute, /isPlatformOwnerUserId/);

for (const value of [undefined, "", "true", "1"]) {
    setEnv(sponsorEnv, value);
    assert.equal(await canUserStartSponsorCheckout(ownerId), false);
    assert.equal(await canUserStartSponsorCheckout(listenerId), false);
    const sponsor = await assertSponsorCheckoutAllowed(ownerId);
    assert.equal(sponsor.ok, false);
    assert.equal(sponsor.status, 503);
}
setEnv(sponsorEnv, "off");
assert.equal(await canUserStartSponsorCheckout(ownerId), true);
assert.doesNotMatch(readFileSync(path.join(root, "lib/public-beta-sponsor-checkout.ts"), "utf8"), /isPlatformOwnerUserId/);

const queryUrl = "http://127.0.0.1/api/payouts?access_token=query-access&refresh_token=query-refresh";
const request = new Request(queryUrl, {
    headers: {
        authorization: "Bearer header-access",
        "x-supabase-refresh-token": "header-refresh",
    },
});
assert.equal(getAccessTokenFromRequest(request), "header-access");
assert.equal(getRefreshTokenFromRequest(request), "header-refresh");
const queryOnly = new Request(queryUrl);
assert.equal(getAccessTokenFromRequest(queryOnly, "body-access"), "body-access");
assert.equal(getRefreshTokenFromRequest(queryOnly, "body-refresh"), "body-refresh");
assert.equal(getAccessTokenFromRequest(queryOnly), "");
assert.equal(getRefreshTokenFromRequest(queryOnly), "");

if (previousPayout === undefined) delete process.env[payoutEnv];
else process.env[payoutEnv] = previousPayout;
if (previousSponsor === undefined) delete process.env[sponsorEnv];
else process.env[sponsorEnv] = previousSponsor;

console.log("public-beta-payment-freeze.test.mjs passed");
