/**
 * Start Next.js against local Supabase and run guarded /api/audio + /api/video-playback probes.
 * Usage: node scripts/run-guarded-app-probes.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalSupabaseStatusEnv } from "./_isolated-supabase-local-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const APP_BASE = String(process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const PORT = new URL(APP_BASE).port || "3000";

async function waitForHttp(url, attempts = 120) {
    for (let i = 0; i < attempts; i += 1) {
        try {
            const response = await fetch(url, { redirect: "manual" });
            if (response.status >= 200 && response.status < 500) return true;
        }
        catch {
            // not ready
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    return false;
}

console.log("guarded probes: reading local supabase status");
const status = readLocalSupabaseStatusEnv();
console.log("guarded probes: local supabase status read");
const apiUrl = String(status.API_URL || "http://127.0.0.1:54321").replace(/\/+$/, "");
if (apiUrl.includes(PRODUCTION_REF)) {
    console.error(`Blocked: local API URL references production ref ${PRODUCTION_REF}.`);
    process.exit(1);
}

const childEnv = {
    ...process.env,
    MDB_ISOLATED_SUPABASE_E2E: "1",
    MDB_ISOLATED_PROBE_APP: "1",
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY || "",
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY || "",
    APP_BASE_URL: APP_BASE,
};

if (!childEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || !childEnv.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Local Supabase keys missing. Run npx supabase start first.");
    process.exit(1);
}

console.log(`guarded probes: starting next on ${APP_BASE}`);
const next = spawn(`npx next dev -p ${PORT}`, {
    cwd: root,
    env: childEnv,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
});

let nextLog = "";
next.stdout?.on("data", (chunk) => { nextLog = `${nextLog}${chunk}`.slice(-4000); });
next.stderr?.on("data", (chunk) => { nextLog = `${nextLog}${chunk}`.slice(-4000); });

const killNext = () => {
    if (!next.pid) return;
    if (process.platform === "win32") {
        try {
            execFileSync("taskkill", ["/PID", String(next.pid), "/T", "/F"], { stdio: "ignore" });
        }
        catch {
            // already exited
        }
        return;
    }
    if (!next.killed) {
        next.kill("SIGTERM");
    }
};
process.on("exit", killNext);
process.on("SIGINT", () => {
    killNext();
    process.exit(130);
});

console.log("guarded probes: waiting for next");
const ready = await waitForHttp(`${APP_BASE}/api/launch/status`);
if (!ready) {
    console.error("Next.js did not become ready on", APP_BASE);
    console.error(nextLog.slice(-1200));
    killNext();
    process.exit(1);
}

console.log("guarded probes: next is ready, starting probe matrix");
const probe = spawn("node", ["scripts/probe-isolated-storage-moderation.mjs"], {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
    shell: true,
});

probe.on("exit", (code) => {
    killNext();
    process.exit(code ?? 1);
});
