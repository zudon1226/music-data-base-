/**
 * Marketplace / Connect webhook verification (Group 4 Connect scope + existing marketplace flows).
 * Usage: node scripts/verify-marketplace-payment-webhook.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function record(name, passed, detail = "") {
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!passed) process.exitCode = 1;
}

function read(rel) {
    return existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : "";
}

const webhook = read("lib/marketplace-stripe-webhook.ts");
const webhookRoute = read("app/api/marketplace/webhooks/stripe/route.ts");
const fulfillment = read("lib/sales-payment-fulfillment.ts");
const earnings = read("lib/creator-earnings.ts");
const salesCheckout = read("lib/sales-stripe-checkout.ts");

record("marketplace webhook route exists", webhookRoute.includes("processMarketplaceStripeWebhook"));
record("webhook verifies stripe signature", webhook.includes("verifyMarketplaceStripeSignature"));
record("marketplace webhook secret separated", webhook.includes("stripeMarketplaceWebhookSecret"));
record("marketplace route marketplace webhook gate", webhookRoute.includes("isStripeMarketplaceWebhookConfigured"));
record("connect idempotency retry guard", webhook.includes("isConnectStatusSyncEvent"));
record("sales flow fulfillment", webhook.includes("sales_pending_checkout") && fulfillment.includes("completePendingSalesFromStripeSession"));
record("sales grants vault entitlements", fulfillment.includes("grantEntitlementsForCompletedPurchases"));
record("ringtone flow confirmation", webhook.includes("ringtone_purchase_checkout") && webhook.includes("confirmRingtonePurchasePayment"));
record("creator earnings from sales", earnings.includes("recordCreatorSaleEarnings"));
record("creator earnings from ringtones", earnings.includes("recordRingtonePurchaseEarnings"));
record("webhook idempotency table", webhook.includes("sales_payment_events"));
record("connect account.updated webhook", webhook.includes('eventType.startsWith("account.")'));
record("connect capability.updated webhook", webhook.includes("capability.updated") && webhook.includes("applyConnectCapabilityWebhook"));
record("connect transfer webhook", webhook.includes('eventType.startsWith("transfer.")'));
record("connect payout webhook", webhook.includes('eventType.startsWith("payout."'));
record("charge.refunded earnings reversal", webhook.includes("charge.refunded") && webhook.includes("reverseCreatorEarningsForSource"));
record("earnings duplicate guard", earnings.includes("duplicate: true"));
record("sales checkout metadata flow preserved", salesCheckout.includes("sales_pending_checkout"));
let headWebhook = "";
try {
    headWebhook = execSync("git show HEAD:lib/marketplace-stripe-webhook.ts", { cwd: root, encoding: "utf8" });
} catch {
    headWebhook = webhook;
}
record(
    "connect handler free of sponsor checkout branch",
    !headWebhook.includes("SPONSOR_CHECKOUT_FLOW") && headWebhook.includes("isConnectStatusSyncEvent"),
);

if (process.exitCode) {
    console.error("\nMarketplace payment webhook verification failed.");
    process.exit(process.exitCode);
}
console.log("\nMarketplace payment webhook verification passed.");
