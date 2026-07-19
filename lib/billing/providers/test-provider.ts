import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "@/lib/billing/payment-provider";

/** Local / CI checkout without Stripe or PayPal credentials. */
export function createTestPaymentProvider(): PaymentProvider {
    return {
        id: "test",
        isConfigured() {
            return true;
        },
        async createCheckoutSession(input) {
            const sessionId = `test_cs_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
            const customerId = `test_cus_${input.userId.replace(/-/g, "").slice(0, 16)}`;
            const providerSubscriptionId = `test_sub_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
            const url = new URL(input.successUrl);
            url.searchParams.set("billing_provider", "test");
            url.searchParams.set("billing_session", sessionId);
            url.searchParams.set("billing_status", "succeeded");
            return {
                sessionId,
                checkoutUrl: url.toString(),
                customerId,
                providerSubscriptionId,
            };
        },
        async cancelSubscription(_providerSubscriptionId, atPeriodEnd) {
            return {
                ok: true,
                message: atPeriodEnd
                    ? "Test subscription set to cancel at period end."
                    : "Test subscription cancelled immediately.",
            };
        },
        async refundPayment(input) {
            return {
                refundId: `test_re_${input.providerPaymentId || randomUUID().slice(0, 12)}`,
                status: "succeeded",
            };
        },
        async parseWebhook(rawBody) {
            const payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
            return {
                eventType: String(payload.eventType || payload.type || "test.payment.succeeded"),
                providerPaymentId: String(payload.providerPaymentId || payload.paymentId || "").trim() || undefined,
                providerSubscriptionId: String(payload.providerSubscriptionId || payload.subscriptionId || "").trim() || undefined,
                customerId: String(payload.customerId || "").trim() || undefined,
                userId: String(payload.userId || "").trim() || undefined,
                planId: String(payload.planId || "").trim() || undefined,
                amountCents: Number(payload.amountCents || 0) || undefined,
                currency: String(payload.currency || "USD"),
                status: (String(payload.status || "succeeded") as "succeeded" | "failed" | "refunded" | "cancelled"),
                raw: payload,
            };
        },
    };
}
