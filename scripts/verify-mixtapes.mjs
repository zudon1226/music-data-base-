/**
 * Local Mixtapes verification bundle (no staging credentials or browser required).
 * Usage: npm run verify:mixtapes
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const STEPS = [
    { name: "Mixtapes Phase 1", rel: "scripts/verify-mixtape-phase1.mjs" },
    { name: "Mixtapes Phase 1 security", rel: "scripts/verify-mixtape-phase1-security.mjs" },
    { name: "Mixtapes Phase 2", rel: "scripts/verify-mixtape-phase2.mjs" },
    { name: "Mixtapes API tests", rel: "lib/mixtape-api.test.mjs" },
    { name: "Mixtapes validation tests", rel: "lib/mixtape-validation.test.mjs" },
    { name: "Mixtapes play-threshold tests", rel: "lib/mixtape-play-threshold.test.mjs" },
    { name: "Mixtapes playback-engagement tests", rel: "lib/mixtape-playback-engagement.test.mjs" },
    { name: "Mixtapes Phase 2 UI tests", rel: "lib/mixtape-phase2-ui.test.mjs" },
    { name: "Mixtapes Studio catalog tests", rel: "lib/mixtape-studio-catalog.test.mjs" },
];

for (const step of STEPS) {
    const scriptPath = join(root, step.rel);
    if (!existsSync(scriptPath)) {
        console.error(`FAIL missing required test file: ${step.rel}`);
        process.exit(1);
    }
    console.log(`\n>>> RUN ${step.name} — ${step.rel}`);
    const result = spawnSync(process.execPath, [scriptPath], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
    });
    if (result.error) {
        console.error(`FAIL ${step.name} — ${result.error.message}`);
        process.exit(1);
    }
    if (result.status !== 0) {
        console.error(`\nFAIL ${step.name} (exit ${result.status ?? 1})`);
        process.exit(result.status ?? 1);
    }
    console.log(`PASS ${step.name}`);
}

console.log(`\nPASS verify:mixtapes (${STEPS.length}/${STEPS.length} steps)`);
process.exit(0);