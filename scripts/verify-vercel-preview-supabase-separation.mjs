/**
 * Verify Vercel env scopes for Preview vs Production Supabase separation (no secret values).
 * Usage: node scripts/verify-vercel-preview-supabase-separation.mjs
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";

const REQUIRED_PREVIEW = [
    "MDB_PREVIEW_SUPABASE_ENABLED",
    "NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
];

const PREVIEW_ONLY_FLAGS = new Set([
    "MDB_PREVIEW_SUPABASE_ENABLED",
    "NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED",
]);

function run(cmd) {
    return execSync(cmd, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
    });
}

function parseEnvTable(output) {
    const rows = [];
    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("name ") || trimmed.startsWith("-") || trimmed.startsWith(">")) {
            continue;
        }
        if (trimmed.startsWith("Next steps:")) break;
        const match = trimmed.match(
            /^(\S+)\s+.+\s+(Config|Secret)\s+(Production(?:,\s*Preview)?|Preview(?:,\s*Production)?|Development(?:,\s*Preview)?|Production|Preview|Development(?:,\s*Production)?)\s+/,
        );
        if (!match) continue;
        rows.push({ name: match[1], type: match[2], environments: match[3].replace(/\s+/g, "") });
    }
    return rows;
}

function envSet(label) {
    return label.split(",").map((part) => part.trim()).filter(Boolean);
}

function record(ok, label, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

const raw = run("npx vercel env ls");
const rows = parseEnvTable(raw);

for (const name of REQUIRED_PREVIEW) {
    const matches = rows.filter((row) => row.name === name);
    if (!matches.length) {
        record(false, `${name} present on Vercel`);
        continue;
    }
    const previewRows = matches.filter((row) => envSet(row.environments).includes("Preview"));
    const productionRows = matches.filter((row) => envSet(row.environments).includes("Production"));
    record(previewRows.length >= 1, `${name} has Preview-scoped entry`);
    if (PREVIEW_ONLY_FLAGS.has(name)) {
        record(
            !productionRows.length,
            `${name} not on Production`,
            productionRows.length ? "found on Production" : "",
        );
        continue;
    }
    record(
        productionRows.length >= 1 && !productionRows.some((row) => envSet(row.environments).includes("Preview")),
        `${name} Production-only row (no Production+Preview combined)`,
        matches.map((m) => m.environments).join("; ") || "none",
    );
    record(
        previewRows.length >= 1 && !previewRows.some((row) => envSet(row.environments).includes("Production")),
        `${name} Preview-only row`,
    );
}

for (const flagName of PREVIEW_ONLY_FLAGS) {
    const flagRows = rows.filter((row) => row.name === flagName);
    record(
        flagRows.some((row) => envSet(row.environments).length === 1 && row.environments.includes("Preview")),
        `${flagName} scoped to Preview only`,
    );
}

console.log("\nRef expectations (runtime, not read from Vercel secrets):");
console.log(`  Production Supabase ref: ${PRODUCTION_REF}`);
console.log(`  Preview staging ref:     ${STAGING_REF}`);
console.log("  After deploy, confirm Preview bundle host ends with jzlegcbotqfzevtczwhx.supabase.co");

if (process.exitCode) {
    console.error("\nVerification failed.");
}
else {
    console.log("\nVerification passed (scopes only; redeploy Preview to apply).");
}
