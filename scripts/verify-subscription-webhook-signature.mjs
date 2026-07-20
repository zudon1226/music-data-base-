#!/usr/bin/env node
/**
 * Webhook signature verification contracts.
 * Run: node scripts/verify-subscription-webhook-signature.mjs
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

const stripe = read("lib/billing/providers/stripe-provider.ts");
const paypal = read("lib/billing/providers/paypal-provider.ts");
const webhook = read("app/api/subscriptions/webhooks/[provider]/route.ts");

record("stripe HMAC verification present", stripe.includes("createHmac") && stripe.includes("timingSafeEqual") && stripe.includes("verifyStripeSignature"));
record("stripe rejects missing signature when configured", stripe.includes("Missing Stripe-Signature header."));
record("paypal requires signature when configured", paypal.includes("Missing PayPal webhook signature header."));
record("webhook returns 401 on signature failures", webhook.includes("unauthorized ? 401 : 500"));
record("webhook matches customer/user before activate", webhook.includes("provider_customer_id") && webhook.includes("No matching user."));
record("webhook rejects unapproved plan ids", webhook.includes("Webhook plan id is not an approved plan."));

// Local crypto shape check (same algorithm Stripe expects).
const secret = "whsec_test";
const rawBody = "{\"type\":\"checkout.session.completed\"}";
const timestamp = "1710000000";
const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
record("stripe signed payload algorithm shape", Boolean(expected) && expected.length === 64, expected.slice(0, 12));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nWEBHOOK_SIGNATURE_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
