/**
 * Execution proof: login on preview, click protected actions, capture API traffic.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const PREVIEW_URL = process.env.PREVIEW_URL
    || "https://music-data-base-ho0khj8j5-zudon1226-5137s-projects.vercel.app";

function readEnv(name) {
    const text = readFileSync(".env.local", "utf8");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    if (!line) return "";
    return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const email = `probe-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;

const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const signUp = await supabase.auth.signUp({ email, password });
if (signUp.error) {
    console.log("SETUP_SIGNUP_FAILED", signUp.error.message);
    process.exit(1);
}

const consoleLogs = [];
const apiTraffic = [];

function pushApiRecord(record) {
    apiTraffic.push(record);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (msg) => {
    consoleLogs.push(msg.text());
});

page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("/api/")) {
        return;
    }
    const headers = request.headers();
    pushApiRecord({
        phase: "request",
        url,
        method: request.method(),
        authorizationPresent: headers.authorization ? "YES" : "NO",
        apikeyPresent: headers.apikey ? "YES" : "NO",
    });
});

page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/")) {
        return;
    }
    const pending = [...apiTraffic].reverse().find((item) =>
        item.url === url
        && item.method === response.request().method()
        && item.httpStatus === undefined,
    );
    let body = "";
    try {
        body = (await response.text()).slice(0, 500);
    }
    catch {
        body = "";
    }
    if (pending) {
        pending.httpStatus = response.status();
        pending.responseBody = body;
        return;
    }
    const headers = response.request().headers();
    pushApiRecord({
        phase: "response-only",
        url,
        method: response.request().method(),
        httpStatus: response.status(),
        responseBody: body,
        authorizationPresent: headers.authorization ? "YES" : "NO",
        apikeyPresent: headers.apikey ? "YES" : "NO",
    });
});

await page.goto(PREVIEW_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');

await page.waitForSelector(".zml-app", { timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator(".like-btn").first().waitFor({ state: "visible", timeout: 60000 }).catch(() => undefined);

const actionResults = [];

function summarizeCalls(calls, pattern, writeOnly = true) {
    const filtered = calls.filter((item) => pattern.test(item.url));
    const match = writeOnly
        ? filtered.find((item) => item.method && item.method !== "GET")
        : filtered[0];
    if (!match) {
        return {
            requestUrl: null,
            httpStatus: null,
            responseBody: null,
            authorizationPresent: "NO",
            apikeyPresent: "NO",
            note: "no matching /api request observed",
        };
    }
    return {
        requestUrl: match.url,
        method: match.method ?? null,
        httpStatus: match.httpStatus ?? null,
        responseBody: match.responseBody ?? "",
        authorizationPresent: match.authorizationPresent ?? "NO",
        apikeyPresent: match.apikeyPresent ?? "NO",
    };
}

async function runAction(label, clickFn, pattern) {
    const before = apiTraffic.length;
    const clickResult = await clickFn();
    await page.waitForTimeout(3500);
    const calls = apiTraffic.slice(before).filter((item) => item.url?.includes("/api/"));
    actionResults.push({ action: label, click: clickResult, ...summarizeCalls(calls, pattern) });
}

await runAction("Like", async () => {
    const heart = page.locator("article.song-card button.like-btn:not([disabled])").first();
    if (await heart.count() === 0) return { clicked: false, reason: "no enabled song-card like-btn" };
    await heart.scrollIntoViewIfNeeded();
    await heart.click();
    return { clicked: true };
}, /\/api\/song-likes/i);

await runAction("Save", async () => {
    const save = page.locator("button.library-btn:not([disabled])").first();
    if (await save.count() === 0) return { clicked: false, reason: "no enabled library-btn" };
    await save.scrollIntoViewIfNeeded();
    await save.click();
    return { clicked: true };
}, /\/api\/library\/save/i);

await runAction("Follow", async () => {
    const follow = page.locator("button.follow-btn:not([disabled])").first();
    if (await follow.count() === 0) return { clicked: false, reason: "no enabled follow-btn" };
    await follow.scrollIntoViewIfNeeded();
    await follow.click();
    return { clicked: true };
}, /\/api\/artist-follow/i);

await runAction("Playlist", async () => {
    await page.locator('button:has-text("Playlists")').first().click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const input = page.locator('input[name="playlistName"]');
    if (await input.count() === 0) return { clicked: false, reason: "playlist form missing" };
    await input.fill(`Probe ${Date.now()}`);
    const beforeSubmit = apiTraffic.length;
    await page.locator('form.playlist-create button[type="submit"]').click({ timeout: 5000 }).catch(() => undefined);
    return { clicked: true, submitCalls: apiTraffic.length - beforeSubmit };
}, /\/api\/playlists/i);

await runAction("Upload", async () => {
    const upload = page.locator('button:has-text("Upload")').first();
    if (await upload.count() === 0) return { clicked: false, reason: "no upload button" };
    await upload.click();
    return { clicked: true };
}, /\/api\/(video-upload|upload-audio|upload-video)/i);

await runAction("Library", async () => {
    const library = page.locator('button:has-text("Library")').first();
    if (await library.count() === 0) return { clicked: false, reason: "no library nav" };
    await library.click();
    return { clicked: true };
}, /\/api\/library-saves/i, false);

const bootstrapMarkers = [
    "AUTH BOOTSTRAP START",
    "SESSION FOUND",
    "TOKEN READY",
    "API READY",
    "APP SHELL OPEN",
    "TOKEN READY FAILED",
    "shell blocked",
    "deferred",
    "abort-no-session",
    "API credentials not ready",
];

console.log("=== BOOTSTRAP CONSOLE (execution) ===");
for (const line of consoleLogs) {
    if (bootstrapMarkers.some((marker) => line.includes(marker))) {
        console.log(line);
    }
}

const shellVisible = await page.locator(".zml-app").count();
console.log("\n=== SHELL STATE ===");
console.log(JSON.stringify({ shellVisible: shellVisible > 0 }, null, 2));

console.log("\n=== PER-ACTION PROOF ===");
for (const item of actionResults) {
    console.log(JSON.stringify(item, null, 2));
    console.log("---");
}

const protectedPatterns = /song-likes|library-saves|library\/save|artist-follow|playlists|video-upload|user-music-state/;
const protectedCalls = apiTraffic.filter((item) => protectedPatterns.test(item.url));

console.log("\n=== ALL PROTECTED API TRAFFIC ===");
for (const item of protectedCalls) {
    console.log(JSON.stringify({
        url: item.url,
        method: item.method,
        httpStatus: item.httpStatus ?? "pending",
        responseBody: item.responseBody ?? "",
        authorizationPresent: item.authorizationPresent ?? "NO",
        apikeyPresent: item.apikeyPresent ?? "NO",
    }, null, 2));
    console.log("---");
}

const apiReadyLine = consoleLogs.find((line) => /\bAPI READY\b/.test(line) && !line.includes("waiting for"));
const shellOpenLine = consoleLogs.find((line) => line.includes("APP SHELL OPEN"));
const tokenFailLine = consoleLogs.find((line) => line.includes("TOKEN READY FAILED"));

console.log("\n=== BOOTSTRAP STOP ANALYSIS ===");
console.log(JSON.stringify({
    sawApiReady: Boolean(apiReadyLine),
    sawAppShellOpen: Boolean(shellOpenLine),
    apiReadyBeforeShell: Boolean(apiReadyLine && shellOpenLine
        && consoleLogs.indexOf(apiReadyLine) < consoleLogs.indexOf(shellOpenLine)),
    tokenReadyFailedLine: tokenFailLine || null,
    apiReadyLine: apiReadyLine || null,
    shellOpenLine: shellOpenLine || null,
}, null, 2));

const writeFailures = actionResults.filter((item) =>
    item.click?.clicked
    && item.requestUrl
    && (item.authorizationPresent === "NO"
        || item.apikeyPresent === "NO"
        || !item.httpStatus
        || item.httpStatus >= 400),
);

const firstWriteFailure = writeFailures[0] || protectedCalls.find((item) =>
    item.method !== "GET"
    && (item.authorizationPresent === "NO"
        || item.apikeyPresent === "NO"
        || !item.httpStatus
        || item.httpStatus >= 400),
);

const authErrorLines = consoleLogs.filter((line) =>
    /authorization|auth token|missing.*token|invalid.*token|credentials not ready|Log in before|login required/i.test(line),
);
const ssoCorsLines = consoleLogs.filter((line) =>
    /CORS|vercel.*sso|sso.*vercel|Access-Control|abort-no-session/i.test(line),
);
const loginFormVisible = await page.locator('input[name="email"]').count();
const currentUrl = page.url();

console.log("\n=== PRODUCTION CONFIRMATION ===");
console.log(JSON.stringify({
    targetUrl: PREVIEW_URL,
    loginStaysInApp: shellVisible > 0 && loginFormVisible === 0,
    currentUrl,
    authErrorLines,
    ssoCorsLines,
    actions: {
        like: actionResults.find((item) => item.action === "Like"),
        save: actionResults.find((item) => item.action === "Save"),
        follow: actionResults.find((item) => item.action === "Follow"),
        playlist: actionResults.find((item) => item.action === "Playlist"),
        library: actionResults.find((item) => item.action === "Library"),
    },
}, null, 2));

if (loginFormVisible > 0 || shellVisible === 0) {
    console.log("\nLOGIN_DID_NOT_STAY_IN_APP");
    process.exit(3);
}
if (authErrorLines.length > 0 || ssoCorsLines.length > 0) {
    console.log("\nAUTH_OR_SSO_CORS_ERRORS_DETECTED");
    process.exit(4);
}

const requiredWrites = ["Like", "Save", "Follow", "Playlist"];
const missingWrites = requiredWrites.filter((name) => {
    const item = actionResults.find((row) => row.action === name);
    return !item?.requestUrl || item.httpStatus >= 400;
});
if (missingWrites.length > 0) {
    console.log("\nMISSING_WRITE_PROOF", missingWrites);
    process.exit(5);
}

const libraryLoad = protectedCalls.find((item) =>
    /library-saves/.test(item.url) && item.method === "GET" && item.httpStatus === 200,
);
if (!libraryLoad) {
    console.log("\nLIBRARY_LOAD_FAILED");
    process.exit(6);
}

if (firstWriteFailure) {
    console.log("\nFIRST_PROTECTED_ACTION_FAILURE");
    console.log(JSON.stringify(firstWriteFailure, null, 2));
    process.exit(2);
}

await browser.close();
process.exit(0);
