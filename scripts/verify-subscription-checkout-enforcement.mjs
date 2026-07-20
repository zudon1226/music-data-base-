#!/usr/bin/env node
/**
 * Subscription checkout enforcement contracts.
 * Run: node scripts/verify-subscription-checkout-enforcement.mjs
 */
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

const page = read("app/page.tsx");
const panel = read("components/billing/subscription-billing-panel.tsx");
const service = read("lib/billing/subscription-service.ts");
const provider = read("lib/billing/payment-provider.ts");
const env = read("lib/billing/env.ts");
const checkout = read("app/api/subscriptions/checkout/route.ts");
const subscriptions = read("app/api/subscriptions/route.ts");
const webhook = read("app/api/subscriptions/webhooks/[provider]/route.ts");
const stripe = read("lib/billing/providers/stripe-provider.ts");
const catalog = read("lib/billing/plan-catalog.ts");
const androidClient = read("lib/ringtone-marketplace-client.ts");
const iphoneUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");
const lock = read("lib/ui/responsive-stability-lock.ts");

record("misleading gateway-later toast removed", !page.includes("Checkout gateway can be connected later"));
record("free listener activates without checkout path", page.includes("plan.priceCents || 0) <= 0") && page.includes("is now active.") && page.includes('action: "activate_free"'));
record("creator free uses free activation", page.includes("creator-free") && subscriptions.includes("activateFreeSubscriptionPlan"));
const paidHandler = (() => {
    const start = page.indexOf("Paid plans must never become Selected");
    return start >= 0 ? page.slice(start, start + 2200) : "";
})();
record(
    "paid plan never set Selected before provider confirmation",
    paidHandler.includes('/api/subscriptions/checkout')
        && (paidHandler.match(/setActiveSubscriptionPlanId\(plan\.id\)/g) || []).length === 1
        && paidHandler.includes('data.mode === "test" && data.subscriptionActive'),
);
record(
    "paid click starts checkout session API",
    page.includes('/api/subscriptions/checkout')
        && page.includes("planSlug: plan.id")
        && page.includes("Opening checkout…"),
);
record(
    "paid Selected only after test activation or server active",
    panel.includes("isServerActivePlan")
        && panel.includes('toLowerCase() === "active"')
        && page.includes('data.mode === "test" && data.subscriptionActive'),
);
record("missing provider uses exact error message", page.includes("Checkout is not available yet. Your current plan was not changed.")
    && provider.includes("CHECKOUT_UNAVAILABLE_MESSAGE")
    && checkout.includes("CHECKOUT_UNAVAILABLE_MESSAGE"));
record("production blocks test provider", env.includes("isBillingTestProviderAllowed") && env.includes('nodeEnv === "production"') && provider.includes("isBillingTestProviderAllowed()"));
record("listConfiguredProviders does not always include test", provider.includes("if (isBillingTestProviderAllowed()) ids.push(\"test\")") && !/ids\.push\(\"test\"\);\s*return ids;/.test(provider.replace(/\s+/g, "")));
record("checkout rejects client-supplied price mismatch", service.includes("Client-supplied price rejected.") && checkout.includes("clientPriceCents"));
record("checkout rejects invalid plan id", checkout.includes("Invalid plan id.") && service.includes("Invalid plan id."));
record("active paid plan preserved until webhook", service.includes("keepActivePlan") && service.includes("pendingCheckoutPlanId"));
record("free activation API exists", subscriptions.includes("activate_free") && service.includes("activateFreeSubscriptionPlan"));
record("webhook verifies stripe signature", stripe.includes("verifyStripeSignature") && stripe.includes("timingSafeEqual"));
record("duplicate webhook idempotent", service.includes("duplicate: true") && webhook.includes("duplicate"));
record("test webhooks blocked in production", webhook.includes("Test billing webhooks are disabled in production"));
record("role/plan authorization helpers", catalog.includes("assertAudienceMaySelectPlan") && service.includes("assertAudienceMaySelectPlan"));
record("android ringtone download untouched marker", androidClient.includes("downloadAndroidRingtoneAudio") && androidClient.includes('deviceType: "android"'));
record("iphone ringtone download untouched marker", iphoneUi.includes("startIphoneSecureRingtoneDownload") && androidClient.includes("startIphoneSecureRingtoneDownload"));
record("responsive stability lock untouched marker", lock.includes("RESPONSIVE_STABILITY_LOCK"));

// Explicit paid-plan cannot activate without payment (no applySuccessfulPayment in page click path)
record("page paid path does not call applySuccessfulPayment", !page.includes("applySuccessfulPayment"));
record("live checkout does not auto-activate", service.includes('mode: "live"') && service.includes("subscriptionActive: false"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nSUBSCRIPTION_ENFORCEMENT_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
