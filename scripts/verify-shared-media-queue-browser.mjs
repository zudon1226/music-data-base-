/**
 * Real authenticated browser regression for the shared media queue.
 * Authoritative store is server-side (/api/media-queue), not localStorage.
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
    await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: true });
}

async function credentials() {
    if (ownerPassword) {
        return { email: "zudon1226@gmail.com", password: ownerPassword, mode: "owner", userId: ownerUserId };
    }
    if (!supabaseUrl || !anonKey) return null;
    const email = `shared-queue-${Date.now()}@probe.local`;
    const password = `Probe_${Date.now()}_Aa1!`;
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

async function login(page, creds) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2000);
    const loginVisible = await page.locator('input[type="email"], input[name="email"]').first().isVisible().catch(() => false);
    if (!loginVisible) {
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
    await page.waitForTimeout(5000);
    const still = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    record(`${creds.mode} login`, !still);
    return !still;
}

async function openNav(page, label) {
    await page.locator(`aside.sidebar button:has-text("${label}")`).first().click({ timeout: 15000 });
    await page.waitForTimeout(1200);
}

async function clearQueueUi(page) {
    await openNav(page, "Queue");
    const clearBtn = page.locator('button:has-text("Clear Queue")').first();
    if (await clearBtn.isEnabled().catch(() => false)) {
        await clearBtn.click();
        await page.waitForTimeout(1500);
    }
}

async function readServerQueue(userId) {
    if (!supabaseUrl || !serviceKey || !userId) return null;
    const admin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const table = await admin.from("user_media_queue_items").select("media_type,media_source_id,playable_url,position").eq("user_id", userId).order("position");
    if (!table.error) {
        return {
            backend: "database",
            userId,
            items: (table.data || []).map((row) => ({
                mediaType: row.media_type,
                id: row.media_source_id,
                playableUrl: row.playable_url,
            })),
        };
    }
    const download = await admin.storage.from("user-media-queues").download(`${userId}/queue.json`);
    if (download.error || !download.data) {
        return { backend: "storage", userId, items: [], error: download.error?.message || table.error?.message };
    }
    const parsed = JSON.parse(await download.data.text());
    return {
        backend: "storage",
        userId,
        items: Array.isArray(parsed.items) ? parsed.items : [],
    };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const creds = await credentials();

    const apiPuts = [];
    const apiGets = [];
    page.on("response", async (response) => {
        const url = response.url();
        if (!url.includes("/api/media-queue")) return;
        try {
            const body = await response.json();
            if (response.request().method() === "PUT") apiPuts.push({ status: response.status(), body });
            if (response.request().method() === "GET") apiGets.push({ status: response.status(), body });
        }
        catch {
            // ignore non-json
        }
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

        // Wait for queue hydrate GET
        await page.waitForTimeout(2500);
        record("Queue hydrate GET observed", apiGets.length > 0, `gets=${apiGets.length}`);

        await clearQueueUi(page);
        await page.waitForTimeout(1500);
        const emptyText = await page.locator(".queue-page").innerText();
        record("Clear queue", /No media queued/i.test(emptyText) || /Add songs or videos/i.test(emptyText));

        // Add real song
        await openNav(page, "Home");
        await page.waitForTimeout(1200);
        const songCard = page.locator("article.song-card").filter({ has: page.locator('button:has-text("Add to Queue")') }).first();
        const songTitle = ((await songCard.locator("h3").first().innerText().catch(() => "song")) || "song").trim();
        await songCard.locator('button:has-text("Add to Queue")').first().click();
        await page.waitForTimeout(1200);
        record("Add song to queue", true, songTitle);

        // Add real video from Videos
        await openNav(page, "Videos");
        await page.waitForTimeout(1500);
        let videoCard = page.locator(".video-card").filter({ hasText: /big business/i }).first();
        if (!(await videoCard.count())) videoCard = page.locator(".video-card").first();
        const videoTitle = ((await videoCard.locator("h3").first().innerText()) || "video").trim();
        await videoCard.locator('button:has-text("Add to Queue")').first().click();
        await page.waitForTimeout(1500);

        const lastPut = apiPuts[apiPuts.length - 1];
        const putItems = lastPut?.body?.items || [];
        const putVideo = putItems.find((item) => item.mediaType === "video");
        record(
            "Video Add to Queue persists playableUrl",
            Boolean(putVideo?.playableUrl),
            putVideo?.playableUrl ? `url=${String(putVideo.playableUrl).slice(0, 90)}` : `puts=${apiPuts.length}`,
        );
        await shot(page, "01-after-add-video");

        await openNav(page, "Queue");
        const mixed = await page.locator(".queue-page").innerText();
        const mixedOk = mixed.toLowerCase().includes(videoTitle.toLowerCase())
            && mixed.toLowerCase().includes(songTitle.toLowerCase())
            && /Song/i.test(mixed)
            && /Video/i.test(mixed);
        record("Queue page shows song + video", mixedOk, `song=${songTitle} video=${videoTitle}`);
        await shot(page, "02-mixed-queue");

        // Play song then video
        const plays = page.locator(".queue-manage-row").getByRole("button", { name: "Play", exact: true });
        if ((await plays.count()) >= 1) {
            await plays.nth(0).click();
            await page.waitForTimeout(1500);
        }
        if ((await plays.count()) >= 2) {
            await plays.nth(1).click();
            await page.waitForTimeout(2000);
        }
        const bodyText = await page.locator("body").innerText();
        const missingUrl = /missing a playable URL/i.test(bodyText);
        record("Player does not report missing URL for queued video", !missingUrl);

        // Confirm server still has playableUrl for THIS user
        const serverAfterPlay = await readServerQueue(sessionUserId);
        const serverVideo = (serverAfterPlay?.items || []).find((item) => item.mediaType === "video");
        const playable = String(serverVideo?.playableUrl || "").trim();
        record(
            "Server queue video playableUrl non-empty",
            Boolean(playable),
            `${serverAfterPlay?.backend || "?"} user=${sessionUserId.slice(0, 8)} ${playable.slice(0, 90)}`,
        );

        // Refresh
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3500);
        await openNav(page, "Queue");
        const afterRefresh = await page.locator(".queue-page").innerText();
        record(
            "Queue survives refresh",
            afterRefresh.toLowerCase().includes(videoTitle.toLowerCase())
                && afterRefresh.toLowerCase().includes(songTitle.toLowerCase())
                && !/No media queued/i.test(afterRefresh),
        );
        await shot(page, "03-after-refresh");

        // Browser restart simulation with auth storageState
        const statePath = path.join(evidenceDir, "storage-state.json");
        await context.storageState({ path: statePath });
        await browser.close();

        const browser2 = await chromium.launch({ headless: true });
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

        // Snapshot server queue before logout
        const beforeLogout = await readServerQueue(sessionUserId);
        const beforeCount = beforeLogout?.items?.length || 0;

        await page2.locator('button:has-text("Logout")').first().click().catch(() => { });
        await page2.waitForTimeout(2500);

        const duringLogout = await readServerQueue(sessionUserId);
        record(
            "Logout does not delete server queue",
            (duringLogout?.items?.length || 0) >= beforeCount && beforeCount >= 2,
            `before=${beforeCount} afterLogout=${duringLogout?.items?.length || 0}`,
        );

        if (creds) {
            const loginVisible = await page2.locator('input[type="email"], input[name="email"]').first().isVisible().catch(() => false);
            if (loginVisible) {
                await page2.fill('input[type="email"], input[name="email"]', creds.email);
                await page2.fill('input[type="password"], input[name="password"]', creds.password);
                await page2.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').first().click();
                await page2.waitForTimeout(5000);
            }
        }
        await openNav(page2, "Queue");
        await page2.waitForTimeout(2000);
        const afterRelogin = await page2.locator(".queue-page").innerText();
        const orderOk = afterRelogin.toLowerCase().includes(songTitle.toLowerCase())
            && afterRelogin.toLowerCase().includes(videoTitle.toLowerCase());
        record("Queue survives logout/login", orderOk);
        await shot(page2, "05-after-relogin");

        const afterReloginServer = await readServerQueue(sessionUserId);
        const afterVideoUrl = String((afterReloginServer?.items || []).find((i) => i.mediaType === "video")?.playableUrl || "").trim();
        record("Relogin restores video playableUrl", Boolean(afterVideoUrl), afterVideoUrl.slice(0, 100));

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
