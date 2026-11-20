/**
 * Sequential staging acceptance (read-only staging-live + HTTP/browser E2E).
 * Usage: npm run verify:mixtapes:staging-acceptance
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const STEPS = [
    { name: "Mixtapes staging live", script: "scripts/verify-mixtape-phase1-staging-live.mjs" },
    { name: "Mixtapes playback auth staging", script: "scripts/verify-mixtape-playback-auth-staging.mjs" },
    { name: "Mixtapes browser engagement", script: "scripts/verify-mixtape-browser-playback-engagement.mjs" },
    { name: "Mixtapes approved E2E", script: "scripts/verify-mixtape-approved-staging-e2e.mjs" },
];

for (const step of STEPS) {
    const scriptPath = join(root, step.script);
    if (!existsSync(scriptPath)) {
        console.error(`FAIL missing script: ${step.script}`);
        process.exit(1);
    }
    console.log(`\n>>> RUN ${step.name} — ${step.script}`);
    const result = spawnSync(process.execPath, [scriptPath], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
    });
    if (result.status !== 0) {
        console.error(`\nFAIL ${step.name} (exit ${result.status ?? 1})`);
        process.exit(result.status ?? 1);
    }
    console.log(`PASS ${step.name}`);
}

console.log(`\nPASS verify:mixtapes:staging-acceptance (${STEPS.length}/${STEPS.length})`);