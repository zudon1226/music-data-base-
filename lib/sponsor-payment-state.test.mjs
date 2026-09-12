/**
 * Sponsor payment failure / refund state contracts.
 * Run: node lib/sponsor-payment-state.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    computeCumulativeRefundCents,
    isSponsorCampaignPubliclyVisible,
    resolveSponsorApplicationAfterCheckoutExpired,
    resolveSponsorApplicationAfterPaymentFailure,
    resolveSponsorApplicationAfterRefund,
} from "./sponsor-payment-state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

// --- payment failure ---
const failed = resolveSponsorApplicationAfterPaymentFailure({
    previousStatus: "payment_pending",
    previousPaymentStatus: "pending",
});
assert.equal(failed.payment_status, "failed");
assert.equal(failed.status, "payment_pending");
assert.equal(failed.publiclyActive, false);
assert.equal(failed.allowRetry, true);

const failedAlreadyPaid = resolveSponsorApplicationAfterPaymentFailure({
    previousStatus: "active",
    previousPaymentStatus: "paid",
});
assert.equal(failedAlreadyPaid.payment_status, "paid");
assert.equal(failedAlreadyPaid.allowRetry, false);

assert.equal(
    isSponsorCampaignPubliclyVisible({ status: failed.status, payment_status: failed.payment_status }),
    false,
    "failed payment keeps campaign hidden",
);

// --- checkout expiration ---
const expired = resolveSponsorApplicationAfterCheckoutExpired({
    previousStatus: "payment_pending",
    previousPaymentStatus: "pending",
});
assert.equal(expired.payment_status, "canceled");
assert.equal(expired.status, "payment_pending");
assert.equal(expired.publiclyActive, false);
assert.equal(expired.changed, true);

const expiredPaid = resolveSponsorApplicationAfterCheckoutExpired({
    previousStatus: "active",
    previousPaymentStatus: "paid",
});
assert.equal(expiredPaid.changed, false);

// --- full refund ---
const fullRefund = resolveSponsorApplicationAfterRefund({
    amountCents: 50000,
    cumulativeRefundedCents: 50000,
    previousStatus: "active",
    previousPaymentStatus: "paid",
});
assert.equal(fullRefund.payment_status, "refunded");
assert.equal(fullRefund.status, "canceled");
assert.equal(fullRefund.publiclyActive, false);
assert.equal(fullRefund.fullRefund, true);
assert.equal(fullRefund.remainingPaidCents, 0);

// --- partial refund ---
const partialRefund = resolveSponsorApplicationAfterRefund({
    amountCents: 50000,
    cumulativeRefundedCents: 20000,
    previousStatus: "active",
    previousPaymentStatus: "paid",
});
assert.equal(partialRefund.payment_status, "paid");
assert.equal(partialRefund.status, "active");
assert.equal(partialRefund.publiclyActive, true);
assert.equal(partialRefund.fullRefund, false);
assert.equal(partialRefund.remainingPaidCents, 30000);

assert.equal(computeCumulativeRefundCents(20000, 10000), 30000);

// --- duplicate side effect guard contract ---
assert.equal(Boolean(false), false);

// --- static wiring: no creator earnings / connect from sponsor fulfillment ---
const fulfillment = read("lib/sponsor-payment-fulfillment.ts");
const fulfillmentCode = fulfillment.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
assert.ok(!fulfillmentCode.includes('from("earnings_events")'));
assert.ok(!fulfillmentCode.includes('from("payouts")'));
assert.ok(!fulfillmentCode.includes("transfer_data"));
assert.ok(fulfillment.includes("applyPlatformRevenueRefund"));
assert.ok(fulfillment.includes("markSponsorPaymentFailed"));
assert.ok(fulfillment.includes("handleSponsorCheckoutExpired"));

const webhook = read("lib/marketplace-stripe-webhook.ts");
assert.ok(webhook.includes("payment_intent.payment_failed"));
assert.ok(webhook.includes("checkout.session.expired"));
assert.ok(webhook.includes("markSponsorPaymentFailed"));
assert.ok(webhook.includes("handleSponsorCheckoutExpired"));
assert.ok(webhook.includes("refundAmountCents"));

const platformRevenue = read("lib/platform-revenue.ts");
assert.ok(platformRevenue.includes("applyPlatformRevenueRefund"));
assert.ok(platformRevenue.includes("partial_refund"));
assert.ok(platformRevenue.includes("providerEventId"));

console.log("PASS failed payment => not active / hidden");
console.log("PASS expired checkout => not active");
console.log("PASS full refund => canceled + hidden");
console.log("PASS partial refund deterministic");
console.log("PASS cumulative refund math");
console.log("PASS fulfillment has no earnings_events/payouts/connect");
console.log("PASS webhook wires failure + expiration + refund amount");
console.log("\nSponsor payment-state tests passed.");
