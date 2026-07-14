import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const text = readFileSync(".env.local", "utf8");
const env = {};
for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const email = `loginok-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
    console.log("CREATE_FAIL", created.error.message);
    process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(process.env.BASE_URL || "http://127.0.0.1:3001/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[type="password"]', { timeout: 30000 });
await page.fill('input[type="email"], input[name="email"]', email);
await page.fill('input[type="password"], input[name="password"]', password);
await page.locator('button[type="submit"], button:has-text("Login")').first().click();
await page.waitForTimeout(8000);
const state = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 400),
    app: Boolean(document.querySelector(".zml-app, aside.sidebar")),
    login: Boolean(document.querySelector('input[type="password"]')),
    msg: document.querySelector(".auth-message, .auth-error, [class*=auth]")?.textContent || "",
}));
console.log(JSON.stringify(state, null, 2));
const buttons = await page.locator("aside.sidebar button").evaluateAll((els) => els.map((b) => b.getAttribute("title")));
console.log("nav", buttons);
await browser.close();
