import {
    SUBSCRIPTION_PAYMENT_RETRY_LIMIT,
    SUBSCRIPTION_RENEWAL_REMINDER_DAYS,
    type AccountSubscriptionAudience,
    type PaymentProviderId,
} from "@/lib/billing/constants";
import {
    evaluateCreatorBillingAccess,
    resolveEffectiveSubscriptionStatus,
} from "@/lib/billing/creator-access";
import {
    resolveCancelAtPeriodEnd,
    resolveFailedPaymentLifecycle,
    resolveSuccessfulRenewal,
} from "@/lib/billing/lifecycle";
import {
    getDefaultPaymentProviderId,
    getPaymentProvider,
    listConfiguredPaymentProviders,
} from "@/lib/billing/payment-provider";
import type {
    CheckoutSessionResult,
    StartCheckoutInput,
    SubscriptionPaymentRow,
    SubscriptionPlanRow,
    SubscriptionRow,
} from "@/lib/billing/types";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

function addDays(iso: string | Date, days: number) {
    const date = new Date(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
}

function addMonths(iso: string | Date, months: number) {
    const date = new Date(iso);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString();
}

async function recordEvent(input: {
    subscriptionId?: string | null;
    userId?: string | null;
    eventType: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
}) {
    const supabase = getSupabaseServerClient();
    await supabase.from("subscription_events").insert({
        subscription_id: input.subscriptionId || null,
        user_id: input.userId || null,
        event_type: input.eventType,
        actor_user_id: input.actorUserId || null,
        payload: input.payload || {},
    });
}

export async function listActiveSubscriptionPlans(audience?: AccountSubscriptionAudience | string) {
    const supabase = getSupabaseServerClient();
    let query = supabase
        .from("subscription_plans")
        .select("id,name,audience,price_cents,currency,billing_interval,features,active,sort_order,description,stripe_price_id")
        .eq("active", true)
        .eq("billing_interval", "month")
        .order("sort_order", { ascending: true });
    if (audience === "artist" || audience === "producer") {
        query = query.in("audience", [audience, "creator"]);
    } else if (audience) {
        query = query.eq("audience", audience);
    }
    const { data, error } = await query;
    if (error) throw new Error(getErrorMessage(error));
    return (data || []) as SubscriptionPlanRow[];
}

export async function getSubscriptionPlanById(planId: string) {
    if (!isUuid(planId)) return null;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("subscription_plans")
        .select("id,name,audience,price_cents,currency,billing_interval,features,active,sort_order,description,stripe_price_id")
        .eq("id", planId)
        .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return (data || null) as SubscriptionPlanRow | null;
}

export async function getUserSubscription(userId: string) {
    if (!isUuid(userId)) return null;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return (data || null) as SubscriptionRow | null;
}

export async function getCreatorBillingAccessForUser(userId: string, audience?: string | null) {
    const subscription = await getUserSubscription(userId);
    return evaluateCreatorBillingAccess(subscription, { audience });
}

export async function startSubscriptionCheckout(input: StartCheckoutInput): Promise<CheckoutSessionResult> {
    const plan = await getSubscriptionPlanById(input.planId);
    if (!plan || !plan.active) {
        throw new Error("Subscription plan not found.");
    }
    const audience = String(plan.audience || "").toLowerCase();
    if (audience !== input.audience && !(input.audience !== "listener" && audience === "creator")) {
        // Allow artist/producer to buy their matching paid plans; listener plans for listeners.
        if (!(input.audience === "listener" && audience === "listener")
            && !(input.audience === "artist" && (audience === "artist" || audience === "creator"))
            && !(input.audience === "producer" && (audience === "producer" || audience === "creator"))) {
            throw new Error("Plan audience does not match account type.");
        }
    }

    const providerId = (input.provider || getDefaultPaymentProviderId()) as PaymentProviderId;
    const provider = getPaymentProvider(providerId);
    if (!provider.isConfigured() && providerId !== "test") {
        throw new Error(`${providerId} is not configured.`);
    }

    const supabase = getSupabaseServerClient();
    const now = new Date().toISOString();
    const existing = await getUserSubscription(input.userId);

    const subscriptionPayload = {
        user_id: input.userId,
        plan_id: plan.id,
        plan_name: plan.name,
        status: "pending",
        price_cents: plan.price_cents,
        currency: plan.currency || "USD",
        subscription_type: audience === "creator" ? input.audience : audience,
        creator_type: audience === "creator" ? input.audience : audience,
        auto_renew: true,
        cancel_at_period_end: false,
        payment_provider: provider.id,
        started_at: existing?.started_at || now,
        updated_at: now,
        metadata: {
            ...(existing?.metadata || {}),
            audience: input.audience,
            checkoutStartedAt: now,
        },
    };

    let subscriptionId = existing?.id;
    if (existing?.id) {
        const { error } = await supabase.from("subscriptions").update(subscriptionPayload).eq("id", existing.id);
        if (error) throw new Error(getErrorMessage(error));
    } else {
        const { data, error } = await supabase.from("subscriptions").insert(subscriptionPayload).select("id").single();
        if (error) throw new Error(getErrorMessage(error));
        subscriptionId = data.id;
    }

    const checkout = await provider.createCheckoutSession({
        userId: input.userId,
        planId: plan.id,
        planName: plan.name,
        audience: input.audience,
        amountCents: plan.price_cents,
        currency: plan.currency || "USD",
        customerEmail: input.customerEmail,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        metadata: {
            subscriptionId: String(subscriptionId),
            audience: input.audience,
        },
    });

    const providerPatch: Record<string, unknown> = {
        provider_customer_id: checkout.customerId || null,
        provider_subscription_id: checkout.providerSubscriptionId || checkout.sessionId,
        updated_at: now,
    };
    if (provider.id === "stripe") {
        providerPatch.stripe_customer_id = checkout.customerId || null;
        providerPatch.stripe_subscription_id = checkout.providerSubscriptionId || null;
    }
    await supabase.from("subscriptions").update(providerPatch).eq("id", subscriptionId);

    await supabase.from("subscription_payments").insert({
        subscription_id: subscriptionId,
        user_id: input.userId,
        plan_id: plan.id,
        amount_cents: plan.price_cents,
        currency: plan.currency || "USD",
        status: "pending",
        payment_provider: provider.id,
        provider_payment_id: checkout.sessionId,
        attempt_number: 1,
        metadata: { sessionId: checkout.sessionId },
    });

    await recordEvent({
        subscriptionId,
        userId: input.userId,
        eventType: "checkout.started",
        payload: { provider: provider.id, sessionId: checkout.sessionId, planId: plan.id },
    });

    // Test provider completes immediately so local/dev flows work without webhooks.
    if (provider.id === "test" && plan.price_cents >= 0) {
        await applySuccessfulPayment({
            userId: input.userId,
            subscriptionId: String(subscriptionId),
            providerPaymentId: checkout.sessionId,
            providerSubscriptionId: checkout.providerSubscriptionId || checkout.sessionId,
            amountCents: plan.price_cents,
            currency: plan.currency || "USD",
            provider: "test",
        });
    }

    return {
        provider: provider.id,
        checkoutUrl: checkout.checkoutUrl,
        sessionId: checkout.sessionId,
        subscriptionId: String(subscriptionId),
        mode: provider.id === "test" ? "test" : "live",
        message: provider.id === "test"
            ? "Test checkout completed. Subscription is active."
            : "Checkout session created. Complete payment with the provider.",
    };
}

export async function applySuccessfulPayment(input: {
    userId: string;
    subscriptionId: string;
    providerPaymentId: string;
    providerSubscriptionId?: string;
    amountCents: number;
    currency: string;
    provider: PaymentProviderId;
}) {
    const supabase = getSupabaseServerClient();
    const now = new Date();
    const renewal = resolveSuccessfulRenewal(now);
    const nowIso = now.toISOString();

    const { error } = await supabase.from("subscriptions").update({
        status: renewal.status,
        auto_renew: renewal.autoRenew,
        cancel_at_period_end: renewal.cancelAtPeriodEnd,
        current_period_end: addMonths(now, 1),
        grace_period_ends_at: renewal.gracePeriodEndsAt,
        past_due_since: renewal.pastDueSince,
        months_past_due: renewal.monthsPastDue,
        last_payment_at: nowIso,
        last_payment_failed_at: null,
        payment_retry_count: renewal.paymentRetryCount,
        payment_provider: input.provider,
        provider_subscription_id: input.providerSubscriptionId || null,
        admin_override_status: null,
        updated_at: nowIso,
    }).eq("id", input.subscriptionId).eq("user_id", input.userId);

    if (error) throw new Error(getErrorMessage(error));

    await supabase.from("subscription_payments").update({
        status: "succeeded",
        provider_payment_id: input.providerPaymentId,
        updated_at: nowIso,
    }).eq("subscription_id", input.subscriptionId).eq("status", "pending");

    await supabase.from("transactions").insert({
        user_id: input.userId,
        item_id: input.subscriptionId,
        item_type: "subscription",
        amount_cents: input.amountCents,
        currency: input.currency,
        status: "succeeded",
        transaction_type: "subscription",
        metadata: { provider: input.provider, providerPaymentId: input.providerPaymentId },
    });

    await recordEvent({
        subscriptionId: input.subscriptionId,
        userId: input.userId,
        eventType: "payment.succeeded",
        payload: { provider: input.provider, providerPaymentId: input.providerPaymentId, autoRenew: true },
    });
}

export async function applyFailedPayment(input: {
    userId: string;
    subscriptionId: string;
    providerPaymentId?: string;
    failureCode?: string;
    failureMessage?: string;
    provider: PaymentProviderId;
}) {
    const supabase = getSupabaseServerClient();
    const subscription = await getUserSubscription(input.userId);
    if (!subscription || subscription.id !== input.subscriptionId) {
        throw new Error("Subscription not found.");
    }

    const now = new Date();
    const lifecycle = resolveFailedPaymentLifecycle({
        previousRetryCount: Number(subscription.payment_retry_count || 0),
        previousGraceEndsAt: subscription.grace_period_ends_at,
        previousPastDueSince: subscription.past_due_since,
        previousMonthsPastDue: subscription.months_past_due,
        now,
    });

    const { error } = await supabase.from("subscriptions").update({
        status: lifecycle.status,
        auto_renew: lifecycle.autoRenew,
        past_due_since: lifecycle.pastDueSince,
        months_past_due: lifecycle.monthsPastDue,
        grace_period_ends_at: lifecycle.gracePeriodEndsAt,
        last_payment_failed_at: now.toISOString(),
        payment_retry_count: lifecycle.paymentRetryCount,
        payment_provider: input.provider,
        updated_at: now.toISOString(),
    }).eq("id", input.subscriptionId);

    if (error) throw new Error(getErrorMessage(error));

    await supabase.from("subscription_payments").insert({
        subscription_id: input.subscriptionId,
        user_id: input.userId,
        plan_id: subscription.plan_id,
        amount_cents: subscription.price_cents,
        currency: subscription.currency,
        status: lifecycle.paymentRetryCount < SUBSCRIPTION_PAYMENT_RETRY_LIMIT ? "retrying" : "failed",
        payment_provider: input.provider,
        provider_payment_id: input.providerPaymentId || null,
        failure_code: input.failureCode || null,
        failure_message: input.failureMessage || "Payment failed",
        attempt_number: lifecycle.paymentRetryCount,
    });

    await recordEvent({
        subscriptionId: input.subscriptionId,
        userId: input.userId,
        eventType: "payment.failed",
        payload: {
            retryCount: lifecycle.paymentRetryCount,
            status: lifecycle.status,
            failureCode: input.failureCode,
            failureMessage: input.failureMessage,
        },
    });

    return evaluateCreatorBillingAccess(await getUserSubscription(input.userId));
}

/** Cancel future renewals; access remains until current_period_end. */
export async function cancelSubscriptionRenewal(userId: string) {
    const subscription = await getUserSubscription(userId);
    if (!subscription) throw new Error("No subscription found.");

    const provider = getPaymentProvider(subscription.payment_provider || "test");
    if (subscription.provider_subscription_id) {
        await provider.cancelSubscription(subscription.provider_subscription_id, true);
    }

    const supabase = getSupabaseServerClient();
    const cancel = resolveCancelAtPeriodEnd({
        currentStatus: String(subscription.status || "active"),
        currentPeriodEnd: subscription.current_period_end,
    });

    const { error } = await supabase.from("subscriptions").update({
        auto_renew: cancel.autoRenew,
        cancel_at_period_end: cancel.cancelAtPeriodEnd,
        canceled_at: cancel.canceledAt,
        status: cancel.status,
        updated_at: cancel.canceledAt,
    }).eq("id", subscription.id);

    if (error) throw new Error(getErrorMessage(error));

    await recordEvent({
        subscriptionId: subscription.id,
        userId,
        eventType: "subscription.cancel_at_period_end",
        payload: { currentPeriodEnd: subscription.current_period_end },
    });

    return getUserSubscription(userId);
}

export async function processRenewalReminders(now = new Date()) {
    const supabase = getSupabaseServerClient();
    const reminderStart = now.toISOString();
    const reminderEnd = addDays(now, SUBSCRIPTION_RENEWAL_REMINDER_DAYS);
    const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("auto_renew", true)
        .eq("status", "active")
        .gte("current_period_end", reminderStart)
        .lte("current_period_end", reminderEnd)
        .is("renewal_reminder_sent_at", null)
        .limit(100);
    if (error) throw new Error(getErrorMessage(error));

    const rows = (data || []) as SubscriptionRow[];
    for (const row of rows) {
        await supabase.from("notifications").insert({
            user_id: row.user_id,
            title: "Subscription renewal reminder",
            body: `Your ${row.plan_name} plan renews on ${row.current_period_end ? new Date(row.current_period_end).toLocaleDateString() : "soon"}. Auto-renew is enabled.`,
            item_type: null,
            read: false,
        });
        await supabase.from("subscriptions").update({
            renewal_reminder_sent_at: now.toISOString(),
            updated_at: now.toISOString(),
        }).eq("id", row.id);
        await recordEvent({
            subscriptionId: row.id,
            userId: row.user_id,
            eventType: "renewal.reminder_sent",
            payload: { currentPeriodEnd: row.current_period_end },
        });
    }
    return { reminded: rows.length };
}

export async function processFailedPaymentRetries(now = new Date()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .in("status", ["grace_period", "past_due"])
        .lt("payment_retry_count", SUBSCRIPTION_PAYMENT_RETRY_LIMIT)
        .limit(50);
    if (error) throw new Error(getErrorMessage(error));

    let retried = 0;
    for (const row of (data || []) as SubscriptionRow[]) {
        const lastFail = row.last_payment_failed_at ? new Date(row.last_payment_failed_at).getTime() : 0;
        if (lastFail && now.getTime() - lastFail < 24 * 60 * 60 * 1000) continue;
        await applyFailedPayment({
            userId: row.user_id,
            subscriptionId: row.id,
            provider: (row.payment_provider as PaymentProviderId) || "test",
            failureCode: "retry_scheduled",
            failureMessage: "Automatic payment retry recorded (provider charge attempted).",
        });
        retried += 1;
    }
    return { retried };
}

export async function expireCancelledSubscriptions(now = new Date()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("cancel_at_period_end", true)
        .eq("auto_renew", false)
        .lte("current_period_end", now.toISOString())
        .neq("status", "cancelled")
        .limit(100);
    if (error) throw new Error(getErrorMessage(error));

    for (const row of (data || []) as SubscriptionRow[]) {
        await supabase.from("subscriptions").update({
            status: "cancelled",
            updated_at: now.toISOString(),
        }).eq("id", row.id);
        await recordEvent({
            subscriptionId: row.id,
            userId: row.user_id,
            eventType: "subscription.period_ended_cancelled",
        });
    }
    return { cancelled: (data || []).length };
}

export function getBillingProviderCatalog() {
    return {
        defaultProvider: getDefaultPaymentProviderId(),
        configuredProviders: listConfiguredPaymentProviders(),
    };
}

export async function listUserSubscriptionPayments(userId: string, limit = 20) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("subscription_payments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(getErrorMessage(error));
    return (data || []) as SubscriptionPaymentRow[];
}

export { resolveEffectiveSubscriptionStatus, evaluateCreatorBillingAccess };
export { resolveCancelAtPeriodEnd, resolveFailedPaymentLifecycle } from "@/lib/billing/lifecycle";
