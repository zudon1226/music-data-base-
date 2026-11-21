/**
 * Sequential staging acceptance (read-only staging-live + HTTP/browser E2E).
 * Usage: npm run verify:mixtapes:staging-acceptance
 * Prerequisites for mobile step: http://localhost:3003 with staging env, Playwright browsers,
 * MDB_MIXTAPE_E2E_* credentials. Set MDB_SKIP_MIXTAPE_MOBILE_E2E=1 to skip mobile.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    formatStepDuration,
    waitForStagingDevReady,
} from "./lib/mixtape-staging-e2e-health.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const STEPS = [
    { name: "Mixtapes staging live", script: "scripts/verify-mixtape-phase1-staging-live.mjs" },
    { name: "Mixtapes playback auth staging", script: "scripts/verify-mixtape-playback-auth-staging.mjs" },
    { name: "Mixtapes browser engagement", script: "scripts/verify-mixtape-browser-playback-engagement.mjs" },
    { name: "Mixtapes approved E2E", script: "scripts/verify-mixtape-approved-staging-e2e.mjs" },
];
if (!process.env.MDB_SKIP_MIXTAPE_MOBILE_E2E) {
    STEPS.push({
        name: "Mixtapes mobile E2E",
        script: "scripts/verify-mixtapes-mobile.mjs",
    });
}
if (!process.env.MDB_SKIP_MIXTAPE_UPLOAD_VALIDATION_STAGING) {
    STEPS.push({
        name: "Mixtape upload validation staging",
        script: "scripts/verify-mixtape-upload-validation-staging.mjs",
    });
}
if (!process.env.MDB_SKIP_MIXTAPE_COVER_REPLACEMENT_E2E) {
    STEPS.push({
        name: "Mixtape cover replacement E2E",
        script: "scripts/verify-mixtape-cover-replacement-staging-e2e.mjs",
    });
}
if (!process.env.MDB_SKIP_MIXTAPE_LIFECYCLE_E2E) {
    STEPS.push({
        name: "Mixtape publishing lifecycle E2E",
        script: "scripts/verify-mixtape-publishing-lifecycle-staging-e2e.mjs",
    });
}
if (!process.env.MDB_SKIP_MIXTAPE_UPLOAD_RECOVERY_STAGING) {
    STEPS.push({
        name: "Mixtape upload recovery staging",
        script: "scripts/verify-mixtape-upload-recovery-staging.mjs",
    });
}

const BROWSER_HEAVY = new Set([
    "scripts/verify-mixtape-browser-playback-engagement.mjs",
    "scripts/verify-mixtape-approved-staging-e2e.mjs",
    "scripts/verify-mixtapes-mobile.mjs",
    "scripts/verify-mixtape-cover-replacement-staging-e2e.mjs",
    "scripts/verify-mixtape-publishing-lifecycle-staging-e2e.mjs",
    "scripts/verify-mixtape-report-moderation-staging-e2e.mjs",
]);

const timingReport = [];
const evidenceDir = join(root, "tmp-mixtape-staging-acceptance");
mkdirSync(evidenceDir, { recursive: true });

async function main() {
    const acceptanceStarted = Date.now();
    let elapsedBefore = 0;
    for (const step of STEPS) {
    const scriptPath = join(root, step.script);
    if (!existsSync(scriptPath)) {
        console.error(`FAIL missing script: ${step.script}`);
        process.exit(1);
    }
    if (BROWSER_HEAVY.has(step.script) || step.script.includes("lifecycle")) {
        const health = await waitForStagingDevReady(undefined, {
            timeoutMs: 180_000,
            label: `before ${step.name}`,
        });
        console.log(
            health.ok
                ? `READY dev server — ${health.label} http=${health.status} ttfb=${health.ms}ms`
                : `WARN dev server not ready — ${health.label} (continuing; step may fail)`,
        );
        if (!health.ok) {
            timingReport.push({
                step: step.name,
                skippedHealth: true,
            });
        }
    }
    const stepStarted = Date.now();
    console.log(`\n>>> RUN ${step.name} — ${step.script} (t+${formatStepDuration(elapsedBefore)})`);
    const result = spawnSync(process.execPath, [scriptPath], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
    });
    const durationMs = Date.now() - stepStarted;
    timingReport.push({
        step: step.name,
        script: step.script,
        durationMs,
        exitCode: result.status ?? 1,
    });
    console.log(`TIMING ${step.name} — ${formatStepDuration(durationMs)}`);
    if (result.status !== 0) {
        writeFileSync(join(evidenceDir, "timing-report.json"), JSON.stringify({
            failedStep: step.name,
            timingReport,
            generatedAt: new Date().toISOString(),
        }, null, 2));
        console.error(`\nFAIL ${step.name} (exit ${result.status ?? 1})`);
        process.exit(result.status ?? 1);
    }
    console.log(`PASS ${step.name}`);
        elapsedBefore += durationMs;
    }

    writeFileSync(join(evidenceDir, "timing-report.json"), JSON.stringify({
        totalMs: Date.now() - acceptanceStarted,
        timingReport,
        generatedAt: new Date().toISOString(),
    }, null, 2));

    console.log(`\nPASS verify:mixtapes:staging-acceptance (${STEPS.length}/${STEPS.length})`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});