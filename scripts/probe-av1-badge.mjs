import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const email = `badge-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
await admin.auth.admin.createUser({ email, password, email_confirm: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(process.env.BASE_URL || "http://127.0.0.1:3001/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[type="password"]');
await page.fill('input[type="email"], input[name="email"]', email);
await page.fill('input[type="password"], input[name="password"]', password);
await page.locator('button:has-text("Login")').first().click();
await page.waitForSelector("aside.sidebar", { timeout: 60000 });
await page.locator('aside.sidebar nav.desktop-sidebar-nav button[title="Videos"]').click();
await page.waitForTimeout(2500);

const cards = await page.evaluate(() => {
    return [...document.querySelectorAll("article.video-card")].map((card) => ({
        title: card.querySelector("h3")?.textContent?.trim() || "",
        badge: card.querySelector(".video-compat-badge")?.textContent?.trim() || "",
        warning: card.querySelector(".video-compat-warning")?.textContent?.trim() || "",
    }));
});
console.log(JSON.stringify(cards, null, 2));

const api = await page.evaluate(async () => {
    const res = await fetch("/api/videos");
    const json = await res.json();
    const list = Array.isArray(json) ? json : (json.videos || json.data || []);
    return (list || []).map((v) => ({
        title: v.title,
        video_codec: v.video_codec || v.videoCodec,
        mobile_compatible: v.mobile_compatible ?? v.mobileCompatible,
        compatibility_status: v.compatibility_status || v.compatibilityStatus,
    }));
});
console.log("api", JSON.stringify(api, null, 2));
await browser.close();
