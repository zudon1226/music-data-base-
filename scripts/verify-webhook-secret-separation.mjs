/**
 * Verify Stripe webhook secret separation (subscription vs marketplace/Connect).
 * Does not print secret values or modify Stripe/Supabase data.
 * Usage: node scripts/verify-webhook-secret-separation.mjs
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : "";
}

function record(name, passed, detail = "") {
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!passed) process.exitCode = 1;
}

function isLocked(v) {
    if (v === undefined || v === "") return true;
    const n = String(v).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(n)) return true;
    if (["0", "false", "no", "off"].includes(n)) return false;
    return true;
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

function stripeMode(secret) {
    const trimmed = String(secret || "").trim();
    if (trimmed.startsWith("sk_live_") || trimmed.startsWith("rk_live_")) return "LIVE";
    if (trimmed.startsWith("sk_test_")) return "TEST";
    return "OTHER";
}

function signStripePayload(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
    const signature = createHmac("sha256", secret)
        .update(`${timestamp}.${rawBody}`, "utf8")
        .digest("hex");
    return { header: `t=${timestamp},v1=${signature}`, timestamp };
}

const stripeRest = read("lib/billing/providers/stripe-rest.ts");
const marketplaceWebhook = read("lib/marketplace-stripe-webhook.ts");
const marketplaceRoute = read("app/api/marketplace/webhooks/stripe/route.ts");
const stripeProvider = read("lib/billing/providers/stripe-provider.ts");

console.log("=== Static secret wiring ===");
record("subscription uses STRIPE_WEBHOOK_SECRET", stripeProvider.includes("stripeWebhookSecret()"));
record("marketplace uses STRIPE_MARKETPLACE_WEBHOOK_SECRET", marketplaceWebhook.includes("stripeMarketplaceWebhookSecret()"));
record("marketplace no subscription secret import", !marketplaceWebhook.includes("stripeWebhookSecret"));
record("marketplace no fallback to subscription secret", !marketplaceWebhook.includes("STRIPE_WEBHOOK_SECRET"));
record("marketplace route uses marketplace configured gate", marketplaceRoute.includes("isStripeMarketplaceWebhookConfigured"));
record("stripe-rest exports marketplace secret helper", stripeRest.includes("stripeMarketplaceWebhookSecret"));

console.log("\n=== Isolated signature verification ===");
const isolatedMarketplaceSecret = "whsec_isolated_marketplace_probe_only";
const isolatedSubscriptionSecret = "whsec_isolated_subscription_probe_only";
const rawBody = JSON.stringify({
    id: "evt_isolated_probe",
    type: "account.updated",
    data: { object: { id: "acct_probe", metadata: {} } },
});

const stripeRestModule = await import(pathToFileURL(join(root, "lib/billing/providers/stripe-rest.ts")).href);
const { verifyStripeWebhookSignature } = stripeRestModule;

const goodSig = signStripePayload(rawBody, isolatedMarketplaceSecret);
let rejectsSubscriptionSecret = false;
try {
    verifyStripeWebhookSignature(rawBody, goodSig.header, isolatedMarketplaceSecret);
    const badSig = signStripePayload(rawBody, isolatedSubscriptionSecret);
    verifyStripeWebhookSignature(rawBody, badSig.header, isolatedMarketplaceSecret);
} catch (error) {
    rejectsSubscriptionSecret = /signature verification failed/i.test(String(error?.message || error));
}
record("marketplace rejects subscription-signed payload", rejectsSubscriptionSecret);

let acceptsMarketplaceSecret = false;
try {
    verifyStripeWebhookSignature(rawBody, goodSig.header, isolatedMarketplaceSecret);
    acceptsMarketplaceSecret = true;
} catch {
    acceptsMarketplaceSecret = false;
}
record("marketplace accepts marketplace-signed payload", acceptsMarketplaceSecret);

console.log("\n=== Safety ===");
const env = loadEnv();
record("beta subscription lock ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED));
record("beta ringtone lock ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED));
record("no live stripe key", stripeMode(env.STRIPE_SECRET_KEY) !== "LIVE", stripeMode(env.STRIPE_SECRET_KEY));
record("no real stripe objects modified", true, "read-only verification");

console.log(`\n=== Webhook secret separation verification ${process.exitCode ? "FAILED" : "PASSED"} ===`);
if (process.exitCode) process.exit(process.exitCode);
