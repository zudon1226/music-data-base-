#!/usr/bin/env node
/**
 * Duplicate webhook idempotency contracts.
 * Run: node scripts/verify-subscription-duplicate-webhook.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const service = read("lib/billing/subscription-service.ts");
const webhook = read("app/api/subscriptions/webhooks/[provider]/route.ts");

record(
    "applySuccessfulPayment short-circuits on existing succeeded payment",
    service.includes('.eq("provider_payment_id", input.providerPaymentId)')
        && service.includes('.eq("status", "succeeded")')
        && service.includes("duplicate: true"),
);
record("webhook surfaces duplicate flag", webhook.includes("duplicate: Boolean(result.duplicate)"));
record("server plan price used over webhook amount", service.includes("const amountCents = Number(approvedPlan.price_cents)"));
record("pending checkout plan applied on success", service.includes("pendingCheckoutPlanId") && service.includes("lastConfirmedPlanId"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nDUPLICATE_WEBHOOK_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
