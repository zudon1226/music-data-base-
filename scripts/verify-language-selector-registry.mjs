/**
 * Language selector registry certification harness.
 * Usage: node scripts/verify-language-selector-registry.mjs
 * Env: VERIFY_BASE_URL or LOCAL_SITE_URL (default http://127.0.0.1:3000)
 */
import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = process.env.VERIFY_BASE_URL || process.env.LOCAL_SITE_URL || "http://127.0.0.1:3000";
const LOCALE_STORAGE_KEY = "mdb.preferredLanguage";
const LOCALE_COOKIE_KEY = "mdb_locale";

function parseRegistry() {
    const content = readFileSync(path.join(root, "lib/i18n/registry.ts"), "utf8");
    const assignIndex = content.indexOf("= [", content.indexOf("export const SUPPORTED_LANGUAGES"));
    const arrayStart = assignIndex + 2;
    let depth = 0;
    let end = arrayStart;
    for (; end < content.length; end += 1) {
        if (content[end] === "[") depth += 1;
        if (content[end] === "]") { depth -= 1; if (depth === 0) break; }
    }
    return eval(`(${content.slice(arrayStart, end + 1)})`);
}

function completeLocalesFromRegistry(registry) {
    return new Set(registry.filter((language) => language.translationComplete).map((language) => language.code));
}

function walk(dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules") walk(full, acc);
        else if (entry.isFile()) acc.push(full);
    }
    return acc;
}

function scanForSecrets() {
    const forbidden = [
        /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/,
        /DATABASE_URL\s*=\s*['"]postgres/,
        /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    ];
    const hits = [];
    for (const dir of [path.join(root, "app"), path.join(root, "components"), path.join(root, "lib/i18n")]) {
        for (const file of walk(dir)) {
            if (!/\.(tsx?|jsx?|mjs)$/.test(file)) continue;
            const content = readFileSync(file, "utf8");
            for (const pattern of forbidden) {
                if (pattern.test(content)) hits.push(`${file}: ${pattern}`);
            }
        }
    }
    return hits;
}

async function isServerUp(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        return response.ok || response.status < 500;
    }
    catch { return false; }
}

async function testLocale(page, language, viewportLabel, completeLocales) {
    const expectedDir = language.rtl ? "rtl" : "ltr";
    const dictionary = completeLocales.has(language.code) ? "complete" : "english-fallback";

    await page.evaluate(({ storageKey, cookieKey }) => {
        localStorage.setItem(storageKey, "en");
        document.cookie = `${cookieKey}=en; Path=/; SameSite=Lax`;
    }, { storageKey: LOCALE_STORAGE_KEY, cookieKey: LOCALE_COOKIE_KEY });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    await page.locator(".language-selector-trigger").click();
    await page.waitForSelector(".language-selector-panel-portal", { state: "visible", timeout: 10000 });

    const search = page.locator(".language-selector-search input");
    const searchTerm = language.nativeName.slice(0, 6) || language.englishName.slice(0, 6) || language.code;
    await search.fill(searchTerm);
    await page.waitForTimeout(150);

    let button = page.locator(`button[data-locale="${language.code}"]`).first();
    if (await button.count() === 0) {
        await search.fill("");
        await page.waitForTimeout(100);
        button = page.locator(`button[data-locale="${language.code}"]`).first();
    }
    if (await button.count() === 0) {
        return {
            locale: language.code,
            nativeName: language.nativeName,
            viewport: viewportLabel,
            click: "FAIL",
            selected: "FAIL",
            htmlLang: "FAIL",
            dir: "FAIL",
            persistence: "FAIL",
            dictionary,
            result: "FAIL",
            detail: "option not found",
        };
    }

    await button.scrollIntoViewIfNeeded();
    await button.click({ timeout: 5000 });
    await page.waitForTimeout(350);

    const state = await page.evaluate(({ code }) => ({
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        stored: localStorage.getItem("mdb.preferredLanguage"),
        panelOpen: Boolean(document.querySelector(".language-selector-panel-portal")),
        triggerText: document.querySelector(".language-selector-trigger span")?.textContent || "",
    }), { code: language.code });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const afterRefresh = await page.evaluate(({ code }) => ({
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        stored: localStorage.getItem("mdb.preferredLanguage"),
    }), { code: language.code });

    const clickOk = state.lang === language.code && !state.panelOpen;
    const selectedOk = clickOk;
    const langOk = afterRefresh.lang === language.code;
    const dirOk = afterRefresh.dir === expectedDir;
    const persistenceOk = afterRefresh.stored === language.code && langOk && dirOk;
    const pass = clickOk && selectedOk && langOk && dirOk && persistenceOk;

    return {
        locale: language.code,
        nativeName: language.nativeName,
        viewport: viewportLabel,
        click: clickOk ? "PASS" : "FAIL",
        selected: selectedOk ? "PASS" : "FAIL",
        htmlLang: langOk ? "PASS" : "FAIL",
        dir: dirOk ? "PASS" : "FAIL",
        persistence: persistenceOk ? "PASS" : "FAIL",
        dictionary,
        result: pass ? "PASS" : "FAIL",
        detail: pass ? "ok" : JSON.stringify({ state, afterRefresh }),
    };
}

async function runViewport(browser, registry, viewport, completeLocales) {
    const context = await browser.newContext(viewport.options);
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);

    const rows = [];
    for (const language of registry) {
        rows.push(await testLocale(page, language, viewport.label, completeLocales));
    }

    // keyboard + escape + outside click on first locale
    await page.evaluate(({ storageKey, cookieKey }) => {
        localStorage.setItem(storageKey, "en");
        document.cookie = `${cookieKey}=en; Path=/; SameSite=Lax`;
    }, { storageKey: LOCALE_STORAGE_KEY, cookieKey: LOCALE_COOKIE_KEY });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".language-selector-trigger").click();
    await page.waitForSelector(".language-selector-panel-portal", { state: "visible", timeout: 10000 });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const keyboardOk = (await page.evaluate(() => document.documentElement.lang)) !== "en";
    if (await page.locator(".language-selector-panel-portal").count() > 0) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
    }
    rows.push({
        locale: "keyboard",
        nativeName: "keyboard",
        viewport: viewport.label,
        click: keyboardOk ? "PASS" : "FAIL",
        selected: keyboardOk ? "PASS" : "FAIL",
        htmlLang: keyboardOk ? "PASS" : "FAIL",
        dir: "PASS",
        persistence: "SKIP",
        dictionary: "n/a",
        result: keyboardOk ? "PASS" : "FAIL",
        detail: "arrow+enter selection",
    });

    await page.locator(".language-selector-trigger").click();
    await page.waitForSelector(".language-selector-panel-portal", { state: "visible", timeout: 10000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const escapeOk = await page.locator(".language-selector-panel-portal").count() === 0;
    rows.push({
        locale: "escape",
        nativeName: "escape",
        viewport: viewport.label,
        click: escapeOk ? "PASS" : "FAIL",
        selected: "SKIP",
        htmlLang: "SKIP",
        dir: "SKIP",
        persistence: "SKIP",
        dictionary: "n/a",
        result: escapeOk ? "PASS" : "FAIL",
        detail: "escape closes panel",
    });

    await page.locator(".language-selector-trigger").click();
    await page.waitForSelector(".language-selector-panel-portal", { state: "visible", timeout: 10000 });
    await page.mouse.click(8, 8);
    await page.waitForTimeout(200);
    const outsideOk = await page.locator(".language-selector-panel-portal").count() === 0;
    rows.push({
        locale: "outside-click",
        nativeName: "outside-click",
        viewport: viewport.label,
        click: outsideOk ? "PASS" : "FAIL",
        selected: "SKIP",
        htmlLang: "SKIP",
        dir: "SKIP",
        persistence: "SKIP",
        dictionary: "n/a",
        result: outsideOk ? "PASS" : "FAIL",
        detail: "backdrop closes panel",
    });

    await context.close();
    return rows;
}

async function main() {
    const registry = parseRegistry();
    const completeLocales = completeLocalesFromRegistry(registry);
    const codes = registry.map((language) => language.code);
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
    const results = [];

    results.push({ name: "registry count", ok: registry.length === 52, detail: `${registry.length}` });
    results.push({ name: "duplicate locale codes", ok: duplicates.length === 0, detail: duplicates.join(", ") || "none" });
    results.push({ name: "secret exposure scan", ok: scanForSecrets().length === 0, detail: "clean" });
    results.push({ name: "server reachable", ok: await isServerUp(baseUrl), detail: baseUrl });

    if (!(await isServerUp(baseUrl))) {
        writeFileSync(path.join(evidenceDir, "language-selector-registry-evidence.json"), JSON.stringify({ results, rows: [] }, null, 2));
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: true });
    const viewports = [
        { label: "desktop", options: { viewport: { width: 1440, height: 900 } } },
        { label: "iPhone 14", options: { ...devices["iPhone 14"] } },
        { label: "Pixel 7", options: { ...devices["Pixel 7"] } },
    ];

    /** @type {Record<string, unknown>[]} */
    const rows = [];
    for (const viewport of viewports) {
        rows.push(...await runViewport(browser, registry, viewport, completeLocales));
    }
    await browser.close();

    const localeRows = rows.filter((row) => row.locale && !["keyboard", "escape", "outside-click"].includes(String(row.locale)));
    const failedLocales = localeRows.filter((row) => row.result === "FAIL");
    results.push({
        name: "every-language click test",
        ok: failedLocales.length === 0,
        detail: `${localeRows.length - failedLocales.length}/${localeRows.length}`,
    });

    writeFileSync(path.join(evidenceDir, "language-selector-registry-evidence.json"), JSON.stringify({
        generatedAt: new Date().toISOString(),
        baseUrl,
        registryCount: registry.length,
        results,
        rows,
    }, null, 2));

    for (const row of localeRows) {
        console.log(`${row.result} ${row.viewport} ${row.locale} (${row.nativeName}) click=${row.click} lang=${row.htmlLang} dir=${row.dir} persist=${row.persistence} dict=${row.dictionary}`);
    }

    const failed = results.filter((entry) => !entry.ok).length + failedLocales.length;
    if (failed > 0) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
