/**
 * Browser execution proof on preview: login, capture bootstrap console + first protected fetch.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const PREVIEW_URL = "https://music-data-base-ho0khj8j5-zudon1226-5137s-projects.vercel.app";

function readEnv(name) {
    const text = readFileSync(".env.local", "utf8");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    if (!line) return "";
    return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const email = `browser-probe-${Date.now()}@probe.local`;
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
const apiRequests = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("console", (msg) => {
    const text = msg.text();
    if (
        text.includes("AUTH BOOTSTRAP")
        || text.includes("SESSION FOUND")
        || text.includes("TOKEN READY")
        || text.includes("API READY")
        || text.includes("APP SHELL OPEN")
        || text.includes("shell blocked")
        || text.includes("deferred")
        || text.includes("abort-no-session")
        || text.includes("API credentials not ready")
    ) {
        consoleLogs.push(text);
    }
});

page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/")) {
        const headers = request.headers();
        apiRequests.push({
            url,
            method: request.method(),
            authorizationPresent: headers.authorization ? "YES" : "NO",
            apikeyPresent: headers.apikey ? "YES" : "NO",
        });
    }
});

page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/")) {
        return;
    }
    const entry = apiRequests.find((item) => item.url === url && item.httpStatus === undefined);
    if (!entry) {
        return;
    }
    entry.httpStatus = response.status();
    try {
        entry.responseBody = (await response.text()).slice(0, 400);
    }
    catch {
        entry.responseBody = "";
    }
});

await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 120000 });

await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');

await page.waitForTimeout(8000);

const shellVisible = await page.locator(".zml-app").count();
const likeButtons = await page.locator('button[title*="Like"], button[title*="Unlike"]').count();

console.log("=== BROWSER STATE ===");
console.log(JSON.stringify({
    emailMasked: email.replace(/@.*/, "@***"),
    shellVisible: shellVisible > 0,
    likeButtonCount: likeButtons,
}, null, 2));

console.log("\n=== BOOTSTRAP CONSOLE (filtered) ===");
for (const line of consoleLogs) {
    console.log(line);
}

if (likeButtons > 0) {
    await page.locator('button[title*="Like"], button[title*="Unlike"]').first().click();
    await page.waitForTimeout(3000);
}

const protectedApi = apiRequests.filter((item) =>
    /song-likes|library|artist-follow|playlists|video-upload|library-saves/.test(item.url),
);

console.log("\n=== PROTECTED API REQUESTS FROM BROWSER ===");
for (const item of protectedApi.slice(0, 12)) {
    console.log(JSON.stringify(item, null, 2));
}

await browser.close();

const apiReadyIndex = consoleLogs.findIndex((line) => line.includes("API READY"));
const shellOpenIndex = consoleLogs.findIndex((line) => line.includes("APP SHELL OPEN"));
console.log("\n=== LOG ORDER ===");
console.log(JSON.stringify({
    apiReadyIndex,
    shellOpenIndex,
    apiReadyBeforeShell: apiReadyIndex >= 0 && shellOpenIndex >= 0 && apiReadyIndex < shellOpenIndex,
}, null, 2));

const firstBadApi = protectedApi.find((item) => !item.httpStatus || item.httpStatus >= 400 || item.authorizationPresent === "NO");
if (firstBadApi) {
    console.log("\nFIRST_BROWSER_API_FAILURE");
    console.log(JSON.stringify(firstBadApi, null, 2));
    process.exit(2);
}
