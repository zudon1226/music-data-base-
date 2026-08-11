/**
 * Shared Stripe REST helpers (no SDK).
 * Used by subscription billing and one-time sales checkout.
 */

export function stripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

export function stripeWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

/** Live Stripe requires both secret and webhook secret (same gate as subscriptions/ringtones). */
export function isStripeLiveConfigured() {
  const secret = stripeSecretKey();
  const webhook = stripeWebhookSecret();
  return Boolean(secret && webhook && !secret.includes("your-") && !webhook.includes("your-"));
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
