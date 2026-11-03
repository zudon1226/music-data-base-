/**
 * Static verification for global public beta commerce lock wiring.
 * Usage: node scripts/verify-public-beta-commerce-lock.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

function record(ok, label, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

const lock = read("lib/public-beta-commerce-lock.ts");
record(lock.includes("NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED"), "commerce lock env documented");
record(lock.includes("Purchases and Sales Coming at Full Launch."), "launch copy");
record(lock.includes("MDB10"), "disabled discount codes listed");

const routes = [
    ["app/api/sales/route.ts", "addCartItem"],
    ["app/api/sales/checkout/route.ts", "assertPublicBetaCommerceTransactionAllowed"],
    ["app/api/licenses/route.ts", "assertPublicBetaCommerceTransactionAllowed"],
    ["app/api/payouts/route.ts", "assertPublicBetaCommerceTransactionAllowed"],
    ["app/api/admin/payouts/route.ts", "assertPublicBetaCommerceTransactionAllowed"],
    ["app/api/subscriptions/webhooks/[provider]/route.ts", "shouldBlockPaidSubscriptionProviderActivation"],
    ["app/api/subscriptions/webhooks/[provider]/route.ts", "commerceBlocked"],
    ["app/api/songs/[id]/download/route.ts", "authorizeMediaDownload"],
    ["app/api/videos/[id]/download/route.ts", "authorizeMediaDownload"],
    ["app/api/connect/onboard/route.ts", "createConnectOnboardingLink"],
    ["app/api/connect/refresh/route.ts", "createConnectOnboardingLink"],
    ["lib/sales-stripe-checkout.ts", "assertPublicBetaCommerceTransactionAllowed"],
    ["lib/sales-payment-fulfillment.ts", "assertPublicBetaCommerceTransactionAllowed"],
    ["lib/marketplace-stripe-webhook.ts", "isPublicBetaMarketplacePaymentFulfillmentBlocked"],
    ["lib/ringtone-purchase.ts", "assertPublicBetaCommerceTransactionAllowed"],
    ["lib/public-beta-subscription-checkout.ts", "assertPublicBetaCommerceTransactionAllowed"],
    ["lib/public-beta-sponsor-checkout.ts", "assertPublicBetaCommerceTransactionAllowed"],
    ["lib/billing/subscription-service.ts", "isPublicBetaPaidSubscriptionEntitlementBlocked"],
    ["lib/billing/admin-service.ts", "isPublicBetaPaidSubscriptionEntitlementBlocked"],
    ["lib/media-download-auth.ts", "isPublicBetaPremiumListenerDownloadBlocked"],
    ["lib/stripe-connect.ts", "isPublicBetaConnectOnboardingBlocked"],
];

for (const [file, needle] of routes) {
    record(read(file).includes(needle), `${file} enforces commerce lock`, needle);
}

const page = read("app/page.tsx");
record(page.includes("PublicBetaCommerceLockNotice"), "home/marketplace commerce notice");
record(page.includes("blockPublicBetaCommerceAction"), "client commerce guards");
record(!page.includes("MDB10") || page.includes("isPublicBetaCommerceLocked()"), "discount codes gated when locked");

const ringtoneUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");
record(ringtoneUi.includes("isPublicBetaCommerceLocked"), "ringtone workspace commerce guard");

const connectPanel = read("components/billing/creator-connect-payout-panel.tsx");
record(connectPanel.includes("connectOnboardingBlocked"), "connect onboarding UI disabled when locked");

if (process.exitCode) {
    console.error("\nPublic beta commerce lock verification failed.");
} else {
    console.log("\nPublic beta commerce lock verification passed.");
}
