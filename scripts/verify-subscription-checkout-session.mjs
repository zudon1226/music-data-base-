#!/usr/bin/env node
/**
 * Checkout session creation contracts.
 * Run: node scripts/verify-subscription-checkout-session.mjs
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

const service = read("lib/billing/subscription-service.ts");
const checkout = read("app/api/subscriptions/checkout/route.ts");
const provider = read("lib/billing/payment-provider.ts");
const panel = read("components/billing/subscription-billing-panel.tsx");

record("startSubscriptionCheckout uses requireLiveCheckoutProvider", service.includes("requireLiveCheckoutProvider"));
record("server amounts only for checkout session", service.includes("amountCents: plan.price_cents") && !service.includes("amountCents: input.amountCents"));
record("checkout requires auth match", checkout.includes("requireMatchingUserId"));
record("checkout accepts planSlug", checkout.includes("planSlug") && service.includes("resolveSubscriptionPlanForCheckout"));
record("free plans rejected from checkout", service.includes("Free plans do not use checkout."));
record("unavailable provider returns 503 message", checkout.includes("status: unavailable ? 503 : 400"));
record("UI opening checkout loading state", panel.includes("Opening checkout…") && panel.includes("busyPlanId"));
record("UI prevents duplicate checkout taps", panel.includes("if (!userId || busy) return") && panel.includes("setBusy(true)"));
record("no success toast before live redirect", !panel.includes('onToast?.(String(data.message || "Checkout ready."), "success")'));
record("live mode redirects to provider URL", panel.includes('data.checkoutUrl && data.mode === "live"') && panel.includes("window.location.href"));
record("provider list can be empty (fail closed)", panel.includes("!providers.length") && provider.includes("return ids"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nCHECKOUT_SESSION_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
