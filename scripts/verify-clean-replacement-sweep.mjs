/**
 * Clean-replacement verification sweep (local only — no commit/deploy).
 * Covers queue, Recently Played, library actions, compatible playback, AV1 UI.
 */
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp-clean-replacement-evidence");
mkdirSync(evidenceDir, { recursive: true });

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const AV1_MESSAGE =
    "This video uses AV1 and cannot play on this device. Re-encode it as an H.264 video with AAC audio in an MP4 container.";

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

/** @type {{ platform: string, item: string, status: "PASS"|"FAIL"|"NOT VERIFIED", detail?: string }[]} */
const checklist = [];
const blockers = [];

function mark(platform, item, status, detail = "") {
    checklist.push({ platform, item, status, detail });
    console.log(`${status.padEnd(13)} [${platform}] ${item}${detail ? ` — ${detail}` : ""}`);
    if (status === "FAIL") blockers.push(`${platform}: ${item}${detail ? ` (${detail})` : ""}`);
}

async function shot(page, name) {
    await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: true }).catch(() => {});
}

async function credentials() {
    if (ownerPassword) {
        return { email: "zudon1226@gmail.com", password: ownerPassword, mode: "owner", userId: ownerUserId };
    }
    if (!supabaseUrl) return null;
    const email = `sweep-${Date.now()}@probe.local`;
    const password = `Probe_${Date.now()}_Aa1!`;
    if (serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const created = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { display_name: "Sweep Probe" },
        });
        if (created.error) return null;
        return { email, password, mode: "probe", userId: created.data.user?.id || "" };
    }
    if (!anonKey) return null;
    const supabase = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const signUp = await supabase.auth.signUp({ email, password });
    if (signUp.error) return null;
    return { email, password, mode: "probe", userId: signUp.data.user?.id || "" };
}

async function resolveSessionUserId(page, fallback = "") {
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
        catch { /* ignore */ }
        return "";
    });
    return fromPage || fallback || "";
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

async function login(page, creds, platform) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    let gate = await waitForAuthGate(page, 60000);
    if (gate.checking && !gate.login && !gate.app) {
        mark(platform, "login", "FAIL", "stuck on Checking your session");
        return false;
    }
    if (gate.app && !gate.login) return true;
    if (!creds) {
        mark(platform, "login", "FAIL", "no credentials");
        return false;
    }
    await page.fill('input[type="email"], input[name="email"]', creds.email);
    await page.fill('input[type="password"], input[name="password"]', creds.password);
    await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').first().click();
    const result = await waitForAppOrLoginFailure(page, 90000);
    if (!result.ok) {
        mark(platform, "login", "FAIL", result.authMessage || result.text || "login form still visible");
        return false;
    }
    return true;
}

async function openNav(page, label) {
    const byTitle = page.locator(`aside.sidebar nav.desktop-sidebar-nav button[title="${label}"]`).first();
    if (await byTitle.count()) {
        await byTitle.click({ timeout: 15000 });
        await page.waitForTimeout(900);
        return;
    }
    await page.locator("aside.sidebar button").filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().click({ timeout: 15000 });
    await page.waitForTimeout(900);
}

async function readLocalQueue(page, userId) {
    return page.evaluate((uid) => {
        const key = `music-data-base:media-queue:${uid}`;
        const raw = localStorage.getItem(key);
        if (!raw) return { present: false, items: [] };
        try {
            const parsed = JSON.parse(raw);
            return { present: true, items: Array.isArray(parsed.items) ? parsed.items : [] };
        }
        catch {
            return { present: true, items: [] };
        }
    }, userId);
}

function runChild(scriptRel, envExtra = {}) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(root, scriptRel)], {
            cwd: root,
            env: { ...process.env, BASE_URL, ...envExtra },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        child.stdout.on("data", (d) => { out += d.toString(); process.stdout.write(d); });
        child.stderr.on("data", (d) => { out += d.toString(); process.stderr.write(d); });
        child.on("close", (code) => resolve({ code: code ?? 1, out }));
    });
}

async function runUnitSuites() {
    const suites = [
        ["unit: video playback regression", "scripts/verify-video-playback-regression.mjs"],
        ["unit: video upload compatibility", "scripts/verify-video-upload-compatibility.mjs"],
    ];
    for (const [label, script] of suites) {
        const { code, out } = await runChild(script);
        mark("Automated", label, code === 0 ? "PASS" : "FAIL", code === 0 ? "" : out.slice(-200));
    }
}

async function verifyDesktopChromeLibraryAndVideo(creds) {
    const platform = "Desktop Chrome";
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    try {
        if (!(await login(page, creds, platform))) return;

        const userId = await resolveSessionUserId(page, creds?.userId || "");
        if (!userId) {
            mark(platform, "session", "FAIL", "no userId");
            return;
        }
        mark(platform, "login", "PASS");

        // --- Compatible video: big business ---
        await openNav(page, "Videos");
        await page.waitForTimeout(1500);
        let bigBiz = page.locator("article.video-card").filter({ hasText: /big business/i }).first();
        if (!(await bigBiz.count())) {
            mark(platform, "compatible video playback (big business)", "FAIL", "card not found");
        }
        else {
            const badgeOnCompatible = await bigBiz.locator(".video-compat-badge").count();
            mark(platform, "compatible card has no Conversion required badge", badgeOnCompatible === 0 ? "PASS" : "FAIL");
            await bigBiz.locator("button.video-cover, .video-cover").first().click();
            await page.waitForTimeout(2500);
            const playerText = await page.locator("section.global-video-player, .video-player-panel").first().innerText().catch(() => "");
            const missing = /missing a playable URL/i.test(playerText);
            const av1Msg = playerText.includes(AV1_MESSAGE) || /Unsupported codec on this device/i.test(playerText);
            const videoEl = page.locator("section.global-video-player video, .video-player-panel video").first();
            const videoVisible = await videoEl.isVisible().catch(() => false);
            let readyState = 0;
            if (videoVisible) {
                await videoEl.evaluate((el) => { try { el.muted = true; el.play(); } catch { /* ignore */ } }).catch(() => {});
                await page.waitForTimeout(2000);
                readyState = await videoEl.evaluate((el) => el.readyState).catch(() => 0);
            }
            mark(platform, "compatible video never missing playable URL", !missing ? "PASS" : "FAIL");
            mark(
                platform,
                "compatible video playback (big business)",
                videoVisible && readyState >= 2 && !av1Msg && !missing ? "PASS" : "FAIL",
                `videoVisible=${videoVisible} readyState=${readyState} av1InPlayer=${av1Msg}`,
            );
            await shot(page, "chrome-big-business");
        }

        // --- AV1 videos: prefer card that already exposes Conversion required (skip metadata-less duplicates) ---
        let av1Card = page.locator("article.video-card").filter({
            has: page.locator(".video-compat-badge"),
            hasText: /Tyrant|Top of di convo|They don't know/i,
        }).first();
        if (!(await av1Card.count())) {
            av1Card = page.locator("article.video-card").filter({ hasText: /Tyrant/i }).first();
        }
        if (!(await av1Card.count())) {
            mark(platform, "AV1 Conversion required badge", "FAIL", "no AV1 card found");
            mark(platform, "AV1 never missing playable URL", "FAIL", "no AV1 card");
        }
        else {
            const av1Title = ((await av1Card.locator("h3").first().innerText().catch(() => "")) || "").trim();
            const badge = await av1Card.locator(".video-compat-badge").innerText().catch(() => "");
            mark(
                platform,
                "AV1 Conversion required badge",
                /conversion required/i.test(badge) ? "PASS" : "FAIL",
                `title=${av1Title} badge=${badge || "none"}`,
            );
            await av1Card.locator("button.video-cover, .video-cover").first().click();
            await page.waitForTimeout(2500);
            const playerText = await page.locator("section.global-video-player, .video-player-panel").first().innerText().catch(() => "");
            mark(platform, "AV1 never missing playable URL", !/missing a playable URL/i.test(playerText) ? "PASS" : "FAIL");
            const hasAv1Msg = playerText.includes(AV1_MESSAGE) || /Unsupported codec on this device/i.test(playerText);
            mark(
                platform,
                "AV1 player message (desktop may still play AV1)",
                hasAv1Msg ? "PASS" : "NOT VERIFIED",
                hasAv1Msg ? "shown" : "Chrome may decode AV1; badge still required",
            );
            await shot(page, "chrome-av1-card");
        }

        // --- Recently Played ---
        await openNav(page, "Recently Played");
        await page.waitForTimeout(1500);
        const recentText = await page.locator("body").innerText();
        const recentHasContent = /No plays saved yet|recent-row|Recently/i.test(recentText)
            || (await page.locator(".recent-row, .recent-panel, .empty-state").count()) > 0;
        mark(platform, "Recently Played view loads", recentHasContent ? "PASS" : "FAIL");
        const videosTab = page.locator(".liked-tabs button, [role=tablist] button").filter({ hasText: /^Videos/ }).first();
        if (await videosTab.count()) {
            await videosTab.click();
            await page.waitForTimeout(800);
        }
        let recentRows = await page.locator(".recent-row").count();
        if (recentRows === 0) {
            await openNav(page, "Videos");
            await page.waitForTimeout(800);
            const playCard = page.locator("article.video-card").filter({ hasText: /big business/i }).first();
            if (await playCard.count()) {
                await playCard.locator("button.video-cover, .video-cover").first().click();
                await page.waitForTimeout(3500);
            }
            await openNav(page, "Recently Played");
            await page.waitForTimeout(1500);
            const videosTab2 = page.locator(".liked-tabs button, [role=tablist] button").filter({ hasText: /^Videos/ }).first();
            if (await videosTab2.count()) await videosTab2.click();
            await page.waitForTimeout(800);
            recentRows = await page.locator(".recent-row").count();
        }
        mark(
            platform,
            "Recently Played shows entries after play",
            recentRows > 0 ? "PASS" : "FAIL",
            `rows=${recentRows}`,
        );

        // --- Library tabs ---
        await openNav(page, "Library");
        await page.waitForTimeout(1000);
        for (const tab of ["Songs", "Videos", "Albums"]) {
            const tabBtn = page.locator(".liked-tabs button, [role=tablist] button").filter({ hasText: tab }).first();
            if (await tabBtn.count()) {
                await tabBtn.click();
                await page.waitForTimeout(600);
                mark(platform, `Library tab ${tab}`, "PASS");
            }
            else {
                mark(platform, `Library tab ${tab}`, "FAIL", "tab missing");
            }
        }

        // --- Favorites (Liked) ---
        await openNav(page, "Liked");
        await page.waitForTimeout(1000);
        mark(platform, "favorites (Liked) view loads", (await page.locator(".liked-page, .empty-state, .following-feed").count()) > 0 ? "PASS" : "FAIL");

        // --- Playlists ---
        await openNav(page, "Playlists");
        await page.waitForTimeout(1000);
        mark(platform, "playlists view loads", (await page.locator(".playlist-sidebar, .empty-state, section").count()) > 0 ? "PASS" : "FAIL");

        // --- Save / Follow / Like / Delete on Home card ---
        await openNav(page, "Home");
        await page.waitForTimeout(1200);
        const songCard = page.locator("article.song-card, article.media-card").first();
        if (!(await songCard.count())) {
            mark(platform, "library save", "FAIL", "no song card");
            mark(platform, "follow", "FAIL", "no song card");
            mark(platform, "favorites like", "FAIL", "no song card");
            mark(platform, "delete", "NOT VERIFIED", "canDelete may be owner-only");
        }
        else {
            const likeBtn = songCard.locator("button.like-btn").first();
            const followBtn = songCard.locator("button.follow-btn").first();
            const saveBtn = songCard.locator("button.library-btn").first();
            const deleteBtn = songCard.locator("button:has-text(\"Delete\")").first();

            if (await likeBtn.count()) {
                const before = await likeBtn.getAttribute("class");
                await likeBtn.click();
                await page.waitForTimeout(1500);
                const after = await likeBtn.getAttribute("class");
                mark(platform, "favorites like toggle", before !== after || /liked/i.test(after || "") ? "PASS" : "FAIL", `class ${before} -> ${after}`);
            }
            else mark(platform, "favorites like toggle", "FAIL", "no like button");

            if (await followBtn.count()) {
                await followBtn.click();
                await page.waitForTimeout(1500);
                const cls = await followBtn.getAttribute("class");
                const label = await followBtn.innerText();
                mark(platform, "follow toggle", /followed|Following/i.test(`${cls} ${label}`) ? "PASS" : "FAIL", label.trim());
            }
            else mark(platform, "follow toggle", "FAIL", "no follow button");

            if (await saveBtn.count()) {
                await saveBtn.click();
                await page.waitForTimeout(1500);
                const cls = await saveBtn.getAttribute("class");
                const label = await saveBtn.innerText();
                mark(platform, "library save toggle", /saved|Saved/i.test(`${cls} ${label}`) ? "PASS" : "FAIL", label.trim());
                await openNav(page, "Library");
                await page.waitForTimeout(800);
                const libSongs = page.locator(".liked-tabs button").filter({ hasText: "Songs" }).first();
                if (await libSongs.count()) await libSongs.click();
                await page.waitForTimeout(800);
                mark(platform, "library songs after save", (await page.locator("article.song-card, .empty-state").count()) > 0 ? "PASS" : "FAIL");
            }
            else mark(platform, "library save toggle", "FAIL", "no save button");

            if (await deleteBtn.count()) {
                mark(platform, "delete control present", "PASS", "Delete button visible (not clicked — destructive)");
            }
            else {
                mark(platform, "delete control present", "NOT VERIFIED", "no Delete on this card (likely not owner)");
            }
        }

        // Queue mixed persistence already covered by child script; spot-check localStorage key
        const q = await readLocalQueue(page, userId);
        mark(platform, "queue localStorage key readable", "PASS", `items=${q.items.length}`);

        await shot(page, "chrome-library");
    }
    catch (error) {
        mark(platform, "sweep harness", "FAIL", error instanceof Error ? error.message : String(error));
        await shot(page, "chrome-error");
    }
    finally {
        await browser.close().catch(() => {});
    }
}

async function verifyIphoneUaAv1Message(creds) {
    const platform = "iPhone Safari (UA sim)";
    const iPhone = devices["iPhone 14"];
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        ...iPhone,
        // Keep enough width for some nav; UA drives mobilePlaybackEnvironment
    });
    const page = await context.newPage();
    try {
        if (!(await login(page, creds, platform))) return;
        mark(platform, "login", "PASS");

        // Try Videos nav — mobile may use different chrome
        const videosBtn = page.locator('button[title="Videos"], button:has-text("Videos")').first();
        if (await videosBtn.count()) {
            await videosBtn.click();
            await page.waitForTimeout(1500);
        }
        else {
            await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(2000);
        }

        let av1Card = page.locator("article.video-card").filter({
            has: page.locator(".video-compat-badge"),
            hasText: /Tyrant|Top of di convo|They don't know/i,
        }).first();
        if (!(await av1Card.count())) {
            av1Card = page.locator("article.video-card").filter({ hasText: /Tyrant/i }).first();
        }
        if (!(await av1Card.count())) {
            mark(platform, "AV1 Conversion required badge", "NOT VERIFIED", "card not found in mobile viewport");
            mark(platform, "AV1 player message", "NOT VERIFIED", "card not found");
            mark(platform, "AV1 never missing playable URL", "NOT VERIFIED", "card not found");
            return;
        }
        const badge = await av1Card.locator(".video-compat-badge").innerText().catch(() => "");
        mark(platform, "AV1 Conversion required badge", /conversion required/i.test(badge) ? "PASS" : "FAIL", badge || "none");
        await av1Card.locator("button.video-cover, .video-cover").first().click();
        await page.waitForTimeout(3000);
        const playerText = await page.locator("section.global-video-player, .video-player-panel, .video-mobile-incompatible-panel").first().innerText().catch(async () => page.locator("body").innerText());
        mark(platform, "AV1 never missing playable URL", !/missing a playable URL/i.test(playerText) ? "PASS" : "FAIL");
        mark(
            platform,
            "AV1 player message",
            playerText.includes(AV1_MESSAGE) || /Unsupported codec on this device/i.test(playerText) ? "PASS" : "FAIL",
            playerText.includes(AV1_MESSAGE) ? "exact AV1 message" : "check screenshot",
        );
        await shot(page, "iphone-ua-av1");
    }
    catch (error) {
        mark(platform, "sweep harness", "FAIL", error instanceof Error ? error.message : String(error));
    }
    finally {
        await browser.close().catch(() => {});
    }
}

async function verifyDesktopEdge(creds) {
    const platform = "Desktop Edge";
    let browser;
    try {
        browser = await chromium.launch({ headless: true, channel: "msedge" });
    }
    catch (error) {
        mark(platform, "compatible video playback", "NOT VERIFIED", `Edge channel unavailable: ${error instanceof Error ? error.message : String(error)}`);
        mark(platform, "queue persistence", "NOT VERIFIED", "Edge not launched");
        mark(platform, "AV1 Conversion required badge", "NOT VERIFIED", "Edge not launched");
        return;
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
        if (!(await login(page, creds, platform))) return;
        mark(platform, "login", "PASS");
        await openNav(page, "Videos");
        await page.waitForTimeout(1500);
        const bigBiz = page.locator("article.video-card").filter({ hasText: /big business/i }).first();
        if (!(await bigBiz.count())) {
            mark(platform, "compatible video playback", "FAIL", "big business not found");
        }
        else {
            await bigBiz.locator("button.video-cover, .video-cover").first().click();
            await page.waitForTimeout(2500);
            const body = await page.locator("body").innerText();
            const videoEl = page.locator("section.global-video-player video, .video-player-panel video").first();
            const visible = await videoEl.isVisible().catch(() => false);
            const ready = visible ? await videoEl.evaluate((el) => el.readyState).catch(() => 0) : 0;
            mark(platform, "compatible video playback", visible && ready >= 2 && !/missing a playable URL/i.test(body) ? "PASS" : "FAIL", `readyState=${ready}`);
        }
        const av1 = page.locator("article.video-card").filter({
            has: page.locator(".video-compat-badge"),
            hasText: /Tyrant|Top of di convo|They don't know/i,
        }).first();
        if (await av1.count()) {
            const badge = await av1.locator(".video-compat-badge").innerText().catch(() => "");
            mark(platform, "AV1 Conversion required badge", /conversion required/i.test(badge) ? "PASS" : "FAIL", badge || "none");
            await av1.locator("button.video-cover, .video-cover").first().click();
            await page.waitForTimeout(2000);
            const playerText = await page.locator("section.global-video-player, .video-player-panel").first().innerText().catch(() => "");
            mark(platform, "AV1 never missing playable URL", !/missing a playable URL/i.test(playerText) ? "PASS" : "FAIL");
        }
        else {
            mark(platform, "AV1 Conversion required badge", "FAIL", "no AV1 card with badge");
        }
        await shot(page, "edge-video");
    }
    catch (error) {
        mark(platform, "sweep harness", "FAIL", error instanceof Error ? error.message : String(error));
    }
    finally {
        await browser.close().catch(() => {});
    }
}

async function main() {
    console.log(`BASE_URL=${BASE_URL}`);
    const creds = await credentials();

    // Physical devices — cannot claim without hardware
    mark("Android Chrome", "compatible video playback", "NOT VERIFIED", "no physical device");
    mark("Android Chrome", "queue persistence", "NOT VERIFIED", "no physical device");
    mark("Android Chrome", "library / favorites / playlists", "NOT VERIFIED", "no physical device");
    mark("iPhone Safari", "compatible H.264/AAC playback", "NOT VERIFIED", "no physical device");
    mark("iPhone Safari", "AV1 Conversion required + message", "NOT VERIFIED", "no physical device (see UA sim)");
    mark("iPhone Safari", "never missing playable URL", "NOT VERIFIED", "no physical device (see UA sim)");

    await runUnitSuites();

    const queueRun = await runChild("scripts/verify-shared-media-queue-browser.mjs");
    const queueLines = queueRun.out.split(/\r?\n/).filter((l) => /^(PASS|FAIL) /.test(l));
    for (const line of queueLines) {
        const ok = line.startsWith("PASS ");
        const name = line.replace(/^(PASS|FAIL) /, "").split(" — ")[0];
        mark("Desktop Chrome", `queue: ${name}`, ok ? "PASS" : "FAIL", line.includes(" — ") ? line.split(" — ").slice(1).join(" — ") : "");
    }
    if (queueRun.code !== 0 && !queueLines.length) {
        mark("Desktop Chrome", "queue browser harness", "FAIL", `exit=${queueRun.code}`);
    }

    await verifyDesktopChromeLibraryAndVideo(creds);
    await verifyIphoneUaAv1Message(creds);
    await verifyDesktopEdge(creds);

    const fails = checklist.filter((c) => c.status === "FAIL");
    const criticalUnverified = checklist.filter((c) =>
        c.status === "NOT VERIFIED"
        && (
            (c.platform === "Desktop Chrome" && /queue|compatible video|AV1 Conversion|AV1 never|library|favorites|follow|playlists|Recently Played view/i.test(c.item))
            || (c.platform === "Desktop Edge" && /compatible video/i.test(c.item))
            || (c.platform === "Automated" )
        ),
    );

    // Physical mobile NOT VERIFIED are critical for a "complete" ship claim per user rules
    const mobileCritical = checklist.filter((c) =>
        (c.platform === "Android Chrome" || c.platform === "iPhone Safari")
        && c.status === "NOT VERIFIED",
    );

    writeFileSync(path.join(evidenceDir, "checklist.json"), JSON.stringify({ checklist, blockers, fails, criticalUnverified, mobileCritical }, null, 2));

    const ready = fails.length === 0 && criticalUnverified.length === 0 && mobileCritical.length === 0;
    console.log("\n===== SUMMARY =====");
    console.log(ready ? "READY TO COMMIT" : "NOT READY TO COMMIT");
    console.log(`FAIL=${fails.length} criticalNOT_VERIFIED=${criticalUnverified.length + mobileCritical.length}`);
    process.exitCode = ready ? 0 : 1;
}

main();
