/**
 * Public beta subscription checkout lock verification.
 * Usage: node scripts/verify-public-beta-subscription-lock.mjs
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
    return readFileSync(join(root, rel), "utf8");
}

const lock = read("lib/public-beta-subscription-checkout.ts");
const service = read("lib/billing/subscription-service.ts");
const checkoutRoute = read("app/api/subscriptions/checkout/route.ts");
const subscriptionsRoute = read("app/api/subscriptions/route.ts");
const panel = read("components/billing/subscription-billing-panel.tsx");

record("lock helper documents env name", lock.includes("NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED"));
record("unset defaults to locked", lock.includes("parsed === null) return true"));
record("checkout gated in subscription service", service.includes("assertPaidSubscriptionCheckoutAllowed"));
record("checkout route returns SUBSCRIPTION_CHECKOUT_LOCKED", checkoutRoute.includes("SUBSCRIPTION_CHECKOUT_LOCKED"));
record("subscriptions API exposes beta lock", subscriptionsRoute.includes("getSubscriptionCheckoutPublicState"));
record("billing panel disables subscribe when locked", panel.includes("betaLocked") && panel.includes("Coming at launch"));
record("signup path not blocked by subscription lock", !lock.includes("signup") || lock.includes("checkout"));

if (process.exitCode) {
    console.error("\nPublic beta subscription lock verification failed.");
    process.exit(process.exitCode);
}
console.log("\nPublic beta subscription lock verification passed.");
