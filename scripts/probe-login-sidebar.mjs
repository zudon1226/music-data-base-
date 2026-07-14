/**
 * Login/sidebar probe — no secret values printed.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp-clean-replacement-evidence");
mkdirSync(evidenceDir, { recursive: true });

function readEnvLocal() {
    const text = readFileSync(path.join(root, ".env.local"), "utf8");
    const map = {};
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        map[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return map;
}

const env = readEnvLocal();
const password = process.env.OWNER_LOGIN_PASSWORD || env.OWNER_LOGIN_PASSWORD || env.ZUDON_LOGIN_PASSWORD || "";
console.log("hasOwnerPassword", Boolean(password));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.clearCookies();
const page = await context.newPage();

await page.goto(process.env.BASE_URL || "http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(10000);

let state = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 500),
    login: Boolean(document.querySelector('input[type="password"], input[name="password"]')),
    checking: /Checking your session/i.test(document.body.innerText),
    app: Boolean(document.querySelector(".zml-app")),
    aside: Boolean(document.querySelector("aside.sidebar")),
}));
console.log("after10s", { login: state.login, checking: state.checking, app: state.app, aside: state.aside, text: state.text.slice(0, 120) });

if (!state.login && state.checking) {
    await page.waitForTimeout(20000);
    state = await page.evaluate(() => ({
        text: document.body.innerText.slice(0, 500),
        login: Boolean(document.querySelector('input[type="password"], input[name="password"]')),
        checking: /Checking your session/i.test(document.body.innerText),
        app: Boolean(document.querySelector(".zml-app")),
        aside: Boolean(document.querySelector("aside.sidebar")),
    }));
    console.log("after30s total", { login: state.login, checking: state.checking, app: state.app, aside: state.aside, text: state.text.slice(0, 120) });
}

if (state.login && password) {
    await page.fill('input[type="email"], input[name="email"]', "zudon1226@gmail.com");
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').first().click();
    for (let i = 0; i < 40; i += 1) {
        await page.waitForTimeout(2000);
        state = await page.evaluate(() => ({
            text: document.body.innerText.slice(0, 400),
            login: Boolean(document.querySelector('input[type="password"], input[name="password"]')),
            checking: /Checking your session/i.test(document.body.innerText),
            app: Boolean(document.querySelector(".zml-app")),
            aside: Boolean(document.querySelector("aside.sidebar")),
            buttons: [...document.querySelectorAll("aside.sidebar button")].map((b) => ({
                title: b.getAttribute("title"),
                text: (b.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
            })),
        }));
        console.log("tick", i, {
            login: state.login,
            checking: state.checking,
            app: state.app,
            aside: state.aside,
            buttonTitles: state.buttons?.map((b) => b.title).filter(Boolean),
        });
        if (state.aside || (state.app && !state.checking && !state.login)) break;
    }
}

writeFileSync(path.join(evidenceDir, "login-probe.json"), JSON.stringify(state, null, 2));
await page.screenshot({ path: path.join(evidenceDir, "login-probe.png"), fullPage: true }).catch(() => {});
await browser.close();
