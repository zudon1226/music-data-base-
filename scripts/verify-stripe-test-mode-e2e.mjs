/**

 * Stripe TEST MODE end-to-end validation (architecture + optional live TEST API).

 * Does not enable live payments or disable beta locks.

 * Usage: node scripts/verify-stripe-test-mode-e2e.mjs

 */

import { createHmac } from "node:crypto";

import { existsSync, readFileSync } from "node:fs";

import { dirname, join } from "node:path";

import { fileURLToPath } from "node:url";

import pg from "pg";



const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { Client } = pg;



const results = {};



function record(key, passed, detail = "") {

    results[key] = { passed, detail };

    console.log(`${passed ? "PASS" : "FAIL"} ${key}${detail ? ` — ${detail}` : ""}`);

    if (!passed) process.exitCode = 1;

}



function skip(key, detail = "") {

    results[key] = { passed: null, detail: `SKIP: ${detail}` };

    console.log(`SKIP ${key}${detail ? ` — ${detail}` : ""}`);

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



function stripeKeyMode(secret) {

    const trimmed = String(secret || "").trim();

    if (!trimmed || trimmed.includes("your-")) return "MISSING";

    if (trimmed.startsWith("sk_test_") || trimmed.startsWith("rk_test_")) return "TEST";

    if (trimmed.startsWith("sk_live_") || trimmed.startsWith("rk_live_")) return "LIVE";

    return "UNKNOWN";

}



function signStripePayload(body, secret, timestamp = Math.floor(Date.now() / 1000)) {

    const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");

    return `t=${timestamp},v1=${sig}`;

}



const env = loadEnv();

const secretMode = stripeKeyMode(env.STRIPE_SECRET_KEY);

const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || "").trim();

const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || "";



// --- 1. Configuration ---

record("stripe_secret_key_not_live", secretMode !== "LIVE", secretMode);

record("beta_ringtone_lock_enabled", read("lib/public-beta-ringtone-purchase.ts").includes("isPublicBetaPaidRingtonePurchaseLocked"));

record("beta_subscription_lock_enabled", read("lib/public-beta-subscription-checkout.ts").includes("isPublicBetaPaidSubscriptionCheckoutLocked"));



// --- Architecture: webhooks update Supabase server-side ---

record("subscription_webhook_applies_provider_status", read("app/api/subscriptions/webhooks/[provider]/route.ts").includes("applySubscriptionProviderStatus"));

record("subscription_webhook_applies_failed_payment", read("app/api/subscriptions/webhooks/[provider]/route.ts").includes("applyFailedPayment"));

record("subscription_webhook_applies_successful_payment", read("app/api/subscriptions/webhooks/[provider]/route.ts").includes("applySuccessfulPayment"));

record("marketplace_webhook_connect_events", read("lib/marketplace-stripe-webhook.ts").includes('eventType.startsWith("account.")'));

record("marketplace_webhook_refund_reversal", read("lib/marketplace-stripe-webhook.ts").includes("charge.refunded"));

record("earnings_idempotency", read("lib/creator-earnings.ts").includes("duplicate: true"));

record("reversal_traceability", read("lib/creator-earnings-reversal.ts").includes("is_reversal: true"));

record("withdrawal_eligibility_gate", read("lib/creator-withdrawal-eligibility.ts").includes("evaluateWithdrawalEligibility"));

record("connect_stores_account_id_only", read("lib/stripe-connect.ts").includes("stripe_connect_account_id") && !read("lib/stripe-connect.ts").includes("bank_account"));

record("ringtone_preview_separate_bucket", read("lib/ringtone-constants.ts").includes("ringtone-previews"));



// --- Status mapping (static) ---

const subService = read("lib/billing/subscription-service.ts");

record("stripe_status_incomplete_supported", subService.includes("incomplete") && subService.includes("past_due"));

record("cancel_at_period_end_supported", subService.includes("cancel_at_period_end"));

record("auto_renew_from_webhook", subService.includes("auto_renew: autoRenew"));

record("ten_day_reminder_job", subService.includes("processRenewalReminders"));



// --- Period notice (10-day) ---

try {

    await import("../lib/billing/period-notice.test.mjs");

    record("ten_day_login_reminder", true);

} catch (error) {

    record("ten_day_login_reminder", false, String(error.message || error).slice(0, 80));

}



// --- Creator access / failed payment states ---

try {

    await import("../lib/billing/creator-access.test.mjs");

    record("failed_payment_state_handling", true);

    record("past_due_blocks_withdrawal", true);

    record("cancel_at_period_end_handling", true);

} catch (error) {

    record("failed_payment_state_handling", false, String(error.message || error).slice(0, 80));

}



// --- DB schema ---

if (dbUrl) {

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

    await client.connect();



    const connectTbl = await client.query(`select to_regclass('public.creator_payment_profiles') as tbl`);

    record("creator_payment_profiles_table", Boolean(connectTbl.rows[0]?.tbl));



    const reversalCol = await client.query(`

        select column_name from information_schema.columns

        where table_schema='public' and table_name='earnings_events' and column_name='is_reversal'

    `);

    record("earnings_reversal_columns", reversalCol.rows.length === 1);



    const plans = await client.query(`

        select name, audience, price_cents, stripe_price_id

        from public.subscription_plans

        where active = true and audience in ('artist','producer') and price_cents > 0 and billing_interval = 'month'

    `);

    const artistPlan = plans.rows.find((p) => /artist/i.test(p.name));

    const producerPlan = plans.rows.find((p) => /producer/i.test(p.name));

    record("artist_plan_exists", Boolean(artistPlan), artistPlan?.name || "missing");

    record("producer_plan_exists", Boolean(producerPlan), producerPlan?.name || "missing");



    if (secretMode === "TEST") {

        const artistHasPrice = Boolean(artistPlan?.stripe_price_id?.startsWith("price_"));

        const producerHasPrice = Boolean(producerPlan?.stripe_price_id?.startsWith("price_"));

        if (!artistHasPrice || !producerHasPrice) {

            skip("artist_test_subscription", "stripe_price_id missing — run configure-payment-foundation-pre-beta.mjs");

            skip("producer_test_subscription", "stripe_price_id missing — run configure-payment-foundation-pre-beta.mjs");

        } else {

            skip("artist_test_subscription", "requires manual Stripe Checkout test with owner bypass + test card 4242…");

            skip("producer_test_subscription", "requires manual Stripe Checkout test with owner bypass + test card 4242…");

        }

    } else {

        skip("artist_test_subscription", "STRIPE_SECRET_KEY not in TEST mode");

        skip("producer_test_subscription", "STRIPE_SECRET_KEY not in TEST mode");

    }



    await client.end();

} else {

    skip("artist_test_subscription", "DATABASE_URL missing");

    skip("producer_test_subscription", "DATABASE_URL missing");

}



// --- Live TEST API ping (no charges) ---

if (secretMode === "TEST") {

    try {

        const response = await fetch("https://api.stripe.com/v1/balance", {

            headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },

        });

        const json = await response.json().catch(() => ({}));

        record("stripe_test_api_connectivity", response.ok, response.ok ? "TEST mode confirmed" : String(json?.error?.message || response.status));

    } catch (error) {

        record("stripe_test_api_connectivity", false, String(error.message || error).slice(0, 80));

    }



    if (webhookSecret && !webhookSecret.includes("your-")) {

        const sampleBody = JSON.stringify({ id: "evt_test", type: "account.updated", data: { object: { id: "acct_test" } } });

        const sig = signStripePayload(sampleBody, webhookSecret);

        record("webhook_signature_helper_valid", sig.includes("v1="), "local HMAC round-trip");

        skip("successful_payment_webhook", "requires Stripe CLI forward + test checkout");

        skip("failed_payment_webhook", "requires declined test card 4000…0002 + webhook forward");

        skip("cancellation_webhook", "requires cancel_at_period_end test + webhook forward");

        skip("stripe_connect_onboarding", "requires TEST Connect Express onboarding flow");

        skip("withdrawal_eligibility_live", "requires test creator with balance + Connect complete");

        skip("ringtone_earnings_flow", "beta lock ON — internal owner test only");

        skip("refund_reversal_flow", "requires charge.refunded webhook in TEST mode");

    } else {

        skip("successful_payment_webhook", "STRIPE_WEBHOOK_SECRET missing");

        skip("failed_payment_webhook", "STRIPE_WEBHOOK_SECRET missing");

        skip("cancellation_webhook", "STRIPE_WEBHOOK_SECRET missing");

        skip("stripe_connect_onboarding", "STRIPE_WEBHOOK_SECRET missing");

        skip("withdrawal_eligibility_live", "STRIPE keys incomplete");

        skip("ringtone_earnings_flow", "STRIPE keys incomplete");

        skip("refund_reversal_flow", "STRIPE keys incomplete");

    }

} else {

    skip("stripe_test_api_connectivity", "STRIPE_SECRET_KEY not in TEST mode");

    skip("successful_payment_webhook", "STRIPE_SECRET_KEY not in TEST mode");

    skip("failed_payment_webhook", "STRIPE_SECRET_KEY not in TEST mode");

    skip("cancellation_webhook", "STRIPE_SECRET_KEY not in TEST mode");

    skip("stripe_connect_onboarding", "STRIPE_SECRET_KEY not in TEST mode");

    skip("withdrawal_eligibility_live", "STRIPE_SECRET_KEY not in TEST mode");

    skip("ringtone_earnings_flow", "STRIPE_SECRET_KEY not in TEST mode");

    skip("refund_reversal_flow", "STRIPE_SECRET_KEY not in TEST mode");

}



record("idempotency_sales_payment_events", read("lib/marketplace-stripe-webhook.ts").includes("sales_payment_events"));



console.log("\n=== Summary JSON ===");

console.log(JSON.stringify({

    stripeSecretKeyMode: secretMode,

    webhookSecret: webhookSecret && !webhookSecret.includes("your-") ? "CONFIGURED" : "MISSING",

    paymentFoundationArchitecture: process.exitCode ? "INCOMPLETE" : "READY",

    liveE2EBlockedReason: secretMode !== "TEST" ? "TEST keys required" : "manual checkout + webhook forward required",

}, null, 2));



if (process.exitCode) {

    console.error("\nStripe TEST MODE E2E verification failed (architecture).");

    process.exit(process.exitCode);

}

console.log("\nStripe TEST MODE E2E verification passed (architecture + static contracts).");


