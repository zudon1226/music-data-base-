/**
 * Subscription Stripe go-live wiring verification.
 * Usage: node scripts/verify-subscription-stripe-go-live.mjs
 */
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

const stripeProvider = read("lib/billing/providers/stripe-provider.ts");
const stripeCustomer = read("lib/billing/stripe-customer.ts");
const priceCatalog = read("lib/billing/stripe-price-catalog.ts");
const service = read("lib/billing/subscription-service.ts");
const webhookRoute = read("app/api/subscriptions/webhooks/[provider]/route.ts");
const migration = read("supabase/migrations/202609051002_subscription_stripe_go_live.sql");

record("stripe customer helper exists", stripeCustomer.includes("ensureStripeCustomer"));
record("customer created server-side only", stripeCustomer.includes('stripeFormPost("customers"'));
record("checkout uses stripe_price_id when present", stripeProvider.includes('line_items[0][price]') && stripeProvider.includes("stripePriceId"));
record("checkout uses inline price_data fallback", stripeProvider.includes("price_data"));
record("checkout binds stripe customer id", stripeProvider.includes("params.customer = stripeCustomerId"));
record("price catalog maps artist/producer plans", priceCatalog.includes("artist-pro") && priceCatalog.includes("producer-pro"));
record("price catalog maps artist/producer annual plans", priceCatalog.includes("artistAnnual") && priceCatalog.includes("producerAnnual"));
record("checkout passes billing interval", stripeProvider.includes("billingInterval"));
record("subscription service ensures customer before checkout", service.includes("ensureStripeCustomer"));
record("subscription service resolves stripe price id", service.includes("resolveStripePriceIdForPlan"));
record("webhook maps subscription status updates", service.includes("applySubscriptionProviderStatus"));
record("stripe status mapper covers incomplete states", service.includes("incomplete_expired") && service.includes("unpaid"));
record("webhook route handles providerSubscriptionStatus", webhookRoute.includes("applySubscriptionProviderStatus"));
record("10-day reminder preserved", service.includes("processRenewalReminders") && service.includes("SUBSCRIPTION_RENEWAL_REMINDER_DAYS"));
record("go-live migration exists", migration.includes("stripe_price_id"));

if (process.exitCode) {
    console.error("\nSubscription Stripe go-live verification failed.");
    process.exit(process.exitCode);
}
console.log("\nSubscription Stripe go-live verification passed.");
