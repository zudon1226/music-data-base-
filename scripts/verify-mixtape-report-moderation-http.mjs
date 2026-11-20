/**
 * Smoke HTTP auth for mixtape report moderation APIs (no credentials logged).
 * Usage: BASE_URL=http://localhost:3003 node scripts/verify-mixtape-report-moderation-http.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE_URL = (process.env.MDB_MIXTAPE_E2E_BASE_URL || process.env.BASE_URL || "http://localhost:3003").replace(/\/$/, "");

async function expectStatus(path, init, expected) {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, headers: { ...(init?.headers || {}) } });
    assert.equal(response.status, expected, `${init?.method || "GET"} ${path} expected ${expected}`);
}

await expectStatus("/api/mixtapes/reports/moderation", { method: "GET" }, 401);
await expectStatus(`/api/mixtapes/reports/moderation/${randomUUID()}`, { method: "GET" }, 401);
await expectStatus(`/api/mixtapes/reports/moderation/${randomUUID()}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: randomUUID(), status: "resolved" }),
}, 401);

console.log("verify-mixtape-report-moderation-http.mjs: ok");