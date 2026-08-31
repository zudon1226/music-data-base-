/**
 * Paid subscription 10-day period-notice contracts (no DB).
 * Mirrors lib/billing/period-notice.ts. Run: node lib/billing/period-notice.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PERIOD_NOTICE_DAY_MS = 86_400_000;
const SUBSCRIPTION_PERIOD_NOTICE_DAYS = 10;
const LOGIN_NOTICE_DISMISSED_PERIOD_END_KEY = "loginNoticeDismissedPeriodEnd";

function isPaidSubscription(subscription) {
    return Number(subscription?.price_cents || 0) > 0;
}

function isActiveSubscriptionStatus(status) {
    return String(status || "").trim().toLowerCase() === "active";
}

function isSubscriptionEndingAtPeriodEnd(subscription) {
    if (!subscription) return false;
    return subscription.cancel_at_period_end === true || subscription.auto_renew === false;
}

function periodNoticeRemainingMs(periodEnd, now = new Date()) {
    if (!periodEnd) return 0;
    const end = new Date(periodEnd).getTime();
    if (!Number.isFinite(end)) return 0;
    return end - now.getTime();
}

function isWithinPeriodNoticeWindow(periodEnd, now = new Date(), days = SUBSCRIPTION_PERIOD_NOTICE_DAYS) {
    const remaining = periodNoticeRemainingMs(periodEnd, now);
    return remaining > 0 && remaining <= days * PERIOD_NOTICE_DAY_MS;
}

function periodNoticeDaysRemaining(periodEnd, now = new Date()) {
    const remaining = periodNoticeRemainingMs(periodEnd, now);
    if (remaining <= 0) return 0;
    return Math.max(1, Math.ceil(remaining / PERIOD_NOTICE_DAY_MS));
}

function periodNoticeBody(daysRemaining, ending) {
    const days = Math.max(1, Math.floor(Number(daysRemaining) || 1));
    const unit = days === 1 ? "day" : "days";
    return ending
        ? `Your subscription will expire in ${days} ${unit}.`
        : `Your subscription will renew in ${days} ${unit}.`;
}

function periodNoticeEventKey(subscriptionId, periodEnd) {
    const id = String(subscriptionId || "").trim();
    const end = periodEnd ? new Date(periodEnd).toISOString() : "";
    return `subscription_period_notice:${id}:${end}`.slice(0, 240);
}

function isLoginNoticeDismissedForPeriod(subscription, periodEnd) {
    const dismissed = String(subscription?.metadata?.[LOGIN_NOTICE_DISMISSED_PERIOD_END_KEY] || "").trim();
    const current = String(periodEnd || subscription?.current_period_end || "").trim();
    if (!dismissed || !current) return false;
    const dismissedMs = new Date(dismissed).getTime();
    const currentMs = new Date(current).getTime();
    if (Number.isFinite(dismissedMs) && Number.isFinite(currentMs)) {
        return dismissedMs === currentMs;
    }
    return dismissed === current;
}

function shouldShowLoginPeriodNotice(subscription, now = new Date()) {
    if (!subscription) return false;
    if (!isPaidSubscription(subscription)) return false;
    if (!isActiveSubscriptionStatus(subscription.status)) return false;
    if (!isWithinPeriodNoticeWindow(subscription.current_period_end, now)) return false;
    if (isLoginNoticeDismissedForPeriod(subscription, subscription.current_period_end)) return false;
    return true;
}

const now = new Date("2026-08-28T14:00:00.000Z");
function periodEndInDays(days) {
    return new Date(now.getTime() + days * PERIOD_NOTICE_DAY_MS).toISOString();
}

const paidRenew = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "active",
    price_cents: 699,
    auto_renew: true,
    cancel_at_period_end: false,
    current_period_end: periodEndInDays(10),
    metadata: {},
};

assert.equal(isWithinPeriodNoticeWindow(periodEndInDays(10), now), true, "exactly 10 days is in window");
assert.equal(periodNoticeDaysRemaining(periodEndInDays(10), now), 10);
assert.equal(shouldShowLoginPeriodNotice({ ...paidRenew, current_period_end: periodEndInDays(10) }, now), true);
assert.equal(
    periodNoticeBody(10, false),
    "Your subscription will renew in 10 days.",
);

assert.equal(isWithinPeriodNoticeWindow(periodEndInDays(9), now), true, "9 days is in window");
assert.equal(shouldShowLoginPeriodNotice({ ...paidRenew, current_period_end: periodEndInDays(9) }, now), true);
assert.equal(periodNoticeBody(9, false), "Your subscription will renew in 9 days.");

assert.equal(isWithinPeriodNoticeWindow(periodEndInDays(11), now), false, "11 days is outside window");
assert.equal(shouldShowLoginPeriodNotice({ ...paidRenew, current_period_end: periodEndInDays(11) }, now), false);

assert.equal(
    shouldShowLoginPeriodNotice({ ...paidRenew, price_cents: 0, current_period_end: periodEndInDays(9) }, now),
    false,
    "free plan excluded",
);

const ending = {
    ...paidRenew,
    auto_renew: false,
    cancel_at_period_end: true,
    current_period_end: periodEndInDays(8),
};
assert.equal(isSubscriptionEndingAtPeriodEnd(ending), true);
assert.equal(shouldShowLoginPeriodNotice(ending, now), true);
assert.equal(periodNoticeBody(8, true), "Your subscription will expire in 8 days.");

const dismissedPeriod = periodEndInDays(9);
assert.equal(
    shouldShowLoginPeriodNotice({
        ...paidRenew,
        current_period_end: dismissedPeriod,
        metadata: { [LOGIN_NOTICE_DISMISSED_PERIOD_END_KEY]: dismissedPeriod },
    }, now),
    false,
    "dismissed current cycle stays hidden",
);

const nextCycleEnd = periodEndInDays(10);
assert.equal(
    shouldShowLoginPeriodNotice({
        ...paidRenew,
        current_period_end: nextCycleEnd,
        metadata: { [LOGIN_NOTICE_DISMISSED_PERIOD_END_KEY]: dismissedPeriod },
    }, now),
    true,
    "future billing cycle can remind again",
);

const eventA = periodNoticeEventKey(paidRenew.id, periodEndInDays(10));
const eventB = periodNoticeEventKey(paidRenew.id, periodEndInDays(10));
const eventNext = periodNoticeEventKey(paidRenew.id, periodEndInDays(40));
assert.equal(eventA, eventB, "same cycle uses the same event_key");
assert.notEqual(eventA, eventNext, "next cycle gets a new event_key");

assert.equal(isActiveSubscriptionStatus("grace_period"), false);
assert.equal(shouldShowLoginPeriodNotice({ ...paidRenew, status: "grace_period" }, now), false);

const source = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "period-notice.ts"),
    "utf8",
);
assert.match(source, /SUBSCRIPTION_PERIOD_NOTICE_DAYS/);
assert.match(source, /Your subscription will renew in/);
assert.match(source, /Your subscription will expire in/);
assert.match(source, /subscription_period_notice:/);

console.log("period-notice.test.mjs: all assertions passed");
