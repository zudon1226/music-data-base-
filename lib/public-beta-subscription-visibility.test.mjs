/**
 * UNIT TESTS — public beta hides subscription prices and Subscribe buttons.
 * Does not create users, call Stripe, or contact hosted Supabase.
 *
 * Run: node --import ./scripts/register-cleanup-protection-test.mjs lib/public-beta-subscription-visibility.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/page.tsx"), "utf8");
const panel = readFileSync(path.join(root, "components/billing/subscription-billing-panel.tsx"), "utf8");
const checkout = readFileSync(path.join(root, "lib/billing/subscription-service.ts"), "utf8");
const lock = readFileSync(path.join(root, "lib/public-beta-subscription-checkout.ts"), "utf8");

assert.match(lock, /Subscriptions Coming at Full Launch/);
assert.match(lock, /assertPaidSubscriptionCheckoutAllowed/);
assert.match(checkout, /assertPaidSubscriptionCheckoutAllowed\(input\.userId\)/);

const homeAt = page.indexOf('aria-label="Subscriptions"');
assert.ok(homeAt > 0);
const home = page.slice(homeAt, homeAt + 2200);
assert.match(home, /PUBLIC_BETA_SUBSCRIPTION_LAUNCH_TITLE/);
assert.match(home, /Free Sign Up/);
assert.ok(home.indexOf("PUBLIC_BETA_SUBSCRIPTION_LAUNCH_TITLE") < home.indexOf("Choose Your Music Data Base Plan"));
assert.ok(home.indexOf("isPublicBetaPaidSubscriptionCheckoutLocked()") < home.indexOf("plan-grid"));

const setupAt = page.indexOf("function renderSubscriptionPlanSetup");
const setup = page.slice(setupAt, setupAt + 2800);
assert.match(setup, /isPublicBetaPaidSubscriptionCheckoutLocked\(\)/);
assert.match(setup, /data-subscription-free-plans="true"/);
assert.ok(setup.indexOf("Paid subscription plans stay hidden until full launch.") < setup.indexOf("const plans = context === \"platform\""));
assert.ok(setup.indexOf("Select Plan") < setup.indexOf("const plans = context === \"platform\""));
assert.ok(setup.indexOf("formatCurrencyFromCents(plan.priceCents") > setup.indexOf("const plans = context === \"platform\""));

const manageAt = page.indexOf("function renderSubscriptionManagement");
const manage = page.slice(manageAt, manageAt + 1200);
assert.match(manage, /PUBLIC_BETA_SUBSCRIPTION_LAUNCH_TITLE/);
assert.ok(manage.indexOf("Paid subscription prices stay hidden during public beta.") < manage.indexOf("premium-listener"));

assert.match(page, /if \(isPublicBetaPaidSubscriptionCheckoutLocked\(\)\) \{\s*showToast\(PUBLIC_BETA_SUBSCRIPTION_LAUNCH_TITLE/);
assert.match(panel, /isPublicBetaPaidSubscriptionCheckoutLocked\(\)/);
assert.match(panel, /betaLocked \? null : <div className="monetization-plan-grid">/);
assert.match(panel, /PUBLIC_BETA_SUBSCRIPTION_LAUNCH_TITLE/);
assert.doesNotMatch(panel, /month · auto-renew/);

const route = readFileSync(path.join(root, "app/api/subscriptions/route.ts"), "utf8");
assert.match(route, /plansVisibleDuringBeta/);
assert.match(route, /price_cents \|\| 0\) <= 0/);
assert.doesNotMatch(lock, /isPlatformOwnerUserId/);
assert.match(lock, /return false;/);

console.log("public-beta-subscription-visibility.test.mjs passed (unit tests, no live checkout)");
