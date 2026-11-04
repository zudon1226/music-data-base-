/**
 * Static staging preview readiness for Apple IAP (no deploy, no secret values).
 * Usage: node scripts/verify-apple-iap-preview-readiness.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";

function record(ok, label, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

record(existsSync(join(root, "app/api/apple/products/route.ts")), "route GET /api/apple/products");
record(existsSync(join(root, "app/api/apple/transactions/verify/route.ts")), "route POST /api/apple/transactions/verify");
record(existsSync(join(root, "app/api/apple/transactions/restore/route.ts")), "route POST /api/apple/transactions/restore");
record(existsSync(join(root, "app/api/apple/notifications/route.ts")), "route POST /api/apple/notifications");

const syncScript = read("scripts/sync-vercel-preview-supabase-staging.mjs");
record(syncScript.includes(STAGING_REF), "sync script targets staging ref", STAGING_REF);
record(syncScript.includes(PRODUCTION_REF), "sync script documents production ref separation");
record(!syncScript.includes(`STAGING_REF = ${PRODUCTION_REF}`), "staging ref != production ref");

const stage1 = read("lib/apple/apple-iap-stage1.ts");
record(stage1.includes("APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED = true"), "grant kill switch hard-coded on");

const commerce = read("lib/public-beta-commerce-lock.ts");
record(commerce.includes("if (parsed === null) return true"), "commerce lock default locked when unset");

const previewDoc = read("docs/apple-iap-staging-preview-config.md");
record(previewDoc.includes(STAGING_REF), "preview config doc references staging ref");
record(previewDoc.includes("Do not deploy"), "preview config doc defers deploy");

for (const route of [
    "app/api/apple/transactions/verify/route.ts",
    "app/api/apple/transactions/restore/route.ts",
    "app/api/apple/notifications/route.ts",
]) {
    record(read(route).includes("entitlementsGranted: false"), `${route} forces entitlementsGranted false`);
}

if (process.exitCode) {
    console.error("\nApple IAP preview readiness check failed.");
} else {
    console.log("\nApple IAP preview readiness check passed (static; deploy not performed).");
}
