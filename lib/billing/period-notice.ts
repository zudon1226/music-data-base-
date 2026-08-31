import {
    LOGIN_NOTICE_DISMISSED_PERIOD_END_KEY,
    SUBSCRIPTION_PERIOD_NOTICE_DAYS,
} from "@/lib/billing/constants";

export const PERIOD_NOTICE_DAY_MS = 86_400_000;

export const PERIOD_NOTICE_RENEWAL_KIND = "subscription_renewal_reminder";
export const PERIOD_NOTICE_EXPIRATION_KIND = "subscription_expiration_reminder";

export type PeriodNoticeSubscription = {
    id?: string | null;
    status?: string | null;
    price_cents?: number | null;
    current_period_end?: string | null;
    auto_renew?: boolean | null;
    cancel_at_period_end?: boolean | null;
    metadata?: Record<string, unknown> | null;
};

export function isPaidSubscription(subscription: PeriodNoticeSubscription | null | undefined) {
    return Number(subscription?.price_cents || 0) > 0;
}

export function isActiveSubscriptionStatus(status: unknown) {
    return String(status || "").trim().toLowerCase() === "active";
}

export function isSubscriptionEndingAtPeriodEnd(subscription: PeriodNoticeSubscription | null | undefined) {
    if (!subscription) return false;
    return subscription.cancel_at_period_end === true || subscription.auto_renew === false;
}

export function periodNoticeRemainingMs(periodEnd: string | Date | null | undefined, now = new Date()) {
    if (!periodEnd) return 0;
    const end = new Date(periodEnd).getTime();
    if (!Number.isFinite(end)) return 0;
    return end - now.getTime();
}

export function isWithinPeriodNoticeWindow(
    periodEnd: string | Date | null | undefined,
    now = new Date(),
    days = SUBSCRIPTION_PERIOD_NOTICE_DAYS,
) {
    const remaining = periodNoticeRemainingMs(periodEnd, now);
    return remaining > 0 && remaining <= days * PERIOD_NOTICE_DAY_MS;
}

export function periodNoticeDaysRemaining(periodEnd: string | Date | null | undefined, now = new Date()) {
    const remaining = periodNoticeRemainingMs(periodEnd, now);
    if (remaining <= 0) return 0;
    return Math.max(1, Math.ceil(remaining / PERIOD_NOTICE_DAY_MS));
}

export function periodNoticeBody(daysRemaining: number, ending: boolean) {
    const days = Math.max(1, Math.floor(Number(daysRemaining) || 1));
    const unit = days === 1 ? "day" : "days";
    return ending
        ? `Your subscription will expire in ${days} ${unit}.`
        : `Your subscription will renew in ${days} ${unit}.`;
}

export function periodNoticeEventKey(subscriptionId: string, periodEnd: string | Date | null | undefined) {
    const id = String(subscriptionId || "").trim();
    const end = periodEnd ? new Date(periodEnd).toISOString() : "";
    return `subscription_period_notice:${id}:${end}`.slice(0, 240);
}

export function isLoginNoticeDismissedForPeriod(
    subscription: PeriodNoticeSubscription | null | undefined,
    periodEnd?: string | null,
) {
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

export function shouldShowLoginPeriodNotice(
    subscription: PeriodNoticeSubscription | null | undefined,
    now = new Date(),
) {
    if (!subscription) return false;
    if (!isPaidSubscription(subscription)) return false;
    if (!isActiveSubscriptionStatus(subscription.status)) return false;
    if (!isWithinPeriodNoticeWindow(subscription.current_period_end, now)) return false;
    if (isLoginNoticeDismissedForPeriod(subscription, subscription.current_period_end)) return false;
    return true;
}

export function evaluatePeriodNotice(
    subscription: PeriodNoticeSubscription | null | undefined,
    now = new Date(),
) {
    const ending = isSubscriptionEndingAtPeriodEnd(subscription);
    const daysRemaining = periodNoticeDaysRemaining(subscription?.current_period_end, now);
    return {
        eligible: shouldShowLoginPeriodNotice(subscription, now),
        ending,
        daysRemaining,
        body: periodNoticeBody(Math.max(1, daysRemaining), ending),
        kind: ending ? PERIOD_NOTICE_EXPIRATION_KIND : PERIOD_NOTICE_RENEWAL_KIND,
        title: ending ? "Subscription expiration reminder" : "Subscription renewal reminder",
    };
}
