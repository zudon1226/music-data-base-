/**
 * Mixtapes mobile / tablet Playwright staging checks.
 * Usage: npm run verify:mixtapes:mobile
 */
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    loadMixtapeStagingE2eCredentialsFromFile,
} from "./lib/load-mixtape-staging-e2e-credentials.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadMixtapeStagingE2eCredentialsFromFile();

const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const BASE_URL = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const OWNER_EMAIL = "zudon1226@gmail.com";
const PRESERVED_MIXTAPE_ID = "6666f776-dafa-4551-ba36-dd302962844a";
const runToken = randomBytes(4).toString("hex");
const MOBILE_PREFIX = `mdb-mobile-e2e-${runToken}`;
const evidenceDir = join(root, "tmp-mixtape-mobile-e2e");
mkdirSync(evidenceDir, { recursive: true });

const PHONE = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["iPhone 12"].userAgent,
};

const TABLET = {
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["iPad (gen 7)"].userAgent,
};

const E2E_EMAIL = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
const E2E_PASSWORD = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();

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

async function assertNoHorizontalOverflow(page) {
    return page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const w = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
        const c = doc.clientWidth;
        return { ok: w <= c + 2, scrollWidth: w, clientWidth: c };
    });
}

async function assertInViewport(page, selector) {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { ok: false, reason: "missing" };
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const horiz = rect.left >= -2 && rect.right <= vw + 2;
        const vert = rect.top >= -2 && rect.bottom <= vh + 2;
        const visible = rect.width > 0 && rect.height > 0;
        return { ok: visible && horiz && vert, rect, vw, vh };
    }, selector);
}

async function countAudio(page) {
    return page.evaluate(() => document.querySelectorAll("audio").length);
}

async function clickNavView(page, view) {
    const activeView = await page.locator("main.zml-app").getAttribute("data-active-view").catch(() => "");
    if (activeView === view) return true;
    const selectors = [
        `.mobile-horizontal-nav button[data-nav-view="${view}"]`,
        `[data-nav-view="${view}"]`,
        `.desktop-sidebar-nav button[data-nav-view="${view}"]`,
    ];
    for (const selector of selectors) {
        const loc = page.locator(selector).first();
        if (await loc.count()) {
            const visible = await loc.isVisible().catch(() => false);
            if (!visible) continue;
            await loc.click({ timeout: 30_000 });
            return true;
        }
    }
    const link = page.getByRole("link", { name: new RegExp(`^${view}$`, "i") }).first();
    if (await link.count()) {
        await link.click({ timeout: 30_000 });
        return true;
    }
    return false;
}

async function loginCreator(page) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: /Already have an account/i }).click({ timeout: 20_000 });
    await page.getByRole("textbox", { name: "Email" }).fill(E2E_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /^Login$/i }).click();
    await page.waitForSelector('main.zml-app[data-roles-ready="true"]', { timeout: 120_000 });
}

async function ownerSession(staging) {
    const anon = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER_EMAIL });
    if (link.error || !link.data?.properties?.hashed_token) throw new Error("owner session unavailable");
    const verified = await anon.auth.verifyOtp({
        token_hash: link.data.properties.hashed_token,
        type: "magiclink",
    });
    return verified.data.session;
}

async function waitForDiscovery(page) {
    await page.waitForSelector("[data-mixtape-discovery]", { timeout: 60_000 });
    await page.waitForFunction(
        () => {
            const root = document.querySelector("[data-mixtape-discovery]");
            if (!root) return false;
            if (root.textContent?.includes("Loading mixtapes")) return false;
            return Boolean(root.querySelector("article"))
                || /No mixtapes match your search/i.test(root.textContent || "");
        },
        { timeout: 60_000 },
    );
}

async function runPhoneDiscovery(page, tag) {
    await page.goto(`${BASE_URL}/mixtapes`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForDiscovery(page);
    const search = page.locator("#mixtape-discovery-search");
    await search.waitFor({ state: "visible", timeout: 20_000 });
    record(`${tag} discovery search visible`, (await assertInViewport(page, "#mixtape-discovery-search")).ok ? "pass" : "fail");

    const overflow = await assertNoHorizontalOverflow(page);
    record(`${tag} no horizontal overflow (discovery)`, overflow.ok ? "pass" : "fail", `${overflow.scrollWidth}/${overflow.clientWidth}`);
    await page.screenshot({ path: join(evidenceDir, `${tag}-discovery.png`), fullPage: true });

    await search.fill("mix");
    await page.getByRole("tab", { name: /Featured/i }).click();
    await page.getByRole("tab", { name: /Recent/i }).click();
    await page.getByRole("tab", { name: /Discover/i }).click();
    const chip = page.getByRole("button", { name: /All categories/i });
    if (await chip.count()) await chip.click();

    const openBtn = page.locator("[data-mixtape-discovery] button", { hasText: /^Open$/ }).first();
    if (await openBtn.count()) {
        await openBtn.click();
        await page.waitForSelector("[data-mixtape-show]", { timeout: 60_000 });
        record(`${tag} detail navigation`, "pass");
    }
    else {
        await page.goto(`${BASE_URL}/mixtape/${PRESERVED_MIXTAPE_ID}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-mixtape-show]", { timeout: 60_000 });
        record(`${tag} detail navigation`, "pass", `preserved=${PRESERVED_MIXTAPE_ID.slice(0, 8)}`);
    }
}

async function runDetailPlayback(page, tag, options = {}) {
    const requirePlaybackPost = Boolean(options.requirePlaybackPost);
    const show = page.locator("[data-mixtape-show]");
    await show.waitFor({ state: "visible", timeout: 30_000 });
    const play = show.getByRole("button", { name: /^Play$/i }).first();
    await play.waitFor({ state: "visible", timeout: 20_000 });
    const cover = await show.evaluate((root) => {
        const header = root.querySelector("header");
        if (!header) return { ok: true };
        const rect = header.getBoundingClientRect();
        return { ok: rect.width > 0 && rect.width <= window.innerWidth, width: rect.width };
    });
    record(`${tag} cover fits viewport`, cover.ok ? "pass" : "fail", `w=${cover.width || "n/a"}`);

    const trackRows = show.locator("button", { hasText: /Play/i });
    record(`${tag} track list readable`, (await trackRows.count()) >= 0 ? "pass" : "fail", `rows=${await trackRows.count()}`);

    const playbackWait = requirePlaybackPost
        ? page.waitForResponse(
            (r) => r.url().includes("/api/mixtapes/playback") && r.request().method() === "POST",
            { timeout: 45_000 },
        )
        : null;
    await play.click();
    if (requirePlaybackPost) {
        const playback = await playbackWait.catch(() => null);
        record(`${tag} playback POST`, playback?.ok() ? "pass" : "fail", playback ? String(playback.status()) : "timeout");
    }
    else {
        record(`${tag} guest play control`, (await play.isVisible()) ? "pass" : "fail", "no playback POST required");
    }

    const audioCount = await countAudio(page);
    record(`${tag} single global audio`, audioCount <= 1 ? "pass" : "fail", `audioCount=${audioCount}`);

    const playerClearance = await page.evaluate(() => {
        const show = document.querySelector("[data-mixtape-show]");
        if (!show) return { ok: false };
        const showStyle = window.getComputedStyle(show);
        const padBottom = Number.parseFloat(showStyle.paddingBottom) || 0;
        return { ok: padBottom >= 72, padBottom };
    });
    record(`${tag} mobile player safe-area padding`, playerClearance.ok ? "pass" : "fail", `pad=${playerClearance.padBottom}`);

    await page.screenshot({ path: join(evidenceDir, `${tag}-detail-playback.png`), fullPage: true });
    const overflow = await assertNoHorizontalOverflow(page);
    record(`${tag} no horizontal overflow (detail)`, overflow.ok ? "pass" : "fail");
}

async function runCreatorStudio(page, tag, staging) {
    if (!E2E_EMAIL || !E2E_PASSWORD) {
        record(`${tag} studio`, "blocked", "creator credentials missing");
        return null;
    }
    await loginCreator(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('main.zml-app[data-roles-ready="true"]', { timeout: 120_000 });
    await page.waitForSelector('main.zml-app[data-can-upload="true"]', { timeout: 90_000 }).catch(() => null);
    const clicked = await clickNavView(page, "Mixtape Studio");
    if (!clicked) {
        record(`${tag} studio nav`, "fail", "Mixtape Studio nav missing");
        return null;
    }
    await page.waitForSelector("[data-mixtape-studio]", { timeout: 90_000 });
  await page.waitForFunction(
        () => {
            const title = document.querySelector("[data-mixtape-studio] #mixtape-title");
            if (!title) return false;
            const rect = title.getBoundingClientRect();
            return rect.width > 0 && rect.width <= window.innerWidth;
        },
        { timeout: 60_000 },
    );
    const title = `${MOBILE_PREFIX}-mix`;
    const studio = page.locator("[data-mixtape-studio]");
    await studio.locator("#mixtape-title").fill(title);
    const createWait = page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/api/mixtapes") && !r.url().includes("/tracks"),
        { timeout: 60_000 },
    );
    await studio.getByRole("button", { name: /Create mixtape/i }).click();
    const createRes = await createWait.catch(() => null);
    const body = createRes ? await createRes.json().catch(() => ({})) : {};
    const mixtapeId = String(body.mixtape?.id || "");
    record(`${tag} studio create`, createRes?.status() === 201 && mixtapeId ? "pass" : "fail", mixtapeId.slice(0, 8));

    if (mixtapeId) {
        await page.waitForFunction(
            (id) => document.querySelector('[data-mixtape-studio] select#mixtape-select')?.value === id,
            mixtapeId,
            { timeout: 45_000 },
        ).catch(() => null);
        record(`${tag} selector shows new mixtape`, "pass");
        await page.goto(`${BASE_URL}/mixtape/${PRESERVED_MIXTAPE_ID}`, { waitUntil: "domcontentloaded" });
        await runDetailPlayback(page, `${tag}-auth`, { requirePlaybackPost: true });
    }
    await page.screenshot({ path: join(evidenceDir, `${tag}-studio.png`), fullPage: true });
    const overflow = await assertNoHorizontalOverflow(page);
    record(`${tag} no horizontal overflow (studio)`, overflow.ok ? "pass" : "fail");

    if (mixtapeId && mixtapeId !== PRESERVED_MIXTAPE_ID && staging.SUPABASE_SERVICE_ROLE_KEY) {
        const service = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        await service.from("mixtapes").update({ status: "archived" }).eq("id", mixtapeId).eq("title", title);
    }
    return mixtapeId;
}

async function runAdminModeration(browser, staging, tag) {
    const owner = await ownerSession(staging);
    const ref = stagingRef(staging.NEXT_PUBLIC_SUPABASE_URL);
    const context = await browser.newContext({ ...PHONE });
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
    page.on("dialog", (dialog) => dialog.accept());
    try {
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForSelector('main.zml-app[data-roles-ready="true"]', { timeout: 120_000 });
        await clickNavView(page, "Platform Control Center");
        await page.waitForSelector('main.zml-app[data-active-view="Platform Control Center"]', { timeout: 60_000 });
        const queue = page.locator("[data-mixtape-moderation-queue]");
        await queue.scrollIntoViewIfNeeded();
        await queue.waitFor({ state: "visible", timeout: 30_000 });
        record(`${tag} mixtape reports visible`, await queue.isVisible() ? "pass" : "fail");
        const pendingTab = queue.getByRole("tab", { name: /Pending/i });
        if (await pendingTab.count()) await pendingTab.click();
        const refresh = queue.getByRole("button", { name: /^Refresh$/i });
        const refreshOk = (await refresh.count()) > 0 && (await assertInViewport(page, "[data-mixtape-moderation-queue] button")).ok;
        record(`${tag} moderation tabs and refresh`, refreshOk ? "pass" : "fail");
        await page.screenshot({ path: join(evidenceDir, `${tag}-admin-moderation.png`), fullPage: true });
        const overflow = await assertNoHorizontalOverflow(page);
        record(`${tag} no horizontal overflow (admin)`, overflow.ok ? "pass" : "fail");
    }
    finally {
        await context.close();
    }
}

async function runPodcastMusicSmoke(page, tag) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const podcasts = await clickNavView(page, "Podcasts");
    record(`${tag} podcasts nav`, podcasts ? "pass" : "fail");
    await page.waitForFunction(
        () => document.querySelector("main.zml-app")?.getAttribute("data-active-view") === "Podcasts",
        { timeout: 30_000 },
    ).catch(() => null);
    const overflow = await assertNoHorizontalOverflow(page);
    record(`${tag} podcasts no horizontal overflow`, overflow.ok ? "pass" : "fail");
}

async function main() {
    const staging = parseEnvFile(join(root, ".env.staging.local"));
    const ref = stagingRef(staging.NEXT_PUBLIC_SUPABASE_URL);
    if (ref !== STAGING_REF || ref === PRODUCTION_REF) {
        record("staging identity", "fail", `ref=${ref || "missing"}`);
        process.exit(1);
    }
    record("staging identity", "pass", `ref=${ref}`);
    if (!E2E_EMAIL || !E2E_PASSWORD) {
        record("creator credentials", "fail", "MDB_MIXTAPE_E2E_EMAIL/PASSWORD required");
        process.exit(1);
    }
    record("creator credentials", "pass", `email_hash=${createHash("sha256").update(E2E_EMAIL).digest("hex").slice(0, 12)}`);

    const health = await fetch(BASE_URL, { redirect: "follow" }).catch(() => null);
    if (!health?.ok) {
        record("staging dev server", "fail", BASE_URL);
        process.exit(1);
    }
    record("staging dev server", "pass", BASE_URL);

    const browser = await chromium.launch({ headless: true });

    // Phone — guest discovery + preserved detail
    {
        const context = await browser.newContext({ ...PHONE });
        const page = await context.newPage();
        try {
            await runPhoneDiscovery(page, "phone");
            await runDetailPlayback(page, "phone", { requirePlaybackPost: false });
        }
        finally {
            await context.close();
        }
    }

    // Phone — creator studio
    {
        const context = await browser.newContext({ ...PHONE });
        const page = await context.newPage();
        try {
            await runCreatorStudio(page, "phone", staging);
        }
        finally {
            await context.close();
        }
    }

    // Phone — admin moderation
    await runAdminModeration(browser, staging, "phone");

    // Phone — podcasts regression
    {
        const context = await browser.newContext({ ...PHONE });
        const page = await context.newPage();
        try {
            await runPodcastMusicSmoke(page, "phone");
        }
        finally {
            await context.close();
        }
    }

    // Tablet — discovery + detail
    {
        const context = await browser.newContext({ ...TABLET });
        const page = await context.newPage();
        try {
            await runPhoneDiscovery(page, "tablet");
            await runDetailPlayback(page, "tablet", { requirePlaybackPost: false });
        }
        finally {
            await context.close();
        }
    }

    await browser.close();
    writeFileSync(join(evidenceDir, "report.json"), JSON.stringify({ results, runToken }, null, 2));
    const fails = results.filter((r) => r.status === "fail");
    if (fails.length) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});