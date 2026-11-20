/**
 * Load ignored local E2E credentials when env vars are unset (never logs values).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ALLOWED_KEYS = new Set([
    "MDB_MIXTAPE_E2E_BASE_URL",
    "MDB_MIXTAPE_E2E_EMAIL",
    "MDB_MIXTAPE_E2E_PASSWORD",
    "MDB_MIXTAPE_E2E_EXPECTED_PROJECT_REF",
]);

export function loadMixtapeStagingE2eCredentialsFromFile() {
    const credsPath = join(root, "tmp-mixtape-approved-e2e", "staging-artist-credentials.env");
    if (!existsSync(credsPath)) return { loaded: false, path: credsPath };
    let loadedCount = 0;
    for (const line of readFileSync(credsPath, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m || !ALLOWED_KEYS.has(m[1])) continue;
        if (!process.env[m[1]]) {
            process.env[m[1]] = m[2].trim();
            loadedCount += 1;
        }
    }
    return { loaded: loadedCount > 0, path: credsPath, loadedCount };
}

export function resolveMixtapeE2eCredentialPath() {
    return join(root, "tmp-mixtape-approved-e2e", "staging-artist-credentials.env");
}