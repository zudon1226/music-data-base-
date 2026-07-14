/**
 * Focused production library-save probe.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE_URL = process.env.BASE_URL || "https://www.digitalmusicdatabase.com";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const email = `libsave-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
    console.log("CREATE_FAIL", created.error.message);
    process.exit(1);
}

const apiCalls = [];
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("response", async (response) => {
    const url = response.url();
    if (!/library|save/i.test(url)) return;
    let body = "";
    try { body = (await response.text()).slice(0, 300); } catch { /* ignore */ }
    apiCalls.push({ status: response.status(), method: response.request().method(), url: url.slice(0, 120), body });
});

await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector('input[type="password"]', { timeout: 90000 });
await page.fill('input[type="email"], input[name="email"]', email);
await page.fill('input[type="password"], input[name="password"]', password);
await page.locator('button:has-text("Login")').first().click();
await page.waitForSelector("aside.sidebar", { timeout: 120000 });
await page.waitForTimeout(2000);

const songCard = page.locator("article.song-card").first();
const saveBtn = songCard.locator("button.library-btn").first();
const before = {
    className: await saveBtn.getAttribute("class"),
    text: (await saveBtn.innerText()).replace(/\s+/g, " ").trim(),
};
console.log("BEFORE", before);
await saveBtn.click();
await page.waitForTimeout(3000);
const after = {
    className: await saveBtn.getAttribute("class"),
    text: (await saveBtn.innerText()).replace(/\s+/g, " ").trim(),
};
console.log("AFTER", after);
console.log("API", JSON.stringify(apiCalls, null, 2));

await page.locator('aside.sidebar nav.desktop-sidebar-nav button[title="Library"]').click();
await page.waitForTimeout(1500);
const songsTab = page.locator(".liked-tabs button").filter({ hasText: "Songs" }).first();
if (await songsTab.count()) await songsTab.click();
await page.waitForTimeout(1000);
const libraryText = (await page.locator(".liked-page, .content, body").first().innerText()).slice(0, 500);
console.log("LIBRARY_SNIP", libraryText.replace(/\s+/g, " ").slice(0, 400));
console.log("LIBRARY_CARDS", await page.locator("article.song-card").count());
await browser.close();
