/**
 * Diagnose auth hang — console + network + timeouts.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp-clean-replacement-evidence");
mkdirSync(evidenceDir, { recursive: true });

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const logs = [];
const pageErrors = [];
const failed = [];

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
});

await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 120000 }).catch(async () => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
});

for (let i = 0; i < 15; i += 1) {
    await page.waitForTimeout(2000);
    const snap = await page.evaluate(() => ({
        text: document.body?.innerText?.slice(0, 200) || "",
        scripts: document.scripts.length,
        reactRoot: Boolean(document.querySelector("next-route-announcer, #__next, body > div")),
        hasAuthProviderHint: Boolean(document.querySelector(".auth-page, .zml-app, aside.sidebar")),
    }));
    console.log("tick", i, snap);
    if (/Log in|Sign in|email/i.test(snap.text) || snap.text.includes("zml") || /Home|Videos|Queue/.test(snap.text)) {
        break;
    }
}

writeFileSync(path.join(evidenceDir, "auth-hang.json"), JSON.stringify({
    logs: logs.slice(0, 80),
    pageErrors,
    failed: failed.slice(0, 40),
}, null, 2));
console.log("pageErrors", pageErrors.slice(0, 10));
console.log("failed", failed.slice(0, 20));
console.log("logSample", logs.filter((l) => /error|auth|bootstrap|supabase/i.test(l)).slice(0, 30));
await page.screenshot({ path: path.join(evidenceDir, "auth-hang.png") });
await browser.close();
