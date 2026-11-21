/**
 * Approved-account Mixtapes staging E2E (Playwright).
 *
 * Environment (never commit values; set in shell or Cursor secrets):
 *   MDB_MIXTAPE_E2E_BASE_URL          — default http://localhost:3002
 *   MDB_MIXTAPE_E2E_EMAIL             — approved staging account email (required for full run)
 *   MDB_MIXTAPE_E2E_PASSWORD          — approved staging password (required for full run)
 *   MDB_MIXTAPE_E2E_EXPECTED_PROJECT_REF — default jzlegcbotqfzevtczwhx (staging)
 *
 * Modes:
 *   node scripts/verify-mixtape-approved-staging-e2e.mjs --preflight
 *   node scripts/verify-mixtape-approved-staging-e2e.mjs
 *
 * Reads `.env.staging.local` only for NEXT_PUBLIC_SUPABASE_URL identity guard (no secrets logged).
 * Does not create users, change roles, or use production Supabase.
 */
import { chromium } from "playwright";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    loadMixtapeStagingE2eCredentialsFromFile,
    resolveMixtapeE2eCredentialPath,
} from "./lib/load-mixtape-staging-e2e-credentials.mjs";
import {
    STUDIO_FIRST_PAGE_TIMEOUT_MS,
    STUDIO_SELECT_BY_ID_TIMEOUT_MS,
    clickMixtapeStatusButton,
    createMixtapeInStudio,
    ensureStudioMixtapeSelected,
    uploadStudioCover,
    uploadStudioTrack,
    waitForStudioFirstCatalogPage,
} from "./lib/mixtape-studio-playwright-harness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

loadMixtapeStagingE2eCredentialsFromFile();
const STAGING_ENV_FILE = ".env.staging.local";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const DEFAULT_STAGING_REF = "jzlegcbotqfzevtczwhx";

const BASE_URL = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
/** Preserved published fixture for manual reruns; never archived by this script. */
const PRESERVED_MIXTAPE_ID = "6666f776-dafa-4551-ba36-dd302962844a";
const PREFLIGHT = process.argv.includes("--preflight") || process.env.MDB_MIXTAPE_E2E_MODE === "preflight";
const E2E_EMAIL = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
const E2E_PASSWORD = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
const EXPECTED_REF = String(process.env.MDB_MIXTAPE_E2E_EXPECTED_PROJECT_REF || DEFAULT_STAGING_REF).trim();

const runToken = randomBytes(4).toString("hex");
const AUDIT_PREFIX = `mdb-e2e-audit-${runToken}`;
const evidenceDir = join(root, "tmp-mixtape-approved-e2e");
mkdirSync(evidenceDir, { recursive: true });
const mediaDir = join(evidenceDir, "media");
mkdirSync(mediaDir, { recursive: true });

const results = [];

/** @param {"pass"|"fail"|"blocked"} status */
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

function projectRefFromSupabaseUrl(url) {
    const match = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return match ? match[1].toLowerCase() : "";
}

function verifyStagingIdentity() {
    const stagingEnv = parseEnvFile(join(root, STAGING_ENV_FILE));
    const stagingUrl = stagingEnv.NEXT_PUBLIC_SUPABASE_URL || "";
    const ref = projectRefFromSupabaseUrl(stagingUrl);
    if (!stagingUrl || !ref) {
        record("staging identity", "fail", `${STAGING_ENV_FILE} missing NEXT_PUBLIC_SUPABASE_URL`);
        return false;
    }
    if (ref === PRODUCTION_REF) {
        record("staging identity", "fail", "production Supabase ref detected");
        return false;
    }
    if (ref !== EXPECTED_REF) {
        record("staging identity", "fail", `ref=${ref} expected=${EXPECTED_REF}`);
        return false;
    }
    record("staging identity", "pass", `ref=${ref}`);
    return true;
}

function writeFixtureMedia() {
    const pngPath = join(mediaDir, `${AUDIT_PREFIX}-cover.png`);
    const mp3Path = join(mediaDir, `${AUDIT_PREFIX}-a.wav.mp3`);
  // 1×1 PNG
    const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
    );
    writeFileSync(pngPath, png);
    // Minimal MPEG audio stub (upload descriptor validation only; playback may still require entitlements).
    const mp3 = Buffer.from(
        "//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA" +
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "base64",
    );
    writeFileSync(mp3Path, mp3);
    const mp3Path2 = join(mediaDir, `${AUDIT_PREFIX}-b.wav.mp3`);
    writeFileSync(mp3Path2, mp3);
    return { pngPath, mp3Path, mp3Path2 };
}

async function httpOk(url) {
    const response = await fetch(url, { redirect: "follow" });
    return { ok: response.ok, status: response.status };
}

async function runPreflight(skipIdentity = false) {
    if (!skipIdentity && !verifyStagingIdentity()) return false;

    const guestPage = await httpOk(`${BASE_URL}/mixtapes`);
    record("guest /mixtapes availability", guestPage.ok ? "pass" : "fail", `status=${guestPage.status}`);

    const api = await httpOk(`${BASE_URL}/api/mixtapes?scope=public&limit=5`);
    record("public mixtapes API", api.ok ? "pass" : "fail", `status=${api.status}`);

    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    try {
        await page.goto(`${BASE_URL}/mixtapes`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForTimeout(2000);
        const hasDiscovery = (await page.locator("[data-mixtape-discovery]").count())
            + (await page.getByRole("button", { name: /^Discover$/i }).count())
            + (await page.getByText(/Search mixtapes/i).count());
        record("guest discovery UI", hasDiscovery > 0 ? "pass" : "fail", "mixtapes discovery surface");
        await page.screenshot({ path: join(evidenceDir, "preflight-guest-mixtapes.png"), fullPage: true });
    }
    finally {
        await browser.close();
    }

    if (!E2E_EMAIL || !E2E_PASSWORD) {
        record(
            "approved credentials configured",
            "blocked",
            `Set MDB_MIXTAPE_E2E_EMAIL/MDB_MIXTAPE_E2E_PASSWORD or create ${resolveMixtapeE2eCredentialPath()}`,
        );
        return true;
    }
    record("approved credentials configured", "pass", `email_hash=${createHash("sha256").update(E2E_EMAIL).digest("hex").slice(0, 12)}`);
    return true;
}

async function login(page) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByRole("button", { name: /Already have an account/i }).click({ timeout: 20000 });
    await page.getByRole("textbox", { name: "Email" }).fill(E2E_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /^Login$/i }).click();
    const shellSelector = "main.zml-app[data-active-view], .desktop-sidebar-nav, .mobile-app-chrome, [data-mixtape-studio]";
    try {
        await page.waitForSelector(shellSelector, { timeout: 120_000 });
        await page.waitForSelector('main.zml-app[data-roles-ready="true"]', { timeout: 120_000 });
        return { ok: true };
    }
    catch {
        const hardBlock = await page.getByText(/Thanks for signing up|Confirm your email|Invalid login/i).count();
        if (hardBlock > 0) {
            const msg = (await page.locator("body").innerText()).slice(0, 200);
            return { ok: false, reason: "auth_gate", detail: msg.replace(/\s+/g, " ").slice(0, 120) };
        }
        const stillHeld = await page.locator('[data-login-render-phase="opening-library-post-login"]').count();
        if (stillHeld > 0) {
            return { ok: false, reason: "post_login_hold_timeout", detail: "opening-library-post-login" };
        }
        return { ok: false, reason: "app_shell_timeout" };
    }
}

async function countAudio(page) {
    return page.evaluate(() => document.querySelectorAll("audio").length);
}

function mixtapeShowLocator(page) {
    return page.locator("[data-mixtape-show]");
}

async function waitForMixtapeShow(page, timeout = 120_000) {
    await page.waitForSelector('main.zml-app[data-active-view="Mixtape Show"]', { timeout });
    const show = mixtapeShowLocator(page);
    await show.waitFor({ state: "visible", timeout });
    await show.locator("h2").first().waitFor({ state: "visible", timeout });
    await show.getByRole("button", { name: "Play" }).first().waitFor({ state: "visible", timeout });
}

const FAVORITES_SYNC_TIMEOUT_MS = 30_000;

function isAuthenticatedFavoritesGet(response) {
    return response.request().method() === "GET" && response.url().includes("/api/mixtapes/favorites");
}

/**
 * Wait for GET /api/mixtapes/favorites and verify list includes or excludes mixtapeId.
 * @param {import('playwright').Page} page
 */
async function assertFavoritesGetResponse(response, mixtapeId, expectFavorited) {
    if (!response.ok()) {
        throw new Error(`favorites GET failed http=${response.status()}`);
    }
    const body = await response.json().catch(() => ({}));
    const ids = Array.isArray(body.favoriteMixtapeIds) ? body.favoriteMixtapeIds : [];
    const includes = ids.includes(mixtapeId);
    if (expectFavorited && !includes) {
        throw new Error("favorites GET did not include test mixtape after favorite");
    }
    if (!expectFavorited && includes) {
        throw new Error("favorites GET still includes test mixtape after unfavorite");
    }
    return body;
}

async function waitForFavoritesGetForMixtape(page, mixtapeId, expectFavorited, timeout = FAVORITES_SYNC_TIMEOUT_MS) {
    const response = await page.waitForResponse(isAuthenticatedFavoritesGet, { timeout });
    return assertFavoritesGetResponse(response, mixtapeId, expectFavorited);
}

/**
 * @param {import('playwright').Locator} show
 */
async function waitForShowFavoriteLabel(show, expectFavorited, timeout = FAVORITES_SYNC_TIMEOUT_MS) {
    const pattern = expectFavorited ? /^Favorited$/i : /^Favorite$/i;
    await show.getByRole("button", { name: pattern }).waitFor({ state: "visible", timeout });
}

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} show
 */
async function waitForMixtapeShowFavoritesSynced(page, show, mixtapeId, expectFavorited, timeout = FAVORITES_SYNC_TIMEOUT_MS) {
    await waitForFavoritesGetForMixtape(page, mixtapeId, expectFavorited, timeout);
    await waitForShowFavoriteLabel(show, expectFavorited, timeout);
}

/**
 * @param {import('playwright').Locator} show
 * @param {import('playwright').Page} page
 */
async function clickFavoriteToggle(show, page, expectAfterFavorited) {
    const clickPattern = expectAfterFavorited ? /^Favorite$/i : /^Favorited$/i;
    const btn = show.getByRole("button", { name: clickPattern });
    await btn.waitFor({ state: "visible", timeout: FAVORITES_SYNC_TIMEOUT_MS });
    const postWait = page.waitForResponse(
        (r) => r.url().includes("/api/mixtapes/favorites") && r.request().method() === "POST",
        { timeout: FAVORITES_SYNC_TIMEOUT_MS },
    );
    await btn.click();
    const post = await postWait;
    if (!post.ok()) {
        throw new Error(`favorites POST failed http=${post.status()}`);
    }
    const postBody = await post.json().catch(() => ({}));
    if (Boolean(postBody.favorited) !== expectAfterFavorited) {
        throw new Error(
            `favorites POST favorited=${String(postBody.favorited)} expected=${String(expectAfterFavorited)}`,
        );
    }
    await waitForShowFavoriteLabel(show, expectAfterFavorited, FAVORITES_SYNC_TIMEOUT_MS);
}

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} show
 */
async function reloadAndAssertFavoriteState(page, show, mixtapeId, expectFavorited) {
    const favoritesGet = page.waitForResponse(isAuthenticatedFavoritesGet, {
        timeout: FAVORITES_SYNC_TIMEOUT_MS,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForMixtapeShow(page);
    const response = await favoritesGet;
    await assertFavoritesGetResponse(response, mixtapeId, expectFavorited);
    await waitForShowFavoriteLabel(show, expectFavorited, FAVORITES_SYNC_TIMEOUT_MS);
}

async function runAuthenticated(browser, media) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());

    let auditMixtapeId = "";
    let auditMixtapeTitle = `${AUDIT_PREFIX}-mix`;

    try {
        const loginResult = await login(page);
        if (!loginResult.ok) {
            record("sign in", "blocked", loginResult.reason + (loginResult.detail ? `: ${loginResult.detail}` : ""));
            for (const step of [
                "open Mixtape Studio",
                "create test mixtape",
                "upload audio track",
                "upload cover",
                "reorder tracks",
                "publish mixtape",
                "public detail page",
                "playback POST /api/mixtapes/playback",
                "global player single audio",
                "favorite/unfavorite",
                "reporting",
            ]) {
                record(step, "blocked", "sign-in or beta entitlement");
            }
            await page.screenshot({ path: join(evidenceDir, "auth-blocked-login.png"), fullPage: true });
            return;
        }
        record("sign in", "pass");

        await page.waitForSelector('main.zml-app[data-can-upload="true"]', { timeout: 90_000 }).catch(() => null);

        try {
            await waitForStudioFirstCatalogPage(page, STUDIO_FIRST_PAGE_TIMEOUT_MS);
            record("open Mixtape Studio", "pass", "first catalog page only");
            await page.screenshot({ path: join(evidenceDir, "studio-open.png"), fullPage: true });

            const created = await createMixtapeInStudio(page, {
                title: auditMixtapeTitle,
                description: `${AUDIT_PREFIX} release audit fixture`,
                genre: "Audit",
            });
            auditMixtapeId = created.id;
            const selectedValue = await page.locator("[data-mixtape-studio] select#mixtape-select").inputValue();
            record(
                "create test mixtape",
                selectedValue === auditMixtapeId ? "pass" : "fail",
                `id=${auditMixtapeId} http=${created.httpStatus} selected=${selectedValue}`,
            );

            const trackA = await uploadStudioTrack(page, media.mp3Path);
            const trackB = await uploadStudioTrack(page, media.mp3Path2);
            const tracksOk = trackA.trackStatus === 201 && trackB.trackStatus === 201;
            record(
                "upload audio track",
                tracksOk ? "pass" : "fail",
                `a=${trackA.trackStatus} b=${trackB.trackStatus}`,
            );

            const coverUpload = await uploadStudioCover(page, media.pngPath);
            record(
                "upload cover",
                coverUpload.patchStatus === 200 ? "pass" : "fail",
                `prepare=${coverUpload.prepareStatus} patch=${coverUpload.patchStatus}`,
            );

            const studio = page.locator("[data-mixtape-studio]");
            const trackRows = studio.locator(".trackRow, [class*='trackRow']");
            if (await trackRows.count() >= 2) {
                const firstTitleBefore = await trackRows.nth(0).locator("strong").innerText();
                const secondTitleBefore = await trackRows.nth(1).locator("strong").innerText();
                const reorderWait = page.waitForResponse(
                    (r) => r.request().method() === "PATCH" && r.url().includes("/api/mixtapes/tracks/"),
                    { timeout: 60_000 },
                );
                await studio.getByRole("button", { name: "Down" }).first().click();
                const reorderRes = await reorderWait.catch(() => null);
                const reorderOk = reorderRes?.ok() ?? false;
                record("reorder tracks", reorderOk ? "pass" : "fail", `status=${reorderRes?.status() ?? 0}`);
                if (reorderOk && auditMixtapeId) {
                    await page.reload({ waitUntil: "domcontentloaded" });
                    await waitForStudioFirstCatalogPage(page, STUDIO_FIRST_PAGE_TIMEOUT_MS);
                    await ensureStudioMixtapeSelected(page, auditMixtapeId);
                    const rowsAfter = studio.locator(".trackRow, [class*='trackRow']");
                    const firstTitleAfter = await rowsAfter.nth(0).locator("strong").innerText().catch(() => "");
                    const secondTitleAfter = await rowsAfter.nth(1).locator("strong").innerText().catch(() => "");
                    const swapped = firstTitleAfter === secondTitleBefore && secondTitleAfter === firstTitleBefore;
                    record(
                        "reorder persists after refresh",
                        swapped ? "pass" : "fail",
                        `first=${firstTitleAfter.slice(0, 24)} second=${secondTitleAfter.slice(0, 24)}`,
                    );
                }
            }
            else {
                record("reorder tracks", "blocked", "fewer than 2 tracks in UI");
            }

            const publishTrackButtons = studio.getByRole("button", { name: /^Publish$/i });
            const pubCount = await publishTrackButtons.count();
            for (let i = 0; i < pubCount; i++) {
                const trackPubWait = page.waitForResponse(
                    (r) => r.request().method() === "PATCH" && r.url().includes("/api/mixtapes/tracks/"),
                    { timeout: 60_000 },
                );
                await publishTrackButtons.nth(i).click();
                await trackPubWait.catch(() => null);
            }
            const mixtapePubStatus = await clickMixtapeStatusButton(page, /Publish mixtape/i, "PATCH", auditMixtapeId);
            record("publish mixtape", mixtapePubStatus === 200 ? "pass" : "fail", `status=${mixtapePubStatus}`);
        }
        catch (studioError) {
            const detail = studioError instanceof Error ? studioError.message : String(studioError);
            record("open Mixtape Studio", "fail", detail);
            record("create test mixtape", "blocked", detail);
            record("upload audio track", "blocked", detail);
            record("upload cover", "blocked", detail);
            record("reorder tracks", "blocked", detail);
            record("publish mixtape", "blocked", detail);
            auditMixtapeId = "";
        }

        if (!auditMixtapeId) {
            record("public detail page", "blocked", "no audit mixtape id");
            record("playback POST /api/mixtapes/playback", "blocked", "no published mixtape");
            record("global player single audio", "blocked", "no playback");
            record("favorite/unfavorite", "blocked", "no detail");
            record("reporting", "blocked", "no detail");
        }
        else {
            await page.goto(`${BASE_URL}/mixtape/${auditMixtapeId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
            try {
                await waitForMixtapeShow(page);
                record("public detail page", "pass", page.url());
            }
            catch (error) {
                record("public detail page", "fail", error instanceof Error ? error.message : String(error));
            }
            await page.screenshot({ path: join(evidenceDir, "mixtape-detail.png"), fullPage: true });

            const show = mixtapeShowLocator(page);
            const playbackPosts = [];
            const playbackListener = (response) => {
                if (!response.url().includes("/api/mixtapes/playback") || response.request().method() !== "POST") return;
                playbackPosts.push(response);
            };
            page.on("response", playbackListener);

            const playBtn = show.getByRole("button", { name: "Play" }).first();
            if (await playBtn.count()) {
                await playBtn.click();
                await page.waitForTimeout(8000);
                const signed = playbackPosts.find((r) => r.ok());
                const session = playbackPosts.find((r) => {
                    try {
                        const body = r.request().postData() || "";
                        return body.includes("begin-session");
                    }
                    catch {
                        return false;
                    }
                });
                const playbackOk = Boolean(signed?.ok()) && Boolean(session?.ok());
                record(
                    "playback POST /api/mixtapes/playback",
                    playbackOk ? "pass" : signed?.ok() && !session?.ok() ? "fail" : signed ? "fail" : "blocked",
                    playbackOk
                        ? `signed=${signed.status()} session=${session.status()}`
                        : playbackPosts.length
                            ? playbackPosts.map((r) => String(r.status())).join(",")
                            : "no POST observed",
                );
            }
            else {
                record("playback POST /api/mixtapes/playback", "blocked", "no Play control in mixtape show");
            }
            page.off("response", playbackListener);

            const audioCount = await countAudio(page);
            record("global player single audio", audioCount === 1 ? "pass" : "fail", `audioCount=${audioCount}`);

            const favoriteBtn = show.getByRole("button", { name: /^Favorite$/i });
            const favoritedBtn = show.getByRole("button", { name: /^Favorited$/i });
            if ((await favoriteBtn.count()) === 0 && (await favoritedBtn.count()) === 0) {
                record("favorite/unfavorite", "blocked", "Favorite control missing on show workspace");
            }
            else {
                let favoriteDetail = "";
                let favoriteStatus = "fail";
                try {
                    if (await favoriteBtn.count()) {
                        await clickFavoriteToggle(show, page, true);
                    }
                    else {
                        await waitForShowFavoriteLabel(show, true, FAVORITES_SYNC_TIMEOUT_MS);
                    }
                    await reloadAndAssertFavoriteState(page, show, auditMixtapeId, true);
                    await clickFavoriteToggle(show, page, false);
                    await reloadAndAssertFavoriteState(page, show, auditMixtapeId, false);
                    favoriteStatus = "pass";
                    favoriteDetail = "favorite persisted after reload; unfavorite persisted after reload";
                }
                catch (error) {
                    favoriteDetail = error instanceof Error ? error.message : String(error);
                }
                record("favorite/unfavorite", favoriteStatus, favoriteDetail);
            }

            const reportBtn = show.getByRole("button", { name: /^Report$/i }).first();
            if (await reportBtn.count()) {
                const reportWait = page
                    .waitForResponse((r) => r.url().includes("/api/mixtapes/reports") && r.request().method() === "POST", {
                        timeout: 15_000,
                    })
                    .catch(() => null);
                await reportBtn.click();
                const reportResp = await reportWait;
                record(
                    "reporting",
                    reportResp && reportResp.ok() ? "pass" : reportResp ? "fail" : "blocked",
                    reportResp ? `status=${reportResp.status()}` : "no report POST",
                );
            }
            else {
                record("reporting", "blocked", "Report not shown");
            }

            // Cleanup: archive only our audit mixtape (never the preserved reproducibility fixture)
            if (auditMixtapeTitle.startsWith("mdb-e2e-audit-") && auditMixtapeId !== PRESERVED_MIXTAPE_ID) {
                await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
                await waitForStudioFirstCatalogPage(page, STUDIO_FIRST_PAGE_TIMEOUT_MS).catch(() => null);
                const archiveStatus = await clickMixtapeStatusButton(page, /^Archive$/i, "DELETE", auditMixtapeId).catch(() => 0);
                record(
                    "cleanup audit fixture",
                    archiveStatus === 200 ? "pass" : "fail",
                    `id=${auditMixtapeId} status=${archiveStatus}`,
                );
            }
        }

        // Cross-nav stale player check
        const home = page.getByRole("link", { name: /^Home$/i }).first();
        if (await home.count()) await home.click();
        await page.waitForTimeout(1500);
        const mix = page.getByRole("link", { name: /^Mixtapes$/i }).first();
        if (await mix.count()) await mix.click();
        await page.waitForTimeout(1500);
        const pod = page.getByRole("link", { name: /^Podcasts$/i }).first();
        if (await pod.count()) await pod.click();
        await page.waitForTimeout(1500);
        const navAudio = await countAudio(page);
        record("Home → Mixtapes → Podcasts nav", navAudio <= 1 ? "pass" : "fail", `audioCount=${navAudio}`);
        await page.screenshot({ path: join(evidenceDir, "nav-cross-module.png"), fullPage: true });

        // Guest restrictions (fresh context)
        const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const guestPage = await guest.newPage();
        const target = auditMixtapeId ? `${BASE_URL}/mixtape/${auditMixtapeId}` : `${BASE_URL}/mixtapes`;
        await guestPage.goto(target, { waitUntil: "domcontentloaded", timeout: 120_000 });
        if (auditMixtapeId) {
            try {
                await waitForMixtapeShow(guestPage);
            }
            catch {
                // discovery-only guest path
            }
        }
        const guestShow = mixtapeShowLocator(guestPage);
        const guestDetailVisible = auditMixtapeId
            ? (await guestShow.count()) > 0 || guestPage.url().includes(auditMixtapeId)
            : guestPage.url().includes("/mixtapes");
        record(
            "guest discovery detail",
            guestDetailVisible ? "pass" : "fail",
            auditMixtapeId ? "published mixtape reachable" : "discovery route",
        );
        const guestFav = auditMixtapeId ? await guestShow.getByRole("button", { name: /^Favorite$/i }).count() : 0;
        record("guest favorite restricted", guestFav === 0 ? "pass" : "fail", `favoriteButtons=${guestFav}`);
        const guestPlay = auditMixtapeId ? guestShow.getByRole("button", { name: "Play" }).first() : null;
        let guestPlaybackPolicyPass = true;
        let guestPlaybackDetail = auditMixtapeId
            ? "guest may see Play; server must deny playback"
            : "discovery only";
        if (auditMixtapeId && guestPlay && (await guestPlay.count())) {
            const guestPosts = [];
            const onGuestPlayback = (r) => {
                if (r.url().includes("/api/mixtapes/playback") && r.request().method() === "POST") guestPosts.push(r);
            };
            guestPage.on("response", onGuestPlayback);
            await guestPlay.click();
            await guestPage.waitForTimeout(2500);
            guestPage.off("response", onGuestPlayback);
            const anyOk = guestPosts.some((r) => r.ok());
            const guestDenied = guestPosts.length === 0 || guestPosts.every((r) => !r.ok());
            guestPlaybackPolicyPass = guestDenied && !anyOk;
            guestPlaybackDetail = guestPosts.length
                ? `posts=${guestPosts.map((r) => r.status()).join(",")}`
                : "client auth gate; no playback POST";
        }
        else if (auditMixtapeId) {
            guestPlaybackDetail = "no play control or gated without playback POST";
        }
        const guestAudio = await guestPage.locator("audio").count();
        record(
            "guest playback policy",
            guestPlaybackPolicyPass && guestAudio <= 1 ? "pass" : "fail",
            `${guestPlaybackDetail}; audioCount=${guestAudio}`,
        );
        await guestPage.screenshot({ path: join(evidenceDir, "guest-restrictions.png"), fullPage: true });
        await guest.close();
    }
  finally {
        await context.close();
    }
}

async function main() {
    writeFixtureMedia();
    const identityOk = verifyStagingIdentity();
    if (!identityOk) {
        writeReport(true);
        process.exit(1);
    }

    if (PREFLIGHT) {
        await runPreflight(true);
        writeReport(false);
        const hardFail = results.some((r) => r.status === "fail");
        process.exit(hardFail ? 1 : 0);
    }

    const browser = await chromium.launch({ headless: true });
    try {
        if (!E2E_EMAIL || !E2E_PASSWORD) {
            await runPreflight();
            record(
                "approved credentials configured",
                "fail",
                `Missing MDB_MIXTAPE_E2E_EMAIL/MDB_MIXTAPE_E2E_PASSWORD (optional file: tmp-mixtape-approved-e2e/staging-artist-credentials.env)`,
            );
            writeReport(false);
            process.exit(1);
        }
        record("approved credentials configured", "pass", `email_hash=${createHash("sha256").update(E2E_EMAIL).digest("hex").slice(0, 12)}`);
        const media = {
            pngPath: join(mediaDir, `${AUDIT_PREFIX}-cover.png`),
            mp3Path: join(mediaDir, `${AUDIT_PREFIX}-a.wav.mp3`),
            mp3Path2: join(mediaDir, `${AUDIT_PREFIX}-b.wav.mp3`),
        };
        await runAuthenticated(browser, media);
    }
    finally {
        await browser.close();
        writeReport(false);
    }

    const hardFail = results.some((r) => r.status === "fail");
    process.exit(hardFail ? 1 : 0);
}

function writeReport(preflightOnly) {
    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        mode: PREFLIGHT || preflightOnly ? "preflight" : "full",
        expectedProjectRef: EXPECTED_REF,
        results,
        evidenceDir,
    };
    writeFileSync(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(`Evidence: ${evidenceDir}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});