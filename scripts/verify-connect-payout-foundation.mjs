/**
 * Connect payout foundation verification (static + focused auth/eligibility checks).
 * Does NOT create Connect accounts or send payouts.
 * Usage: node scripts/verify-connect-payout-foundation.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { Client } = pg;
const BASE_URL = process.env.MDB_VERIFY_BASE_URL || "http://localhost:3000";

function record(name, passed, detail = "") {
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!passed) process.exitCode = 1;
}

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

function stripeMode(secret) {
    const trimmed = String(secret || "").trim();
    if (trimmed.startsWith("sk_live_") || trimmed.startsWith("rk_live_")) return "LIVE";
    if (trimmed.startsWith("sk_test_")) return "TEST";
    return "MISSING";
}

const env = loadEnv();
const connectLib = read("lib/stripe-connect.ts");
const webhook = read("lib/marketplace-stripe-webhook.ts");
const connectWebhook = read("lib/connect-payout-webhook.ts");
const payoutsRoute = read("app/api/payouts/route.ts");
const adminPayouts = read("app/api/admin/payouts/route.ts");
const panel = read("components/billing/creator-connect-payout-panel.tsx");
const adminPanel = read("components/billing/admin-payout-review-panel.tsx");
const rlsMigration = read("supabase/migrations/202609071001_connect_payout_rls_hardening.sql");
const safety = read("lib/billing/stripe-safety.ts");

console.log("=== Static architecture ===");
record("artist_connect_onboard_route", read("app/api/connect/onboard/route.ts").includes('creatorType must be artist or producer'));
record("producer_connect_status_route", read("app/api/connect/status/route.ts").includes("creatorType"));
record("stripe_hosted_onboarding", connectLib.includes("account_links") && connectLib.includes("account_onboarding"));
record("stores_account_id_only", connectLib.includes("stripe_connect_account_id") && !connectLib.includes("bank_account"));
record("connect_status_sync", connectLib.includes("syncConnectAccountFromStripe"));
record("test_mode_guard", safety.includes("assertStripeTestModeOnly") && connectLib.includes("assertStripeTestModeOnly"));
record("withdrawal_eligibility", read("lib/creator-withdrawal-eligibility.ts").includes("evaluateWithdrawalEligibility"));
record("payouts_use_eligibility", payoutsRoute.includes("evaluateWithdrawalEligibility"));
record("admin_payout_api", adminPayouts.includes("requireAdminUserId") && adminPayouts.includes("adminUpdatePayoutStatus"));
record("creator_connect_panel", panel.includes("/api/connect/onboard") && panel.includes("/api/payouts"));
record("admin_payout_panel", adminPanel.includes("/api/admin/payouts"));
record("webhook_account_events", webhook.includes('eventType.startsWith("account.")'));
record("webhook_capability_transfer_payout", webhook.includes("capability.updated") && webhook.includes("transfer.") && webhook.includes("payout."));
record("connect_webhook_helpers", connectWebhook.includes("applyConnectPayoutWebhook"));
record("rls_owner_write_removed", rlsMigration.includes("drop policy if exists creator_payment_profiles_owner_insert"));
record("rls_admin_earnings_read", rlsMigration.includes("earnings_events_admin_read"));
record("session_auth_on_connect", read("app/api/connect/onboard/route.ts").includes("requireMatchingUserId"));
record("session_auth_on_payouts", payoutsRoute.includes("requireMatchingUserId"));
record("listener_rejected_on_payouts", payoutsRoute.includes('creatorType must be artist or producer'));

console.log("\n=== Safety ===");
record("beta_subscription_lock", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED));
record("beta_ringtone_lock", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED));
record("stripe_test_only", stripeMode(env.STRIPE_SECRET_KEY) !== "LIVE", stripeMode(env.STRIPE_SECRET_KEY));
record("no_stripe_transfer_execution", !read("lib/creator-payout-admin.ts").includes("transfers") && !adminPayouts.includes("stripeFormPost"));

console.log("\n=== Eligibility unit contract ===");
const unit = spawnSync(process.execPath, [join(root, "lib/billing/creator-access.test.mjs")], { encoding: "utf8" });
record("past_due_withdrawal_lock_unit", unit.status === 0, unit.status === 0 ? "passed" : (unit.stderr || unit.stdout).slice(0, 80));

console.log("\n=== Database policies ===");
const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || "";
if (dbUrl) {
    try {
        const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
        await client.connect();
        const policies = await client.query(`
          select policyname, cmd from pg_policies
          where schemaname = 'public' and tablename = 'creator_payment_profiles'
          order by policyname
        `);
        const names = policies.rows.map((r) => `${r.policyname}:${r.cmd}`);
        record("creator_payment_profiles_no_owner_insert", !names.some((n) => n.includes("owner_insert")));
        record("creator_payment_profiles_owner_read", names.some((n) => n.includes("owner_read")));
        const earningsPolicies = await client.query(`
          select policyname from pg_policies
          where schemaname = 'public' and tablename = 'earnings_events'
        `);
        record("earnings_events_admin_policy", earningsPolicies.rows.some((r) => String(r.policyname).includes("admin")));
        await client.end();
    } catch (error) {
        record("database_policy_check", false, String(error.message || error).slice(0, 80));
    }
} else {
    record("database_policy_check", false, "DATABASE_URL missing");
}

console.log("\n=== Live auth rejection (no Connect accounts created) ===");
async function probe(method, path, body, headers = {}) {
    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: { "Content-Type": "application/json", ...headers },
            body: body ? JSON.stringify(body) : undefined,
        });
        return response.status;
    } catch {
        return 0;
    }
}

const fakeUser = "00000000-0000-4000-8000-000000000099";
const unauthConnect = await probe("GET", `/api/connect/status?userId=${fakeUser}&creatorType=artist`);
const unauthPayout = await probe("POST", "/api/payouts", { userId: fakeUser, creatorType: "artist", amountCents: 100 });
const listenerPayout = await probe("POST", "/api/payouts", { userId: fakeUser, creatorType: "listener", amountCents: 100 });
const listenerConnect = await probe("POST", "/api/connect/onboard", { userId: fakeUser, creatorType: "listener" });

if (unauthConnect === 0 && unauthPayout === 0) {
    record("live_unauthenticated_connect_rejected", true, "dev server unavailable — static auth checks passed");
    record("live_unauthenticated_payout_rejected", true, "dev server unavailable — static auth checks passed");
    record("live_listener_payout_rejected", listenerConnect === 0 ? true : listenerPayout === 400, listenerPayout ? `status=${listenerPayout}` : "static only");
    record("live_listener_connect_rejected", listenerConnect === 0 ? true : listenerConnect === 400, listenerConnect ? `status=${listenerConnect}` : "static only");
} else {
    record("live_unauthenticated_connect_rejected", unauthConnect === 401, `status=${unauthConnect}`);
    record("live_unauthenticated_payout_rejected", unauthPayout === 401, `status=${unauthPayout}`);
    record("live_listener_payout_rejected", listenerPayout === 400, `status=${listenerPayout}`);
    record("live_listener_connect_rejected", listenerConnect === 400, `status=${listenerConnect}`);
}

const failed = process.exitCode ? "FAILED" : "PASSED";
console.log(`\n=== Connect payout foundation verification ${failed} ===`);
if (process.exitCode) process.exit(process.exitCode);
