import { createHmac, timingSafeEqual } from "node:crypto";
import { stripeWebhookSecret } from "./stripe-rest";

/**
 * Shared Stripe webhook HMAC verification (raw body + Stripe-Signature).
 * Used by subscription billing and one-time sales webhooks.
 */
export function verifyStripeSignature(rawBody: string, signatureHeader: string | null) {
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
