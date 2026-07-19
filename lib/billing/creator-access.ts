import {
    CREATOR_SUSPEND_MONTHS_PAST_DUE,
    CREATOR_UPLOADS_LOCKED_MESSAGE,
    CREATOR_WITHDRAWAL_CANCELED_MESSAGE,
    CREATOR_WITHDRAWAL_GRACE_ARREARS_MESSAGE,
    CREATOR_WITHDRAWAL_INACTIVE_MESSAGE,
    CREATOR_WITHDRAWAL_LOCKED_MESSAGE,
    type BillingPublicStatus,
    type SubscriptionStatus,
} from "@/lib/billing/constants";
import type { CreatorBillingAccess, SubscriptionRow } from "@/lib/billing/types";

export type EvaluateBillingAccessOptions = {
    /** Known account audience when evaluating withdrawal for Artist/Producer payouts. */
    audience?: string | null;
};

export function normalizeSubscriptionStatus(status: unknown): SubscriptionStatus | "none" {
    const value = String(status || "").trim().toLowerCase();
    if (!value) return "none";
    if (value === "canceled") return "cancelled";
    if (value === "current") return "active";
    if (
        value === "pending"
        || value === "active"
        || value === "grace_period"
        || value === "past_due"
        || value === "suspended"
        || value === "cancelled"
        || value === "paused"
        || value === "expired"
        || value === "inactive"
    ) {
        return value;
    }
    return "none";
}

export function resolveEffectiveSubscriptionStatus(subscription: SubscriptionRow | null): SubscriptionStatus | "none" {
    if (!subscription) return "none";
    const override = normalizeSubscriptionStatus(subscription.admin_override_status);
    if (override !== "none") return override;
    return normalizeSubscriptionStatus(subscription.status);
}

/** Map internal/DB status → public Artist/Producer billing status. */
export function toBillingPublicStatus(status: SubscriptionStatus | "none"): BillingPublicStatus {
    if (status === "active") return "current";
    if (status === "grace_period") return "grace_period";
    if (status === "past_due") return "past_due";
    if (status === "cancelled") return "canceled";
    return "inactive";
}

export function isCreatorAudience(audience: unknown) {
    const value = String(audience || "").trim().toLowerCase();
    return value === "artist" || value === "producer" || value === "creator";
}

function computeOverdueBalanceCents(subscription: SubscriptionRow | null, billingStatus: BillingPublicStatus) {
    if (!subscription) return 0;
    const price = Math.max(0, Math.round(Number(subscription.price_cents || 0)));
    const months = Math.max(0, Number(subscription.months_past_due || 0));
    if (billingStatus === "past_due" || billingStatus === "inactive") {
        return price * Math.max(months, months > 0 ? months : 1);
    }
    if (billingStatus === "grace_period" && months > 0) {
        return price * months;
    }
    if (billingStatus === "canceled" && months > 0) {
        return price * months;
    }
    return 0;
}

/**
 * Grace-period withdrawal policy (existing):
 * - months_past_due === 0 → withdrawals allowed (retry window before arrears)
 * - months_past_due > 0 → withdrawals denied
 *
 * Always deny for past_due, canceled, inactive.
 * Always allow for current.
 * Never reduce earned balances — this function only gates withdrawals.
 */
export function evaluateCreatorBillingAccess(
    subscription: SubscriptionRow | null,
    options: EvaluateBillingAccessOptions = {},
): CreatorBillingAccess {
    const effectiveStatus = resolveEffectiveSubscriptionStatus(subscription);
    const billingStatus = subscription
        ? toBillingPublicStatus(effectiveStatus)
        : "inactive";
    const monthsPastDue = Math.max(0, Number(subscription?.months_past_due || 0));
    const creatorType = subscription?.subscription_type || subscription?.creator_type || options.audience || "";
    const isCreator = isCreatorAudience(options.audience) || isCreatorAudience(creatorType);

    let withdrawalsLocked = false;
    let withdrawalLockMessage: string | null = null;
    let withdrawalLockCode: string | null = null;

    if (isCreator) {
        if (billingStatus === "current") {
            withdrawalsLocked = false;
        } else if (billingStatus === "grace_period") {
            // Existing grace-period policy: lock only once unpaid months are counted.
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
            // inactive (suspended / expired / paused / missing subscription)
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

    const overdueBalanceCents = isCreator
        ? computeOverdueBalanceCents(subscription, billingStatus)
        : 0;

    return {
        subscription,
        effectiveStatus,
        billingStatus,
        isCreatorAudience: isCreator,
        withdrawalsLocked,
        uploadsLocked,
        newReleasesLocked: uploadsLocked,
        earningsAccumulate: true,
        walletUpdates: true,
        withdrawalLockMessage,
        withdrawalLockCode,
        uploadLockMessage: uploadsLocked ? CREATOR_UPLOADS_LOCKED_MESSAGE : null,
        overdueBalanceCents,
        monthsPastDue,
        renewalDate: subscription?.current_period_end || null,
        autoRenew: subscription?.auto_renew !== false,
        cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    };
}

export function shouldAutoSuspendCreator(monthsPastDue: number, status: SubscriptionStatus | "none") {
    return monthsPastDue >= CREATOR_SUSPEND_MONTHS_PAST_DUE
        || status === "suspended"
        || status === "inactive";
}
