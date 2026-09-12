#!/usr/bin/env node
/**
 * Artist/Producer annual plan contracts (Listener monthly-only).
 * Usage: node scripts/verify-subscription-annual-plans.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { Client } = pg;

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

const catalog = read("lib/billing/plan-catalog.ts");
const service = read("lib/billing/subscription-service.ts");
const stripeCatalog = read("lib/billing/stripe-price-catalog.ts");
const stripeProvider = read("lib/billing/providers/stripe-provider.ts");
const migration = read("supabase/migrations/202609061001_artist_producer_annual_plans.sql");

record("annual migration exists", migration.includes("Artist Annual") && migration.includes("Producer Annual"));
record("artist annual slug defined", catalog.includes('"artist-pro-annual"') && catalog.includes("9999"));
record("producer annual slug defined", catalog.includes('"producer-pro-annual"') && catalog.includes("14999"));
record("listener has no annual slug", !catalog.includes('"premium-listener-annual"'));
record("plan list includes year intervals", !service.includes('.eq("billing_interval", "month")'));
record("successful payment uses billing interval period", service.includes("addBillingPeriodEnd"));
record("stripe checkout supports year interval", stripeProvider.includes('"year"'));
record("stripe catalog has annual env keys", stripeCatalog.includes("STRIPE_PRICE_ID_ARTIST_ANNUAL")
    && stripeCatalog.includes("STRIPE_PRICE_ID_PRODUCER_ANNUAL"));

const dbUrl = loadEnv().DATABASE_URL || "";
if (dbUrl) {
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const { rows } = await client.query(`
        select id, name, audience, price_cents, billing_interval, stripe_price_id, active
        from public.subscription_plans
        where active = true
        order by audience, sort_order, billing_interval, name
    `);

    const listenerAnnual = rows.filter((r) => r.audience === "listener" && r.billing_interval === "year");
    record("no listener annual plan", listenerAnnual.length === 0, `${listenerAnnual.length} found`);

    const artistMonthly = rows.filter((r) => r.audience === "artist" && r.billing_interval === "month" && r.price_cents > 0);
    const artistAnnual = rows.filter((r) => r.audience === "artist" && r.billing_interval === "year" && r.price_cents > 0);
    record("artist monthly paid plans", artistMonthly.length >= 1, `${artistMonthly.length}`);
    record("artist annual paid plan", artistAnnual.length === 1 && artistAnnual[0].price_cents === 9999,
        artistAnnual[0] ? `${artistAnnual[0].name} ${artistAnnual[0].price_cents}c` : "missing");

    const producerMonthly = rows.filter((r) => r.audience === "producer" && r.billing_interval === "month" && r.price_cents > 0);
    const producerAnnual = rows.filter((r) => r.audience === "producer" && r.billing_interval === "year" && r.price_cents > 0);
    record("producer monthly paid plans", producerMonthly.length >= 1, `${producerMonthly.length}`);
    record("producer annual paid plan", producerAnnual.length === 1 && producerAnnual[0].price_cents === 14999,
        producerAnnual[0] ? `${producerAnnual[0].name} ${producerAnnual[0].price_cents}c` : "missing");

    const freeListener = rows.find((r) => r.audience === "listener" && r.name === "Free Listener");
    record("free listener unchanged", freeListener?.price_cents === 0 && freeListener?.billing_interval === "month");

    const artistProRow = rows.find((r) => r.name === "Artist Pro" && r.billing_interval === "month");
    const artistMonthlyRow = rows.find((r) => r.name === "Artist Monthly" && r.billing_interval === "month");
    const producerProRow = rows.find((r) => r.name === "Producer Pro" && r.billing_interval === "month");
    const producerMonthlyRow = rows.find((r) => r.name === "Producer Monthly" && r.billing_interval === "month");
    const premiumListenerRow = rows.find((r) => r.name === "Premium Listener" && r.billing_interval === "month");
    const listenerMonthlyRow = rows.find((r) => r.name === "Listener Monthly" && r.billing_interval === "month");
    record(
        "artist pro/monthly share monthly stripe price id",
        Boolean(artistProRow?.stripe_price_id)
            && artistProRow.stripe_price_id === artistMonthlyRow?.stripe_price_id
            && String(artistProRow.stripe_price_id).startsWith("price_"),
        `${artistProRow?.stripe_price_id || "missing"} / ${artistMonthlyRow?.stripe_price_id || "missing"}`,
    );
    record(
        "producer pro/monthly share monthly stripe price id",
        Boolean(producerProRow?.stripe_price_id)
            && producerProRow.stripe_price_id === producerMonthlyRow?.stripe_price_id
            && String(producerProRow.stripe_price_id).startsWith("price_"),
        `${producerProRow?.stripe_price_id || "missing"} / ${producerMonthlyRow?.stripe_price_id || "missing"}`,
    );
    record(
        "listener premium/monthly share monthly stripe price id",
        Boolean(premiumListenerRow?.stripe_price_id)
            && premiumListenerRow.stripe_price_id === listenerMonthlyRow?.stripe_price_id
            && String(premiumListenerRow.stripe_price_id).startsWith("price_"),
        `${premiumListenerRow?.stripe_price_id || "missing"} / ${listenerMonthlyRow?.stripe_price_id || "missing"}`,
    );
    record(
        "annual plans use distinct stripe price ids",
        Boolean(artistAnnual[0]?.stripe_price_id?.startsWith("price_"))
            && Boolean(producerAnnual[0]?.stripe_price_id?.startsWith("price_"))
            && artistAnnual[0].stripe_price_id !== producerAnnual[0].stripe_price_id,
    );

    console.log("\n=== subscription_plans (active) ===");
    for (const row of rows) {
        console.log(JSON.stringify({
            id: row.id,
            name: row.name,
            role: row.audience,
            priceCents: row.price_cents,
            price: `$${(row.price_cents / 100).toFixed(2)}`,
            billing_interval: row.billing_interval,
            stripe_price_id: row.stripe_price_id,
            active: row.active,
        }));
    }

    await client.end();
} else {
    console.log("SKIP DB checks — DATABASE_URL missing");
}

if (process.exitCode) {
    console.error("\nSubscription annual plan verification failed.");
    process.exit(process.exitCode);
}
console.log("\nSubscription annual plan verification passed.");
