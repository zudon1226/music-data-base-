import type { SubscriptionStatus } from "@/lib/billing/constants";
import { evaluateCreatorBillingAccess, normalizeSubscriptionStatus } from "@/lib/billing/creator-access";
import { getPaymentProvider } from "@/lib/billing/payment-provider";
import { applySuccessfulPayment } from "@/lib/billing/subscription-service";
import type { SubscriptionPaymentRow, SubscriptionRow } from "@/lib/billing/types";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export type AdminSubscriptionView = SubscriptionRow & {
    billingStatus: string;
    overdueBalanceCents: number;
    renewalDate: string | null;
    withdrawalsLocked: boolean;
    withdrawalLockStatus: "unlocked" | "locked";
    withdrawalLockCode: string | null;
    withdrawalLockMessage: string | null;
    autoRenew: boolean;
    cancelAtPeriodEnd: boolean;
};

export function toAdminSubscriptionView(row: SubscriptionRow): AdminSubscriptionView {
    const access = evaluateCreatorBillingAccess(row);
    return {
        ...row,
        billingStatus: access.billingStatus,
        overdueBalanceCents: access.overdueBalanceCents,
        renewalDate: access.renewalDate,
        withdrawalsLocked: access.withdrawalsLocked,
        withdrawalLockStatus: access.withdrawalsLocked ? "locked" : "unlocked",
        withdrawalLockCode: access.withdrawalLockCode,
        withdrawalLockMessage: access.withdrawalLockMessage,
        autoRenew: access.autoRenew,
        cancelAtPeriodEnd: access.cancelAtPeriodEnd,
    };
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

export async function listAdminSubscriptions(filters?: {
    status?: string;
    suspendedOnly?: boolean;
    limit?: number;
}) {
    const supabase = getSupabaseServerClient();
    let query = supabase
        .from("subscriptions")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(Math.min(200, Math.max(1, filters?.limit || 100)));

    if (filters?.suspendedOnly) {
        query = query.eq("status", "suspended");
    } else if (filters?.status) {
        query = query.eq("status", filters.status);
    }

    const { data, error } = await query;
    if (error) throw new Error(getErrorMessage(error));
    return (data || []) as SubscriptionRow[];
}

export async function listFailedSubscriptionPayments(limit = 100) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("subscription_payments")
        .select("*")
        .in("status", ["failed", "retrying"])
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(getErrorMessage(error));
    return (data || []) as SubscriptionPaymentRow[];
}

export async function adminOverrideSubscriptionStatus(input: {
    subscriptionId: string;
    status: SubscriptionStatus;
    note?: string;
    actorUserId: string;
}) {
    if (!isUuid(input.subscriptionId)) throw new Error("Invalid subscription id.");
    const status = normalizeSubscriptionStatus(input.status);
    if (status === "none") throw new Error("Invalid status override.");

    const supabase = getSupabaseServerClient();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
        status,
        admin_override_status: status,
        admin_override_note: input.note || null,
        admin_override_by: input.actorUserId,
        admin_override_at: now,
        updated_at: now,
    };
    if (status === "active") {
        patch.months_past_due = 0;
        patch.past_due_since = null;
        patch.grace_period_ends_at = null;
        patch.payment_retry_count = 0;
        patch.auto_renew = true;
        patch.cancel_at_period_end = false;
    }

    const { data, error } = await supabase
        .from("subscriptions")
        .update(patch)
        .eq("id", input.subscriptionId)
        .select("*")
        .single();
    if (error) throw new Error(getErrorMessage(error));

    await recordEvent({
        subscriptionId: input.subscriptionId,
        userId: data.user_id,
        actorUserId: input.actorUserId,
        eventType: "admin.status_override",
        payload: { status, note: input.note || "" },
    });

    return data as SubscriptionRow;
}

export async function adminReactivateSubscription(input: {
    subscriptionId: string;
    actorUserId: string;
    note?: string;
}) {
    const supabase = getSupabaseServerClient();
    const { data: sub, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("id", input.subscriptionId)
        .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    if (!sub) throw new Error("Subscription not found.");

    await applySuccessfulPayment({
        userId: sub.user_id,
        subscriptionId: sub.id,
        providerPaymentId: `admin_reactivate_${Date.now()}`,
        providerSubscriptionId: sub.provider_subscription_id || undefined,
        amountCents: sub.price_cents || 0,
        currency: sub.currency || "USD",
        provider: (sub.payment_provider as "stripe" | "paypal" | "test") || "test",
        planId: sub.plan_id || undefined,
    });

    return adminOverrideSubscriptionStatus({
        subscriptionId: input.subscriptionId,
        status: "active",
        note: input.note || "Admin reactivated subscription.",
        actorUserId: input.actorUserId,
    });
}

export async function adminRefundSubscriptionPayment(input: {
    paymentId: string;
    actorUserId: string;
    amountCents?: number;
    reason?: string;
}) {
    if (!isUuid(input.paymentId)) throw new Error("Invalid payment id.");
    const supabase = getSupabaseServerClient();
    const { data: payment, error } = await supabase
        .from("subscription_payments")
        .select("*")
        .eq("id", input.paymentId)
        .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    if (!payment) throw new Error("Payment not found.");
    if (payment.status === "refunded") throw new Error("Payment already refunded.");

    const provider = getPaymentProvider(payment.payment_provider);
    let refundId = `manual_${input.paymentId}`;
    if (payment.provider_payment_id && provider.isConfigured() && provider.id !== "test") {
        const refund = await provider.refundPayment({
            providerPaymentId: payment.provider_payment_id,
            amountCents: input.amountCents,
            reason: input.reason,
        });
        refundId = refund.refundId;
    } else {
        const refund = await provider.refundPayment({
            providerPaymentId: payment.provider_payment_id || payment.id,
            amountCents: input.amountCents,
            reason: input.reason,
        });
        refundId = refund.refundId;
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
        .from("subscription_payments")
        .update({
            status: "refunded",
            refunded_at: now,
            refund_amount_cents: input.amountCents ?? payment.amount_cents,
            updated_at: now,
            metadata: {
                ...(payment.metadata || {}),
                refundId,
                refundedBy: input.actorUserId,
                reason: input.reason || "",
            },
        })
        .eq("id", input.paymentId)
        .select("*")
        .single();
    if (updateError) throw new Error(getErrorMessage(updateError));

    await supabase.from("transactions").insert({
        user_id: payment.user_id,
        item_id: payment.subscription_id || payment.id,
        item_type: "subscription",
        amount_cents: input.amountCents ?? payment.amount_cents,
        currency: payment.currency,
        status: "refunded",
        transaction_type: "subscription_refund",
        metadata: { refundId, paymentId: payment.id },
    });

    await recordEvent({
        subscriptionId: payment.subscription_id,
        userId: payment.user_id,
        actorUserId: input.actorUserId,
        eventType: "admin.payment_refunded",
        payload: { paymentId: payment.id, refundId, reason: input.reason || "" },
    });

    return updated as SubscriptionPaymentRow;
}

export async function buildAdminBillingSnapshot() {
    const [subscribers, failedPayments, suspended] = await Promise.all([
        listAdminSubscriptions({ limit: 100 }),
        listFailedSubscriptionPayments(50),
        listAdminSubscriptions({ suspendedOnly: true, limit: 100 }),
    ]);

    const enriched = subscribers.map(toAdminSubscriptionView);
    const byStatus: Record<string, number> = {};
    const byBillingStatus: Record<string, number> = {};
    let withdrawalLockedCount = 0;
    let overdueBalanceTotalCents = 0;

    for (const row of enriched) {
        const key = String(row.status || "unknown");
        byStatus[key] = (byStatus[key] || 0) + 1;
        byBillingStatus[row.billingStatus] = (byBillingStatus[row.billingStatus] || 0) + 1;
        if (row.withdrawalsLocked) withdrawalLockedCount += 1;
        overdueBalanceTotalCents += row.overdueBalanceCents;
    }

    return {
        subscriberCount: subscribers.length,
        failedPaymentCount: failedPayments.length,
        suspendedCount: suspended.length,
        withdrawalLockedCount,
        overdueBalanceTotalCents,
        statusCounts: byStatus,
        billingStatusCounts: byBillingStatus,
        subscribers: enriched,
        failedPayments,
        suspendedAccounts: suspended.map(toAdminSubscriptionView),
    };
}
