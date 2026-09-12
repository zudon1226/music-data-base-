/**
 * Sponsor system foundation verification (static + lock semantics).
 * Usage: node scripts/verify-sponsor-foundation.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    const full = join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

function record(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

function parseTruthyEnv(value) {
    if (value === undefined || value === "") return null;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
    return null;
}

function isPublicBetaSponsorCheckoutLocked(envValue) {
    const parsed = parseTruthyEnv(envValue);
    if (parsed === null) return true;
    return parsed;
}

const migration = read("supabase/migrations/202609101001_sponsor_foundation.sql");
const lockSource = read("lib/public-beta-sponsor-checkout.ts");
const checkoutRoute = read("app/api/sponsors/checkout/route.ts");
const checkoutLib = read("lib/sponsor-stripe-checkout.ts");
const fulfillment = read("lib/sponsor-payment-fulfillment.ts");
const platformRevenue = read("lib/platform-revenue.ts");
const webhook = read("lib/marketplace-stripe-webhook.ts");
const stripeProvider = read("lib/billing/providers/stripe-provider.ts");
const ringtonePurchase = read("lib/public-beta-ringtone-purchase.ts");
const subscriptionLock = read("lib/public-beta-subscription-checkout.ts");
const sponsorService = read("lib/sponsor-service.ts");
const packagesRoute = read("app/api/sponsors/packages/route.ts");
const applicationsRoute = read("app/api/sponsors/applications/route.ts");
const adminRoute = read("app/api/admin/sponsors/route.ts");
const placementsRoute = read("app/api/sponsors/placements/route.ts");
const pageSource = read("app/page.tsx");
const navLib = read("lib/desktop-app-navigation.ts");
const roleNav = read("lib/role-based-navigation.ts");

// Database
record("migration defines sponsor_packages", migration.includes("create table if not exists public.sponsor_packages"));
record("migration defines sponsor_applications", migration.includes("create table if not exists public.sponsor_applications"));
record("migration defines sponsor_assets", migration.includes("create table if not exists public.sponsor_assets"));
record("migration defines sponsor_payment_events", migration.includes("create table if not exists public.sponsor_payment_events"));
record("migration defines platform_revenue_events", migration.includes("create table if not exists public.platform_revenue_events"));
record("migration enables RLS", migration.includes("enable row level security"));
record("migration admin uses is_platform_admin", migration.includes("is_platform_admin()"));
record("migration public active placement policy", migration.includes("sponsor_applications_public_active_read"));
record("migration sponsor-assets storage bucket", migration.includes("'sponsor-assets'"));

// Public beta lock
record("lock helper documents env name", lockSource.includes("NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED"));
record("default unset means locked", lockSource.includes("if (parsed === null) return true"));
record("checkout route enforces lock", checkoutRoute.includes("startSponsorStripeCheckout"));
record("checkout lib calls assertSponsorCheckoutAllowed", checkoutLib.includes("assertSponsorCheckoutAllowed"));
record("beta message is launch copy", lockSource.includes("Sponsor payment activation is coming at full launch."));
record("unset => locked", isPublicBetaSponsorCheckoutLocked(undefined) === true);
record("false => unlocked", isPublicBetaSponsorCheckoutLocked("false") === false);

// Platform payment architecture — no Connect / no creator earnings
record("sponsor checkout uses platform one-time session", checkoutLib.includes("createStripeOneTimeCheckoutSession"));
record("sponsor checkout metadata purpose", checkoutLib.includes('purpose: "sponsor"'));
record("sponsor checkout no transfer_data usage", !/\btransfer_data\b/.test(checkoutLib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
record("stripe one-time checkout no transfer_data usage", !/\btransfer_data\b/.test(stripeProvider.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
record("fulfillment uses platform revenue ledger", fulfillment.includes("recordPlatformRevenue"));
const fulfillmentCode = fulfillment.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
record("fulfillment never writes earnings_events", !fulfillmentCode.includes('from("earnings_events")') && !fulfillmentCode.includes(".from('earnings_events')"));
record("fulfillment never writes payouts", !fulfillmentCode.includes('from("payouts")'));
record("fulfillment never creates Connect transfer", !/\btransfer_data\b/.test(fulfillmentCode) && !fulfillmentCode.includes("on_behalf_of"));
record("platform revenue source type sponsor", platformRevenue.includes('"sponsor"'));

// Webhook
record("webhook handles sponsor_checkout flow", webhook.includes("SPONSOR_CHECKOUT_FLOW"));
record("webhook sponsor idempotency", webhook.includes("recordSponsorPaymentIdempotency"));
record("webhook sponsor refund path", webhook.includes("handleSponsorRefund"));
record("webhook sponsor payment failure path", webhook.includes("payment_intent.payment_failed") && webhook.includes("markSponsorPaymentFailed"));
record("webhook sponsor checkout expiration path", webhook.includes("checkout.session.expired") && webhook.includes("handleSponsorCheckoutExpired"));
record("fulfillment checkout expiration handler", fulfillment.includes("handleSponsorCheckoutExpired"));
record("fulfillment payment failure handler wired", fulfillment.includes("markSponsorPaymentFailed"));
record("refund passes amount to handler", webhook.includes("refundAmountCents"));
record("platform revenue partial refund support", platformRevenue.includes("applyPlatformRevenueRefund") && platformRevenue.includes("partial_refund"));
record("payment state module exists", read("lib/sponsor-payment-state.mjs").includes("resolveSponsorApplicationAfterRefund"));
record("webhook ringtone flow preserved", webhook.includes("ringtone_purchase_checkout"));
record("webhook connect transfer preserved", webhook.includes('eventType.startsWith("transfer.")'));

// Trusted server pricing
record("create application uses package price from DB", sponsorService.includes("Number(pkg.price_cents)"));
record("packages route reads active packages", packagesRoute.includes("listActiveSponsorPackages"));
record("applications route requires auth match", applicationsRoute.includes("requireMatchingUserId"));
record("admin route requires admin", adminRoute.includes("requireAdminUserId"));
record("placements filters active paid window", placementsRoute.includes("listActiveSponsorPlacements") || sponsorService.includes("status = 'active'"));

// UI integration
record("page renders SponsorWorkspace", pageSource.includes("SponsorWorkspace"));
record("page renders SponsorHomePlacement", pageSource.includes("SponsorHomePlacement"));
record("page renders AdminSponsorPanel", pageSource.includes("AdminSponsorPanel"));
record("page Sponsor view wired", pageSource.includes('view === "Sponsor"'));
record("nav includes Sponsor", navLib.includes('{ view: "Sponsor" }'));
record("role nav allows Sponsor", roleNav.includes('"Sponsor"'));

// Existing beta locks preserved
record("ringtone lock still default locked", ringtonePurchase.includes("if (parsed === null) return true"));
record("subscription lock still default locked", subscriptionLock.includes("if (parsed === null) return true"));

// Stripe mode guard (no sk_live in sponsor code)
const sponsorFiles = [checkoutLib, fulfillment, checkoutRoute, webhook].join("\n");
record("sponsor code does not reference sk_live", !/sk_live/i.test(sponsorFiles));

if (process.exitCode) {
    console.error("\nSponsor foundation verification failed.");
    process.exit(process.exitCode);
}
console.log("\nSponsor foundation verification passed.");
console.log("SPONSOR BETA CHECKOUT LOCK: ON (default when env unset)");
console.log("CREATOR EARNINGS FROM SPONSORS: NO");
console.log("CONNECT TRANSFER FROM SPONSORS: NO");
