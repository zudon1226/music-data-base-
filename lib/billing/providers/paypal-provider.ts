import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "@/lib/billing/payment-provider";

function paypalClientId() {
    return String(process.env.PAYPAL_CLIENT_ID || "").trim();
}

function paypalClientSecret() {
    return String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
}

function paypalBaseUrl() {
    const mode = String(process.env.PAYPAL_MODE || "sandbox").trim().toLowerCase();
    return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function isLiveConfigured() {
    const id = paypalClientId();
    const secret = paypalClientSecret();
    return Boolean(id && secret && !id.includes("your-") && !secret.includes("your-"));
}

async function paypalAccessToken() {
    const auth = Buffer.from(`${paypalClientId()}:${paypalClientSecret()}`).toString("base64");
    const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(String((json as { error_description?: string }).error_description || "PayPal auth failed"));
    }
    return String((json as { access_token?: string }).access_token || "");
}

/** PayPal Subscriptions REST adapter. */
export function createPayPalProvider(): PaymentProvider {
    return {
        id: "paypal",
        isConfigured: isLiveConfigured,
        async createCheckoutSession(input) {
            if (!isLiveConfigured()) {
                throw new Error("PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
            }
            const token = await paypalAccessToken();
            // Create a simple order redirect for monthly plan checkout; plan catalog can map to PayPal Plan IDs later.
            const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    intent: "CAPTURE",
                    purchase_units: [
                        {
                            amount: {
                                currency_code: input.currency.toUpperCase(),
                                value: (input.amountCents / 100).toFixed(2),
                            },
                            description: input.planName,
                            custom_id: `${input.userId}:${input.planId}`,
                        },
                    ],
                    application_context: {
                        return_url: input.successUrl,
                        cancel_url: input.cancelUrl,
                        user_action: "PAY_NOW",
                    },
                }),
            });
            const json = await response.json().catch(() => ({})) as {
                id?: string;
                links?: Array<{ rel?: string; href?: string }>;
            };
            if (!response.ok) {
                throw new Error("PayPal checkout session failed.");
            }
            const approve = (json.links || []).find((link) => link.rel === "approve");
            return {
                sessionId: String(json.id || `paypal_${randomUUID()}`),
                checkoutUrl: approve?.href || null,
                providerSubscriptionId: json.id,
            };
        },
        async cancelSubscription(providerSubscriptionId, _atPeriodEnd) {
            if (!isLiveConfigured()) {
                return { ok: false, message: "PayPal is not configured." };
            }
            const token = await paypalAccessToken();
            const response = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions/${providerSubscriptionId}/cancel`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ reason: "User cancelled future renewals" }),
            });
            if (!response.ok && response.status !== 404) {
                return { ok: false, message: "PayPal cancel failed." };
            }
            return { ok: true, message: "PayPal subscription cancelled." };
        },
        async refundPayment(input) {
            if (!isLiveConfigured()) {
                throw new Error("PayPal is not configured.");
            }
            const token = await paypalAccessToken();
            const body: Record<string, unknown> = {};
            if (input.amountCents != null) {
                body.amount = {
                    value: (input.amountCents / 100).toFixed(2),
                    currency_code: "USD",
                };
            }
            const response = await fetch(`${paypalBaseUrl()}/v2/payments/captures/${input.providerPaymentId}/refund`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            const json = await response.json().catch(() => ({})) as { id?: string; status?: string };
            if (!response.ok) {
                throw new Error("PayPal refund failed.");
            }
            return {
                refundId: String(json.id || ""),
                status: String(json.status || "").toUpperCase() === "COMPLETED" ? "succeeded" : "pending",
            };
        },
        async parseWebhook(rawBody, signatureHeader) {
            if (isLiveConfigured() && !signatureHeader) {
                throw new Error("Missing PayPal webhook signature header.");
            }
            const payload = JSON.parse(rawBody || "{}") as {
                event_type?: string;
                resource?: Record<string, unknown>;
            };
            const resource = payload.resource || {};
            const custom = String(resource.custom_id || "");
            const [userId, planId] = custom.includes(":") ? custom.split(":") : [undefined, undefined];
            const type = String(payload.event_type || "PAYPAL.EVENT");
            let status: "succeeded" | "failed" | "refunded" | "cancelled" = "succeeded";
            if (type.includes("DENIED") || type.includes("FAILED")) status = "failed";
            if (type.includes("REFUND")) status = "refunded";
            if (type.includes("CANCELLED") || type.includes("CANCELED")) status = "cancelled";
            return {
                eventType: type,
                providerPaymentId: resource.id ? String(resource.id) : undefined,
                providerSubscriptionId: resource.id ? String(resource.id) : undefined,
                userId,
                planId,
                amountCents: resource.amount && typeof resource.amount === "object"
                    ? Math.round(Number((resource.amount as { value?: string }).value || 0) * 100)
                    : undefined,
                currency: "USD",
                status,
                raw: payload,
            };
        },
    };
}
