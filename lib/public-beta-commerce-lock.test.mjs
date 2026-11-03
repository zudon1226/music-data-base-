/**
 * Public beta global commerce lock unit checks.
 * Run: node lib/public-beta-commerce-lock.test.mjs
 */
import assert from "node:assert/strict";
import {
    PUBLIC_BETA_COMMERCE_LOCK_CODE,
    PUBLIC_BETA_COMMERCE_LOCK_MESSAGE,
    assertPublicBetaCommerceTransactionAllowed,
    getPublicBetaCommerceLockDenial,
    isPublicBetaCommerceLocked,
    isPublicBetaDisabledDiscountCode,
    isPublicBetaDiscountRedemptionBlocked,
    isPublicBetaMarketplacePaymentFulfillmentBlocked,
    isPublicBetaConnectOnboardingBlocked,
    isPublicBetaPaidSubscriptionEntitlementBlocked,
    isPublicBetaPremiumListenerDownloadBlocked,
    shouldBlockPaidSubscriptionProviderActivation,
} from "./public-beta-commerce-lock.ts";

const previous = process.env.NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED;

function restoreEnv() {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED;
    else process.env.NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED = previous;
}

try {
    delete process.env.NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED;
    assert.equal(isPublicBetaCommerceLocked(), true);
    assert.equal(assertPublicBetaCommerceTransactionAllowed().ok, false);
    assert.equal(getPublicBetaCommerceLockDenial().code, PUBLIC_BETA_COMMERCE_LOCK_CODE);
    assert.equal(getPublicBetaCommerceLockDenial().error, PUBLIC_BETA_COMMERCE_LOCK_MESSAGE);
    assert.equal(isPublicBetaDiscountRedemptionBlocked(), true);
    assert.equal(isPublicBetaMarketplacePaymentFulfillmentBlocked(), true);
    assert.equal(isPublicBetaDisabledDiscountCode("mdb10"), true);
    assert.equal(isPublicBetaDisabledDiscountCode("SAVE5"), false);
    assert.equal(isPublicBetaPaidSubscriptionEntitlementBlocked(), true);
    assert.equal(isPublicBetaPremiumListenerDownloadBlocked(), true);
    assert.equal(isPublicBetaConnectOnboardingBlocked(), true);
    assert.equal(shouldBlockPaidSubscriptionProviderActivation({
        mappedStatus: "active",
        subscriptionPriceCents: 999,
    }), true);
    assert.equal(shouldBlockPaidSubscriptionProviderActivation({
        mappedStatus: "active",
        subscriptionPriceCents: 0,
    }), false);
    assert.equal(shouldBlockPaidSubscriptionProviderActivation({
        mappedStatus: "cancelled",
        subscriptionPriceCents: 999,
    }), false);
    assert.equal(shouldBlockPaidSubscriptionProviderActivation({
        mappedStatus: "past_due",
        subscriptionPriceCents: 999,
    }), false);

    process.env.NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED = "false";
    assert.equal(isPublicBetaCommerceLocked(), false);
    assert.deepEqual(assertPublicBetaCommerceTransactionAllowed(), { ok: true });
    assert.equal(isPublicBetaDiscountRedemptionBlocked(), false);

    console.log("public-beta-commerce-lock.test.mjs passed.");
} finally {
    restoreEnv();
}
