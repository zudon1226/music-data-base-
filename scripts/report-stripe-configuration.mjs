/**

 * Stripe configuration report (no secret values printed).

 * Usage: node scripts/report-stripe-configuration.mjs

 */

import { existsSync, readFileSync } from "node:fs";

import { dirname, join } from "node:path";

import { fileURLToPath } from "node:url";

import pg from "pg";



const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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



function stripeKeyMode(secret) {

    const trimmed = String(secret || "").trim();

    if (!trimmed || trimmed.includes("your-")) return "MISSING";

    if (trimmed.startsWith("sk_test_") || trimmed.startsWith("rk_test_")) return "TEST";

    if (trimmed.startsWith("sk_live_") || trimmed.startsWith("rk_live_")) return "LIVE";

    return "UNKNOWN";

}



function webhookStatus(value) {

    const trimmed = String(value || "").trim();

    if (!trimmed || trimmed.includes("your-")) return "MISSING";

    return "CONFIGURED";

}



function isLocked(value) {

    if (value === undefined || value === "") return true;

    const n = String(value).trim().toLowerCase();

    if (["1", "true", "yes", "on"].includes(n)) return true;

    if (["0", "false", "no", "off"].includes(n)) return false;

    return true;

}



const env = loadEnv();

const secretMode = stripeKeyMode(env.STRIPE_SECRET_KEY);

const webhookConfigured = webhookStatus(env.STRIPE_WEBHOOK_SECRET);

const billingProvider = String(env.BILLING_PAYMENT_PROVIDER || "").trim() || "(unset → stripe when keys present)";



const connectCode = readFileSync(join(root, "lib/stripe-connect.ts"), "utf8");

const connectRoutes = existsSync(join(root, "app/api/connect/onboard/route.ts"))

    && existsSync(join(root, "app/api/connect/status/route.ts"));

const connectMigration = existsSync(join(root, "supabase/migrations/202609051005_stripe_connect_foundation.sql"));



let connectConfig = "MISSING";

if (connectCode.includes("ensureStripeConnectAccount") && connectRoutes && connectMigration) {

    connectConfig = secretMode === "TEST" || secretMode === "LIVE" ? "CONFIGURED" : "PARTIAL";

}



console.log("=== Stripe configuration report ===");

console.log(`STRIPE_SECRET_KEY = ${secretMode}`);

console.log(`STRIPE_WEBHOOK_SECRET = ${webhookConfigured}`);

console.log(`BILLING_PAYMENT_PROVIDER = ${billingProvider}`);

console.log(`Stripe Connect configuration = ${connectConfig}`);

console.log(`NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED = ${isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED) ? "locked" : "UNLOCKED"}`);

console.log(`NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED = ${isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED) ? "locked" : "UNLOCKED"}`);



console.log("\n=== Environment variable placement ===");

const vars = [

    { name: "STRIPE_SECRET_KEY", local: true, vercelProd: true, vercelPreview: true, vercelDev: true },

    { name: "STRIPE_WEBHOOK_SECRET", local: true, vercelProd: true, vercelPreview: true, vercelDev: true },

    { name: "BILLING_PAYMENT_PROVIDER", local: true, vercelProd: true, vercelPreview: true, vercelDev: true },

    { name: "STRIPE_PRICE_ID_LISTENER_MONTHLY", local: true, vercelProd: true, vercelPreview: true, vercelDev: true },

    { name: "STRIPE_PRICE_ID_ARTIST_MONTHLY", local: true, vercelProd: true, vercelPreview: true, vercelDev: true },

    { name: "STRIPE_PRICE_ID_PRODUCER_MONTHLY", local: true, vercelProd: true, vercelPreview: true, vercelDev: true },

    { name: "CRON_SECRET", local: true, vercelProd: true, vercelPreview: false, vercelDev: false },

    { name: "NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED", local: true, vercelProd: true, vercelPreview: true, vercelDev: true },

    { name: "NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED", local: true, vercelProd: true, vercelPreview: true, vercelDev: true },

];

for (const v of vars) {

    const present = Boolean(String(env[v.name] || "").trim());

    console.log(JSON.stringify({

        variable: v.name,

        configured: present ? "yes" : "no",

        local: v.local ? ".env.local" : null,

        vercelProduction: v.vercelProd ? "yes" : "no",

        vercelPreview: v.vercelPreview ? "yes" : "no",

        vercelDevelopment: v.vercelDev ? "yes" : "no",

    }));

}



const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || "";

if (dbUrl) {

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

    await client.connect();

    const { rows: plans } = await client.query(`

        select name, audience, price_cents, billing_interval, stripe_price_id

        from public.subscription_plans

        where active = true and billing_interval = 'month' and price_cents > 0

        order by sort_order, name

    `);

    console.log("\n=== Subscription plans (DB) ===");

    for (const plan of plans) {

        console.log(JSON.stringify({

            name: plan.name,

            audience: plan.audience,

            priceCents: plan.price_cents,

            interval: plan.billing_interval,

            stripePriceId: plan.stripe_price_id ? "configured" : "MISSING",

        }));

    }



    const connectTable = await client.query(`

        select to_regclass('public.creator_payment_profiles') as tbl

    `);

    console.log(`\ncreator_payment_profiles table = ${connectTable.rows[0]?.tbl ? "present" : "MISSING"}`);

    await client.end();

}



console.log("\n=== Manual Stripe Dashboard (TEST mode) ===");

console.log("Products/Prices to create or sync (run configure-payment-foundation-pre-beta.mjs with TEST key):");

console.log("- Artist Pro / Artist Monthly: $9.99/month recurring");

console.log("- Producer Pro / Producer Monthly: $14.99/month recurring");

console.log("- Premium Listener / Listener Monthly: $6.99/month recurring (optional for listener tests)");

console.log("\nWebhook endpoints (TEST mode):");

console.log("- POST {SITE_URL}/api/subscriptions/webhooks/stripe");

console.log("  Events: checkout.session.completed (subscription), invoice.paid, invoice.payment_succeeded,");

console.log("          invoice.payment_failed, customer.subscription.created, customer.subscription.updated,");

console.log("          customer.subscription.deleted");

console.log("- POST {SITE_URL}/api/marketplace/webhooks/stripe");

console.log("  Events: checkout.session.completed (payment), charge.refunded, account.updated");

console.log("\nStripe Connect (TEST mode):");

console.log("- Enable Connect Express in Dashboard → Settings → Connect");

console.log("- Onboarding via POST /api/connect/onboard (stores acct_* ID only in creator_payment_profiles)");

console.log("- account.updated events route to marketplace webhook");



if (secretMode === "LIVE") {

    console.error("\nWARNING: LIVE Stripe key detected — do NOT use for test validation.");

    process.exitCode = 1;

}


