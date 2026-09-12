/**
 * Pure sponsor payment / refund state resolution (no DB, no Stripe).
 * Used by lib/sponsor-payment-fulfillment.ts and lib/sponsor-payment-state.test.mjs
 */

export const SPONSOR_PUBLIC_ACTIVE_STATUSES = new Set(["active", "scheduled", "paid"]);

/** Campaign is publicly visible only when active + paid + in window (date checks are separate). */
export function isSponsorCampaignPubliclyVisible(application) {
    if (!application) return false;
    const status = String(application.status || "");
    const paymentStatus = String(application.payment_status || "");
    if (status !== "active") return false;
    if (paymentStatus !== "paid") return false;
    return true;
}

export function resolveSponsorApplicationAfterPaymentFailure(input = {}) {
    const previousPaymentStatus = String(input.previousPaymentStatus || "");
    if (previousPaymentStatus === "paid") {
        return {
            payment_status: "paid",
            status: String(input.previousStatus || "active"),
            publiclyActive: isSponsorCampaignPubliclyVisible({
                status: input.previousStatus,
                payment_status: "paid",
            }),
            allowRetry: false,
        };
    }
    return {
        payment_status: "failed",
        status: "payment_pending",
        publiclyActive: false,
        allowRetry: true,
    };
}

export function resolveSponsorApplicationAfterCheckoutExpired(input = {}) {
    const previousPaymentStatus = String(input.previousPaymentStatus || "");
    if (previousPaymentStatus === "paid") {
        return {
            payment_status: "paid",
            status: String(input.previousStatus || "active"),
            publiclyActive: isSponsorCampaignPubliclyVisible({
                status: input.previousStatus,
                payment_status: "paid",
            }),
            changed: false,
        };
    }
    return {
        payment_status: "canceled",
        status: "payment_pending",
        publiclyActive: false,
        changed: true,
    };
}

export function resolveSponsorApplicationAfterRefund(input = {}) {
    const amountCents = Math.max(0, Math.round(Number(input.amountCents) || 0));
    const cumulativeRefundedCents = Math.max(0, Math.round(Number(input.cumulativeRefundedCents) || 0));
    const previousStatus = String(input.previousStatus || "");
    const previousPaymentStatus = String(input.previousPaymentStatus || "");
    const remainingPaidCents = Math.max(0, amountCents - cumulativeRefundedCents);

    if (remainingPaidCents <= 0) {
        return {
            status: "canceled",
            payment_status: "refunded",
            publiclyActive: false,
            remainingPaidCents: 0,
            fullRefund: true,
        };
    }

    const keepActive = previousStatus === "active" && previousPaymentStatus === "paid";
    return {
        status: keepActive ? "active" : previousStatus || "payment_pending",
        payment_status: "paid",
        publiclyActive: keepActive,
        remainingPaidCents,
        fullRefund: false,
    };
}

export function computeCumulativeRefundCents(previousRefundedCents, refundDeltaCents) {
    const previous = Math.max(0, Math.round(Number(previousRefundedCents) || 0));
    const delta = Math.max(0, Math.round(Number(refundDeltaCents) || 0));
    return previous + delta;
}

export function isDuplicateSponsorSideEffect(alreadyProcessed) {
    return Boolean(alreadyProcessed);
}
