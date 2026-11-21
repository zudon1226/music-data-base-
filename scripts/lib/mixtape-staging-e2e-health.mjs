/**
 * Dev-server readiness between sequential staging E2E scripts.
 */

const DEFAULT_BASE = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");

/**
 * @param {string} [baseUrl]
 * @param {{ timeoutMs?: number; label?: string }} [options]
 */
export async function waitForStagingDevReady(baseUrl = DEFAULT_BASE, options = {}) {
    const timeoutMs = Math.max(5_000, Number(options.timeoutMs) || 120_000);
    const label = options.label || "staging dev";
    const deadline = Date.now() + timeoutMs;
  const delays = [0, 500, 1_000, 2_000, 3_000, 5_000];
    let attempt = 0;
    while (Date.now() < deadline) {
        const delay = delays[Math.min(attempt, delays.length - 1)];
        if (delay) await new Promise((r) => setTimeout(r, delay));
        attempt += 1;
        const controller = new AbortController();
        const tick = setTimeout(() => controller.abort(), Math.min(15_000, deadline - Date.now()));
        try {
            const start = Date.now();
            const response = await fetch(`${baseUrl}/`, {
                redirect: "follow",
                signal: controller.signal,
            });
            const ms = Date.now() - start;
            if (response.ok) {
                return { ok: true, status: response.status, ms, label };
            }
        }
        catch {
            // retry until deadline
        }
        finally {
            clearTimeout(tick);
        }
    }
    return { ok: false, status: 0, ms: 0, label };
}

export function formatStepDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.round(ms / 1000);
    if (sec < 120) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${min}m${rem}s`;
}