#!/usr/bin/env node
/**
 * Phase 29I — Production mobile responsiveness probes (Playwright).
 * Target: https://www.digitalmusicdatabase.com (production-first).
 *
 * Env:
 *   MDB_PRODUCTION_BASE_URL — default https://www.digitalmusicdatabase.com
 *
 * Authenticated nav/upload studio checks are BLOCKED without owner session (not logged).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = String(process.env.MDB_PRODUCTION_BASE_URL || "https://www.digitalmusicdatabase.com").replace(/\/$/, "");
const evidenceDir = join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });

const VIEWPORTS = [
    { id: "iphone-375", width: 375, height: 667 },
    { id: "iphone-390", width: 390, height: 844 },
    { id: "android-412", width: 412, height: 915 },
    { id: "desktop-1440", width: 1440, height: 900 },
];

const GUEST_ROUTES = {
    home: "/",
    music: "/music",
    videos: "/videos",
    ringtones: "/ringtones",
    mixtapes: "/mixtapes",
    podcasts: "/podcast",
};

const results = [];
function record(id, status, detail = "") {
    results.push({ id, status, detail });
    console.log(`${status.padEnd(7)} [${id}]${detail ? ` — ${detail}` : ""}`);
}

async function waitGuestHub(page) {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(
        () => {
            const phase = document.querySelector('[data-login-render-phase="public-hub"]');
            const hub = document.querySelector(".mdb-public-entry-page");
            if (hub || phase) return true;
            const text = document.body?.innerText || "";
            return /sign in|explore|music data base/i.test(text) && !/checking your session/i.test(text);
        },
        { timeout: 90_000 },
    );
}

async function measureOverflow(page) {
    return page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
        const clientWidth = doc.clientWidth;
        return { ok: scrollWidth <= clientWidth + 2, scrollWidth, clientWidth };
    });
}

async function measureGuestNav(page, isMobile) {
    const nav = isMobile
        ? page.locator('[data-guest-public-discovery-nav="true"][data-guest-discovery-layout="horizontal"]').first()
        : page.locator('[data-guest-public-discovery-nav="true"]').first();
    const count = await nav.count();
    if (!count) return { ok: false, reason: "nav-missing" };
    const scroller = nav.locator(".guest-public-discovery-nav__scroller").first();
    const pills = nav.locator("a, button").filter({ hasText: /.+/ });
    const pillCount = await pills.count();
    const sizes = [];
    for (let i = 0; i < Math.min(pillCount, 8); i += 1) {
        const box = await pills.nth(i).boundingBox();
        if (box) sizes.push({ w: box.width, h: box.height });
    }
    const minH = sizes.length ? Math.min(...sizes.map((s) => s.h)) : 0;
    const scrollable = await scroller.evaluate((el) => {
        if (!el) return false;
        return el.scrollWidth > el.clientWidth + 2;
    }).catch(() => false);
    return {
        ok: minH >= 38 && pillCount >= 4,
        pillCount,
        minH,
        scrollable,
    };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const vp of VIEWPORTS) {
            const context = await browser.newContext({
                viewport: { width: vp.width, height: vp.height },
                userAgent: vp.width < 500
                    ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
                    : undefined,
            });
            const page = await context.newPage();
            const isMobile = vp.width < 821;

            await waitGuestHub(page);
            const overflow = await measureOverflow(page);
            record(
                `${vp.id}-guest-home-overflow`,
                overflow.ok ? "PASS" : "FAIL",
                `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
            );

            const nav = await measureGuestNav(page, isMobile);
            record(
                `${vp.id}-guest-nav-touch`,
                nav.ok ? "PASS" : nav.reason === "nav-missing" ? "FAIL" : "WARN",
                `pills=${nav.pillCount} minH=${nav.minH?.toFixed?.(0) || 0} scroller=${nav.scrollable}`,
            );

            for (const [key, path] of Object.entries(GUEST_ROUTES)) {
                if (key === "home") continue;
                await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
                await page.waitForTimeout(800);
                const routeOverflow = await measureOverflow(page);
                record(
                    `${vp.id}-${key}-overflow`,
                    routeOverflow.ok ? "PASS" : "FAIL",
                    `scrollWidth=${routeOverflow.scrollWidth} clientWidth=${routeOverflow.clientWidth}`,
                );
            }

            if (isMobile) {
                await page.goto(`${BASE}/music`, { waitUntil: "domcontentloaded" });
                await page.waitForTimeout(600);
                const active = await page.locator('[aria-current="page"]').count();
                record(
                    `${vp.id}-aria-current-present`,
                    active > 0 ? "PASS" : "WARN",
                    `aria-current count=${active}`,
                );
            }

            await context.close();
        }

        record("authenticated-mobile-nav", "BLOCKED", "requires owner session on www (not automated)");
        record("creator-studio-mobile-upload", "BLOCKED", "requires Artist session on www (not automated)");
    } finally {
        await browser.close();
    }

    writeFileSync(
        join(evidenceDir, "production-mobile-acceptance-evidence.json"),
        JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), results }, null, 2),
    );

    const fails = results.filter((r) => r.status === "FAIL");
    console.log(`\nPRODUCTION_MOBILE_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});