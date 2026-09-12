/**
 * Verify user-facing subscription plan presentation (alias dedup + approved labels).
 * Usage: node scripts/verify-plan-presentation-fix.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { Client } = pg;
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
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

const CLIENT_SUBSCRIPTION_PLANS = {
    "premium-listener": { names: ["Premium Listener", "Listener Monthly"], displayLabel: "Listener", audience: "listener", priceCents: 699, billingInterval: "month" },
    "artist-pro": { names: ["Artist Pro", "Artist Monthly"], displayLabel: "Artist", audience: "artist", priceCents: 999, billingInterval: "month" },
    "artist-pro-annual": { names: ["Artist Annual"], displayLabel: "Artist Annual", audience: "artist", priceCents: 9999, billingInterval: "year" },
    "producer-pro": { names: ["Producer Pro", "Producer Monthly"], displayLabel: "Producer", audience: "producer", priceCents: 1499, billingInterval: "month" },
    "producer-pro-annual": { names: ["Producer Annual"], displayLabel: "Producer Annual", audience: "producer", priceCents: 14999, billingInterval: "year" },
};

const PAID_CLIENT_PLAN_SLUGS_BY_AUDIENCE = {
    listener: ["premium-listener"],
    artist: ["artist-pro", "artist-pro-annual"],
    producer: ["producer-pro", "producer-pro-annual"],
};

function matchPlanBySlug(plans, slug) {
    const def = CLIENT_SUBSCRIPTION_PLANS[slug];
    if (!def) return null;
    const nameSet = new Set(def.names.map((n) => n.toLowerCase()));
    const matches = plans.filter((plan) =>
        nameSet.has(String(plan.name || "").toLowerCase())
        && String(plan.billing_interval || "month").toLowerCase() === def.billingInterval,
    );
    if (!matches.length) return null;
    return matches.find((plan) => Number(plan.price_cents || 0) === def.priceCents) || matches[0];
}

function resolvePresentablePaidPlans(plans, audience) {
    const slugs = PAID_CLIENT_PLAN_SLUGS_BY_AUDIENCE[audience] || [];
    const presentable = [];
    for (const slug of slugs) {
        const matched = matchPlanBySlug(plans, slug);
        if (!matched || Number(matched.price_cents || 0) <= 0) continue;
        presentable.push({
            ...matched,
            clientSlug: slug,
            displayName: CLIENT_SUBSCRIPTION_PLANS[slug].displayLabel,
        });
    }
    return presentable;
}

const catalog = read("lib/billing/plan-catalog.ts");
const panel = read("components/billing/subscription-billing-panel.tsx");
const page = read("app/page.tsx");

record("resolvePresentablePaidPlans helper exists", catalog.includes("export function resolvePresentablePaidPlans"));
record("billing panel uses presentable resolver", panel.includes("resolvePresentablePaidPlans"));
record("billing panel no raw paidPlans filter", !panel.includes('plans.filter((plan) => Number(plan.price_cents || 0) > 0)'));
record("billing panel uses displayName", panel.includes("plan.displayName"));
record("page SUBSCRIPTION_PLANS uses Listener label", page.includes('name: "Listener",') && page.includes('id: "premium-listener"'));
record("page SUBSCRIPTION_PLANS uses Artist label", page.includes('name: "Artist",') && page.includes('id: "artist-pro"'));
record("page SUBSCRIPTION_PLANS uses Producer label", page.includes('name: "Producer",') && page.includes('id: "producer-pro"'));

const env = loadEnv();
const betaLocked = env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED;
record("public-beta checkout lock ON", betaLocked === undefined || betaLocked === "true" || betaLocked === "1", `value=${betaLocked ?? "unset"}`);
record("signup verify scripts untouched", read("scripts/verify-signup-account-type.mjs").includes("requestedAccountType"));

const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
if (dbUrl) {
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const { rows } = await client.query(`
        select id, name, audience, price_cents, billing_interval, stripe_price_id, active
        from public.subscription_plans
        where active = true
    `);

    const listenerPlans = resolvePresentablePaidPlans(rows, "listener");
    record("listener monthly appears once", listenerPlans.length === 1 && listenerPlans[0].price_cents === 699,
        listenerPlans.map((p) => `${p.displayName} ${p.price_cents}`).join(", ") || "none");
    record("no listener annual option", !rows.some((r) => r.audience === "listener" && r.billing_interval === "year"));

    const artistPlans = resolvePresentablePaidPlans(rows, "artist");
    const artistMonthly = artistPlans.filter((p) => p.clientSlug === "artist-pro");
    const artistAnnual = artistPlans.filter((p) => p.clientSlug === "artist-pro-annual");
    record("artist monthly appears once at $9.99", artistMonthly.length === 1 && artistMonthly[0].price_cents === 999,
        artistMonthly[0] ? `${artistMonthly[0].displayName} ${artistMonthly[0].price_cents}` : "missing");
    record("artist annual appears once at $99.99", artistAnnual.length === 1 && artistAnnual[0].price_cents === 9999,
        artistAnnual[0] ? `${artistAnnual[0].displayName} ${artistAnnual[0].price_cents}` : "missing");

    const producerPlans = resolvePresentablePaidPlans(rows, "producer");
    const producerMonthly = producerPlans.filter((p) => p.clientSlug === "producer-pro");
    const producerAnnual = producerPlans.filter((p) => p.clientSlug === "producer-pro-annual");
    record("producer monthly appears once at $14.99", producerMonthly.length === 1 && producerMonthly[0].price_cents === 1499,
        producerMonthly[0] ? `${producerMonthly[0].displayName} ${producerMonthly[0].price_cents}` : "missing");
    record("producer annual appears once at $149.99", producerAnnual.length === 1 && producerAnnual[0].price_cents === 14999,
        producerAnnual[0] ? `${producerAnnual[0].displayName} ${producerAnnual[0].price_cents}` : "missing");

    const aliasNames = ["Premium Listener", "Listener Monthly", "Artist Pro", "Artist Monthly", "Producer Pro", "Producer Monthly"];
    const shownNames = new Set([...listenerPlans, ...artistPlans, ...producerPlans].map((p) => p.displayName));
    const aliasLeak = [...shownNames].filter((name) => aliasNames.includes(name));
    record("alias duplicates hidden/merged", aliasLeak.length === 0, aliasLeak.join(", ") || "none");

    await client.end().catch(() => {});
} else {
    record("live DB dedup checks", false, "DATABASE_URL not configured");
}

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} (${results.length} total)`);
process.exit(failed === 0 ? 0 : 1);
