/**
 * Preview/staging-tier build: loads .env.staging.local only (never .env.pwa-preview.local).
 * Requires owner-supplied staging credentials in the gitignored file.
 *
 * Establishes the server/browser identity contract for this build:
 * - VERCEL_ENV=preview (server resolves staging when flags + JWTs validate)
 * - MDB_PREVIEW_SUPABASE_ENABLED=1 and NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED=1
 * - NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY=preview-staging (inlined into client bundles)
 * - NEXT_PUBLIC_SUPABASE_URL + anon JWT must reference the approved staging ref
 *
 * Ordinary local `next dev` without MDB_LOCAL_SUPABASE_STAGING=1 keeps production identity.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.staging.local");
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";

if (!existsSync(envFile)) {
    console.error("SKIP  .env.staging.local missing — copy from .env.staging.local.example and add owner staging keys.");
    process.exit(2);
}

const env = { ...process.env };
for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.includes("OWNER_SUPPLIES")) {
        console.error(`SKIP  ${key} still uses placeholder — supply staging credentials in .env.staging.local`);
        process.exit(2);
    }
    env[key] = val;
}

env.VERCEL_ENV = "preview";
env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY = "preview-staging";
delete env.MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE;
delete env.NEXT_PUBLIC_MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE;

const url = String(env.NEXT_PUBLIC_SUPABASE_URL || "");
if (!url || url.includes(PRODUCTION_REF)) {
    console.error("SKIP  staging build blocked: NEXT_PUBLIC_SUPABASE_URL must point at staging, not production.");
    process.exit(2);
}

if (env.MDB_PREVIEW_SUPABASE_ENABLED !== "1" || env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED !== "1") {
    console.error("SKIP  staging flags required: MDB_PREVIEW_SUPABASE_ENABLED=1 and NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED=1");
    process.exit(2);
}

const result = spawnSync("npm", ["run", "build"], { cwd: root, env, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);