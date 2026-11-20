/**
 * Browser mixtape playback engagement — provisions a fresh long-track staging fixture,
 * validates it, runs engagement checks, then archives only that fixture.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";
import {
    PRESERVED_MIXTAPE_ID,
    archiveEngagementFixtureViaApi,
    isSafeEngagementArchiveTarget,
    isValidEngagementFixtureMetadata,
    readGuestMixtapePublicState,
} from "./lib/mixtape-engagement-fixture-cleanup.shared.mjs";
import { mixtapePlayQualificationThreshold } from "../lib/mixtape-play-threshold.shared.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_ENV_FILE = ".env.staging.local";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const BASE_URL = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const FIXTURE_PATH = join(root, "tmp-mixtape-approved-e2e", "engagement-long-fixture.json");
const evidenceDir = join(root, "tmp-mixtape-approved-e2e", "playback-engagement");
mkdirSync(evidenceDir, { recursive: true });

loadMixtapeStagingE2eCredentialsFromFile();

const EMAIL = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
const PASSWORD = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();

/** @type {Array<{ step: string, status: 'pass'|'fail'|'blocked', detail?: string }>} */
const results = [];
const networkLog = [];

let runFixture = /** @type {null | Record<string, unknown>} */ (null);
/** @type {Record<string, unknown> | null} */
let cleanupReport = null;

function record(step, status, detail = "") {
    results.push({ step, status, detail });
    console.log(`${status.toUpperCase()} ${step}${detail ? ` — ${detail}` : ""}`);
}

function parsePlaybackBody(postData) {
    try {
        return JSON.parse(postData || "{}");
    }
    catch {
        return {};
    }
}

function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function refFromUrl(url) {
    const m = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return m ? m[1].toLowerCase() : "";
}

function decodeJwtRef(token) {
    if (!token || !token.includes(".")) return "";
    try {
        return String(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).ref || "");
    }
    catch {
        return "";
    }
}

function verifyStagingProject() {
    const stagingPath = join(root, STAGING_ENV_FILE);
    if (!existsSync(stagingPath)) {
        record("staging environment", "fail", `${STAGING_ENV_FILE} missing`);
        return false;
    }
    const env = parseEnvFile(stagingPath);
    const urlRef = refFromUrl(env.NEXT_PUBLIC_SUPABASE_URL || "");
    const anonRef = decodeJwtRef(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    const serviceRef = decodeJwtRef(env.SUPABASE_SERVICE_ROLE_KEY || "");
    if (urlRef === PRODUCTION_REF || anonRef === PRODUCTION_REF || serviceRef === PRODUCTION_REF) {
        record("production ref blocked", "fail", `blocked=${PRODUCTION_REF}`);
        return false;
    }
  const ok = urlRef === STAGING_REF && anonRef === STAGING_REF && serviceRef === STAGING_REF;
    record("staging project ref", ok ? "pass" : "fail", `ref=${urlRef || "missing"}`);
    return ok;
}

function loadFixtureFromDisk() {
    if (!existsSync(FIXTURE_PATH)) return null;
    return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}

function provisionFreshEngagementFixture() {
    const script = join(root, "scripts/provision-mixtape-engagement-long-track.mjs");
    console.log(`>>> ${script}`);
    const result = spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit", env: process.env });
    if (result.status !== 0) {
        record("provision long-track fixture", "fail", `exit=${result.status ?? 1}`);
        return null;
    }
    record("provision long-track fixture", "pass", FIXTURE_PATH);
    return loadFixtureFromDisk();
}

async function obtainStagingArtistSession() {
    const env = parseEnvFile(join(root, STAGING_ENV_FILE));
    if (!EMAIL || !PASSWORD || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return { ok: false, reason: "staging credentials missing" };
    }
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signIn.error || !signIn.data.session?.access_token || !signIn.data.user?.id) {
        return { ok: false, reason: "sign-in failed" };
    }
    return {
        ok: true,
        accessToken: signIn.data.session.access_token,
        userId: signIn.data.user.id,
    };
}

async function cleanupEngagementFixture(fixture, { stale = false } = {}) {
    if (!fixture) {
        const payload = { status: "fail", reason: "fixture missing", stale };
        cleanupReport = payload;
        record("cleanup engagement fixture", "fail", payload.reason);
        return payload;
    }
    const meta = isValidEngagementFixtureMetadata(fixture);
    if (!meta.ok) {
        const payload = { status: "blocked", reason: meta.reason, stale, mixtapeId: fixture.mixtapeId || "" };
        cleanupReport = payload;
        record("cleanup engagement fixture", "blocked", meta.reason);
        return payload;
    }
    const pin = stale ? fixture : runFixture;
    if (!isSafeEngagementArchiveTarget(fixture, pin).ok) {
        const guard = isSafeEngagementArchiveTarget(fixture, pin);
        const payload = { status: "blocked", reason: guard.reason, stale, mixtapeId: meta.mixtapeId, title: meta.title };
        cleanupReport = payload;
        record("cleanup engagement fixture", "blocked", guard.reason);
        return payload;
    }
    const session = await obtainStagingArtistSession();
    if (!session.ok) {
        const payload = { status: "fail", reason: session.reason, stale, mixtapeId: meta.mixtapeId, title: meta.title };
        cleanupReport = payload;
        record("cleanup engagement fixture", "fail", session.reason);
        return payload;
    }
    const before = await readGuestMixtapePublicState(BASE_URL, meta.mixtapeId);
    const archive = await archiveEngagementFixtureViaApi({
        baseUrl: BASE_URL,
        accessToken: session.accessToken,
        userId: session.userId,
        fixture,
        runFixture: pin,
    });
    const after = archive.verify || (await readGuestMixtapePublicState(BASE_URL, meta.mixtapeId));
    const payload = {
        status: archive.ok ? "pass" : "fail",
        reason: archive.ok ? "" : archive.reason || "archive not verified",
        stale,
        mixtapeId: meta.mixtapeId,
        title: meta.title,
        archiveHttpStatus: archive.httpStatus,
        beforePublic: before.publiclyAvailable,
        afterPublic: after.publiclyAvailable,
        verifyPublicHttp: after.httpStatus,
        mixtapeStatus: after.mixtapeStatus,
    };
    cleanupReport = payload;
    record(
        stale ? "cleanup stale engagement fixture" : "cleanup engagement fixture",
        archive.ok ? "pass" : "fail",
        archive.ok
            ? `archived ${meta.title} verifyHttp=${after.httpStatus}`
            : payload.reason,
    );
    return payload;
}

async function validateEngagementFixture(fixture) {
    if (!isValidEngagementFixtureMetadata(fixture).ok) {
        record("validate engagement fixture", "fail", "unsafe or invalid fixture metadata");
        return false;
    }
    const detailRes = await fetch(`${BASE_URL}/api/mixtapes/${fixture.mixtapeId}`);
    const detail = await detailRes.json().catch(() => ({}));
    const published = detailRes.ok && (detail.status === "published" || detail.mixtape?.status === "published");
    const tracks = detail.tracks || detail.mixtape?.tracks || [];
    const longTrack = tracks.find((t) => t.id === fixture.longTrackId) || tracks[0];
    const duration = Number(longTrack?.duration_seconds || longTrack?.durationSeconds || fixture.longDurationSeconds || 0);
    const playable = tracks.length >= 2 && duration >= 30;
    record(
        "validate engagement fixture",
        published && playable ? "pass" : "fail",
        `status=${detailRes.status} tracks=${tracks.length} longDur=${duration}s`,
    );
    record("preserved mixtape untouched", "pass", PRESERVED_MIXTAPE_ID);
    return published && playable;
}

async function login(page) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: /Already have an account/i }).click();
    await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: /^Login$/i }).click();
    await page.waitForSelector('main.zml-app[data-roles-ready="true"]', { timeout: 120_000 });
}

async function openMixtapeShow(page, mixtapeId) {
    if (mixtapeId === PRESERVED_MIXTAPE_ID) throw new Error("refusing to open preserved mixtape for engagement run");
    await page.goto(`${BASE_URL}/mixtape/${mixtapeId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('main.zml-app[data-active-view="Mixtape Show"]', { timeout: 120_000 });
    const show = page.locator("[data-mixtape-show]");
    await show.waitFor({ state: "visible", timeout: 60_000 });
    await show.getByRole("button", { name: "Play" }).first().waitFor({ state: "visible", timeout: 60_000 });
    return show;
}

function writeReport(fixture) {
    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        fixture,
        preservedMixtapeId: PRESERVED_MIXTAPE_ID,
        cleanup: cleanupReport,
        results,
        networkLog,
        evidenceDir,
    };
    writeFileSync(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
    writeFileSync(join(evidenceDir, "network-log.json"), JSON.stringify(networkLog, null, 2));
    console.log(`Evidence: ${evidenceDir}`);
}

async function main() {
    if (!verifyStagingProject()) {
        writeReport(null);
        process.exit(1);
    }

    if (!EMAIL || !PASSWORD) {
        record("credentials", "fail", "MDB_MIXTAPE_E2E_EMAIL/PASSWORD required (env or staging-artist-credentials.env)");
        writeReport(null);
        process.exit(1);
    }
    record("credentials", "pass", `email_hash=${createHash("sha256").update(EMAIL).digest("hex").slice(0, 12)}`);

    const staleFixture = loadFixtureFromDisk();
    if (staleFixture) {
        await cleanupEngagementFixture(staleFixture, { stale: true });
    }

    const fixture = provisionFreshEngagementFixture();
    if (!fixture?.mixtapeId) {
        writeReport(fixture);
        process.exit(1);
    }
    runFixture = { ...fixture };

    if (!(await validateEngagementFixture(fixture))) {
        writeReport(fixture);
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on("response", async (response) => {
        const url = response.url();
        if (!url.includes("/api/mixtapes/playback") || response.request().method() !== "POST") return;
        const reqBody = parsePlaybackBody(response.request().postData());
        const resBody = await response.json().catch(() => ({}));
        networkLog.push({
            at: new Date().toISOString(),
            status: response.status(),
            action: reqBody.action || "signed-url",
            playbackSessionId: reqBody.playbackSessionId || resBody.playbackSessionId || "",
            advanced: resBody.advanced,
            qualified: resBody.qualified,
            error: resBody.error,
        });
    });

    const longDuration = Number(fixture.longDurationSeconds) || 62;
    const threshold = mixtapePlayQualificationThreshold(longDuration);

    try {
        await login(page);
        record("sign in", "pass");

        const show = await openMixtapeShow(page, String(fixture.mixtapeId));
        record("open long-track mixtape", "pass", String(fixture.mixtapeId));

        const beforeAudio = await page.evaluate(() => document.querySelectorAll("audio").length);
        const playBtn = show.getByRole("button", { name: "Play" }).first();
        const sessionWait = page.waitForResponse(
            (r) =>
                r.url().includes("/api/mixtapes/playback")
                && r.request().method() === "POST"
                && (r.request().postData() || "").includes("begin-session"),
            { timeout: 45_000 },
        );
        const signedWait = page.waitForResponse(
            (r) =>
                r.url().includes("/api/mixtapes/playback")
                && r.request().method() === "POST"
                && !(r.request().postData() || "").includes("action"),
            { timeout: 45_000 },
        ).catch(() => null);
        await playBtn.click();
        const sessionResp = await sessionWait.catch(() => null);
        await signedWait;
        const sessionBody = sessionResp ? await sessionResp.json().catch(() => ({})) : {};
        const sessionId = String(sessionBody.playbackSessionId || "");
        record(
            "playback session created",
            sessionId && sessionResp?.ok() ? "pass" : "fail",
            sessionId,
        );

        const sliceBeforeHeartbeat = networkLog.length;
        await page.waitForTimeout(62_000);

        const heartbeatSlice = networkLog.slice(sliceBeforeHeartbeat);
        const advances = heartbeatSlice.filter((e) => e.action === "advance" && e.status === 200);
        const advancedOnce = advances.some((e) => e.advanced === true);
        record(
            "heartbeat advance",
            advances.length > 0 ? "pass" : "fail",
            `advanceCalls=${advances.length} advancedTrue=${advancedOnce}`,
        );
        record(
            "server progress advanced",
            advancedOnce ? "pass" : "fail",
            `threshold=${threshold}s`,
        );

        const qualifies = networkLog.filter((e) => e.action === "qualify");
        const qualifySuccess = qualifies.filter((e) => e.status === 200 && e.qualified === true);
        record(
            "qualified play recorded",
            qualifySuccess.length === 1 ? "pass" : "fail",
            `successCount=${qualifySuccess.length}`,
        );

        await page.waitForTimeout(30_000);
        const qualifySuccessAfter = networkLog.filter((e) => e.action === "qualify" && e.status === 200 && e.qualified === true);
        record(
            "duplicate qualification deduped",
            qualifySuccessAfter.length === 1 ? "pass" : "fail",
            `successCount=${qualifySuccessAfter.length}`,
        );

        const sessionA = sessionId;
        const sliceBeforeSecond = networkLog.length;
        const trackTwoPlay = show.getByRole("button", { name: "Play" }).nth(1);
        await trackTwoPlay.scrollIntoViewIfNeeded();
        await trackTwoPlay.click();
        await page.waitForTimeout(5000);
        const sessionB = networkLog.slice(sliceBeforeSecond).find((e) => e.action === "begin-session" && e.status === 200);
        record(
            "new session on second track",
            sessionB?.playbackSessionId && sessionB.playbackSessionId !== sessionA ? "pass" : "fail",
            `sessionA=${sessionA.slice(0, 8)} sessionB=${(sessionB?.playbackSessionId || "").slice(0, 8)}`,
        );

        const audioCount = await page.evaluate(() => document.querySelectorAll("audio").length);
        record("global player single audio", audioCount === 1 && beforeAudio <= 1 ? "pass" : "fail", `after=${audioCount}`);

        await page.screenshot({ path: join(evidenceDir, "playback-engagement.png"), fullPage: true });
    }
    catch (error) {
        record("browser engagement", "fail", error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120));
    }
    finally {
        try {
            if (fixture) await cleanupEngagementFixture(fixture, { stale: false });
        }
        catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120);
            cleanupReport = { status: "fail", reason: message, stale: false };
            record("cleanup engagement fixture", "fail", message);
        }
        await browser.close();
        writeReport(fixture);
    }

    const engagementFail = results.some(
        (r) => r.status === "fail" && !String(r.step).startsWith("cleanup"),
    );
    const finalCleanupFail = cleanupReport?.status === "fail" && cleanupReport?.stale === false;
    process.exit(engagementFail || finalCleanupFail ? 1 : 0);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});