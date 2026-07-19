/** Subscription billing constants — production baseline business rules. */

/** Internal / DB subscription statuses (legacy + lifecycle). */
export const SUBSCRIPTION_STATUSES = [
    "pending",
    "active",
    "grace_period",
    "past_due",
    "suspended",
    "cancelled",
    "paused",
    "expired",
    "inactive",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Public Artist/Producer billing statuses used for enforcement + admin views.
 * - current: paid and in good standing (DB: active)
 * - grace_period: failed renewal retry window
 * - past_due: unpaid after grace
 * - canceled: user cancelled (DB: cancelled)
 * - inactive: suspended / expired / paused / no subscription
 */
export const BILLING_PUBLIC_STATUSES = [
    "current",
    "grace_period",
    "past_due",
    "canceled",
    "inactive",
] as const;

export type BillingPublicStatus = (typeof BILLING_PUBLIC_STATUSES)[number];

export const PAYMENT_PROVIDERS = ["stripe", "paypal", "test"] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export const ACCOUNT_SUBSCRIPTION_AUDIENCES = ["listener", "artist", "producer"] as const;
export type AccountSubscriptionAudience = (typeof ACCOUNT_SUBSCRIPTION_AUDIENCES)[number];

/** Days after a failed renewal before moving from grace_period → past_due. */
export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 7;

/** Failed-payment retry attempts before escalation. */
export const SUBSCRIPTION_PAYMENT_RETRY_LIMIT = 3;

/** Hours between automatic payment retries. */
export const SUBSCRIPTION_PAYMENT_RETRY_HOURS = 24;

/** Days before period end to send renewal reminder email. */
export const SUBSCRIPTION_RENEWAL_REMINDER_DAYS = 3;

/** Months past due before creator account becomes Suspended/inactive. */
export const CREATOR_SUSPEND_MONTHS_PAST_DUE = 3;

export const CREATOR_WITHDRAWAL_LOCKED_MESSAGE =
    "Withdrawals are temporarily unavailable because your Creator subscription is past due. Update your subscription to continue withdrawing earnings.";

export const CREATOR_WITHDRAWAL_CANCELED_MESSAGE =
    "Withdrawals are unavailable because your Creator subscription is canceled. Reactivate your subscription to withdraw earnings.";

export const CREATOR_WITHDRAWAL_INACTIVE_MESSAGE =
    "Withdrawals are unavailable because your Creator subscription is inactive. Update your subscription to withdraw earnings.";

export const CREATOR_WITHDRAWAL_GRACE_ARREARS_MESSAGE =
    "Withdrawals are temporarily unavailable during your subscription grace period with unpaid renewals. Complete payment to continue withdrawing earnings.";

export const CREATOR_UPLOADS_LOCKED_MESSAGE =
    "Uploads and new releases are disabled because your Creator subscription is suspended. Update your subscription to restore publishing.";

export const LISTENER_PLAN_FEATURES = [
    "Unlimited streaming",
    "Library",
    "Playlists",
    "Queue",
    "Recommendations",
    "Auto-renew by default",
    "Cancel anytime",
] as const;
