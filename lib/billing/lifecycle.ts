import {
    CREATOR_SUSPEND_MONTHS_PAST_DUE,
    SUBSCRIPTION_GRACE_PERIOD_DAYS,
    SUBSCRIPTION_PAYMENT_RETRY_LIMIT,
    type SubscriptionStatus,
} from "@/lib/billing/constants";

function addDays(iso: string | Date, days: number) {
    const date = new Date(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
}

/** Months elapsed since past-due start (30-day months). */
export function computeMonthsPastDue(pastDueSince: string | Date, now = new Date()) {
    const start = new Date(pastDueSince).getTime();
    if (!Number.isFinite(start)) return 0;
    return Math.max(0, Math.floor((now.getTime() - start) / (30 * 24 * 60 * 60 * 1000)));
}

export type FailedPaymentLifecycleInput = {
    previousRetryCount: number;
    previousGraceEndsAt?: string | null;
    previousPastDueSince?: string | null;
    previousMonthsPastDue?: number | null;
    now?: Date;
};

export type FailedPaymentLifecycleResult = {
    status: SubscriptionStatus;
    pastDueSince: string;
    monthsPastDue: number;
    gracePeriodEndsAt: string;
    paymentRetryCount: number;
    /** Auto-renew stays enabled during recovery attempts unless user cancelled. */
    autoRenew: true;
};

/**
 * Failed renewal handling:
 * - first failures → grace_period (retries)
 * - after retry limit or grace end → past_due
 * - after 3 months unpaid → suspended (public: inactive)
 * Auto-renew remains enabled so recovery can succeed.
 */
export function resolveFailedPaymentLifecycle(input: FailedPaymentLifecycleInput): FailedPaymentLifecycleResult {
    const now = input.now || new Date();
    const paymentRetryCount = Math.max(0, Number(input.previousRetryCount || 0)) + 1;
    const pastDueSince = input.previousPastDueSince || now.toISOString();
    const monthsPastDue = Math.max(
        Number(input.previousMonthsPastDue || 0),
        computeMonthsPastDue(pastDueSince, now),
    );
    const gracePeriodEndsAt = input.previousGraceEndsAt || addDays(now, SUBSCRIPTION_GRACE_PERIOD_DAYS);

    let status: SubscriptionStatus = "grace_period";
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

export type CancelAtPeriodEndResult = {
    autoRenew: false;
    cancelAtPeriodEnd: true;
    status: SubscriptionStatus | string;
    canceledAt: string;
};

/** Cancel renewals at period end; keep access while period remains. */
export function resolveCancelAtPeriodEnd(input: {
    currentStatus: string;
    currentPeriodEnd?: string | null;
    now?: Date;
}): CancelAtPeriodEndResult {
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

/** After successful renewal / payment, restore current standing with auto-renew on. */
export function resolveSuccessfulRenewal(now = new Date()) {
    return {
        status: "active" as const,
        autoRenew: true as const,
        cancelAtPeriodEnd: false as const,
        monthsPastDue: 0,
        gracePeriodEndsAt: null,
        pastDueSince: null,
        paymentRetryCount: 0,
        currentPeriodEnd: addDays(now, 30),
    };
}
