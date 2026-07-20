/**
 * Payment provider abstraction.
 * Stripe and PayPal adapters implement this interface so new providers can be added later.
 */

import type { PaymentProviderId } from "@/lib/billing/constants";
import { CHECKOUT_UNAVAILABLE_MESSAGE } from "@/lib/billing/constants";
import { isBillingTestProviderAllowed } from "@/lib/billing/env";
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
    if (preferred === "stripe" && createStripeProvider().isConfigured()) return "stripe";
    if (preferred === "paypal" && createPayPalProvider().isConfigured()) return "paypal";
    if (preferred === "test" && isBillingTestProviderAllowed()) return "test";
    if (createStripeProvider().isConfigured()) return "stripe";
    if (createPayPalProvider().isConfigured()) return "paypal";
    if (isBillingTestProviderAllowed()) return "test";
    // Production fail-closed: no silent test fallback.
    return "stripe";
}

export function getPaymentProvider(providerId?: PaymentProviderId | string | null): PaymentProvider {
    const id = String(providerId || getDefaultPaymentProviderId()).trim().toLowerCase() as PaymentProviderId;
    if (id === "stripe") return createStripeProvider();
    if (id === "paypal") return createPayPalProvider();
    if (id === "test" && isBillingTestProviderAllowed()) return createTestPaymentProvider();
    if (id === "test") {
        // Callers must treat unconfigured providers as checkout unavailable.
        return createStripeProvider();
    }
    return createStripeProvider();
}

export function listConfiguredPaymentProviders(): PaymentProviderId[] {
    const ids: PaymentProviderId[] = [];
    if (createStripeProvider().isConfigured()) ids.push("stripe");
    if (createPayPalProvider().isConfigured()) ids.push("paypal");
    if (isBillingTestProviderAllowed()) ids.push("test");
    return ids;
}

export function requireLiveCheckoutProvider(providerId?: PaymentProviderId | string | null): PaymentProvider {
    const requested = String(providerId || "").trim().toLowerCase();
    if (requested === "test" && !isBillingTestProviderAllowed()) {
        throw new Error(CHECKOUT_UNAVAILABLE_MESSAGE);
    }

    let id = (requested || getDefaultPaymentProviderId()) as PaymentProviderId;
    if (id === "test" && !isBillingTestProviderAllowed()) {
        throw new Error(CHECKOUT_UNAVAILABLE_MESSAGE);
    }

    const provider = getPaymentProvider(id);
    if (provider.id === "test" && !isBillingTestProviderAllowed()) {
        throw new Error(CHECKOUT_UNAVAILABLE_MESSAGE);
    }
    if (!provider.isConfigured()) {
        throw new Error(CHECKOUT_UNAVAILABLE_MESSAGE);
    }
    return provider;
}
