#!/usr/bin/env node
/**
 * Production ringtone download acceptance probes (read-only HTTP).
 *
 * Usage:
 *   node scripts/verify-production-ringtone-download.mjs
 *
 * Optional (authenticated E2E when a published catalog ringtone exists):
 *   MDB_PRODUCTION_BASE_URL=https://www.digitalmusicdatabase.com
 *   MDB_PRODUCTION_TEST_EMAIL=...
 *   MDB_PRODUCTION_TEST_PASSWORD=...   (never log)
 *
 * Flow when credentials + catalog present:
 *   marketplace → pick first free/published → POST purchase (free) → POST download android + iphone headers
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_BASE = String(process.env.MDB_PRODUCTION_BASE_URL || "https://www.digitalmusicdatabase.com").replace(/\/$/, "");
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const evidenceDir = join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });

const results = [];
function record(id, status, detail = "") {
    results.push({ id, status, detail });
    console.log(`${status.padEnd(7)} [${id}]${detail ? ` — ${detail}` : ""}`);
}

async function getJson(path) {
    const url = `${PRODUCTION_BASE}${path}`;
    const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "follow" });
    const text = await response.text();
    let body = null;
    try {
        body = JSON.parse(text);
    } catch {
        body = null;
    }
    return { url, status: response.status, body, text: text.slice(0, 200) };
}

async function postJson(path, init = {}) {
    const url = `${PRODUCTION_BASE}${path}`;
    const response = await fetch(url, {
        method: "POST",
        ...init,
        headers: {
            Accept: "application/json",
            ...(init.headers || {}),
        },
    });
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        const body = await response.json().catch(() => ({}));
        return { url, status: response.status, body, headers: response.headers, binary: false };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
        url,
        status: response.status,
        body: null,
        headers: response.headers,
        binary: true,
        byteLength: bytes.byteLength,
        contentType,
        disposition: response.headers.get("content-disposition") || "",
    };
}

async function main() {
    const launch = await getJson("/api/launch/status");
    if (launch.status === 200 && launch.body?.ok === true) {
        record("launch-status", "PASS", `http=${launch.status}`);
    } else {
        record("launch-status", "FAIL", `http=${launch.status}`);
    }

    const market = await getJson("/api/ringtones/marketplace?filter=all&sort=newest&pageSize=24");
    if (market.status !== 200) {
        record("marketplace-http", "FAIL", `http=${market.status}`);
    } else {
        const body = market.body || {};
        const total = Number(body.total) || 0;
        const locked = body.publicBetaPaidPurchaseLocked === true;
        if (locked) record("beta-paid-lock", "PASS", "publicBetaPaidPurchaseLocked=true");
        else record("beta-paid-lock", "WARN", "publicBetaPaidPurchaseLocked not true");
        record("marketplace-catalog", total > 0 ? "PASS" : "BLOCKED", `total=${total}`);
    }

    const unauthDownload = await postJson("/api/ringtones/00000000-0000-0000-0000-000000000001/download", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "00000000-0000-0000-0000-000000000002", deviceType: "android" }),
    });
    if (unauthDownload.status === 401 || unauthDownload.status === 403) {
        record("download-unauth-gate", "PASS", `http=${unauthDownload.status}`);
    } else {
        record("download-unauth-gate", "FAIL", `http=${unauthDownload.status}`);
    }

    const email = String(process.env.MDB_PRODUCTION_TEST_EMAIL || "").trim();
    const password = String(process.env.MDB_PRODUCTION_TEST_PASSWORD || "").trim();
    const anonKey = String(process.env.MDB_PRODUCTION_SUPABASE_ANON_KEY || "").trim();
    const supabaseUrl = String(process.env.MDB_PRODUCTION_SUPABASE_URL || `https://${PRODUCTION_REF}.supabase.co`).trim();

    if (!email || !password) {
        record("authenticated-download-e2e", "BLOCKED", "set MDB_PRODUCTION_TEST_EMAIL/PASSWORD for live download bytes test");
        writeEvidence();
        exitWithSummary();
        return;
    }
    if (!anonKey) {
        record("authenticated-download-e2e", "BLOCKED", "set MDB_PRODUCTION_SUPABASE_ANON_KEY (Production anon, not logged)");
        writeEvidence();
        exitWithSummary();
        return;
    }

    const total = Number(market.body?.total) || 0;
    const catalog = Array.isArray(market.body?.ringtones) ? market.body.ringtones : [];
    if (total < 1 || !catalog.length) {
        record("authenticated-download-e2e", "BLOCKED", "no published marketplace ringtones on Production — publish on www first");
        writeEvidence();
        exitWithSummary();
        return;
    }

    const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError || !signIn.session?.access_token || !signIn.user?.id) {
        record("authenticated-download-e2e", "FAIL", "Production sign-in failed");
        writeEvidence();
        exitWithSummary();
        return;
    }
    const userId = signIn.user.id;
    const token = signIn.session.access_token;
    record("production-sign-in", "PASS", `user_prefix=${userId.slice(0, 8)}…`);

    const target = catalog.find((row) => Number(row.price_cents) === 0) || catalog[0];
    const ringtoneId = String(target.id);

    const purchase = await postJson(`/api/ringtones/${ringtoneId}/purchase`, {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, ringtoneId }),
    });
    const purchaseBody = purchase.body || {};
    if (purchase.status !== 200) {
        record("free-acquisition", purchase.status === 403 ? "WARN" : "FAIL", `http=${purchase.status} code=${purchaseBody.code || ""}`);
    } else {
        record("free-acquisition", "PASS", `http=${purchase.status} state=${purchaseBody.state || purchaseBody.ok || "ok"}`);
    }

    for (const deviceType of ["android", "iphone"]) {
        const dl = await postJson(`/api/ringtones/${ringtoneId}/download`, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ userId, deviceType }),
        });
        if (dl.binary && dl.status === 200 && dl.byteLength > 512) {
            const hasAttachment = /attachment/i.test(dl.disposition);
            record(`download-${deviceType}-bytes`, hasAttachment ? "PASS" : "WARN", `bytes=${dl.byteLength} type=${dl.contentType}`);
        } else if (dl.status === 403 && dl.body?.code === "PURCHASE_REQUIRED") {
            record(`download-${deviceType}-bytes`, "FAIL", "PURCHASE_REQUIRED — run free acquisition first");
        } else {
            record(`download-${deviceType}-bytes`, "FAIL", `http=${dl.status} code=${dl.body?.code || (dl.binary ? "binary" : "")}`);
        }
    }

    writeEvidence();
    exitWithSummary();
}

function writeEvidence() {
    writeFileSync(
        join(evidenceDir, "production-ringtone-download-evidence.json"),
        JSON.stringify({ productionBase: PRODUCTION_BASE, checkedAt: new Date().toISOString(), results }, null, 2),
    );
}

function exitWithSummary() {
    const fails = results.filter((r) => r.status === "FAIL");
    const blocked = results.filter((r) => r.status === "BLOCKED");
    console.log(`\nPRODUCTION_RINGTONE_DOWNLOAD_FAILS=${fails.length}`);
    console.log(`PRODUCTION_RINGTONE_DOWNLOAD_BLOCKED=${blocked.length}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});