import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE_URL = "https://www.digitalmusicdatabase.com";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const email = `vidsave-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
await admin.auth.admin.createUser({ email, password, email_confirm: true });

const apiCalls = [];
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("response", async (r) => {
    if (!/library\/save|library-saves/i.test(r.url())) return;
    let body = "";
    try { body = (await r.text()).slice(0, 250); } catch {}
    apiCalls.push({ status: r.status(), method: r.request().method(), body });
});
await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[type="password"]');
await page.fill('input[type="email"], input[name="email"]', email);
await page.fill('input[type="password"], input[name="password"]', password);
await page.locator('button:has-text("Login")').click();
await page.waitForSelector("aside.sidebar", { timeout: 120000 });
await page.locator('aside.sidebar nav.desktop-sidebar-nav button[title="Videos"]').click();
await page.waitForTimeout(2000);
const card = page.locator("article.video-card").filter({ hasText: /big business/i }).first();
const saveBtn = card.locator("button.library-btn").first();
console.log("BEFORE", await saveBtn.innerText());
await saveBtn.click();
await page.waitForTimeout(3000);
console.log("AFTER", await saveBtn.innerText(), await saveBtn.getAttribute("class"));
console.log("API", JSON.stringify(apiCalls, null, 2));
await browser.close();
