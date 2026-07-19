/**
 * Payment enforcement + lifecycle rules (no DB).
 * Run: node lib/billing/creator-access.test.mjs
 */

import assert from "node:assert/strict";

const CREATOR_SUSPEND_MONTHS_PAST_DUE = 3;
const SUBSCRIPTION_GRACE_PERIOD_DAYS = 7;
const SUBSCRIPTION_PAYMENT_RETRY_LIMIT = 3;

const CREATOR_WITHDRAWAL_LOCKED_MESSAGE =
    "Withdrawals are temporarily unavailable because your Creator subscription is past due. Update your subscription to continue withdrawing earnings.";
const CREATOR_WITHDRAWAL_CANCELED_MESSAGE =
    "Withdrawals are unavailable because your Creator subscription is canceled. Reactivate your subscription to withdraw earnings.";
const CREATOR_WITHDRAWAL_INACTIVE_MESSAGE =
    "Withdrawals are unavailable because your Creator subscription is inactive. Update your subscription to withdraw earnings.";
const CREATOR_WITHDRAWAL_GRACE_ARREARS_MESSAGE =
    "Withdrawals are temporarily unavailable during your subscription grace period with unpaid renewals. Complete payment to continue withdrawing earnings.";

function addDays(iso, days) {
    const date = new Date(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
}

function normalizeSubscriptionStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    if (!value) return "none";
    if (value === "canceled") return "cancelled";
    if (value === "current") return "active";
    if (
        [
            "pending",
            "active",
            "grace_period",
            "past_due",
            "suspended",
            "cancelled",
            "paused",
            "expired",
            "inactive",
        ].includes(value)
    ) {
        return value;
    }
    return "none";
}

function resolveEffectiveSubscriptionStatus(subscription) {
    if (!subscription) return "none";
    const override = normalizeSubscriptionStatus(subscription.admin_override_status);
    if (override !== "none") return override;
    return normalizeSubscriptionStatus(subscription.status);
}

function toBillingPublicStatus(status) {
    if (status === "active") return "current";
    if (status === "grace_period") return "grace_period";
    if (status === "past_due") return "past_due";
    if (status === "cancelled") return "canceled";
    return "inactive";
}

function isCreatorAudience(audience) {
    const value = String(audience || "").trim().toLowerCase();
    return value === "artist" || value === "producer" || value === "creator";
}

function computeMonthsPastDue(pastDueSince, now = new Date()) {
    const start = new Date(pastDueSince).getTime();
    if (!Number.isFinite(start)) return 0;
    return Math.max(0, Math.floor((now.getTime() - start) / (30 * 24 * 60 * 60 * 1000)));
}

function resolveFailedPaymentLifecycle(input) {
    const now = input.now || new Date();
    const paymentRetryCount = Math.max(0, Number(input.previousRetryCount || 0)) + 1;
    const pastDueSince = input.previousPastDueSince || now.toISOString();
    const monthsPastDue = Math.max(
        Number(input.previousMonthsPastDue || 0),
        computeMonthsPastDue(pastDueSince, now),
    );
    const gracePeriodEndsAt = input.previousGraceEndsAt || addDays(now, SUBSCRIPTION_GRACE_PERIOD_DAYS);

    let status = "grace_period";
    if (
        paymentRetryCount >= SUBSCRIPTION_PAYMENT_RETRY_LIMIT
        || new Date(gracePeriodEndsAt).getTime() <= now.getTime()
    ) {
        status = "past_due";
    }
    if (monthsPastDue >= CREATOR_SUSPEND_MONTHS_PAST_DUE) {
        status = "suspended";
    }

    return {
        status,
        pastDueSince,
        monthsPastDue,
        gracePeriodEndsAt,
        paymentRetryCount,
        autoRenew: true,
    };
}

function resolveCancelAtPeriodEnd(input) {
    const now = input.now || new Date();
    const stillActive = Boolean(
        input.currentPeriodEnd
        && new Date(input.currentPeriodEnd).getTime() > now.getTime(),
    );
    const normalized = String(input.currentStatus || "").toLowerCase();
    const status = stillActive
        ? (normalized === "active" || normalized === "current" ? "active" : input.currentStatus)
        : "cancelled";
    return {
        autoRenew: false,
        cancelAtPeriodEnd: true,
        status,
        canceledAt: now.toISOString(),
    };
}

function resolveSuccessfulRenewal() {
    return {
        status: "active",
        autoRenew: true,
        cancelAtPeriodEnd: false,
        monthsPastDue: 0,
    };
}

function evaluateCreatorBillingAccess(subscription, options = {}) {
    const effectiveStatus = resolveEffectiveSubscriptionStatus(subscription);
    const billingStatus = subscription ? toBillingPublicStatus(effectiveStatus) : "inactive";
    const monthsPastDue = Math.max(0, Number(subscription?.months_past_due || 0));
    const creatorType = subscription?.subscription_type || subscription?.creator_type || options.audience || "";
    const isCreator = isCreatorAudience(options.audience) || isCreatorAudience(creatorType);

    let withdrawalsLocked = false;
    let withdrawalLockMessage = null;
    let withdrawalLockCode = null;

    if (isCreator) {
        if (billingStatus === "current") {
            withdrawalsLocked = false;
        } else if (billingStatus === "grace_period") {
            if (monthsPastDue > 0) {
                withdrawalsLocked = true;
                withdrawalLockCode = "WITHDRAWALS_LOCKED_GRACE_ARREARS";
                withdrawalLockMessage = CREATOR_WITHDRAWAL_GRACE_ARREARS_MESSAGE;
            }
        } else if (billingStatus === "past_due") {
            withdrawalsLocked = true;
            withdrawalLockCode = "WITHDRAWALS_LOCKED_PAST_DUE";
            withdrawalLockMessage = CREATOR_WITHDRAWAL_LOCKED_MESSAGE;
        } else if (billingStatus === "canceled") {
            withdrawalsLocked = true;
            withdrawalLockCode = "WITHDRAWALS_LOCKED_CANCELED";
            withdrawalLockMessage = CREATOR_WITHDRAWAL_CANCELED_MESSAGE;
        } else {
            withdrawalsLocked = true;
            withdrawalLockCode = "WITHDRAWALS_LOCKED_INACTIVE";
            withdrawalLockMessage = CREATOR_WITHDRAWAL_INACTIVE_MESSAGE;
        }
    }

    const uploadsLocked = isCreator && (
        effectiveStatus === "suspended"
        || effectiveStatus === "inactive"
        || monthsPastDue >= CREATOR_SUSPEND_MONTHS_PAST_DUE
    );

    return {
        effectiveStatus,
        billingStatus,
        withdrawalsLocked,
        uploadsLocked,
        earningsAccumulate: true,
        walletUpdates: true,
        withdrawalLockMessage,
        withdrawalLockCode,
        autoRenew: subscription?.auto_renew !== false,
        cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
        renewalDate: subscription?.current_period_end || null,
    };
}

// --- Public status mapping ---
assert.equal(toBillingPublicStatus("active"), "current");
assert.equal(toBillingPublicStatus("grace_period"), "grace_period");
assert.equal(toBillingPublicStatus("past_due"), "past_due");
assert.equal(toBillingPublicStatus("cancelled"), "canceled");
assert.equal(toBillingPublicStatus("suspended"), "inactive");
assert.equal(toBillingPublicStatus("expired"), "inactive");
assert.equal(toBillingPublicStatus("inactive"), "inactive");

// --- Active / current → successful withdrawal ---
const active = evaluateCreatorBillingAccess({
    status: "active",
    subscription_type: "artist",
    months_past_due: 0,
    auto_renew: true,
    current_period_end: "2099-01-01T00:00:00.000Z",
});
assert.equal(active.billingStatus, "current");
assert.equal(active.withdrawalsLocked, false);
assert.equal(active.uploadsLocked, false);
assert.equal(active.earningsAccumulate, true);
assert.equal(active.autoRenew, true);

// --- Grace period (no arrears months) → allow ---
const graceOk = evaluateCreatorBillingAccess({
    status: "grace_period",
    subscription_type: "producer",
    months_past_due: 0,
    auto_renew: true,
});
assert.equal(graceOk.billingStatus, "grace_period");
assert.equal(graceOk.withdrawalsLocked, false);

// --- Grace period with arrears → blocked withdrawal ---
const graceArrears = evaluateCreatorBillingAccess({
    status: "grace_period",
    subscription_type: "artist",
    months_past_due: 1,
});
assert.equal(graceArrears.withdrawalsLocked, true);
assert.equal(graceArrears.withdrawalLockCode, "WITHDRAWALS_LOCKED_GRACE_ARREARS");
assert.equal(graceArrears.withdrawalLockMessage, CREATOR_WITHDRAWAL_GRACE_ARREARS_MESSAGE);
assert.equal(graceArrears.earningsAccumulate, true);

// --- Past due → blocked ---
const pastDue = evaluateCreatorBillingAccess({
    status: "past_due",
    subscription_type: "artist",
    months_past_due: 1,
});
assert.equal(pastDue.billingStatus, "past_due");
assert.equal(pastDue.withdrawalsLocked, true);
assert.equal(pastDue.withdrawalLockCode, "WITHDRAWALS_LOCKED_PAST_DUE");
assert.equal(pastDue.uploadsLocked, false);
assert.equal(pastDue.earningsAccumulate, true);

// --- Canceled → blocked ---
const canceled = evaluateCreatorBillingAccess({
    status: "cancelled",
    subscription_type: "producer",
    months_past_due: 0,
});
assert.equal(canceled.billingStatus, "canceled");
assert.equal(canceled.withdrawalsLocked, true);
assert.equal(canceled.withdrawalLockCode, "WITHDRAWALS_LOCKED_CANCELED");
assert.equal(canceled.withdrawalLockMessage, CREATOR_WITHDRAWAL_CANCELED_MESSAGE);

// --- Inactive (suspended / missing) → blocked ---
const suspended = evaluateCreatorBillingAccess({
    status: "suspended",
    subscription_type: "artist",
    months_past_due: CREATOR_SUSPEND_MONTHS_PAST_DUE,
});
assert.equal(suspended.billingStatus, "inactive");
assert.equal(suspended.withdrawalsLocked, true);
assert.equal(suspended.uploadsLocked, true);
assert.equal(suspended.withdrawalLockCode, "WITHDRAWALS_LOCKED_INACTIVE");

const noSub = evaluateCreatorBillingAccess(null, { audience: "artist" });
assert.equal(noSub.billingStatus, "inactive");
assert.equal(noSub.withdrawalsLocked, true);
assert.equal(noSub.withdrawalLockMessage, CREATOR_WITHDRAWAL_INACTIVE_MESSAGE);

// Audience from payout request when subscription row lacks type
const fromAudience = evaluateCreatorBillingAccess(
    { status: "past_due", months_past_due: 1 },
    { audience: "producer" },
);
assert.equal(fromAudience.withdrawalsLocked, true);

// --- Auto-renew default + cancel at period end ---
const cancelWhileActive = resolveCancelAtPeriodEnd({
    currentStatus: "active",
    currentPeriodEnd: "2099-06-01T00:00:00.000Z",
    now: new Date("2026-07-19T00:00:00.000Z"),
});
assert.equal(cancelWhileActive.autoRenew, false);
assert.equal(cancelWhileActive.cancelAtPeriodEnd, true);
assert.equal(cancelWhileActive.status, "active");

const cancelAfterPeriod = resolveCancelAtPeriodEnd({
    currentStatus: "active",
    currentPeriodEnd: "2020-01-01T00:00:00.000Z",
    now: new Date("2026-07-19T00:00:00.000Z"),
});
assert.equal(cancelAfterPeriod.status, "cancelled");
assert.equal(cancelAfterPeriod.autoRenew, false);

const renewed = resolveSuccessfulRenewal();
assert.equal(renewed.status, "active");
assert.equal(renewed.autoRenew, true);
assert.equal(renewed.cancelAtPeriodEnd, false);

// --- Failed renewal → grace, then past_due, then suspended ---
const firstFail = resolveFailedPaymentLifecycle({
    previousRetryCount: 0,
    now: new Date("2026-07-19T00:00:00.000Z"),
});
assert.equal(firstFail.status, "grace_period");
assert.equal(firstFail.autoRenew, true);
assert.equal(firstFail.paymentRetryCount, 1);

const afterRetries = resolveFailedPaymentLifecycle({
    previousRetryCount: 2,
    previousPastDueSince: "2026-07-19T00:00:00.000Z",
    previousGraceEndsAt: "2026-07-26T00:00:00.000Z",
    now: new Date("2026-07-20T00:00:00.000Z"),
});
assert.equal(afterRetries.status, "past_due");
assert.equal(afterRetries.autoRenew, true);

const afterGraceEnds = resolveFailedPaymentLifecycle({
    previousRetryCount: 0,
    previousGraceEndsAt: "2026-07-10T00:00:00.000Z",
    previousPastDueSince: "2026-07-01T00:00:00.000Z",
    now: new Date("2026-07-19T00:00:00.000Z"),
});
assert.equal(afterGraceEnds.status, "past_due");

const afterThreeMonths = resolveFailedPaymentLifecycle({
    previousRetryCount: 0,
    previousPastDueSince: "2026-04-01T00:00:00.000Z",
    previousMonthsPastDue: 3,
    previousGraceEndsAt: "2026-04-08T00:00:00.000Z",
    now: new Date("2026-07-19T00:00:00.000Z"),
});
assert.equal(afterThreeMonths.status, "suspended");
assert.equal(toBillingPublicStatus(afterThreeMonths.status), "inactive");

// Override can restore current for admin
const overrideActive = evaluateCreatorBillingAccess({
    status: "suspended",
    admin_override_status: "active",
    subscription_type: "producer",
    months_past_due: 4,
});
assert.equal(overrideActive.billingStatus, "current");
assert.equal(overrideActive.withdrawalsLocked, false);

console.log("creator-access.test.mjs: all assertions passed");
