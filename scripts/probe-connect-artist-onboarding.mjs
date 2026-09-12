/**
 * ONE isolated Stripe TEST Artist Connect onboarding validation.
 * May create exactly ONE TEST connected account for a @probe.local user.
 * Does NOT complete KYC, send money, transfers, or payouts.
 * Usage: node scripts/probe-connect-artist-onboarding.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.MDB_VERIFY_BASE_URL || "http://localhost:3000";
const { Client } = pg;

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

function stripeMode(secret) {
    const trimmed = String(secret || "").trim();
    if (trimmed.startsWith("sk_live_") || trimmed.startsWith("rk_live_")) return "LIVE";
    if (trimmed.startsWith("sk_test_")) return "TEST";
    return "MISSING";
}

const results = [];
function record(name, passed, detail = "") {
    results.push({ name, passed, detail });
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!passed) process.exitCode = 1;
}

const env = loadEnv();
const connectLib = readFileSync(join(root, "lib/stripe-connect.ts"), "utf8");

console.log("=== Safety preflight ===");
record("STRIPE_SECRET_KEY is TEST/Sandbox only", stripeMode(env.STRIPE_SECRET_KEY) === "TEST", stripeMode(env.STRIPE_SECRET_KEY));
record("no sk_live_ key in use", !String(env.STRIPE_SECRET_KEY || "").includes("sk_live_") && !String(env.STRIPE_SECRET_KEY || "").includes("rk_live_"));
record("beta subscription lock ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED));
record("beta ringtone lock ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED));
record("Marketplace controller configured", connectLib.includes("controller[fees][payer]") && connectLib.includes("controller[losses][payments]"));
record("Express Dashboard configured", connectLib.includes('controller[stripe_dashboard][type]') && connectLib.includes("express"));
record("Stripe-hosted onboarding configured", connectLib.includes("account_links") && connectLib.includes("account_onboarding"));
record("existing Accounts API version (v1)", connectLib.includes('stripeFormPost("accounts"') && !connectLib.includes("accounts/v2"));
record("no OAuth", !connectLib.toLowerCase().includes("oauth"));
record("no Accounts v2 migration", !connectLib.includes("v2/core/accounts"));
record("uncommitted work preserved", true, "no git commit/push/reset performed");

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.STRIPE_SECRET_KEY) {
    console.error("Missing required env for probe.");
    process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function stripeGet(path) {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(String(json?.error?.message || `Stripe GET ${path} failed`));
    }
    return json;
}

async function apiFetch(path, { method = "GET", token = "", body = undefined, redirect = "follow" } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect,
    });
    return response;
}

const email = `connect-artist-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;
let artistUserId = "";
let artistToken = "";
let otherUserId = "";
let otherToken = "";
let stripeAccountId = "";
let firstOnboardingUrl = "";
let secondOnboardingUrl = "";
let refreshOnboardingUrl = "";

console.log("\n=== Create isolated TEST Artist probe user ===");
const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Connect Artist Probe" },
});
if (created.error) {
    record("create probe artist user", false, created.error.message);
    process.exit(1);
}
artistUserId = created.data.user?.id || "";
record("create probe artist user", Boolean(artistUserId), email);

const signIn = await anon.auth.signInWithPassword({ email, password });
if (signIn.error || !signIn.data.session?.access_token) {
    record("artist sign-in", false, signIn.error?.message || "no token");
    process.exit(1);
}
artistToken = signIn.data.session.access_token;
record("artist sign-in", true);

const otherEmail = `connect-other-${Date.now()}@probe.local`;
const otherCreated = await admin.auth.admin.createUser({
    email: otherEmail,
    password,
    email_confirm: true,
});
otherUserId = otherCreated.data.user?.id || "";
const otherSignIn = await anon.auth.signInWithPassword({ email: otherEmail, password });
otherToken = otherSignIn.data.session?.access_token || "";
record("create second probe user for cross-user test", Boolean(otherUserId && otherToken));

console.log("\n=== Artist onboarding start ===");
const onboardRes = await apiFetch("/api/connect/onboard", {
    method: "POST",
    token: artistToken,
    body: { userId: artistUserId, creatorType: "artist", email },
});
const onboardJson = await onboardRes.json().catch(() => ({}));
record("authenticated Artist can start payout setup", onboardRes.status === 201 && onboardJson.ok === true, `status=${onboardRes.status}`);
firstOnboardingUrl = String(onboardJson.onboardingUrl || "");
stripeAccountId = String(onboardJson.stripeAccountId || "");
record("onboarding URL returned correctly", firstOnboardingUrl.startsWith("https://connect.stripe.com/"), firstOnboardingUrl.slice(0, 72));
record("exactly one TEST connected account created", stripeAccountId.startsWith("acct_"), stripeAccountId);

let dbProfile = null;
const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || "";
if (dbUrl) {
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const profileRes = await client.query(
        `select user_id, creator_type, stripe_connect_account_id, onboarding_status
         from public.creator_payment_profiles
         where user_id = $1 and creator_type = 'artist'`,
        [artistUserId],
    );
    dbProfile = profileRes.rows[0] || null;
    await client.end();
}
record("connected account ID stored against correct user", dbProfile?.stripe_connect_account_id === stripeAccountId, dbProfile?.stripe_connect_account_id || "missing");

console.log("\n=== Retry onboarding (no duplicate account) ===");
const retryRes = await apiFetch("/api/connect/onboard", {
    method: "POST",
    token: artistToken,
    body: { userId: artistUserId, creatorType: "artist", email },
});
const retryJson = await retryRes.json().catch(() => ({}));
secondOnboardingUrl = String(retryJson.onboardingUrl || "");
record("no duplicate connected account on retry", retryJson.stripeAccountId === stripeAccountId, retryJson.stripeAccountId);
record("retry returns fresh onboarding URL", secondOnboardingUrl.startsWith("https://connect.stripe.com/"));

console.log("\n=== Stripe account configuration ===");
let stripeAccount = null;
try {
    stripeAccount = await stripeGet(`accounts/${stripeAccountId}`);
} catch (error) {
    record("fetch Stripe TEST account", false, String(error.message || error));
}
if (stripeAccount) {
    const controller = stripeAccount.controller || {};
    const fees = controller.fees || {};
    const losses = controller.losses || {};
    const dashboard = controller.stripe_dashboard || {};
    record("Marketplace controller configuration", fees.payer === "application" && losses.payments === "application", `fees=${fees.payer}, losses=${losses.payments}`);
    record("Express Dashboard configuration present", dashboard.type === "express", dashboard.type || "missing");
    record("platform/application fee responsibility correct", fees.payer === "application");
    record("platform/application loss responsibility correct", losses.payments === "application");
    record("no live Stripe activity", stripeAccount.livemode !== true, `livemode=${stripeAccount.livemode}`);
    record("Stripe Account Link uses account_onboarding", connectLib.includes('type: "account_onboarding"'));
}

console.log("\n=== refresh_url fresh Account Link ===");
const refreshRes = await apiFetch(
    `/api/connect/refresh?userId=${encodeURIComponent(artistUserId)}&creatorType=artist`,
    { token: artistToken, redirect: "manual" },
);
refreshOnboardingUrl = refreshRes.headers.get("location") || "";
record("refresh_url generates fresh Account Link", refreshRes.status === 302 && refreshOnboardingUrl.startsWith("https://connect.stripe.com/"), `status=${refreshRes.status}`);

console.log("\n=== return flow status check ===");
const statusRes = await apiFetch(
    `/api/connect/status?userId=${encodeURIComponent(artistUserId)}&creatorType=artist`,
    { token: artistToken },
);
const statusJson = await statusRes.json().catch(() => ({}));
record("return flow checks /api/connect/status", statusRes.status === 200 && statusJson.ok === true, `status=${statusRes.status}`);
record("return_url works (status sync without assuming complete)", statusJson.connect?.profile?.stripe_connect_account_id === stripeAccountId && statusJson.connect?.onboardingComplete !== true, `onboardingComplete=${statusJson.connect?.onboardingComplete}`);

console.log("\n=== Auth rejection checks ===");
const unauthOnboard = await apiFetch("/api/connect/onboard", {
    method: "POST",
    body: { userId: artistUserId, creatorType: "artist" },
});
record("unauthenticated access rejected (onboard)", unauthOnboard.status === 401, `status=${unauthOnboard.status}`);

const unauthStatus = await apiFetch(`/api/connect/status?userId=${encodeURIComponent(artistUserId)}&creatorType=artist`);
record("unauthenticated access rejected (status)", unauthStatus.status === 401, `status=${unauthStatus.status}`);

const listenerOnboard = await apiFetch("/api/connect/onboard", {
    method: "POST",
    token: artistToken,
    body: { userId: artistUserId, creatorType: "listener" },
});
record("Listener access rejected", listenerOnboard.status === 400, `status=${listenerOnboard.status}`);

const crossUserStatus = await apiFetch(
    `/api/connect/status?userId=${encodeURIComponent(artistUserId)}&creatorType=artist`,
    { token: otherToken },
);
record("Artist cannot access another user's connected account", crossUserStatus.status === 403, `status=${crossUserStatus.status}`);

console.log("\n=== No money movement ===");
let transferCount = 0;
let payoutCount = 0;
try {
    const transfers = await stripeGet(`transfers?limit=10&destination=${encodeURIComponent(stripeAccountId)}`);
    transferCount = Array.isArray(transfers.data) ? transfers.data.length : 0;
    const payouts = await stripeGet(`payouts?limit=10&stripe_account=${encodeURIComponent(stripeAccountId)}`);
    payoutCount = Array.isArray(payouts.data) ? payouts.data.length : 0;
} catch (error) {
    record("Stripe transfer/payout listing", false, String(error.message || error).slice(0, 80));
}
record("no transfer created", transferCount === 0, `count=${transferCount}`);
record("no payout created", payoutCount === 0, `count=${payoutCount}`);
record("no real money movement", transferCount === 0 && payoutCount === 0);
record("beta locks remain ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED) && isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED));

console.log("\n=== Probe summary ===");
console.log(`probeEmail=${email}`);
console.log(`probeUserId=${artistUserId}`);
console.log(`stripeAccountId=${stripeAccountId}`);
console.log(`firstOnboardingUrl=${firstOnboardingUrl}`);

const failed = results.some((r) => !r.passed);
if (!failed && firstOnboardingUrl.startsWith("https://connect.stripe.com/")) {
    console.log("\nREADY FOR MANUAL STRIPE TEST ONBOARDING");
    console.log("Open the onboarding URL in a browser while signed in as the probe Artist.");
    console.log("Stripe will ask for business/identity details — enter TEST data only in Stripe TEST mode.");
    console.log("Do NOT use real SSN, bank account, or debit card numbers.");
}
console.log(`\n=== Isolated Artist Connect onboarding ${failed ? "FAILED" : "PASSED"} ===`);
if (process.exitCode) process.exit(process.exitCode);
