/**
 * Shared Stripe REST helpers (no SDK).
 * Used by subscription billing and one-time sales checkout.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function stripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

/** Subscription webhook signing secret (/api/subscriptions/webhooks/stripe). */
export function stripeWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

/** Marketplace + Connect webhook signing secret (/api/marketplace/webhooks/stripe). */
export function stripeMarketplaceWebhookSecret() {
  return String(process.env.STRIPE_MARKETPLACE_WEBHOOK_SECRET || "").trim();
}

function isConfiguredSecret(value: string) {
  return Boolean(value && !value.includes("your-"));
}

/** Live Stripe requires both secret and webhook secret (same gate as subscriptions/ringtones). */
export function isStripeLiveConfigured() {
  const secret = stripeSecretKey();
  const webhook = stripeWebhookSecret();
  return Boolean(secret && webhook && isConfiguredSecret(secret) && isConfiguredSecret(webhook));
}

/** Marketplace/Connect webhook route gate — never falls back to STRIPE_WEBHOOK_SECRET. */
export function isStripeMarketplaceWebhookConfigured() {
  const secret = stripeSecretKey();
  const marketplaceWebhook = stripeMarketplaceWebhookSecret();
  return Boolean(secret && marketplaceWebhook && isConfiguredSecret(secret) && isConfiguredSecret(marketplaceWebhook));
}

export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
) {
  if (!webhookSecret) {
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
  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error("Stripe webhook signature verification failed.");
  }
}

export async function stripeFormPost(path: string, params: Record<string, string>) {
  const secret = stripeSecretKey();
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

export async function stripeFormGet(path: string) {
  const secret = stripeSecretKey();
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String((json as { error?: { message?: string } }).error?.message || `Stripe ${path} failed`);
    throw new Error(message);
  }
  return json as Record<string, unknown>;
}
