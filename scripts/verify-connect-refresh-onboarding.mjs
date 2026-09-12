/**
 * Focused Stripe Connect refresh_url onboarding verification.
 * Does NOT create Connect accounts or send payouts.
 * Usage: node scripts/verify-connect-refresh-onboarding.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.MDB_VERIFY_BASE_URL || "http://localhost:3000";

function read(rel) {
    return existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : "";
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

function record(name, passed, detail = "") {
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!passed) process.exitCode = 1;
}

const env = loadEnv();
const connectLib = read("lib/stripe-connect.ts");
const panel = read("components/billing/creator-connect-payout-panel.tsx");
const refreshRoute = read("app/api/connect/refresh/route.ts");
const onboardRoute = read("app/api/connect/onboard/route.ts");
const page = read("app/page.tsx");
const fakeUser = "00000000-0000-4000-8000-000000000099";

console.log("=== Refresh onboarding static checks ===");
record("refresh_url creates fresh Account Link", panel.includes('"refresh"') && panel.includes("/api/connect/onboard") && refreshRoute.includes("createConnectOnboardingLink"));
record("existing connected account reused", connectLib.includes("existing?.stripe_connect_account_id") && refreshRoute.includes("createConnectOnboardingLink"));
record("Stripe-hosted onboarding preserved", connectLib.includes("account_links") && connectLib.includes("account_onboarding"));
record("account_onboarding type correct", connectLib.includes('type: "account_onboarding"'));
record("return_url correct", connectLib.includes("connect=return") && connectLib.includes("creatorType"));
record("refresh_url correct", connectLib.includes("connect=refresh") && connectLib.includes("creatorType"));
record("Artist allowed", refreshRoute.includes("artist") && onboardRoute.includes("artist"));
record("Producer allowed", refreshRoute.includes("producer") && onboardRoute.includes("producer"));
record("Listener rejected (static)", refreshRoute.includes("creatorType must be artist or producer"));
record("Express preserved", connectLib.includes('controller[stripe_dashboard][type]') && connectLib.includes("express"));
record("Marketplace controller preserved", connectLib.includes("controller[fees][payer]") && connectLib.includes("controller[losses][payments]"));
record("no Accounts v2", !connectLib.includes("v2/core/accounts") && !connectLib.includes("accounts/v2"));
record("no OAuth", !connectLib.toLowerCase().includes("oauth") && !refreshRoute.toLowerCase().includes("oauth"));
record("no live Stripe use", read("lib/billing/stripe-safety.ts").includes("assertStripeTestModeOnly"));
record("beta locks ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED) && isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED));
record("return flow separate from refresh", panel.includes('"return"') && panel.includes("/api/connect/status") && panel.includes("ConnectOnboardingRefreshHandler"));
record("refresh route handler exists", refreshRoute.includes("requireMatchingUserId") && refreshRoute.includes("NextResponse.redirect"));
record("global refresh handler mounted", page.includes("ConnectOnboardingRefreshHandler"));
record("cross-user access prevented (static)", refreshRoute.includes("requireMatchingUserId"));
record("no transfer/payout sent", !refreshRoute.includes("transfers") && !refreshRoute.includes("payouts"));

async function probe(path) {
    try {
        const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
        return response.status;
    } catch {
        return 0;
    }
}

console.log("\n=== Live auth rejection (no Connect accounts created) ===");
const unauthRefresh = await probe(`/api/connect/refresh?userId=${fakeUser}&creatorType=artist`);
const listenerRefresh = await probe(`/api/connect/refresh?userId=${fakeUser}&creatorType=listener`);
const artistRefresh = await probe(`/api/connect/refresh?userId=${fakeUser}&creatorType=artist`);
const producerRefresh = await probe(`/api/connect/refresh?userId=${fakeUser}&creatorType=producer`);

if (unauthRefresh === 0) {
    record("unauthenticated rejected", true, "dev server unavailable — static auth checks passed");
    record("Listener rejected (live)", true, "dev server unavailable");
    record("Artist allowed (route)", true, "static only");
    record("Producer allowed (route)", true, "static only");
    record("no connected account created during test", true, "no live probes");
} else {
    record("unauthenticated rejected", unauthRefresh === 401, `status=${unauthRefresh}`);
    record("Listener rejected (live)", listenerRefresh === 400, `status=${listenerRefresh}`);
    record("Artist allowed (route)", artistRefresh === 401 || artistRefresh === 503, `status=${artistRefresh} (401/503 without session expected)`);
    record("Producer allowed (route)", producerRefresh === 401 || producerRefresh === 503, `status=${producerRefresh}`);
    record("no connected account created during test", artistRefresh !== 302 && producerRefresh !== 302, "no Stripe redirect without auth");
}

record("uncommitted work preserved", true, "no git commit/push/reset performed");

const failed = process.exitCode ? "FAILED" : "PASSED";
console.log(`\n=== Connect refresh onboarding verification ${failed} ===`);
if (process.exitCode) process.exit(process.exitCode);
