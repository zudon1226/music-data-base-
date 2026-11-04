/**
 * Detach Preview from shared Production Supabase env vars and attach staging values.
 * Does not print API keys. Requires: Supabase CLI auth, Vercel CLI auth, linked project.
 *
 * Usage: node scripts/sync-vercel-preview-supabase-staging.mjs
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

const SHARED_NAMES = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
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

function fetchStagingLegacyKeys() {
    const raw = run(
        `npx supabase projects api-keys --project-ref ${STAGING_REF} --reveal -o json`,
    );
    const start = raw.indexOf("[");
    if (start < 0) {
        throw new Error("Could not parse Supabase api-keys response.");
    }
    const list = JSON.parse(raw.slice(start));
    const anon = list.find((row) => row.type === "legacy" && row.name === "anon");
    const service = list.find((row) => row.type === "legacy" && row.name === "service_role");
    if (!anon?.api_key?.startsWith("eyJ")) {
        throw new Error("Missing staging legacy anon JWT (eyJ…) from Supabase api-keys.");
    }
    if (!service?.api_key?.startsWith("eyJ")) {
        throw new Error("Missing staging legacy service_role JWT (eyJ…) from Supabase api-keys.");
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

function addPreviewVar(name, value) {
    const isPublic = name.startsWith("NEXT_PUBLIC_");
    const flags = [
        `--environment preview`,
        "--yes",
        isPublic ? "--no-sensitive" : "--sensitive",
    ].join(" ");
    run(`npx vercel env add ${name} ${flags}`, value);
    console.log(`OK added Preview ${isPublic ? "Config" : "Secret"}: ${name}`);
}

function main() {
    if (STAGING_REF === PRODUCTION_REF) {
        throw new Error("Staging ref must differ from production ref.");
    }

    const { anonKey, serviceRoleKey } = fetchStagingLegacyKeys();

    for (const name of SHARED_NAMES) {
        removePreviewScope(name);
    }

    addPreviewVar("NEXT_PUBLIC_SUPABASE_URL", STAGING_URL);
    addPreviewVar("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey);
    addPreviewVar("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);

    console.log("DONE sync-vercel-preview-supabase-staging");
    console.log(`Staging ref: ${STAGING_REF} (Preview only)`);
    console.log(`Production ref unchanged on Production scope: ${PRODUCTION_REF}`);
}

main();
