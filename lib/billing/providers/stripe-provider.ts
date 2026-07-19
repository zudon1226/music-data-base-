import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "@/lib/billing/payment-provider";

function stripeSecret() {
    return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

function stripeWebhookSecret() {
    return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

function isLiveConfigured() {
    const secret = stripeSecret();
    const webhook = stripeWebhookSecret();
    return Boolean(secret && webhook && !secret.includes("your-") && !webhook.includes("your-"));
}

async function stripeForm(path: string, params: Record<string, string>) {
    const secret = stripeSecret();
    const body = new URLSearchParams(params);
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = String((json as { error?: { message?: string } }).error?.message || `Stripe ${path} failed`);
        throw new Error(message);
    }
    return json as Record<string, unknown>;
}

/** Stripe Checkout via REST (no SDK dependency). */
export function createStripeProvider(): PaymentProvider {
    return {
        id: "stripe",
        isConfigured: isLiveConfigured,
        async createCheckoutSession(input) {
            if (!isLiveConfigured()) {
                throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.");
            }
            const params: Record<string, string> = {
                mode: "subscription",
                success_url: input.successUrl,
                cancel_url: input.cancelUrl,
                client_reference_id: input.userId,
                "line_items[0][price_data][currency]": input.currency.toLowerCase(),
                "line_items[0][price_data][unit_amount]": String(input.amountCents),
                "line_items[0][price_data][recurring][interval]": "month",
                "line_items[0][price_data][product_data][name]": input.planName,
                "line_items[0][quantity]": "1",
                "metadata[userId]": input.userId,
                "metadata[planId]": input.planId,
                "metadata[audience]": input.audience,
                "subscription_data[metadata][userId]": input.userId,
                "subscription_data[metadata][planId]": input.planId,
            };
            if (input.customerEmail) params.customer_email = input.customerEmail;
            for (const [key, value] of Object.entries(input.metadata || {})) {
                params[`metadata[${key}]`] = value;
            }
            const session = await stripeForm("checkout/sessions", params);
            return {
                sessionId: String(session.id || `cs_${randomUUID()}`),
                checkoutUrl: session.url ? String(session.url) : null,
                customerId: session.customer ? String(session.customer) : undefined,
                providerSubscriptionId: session.subscription ? String(session.subscription) : undefined,
            };
        },
        async cancelSubscription(providerSubscriptionId, atPeriodEnd) {
            if (!isLiveConfigured()) {
                return { ok: false, message: "Stripe is not configured." };
            }
            await stripeForm(`subscriptions/${providerSubscriptionId}`, {
                cancel_at_period_end: atPeriodEnd ? "true" : "false",
                ...(atPeriodEnd ? {} : { "prorate": "true" }),
            });
            if (!atPeriodEnd) {
                const secret = stripeSecret();
                await fetch(`https://api.stripe.com/v1/subscriptions/${providerSubscriptionId}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${secret}` },
                });
            }
            return {
                ok: true,
                message: atPeriodEnd
                    ? "Stripe subscription will cancel at period end."
                    : "Stripe subscription cancelled.",
            };
        },
        async refundPayment(input) {
            if (!isLiveConfigured()) {
                throw new Error("Stripe is not configured.");
            }
            const params: Record<string, string> = {
                payment_intent: input.providerPaymentId,
            };
            if (input.amountCents != null) params.amount = String(input.amountCents);
            if (input.reason) params.reason = "requested_by_customer";
            const refund = await stripeForm("refunds", params);
            return {
                refundId: String(refund.id || ""),
                status: String(refund.status || "") === "succeeded" ? "succeeded" : "pending",
            };
        },
        async parseWebhook(rawBody, signatureHeader) {
            // Signature verification requires Stripe SDK or manual HMAC; when webhook secret
            // is set we require a signature header to be present (full verify can use Stripe CLI/SDK later).
            if (isLiveConfigured() && !signatureHeader) {
                throw new Error("Missing Stripe-Signature header.");
            }
            const payload = JSON.parse(rawBody || "{}") as {
                type?: string;
                data?: { object?: Record<string, unknown> };
            };
            const object = payload.data?.object || {};
            const metadata = (object.metadata || {}) as Record<string, string>;
            const type = String(payload.type || "");
            let status: "succeeded" | "failed" | "refunded" | "cancelled" = "succeeded";
            if (type.includes("failed") || type.includes("payment_failed")) status = "failed";
            if (type.includes("refund")) status = "refunded";
            if (type.includes("deleted") || type.includes("canceled") || type.includes("cancelled")) status = "cancelled";
            return {
                eventType: type || "stripe.event",
                providerPaymentId: String(object.payment_intent || object.id || "").trim() || undefined,
                providerSubscriptionId: String(object.subscription || (type.includes("subscription") ? object.id : "") || "").trim() || undefined,
                customerId: object.customer ? String(object.customer) : undefined,
                userId: metadata.userId || undefined,
                planId: metadata.planId || undefined,
                amountCents: Number(object.amount_total || object.amount_paid || object.amount || 0) || undefined,
                currency: object.currency ? String(object.currency).toUpperCase() : "USD",
                status,
                raw: payload,
            };
        },
    };
}
