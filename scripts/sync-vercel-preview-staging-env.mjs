/**
 * Push staging Preview env vars to linked Vercel project (names logged only; values redacted).
 * Source: .env.staging.local + required preview identity flags.
 * Usage: node scripts/sync-vercel-preview-staging-env.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";

const REQUIRED_KEYS = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MDB_PREVIEW_SUPABASE_ENABLED",
    "NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED",
    "NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY",
];

function parseEnvFile(path) {
    const out = {};
    if (!existsSync(path)) return out;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        out[key] = val;
    }
    return out;
}

const stagingPath = join(root, ".env.staging.local");
const env = parseEnvFile(stagingPath);
if (!existsSync(stagingPath)) {
    console.error("FAIL .env.staging.local missing");
    process.exit(1);
}

const url = String(env.NEXT_PUBLIC_SUPABASE_URL || "");
if (!url.includes(STAGING_REF)) {
    console.error(`FAIL NEXT_PUBLIC_SUPABASE_URL must include staging ref ${STAGING_REF}`);
    process.exit(1);
}
if (url.includes(PRODUCTION_REF)) {
    console.error("FAIL refusing Production Supabase URL");
    process.exit(1);
}

env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY =
    env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY || "preview-staging";
env.MDB_PREVIEW_SUPABASE_ENABLED = env.MDB_PREVIEW_SUPABASE_ENABLED || "1";
env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED = env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED || "1";

const missing = REQUIRED_KEYS.filter((k) => !env[k]);
if (missing.length) {
    console.error(`FAIL missing keys in .env.staging.local: ${missing.join(", ")}`);
    process.exit(1);
}

const targets = ["preview", "development"];
const secretKeys = new Set(["SUPABASE_SERVICE_ROLE_KEY"]);
let failures = 0;

for (const key of REQUIRED_KEYS) {
    const value = env[key];
    for (const target of targets) {
        spawnSync(
            "npx",
            ["vercel", "env", "remove", key, "--environment", target, "--yes"],
            { cwd: root, stdio: "ignore", shell: true, env: process.env },
        );
        const addArgs = [
            "vercel",
            "env",
            "add",
            key,
            "--environment",
            target,
            "--force",
            "--yes",
            "--value",
            value,
        ];
        if (secretKeys.has(key)) {
            addArgs.push("--sensitive");
        } else {
            addArgs.push("--no-sensitive");
        }
        const add = spawnSync("npx", addArgs, {
            cwd: root,
            stdio: "pipe",
            shell: true,
            env: process.env,
        });
        if (add.status !== 0) {
            console.error(`FAIL vercel env add ${key} ${target}`);
            failures += 1;
        } else {
            console.log(`OK set ${key} → ${target}`);
        }
    }
}

if (failures) {
    console.error(`\nenv sync completed with ${failures} failure(s)`);
    process.exit(1);
}
console.log("\nenv sync PASS (values not printed)");