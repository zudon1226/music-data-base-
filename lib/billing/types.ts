import type {
    AccountSubscriptionAudience,
    PaymentProviderId,
    SubscriptionStatus,
} from "@/lib/billing/constants";

export type SubscriptionPlanRow = {
    id: string;
    name: string;
    audience: string;
    price_cents: number;
    currency: string;
    billing_interval: string;
    features: unknown;
    active: boolean;
    sort_order: number;
    description?: string | null;
    stripe_price_id?: string | null;
};

export type SubscriptionRow = {
    id: string;
    user_id: string;
    plan_id: string | null;
    plan_name: string;
    status: SubscriptionStatus | string;
    price_cents: number;
    currency: string;
    subscription_type?: string | null;
    creator_type?: string | null;
    started_at: string | null;
    current_period_end: string | null;
    canceled_at?: string | null;
    auto_renew?: boolean | null;
    cancel_at_period_end?: boolean | null;
    grace_period_ends_at?: string | null;
    past_due_since?: string | null;
    months_past_due?: number | null;
    payment_provider?: PaymentProviderId | string | null;
    provider_customer_id?: string | null;
    provider_subscription_id?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    last_payment_at?: string | null;
    last_payment_failed_at?: string | null;
    payment_retry_count?: number | null;
    renewal_reminder_sent_at?: string | null;
    admin_override_status?: string | null;
    admin_override_note?: string | null;
    admin_override_by?: string | null;
    admin_override_at?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at?: string;
    updated_at?: string;
};

export type SubscriptionPaymentRow = {
    id: string;
    subscription_id: string | null;
    user_id: string;
    plan_id: string | null;
    amount_cents: number;
    currency: string;
    status: string;
    payment_provider: string;
    provider_payment_id: string | null;
    failure_code: string | null;
    failure_message: string | null;
    attempt_number: number;
    refunded_at: string | null;
    refund_amount_cents: number | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
};

export type CreatorBillingAccess = {
    subscription: SubscriptionRow | null;
    /** Internal/DB effective status. */
    effectiveStatus: SubscriptionStatus | "none";
    /** Public Artist/Producer status: current | grace_period | past_due | canceled | inactive */
    billingStatus: import("@/lib/billing/constants").BillingPublicStatus;
    isCreatorAudience: boolean;
    withdrawalsLocked: boolean;
    uploadsLocked: boolean;
    newReleasesLocked: boolean;
    /** Always true — balances are never reduced when withdrawals are blocked. */
    earningsAccumulate: boolean;
    walletUpdates: boolean;
    withdrawalLockMessage: string | null;
    withdrawalLockCode: string | null;
    uploadLockMessage: string | null;
    overdueBalanceCents: number;
    monthsPastDue: number;
    renewalDate: string | null;
    autoRenew: boolean;
    cancelAtPeriodEnd: boolean;
};

export type CheckoutSessionResult = {
    provider: PaymentProviderId;
    checkoutUrl: string | null;
    sessionId: string;
    subscriptionId: string;
    mode: "live" | "test";
    message: string;
};

export type StartCheckoutInput = {
    userId: string;
    planId: string;
    audience: AccountSubscriptionAudience;
    provider?: PaymentProviderId;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
};
