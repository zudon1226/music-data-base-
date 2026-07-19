#!/usr/bin/env node
/**
 * Subscription + payment system static contracts.
 * Run: npm run verify:billing
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

const constants = read("lib/billing/constants.ts");
const provider = read("lib/billing/payment-provider.ts");
const service = read("lib/billing/subscription-service.ts");
const access = read("lib/billing/creator-access.ts");
const lifecycle = read("lib/billing/lifecycle.ts");
const admin = read("lib/billing/admin-service.ts");
const payouts = read("app/api/payouts/route.ts");
const migration = read("supabase/migrations/202607190001_subscription_payment_system.sql");
const page = read("app/page.tsx");
const pkg = read("package.json");
const lock = read("lib/ui/responsive-stability-lock.ts");

record("migration adds lifecycle statuses", migration.includes("grace_period") && migration.includes("past_due") && migration.includes("suspended"));
record("migration seeds Listener/Artist/Producer monthly plans", migration.includes("Listener Monthly") && migration.includes("Artist Monthly") && migration.includes("Producer Monthly"));
record("public billing statuses defined", constants.includes("BILLING_PUBLIC_STATUSES") && constants.includes("\"current\"") && constants.includes("\"canceled\"") && constants.includes("\"inactive\""));
record("provider abstraction exports getPaymentProvider", provider.includes("export function getPaymentProvider"));
record("stripe + paypal + test providers wired", provider.includes("createStripeProvider") && provider.includes("createPayPalProvider") && provider.includes("createTestPaymentProvider"));
record("withdrawal lock messages for past_due/canceled/inactive/grace", constants.includes("CREATOR_WITHDRAWAL_LOCKED_MESSAGE") && constants.includes("CREATOR_WITHDRAWAL_CANCELED_MESSAGE") && constants.includes("CREATOR_WITHDRAWAL_INACTIVE_MESSAGE") && constants.includes("CREATOR_WITHDRAWAL_GRACE_ARREARS_MESSAGE"));
record("creator suspend at 3 months", constants.includes("CREATOR_SUSPEND_MONTHS_PAST_DUE = 3"));
record("earnings continue while locked", access.includes("earningsAccumulate: true") && access.includes("walletUpdates: true"));
record("toBillingPublicStatus maps active→current", access.includes("toBillingPublicStatus") && access.includes("return \"current\""));
record("grace policy gates withdrawals by months_past_due", access.includes("WITHDRAWALS_LOCKED_GRACE_ARREARS") && access.includes("monthsPastDue > 0"));
record("cancel keeps period access", service.includes("cancel_at_period_end") && service.includes("subscription.cancel_at_period_end") && lifecycle.includes("resolveCancelAtPeriodEnd"));
record("failed payment retry + grace + auto-renew", lifecycle.includes("resolveFailedPaymentLifecycle") && lifecycle.includes("autoRenew: true") && service.includes("applyFailedPayment"));
record("successful renewal restores auto-renew", lifecycle.includes("resolveSuccessfulRenewal") && service.includes("auto_renew: true"));
record("renewal reminders job", service.includes("processRenewalReminders"));
record("payouts enforce creatorType + structured lock error", payouts.includes("getCreatorBillingAccessForUser(userId, creatorType)") && payouts.includes("billingStatus") && payouts.includes("withdrawalLockCode"));
record("admin snapshot includes overdue/renewal/withdrawal lock", admin.includes("toAdminSubscriptionView") && admin.includes("overdueBalanceCents") && admin.includes("withdrawalLockStatus") && admin.includes("billingStatusCounts"));
record("admin reactivate/refund/override", admin.includes("adminReactivateSubscription") && admin.includes("adminRefundSubscriptionPayment") && admin.includes("adminOverrideSubscriptionStatus"));
record("API routes exist", existsSync(path.join(root, "app/api/subscriptions/route.ts"))
    && existsSync(path.join(root, "app/api/subscriptions/checkout/route.ts"))
    && existsSync(path.join(root, "app/api/subscriptions/cancel/route.ts"))
    && existsSync(path.join(root, "app/api/subscriptions/webhooks/[provider]/route.ts"))
    && existsSync(path.join(root, "app/api/admin/subscriptions/route.ts"))
    && existsSync(path.join(root, "app/api/payouts/route.ts")));
record("UI panels mounted without new layout CSS files", page.includes("SubscriptionBillingPanel") && page.includes("AdminSubscriptionPanel")
    && !existsSync(path.join(root, "components/billing/subscription-billing-panel.module.css")));
record("responsive lock file untouched by billing feature marker", lock.includes("RESPONSIVE_STABILITY_LOCK"));
record("package verify:billing script", pkg.includes("verify:billing"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
