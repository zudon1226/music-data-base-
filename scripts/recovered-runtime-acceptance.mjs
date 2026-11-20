/**
 * Recovered repo runtime acceptance (guest navigation + smoke). BASE_URL default http://localhost:3003
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = (process.env.BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const evidenceDir = join(root, "tmp-recovered-runtime-audit");
mkdirSync(evidenceDir, { recursive: true });
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";

/** @type {Array<{ step: string, status: 'PASS'|'FAIL'|'BLOCKED', detail?: string }>} */
const results = [];

function record(step, status, detail = "") {
    results.push({ step, status, detail });
    console.log(`${status} ${step}${detail ? ` — ${detail}` : ""}`);
}

function stagingRefFromEnvFile() {
    const path = join(root, ".env.staging.local");
    if (!existsSync(path)) return "";
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const url = m[1].replace(/^['"]|['"]$/g, "");
        const r = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
        return r ? r[1].toLowerCase() : "";
    }
    return "";
}

async function waitForGuestMixtapeDiscovery(page) {
    await page.waitForSelector("main.zml-app[data-public-mixtape-listener-mode='true']", { timeout: 120_000 });
    await page.waitForSelector("[data-mixtape-discovery]", { timeout: 60_000 });
    await page.waitForSelector("#mixtape-discovery-search", { timeout: 60_000 });
}

async function waitForGuestPodcastShell(page) {
    await page.waitForSelector("main.zml-app[data-public-podcast-listener-mode='true']", { timeout: 120_000 });
    await page.waitForSelector("[data-podcast-guest-sign-in-prompt]", { timeout: 90_000 });
}

async function waitForPublicEntryHub(page) {
    await page.waitForSelector("[data-login-render-phase='public-hub']", { timeout: 60_000 });
    await page.waitForSelector("main.mdb-public-entry-page", { timeout: 60_000 });
    await page.waitForSelector('[data-guest-public-discovery-nav="true"]', { timeout: 30_000 });
}

function discoveryNav(page) {
    return page.locator('[data-guest-public-discovery-nav="true"]');
}

async function assertDiscoveryNav(page, prefix, activeSection) {
    const nav = discoveryNav(page);
    const visible = await nav.isVisible().catch(() => false);
    record(`${prefix} discovery nav visible`, visible ? "PASS" : "FAIL");
    if (!visible) return false;

    for (const section of ["home", "mixtapes", "podcasts"]) {
        const link = nav.locator(`[data-guest-discovery-link="${section}"]`);
        const count = await link.count();
        record(`${prefix} link ${section}`, count > 0 ? "PASS" : "FAIL");
        if (section === activeSection && count > 0) {
            const ariaCurrent = await link.first().getAttribute("aria-current");
            record(`${prefix} aria-current ${section}`, ariaCurrent === "page" ? "PASS" : "FAIL", ariaCurrent || "missing");
        }
    }
    return true;
}

async function clickDiscoveryLink(page, section) {
    const link = discoveryNav(page).locator(`[data-guest-discovery-link="${section}"]`).first();
    await link.waitFor({ state: "visible", timeout: 30_000 });
    await Promise.all([
        page.waitForLoadState("domcontentloaded"),
        link.click(),
    ]);
}

async function runCrossSurfaceFlow(page, tag, shotPrefix) {
    await page.goto(`${BASE_URL}/mixtapes`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForGuestMixtapeDiscovery(page);
    await assertDiscoveryNav(page, `${tag} mixtapes`, "mixtapes");
    record(`${tag} mixtapes content`, "PASS", "mixtape discovery workspace");
    await page.screenshot({ path: join(evidenceDir, `${shotPrefix}-mixtapes.png`), fullPage: true });

    const audio1 = await page.evaluate(() => document.querySelectorAll("audio").length);
    record(`${tag} single audio on mixtapes`, audio1 <= 1 ? "PASS" : "FAIL", `audioCount=${audio1}`);

    await clickDiscoveryLink(page, "home");
    await waitForPublicEntryHub(page);
    record(`${tag} mixtapes → home`, "PASS", await page.evaluate(() => location.pathname));
    await assertDiscoveryNav(page, `${tag} home`, "home");
    await page.screenshot({ path: join(evidenceDir, `${shotPrefix}-home.png`), fullPage: true });

    await clickDiscoveryLink(page, "podcasts");
    await waitForGuestPodcastShell(page);
    record(`${tag} home → podcasts`, "PASS", await page.evaluate(() => location.pathname));
    await assertDiscoveryNav(page, `${tag} podcasts`, "podcasts");
    await page.screenshot({ path: join(evidenceDir, `${shotPrefix}-podcasts.png`), fullPage: true });

    const audio2 = await page.evaluate(() => document.querySelectorAll("audio").length);
    record(`${tag} single audio on podcasts`, audio2 <= 1 ? "PASS" : "FAIL", `audioCount=${audio2}`);

    await clickDiscoveryLink(page, "mixtapes");
    await waitForGuestMixtapeDiscovery(page);
    record(`${tag} podcasts → mixtapes`, "PASS", await page.evaluate(() => location.pathname));
    await assertDiscoveryNav(page, `${tag} mixtapes return`, "mixtapes");
    await page.screenshot({ path: join(evidenceDir, `${shotPrefix}-mixtapes-return.png`), fullPage: true });

    const audio3 = await page.evaluate(() => document.querySelectorAll("audio").length);
    record(`${tag} single audio after flow`, audio3 <= 1 ? "PASS" : "FAIL", `audioCount=${audio3}`);

    const moduleNav = await page.locator(".desktop-sidebar-nav [data-nav-view]").evaluateAll((nodes) => (
        [...new Set(nodes.map((n) => n.getAttribute("data-nav-view")).filter(Boolean))]
    ));
    record(`${tag} module sidebar preserved`, moduleNav.length === 1 ? "PASS" : "FAIL", `[${moduleNav.join(", ")}]`);
}

async function main() {
    const ref = stagingRefFromEnvFile();
    record("staging project ref", ref === STAGING_REF ? "PASS" : "FAIL", ref || "missing");
    record("production ref rejected", ref !== PRODUCTION_REF ? "PASS" : "FAIL", ref === PRODUCTION_REF ? "production configured" : "ok");

    const home = await fetch(`${BASE_URL}/`);
    record("home page loads", home.ok ? "PASS" : "FAIL", `status=${home.status}`);

    const mix = await fetch(`${BASE_URL}/mixtapes`);
    record("/mixtapes loads", mix.ok ? "PASS" : "FAIL", `status=${mix.status}`);

    const podcast = await fetch(`${BASE_URL}/podcast`);
    record("/podcast loads", podcast.ok ? "PASS" : "FAIL", `status=${podcast.status}`);

    const api = await fetch(`${BASE_URL}/api/mixtapes?scope=public&limit=5`);
    const apiBody = api.ok ? await api.json().catch(() => ({})) : {};
    const count = Array.isArray(apiBody.mixtapes) ? apiBody.mixtapes.length : 0;
    record("public mixtapes API", api.ok ? "PASS" : "FAIL", `status=${api.status} count=${count}`);

    const browser = await chromium.launch({ headless: true });
    const consoleErrors = [];
    const failedRequests = [];

    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const desktopPage = await desktop.newPage();
    desktopPage.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    });
    desktopPage.on("requestfailed", (req) => {
        failedRequests.push(`${req.failure()?.errorText || "failed"} ${req.url().slice(0, 120)}`);
    });

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mobilePage = await mobile.newPage();
    mobilePage.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(`[mobile] ${m.text().slice(0, 180)}`);
    });

    try {
        await runCrossSurfaceFlow(desktopPage, "desktop", "guest-nav-desktop");
        await runCrossSurfaceFlow(mobilePage, "mobile", "guest-nav-mobile");

        const severeConsole = consoleErrors.filter((e) => !/403|favicon|Failed to load resource|net::ERR/i.test(e));
        record(
            "console severe errors",
            severeConsole.length === 0 ? "PASS" : "FAIL",
            severeConsole.slice(0, 3).join(" | ") || "clean",
        );
        const severeFailed = failedRequests.filter((e) => !/favicon|ERR_ABORTED/i.test(e));
        record(
            "failed network requests",
            severeFailed.length === 0 ? "PASS" : "FAIL",
            severeFailed.slice(0, 3).join(" | ") || "clean",
        );
    }
    finally {
        await browser.close();
    }

    const report = {
        baseUrl: BASE_URL,
        stagingProjectRef: ref,
        guestNavigationModel: {
            summary: "Unified guest discovery nav: /, /mixtapes, /podcast via GuestPublicDiscoveryNav (anchor links + aria-current).",
            crossSurfaceFlow: "/mixtapes → / → /podcast → /mixtapes",
        },
        results,
        consoleErrors: consoleErrors.slice(0, 20),
        failedRequests: failedRequests.slice(0, 20),
    };
    writeFileSync(join(evidenceDir, "guest-navigation-report.json"), JSON.stringify(report, null, 2));
    writeFileSync(join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));

    const hardFail = results.some((r) => r.status === "FAIL");
    process.exit(hardFail ? 1 : 0);
}

main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});