/**
 * Staging mixtape report moderation lifecycle + auth matrix (API + optional browser).
 * Credentials: .env.staging.local + tmp mixtape artist creds (never logged).
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const BASE_URL = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const OWNER_EMAIL = "zudon1226@gmail.com";
const runToken = randomBytes(4).toString("hex");
const evidenceDir = join(root, "tmp-mixtape-moderation-e2e");
mkdirSync(evidenceDir, { recursive: true });

const results = [];

function record(step, status, detail = "") {
    results.push({ step, status, detail });
    const label = status === "pass" ? "PASS" : status === "blocked" ? "BLOCKED" : "FAIL";
    console.log(`${label} ${step}${detail ? ` — ${detail}` : ""}`);
}

function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function stagingRef(url) {
    const match = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return match ? match[1].toLowerCase() : "";
}

async function ownerSession(staging) {
    const anon = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER_EMAIL });
    if (link.error || !link.data?.properties?.hashed_token) {
        throw new Error("Platform owner magic link could not be generated.");
    }
    const verified = await anon.auth.verifyOtp({
        token_hash: link.data.properties.hashed_token,
        type: "magiclink",
    });
    return verified.data.session;
}

async function creatorSession(staging) {
    loadMixtapeStagingE2eCredentialsFromFile();
    const email = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
    const password = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
    if (!email || !password) {
        return null;
    }
    const anon = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await anon.auth.signInWithPassword({ email, password });
    return login.data.session;
}

async function apiJson(path, init = {}) {
    const response = await fetch(`${BASE_URL}${path}`, init);
    const body = await response.json().catch(() => ({}));
    return { response, body };
}

async function main() {
    const staging = parseEnvFile(join(root, ".env.staging.local"));
    const ref = stagingRef(staging.NEXT_PUBLIC_SUPABASE_URL);
    if (ref !== STAGING_REF || ref === PRODUCTION_REF) {
        record("staging identity", "fail", `ref=${ref || "missing"}`);
        process.exit(1);
    }
    record("staging identity", "pass", `ref=${ref}`);

    let owner;
    let creator;
    try {
        owner = await ownerSession(staging);
        record("platform owner session", owner?.access_token ? "pass" : "fail");
        creator = await creatorSession(staging);
        record("approved creator session", creator?.access_token ? "pass" : "blocked", "credentials optional for browser-only");
    }
    catch (error) {
        record("platform owner session", "fail", error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    const ownerId = owner.user.id;
    const adminHeaders = (userId, token) => ({
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    });

    const anonGet = await apiJson("/api/mixtapes/reports/moderation");
    record("unauthenticated GET", anonGet.response.status === 401 ? "pass" : "fail", String(anonGet.response.status));

    const anonPatch = await apiJson(`/api/mixtapes/reports/moderation/${randomUUID()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: ownerId, status: "resolved" }),
    });
    record("unauthenticated PATCH", anonPatch.response.status === 401 ? "pass" : "fail", String(anonPatch.response.status));

    if (creator?.access_token) {
        const creatorGet = await apiJson(
            `/api/mixtapes/reports/moderation?userId=${encodeURIComponent(creator.user.id)}`,
            { headers: { Authorization: `Bearer ${creator.access_token}` } },
        );
        record("creator GET denied", creatorGet.response.status === 403 ? "pass" : "fail", String(creatorGet.response.status));

        const creatorPatch = await apiJson(`/api/mixtapes/reports/moderation/${randomUUID()}`, {
            method: "PATCH",
            headers: adminHeaders(creator.user.id, creator.access_token),
            body: JSON.stringify({
                userId: creator.user.id,
                id: randomUUID(),
                status: "resolved",
                reviewed_by: randomUUID(),
            }),
        });
        record("creator PATCH denied", creatorPatch.response.status === 403 ? "pass" : "fail", String(creatorPatch.response.status));
    }
    else {
        record("creator GET denied", "blocked", "no creator creds");
        record("creator PATCH denied", "blocked", "no creator creds");
    }

    const adminList = await apiJson(
        `/api/mixtapes/reports/moderation?userId=${encodeURIComponent(ownerId)}`,
        { headers: { Authorization: `Bearer ${owner.access_token}` } },
    );
    record("platform admin GET", adminList.response.ok ? "pass" : "fail", String(adminList.response.status));

    if (!creator?.access_token) {
        record("lifecycle fixtures", "blocked", "creator session required for report submission");
        writeFileSync(join(evidenceDir, "report.json"), JSON.stringify({ results }, null, 2));
        process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
    }

    const service = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const mixtapePick = await service
        .from("mixtapes")
        .select("id,title,status,user_id")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!mixtapePick.data?.id) {
        record("fixture mixtape", "fail", "no published mixtape");
        process.exit(1);
    }
    const mixtapeId = mixtapePick.data.id;
    const mixtapeStatusBefore = mixtapePick.data.status;
    record("fixture mixtape", "pass", `id=${mixtapeId.slice(0, 8)} status=${mixtapeStatusBefore}`);

    async function submitReport(detailsSuffix) {
        const res = await apiJson("/api/mixtapes/reports", {
            method: "POST",
            headers: adminHeaders(creator.user.id, creator.access_token),
            body: JSON.stringify({
                userId: creator.user.id,
                mixtapeId,
                reasonCode: "audit",
                details: `mdb-mod-e2e-${runToken}-${detailsSuffix}`,
            }),
        });
        return res;
    }

    const reportA = await submitReport("lifecycle-a");
    const reportB = await submitReport("lifecycle-b");
    record("create report fixtures", reportA.response.status === 201 && reportB.response.status === 201 ? "pass" : "fail");

    const reportAId = String(reportA.body?.report?.id || "");
    const reportBId = String(reportB.body?.report?.id || "");

    const snap = async (id) => {
        const row = await service.from("mixtape_reports").select("*").eq("id", id).single();
        return row.data;
    };

    const metaA0 = await snap(reportAId);
    record("report A pending", metaA0?.status === "open" ? "pass" : "fail");

    const patchReview = await apiJson(`/api/mixtapes/reports/moderation/${reportAId}`, {
        method: "PATCH",
        headers: adminHeaders(ownerId, owner.access_token),
        body: JSON.stringify({ userId: ownerId, status: "reviewing" }),
    });
    record("transition open→reviewing", patchReview.response.ok ? "pass" : "fail", String(patchReview.response.status));

    const listReviewing = await apiJson(
        `/api/mixtapes/reports/moderation?userId=${encodeURIComponent(ownerId)}&status=reviewing`,
        { headers: { Authorization: `Bearer ${owner.access_token}` } },
    );
    const inReview = (listReviewing.body.reports || []).some((r) => r.id === reportAId);
    record("queue under review", inReview ? "pass" : "fail");

    const patchResolve = await apiJson(`/api/mixtapes/reports/moderation/${reportAId}`, {
        method: "PATCH",
        headers: adminHeaders(ownerId, owner.access_token),
        body: JSON.stringify({
            userId: ownerId,
            status: "resolved",
            reviewed_by: creator.user.id,
        }),
    });
    const metaA1 = await snap(reportAId);
    const reviewedByOk = metaA1?.reviewed_by === ownerId;
    record(
        "transition reviewing→resolved",
        patchResolve.response.ok && reviewedByOk && Boolean(metaA1?.reviewed_at) ? "pass" : "fail",
        `reviewed_by=${metaA1?.reviewed_by === ownerId ? "owner" : "mismatch"}`,
    );
    record(
        "client moderator identity ignored",
        metaA1?.reviewed_by !== creator.user.id ? "pass" : "fail",
    );

    const preserved =
        metaA1?.reporter_user_id === metaA0?.reporter_user_id
        && metaA1?.mixtape_id === metaA0?.mixtape_id
        && metaA1?.reason_code === metaA0?.reason_code
        && metaA1?.details === metaA0?.details;
    record("report metadata preserved", preserved ? "pass" : "fail");

    const patchDismiss = await apiJson(`/api/mixtapes/reports/moderation/${reportBId}`, {
        method: "PATCH",
        headers: adminHeaders(ownerId, owner.access_token),
        body: JSON.stringify({ userId: ownerId, status: "reviewing" }),
    });
    await apiJson(`/api/mixtapes/reports/moderation/${reportBId}`, {
        method: "PATCH",
        headers: adminHeaders(ownerId, owner.access_token),
        body: JSON.stringify({ userId: ownerId, status: "dismissed" }),
    });
    const metaB = await snap(reportBId);
    record("report B dismissed", metaB?.status === "dismissed" ? "pass" : "fail");

    const patchReopen = await apiJson(`/api/mixtapes/reports/moderation/${reportAId}`, {
        method: "PATCH",
        headers: adminHeaders(ownerId, owner.access_token),
        body: JSON.stringify({ userId: ownerId, status: "open" }),
    });
    const metaA2 = await snap(reportAId);
    record("reopen resolved→open", patchReopen.response.ok && metaA2?.status === "open" ? "pass" : "fail");

    const invalidStatus = await apiJson(`/api/mixtapes/reports/moderation/${reportBId}`, {
        method: "PATCH",
        headers: adminHeaders(ownerId, owner.access_token),
        body: JSON.stringify({ userId: ownerId, status: "removed" }),
    });
    record("invalid status rejected", invalidStatus.response.status === 400 ? "pass" : "fail", String(invalidStatus.response.status));

    const badTransition = await apiJson(`/api/mixtapes/reports/moderation/${reportBId}`, {
        method: "PATCH",
        headers: adminHeaders(ownerId, owner.access_token),
        body: JSON.stringify({ userId: ownerId, status: "resolved" }),
    });
    record(
        "invalid transition conflict",
        badTransition.response.status === 409 ? "pass" : "fail",
        String(badTransition.response.status),
    );

    const mixtapeAfter = await service.from("mixtapes").select("id,status").eq("id", mixtapeId).single();
    record(
        "mixtape not unpublished",
        mixtapeAfter.data?.status === mixtapeStatusBefore ? "pass" : "fail",
        `before=${mixtapeStatusBefore} after=${mixtapeAfter.data?.status}`,
    );

    const reload = await apiJson(
        `/api/mixtapes/reports/moderation/${reportAId}?userId=${encodeURIComponent(ownerId)}`,
        { headers: { Authorization: `Bearer ${owner.access_token}` } },
    );
    record("persisted status after reload", reload.body?.report?.status === "open" ? "pass" : "fail");

    if (process.env.MDB_MIXTAPE_MOD_SKIP_BROWSER === "1") {
        record("browser Platform Control", "blocked", "MDB_MIXTAPE_MOD_SKIP_BROWSER=1");
    }
    else {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const storageKey = `sb-${ref}-auth-token`;
        await context.addInitScript(({ key, payload }) => {
            window.localStorage.setItem(key, JSON.stringify(payload));
        }, {
            key: storageKey,
            payload: {
                access_token: owner.access_token,
                refresh_token: owner.refresh_token,
                expires_at: owner.expires_at,
                expires_in: owner.expires_in,
                token_type: owner.token_type,
                user: owner.user,
            },
        });
        const page = await context.newPage();
        try {
            await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
            await page.waitForSelector('main.zml-app[data-roles-ready="true"]', { timeout: 120_000 });
            await page.waitForFunction(
                (ref) => Boolean(window.localStorage.getItem(`sb-${ref}-auth-token`)),
                STAGING_REF,
                { timeout: 60_000 },
            );
            const platformControl = page.locator('button[data-nav-view="Platform Control Center"]').first();
            if (await platformControl.count()) {
                await platformControl.click({ timeout: 30_000 });
            }
            else {
                await page.getByRole("button", { name: /Platform Control Center/i }).first().click({ timeout: 30_000 });
            }
            await page.waitForSelector('main.zml-app[data-active-view="Platform Control Center"]', { timeout: 30_000 });
            const trustHeading = page.getByRole("heading", { name: /Trust And Moderation/i });
            await trustHeading.scrollIntoViewIfNeeded();
            record("browser Trust And Moderation", await trustHeading.isVisible() ? "pass" : "fail");

            const mixtapeQueue = page.locator("[data-mixtape-moderation-queue]");
            await mixtapeQueue.scrollIntoViewIfNeeded();
            record("browser Mixtape Reports section", await mixtapeQueue.isVisible() ? "pass" : "fail");
            await page.screenshot({ path: join(evidenceDir, "platform-control-mixtape-reports.png"), fullPage: true });

            const pendingTab = mixtapeQueue.getByRole("tab", { name: /Pending/i });
            if (await pendingTab.count()) {
                await pendingTab.click();
            }
            const refresh = mixtapeQueue.getByRole("button", { name: /^Refresh$/i });
            const moderationLoad = page.waitForResponse(
                (response) => response.url().includes("/api/mixtapes/reports/moderation")
                    && response.request().method() === "GET",
                { timeout: 60_000 },
            );
            if (await refresh.count()) {
                await refresh.click();
            }
            const moderationResponse = await moderationLoad.catch(() => null);
            const moderationHttp = moderationResponse?.status() ?? 0;
            await mixtapeQueue.getByText(/Loading mixtape reports|No pending|mdb-mod-e2e|Under review|Resolve/i).first()
                .waitFor({ state: "visible", timeout: 30_000 })
                .catch(() => null);
            record(
                "browser pending queue state",
                moderationHttp === 200 ? "pass" : "fail",
                `http=${moderationHttp}`,
            );
            const moderationButtons = mixtapeQueue.getByRole("button", { name: /Under review|Resolve|Dismiss/i });
            const reportRow = mixtapeQueue.getByText(`mdb-mod-e2e-${runToken}`);
            const hasFixture = (await reportRow.count()) > 0;
            const hasModActions = (await moderationButtons.count()) > 0;
            const hasRefresh = (await refresh.count()) > 0;
            const pendingCountMatch = (await pendingTab.innerText().catch(() => "")).match(/\((\d+)\)/);
            const pendingCount = pendingCountMatch ? Number(pendingCountMatch[1]) : 0;
            const queueReady = moderationHttp === 200 && (hasModActions || hasFixture || pendingCount > 0);
            record(
                "browser admin moderation actions",
                hasRefresh && queueReady ? "pass" : "fail",
                hasFixture
                    ? "fixture visible"
                    : hasModActions
                        ? `actions=${await moderationButtons.count()}`
                        : `pendingCount=${pendingCount} http=${moderationHttp}`,
            );
        }
        catch (error) {
            record("browser Platform Control", "fail", error instanceof Error ? error.message : String(error));
            await page.screenshot({ path: join(evidenceDir, "platform-control-browser-fail.png"), fullPage: true }).catch(() => null);
        }
        finally {
            await browser.close();
        }
    }

    for (const id of [reportAId, reportBId]) {
        await service
            .from("mixtape_reports")
            .delete()
            .eq("id", id)
            .like("details", `mdb-mod-e2e-${runToken}%`);
    }
    const deletedA = !(await snap(reportAId));
    const deletedB = !(await snap(reportBId));
    record("cleanup test reports", deletedA && deletedB ? "pass" : "fail");

    writeFileSync(join(evidenceDir, "report.json"), JSON.stringify({ results, runToken, mixtapeId }, null, 2));
    const fails = results.filter((r) => r.status === "fail");
    if (fails.length) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});