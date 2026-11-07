/**
 * Configure Vercel Preview to use production Supabase for PWA / existing-user auth QA.
 * Does not print API keys. Does not modify Production Supabase or Production Vercel scope.
 *
 * Usage: node scripts/sync-vercel-preview-pwa-production-auth.mjs
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const PRODUCTION_URL = `https://${PRODUCTION_REF}.supabase.co`;

const SHARED_NAMES = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
];

const STAGING_FLAG_NAMES = [
    "MDB_PREVIEW_SUPABASE_ENABLED",
    "NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED",
];

const PWA_FLAG_NAMES = [
    "MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE",
    "NEXT_PUBLIC_MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE",
];

function run(cmd, input) {
    return execSync(cmd, {
        cwd: root,
        encoding: "utf8",
        stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
        shell: true,
        input,
        env: { ...process.env, npm_config_devdir: undefined },
    });
}

function fetchProductionLegacyKeys() {
    const raw = run(
        `npx supabase projects api-keys --project-ref ${PRODUCTION_REF} --reveal -o json`,
    );
    const start = raw.indexOf("[");
    if (start < 0) {
        throw new Error("Could not parse Supabase api-keys response.");
    }
    const list = JSON.parse(raw.slice(start));
    const anon = list.find((row) => row.type === "legacy" && row.name === "anon");
    const service = list.find((row) => row.type === "legacy" && row.name === "service_role");
    if (!anon?.api_key?.startsWith("eyJ")) {
        throw new Error("Missing production legacy anon JWT (eyJ…) from Supabase api-keys.");
    }
    if (!service?.api_key?.startsWith("eyJ")) {
        throw new Error("Missing production legacy service_role JWT (eyJ…) from Supabase api-keys.");
    }
    return { anonKey: anon.api_key, serviceRoleKey: service.api_key };
}

function removePreviewScope(name) {
    try {
        run(`npx vercel env remove ${name} --environment preview --yes`);
        console.log(`OK removed Preview scope: ${name}`);
    }
    catch (error) {
        const msg = `${error.stderr || ""}${error.stdout || ""}${error.message || error}`;
        if (/not found|does not exist|ENOENT|env_not_found/i.test(msg)) {
            console.log(`SKIP Preview remove (not attached): ${name}`);
            return;
        }
        throw error;
    }
}

function addPreviewVar(name, value, sensitive) {
    const flags = [
        "--environment",
        "preview",
        "--yes",
        sensitive ? "--sensitive" : "--no-sensitive",
    ].join(" ");
    run(`npx vercel env add ${name} ${flags}`, value);
    console.log(`OK added Preview: ${name}`);
}

function main() {
    const { anonKey, serviceRoleKey } = fetchProductionLegacyKeys();

    for (const name of [...SHARED_NAMES, ...STAGING_FLAG_NAMES, ...PWA_FLAG_NAMES]) {
        removePreviewScope(name);
    }

    addPreviewVar("NEXT_PUBLIC_SUPABASE_URL", PRODUCTION_URL, false);
    addPreviewVar("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey, false);
    addPreviewVar("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey, true);
    addPreviewVar("NEXT_PUBLIC_MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE", "1", false);
    addPreviewVar("MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE", "1", false);

    console.log("DONE sync-vercel-preview-pwa-production-auth");
    console.log(`Preview uses production Supabase ref ${PRODUCTION_REF} (Preview Vercel scope only).`);
    console.log("Redeploy the Preview branch after this sync.");
}

main();
