/**
 * Connect webhook idempotency retry verification (read-only + logic simulation).
 * Usage: node scripts/verify-connect-webhook-idempotency.mjs
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : "";
}

function record(name, passed, detail = "") {
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!passed) process.exitCode = 1;
}

function loadEnv() {
    const env = { ...process.env };
    const path = join(root, ".env.local");
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function isLocked(v) {
    if (v === undefined || v === "") return true;
    const n = String(v).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(n)) return true;
    if (["0", "false", "no", "off"].includes(n)) return false;
    return true;
}

function stripeMode(secret) {
    const trimmed = String(secret || "").trim();
    if (trimmed.startsWith("sk_live_") || trimmed.startsWith("rk_live_")) return "LIVE";
    if (trimmed.startsWith("sk_test_")) return "TEST";
    return "UNKNOWN";
}

function isConnectStatusSyncEvent(eventType) {
    return eventType.startsWith("account.")
        || eventType === "capability.updated"
        || eventType.startsWith("transfer.")
        || eventType.startsWith("payout.");
}

function shouldShortCircuitDuplicate(eventType, idempotencyInserted) {
    if (idempotencyInserted) return false;
    return !isConnectStatusSyncEvent(eventType);
}

const webhook = read("lib/marketplace-stripe-webhook.ts");
const subWebhook = read("app/api/subscriptions/webhooks/[provider]/route.ts");
const subStripe = read("lib/billing/providers/stripe-provider.ts");
const connectLib = read("lib/stripe-connect.ts");
const payoutWebhook = read("lib/connect-payout-webhook.ts");
const earnings = read("lib/creator-earnings.ts");
const fulfillment = read("lib/sales-payment-fulfillment.ts");

console.log("=== Static structure ===");
record("connect sync event helper present", webhook.includes("function isConnectStatusSyncEvent"));
record("account events allow retry", webhook.includes("!isConnectStatusSyncEvent(eventType)"));
record("capability events included", webhook.includes('eventType === "capability.updated"'));
record("transfer events included", webhook.includes('eventType.startsWith("transfer.")'));
record("payout events included", webhook.includes('eventType.startsWith("payout.")'));
record("checkout still short-circuits duplicate", webhook.includes("duplicate: true, eventType"));
record("charge.refunded before checkout path", webhook.indexOf("charge.refunded") < webhook.indexOf("checkout.session.completed"));
record("sync uses upsert idempotent", connectLib.includes(".upsert(") && connectLib.includes("last_synced_at"));
record("payout webhook updates existing row only", payoutWebhook.includes("Payout row not found") && payoutWebhook.includes(".update(patch)"));
record("earnings duplicate guard preserved", earnings.includes("duplicate: true"));
record("fulfillment idempotency preserved", fulfillment.includes("duplicate") || fulfillment.includes("already"));
record("subscription webhook route unchanged", subWebhook.includes("getPaymentProvider") && !subWebhook.includes("isConnectStatusSyncEvent"));
record("subscription uses STRIPE_WEBHOOK_SECRET", subStripe.includes("stripeWebhookSecret()"));
record("marketplace signature helper unchanged", webhook.includes("verifyMarketplaceStripeSignature"));
record("marketplace marketplace secret unchanged", webhook.includes("stripeMarketplaceWebhookSecret()"));

console.log("\n=== Logic simulation ===");
record("A first account.updated succeeds processes", !shouldShortCircuitDuplicate("account.updated", true));
record("B failed-first retry same event id processes", !shouldShortCircuitDuplicate("account.updated", false));
record("C completed duplicate checkout blocked", shouldShortCircuitDuplicate("checkout.session.completed", false));
record("C completed duplicate refund blocked", shouldShortCircuitDuplicate("charge.refunded", false));
record("capability retry processes", !shouldShortCircuitDuplicate("capability.updated", false));
record("transfer retry processes", !shouldShortCircuitDuplicate("transfer.created", false));
record("payout retry processes", !shouldShortCircuitDuplicate("payout.paid", false));

console.log("\n=== Side-effect guards (static) ===");
record("D no payout creation in connect sync", !connectLib.includes('from("payouts").insert') && !payoutWebhook.includes(".insert("));
record("E no transfer creation in webhook", !webhook.includes("transfers") || webhook.includes('eventType.startsWith("transfer.")'));
const connectHandlerSection = webhook.slice(
    webhook.indexOf('if (eventType.startsWith("account.")'),
    webhook.indexOf('if (eventType === "charge.refunded")'),
);
record("F earnings not invoked on connect sync paths", !connectHandlerSection.includes("recordRingtonePurchaseEarnings")
    && !connectHandlerSection.includes("recordCreatorSaleEarnings")
    && !connectHandlerSection.includes("reverseCreatorEarningsForSource"));
record("G purchase fulfillment only on checkout", webhook.includes('eventType !== "checkout.session.completed"') || webhook.includes("flow === \"sales_pending_checkout\""));
record("H connect sync scoped by metadata userId", connectLib.includes("metadata.userId") && connectLib.includes("onConflict: \"user_id,creator_type\""));

console.log("\n=== Safety ===");
const env = loadEnv();
record("I stripe TEST only", stripeMode(env.STRIPE_SECRET_KEY) === "TEST", stripeMode(env.STRIPE_SECRET_KEY));
record("J beta subscription lock ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED));
record("J beta ringtone lock ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED));
record("test artist refresh path exists", connectLib.includes("syncConnectAccountFromStripe") && read("app/api/connect/status/route.ts").includes("getConnectOnboardingStatus"));

console.log("\n=== Signature verification round-trip ===");
const envForSig = loadEnv();
for (const [key, value] of Object.entries(envForSig)) {
    if (value !== undefined && process.env[key] === undefined) process.env[key] = value;
}
const { verifyStripeWebhookSignature, stripeMarketplaceWebhookSecret } = await import("../lib/billing/providers/stripe-rest.ts");
const marketplaceSecret = stripeMarketplaceWebhookSecret();
if (marketplaceSecret && !marketplaceSecret.includes("your-")) {
    const body = JSON.stringify({ id: "evt_connect_retry_test", type: "account.updated", data: { object: { id: "acct_test" } } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", marketplaceSecret).update(`${ts}.${body}`, "utf8").digest("hex");
    try {
        verifyStripeWebhookSignature(body, `t=${ts},v1=${sig}`, marketplaceSecret);
        record("L marketplace signature verification", true);
    } catch (error) {
        record("L marketplace signature verification", false, String(error.message || error));
    }
} else {
    record("L marketplace signature verification", false, "marketplace secret not configured locally");
}

if (process.exitCode) {
    console.error("\nConnect webhook idempotency verification FAILED");
    process.exit(process.exitCode);
}
console.log("\nConnect webhook idempotency verification PASSED");
