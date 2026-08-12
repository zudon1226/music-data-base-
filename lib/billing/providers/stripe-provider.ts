import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "@/lib/billing/payment-provider";
import {
  isStripeLiveConfigured,
  stripeFormPost,
  stripeSecretKey,
  stripeWebhookSecret,
} from "@/lib/billing/providers/stripe-rest";

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

export type StripeOneTimeCheckoutLine = {
  name: string;
  amountCents: number;
  currency: string;
  quantity?: number;
};

export type StripeOneTimeCheckoutInput = {
  userId: string;
  successUrl: string;
  cancelUrl: string;
  lines: StripeOneTimeCheckoutLine[];
  metadata?: Record<string, string>;
  customerEmail?: string;
  clientReferenceId?: string;
};

export type StripeOneTimeCheckoutResult = {
  sessionId: string;
  checkoutUrl: string | null;
  paymentIntentId?: string;
};

/**
 * One-time payment Checkout Session for marketplace sales.
 * Amounts/currency must already be server-authoritative.
 */
export async function createStripeOneTimeCheckoutSession(
  input: StripeOneTimeCheckoutInput,
): Promise<StripeOneTimeCheckoutResult> {
  if (!isStripeLiveConfigured()) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.");
  }
  if (!input.lines.length) {
    throw new Error("Stripe checkout requires at least one line item.");
  }
  for (const line of input.lines) {
    if (!Number.isFinite(line.amountCents) || line.amountCents <= 0) {
      throw new Error("Stripe checkout line amounts must be positive server amounts.");
    }
  }

  const params: Record<string, string> = {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId || input.userId,
    "metadata[userId]": input.userId,
    "payment_intent_data[metadata][userId]": input.userId,
  };
  if (input.customerEmail) params.customer_email = input.customerEmail;

  input.lines.forEach((line, index) => {
    const currency = String(line.currency || "USD").trim().toLowerCase() || "usd";
    params[`line_items[${index}][price_data][currency]`] = currency;
    params[`line_items[${index}][price_data][unit_amount]`] = String(Math.round(line.amountCents));
    params[`line_items[${index}][price_data][product_data][name]`] = String(line.name || "Purchase").slice(0, 120);
    params[`line_items[${index}][quantity]`] = String(Math.max(1, Math.round(line.quantity || 1)));
  });

  for (const [key, value] of Object.entries(input.metadata || {})) {
    const safeKey = String(key).slice(0, 40);
    const safeValue = String(value).slice(0, 500);
    params[`metadata[${safeKey}]`] = safeValue;
    params[`payment_intent_data[metadata][${safeKey}]`] = safeValue;
  }

  const session = await stripeFormPost("checkout/sessions", params);
  return {
    sessionId: String(session.id || `cs_${randomUUID()}`),
    checkoutUrl: session.url ? String(session.url) : null,
    paymentIntentId: session.payment_intent ? String(session.payment_intent) : undefined,
  };
}

/** Stripe Checkout via REST (no SDK dependency). */
export function createStripeProvider(): PaymentProvider {
  return {
    id: "stripe",
    isConfigured: isStripeLiveConfigured,
    async createCheckoutSession(input) {
      if (!isStripeLiveConfigured()) {
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
      const session = await stripeFormPost("checkout/sessions", params);
      return {
        sessionId: String(session.id || `cs_${randomUUID()}`),
        checkoutUrl: session.url ? String(session.url) : null,
        customerId: session.customer ? String(session.customer) : undefined,
        providerSubscriptionId: session.subscription ? String(session.subscription) : undefined,
      };
    },
    async cancelSubscription(providerSubscriptionId, atPeriodEnd) {
      if (!isStripeLiveConfigured()) {
        return { ok: false, message: "Stripe is not configured." };
      }
      await stripeFormPost(`subscriptions/${providerSubscriptionId}`, {
        cancel_at_period_end: atPeriodEnd ? "true" : "false",
        ...(atPeriodEnd ? {} : { prorate: "true" }),
      });
      if (!atPeriodEnd) {
        const secret = stripeSecretKey();
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
      if (!isStripeLiveConfigured()) {
        throw new Error("Stripe is not configured.");
      }
      const params: Record<string, string> = {
        payment_intent: input.providerPaymentId,
      };
      if (input.amountCents != null) params.amount = String(input.amountCents);
      if (input.reason) params.reason = "requested_by_customer";
      const refund = await stripeFormPost("refunds", params);
      return {
        refundId: String(refund.id || ""),
        status: String(refund.status || "") === "succeeded" ? "succeeded" : "pending",
      };
    },
    async parseWebhook(rawBody, signatureHeader) {
      if (isStripeLiveConfigured()) {
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
