/**
 * Public beta Home subscription presentation (static checks).
 * Usage: node lib/public-beta-subscription-home.test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

function record(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

const page = read("app/page.tsx");
const section = read("components/public-beta/public-beta-free-signup-section.tsx");
const content = read("lib/public-beta-subscription-home-content.ts");
const billingPanel = read("components/billing/subscription-billing-panel.tsx");
const subLock = read("lib/public-beta-subscription-checkout.ts");
const ringLock = read("lib/public-beta-ringtone-purchase.ts");
const sponsorLock = read("lib/public-beta-sponsor-checkout.ts");
const activation = read("lib/signup-account-activation.ts");
const legal = read("lib/legal-signup-validation.mjs");

record("home content strings exported", content.includes("Welcome to Music Data Base"));
record("verified registration route marker", content.includes('PUBLIC_BETA_VERIFIED_REGISTRATION_ROUTE = "auth-signup"'));
record("free signup section component", section.includes("PublicBetaFreeSignupSection"));
record("Sign Up Free button uses registration route attr", section.includes("data-registration-route"));
record("home switches on beta checkout lock", page.includes("isPublicBetaPaidSubscriptionCheckoutLocked"));
record("home renders PublicBetaFreeSignupSection", page.includes("PublicBetaFreeSignupSection"));
record("home preserves full launch plan grid", page.includes("plan-grid") && page.includes("SUBSCRIPTION_PLANS.map"));
record("open registration handler", page.includes("openVerifiedPublicRegistration"));
record("beta locked hides paid plan prices on profile panel", billingPanel.includes("!betaLocked") || billingPanel.includes("betaLocked ? null"));
record("subscription checkout lock preserved", subLock.includes("assertPaidSubscriptionCheckoutAllowed"));
record("ringtone lock preserved", ringLock.includes("assertMarketplaceRingtoneDownloadAllowed"));
record("sponsor lock preserved", sponsorLock.includes("assertSponsorCheckoutAllowed"));
record("email confirmation gate preserved", activation.includes("needs_email_confirmation"));
record("legal acceptance preserved", legal.includes("validateSignupAcceptanceInput"));
record("no Subscribe on public beta home section", !section.toLowerCase().includes("subscribe"));
record("no price display in public beta home section", !section.includes("priceCents") && !section.includes("formatCurrency"));

if (process.exitCode) {
    console.error("\npublic-beta-subscription-home tests failed.");
    process.exit(process.exitCode);
}
console.log("\npublic-beta-subscription-home tests passed.");
