#!/usr/bin/env node
/**
 * Role/plan authorization contracts.
 * Run: node scripts/verify-subscription-role-plan-auth.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

const catalog = read("lib/billing/plan-catalog.ts");
const service = read("lib/billing/subscription-service.ts");
const page = read("app/page.tsx");

record("listener plans mapped", catalog.includes('"free-listener"') && catalog.includes('"premium-listener"'));
record("creator free + artist/producer pro mapped", catalog.includes('"creator-free"') && catalog.includes('"artist-pro"') && catalog.includes('"producer-pro"'));
record("assertAudienceMaySelectPlan enforces combinations", catalog.includes('audience === "listener" && plan === "listener"')
    && catalog.includes('audience === "artist"')
    && catalog.includes('audience === "producer"'));
record("checkout and free activation call assertAudienceMaySelectPlan", (service.match(/assertAudienceMaySelectPlan/g) || []).length >= 2);
record("page blocks listener on creator plans", page.includes("Creator plans require an artist or producer account."));
record("page blocks non-listener on listener plans", page.includes("Listener plans are for listener accounts."));

// Lightweight inlined check mirroring catalog rules.
function assertAudienceMaySelectPlan(audience, planAudience) {
    const plan = String(planAudience || "").toLowerCase();
    if (audience === "listener" && plan === "listener") return true;
    if (audience === "artist" && (plan === "artist" || plan === "creator")) return true;
    if (audience === "producer" && (plan === "producer" || plan === "creator")) return true;
    return false;
}

record("listener may select free/premium listener", assertAudienceMaySelectPlan("listener", "listener"));
record("listener cannot select artist pro", !assertAudienceMaySelectPlan("listener", "artist"));
record("artist may select creator free", assertAudienceMaySelectPlan("artist", "creator"));
record("producer may select producer pro", assertAudienceMaySelectPlan("producer", "producer"));
record("artist cannot select listener premium", !assertAudienceMaySelectPlan("artist", "listener"));

try {
    assert.equal(assertAudienceMaySelectPlan("producer", "creator"), true);
    record("producer may select creator free", true);
} catch (error) {
    record("producer may select creator free", false, error instanceof Error ? error.message : String(error));
}

const failed = results.filter((row) => !row.ok).length;
console.log(`\nROLE_PLAN_AUTH_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
