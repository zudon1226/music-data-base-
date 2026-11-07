/**
 * Static guards for Preview PWA production auth mode (no secrets).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const config = read("lib/supabase-config.ts");
const preview = read("lib/preview-pwa-production-supabase.ts");
const loginErr = read("lib/login-auth-error.ts");
const authClient = read("lib/supabase-auth-client.ts");
const docs = read("docs/microsoft-store-pwa.md");

const checks = [
    ["preview PWA production flag module", preview.includes("MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE")],
    ["supabase-config blocks flag on production", config.includes("only allowed on Preview deployments")],
    ["supabase-config preview PWA production branch", config.includes("previewPwaProductionSupabaseRequested")],
    ["supabase-config rejects staging+preview PWA prod", config.includes("cannot be combined with MDB_PREVIEW_SUPABASE_ENABLED")],
    ["login maps staging invalid credentials", loginErr.includes("preview-staging")],
    ["auth client purges stale sb keys", authClient.includes("purgeStaleSupabaseAuthStorageKeys")],
    ["docs mention preview PWA production auth", /preview.*production.*auth|PWA production/i.test(docs)],
];

let failed = 0;
for (const [label, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
    if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
