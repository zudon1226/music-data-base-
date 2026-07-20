import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "@/lib/billing/payment-provider";

function verifyStripeSignature(rawBody: string, signatureHeader: string | null) {
    const secret = stripeWebhookSecret();
    if (!secret) {
        throw new Error("Stripe webhook secret is not configured.");
    }
    if (!signatureHeader) {
        throw new Error("Missing Stripe-Signature header.");
    }
    const parts = Object.fromEntries(
        signatureHeader.split(",").map((part) => {
            const [key, ...rest] = part.trim().split("=");
            return [key, rest.join("=")];
        }),
    ) as Record<string, string>;
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) {
        throw new Error("Invalid Stripe-Signature header.");
    }
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) {
        throw new Error("Stripe webhook timestamp outside tolerance.");
    }
    const expected = createHmac("sha256", secret)
        .update(`${timestamp}.${rawBody}`, "utf8")
        .digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(signature, "utf8");
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
        throw new Error("Stripe webhook signature verification failed.");
    }
}

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
            if (isLiveConfigured()) {
                verifyStripeSignature(rawBody, signatureHeader);
            } else if (!signatureHeader) {
                throw new Error("Missing Stripe-Signature header.");
            }
            const payload = JSON.parse(rawBody || "{}") as {
                type?: string;
                data?: { object?: Record<string, unknown> };
            };
            const object = payload.data?.object || {};
            const metadata = (object.metadata || {}) as Record<string, string>;
            const type = String(payload.type || "");
            let status: "succeeded" | "failed" | "refunded" | "cancelled" | undefined;
            if (
                type.includes("checkout.session.completed")
                || type.includes("invoice.paid")
                || type.includes("invoice.payment_succeeded")
            ) {
                status = "succeeded";
            } else if (type.includes("invoice.payment_failed") || type.includes("payment_failed")) {
                status = "failed";
            } else if (type.includes("charge.refunded") || type.includes("refund")) {
                status = "refunded";
            } else if (type.includes("customer.subscription.deleted") || type.includes("canceled") || type.includes("cancelled")) {
                status = "cancelled";
            } else {
                return {
                    eventType: type || "stripe.event",
                    status: undefined,
                    raw: payload,
                };
            }
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
