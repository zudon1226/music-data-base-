/**
 * Stripe Checkout for paid ringtone purchases (Phase B).
 * Webhook confirmation completes purchase — not client PATCH.
 */

import { createStripeOneTimeCheckoutSession } from "@/lib/billing/providers/stripe-provider";
import { isStripeLiveConfigured } from "@/lib/billing/providers/stripe-rest";
import {
    canBuyerStartPaidRingtonePurchase,
    createRingtonePurchaseIntent,
    getPaidRingtonePurchaseUnavailableMessage,
} from "@/lib/ringtone-purchase";
import { getErrorMessage, getPublicSiteUrl, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export type StartRingtoneStripeCheckoutInput = {
    buyerId: string;
    ringtoneId: string;
    idempotencyKey?: string;
    successUrl?: string;
    cancelUrl?: string;
    customerEmail?: string;
};

export async function startRingtoneStripeCheckout(input: StartRingtoneStripeCheckoutInput) {
    if (!isUuid(input.buyerId) || !isUuid(input.ringtoneId)) {
        return { ok: false as const, status: 400, error: "Invalid buyer or ringtone id." };
    }
    if (!isStripeLiveConfigured()) {
        return { ok: false as const, status: 503, error: "Stripe checkout is not configured.", code: "STRIPE_NOT_CONFIGURED" };
    }
    if (!(await canBuyerStartPaidRingtonePurchase(input.buyerId))) {
        return {
            ok: false as const,
            status: 503,
            error: getPaidRingtonePurchaseUnavailableMessage(),
            code: "PURCHASING_UNAVAILABLE",
        };
    }

    const intent = await createRingtonePurchaseIntent({
        buyerId: input.buyerId,
        ringtoneId: input.ringtoneId,
        idempotencyKey: input.idempotencyKey,
    });
    if (!intent.ok) return intent;
    if (intent.alreadyOwned || ("freeAcquisition" in intent && intent.freeAcquisition)) {
        return {
            ok: true as const,
            state: intent.alreadyOwned ? "already_owned" as const : "free_acquisition_completed" as const,
            purchase: intent.purchase,
            ringtone: intent.ringtone,
        };
    }

    const purchase = intent.purchase;
    const amountCents = Math.max(0, Number(purchase.amount_cents || 0));
    if (amountCents <= 0) {
        return { ok: true as const, state: "free_acquisition_completed" as const, purchase, ringtone: intent.ringtone };
    }

    const base = getPublicSiteUrl().replace(/\/+$/, "");
    const successUrl = String(input.successUrl || "").trim() || `${base}/?ringtoneCheckout=success`;
    const cancelUrl = String(input.cancelUrl || "").trim() || `${base}/?ringtoneCheckout=cancel`;

    let session;
    try {
        session = await createStripeOneTimeCheckoutSession({
            userId: input.buyerId,
            successUrl,
            cancelUrl,
            customerEmail: input.customerEmail,
            clientReferenceId: String(purchase.id),
            lines: [{
                name: String(intent.ringtone.title || "Ringtone"),
                amountCents,
                currency: String(purchase.currency || "USD"),
            }],
            metadata: {
                flow: "ringtone_purchase_checkout",
                userId: input.buyerId,
                purchaseId: String(purchase.id),
                ringtoneId: input.ringtoneId,
            },
        });
    } catch (error) {
        return { ok: false as const, status: 502, error: getErrorMessage(error), code: "STRIPE_CHECKOUT_FAILED" };
    }

    if (!session.checkoutUrl || !session.sessionId) {
        return { ok: false as const, status: 502, error: "Stripe did not return a checkout URL.", code: "STRIPE_CHECKOUT_FAILED" };
    }

    const supabase = getSupabaseServerClient();
    await supabase.from("ringtone_purchases").update({
        payment_provider: "stripe",
        provider_checkout_session_id: session.sessionId,
        provider_payment_intent_id: session.paymentIntentId || null,
    }).eq("id", purchase.id).eq("buyer_id", input.buyerId);

    return {
        ok: true as const,
        state: "checkout_ready" as const,
        checkoutUrl: session.checkoutUrl,
        sessionId: session.sessionId,
        purchase,
        ringtone: intent.ringtone,
    };
}
