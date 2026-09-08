/**
 * Marketplace Stripe webhook: sales fulfillment + ringtone purchase confirmation.
 * Subscription billing remains on /api/subscriptions/webhooks/stripe.
 */

import { completePendingSalesFromStripeSession } from "@/lib/sales-payment-fulfillment";
import { recordRingtonePurchaseEarnings } from "@/lib/creator-earnings";
import { confirmRingtonePurchasePayment } from "@/lib/ringtone-purchase";
import {
    stripeMarketplaceWebhookSecret,
    verifyStripeWebhookSignature,
} from "@/lib/billing/providers/stripe-rest";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

function verifyMarketplaceStripeSignature(rawBody: string, signatureHeader: string | null) {
    const secret = stripeMarketplaceWebhookSecret();
    if (!secret) {
        throw new Error("Stripe marketplace webhook secret is not configured.");
    }
    verifyStripeWebhookSignature(rawBody, signatureHeader, secret);
}

async function recordWebhookIdempotency(provider: string, providerEventId: string, sessionId: string, payload: unknown) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("sales_payment_events").insert({
        provider,
        provider_event_id: providerEventId,
        provider_checkout_session_id: sessionId || null,
        payload: payload as Record<string, unknown>,
    });
    if (error && !/duplicate|unique/i.test(error.message || "")) {
        throw new Error(getErrorMessage(error));
    }
    return !error;
}

export async function processMarketplaceStripeWebhook(rawBody: string, signatureHeader: string | null) {
    verifyMarketplaceStripeSignature(rawBody, signatureHeader);

    const payload = JSON.parse(rawBody || "{}") as {
        id?: string;
        type?: string;
        data?: { object?: Record<string, unknown> };
    };
    const eventType = String(payload.type || "");
    const object = payload.data?.object || {};
    const metadata = (object.metadata || {}) as Record<string, string>;
    const mode = String(object.mode || "");
    const eventId = String(payload.id || "").trim();

    if (eventId) {
        const inserted = await recordWebhookIdempotency("stripe", eventId, String(object.id || ""), payload);
        if (!inserted) {
            return { ok: true as const, duplicate: true, eventType };
        }
    }

    if (eventType.startsWith("account.")) {
        const { applyConnectAccountWebhook } = await import("@/lib/stripe-connect");
        const result = await applyConnectAccountWebhook(object);
        return { eventType, ...result };
    }

    if (eventType === "capability.updated") {
        const { applyConnectCapabilityWebhook } = await import("@/lib/connect-payout-webhook");
        const result = await applyConnectCapabilityWebhook(object);
        return { eventType, ...result };
    }

    if (eventType.startsWith("transfer.")) {
        const { applyConnectTransferWebhook } = await import("@/lib/connect-payout-webhook");
        const result = await applyConnectTransferWebhook(eventType, object);
        return { eventType, ...result };
    }

    if (eventType.startsWith("payout.")) {
        const { applyConnectPayoutWebhook } = await import("@/lib/connect-payout-webhook");
        const result = await applyConnectPayoutWebhook(eventType, object);
        return { eventType, ...result };
    }

    if (eventType === "charge.refunded") {
        const { reverseCreatorEarningsForSource } = await import("@/lib/creator-earnings-reversal");
        const purchaseId = String(metadata.purchaseId || metadata.purchaseIds?.split(",")?.[0] || "").trim();
        if (purchaseId) {
            const reversed = await reverseCreatorEarningsForSource({
                sourceId: purchaseId,
                reason: "charge.refunded",
                providerEventId: eventId,
            });
            return { ok: true as const, eventType, reversed: reversed.reversed };
        }
        return { ok: true as const, ignored: true, eventType, reason: "No purchase metadata on refund." };
    }

    if (eventType !== "checkout.session.completed" || mode !== "payment") {
        return { ok: true as const, ignored: true, reason: "Unhandled platform event.", eventType };
    }

    const flow = String(metadata.flow || "").trim();
    const userId = String(metadata.userId || object.client_reference_id || "").trim();
    const paymentIntent = String(object.payment_intent || object.id || "").trim();
    const sessionId = String(object.id || "").trim();

    if (flow === "sales_pending_checkout") {
        const purchaseIds = String(metadata.purchaseIds || "")
            .split(",")
            .map((id) => id.trim())
            .filter((id) => isUuid(id));
        if (!isUuid(userId) || !purchaseIds.length) {
            return { ok: true as const, ignored: true, reason: "Missing sales metadata." };
        }
        const result = await completePendingSalesFromStripeSession({
            userId,
            purchaseIds,
            providerPaymentId: paymentIntent || sessionId,
            providerCheckoutSessionId: sessionId,
            providerPaymentIntentId: paymentIntent || undefined,
        });
        return { flow, ...result, eventType };
    }

    if (flow === "ringtone_purchase_checkout") {
        const purchaseId = String(metadata.purchaseId || "").trim();
        const ringtoneId = String(metadata.ringtoneId || "").trim();
        if (!isUuid(userId) || !isUuid(purchaseId)) {
            return { ok: true as const, ignored: true, reason: "Missing ringtone purchase metadata." };
        }
        const confirm = await confirmRingtonePurchasePayment({
            buyerId: userId,
            purchaseId,
            provider: "stripe",
            paymentReference: paymentIntent || sessionId,
            outcome: "paid",
        });
        if (!confirm.ok) {
            throw new Error(confirm.error);
        }
        const purchase = confirm.purchase;
        const supabase = getSupabaseServerClient();
        const { data: ringtone } = await supabase
            .from("ringtone_products")
            .select("id,title,creator_id")
            .eq("id", ringtoneId || purchase.ringtone_id)
            .maybeSingle();
        await recordRingtonePurchaseEarnings({
            purchaseId,
            ringtoneId: ringtoneId || String(purchase.ringtone_id),
            creatorId: String(ringtone?.creator_id || purchase.creator_id),
            creatorName: String(ringtone?.title || ""),
            amountCents: Number(purchase.amount_cents || 0),
            currency: String(purchase.currency || "USD"),
            buyerUserId: userId,
        }).catch((error) => {
            console.warn("[marketplace-webhook] ringtone earnings failed:", getErrorMessage(error));
        });
        return { ok: true as const, flow, eventType, purchaseId, alreadyOwned: Boolean(confirm.alreadyOwned) };
    }

    return { ok: true as const, ignored: true, reason: "Unknown marketplace flow.", flow };
}
