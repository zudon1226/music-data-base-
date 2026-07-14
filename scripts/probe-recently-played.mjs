import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const email = `recent-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
await admin.auth.admin.createUser({ email, password, email_confirm: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const logs = [];
page.on("console", (m) => {
    const t = m.text();
    if (/recent|music-state|error/i.test(t)) logs.push(t.slice(0, 200));
});
await page.goto(process.env.BASE_URL || "http://127.0.0.1:3001/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[type="password"]');
await page.fill('input[type="email"], input[name="email"]', email);
await page.fill('input[type="password"], input[name="password"]', password);
await page.locator('button:has-text("Login")').first().click();
await page.waitForSelector("aside.sidebar", { timeout: 60000 });
await page.locator('aside.sidebar nav.desktop-sidebar-nav button[title="Videos"]').click();
await page.waitForTimeout(1500);
await page.locator("article.video-card").filter({ hasText: /big business/i }).first().locator("button.video-cover, .video-cover").first().click();
await page.waitForTimeout(5000);
await page.locator('aside.sidebar nav.desktop-sidebar-nav button[title="Recently Played"]').click();
await page.waitForTimeout(2500);
const snap = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 600),
    rows: document.querySelectorAll(".recent-row").length,
    empty: document.querySelector(".empty-state")?.textContent || "",
    lsKeys: Object.keys(localStorage).filter((k) => /recent|music|ums/i.test(k)),
}));
console.log(JSON.stringify({ snap, logs: logs.slice(0, 20) }, null, 2));
await browser.close();
