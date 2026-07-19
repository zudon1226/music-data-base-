/**
 * Payment provider abstraction.
 * Stripe and PayPal adapters implement this interface so new providers can be added later.
 */

import type { PaymentProviderId } from "@/lib/billing/constants";
import { createPayPalProvider } from "@/lib/billing/providers/paypal-provider";
import { createStripeProvider } from "@/lib/billing/providers/stripe-provider";
import { createTestPaymentProvider } from "@/lib/billing/providers/test-provider";

export type CreateCheckoutSessionInput = {
    userId: string;
    planId: string;
    planName: string;
    audience: string;
    amountCents: number;
    currency: string;
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
};

export type CreateCheckoutSessionResult = {
    sessionId: string;
    checkoutUrl: string | null;
    customerId?: string;
    providerSubscriptionId?: string;
};

export type RefundPaymentInput = {
    providerPaymentId: string;
    amountCents?: number;
    reason?: string;
};

export type RefundPaymentResult = {
    refundId: string;
    status: "succeeded" | "pending" | "failed";
};

export type WebhookParseResult = {
    eventType: string;
    providerPaymentId?: string;
    providerSubscriptionId?: string;
    customerId?: string;
    userId?: string;
    planId?: string;
    amountCents?: number;
    currency?: string;
    status?: "succeeded" | "failed" | "refunded" | "cancelled";
    raw: unknown;
};

export type PaymentProvider = {
    id: PaymentProviderId;
    isConfigured(): boolean;
    createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult>;
    cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean): Promise<{ ok: boolean; message: string }>;
    refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
    parseWebhook(rawBody: string, signatureHeader: string | null): Promise<WebhookParseResult>;
};

export function getDefaultPaymentProviderId(): PaymentProviderId {
    const preferred = String(process.env.BILLING_PAYMENT_PROVIDER || "").trim().toLowerCase();
    if (preferred === "stripe" || preferred === "paypal" || preferred === "test") {
        return preferred;
    }
    if (createStripeProvider().isConfigured()) return "stripe";
    if (createPayPalProvider().isConfigured()) return "paypal";
    return "test";
}

export function getPaymentProvider(providerId?: PaymentProviderId | string | null): PaymentProvider {
    const id = String(providerId || getDefaultPaymentProviderId()).trim().toLowerCase() as PaymentProviderId;
    if (id === "stripe") return createStripeProvider();
    if (id === "paypal") return createPayPalProvider();
    return createTestPaymentProvider();
}

export function listConfiguredPaymentProviders(): PaymentProviderId[] {
    const ids: PaymentProviderId[] = [];
    if (createStripeProvider().isConfigured()) ids.push("stripe");
    if (createPayPalProvider().isConfigured()) ids.push("paypal");
    ids.push("test");
    return ids;
}
