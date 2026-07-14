/**
 * Real authenticated browser regression for the shared media queue.
 * Authoritative store is localStorage key music-data-base:media-queue:<userId>.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp-shared-queue-evidence");
mkdirSync(evidenceDir, { recursive: true });

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const QUEUE_KEY_PREFIX = "music-data-base:media-queue:";

function readEnvLocal() {
    try {
        const text = readFileSync(path.join(root, ".env.local"), "utf8");
        const map = {};
        for (const line of text.split(/\r?\n/)) {
            const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
            if (!m) continue;
            map[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
        return map;
    }
    catch {
        return {};
    }
}

const env = readEnvLocal();
const ownerPassword = process.env.OWNER_LOGIN_PASSWORD || env.OWNER_LOGIN_PASSWORD || env.ZUDON_LOGIN_PASSWORD || "";
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const ownerUserId = "33564e29-6f65-4efd-8a27-6b58bc45a455";

const results = [];
function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page, name) {
    await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: true }).catch(() => {});
}

async function credentials() {
    if (ownerPassword) {
        return { email: "zudon1226@gmail.com", password: ownerPassword, mode: "owner", userId: ownerUserId };
    }
    if (!supabaseUrl) return null;
    const email = `shared-queue-${Date.now()}@probe.local`;
    const password = `Probe_${Date.now()}_Aa1!`;
    if (serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const created = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { display_name: "Queue Probe" },
        });
        if (created.error) {
            console.log("PROBE_ADMIN_CREATE_FAILED", created.error.message);
            return null;
        }
        return { email, password, mode: "probe", userId: created.data.user?.id || "" };
    }
    if (!anonKey) return null;
    const supabase = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const signUp = await supabase.auth.signUp({ email, password });
    if (signUp.error) {
        console.log("PROBE_SIGNUP_FAILED", signUp.error.message);
        return null;
    }
    return {
        email,
        password,
        mode: "probe",
        userId: signUp.data.user?.id || "",
    };
}

async function resolveSessionUserId(page, fallbackUserId = "") {
    const fromPage = await page.evaluate(() => {
        try {
            for (const key of Object.keys(localStorage)) {
                if (!key.includes("auth-token") && !key.includes("sb-")) continue;
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                const id = parsed?.user?.id || parsed?.currentSession?.user?.id || parsed?.session?.user?.id;
                if (typeof id === "string" && id) return id;
            }
        }
        catch {
            // ignore
        }
        return "";
    });
    return fromPage || fallbackUserId || "";
}

async function readLocalQueue(page, userId) {
    return page.evaluate((uid) => {
        const key = `music-data-base:media-queue:${uid}`;
        const raw = localStorage.getItem(key);
        if (!raw) return { key, present: false, items: [], activeIndex: -1 };
        try {
            const parsed = JSON.parse(raw);
            return {
                key,
                present: true,
                items: Array.isArray(parsed.items) ? parsed.items : [],
                activeIndex: Number(parsed.activeIndex),
                updatedAt: parsed.updatedAt || "",
            };
        }
        catch {
            return { key, present: true, items: [], activeIndex: -1, parseError: true };
        }
    }, userId);
}

async function waitForAuthGate(page, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const state = await page.evaluate(() => {
            const text = document.body?.innerText || "";
            return {
                checking: /Checking your session/i.test(text),
                login: Boolean(document.querySelector('input[type="password"], input[name="password"]')),
                app: Boolean(document.querySelector(".zml-app, aside.sidebar")),
            };
        });
        if (state.app || state.login) return state;
        await page.waitForTimeout(500);
    }
    return { checking: true, login: false, app: false };
}

async function waitForAppOrLoginFailure(page, timeoutMs = 90000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const state = await page.evaluate(() => {
            const text = document.body?.innerText || "";
            const busy = /Working\.\.\./i.test(text);
            const login = Boolean(document.querySelector('input[type="password"], input[name="password"]'));
            const app = Boolean(document.querySelector(".zml-app, aside.sidebar"));
            const authMessage = [...document.querySelectorAll("p, .auth-message, .error-state")]
                .map((el) => (el.textContent || "").trim())
                .find((value) => /invalid|error|confirm|failed|wrong|rate|wait/i.test(value)) || "";
            return { busy, login, app, authMessage, text: text.slice(0, 250) };
        });
        if (state.app && !state.login) return { ok: true, ...state };
        if (!state.busy && state.login && state.authMessage) return { ok: false, ...state };
        await page.waitForTimeout(400);
    }
    const finalState = await page.evaluate(() => ({
        login: Boolean(document.querySelector('input[type="password"], input[name="password"]')),
        app: Boolean(document.querySelector(".zml-app, aside.sidebar")),
        text: (document.body?.innerText || "").slice(0, 250),
    }));
    return { ok: Boolean(finalState.app && !finalState.login), ...finalState };
}

async function login(page, creds) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    let gate = await waitForAuthGate(page, 60000);
    if (gate.checking && !gate.login && !gate.app) {
        record("login", false, "stuck on Checking your session");
        return false;
    }
    if (gate.app && !gate.login) {
        record("login", true, "already session");
        return true;
    }
    if (!creds) {
        record("login", false, "no credentials");
        return false;
    }
    await page.fill('input[type="email"], input[name="email"]', creds.email);
    await page.fill('input[type="password"], input[name="password"]', creds.password);
    await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').first().click();
    const result = await waitForAppOrLoginFailure(page, 90000);
    record(`${creds.mode} login`, Boolean(result.ok), result.ok ? "" : (result.authMessage || result.text || "login form still visible"));
    return Boolean(result.ok);
}

/** Navigate via desktop sidebar — uses title attr (exact view name) on nav buttons. */
async function openNav(page, label) {
    const byTitle = page.locator(`aside.sidebar nav.desktop-sidebar-nav button[title="${label}"]`).first();
    if (await byTitle.count()) {
        await byTitle.click({ timeout: 15000 });
        await page.waitForTimeout(1000);
        return;
    }
    const byText = page.locator(`aside.sidebar button`).filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first();
    await byText.click({ timeout: 15000 });
    await page.waitForTimeout(1000);
}

async function clearQueueUi(page) {
    await openNav(page, "Queue");
    const clearBtn = page.locator(".queue-page button:has-text(\"Clear Queue\")").first();
    if (await clearBtn.isEnabled().catch(() => false)) {
        await clearBtn.click();
        await page.waitForTimeout(1200);
    }
}

async function waitForQueuePersist(page, userId, minItems, timeoutMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const stored = await readLocalQueue(page, userId);
        if (stored.present && stored.items.length >= minItems) return stored;
        await page.waitForTimeout(400);
    }
    return readLocalQueue(page, userId);
}

async function main() {
    const launchOpts = { headless: true };
    if (process.env.PLAYWRIGHT_CHROME_CHANNEL) {
        launchOpts.channel = process.env.PLAYWRIGHT_CHROME_CHANNEL;
    }
    const browser = await chromium.launch(launchOpts);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const creds = await credentials();
    const persistLogs = [];
    page.on("console", (msg) => {
        const text = msg.text();
        if (text.includes("[media-queue:persist]")) persistLogs.push(text);
    });

    try {
        if (!(await login(page, creds))) {
            process.exitCode = 1;
            return;
        }

        const sessionUserId = await resolveSessionUserId(page, creds?.userId || "");
        record("Resolved session userId", Boolean(sessionUserId), sessionUserId || "missing");
        if (!sessionUserId) {
            process.exitCode = 1;
            return;
        }

        await page.waitForTimeout(1500);
        const beforeHydrate = await readLocalQueue(page, sessionUserId);
        record(
            "Queue storage key namespace ready",
            true,
            `key=${QUEUE_KEY_PREFIX}${sessionUserId.slice(0, 8)}… priorItems=${beforeHydrate.items.length}`,
        );

        await clearQueueUi(page);
        await page.waitForTimeout(1200);
        const emptyText = await page.locator(".queue-page").innerText();
        record("Clear queue", /No media queued/i.test(emptyText) || /Add songs or videos/i.test(emptyText));

        // Add real song
        await openNav(page, "Home");
        await page.waitForTimeout(1200);
        let songCard = page.locator("article.song-card").filter({ has: page.locator('button:has-text("Add to Queue")') }).first();
        if (!(await songCard.count())) {
            songCard = page.locator("article.media-card").filter({ has: page.locator('button:has-text("Add to Queue")') }).first();
        }
        const songTitle = ((await songCard.locator("h3").first().innerText().catch(() => "song")) || "song").trim();
        await songCard.locator('button:has-text("Add to Queue")').first().click();
        await page.waitForTimeout(1000);
        record("Add song to queue", Boolean(songTitle), songTitle);

        // Add real video from Videos (prefer compatible "big business")
        await openNav(page, "Videos");
        await page.waitForTimeout(1500);
        let videoCard = page.locator("article.video-card").filter({ hasText: /big business/i }).first();
        if (!(await videoCard.count())) {
            videoCard = page.locator("article.video-card").filter({ has: page.locator('button:has-text("Add to Queue")') }).first();
        }
        const videoTitle = ((await videoCard.locator("h3").first().innerText()) || "video").trim();
        await videoCard.locator('button:has-text("Add to Queue")').first().click();
        await page.waitForTimeout(1200);

        const storedAfterAdd = await waitForQueuePersist(page, sessionUserId, 2);
        const storedVideo = storedAfterAdd.items.find((item) => item.mediaType === "video");
        const storedSong = storedAfterAdd.items.find((item) => item.mediaType === "song");
        const playableUrl = String(storedVideo?.playableUrl || storedVideo?.videoUrl || "").trim();
        record(
            "localStorage has mixed song + video",
            Boolean(storedSong && storedVideo),
            `items=${storedAfterAdd.items.length} song=${storedSong?.title || "?"} video=${storedVideo?.title || "?"}`,
        );
        record(
            "Stored video playableUrl non-empty",
            Boolean(playableUrl),
            playableUrl ? `url=${playableUrl.slice(0, 90)}` : "missing",
        );
        record(
            "Persist debug logs observed",
            persistLogs.some((line) => line.includes("localStorage.setItem")),
            `logs=${persistLogs.filter((l) => l.includes("setItem")).length}`,
        );
        await shot(page, "01-after-add-video");

        await openNav(page, "Queue");
        const mixed = await page.locator(".queue-page").innerText();
        const mixedOk = mixed.toLowerCase().includes(videoTitle.toLowerCase())
            && mixed.toLowerCase().includes(songTitle.toLowerCase())
            && /Songs/i.test(mixed)
            && /Videos/i.test(mixed);
        record("Queue page shows song + video", mixedOk, `song=${songTitle} video=${videoTitle}`);
        await shot(page, "02-mixed-queue");

        // Play song then video from queue
        const plays = page.locator(".queue-manage-row").getByRole("button", { name: "Play", exact: true });
        if ((await plays.count()) >= 1) {
            await plays.nth(0).click();
            await page.waitForTimeout(1200);
        }
        if ((await plays.count()) >= 2) {
            await plays.nth(1).click();
            await page.waitForTimeout(2000);
        }
        const bodyText = await page.locator("body").innerText();
        const missingUrl = /missing a playable URL/i.test(bodyText);
        record("Player does not report missing URL for queued video", !missingUrl);

        // Refresh
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3500);
        const afterRefreshStore = await readLocalQueue(page, sessionUserId);
        await openNav(page, "Queue");
        const afterRefresh = await page.locator(".queue-page").innerText();
        record(
            "Queue survives refresh (UI)",
            afterRefresh.toLowerCase().includes(videoTitle.toLowerCase())
                && afterRefresh.toLowerCase().includes(songTitle.toLowerCase())
                && !/No media queued/i.test(afterRefresh),
        );
        record(
            "Queue survives refresh (localStorage)",
            afterRefreshStore.items.length >= 2
                && afterRefreshStore.items.some((i) => i.mediaType === "song")
                && afterRefreshStore.items.some((i) => i.mediaType === "video"),
            `items=${afterRefreshStore.items.length}`,
        );
        await shot(page, "03-after-refresh");

        // Browser restart simulation with auth storageState
        const statePath = path.join(evidenceDir, "storage-state.json");
        await context.storageState({ path: statePath });
        await browser.close();

        const browser2 = await chromium.launch(launchOpts);
        const context2 = await browser2.newContext({
            viewport: { width: 1440, height: 900 },
            storageState: statePath,
        });
        const page2 = await context2.newPage();
        await page2.goto(BASE_URL, { waitUntil: "domcontentloaded" });
        await page2.waitForTimeout(4000);
        await openNav(page2, "Queue");
        const afterRestart = await page2.locator(".queue-page").innerText();
        record(
            "Queue survives browser restart",
            afterRestart.toLowerCase().includes(videoTitle.toLowerCase())
                && afterRestart.toLowerCase().includes(songTitle.toLowerCase()),
        );
        await shot(page2, "04-after-restart");

        const beforeLogoutStore = await readLocalQueue(page2, sessionUserId);
        const beforeCount = beforeLogoutStore.items.length;

        await page2.locator('button.logout-btn, button:has-text("Logout")').first().click().catch(() => {});
        await page2.waitForTimeout(2500);

        const duringLogoutStore = await readLocalQueue(page2, sessionUserId);
        record(
            "Logout does not delete localStorage queue",
            (duringLogoutStore.items?.length || 0) >= beforeCount && beforeCount >= 2,
            `before=${beforeCount} afterLogout=${duringLogoutStore.items?.length || 0}`,
        );

        if (creds) {
            const loginVisible = await page2.locator('input[type="email"], input[name="email"]').first().isVisible().catch(() => false);
            if (loginVisible) {
                await page2.fill('input[type="email"], input[name="email"]', creds.email);
                await page2.fill('input[type="password"], input[name="password"]', creds.password);
                await page2.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').first().click();
                await page2.waitForSelector(".zml-app, aside.sidebar", { timeout: 90000 }).catch(() => {});
                await page2.waitForTimeout(4000);
            }
        }
        await openNav(page2, "Queue");
        await page2.waitForTimeout(1500);
        const afterRelogin = await page2.locator(".queue-page").innerText();
        const orderOk = afterRelogin.toLowerCase().includes(songTitle.toLowerCase())
            && afterRelogin.toLowerCase().includes(videoTitle.toLowerCase());
        record("Queue survives logout/login", orderOk);
        const afterReloginStore = await readLocalQueue(page2, sessionUserId);
        const afterVideoUrl = String(
            (afterReloginStore.items || []).find((i) => i.mediaType === "video")?.playableUrl
            || (afterReloginStore.items || []).find((i) => i.mediaType === "video")?.videoUrl
            || "",
        ).trim();
        record("Relogin restores video playableUrl", Boolean(afterVideoUrl), afterVideoUrl.slice(0, 100));
        await shot(page2, "05-after-relogin");

        await browser2.close();
    }
    catch (error) {
        record("browser harness", false, error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        try { await shot(page, "99-error"); } catch { /* ignore */ }
        await browser.close().catch(() => { });
    }
    finally {
        writeFileSync(path.join(evidenceDir, "results.json"), JSON.stringify({ baseUrl: BASE_URL, results }, null, 2));
    }

    if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main();
