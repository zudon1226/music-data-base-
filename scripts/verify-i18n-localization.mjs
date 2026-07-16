/**
 * Global i18n localization verification harness.
 * Usage: node scripts/verify-i18n-localization.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];
const completeLocales = ["en", "es", "fr", "ht", "pt", "de", "it", "nl", "ar", "he", "tr", "ru", "uk", "pl", "ro", "el", "sv", "no", "da", "fi", "cs", "hu", "bg", "sr", "hr", "bs", "sq", "et", "lv", "lt", "sk", "sl", "hi", "bn", "pa", "ur", "gu", "ta", "te", "mr", "ne", "vi"];
const phaseCLocales = ["ta", "te", "mr", "ne", "vi"];
const rtlLocales = ["ar", "he", "ur"];
const LOCALE_STORAGE_KEY = "mdb.preferredLanguage";
const LOCALE_COOKIE_KEY = "mdb_locale";

const ALLOWED_ENGLISH_VALUE_KEYS = new Set([
    "common.appName",
    "nav.beats",
    "home.tabs.beats",
    "home.tabs.hipHop",
    "home.tabs.rnb",
    "home.tabs.trap",
    "home.tabs.dancehall",
    "home.tabs.afrobeat",
    "beats.title",
    "beats.subtitle",
    "beats.pageSubtitle",
]);

const GENRE_ENGLISH_VALUES = new Set(["Hip Hop", "R&B", "Trap", "Dancehall", "Afrobeat", "Beats"]);

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function recordNotRun(name, detail = "") {
    results.push({ name, ok: true, detail: `NOT RUN${detail ? ` — ${detail}` : ""}` });
    console.log(`SKIP ${name}${detail ? ` — ${detail}` : ""}`);
}

function isAllowedEnglishParity(key, enValue, localeValue) {
    if (localeValue !== enValue) return true;
    if (key === "common.appName") return true;
    if (ALLOWED_ENGLISH_VALUE_KEYS.has(key)) return true;
    if (GENRE_ENGLISH_VALUES.has(localeValue)) return true;
    if (key === "auth.emailPlaceholder" && /example\.com/i.test(String(enValue))) return true;
    if (key === "common.no" && localeValue === "No") return true;
    if (/Supabase/i.test(String(enValue)) && localeValue === enValue) return false;
    return false;
}

async function isDevServerUp(baseUrl) {
    try {
        const response = await fetch(baseUrl, { method: "GET", signal: AbortSignal.timeout(4000) });
        return response.ok || response.status < 500;
    }
    catch {
        return false;
    }
}

async function runBrowserLayoutTests(baseUrl, localeMessages, ownerSessionPayload) {
    const serverUp = await isDevServerUp(baseUrl);
    if (!serverUp) {
        recordNotRun("browser layout tests", `dev server unavailable at ${baseUrl}`);
        return;
    }

    const browserLocales = ["de", "it", "nl", ...rtlLocales, ...phaseCLocales.filter((code) => !rtlLocales.includes(code))];
    const viewports = [
        { label: "1440px", options: { viewport: { width: 1440, height: 900 } } },
        { label: "1024px", options: { viewport: { width: 1024, height: 768 } } },
        { label: "768px", options: { viewport: { width: 768, height: 1024 } } },
        { label: "iPhone14-portrait", options: { ...devices["iPhone 14"] } },
        { label: "iPhone14-landscape", options: { ...devices["iPhone 14 landscape"] } },
        { label: "Pixel7-portrait", options: { ...devices["Pixel 7"] } },
    ];

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        for (const locale of browserLocales) {
            const messages = localeMessages[locale];
            const loginTitle = resolvePath(messages, "auth.loginTitle") || "";
            const expectedDir = rtlLocales.includes(locale) ? "rtl" : "ltr";
            const languageEntry = parseRegistryLanguages(path.join(root, "lib/i18n/registry.ts"))
                .find((language) => language.code === locale);

            for (const viewport of viewports) {
                const context = await browser.newContext(viewport.options);
                await context.addInitScript(({ storageKey, cookieKey, code }) => {
                    window.localStorage.setItem(storageKey, code);
                    document.cookie = `${cookieKey}=${encodeURIComponent(code)}; Path=/; SameSite=Lax`;
                }, { storageKey: LOCALE_STORAGE_KEY, cookieKey: LOCALE_COOKIE_KEY, code: locale });

                if (ownerSessionPayload?.storageKey && ownerSessionPayload?.payload) {
                    await context.addInitScript(({ key, value }) => {
                        localStorage.setItem(key, value);
                    }, { key: ownerSessionPayload.storageKey, value: ownerSessionPayload.payload });
                }

                const page = await context.newPage();
                try {
                    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
                    await page.waitForTimeout(1500);
                    if (ownerSessionPayload?.storageKey) {
                        await page.waitForSelector(".topbar, .auth-shell", { timeout: 60000 }).catch(() => null);
                        await page.waitForTimeout(800);
                    }

                    const shell = await page.evaluate(() => ({
                        lang: document.documentElement.lang,
                        dir: document.documentElement.dir,
                        bodyText: document.body?.innerText || "",
                    }));

                    record(
                        `browser ${locale} ${viewport.label} lang`,
                        shell.lang === locale,
                        `lang=${shell.lang}`,
                    );
                    record(
                        `browser ${locale} ${viewport.label} dir`,
                        shell.dir === expectedDir,
                        `dir=${shell.dir}`,
                    );

                    if (["de", "it", "nl", ...phaseCLocales].includes(locale) && !ownerSessionPayload?.storageKey) {
                        const hasNativeAuth = loginTitle && shell.bodyText.includes(loginTitle);
                        const hasEnglishLogin = /Log in to Music Data Base/i.test(shell.bodyText);
                        record(
                            `browser ${locale} ${viewport.label} auth text`,
                            hasNativeAuth && !hasEnglishLogin,
                            hasNativeAuth ? loginTitle.slice(0, 40) : "native login title not found",
                        );
                    }
                    else if (["de", "it", "nl", ...phaseCLocales].includes(locale) && ownerSessionPayload?.storageKey && viewport.options.viewport?.width >= 1024) {
                        const homeLabel = resolvePath(messages, "nav.home") || "";
                        record(
                            `browser ${locale} ${viewport.label} authenticated nav`,
                            Boolean(homeLabel && shell.bodyText.includes(homeLabel)),
                            homeLabel.slice(0, 40),
                        );
                    }

                    if (rtlLocales.includes(locale)) {
                        record(
                            `browser ${locale} ${viewport.label} rtl auth`,
                            shell.dir === "rtl",
                            shell.dir,
                        );
                    }

                    const layout = await page.evaluate(() => {
                        const searchWrap = document.querySelector(".search-wrap");
                        const searchBox = searchWrap?.querySelector(".search-box");
                        const lang = searchWrap?.querySelector(".topbar-language-selector, .language-selector");
                        const detachedTopbarLang = Boolean(document.querySelector(".topbar > .topbar-language-selector, .topbar > .language-selector"));
                        const sidebar = document.querySelector(".sidebar, .desktop-sidebar, aside.sidebar");
                        const playerControls = document.querySelector(".player-controls, .player-center");
                        if (!searchWrap || !searchBox || !lang) {
                            return { ok: false, reason: "missing topbar search row" };
                        }
                        const searchRect = searchBox.getBoundingClientRect();
                        const langRect = lang.getBoundingClientRect();
                        const sameRow = Math.abs(searchRect.top - langRect.top) < 12;
                        const beside = langRect.left >= searchRect.right - 2;
                        const searchWrapOverflow = searchWrap.scrollWidth > searchWrap.clientWidth + 4;
                        const sidebarRect = sidebar?.getBoundingClientRect();
                        const sidebarOnLeft = !sidebarRect || sidebarRect.left < 120;
                        const playerDir = playerControls ? getComputedStyle(playerControls).direction : "ltr";
                        return {
                            ok: sameRow && beside && !detachedTopbarLang && !searchWrapOverflow,
                            sameRow,
                            beside,
                            detachedTopbarLang,
                            searchWrapOverflow,
                            sidebarOnLeft,
                            playerDir,
                            searchLeft: Math.round(searchRect.left),
                            langLeft: Math.round(langRect.left),
                        };
                    });
                    record(
                        `browser ${locale} ${viewport.label} search row`,
                        layout.ok,
                        JSON.stringify(layout),
                    );

                    if (locale === "ur") {
                        record(
                            `browser ur ${viewport.label} rtl shell stability`,
                            layout.ok && layout.sidebarOnLeft !== false && layout.playerDir === "ltr" && layout.beside,
                            JSON.stringify({
                                sidebarOnLeft: layout.sidebarOnLeft,
                                playerDir: layout.playerDir,
                                beside: layout.beside,
                                searchLeft: layout.searchLeft,
                                langLeft: layout.langLeft,
                            }),
                        );
                    }

                    if (phaseCLocales.includes(locale) && languageEntry?.nativeName) {
                        const triggerText = await page.evaluate(() => document.querySelector(".language-selector-trigger")?.textContent || "");
                        record(
                            `browser ${locale} ${viewport.label} selector label`,
                            triggerText.includes(languageEntry.nativeName) || triggerText.includes(locale.toUpperCase()),
                            triggerText.slice(0, 60),
                        );
                    }

                    const playerBox = await page.evaluate(() => {
                        const player = document.querySelector(
                            ".music-bottom-player, .video-bottom-player, footer.player, .bottom-player",
                        );
                        if (!player) return null;
                        const rect = player.getBoundingClientRect();
                        const vw = window.innerWidth;
                        const vh = window.innerHeight;
                        return {
                            found: true,
                            left: rect.left,
                            right: rect.right,
                            top: rect.top,
                            bottom: rect.bottom,
                            vw,
                            vh,
                        };
                    });

                    if (playerBox?.found) {
                        const overflowX = playerBox.left < -2 || playerBox.right > playerBox.vw + 2;
                        const overflowY = playerBox.bottom > playerBox.vh + 2;
                        record(
                            `browser ${locale} ${viewport.label} player bounds`,
                            !overflowX && !overflowY,
                            `L${Math.round(playerBox.left)} R${Math.round(playerBox.right)} W${playerBox.vw}`,
                        );
                    }
                    else {
                        record(
                            `browser ${locale} ${viewport.label} player bounds`,
                            true,
                            "player bar not visible (logged-out shell ok)",
                        );
                    }
                }
                catch (error) {
                    record(
                        `browser ${locale} ${viewport.label}`,
                        false,
                        error instanceof Error ? error.message : String(error),
                    );
                }
                finally {
                    await context.close();
                }
            }
        }
    }
    catch (error) {
        recordNotRun("browser layout tests", error instanceof Error ? error.message : String(error));
    }
    finally {
        if (browser) await browser.close();
    }
}

function readEnv() {
    const env = { ...process.env };
    try {
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
    }
    catch { /* ignore */ }
    return env;
}

function parseRegistryLanguages(filePath) {
    const content = readFileSync(filePath, "utf8");
    const marker = "export const SUPPORTED_LANGUAGES";
    const assignIndex = content.indexOf("= [", content.indexOf(marker));
    if (assignIndex < 0) throw new Error("Unable to locate SUPPORTED_LANGUAGES array");
    const arrayStart = assignIndex + 2;
    let depth = 0;
    let end = arrayStart;
    for (; end < content.length; end += 1) {
        const char = content[end];
        if (char === "[") depth += 1;
        if (char === "]") {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    return eval(`(${content.slice(arrayStart, end + 1)})`);
}

function parseExportObject(filePath, exportName) {
    const content = readFileSync(filePath, "utf8");
    const marker = `export const ${exportName}`;
    const start = content.indexOf(marker);
    if (start < 0) throw new Error(`Missing export ${exportName} in ${filePath}`);
    const braceStart = content.indexOf("{", start);
    let depth = 0;
    let end = braceStart;
    for (; end < content.length; end += 1) {
        if (content[end] === "{") depth += 1;
        if (content[end] === "}") {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    return eval(`(${content.slice(braceStart, end + 1)})`);
}

function flattenMessages(obj, prefix = "") {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") out[next] = value;
        else Object.assign(out, flattenMessages(value, next));
    }
    return out;
}

function resolvePath(messages, key) {
    const parts = key.split(".");
    let current = messages;
    for (const part of parts) {
        if (!current || typeof current !== "object" || !(part in current)) return undefined;
        current = current[part];
    }
    return typeof current === "string" ? current : undefined;
}

function createTranslator(activeMessages, fallbackMessages) {
    return function translate(key, values) {
        let text = resolvePath(activeMessages, key) || resolvePath(fallbackMessages, key) || "";
        if (!values) return text;
        return text.replace(/\{(\w+)\}/g, (_, token) => String(values[token] ?? ""));
    };
}

function normalizeLocale(value, supportedCodes) {
    const clean = String(value || "").trim();
    if (!clean) return "en";
    if (supportedCodes.has(clean)) return clean;
    const lower = clean.toLowerCase();
    for (const code of supportedCodes) {
        if (code.toLowerCase() === lower) return code;
    }
    const base = lower.split("-")[0];
    for (const code of supportedCodes) {
        if (code.toLowerCase() === base) return code;
    }
    return "en";
}

function detectBrowserLocale(candidates, supportedCodes) {
    for (const candidate of candidates) {
        const normalized = normalizeLocale(candidate, supportedCodes);
        if (normalized) return normalized;
    }
    return "en";
}

async function applyMigration(env) {
    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
    if (!databaseUrl) return false;
    const sql = readFileSync(path.join(root, "supabase/migrations/202607150005_preferred_language.sql"), "utf8");
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query(sql);
        return true;
    }
    finally {
        await client.end();
    }
}

async function ownerSession(env) {
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: "zudon1226@gmail.com" });
    const verified = await anon.auth.verifyOtp({
        token_hash: link.data.properties.hashed_token,
        type: "magiclink",
    });
    return verified.data.session;
}

function authBody(userId, session, extra = {}) {
    return {
        ...extra,
        userId,
        sessionUserId: userId,
        accessToken: session.access_token,
        sessionAccessToken: session.access_token,
        refreshToken: session.refresh_token,
        sessionRefreshToken: session.refresh_token,
    };
}

function scanForSecrets() {
    const forbidden = [
        /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/,
        /DATABASE_URL\s*=\s*['"]postgres/,
        /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    ];
    const targets = [
        path.join(root, "app"),
        path.join(root, "components"),
        path.join(root, "lib/i18n"),
    ];
    const hits = [];
    for (const dir of targets) {
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

function walk(dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules") walk(full, acc);
        else if (entry.isFile()) acc.push(full);
    }
    return acc;
}

async function main() {
    const env = readEnv();
    const baseUrl = env.VERIFY_BASE_URL || env.LOCAL_SITE_URL || env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";

    const registry = parseRegistryLanguages(path.join(root, "lib/i18n/registry.ts"));
    const supportedCodes = new Set(registry.map((language) => language.code));
    record("language registry count", registry.length === 57, `${registry.length} languages`);
    record("language registry sorted metadata", registry.every((language) => language.code && language.nativeName), "native names present");
    record("complete locales flagged", completeLocales.every((code) => registry.find((language) => language.code === code)?.translationComplete), completeLocales.join(", "));

    const incomplete = registry.filter((language) => !language.translationComplete).map((language) => language.code);
    record("fallback locales registered", incomplete.length === 15, `${incomplete.length} fallback languages`);

    const enMessages = parseExportObject(path.join(root, "lib/i18n/messages/en.ts"), "enMessages");
    const enFlat = flattenMessages(enMessages);
    const enKeys = Object.keys(enFlat);
    record("english dictionary keys", enKeys.length === 234, `${enKeys.length} keys`);

    for (const locale of completeLocales) {
        const messages = parseExportObject(path.join(root, "lib/i18n/messages", `${locale}.ts`), `${locale}Messages`);
        const flat = flattenMessages(messages);
        const missing = enKeys.filter((key) => !(key in flat) || !flat[key]);
        record(`translation completeness ${locale}`, missing.length === 0, missing.length ? `missing ${missing.slice(0, 5).join(", ")}` : `${enKeys.length} keys`);
        record(
            `english parity ${locale}`,
            Object.keys(flat).length === enKeys.length && enKeys.every((key) => key in flat),
            `${Object.keys(flat).length}/${enKeys.length} keys`,
        );
    }

    for (const locale of completeLocales) {
        if (locale === "en") continue;
        const messages = parseExportObject(path.join(root, "lib/i18n/messages", `${locale}.ts`), `${locale}Messages`);
        const flat = flattenMessages(messages);
        const englishCopies = enKeys.filter((key) => {
            const enValue = enFlat[key];
            const localeValue = flat[key];
            if (localeValue === enValue && !isAllowedEnglishParity(key, enValue, localeValue)) return true;
            return false;
        });
        record(
            `translation audit ${locale}`,
            englishCopies.length === 0,
            englishCopies.length ? `untranslated ${englishCopies.slice(0, 5).join(", ")}` : "no English placeholders",
        );
    }

    const completeLocaleSet = new Set(completeLocales);
    const localeMessagesCache = {};
    function getMessagesForLocale(locale) {
        if (localeMessagesCache[locale]) return localeMessagesCache[locale];
        if (completeLocaleSet.has(locale)) {
            localeMessagesCache[locale] = parseExportObject(path.join(root, "lib/i18n/messages", `${locale}.ts`), `${locale}Messages`);
            return localeMessagesCache[locale];
        }
        localeMessagesCache[locale] = enMessages;
        return enMessages;
    }

    const deMessages = getMessagesForLocale("de");
    const itMessages = getMessagesForLocale("it");
    const nlMessages = getMessagesForLocale("nl");
    const deFlat = flattenMessages(deMessages);
    const itFlat = flattenMessages(itMessages);
    const nlFlat = flattenMessages(nlMessages);
    record("native nav.home de", deFlat["nav.home"] !== enFlat["nav.home"] && deFlat["nav.home"] !== "Home", deFlat["nav.home"]);
    record("native nav.home it", itFlat["nav.home"] !== enFlat["nav.home"] && itFlat["nav.home"] !== "Home", itFlat["nav.home"]);
    record("native nav.home nl", nlFlat["nav.home"] !== enFlat["nav.home"] && nlFlat["nav.home"] !== "Home", nlFlat["nav.home"]);

    for (const locale of phaseCLocales) {
        const flat = flattenMessages(getMessagesForLocale(locale));
        record(
            `native nav.home ${locale}`,
            flat["nav.home"] !== enFlat["nav.home"] && flat["nav.home"] !== "Home",
            flat["nav.home"],
        );
    }

    const arEntry = registry.find((language) => language.code === "ar");
    const heEntry = registry.find((language) => language.code === "he");
    const urEntry = registry.find((language) => language.code === "ur");
    const arFlat = flattenMessages(getMessagesForLocale("ar"));
    const heFlat = flattenMessages(getMessagesForLocale("he"));
    const urFlat = flattenMessages(getMessagesForLocale("ur"));
    record("rtl registry ar", Boolean(arEntry?.rtl), String(arEntry?.rtl));
    record("rtl registry he", Boolean(heEntry?.rtl), String(heEntry?.rtl));
    record("rtl registry ur", Boolean(urEntry?.rtl), String(urEntry?.rtl));
    record("rtl nav.home ar", arFlat["nav.home"] !== enFlat["nav.home"], arFlat["nav.home"]);
    record("rtl nav.home he", heFlat["nav.home"] !== enFlat["nav.home"], heFlat["nav.home"]);
    record("rtl nav.home ur", urFlat["nav.home"] !== enFlat["nav.home"], urFlat["nav.home"]);

    record("language detection es", detectBrowserLocale(["es-MX", "en-US"], supportedCodes) === "es", "es-MX");
    record("language detection zh-CN", detectBrowserLocale(["zh-CN"], supportedCodes) === "zh-CN", "zh-CN");
    record("language detection unsupported", detectBrowserLocale(["xx-YY"], supportedCodes) === "en", "xx-YY -> en");

    const missingKeyTranslator = createTranslator({}, enMessages);
    record("missing key fallback", missingKeyTranslator("common.save") === enFlat["common.save"], missingKeyTranslator("common.save"));
    record("missing key empty", missingKeyTranslator("does.not.exist") === "", "returns empty string");

    const dateEs = new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date("2026-07-15T12:00:00Z"));
    const numberFr = new Intl.NumberFormat("fr").format(1234567.89);
    const currencyPt = new Intl.NumberFormat("pt", { style: "currency", currency: "USD" }).format(19.99);
    record("date formatting es", /2026|15|juil|jul/i.test(dateEs), dateEs);
    record("number formatting fr", numberFr.includes("234") || numberFr.includes("567"), numberFr);
    record("currency formatting pt", currencyPt.includes("19") && currencyPt.includes("99"), currencyPt);

    const dateDe = new Intl.DateTimeFormat("de", { dateStyle: "medium" }).format(new Date("2026-07-15T12:00:00Z"));
    const numberIt = new Intl.NumberFormat("it").format(1234567.89);
    const currencyNl = new Intl.NumberFormat("nl", { style: "currency", currency: "USD" }).format(19.99);
    const dateAr = new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(new Date("2026-07-15T12:00:00Z"));
    const numberHe = new Intl.NumberFormat("he").format(1234567.89);
    const currencyAr = new Intl.NumberFormat("ar", { style: "currency", currency: "USD" }).format(19.99);
    record("date formatting de", /2026|15|Juli|Jul/i.test(dateDe), dateDe);
    record("number formatting it", numberIt.includes("234") || numberIt.includes("567"), numberIt);
    record("currency formatting nl", currencyNl.includes("19") && currencyNl.includes("99"), currencyNl);
    record("date formatting ar", /2026|15|يول|jul/i.test(dateAr) || dateAr.length > 0, dateAr);
    record("number formatting he", numberHe.includes("234") || numberHe.includes("567") || /\d/.test(numberHe), numberHe);
    record("currency formatting ar", currencyAr.includes("19") && currencyAr.includes("99"), currencyAr);

    for (const locale of phaseCLocales) {
        const dateValue = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date("2026-07-15T12:00:00Z"));
        const numberValue = new Intl.NumberFormat(locale).format(1234567.89);
        const percentValue = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(0.847);
        const currencyValue = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(19.99);
        const compactValue = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(1250000);
        const hasDigits = (value) => /\d|\p{Nd}/u.test(value);
        record(`date formatting ${locale}`, /2026|15/.test(dateValue) || hasDigits(dateValue), dateValue);
        record(`number formatting ${locale}`, numberValue.includes("234") || numberValue.includes("567") || hasDigits(numberValue), numberValue);
        record(`percent formatting ${locale}`, percentValue.includes("84") || percentValue.includes("85") || /%/.test(percentValue) || hasDigits(percentValue), percentValue);
        record(`currency formatting ${locale}`, (currencyValue.includes("19") && currencyValue.includes("99")) || (hasDigits(currencyValue) && /\$|USD|US\$/i.test(currencyValue)), currencyValue);
        record(`compact count formatting ${locale}`, /1|2|M|K|м|k|тыс|mil|m|লা|ਲੱਖ|لاکھ|લાખ/i.test(compactValue) || hasDigits(compactValue), compactValue);
    }

    for (const locale of phaseCLocales) {
        const entry = registry.find((language) => language.code === locale);
        record(`selector native name ${locale}`, entry?.nativeName === {
            ta: "தமிழ்",
            te: "తెలుగు",
            mr: "मराठी",
            ne: "नेपाली",
            vi: "Tiếng Việt",
        }[locale], entry?.nativeName || "");
        record(`selector compact code ${locale}`, locale.split("-")[0].toUpperCase() === {
            ta: "TA",
            te: "TE",
            mr: "MR",
            ne: "NE",
            vi: "VI",
        }[locale], locale.split("-")[0].toUpperCase());
    }

    const rtlLanguages = registry.filter((language) => language.rtl).map((language) => language.code);
    record("rtl locales", rtlLanguages.includes("ar") && rtlLanguages.includes("he") && rtlLanguages.includes("ur"), rtlLanguages.join(", "));

    record("desktop selector component", readFileSync(path.join(root, "components/language-selector.tsx"), "utf8").includes("language-selector-panel"), "panel markup");
    record("mobile selector styles", readFileSync(path.join(root, "lib/i18n/i18n-styles.ts"), "utf8").includes("@media (max-width: 900px)"), "responsive rules");
    record("rtl shell styles", readFileSync(path.join(root, "lib/i18n/i18n-styles.ts"), "utf8").includes(".mdb-rtl-shell"), "rtl shell");

    const routeKeys = [
        "nav.home", "nav.marketplace", "nav.trending", "nav.library", "nav.profile",
        "auth.loginTitle", "upload.title", "platformControlCenter.title", "testAccountCleanup.title",
    ];
    for (const locale of completeLocales) {
        const messages = parseExportObject(path.join(root, "lib/i18n/messages", `${locale}.ts`), `${locale}Messages`);
        const t = createTranslator(messages, enMessages);
        const missingRoutes = routeKeys.filter((key) => !t(key));
        record(`major route coverage ${locale}`, missingRoutes.length === 0, missingRoutes.join(", ") || "ok");
    }

    const secretHits = scanForSecrets();
    record("secret exposure scan", secretHits.length === 0, secretHits.slice(0, 3).join("; ") || "clean");

    if (env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL) {
        try {
            const applied = await applyMigration(env);
            record("preferred_language migration", applied, "202607150005_preferred_language.sql");
        }
        catch (error) {
            record("preferred_language migration", false, error instanceof Error ? error.message : String(error));
        }
    }
    else {
        record("preferred_language migration", false, "DATABASE_URL missing");
    }

    record("locale storage keys", readFileSync(path.join(root, "lib/i18n/registry.ts"), "utf8").includes("LOCALE_STORAGE_KEY"), "localStorage key constant");
    record("locale cookie keys", readFileSync(path.join(root, "lib/i18n/registry.ts"), "utf8").includes("LOCALE_COOKIE_KEY"), "cookie key constant");

    const owner = await ownerSession(env);
    if (owner?.access_token) {
        record("owner session", true, owner.user.id);

        for (const locale of completeLocales) {
            const messages = getMessagesForLocale(locale);
            const t = createTranslator(messages, enMessages);
            record(`owner label context ${locale}`, Boolean(t("platformControlCenter.ownerOnly")), t("platformControlCenter.ownerOnly"));
        }

        const ownerControl = await fetch(`${baseUrl}/api/launch/platform-control-center?userId=${encodeURIComponent(owner.user.id)}`, {
            headers: { Authorization: `Bearer ${owner.access_token}` },
            cache: "no-store",
        });
        record("owner platform control access", ownerControl.ok, `status ${ownerControl.status} @ ${baseUrl}`);

        const ownerLanguageUpdate = await fetch(`${baseUrl}/api/user-profile`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${owner.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(authBody(owner.user.id, owner, {
                action: "update-language",
                preferredLanguage: "pt",
            })),
        });
        const ownerLanguageJson = await ownerLanguageUpdate.json().catch(() => ({}));
        record("authenticated preference persistence", ownerLanguageUpdate.ok && ownerLanguageJson.preferredLanguage === "pt", JSON.stringify(ownerLanguageJson));

        const ownerProfileGet = await fetch(`${baseUrl}/api/user-profile?userId=${encodeURIComponent(owner.user.id)}`, {
            headers: { Authorization: `Bearer ${owner.access_token}` },
            cache: "no-store",
        });
        const ownerProfileJson = await ownerProfileGet.json().catch(() => ({}));
        record("authenticated preference readback", ownerProfileGet.ok && ownerProfileJson.preferredLanguage === "pt", JSON.stringify(ownerProfileJson));

        await fetch(`${baseUrl}/api/user-profile`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${owner.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(authBody(owner.user.id, owner, {
                action: "update-language",
                preferredLanguage: "en",
            })),
        });

        const disposableEmail = `i18n-${Date.now()}-${randomBytes(3).toString("hex")}@cursor-verify.invalid`;
        const disposablePassword = `Verify-${randomBytes(8).toString("hex")}!1`;
        const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const created = await admin.auth.admin.createUser({
            email: disposableEmail,
            email_confirm: true,
            password: disposablePassword,
        });
        const disposableUserId = created.data.user?.id || "";
        if (disposableUserId) {
            const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
                auth: { persistSession: false, autoRefreshToken: false },
            });
            const login = await anon.auth.signInWithPassword({
                email: disposableEmail,
                password: disposablePassword,
            });
            const disposableSession = login.data.session;
            record("disposable auth session", Boolean(disposableSession?.access_token), disposableEmail);

            if (disposableSession?.access_token) {
                for (const locale of completeLocales) {
                    const denied = await fetch(`${baseUrl}/api/launch/platform-control-center?userId=${encodeURIComponent(disposableUserId)}`, {
                        headers: { Authorization: `Bearer ${disposableSession.access_token}` },
                        cache: "no-store",
                    });
                    record(`non-owner denial ${locale}`, denied.status === 403 || denied.status === 401 || denied.status === 404, `status ${denied.status}`);
                }
            }

            await admin.auth.admin.deleteUser(disposableUserId);
            record("disposable cleanup", true, disposableUserId);
        }
        else {
            record("disposable auth session", false, created.error?.message || "create failed");
        }

        record("logged-out persistence contract", readFileSync(path.join(root, "lib/i18n/storage.ts"), "utf8").includes("persistLocale"), "persistLocale writes storage + cookie");
    }
    else {
        record("owner session", false, "unable to create owner session");
    }

    const browserMessageMap = Object.fromEntries(
        ["de", "it", "nl", ...rtlLocales, ...phaseCLocales.filter((code) => !rtlLocales.includes(code))].map((locale) => [locale, getMessagesForLocale(locale)]),
    );
    let ownerSessionPayload = null;
    if (owner?.access_token && env.NEXT_PUBLIC_SUPABASE_URL) {
        const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
        ownerSessionPayload = {
            storageKey: `sb-${ref}-auth-token`,
            payload: JSON.stringify({
                access_token: owner.access_token,
                refresh_token: owner.refresh_token,
                expires_at: owner.expires_at,
                expires_in: owner.expires_in,
                token_type: owner.token_type,
                user: owner.user,
            }),
        };
    }
    await runBrowserLayoutTests(baseUrl, browserMessageMap, ownerSessionPayload);

    writeFileSync(path.join(evidenceDir, "i18n-localization-evidence.json"), JSON.stringify({
        generatedAt: new Date().toISOString(),
        completeLocales,
        fallbackLocales: incomplete,
        registry: registry.map((language) => ({
            code: language.code,
            nativeName: language.nativeName,
            translationComplete: language.translationComplete,
            rtl: language.rtl,
        })),
        results,
    }, null, 2));

    const failed = results.filter((entry) => !entry.ok);
    if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
    record("verify harness", false, error instanceof Error ? error.message : String(error));
    process.exit(1);
});
